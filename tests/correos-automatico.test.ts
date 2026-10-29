import { vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
vi.mock("@/lib/propuesta", async (orig) => {
  const real = await orig<typeof import("@/lib/propuesta")>();
  return { ...real, generarPdf: async (codigo: string) => { const r = path.join(mkdtempSync(path.join(tmpdir(), "pdf-")), `${codigo}.pdf`); writeFileSync(r, "%PDF-1.4 falso"); return r; } };
});

vi.mock("@/lib/correo-propuesta-contrato", async (orig) => {
  const real = await orig<typeof import("@/lib/correo-propuesta-contrato")>();
  return { ...real, ventanaDeEnvio: vi.fn(real.ventanaDeEnvio) };
});

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, crearProspectoDePrueba } from "./ayuda-db";
import { _transporteParaTests } from "@/lib/correo-envio";
import { enviarAutomatico } from "@/lib/correos";
import * as contrato from "@/lib/correo-propuesta-contrato";
import { tamanoLote } from "@/lib/correo-propuesta-contrato";
import { guardarConfig, CLAVES } from "@/lib/configuracion";
import { POST } from "@/app/api/correos/automatico/route";

// El reloj es el real (la base pone enviadoEn con su propio now); la ventana se simula con el mock.
const LUNES_MEDIODIA = new Date();

describe("ventana y lote (puros)", () => {
  it("ventanaDeEnvio: lunes 09:00 Caracas si, sabado no, lunes 17:00 no", async () => {
    const real = (await vi.importActual<typeof import("@/lib/correo-propuesta-contrato")>("@/lib/correo-propuesta-contrato")).ventanaDeEnvio;
    expect(real(new Date("2026-11-02T13:00:00Z"))).toBe(true);
    expect(real(new Date("2026-11-02T12:59:00Z"))).toBe(false);
    expect(real(new Date("2026-11-02T20:59:00Z"))).toBe(true);
    expect(real(new Date("2026-11-02T21:00:00Z"))).toBe(false);
    expect(real(new Date("2026-11-07T16:00:00Z"))).toBe(false);
    expect(tamanoLote(25)).toBe(4);
  });
});

