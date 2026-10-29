import { vi } from "vitest";
vi.mock("@/lib/sesion-ligera", () => ({ tieneSesion: async () => false }));

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, crearProspectoDePrueba } from "./ayuda-db";
import { crearEnvio, registrarApertura, registrarClic, registrarPdf } from "@/lib/correos";
import { GET as pixel } from "@/app/api/correo/a/[token]/route";
import { GET as redirigir } from "@/app/r/[token]/route";

const ctx = (token: string) => ({ params: Promise.resolve({ token }) });
const BASURA = "x".repeat(22) + "!";

describe.runIf(DB_HABILITADA)("rastreo de correos", () => {
  let prospectoId = 0, codigo = "", otroCodigo = "";
  beforeAll(async () => {
    await limpiarBase();
    const ids = await sembrarBasico();
    const p = await crearProspectoDePrueba(ids.nichoId);
    prospectoId = p.id; codigo = p.codigo;
    otroCodigo = (await crearProspectoDePrueba(ids.nichoId)).codigo;
  });
  beforeEach(async () => { await prisma.evento.deleteMany(); await prisma.envioCorreo.deleteMany(); vi.restoreAllMocks(); });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  const nuevo = () => crearEnvio({ prospectoId, tipo: "inicial", asunto: "Hola", para: "a@b.test" });
  const eventos = (tipo: string) => prisma.evento.count({ where: { prospectoId, tipo } });

  it("crearEnvio devuelve un token de 22 y lo guarda", async () => {
    const { id, token } = await nuevo();
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect((await prisma.envioCorreo.findUniqueOrThrow({ where: { id } })).token).toBe(token);
  });

  it("apertura: primera vez evento y abiertoEn; segunda solo suma", async () => {
    const { token } = await nuevo();
    await registrarApertura(token);
    await registrarApertura(token);
    const e = await prisma.envioCorreo.findUniqueOrThrow({ where: { token } });
    expect(e.aperturas).toBe(2);
    expect(e.abiertoEn).not.toBeNull();
    expect(await eventos("correo_abierto")).toBe(1);
  });

  it("con sesion no cuenta nada", async () => {
    const { token } = await nuevo();
    await registrarApertura(token, { conSesion: true });
    expect((await prisma.envioCorreo.findUniqueOrThrow({ where: { token } })).aperturas).toBe(0);
    expect(await eventos("correo_abierto")).toBe(0);
  });

  it("clic devuelve el codigo y deja correo_clic una vez; token invalido devuelve null sin consultar", async () => {
    const { token } = await nuevo();
    expect(await registrarClic(token)).toBe(codigo);
    expect(await registrarClic(token)).toBe(codigo);
    const e = await prisma.envioCorreo.findUniqueOrThrow({ where: { token } });
    expect(e.clics).toBe(2);
    expect(await eventos("correo_clic")).toBe(1);
    const espia = vi.spyOn(prisma.envioCorreo, "findUnique");
    expect(await registrarClic(BASURA)).toBeNull();
    expect(espia).not.toHaveBeenCalled();
  });

  it("clic con sesion devuelve el codigo pero no cuenta", async () => {
    const { token } = await nuevo();
    expect(await registrarClic(token, { conSesion: true })).toBe(codigo);
    expect((await prisma.envioCorreo.findUniqueOrThrow({ where: { token } })).clics).toBe(0);
  });

  it("pdf cuenta solo si el token es del mismo prospecto", async () => {
    const { token } = await nuevo();
    await registrarPdf(token, otroCodigo);
    expect((await prisma.envioCorreo.findUniqueOrThrow({ where: { token } })).pdfs).toBe(0);
    await registrarPdf(token, codigo);
    await registrarPdf(token, codigo);
    expect((await prisma.envioCorreo.findUniqueOrThrow({ where: { token } })).pdfs).toBe(2);
    expect(await eventos("pdf_descargado")).toBe(1);
    const espia = vi.spyOn(prisma.envioCorreo, "findUnique");
    await registrarPdf(BASURA, codigo);
    expect(espia).not.toHaveBeenCalled();
  });

  it("la ruta del pixel responde png 1x1 con token basura y no escribe nada", async () => {
    const r = await pixel(new Request("http://x/api/correo/a/" + BASURA), ctx(BASURA));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    expect(r.headers.get("cache-control")).toBe("no-store");
    const b = Buffer.from(await r.arrayBuffer());
    expect(b.subarray(1, 4).toString()).toBe("PNG");
    expect(b.readUInt32BE(16)).toBe(1);
    expect(b.readUInt32BE(20)).toBe(1);
    expect(await prisma.evento.count()).toBe(0);
    // alfa 0: IHDR dice RGBA 8 bits (tipo 6) y el pixel descomprimido es filtro 0 + 0,0,0,0
    expect(b[24]).toBe(8); expect(b[25]).toBe(6);
    const idat = b.indexOf("IDAT");
    const len = b.readUInt32BE(idat - 4);
    const crudo = (await import("node:zlib")).inflateSync(b.subarray(idat + 4, idat + 4 + len));
    expect([...crudo]).toEqual([0, 0, 0, 0, 0]);
  });

  it("tres aperturas simultaneas dejan un solo evento y aperturas = 3", async () => {
    const { token } = await nuevo();
    await Promise.all([registrarApertura(token), registrarApertura(token), registrarApertura(token)]);
    expect(await eventos("correo_abierto")).toBe(1);
    expect((await prisma.envioCorreo.findUniqueOrThrow({ where: { token } })).aperturas).toBe(3);
  });

  it("la ruta del pixel cuenta con token valido", async () => {
    const { token } = await nuevo();
    const r = await pixel(new Request("http://x/"), ctx(token));
    expect(r.status).toBe(200);
    expect((await prisma.envioCorreo.findUniqueOrThrow({ where: { token } })).aperturas).toBe(1);
  });

  it("/r/<token> redirige 302 a la propuesta con ?e= o da 404", async () => {
    const { token } = await nuevo();
    const r = await redirigir(new Request("http://x/r/" + token), ctx(token));
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toContain(`/p/${codigo}?e=${token}`);
    const malo = await redirigir(new Request("http://x/r/" + BASURA), ctx(BASURA));
    expect(malo.status).toBe(404);
    const noExiste = "A".repeat(22);
    expect((await redirigir(new Request("http://x/"), ctx(noExiste))).status).toBe(404);
  });
});
