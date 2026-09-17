import { vi } from "vitest";
vi.mock("@/lib/sesion", async () => {
  const { sesionFalsa } = await import("./ayuda-sesion");
  return {
    COOKIE_SESION: "pr_sesion", DIAS_SESION: 30,
    sesionActual: async () => sesionFalsa.actual,
    exigirSesion: async () => { if (!sesionFalsa.actual) throw new Error("REDIRECT:/entrar"); return sesionFalsa.actual; },
    exigirRol: async (rol: string) => { if (sesionFalsa.actual?.rol !== rol) throw new Error("REDIRECT:/hoy"); return sesionFalsa.actual; },
  };
});
vi.mock("@/lib/sesion-cliente", async () => {
  const { sesionClienteFalsa } = await import("./ayuda-sesion");
  return { COOKIE_CLIENTE: "sesion_cliente", sesionCliente: async () => sesionClienteFalsa.actual };
});
vi.mock("@/lib/ip", () => ({ ipCliente: async () => "10.9.8.7" }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const guardarRoto = vi.hoisted(() => ({ fallar: false }));
vi.mock("@/lib/documentos", async (original) => {
  const real = await original<typeof import("@/lib/documentos")>();
  return { ...real, guardarDocumento: async (...args: Parameters<typeof real.guardarDocumento>) => { if (guardarRoto.fallar) throw new Error("constructor"); return real.guardarDocumento(...args); } };
});

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { rmSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, sembrarCliente, sembrarProyecto } from "./ayuda-db";
import { sesionFalsa, sesionClienteFalsa } from "./ayuda-sesion";
import { dirArchivos } from "@/lib/archivos";
import { TAMANO_MAXIMO } from "@/lib/documentos-contrato";
import { _reiniciarIntentos } from "@/lib/rate-limit";
import { POST } from "@/app/(panel)/proyectos/[id]/documentos/route";
import { GET } from "@/app/c/documentos/[id]/route";
import { quitarDocumentoDeProyecto } from "@/acciones/documentos";

const PDF = "%PDF-1.7 contenido de prueba";
const ORIGEN = { origin: "http://prueba.test", host: "prueba.test" };
function subir(proyectoId: number | string, archivo: File | null, extra: { nombre?: string; headers?: Record<string, string> } = {}) {
  const fd = new FormData();
  if (archivo) fd.set("archivo", archivo);
  if (extra.nombre !== undefined) fd.set("nombre", extra.nombre);
  return POST(new Request(`http://prueba.test/proyectos/${proyectoId}/documentos`, { method: "POST", body: fd, headers: extra.headers ?? ORIGEN }), { params: Promise.resolve({ id: String(proyectoId) }) });
}
const pedir = (id: number | string, consulta = "") => GET(new Request(`http://prueba.test/c/documentos/${id}${consulta}`), { params: Promise.resolve({ id: String(id) }) });

describe.runIf(DB_HABILITADA)("documentos: subir, quitar y servir", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  let a: Awaited<ReturnType<typeof sembrarCliente>>;
  let b: Awaited<ReturnType<typeof sembrarCliente>>;
  let proyectoId = 0;
  let docId = 0;
  const comoDueno = () => { sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" }; sesionClienteFalsa.actual = null; };
  const comoCliente = (c: { id: number; codigo: string }) => { sesionFalsa.actual = null; sesionClienteFalsa.actual = { usuarioId: 1, clienteId: c.id, codigo: c.codigo, nombre: "Cliente" }; };

  beforeAll(async () => {
    await limpiarBase();
    rmSync(path.join(dirArchivos(), "documentos"), { recursive: true, force: true });
    ids = await sembrarBasico();
    a = await sembrarCliente({ nombre: "Hotel A" });
    b = await sembrarCliente({ nombre: "Farmacia B" });
    proyectoId = (await sembrarProyecto(a.id, ids.nichoId)).id;
  });
  beforeEach(() => { comoDueno(); _reiniciarIntentos(); });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("subir: solo el dueno, solo desde el mismo origen", async () => {
    const archivo = new File([PDF], "manual.pdf", { type: "application/pdf" });
    sesionFalsa.actual = null;
    expect((await subir(proyectoId, archivo)).status).toBe(401);
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
    expect((await subir(proyectoId, archivo)).status).toBe(403);
    comoCliente(a);
    expect((await subir(proyectoId, archivo)).status).toBe(401); // la sesion del portal no es sesion del panel
    comoDueno();
    expect((await subir(proyectoId, archivo, { headers: { origin: "https://malo.test", host: "prueba.test" } })).status).toBe(403);
    expect((await subir(proyectoId, archivo, { headers: { host: "prueba.test" } })).status).toBe(403);
    expect(await prisma.documento.count()).toBe(0);
  });

  it("subir: guarda, responde el id y usa el nombre que escribio Neri", async () => {
    const r = await subir(proyectoId, new File([PDF], "manual-v3-final.pdf", { type: "application/pdf" }), { nombre: "Manual de recepción" });
    expect(r.status).toBe(200);
    const cuerpo = await r.json();
    expect(cuerpo.ok).toBe(true);
    docId = cuerpo.datos.id;
    expect(await prisma.documento.findUniqueOrThrow({ where: { id: docId } })).toMatchObject({ proyectoId, nombre: "Manual de recepción", tipoMime: "application/pdf" });
  });

  it("subir: lo que no entra dice por que, en espanol, y no deja nada", async () => {
    const antes = await prisma.documento.count();
    const casos: [Response, number, RegExp][] = [
      [await subir(proyectoId, null), 400, /Elige un archivo/],
      [await subir(proyectoId, new File([], "vacio.pdf")), 400, /vacío/],
      [await subir(proyectoId, new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00])], "factura.pdf", { type: "application/pdf" })), 415, /PDF, JPG, PNG o ZIP/],
      [await subir(proyectoId, new File([new Uint8Array(TAMANO_MAXIMO + 1)], "grande.pdf")), 413, /10 MB/],
      [await subir(999_999, new File([PDF], "x.pdf")), 404, /proyecto no existe/],
      [await subir("abc", new File([PDF], "x.pdf")), 404, /proyecto no existe/],
      [await subir(proyectoId, new File([PDF], "x.pdf"), { headers: { ...ORIGEN, "content-length": String(50 * 1024 * 1024) } }), 413, /10 MB/],
    ];
    for (const [r, estado, texto] of casos) {
      expect(r.status).toBe(estado);
      const cuerpo = await r.json();
      expect(cuerpo.ok).toBe(false);
      expect(cuerpo.mensaje).toMatch(texto);
    }
    expect(await prisma.documento.count()).toBe(antes);
  });

  it("subir: un error con nombre heredado del prototipo (constructor) no se confunde con un mensaje conocido", async () => {
    const antes = await prisma.documento.count();
    guardarRoto.fallar = true;
    try {
      const r = await subir(proyectoId, new File([PDF], "x.pdf"));
      expect(r.status).toBe(500);
      const cuerpo = await r.json();
      expect(cuerpo).toEqual({ ok: false, mensaje: "No se pudo guardar el documento. Intenta de nuevo." });
    } finally { guardarRoto.fallar = false; }
    expect(await prisma.documento.count()).toBe(antes);
  });

  it("servir: el dueno y el cliente dueno del proyecto lo bajan, sin cache y con el nombre que ve el cliente", async () => {
    const r = await pedir(docId);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("content-disposition")).toBe(`inline; filename="Manual de recepcion.pdf"; filename*=UTF-8''Manual%20de%20recepci%C3%B3n.pdf`);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("x-robots-tag")).toBe("noindex");
    expect(await r.text()).toBe(PDF);
    comoCliente(a);
    const mio = await pedir(docId);
    expect(mio.status).toBe(200);
    expect(await mio.text()).toBe(PDF);
  });

  it("servir: lo ajeno, lo que no existe y un id raro le responden al cliente el MISMO 404; el prospectador, 403", async () => {
    comoCliente(b);
    const ajeno = await pedir(docId);
    const inexistente = await pedir(999_999);
    expect(ajeno.status).toBe(404);
    expect(inexistente.status).toBe(404);
    expect(await ajeno.text()).toBe(await inexistente.text());
    expect((await pedir("abc")).status).toBe(404);
    expect((await pedir("1.5")).status).toBe(404);
    sesionClienteFalsa.actual = null;
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
    expect((await pedir(docId)).status).toBe(403);
  });

  it("servir sin ninguna sesion: con ?c= bien formado vuelve al PIN del portal; sin el, 404 (no se revela de quien es)", async () => {
    sesionFalsa.actual = null; sesionClienteFalsa.actual = null;
    const conCodigo = await pedir(docId, `?c=${b.codigo}`);
    expect(conCodigo.status).toBe(307);
    expect(conCodigo.headers.get("location")).toBe(`/c/${b.codigo}`);
    expect((await pedir(docId)).status).toBe(404);
    expect((await pedir(docId, "?c=../../entrar")).status).toBe(404);
    expect((await pedir(docId, "?c=https://malo.test")).status).toBe(404);
  });

  it("servir: pasado el limite de 120 por minuto por IP, el cliente recibe 404; al dueno no se le cuenta", async () => {
    comoCliente(a);
    for (let i = 0; i < 120; i++) await pedir(999_999);
    expect((await pedir(docId)).status).toBe(404);
    comoDueno();
    expect((await pedir(docId)).status).toBe(200);
  });

  it("quitar: solo el dueno; despues el cliente recibe 404 y el dueno lo sigue viendo", async () => {
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
    await expect(quitarDocumentoDeProyecto(docId)).rejects.toThrow("REDIRECT:/hoy");
    comoDueno();
    expect(await quitarDocumentoDeProyecto(docId)).toEqual({ ok: true, datos: undefined });
    expect((await quitarDocumentoDeProyecto(999_999)).ok).toBe(false);
    expect((await pedir(docId)).status).toBe(200);
    comoCliente(a);
    expect((await pedir(docId)).status).toBe(404);
  });

  it("servir: si el archivo no esta en disco, 404 con una salida para el cliente y el error en el log", async () => {
    comoDueno();
    const r = await subir(proyectoId, new File([PDF], "se-pierde.pdf"));
    const { datos } = await r.json();
    rmSync(path.join(dirArchivos(), "documentos"), { recursive: true, force: true });
    comoCliente(a);
    const perdido = await pedir(datos.id);
    expect(perdido.status).toBe(404);
    expect(await perdido.text()).toContain("Escríbenos");
  });
});