describe.runIf(DB_HABILITADA)("enviarAutomatico y su ruta", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  const salidos: Record<string, unknown>[] = [];
  beforeAll(async () => { await limpiarBase(); ids = await sembrarBasico(); });
  beforeEach(async () => {
    await prisma.evento.deleteMany(); await prisma.envioCorreo.deleteMany(); await prisma.correoBloqueado.deleteMany(); await prisma.fichaNegocio.deleteMany();
    await prisma.prospecto.deleteMany(); await prisma.configuracion.deleteMany({ where: { clave: { in: [CLAVES.correosAutomatico, CLAVES.correosPorDia] } } });
    salidos.length = 0;
    _transporteParaTests({ sendMail: async (o) => { salidos.push(o); return { messageId: "m1" }; } });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.mocked(contrato.ventanaDeEnvio).mockReturnValue(true);
  });
  afterAll(async () => { _transporteParaTests(null); await limpiarBase(); await prisma.$disconnect(); });

  async function nuevo(ficha: { alAutomatico?: boolean; estado?: string; gancho?: string; hallazgos?: object } = {}, extra: Parameters<typeof crearProspectoDePrueba>[1] = {}) {
    const p = await crearProspectoDePrueba(ids.nichoId, { email: `n${Math.random().toString(36).slice(2, 8)}@ejemplo.test`, ...extra });
    await prisma.fichaNegocio.create({ data: { prospectoId: p.id, gancho: "Su web no tiene reservas", estado: "revisada", alAutomatico: true, ...ficha } as never });
    return p;
  }

  it("manda el lote (ceil(tope/8)) en orden de la cola y nunca pasa del tope aunque ya hubiera 24 de 25", async () => {
    const a = await nuevo(), b = await nuevo(), c = await nuevo(), d = await nuevo(), e = await nuevo();
    const r = await enviarAutomatico(LUNES_MEDIODIA);
    expect(r).toMatchObject({ enviados: 4, delDia: 4, tope: 25, motivo: "ok" });
    expect(salidos).toHaveLength(4);
    expect(await prisma.envioCorreo.count()).toBe(4);
    for (const q of [a, b, c, d]) expect(await prisma.envioCorreo.count({ where: { prospectoId: q.id } })).toBe(1);
    expect(await prisma.envioCorreo.count({ where: { prospectoId: e.id } })).toBe(0);
    // 24 de 25 ya salidos hoy: solo cabe uno mas
    await prisma.envioCorreo.createMany({ data: Array.from({ length: 20 }, (_, i) => ({ prospectoId: a.id, tipo: "seguimiento", asunto: "x", para: `x${i}@e.test`, token: `t${String(i).padStart(21, "0")}`, fallo: "", enviadoEn: new Date() })) });
    expect(await prisma.envioCorreo.count()).toBe(24);
    const f1 = await nuevo(), f2 = await nuevo();
    const r2 = await enviarAutomatico(LUNES_MEDIODIA);
    expect(r2).toMatchObject({ enviados: 1, delDia: 25, tope: 25 });
    const r3 = await enviarAutomatico(LUNES_MEDIODIA);
    expect(r3).toMatchObject({ enviados: 0, motivo: "tope" });
    expect(await prisma.envioCorreo.count()).toBe(25);
    void f1; void f2;
  });

  it("con el transporte caido la pasada hace como mucho 2 intentos y devuelve fallos", async () => {
    for (let i = 0; i < 10; i++) await nuevo();
    _transporteParaTests({ sendMail: async () => { throw new Error("smtp caido"); } });
    const r = await enviarAutomatico(LUNES_MEDIODIA);
    expect(r).toMatchObject({ enviados: 0, motivo: "fallos" });
    expect(await prisma.envioCorreo.count()).toBeLessThanOrEqual(2);
  });

  it("apagado o fuera de horario: 0 enviados con su motivo", async () => {
    await nuevo();
    await guardarConfig(CLAVES.correosAutomatico, "off");
    expect(await enviarAutomatico(LUNES_MEDIODIA)).toMatchObject({ enviados: 0, motivo: "apagado" });
    await guardarConfig(CLAVES.correosAutomatico, "on");
    vi.mocked(contrato.ventanaDeEnvio).mockReturnValue(false);
    expect(await enviarAutomatico(LUNES_MEDIODIA)).toMatchObject({ enviados: 0, motivo: "fuera_de_horario" });
    expect(salidos).toHaveLength(0);
  });

  it("salta los no coincidentes, los bloqueados y los que no estan al automatico", async () => {
    await nuevo({ hallazgos: { web: { nombreCoincide: false } } });
    await nuevo({ alAutomatico: false });
    await nuevo({ estado: "borrador" });
    const bl = await nuevo();
    await prisma.correoBloqueado.create({ data: { email: bl.email, motivo: "pidio no" } });
    const ok = await nuevo();
    const r = await enviarAutomatico(LUNES_MEDIODIA);
    expect(r.enviados).toBe(1);
    expect(await prisma.envioCorreo.count({ where: { prospectoId: ok.id } })).toBe(1);
  });

  it("el rechazo «ya recibio una propuesta de otro negocio» no cuenta como fallo seguido", async () => {
    const [a, b, c, d] = [await nuevo(), await nuevo(), await nuevo(), await nuevo()];
    const otro = await crearProspectoDePrueba(ids.nichoId, { email: "otro@ejemplo.test" });
    let primero = true;
    // Al mandar el primero, otro negocio «recibe» las direcciones de b y c: la cola ya estaba armada.
    _transporteParaTests({ sendMail: async (o) => {
      if (primero) {
        primero = false;
        await prisma.envioCorreo.createMany({ data: [b, c].map((q, i) => ({ prospectoId: otro.id, tipo: "inicial", asunto: "x", para: q.email, token: `o${i}`.padEnd(22, "x"), fallo: "" })) });
      }
      salidos.push(o); return { messageId: "m1" };
    } });
    const r = await enviarAutomatico(LUNES_MEDIODIA);
    expect(r.motivo).not.toBe("fallos");
    expect(await prisma.envioCorreo.count({ where: { prospectoId: a.id, fallo: "" } })).toBe(1);
    expect(await prisma.envioCorreo.count({ where: { prospectoId: d.id, fallo: "" } })).toBe(1);
    expect(r.enviados).toBe(2);
  });

  it("la ruta sin secreto responde 404 y no manda", async () => {
    process.env.PROSPECTOS_CRON_SECRET = "secreto-de-prueba";
    await nuevo();
    const mk = (h: Record<string, string>) => new Request("http://x/api/correos/automatico", { method: "POST", headers: h });
    for (const h of [{} as Record<string, string>, { "x-cron-secret": "otro" }, { "x-cron-secret": "secreto-de-prueba-largo" }]) {
      const r = await POST(mk(h));
      expect(r.status).toBe(404);
      expect(await r.text()).toBe("");
    }
    expect(salidos).toHaveLength(0);
    delete process.env.PROSPECTOS_CRON_SECRET;
    expect((await POST(mk({ "x-cron-secret": "" }))).status).toBe(404);
    process.env.PROSPECTOS_CRON_SECRET = "secreto-de-prueba";
    const ok = await POST(mk({ "x-cron-secret": "secreto-de-prueba" }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toHaveProperty("motivo");
  });
});
