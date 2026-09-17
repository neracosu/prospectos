import { vi } from "vitest";
const pdfFalso = vi.hoisted(() => ({ fallarProxima: false }));
vi.mock("@/lib/pdf", async (original) => {
  const real = await original<typeof import("@/lib/pdf")>();
  return {
    ...real,
    conTurnoGlobal: <T,>(tarea: () => Promise<T>) => tarea(),
    imprimirPdf: async () => { if (pdfFalso.fallarProxima) { pdfFalso.fallarProxima = false; throw new Error("CHROMIUM_ROTO"); } return Buffer.from("%PDF-1.4 falso"); },
  };
});
vi.mock("@/lib/sesion", async () => {
  const { sesionFalsa } = await import("./ayuda-sesion");
  return {
    COOKIE_SESION: "pr_sesion", DIAS_SESION: 30,
    sesionActual: async () => sesionFalsa.actual,
    exigirSesion: async () => { if (!sesionFalsa.actual) throw new Error("REDIRECT:/entrar"); return sesionFalsa.actual; },
    exigirRol: async (rol: string) => { if (sesionFalsa.actual?.rol !== rol) throw new Error("REDIRECT:/hoy"); return sesionFalsa.actual; },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, sembrarCliente, sembrarProyecto } from "./ayuda-db";
import { sesionFalsa } from "./ayuda-sesion";
import { guardarConfig, CLAVES } from "@/lib/configuracion";
import { rutaDocumento } from "@/lib/recibos";
import { generarReciboDeCobro, avisarRecibo, generarNotaDeAnulacion } from "@/acciones/recibos";
import { anularCobro } from "@/acciones/cobros";

const EMISOR = JSON.stringify({ nombre: "Neri Colón", rif: "V-12345678-9", whatsapp: "584121234567", email: "neri@ejemplo.test" });

describe.runIf(DB_HABILITADA)("acciones de recibos", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  let proyectoId: number;
  const cobroPagado = (detalle: string, pid = proyectoId) => prisma.cobro.create({ data: { proyectoId: pid, concepto: "extra", detalle, monto: "350.00", vence: "2026-09-01", pagadoEn: new Date("2026-09-16T16:00:00Z"), canal: "zelle", referencia: "Z-1" } });

  beforeAll(async () => {
    await limpiarBase();
    rmSync(path.join(process.env.PROSPECTOS_DIR_ARCHIVOS!, "recibos"), { recursive: true, force: true });
    ids = await sembrarBasico();
    const c = await sembrarCliente({ nombre: "Hotel Acciones", whatsapp: "584129999999" });
    proyectoId = (await sembrarProyecto(c.id, ids.nichoId, { estado: "activo", nombre: "PMS" })).id;
  });
  beforeEach(() => { sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" }; });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("el prospectador no toca recibos", async () => {
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
    await expect(generarReciboDeCobro(1)).rejects.toThrow("REDIRECT:/hoy");
    await expect(avisarRecibo(1)).rejects.toThrow("REDIRECT:/hoy");
    await expect(generarNotaDeAnulacion(1)).rejects.toThrow("REDIRECT:/hoy");
  });

  it("sin datos del emisor manda a Ajustes", async () => {
    const c = await cobroPagado("Sin emisor");
    expect(await generarReciboDeCobro(c.id)).toEqual({ ok: false, mensaje: expect.stringContaining("Ajustes") });
    await guardarConfig(CLAVES.emisor, EMISOR);
  });

  it("genera, y cada fallo tiene su mensaje", async () => {
    const pendiente = await prisma.cobro.create({ data: { proyectoId, concepto: "extra", detalle: "Pendiente", monto: "10.00", vence: "2026-12-01" } });
    expect(await generarReciboDeCobro(pendiente.id)).toEqual({ ok: false, mensaje: expect.stringContaining("pagado") });
    expect(await generarReciboDeCobro(999_999)).toEqual({ ok: false, mensaje: "Ese cobro no existe." });
    expect((await generarReciboDeCobro(-1)).ok).toBe(false);
    const c = await cobroPagado("Reportes");
    pdfFalso.fallarProxima = true;
    expect(await generarReciboDeCobro(c.id)).toEqual({ ok: false, mensaje: "No se pudo generar el recibo. Intenta de nuevo." });
    const r = await generarReciboDeCobro(c.id);
    expect(r).toEqual({ ok: true, datos: { numero: expect.stringMatching(/^R-\d{4}-0001$/) } });
  });

  it("avisarRecibo arma el mensaje con numero, concepto y monto; deja aviso_cliente una vez por dia", async () => {
    const c = await prisma.cobro.findFirstOrThrow({ where: { proyectoId, detalle: "Reportes" } });
    const a = await avisarRecibo(c.id);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.datos.repetido).toBe(false);
    expect(a.datos.mensaje).toContain(c.reciboNumero);
    expect(a.datos.mensaje).toContain("$350,00");
    expect(a.datos.mensaje).toContain("PMS: Extra — Reportes");
    expect(a.datos.href).toMatch(/^https:\/\/wa\.me\/584129999999\?text=/);
    const b = await avisarRecibo(c.id);
    expect(b.ok && b.datos.repetido).toBe(true);
    expect(await prisma.evento.count({ where: { cobroId: c.id, tipo: "aviso_cliente", texto: `recibo ${c.reciboNumero}` } })).toBe(1);
  });

  it("avisarRecibo sin recibo falla; sin WhatsApp devuelve el mensaje para copiar", async () => {
    const sinRecibo = await cobroPagado("Sin recibo");
    expect(await avisarRecibo(sinRecibo.id)).toEqual({ ok: false, mensaje: expect.stringContaining("recibo") });
    const c2 = await sembrarCliente({ nombre: "Sin Cel", whatsapp: "" });
    const p2 = await sembrarProyecto(c2.id, ids.nichoId, { estado: "activo" });
    const cobro = await cobroPagado("Otro", p2.id);
    await generarReciboDeCobro(cobro.id);
    const r = await avisarRecibo(cobro.id);
    expect(r.ok && r.datos.href).toBeNull();
    expect(r.ok && r.datos.mensaje).toContain("recibo de pago");
  });

  it("anular un cobro con recibo genera la nota -A y no borra el PDF", async () => {
    const c = await prisma.cobro.findFirstOrThrow({ where: { proyectoId, detalle: "Reportes" } });
    expect((await anularCobro(c.id, "Pago duplicado")).ok).toBe(true);
    const d = await prisma.cobro.findUniqueOrThrow({ where: { id: c.id } });
    expect(d.anuladoEn).not.toBeNull();
    expect(d.notaAnulacionEn).not.toBeNull();
    expect(existsSync(rutaDocumento(`${c.reciboNumero}-A`))).toBe(true);
    expect(existsSync(rutaDocumento(c.reciboNumero))).toBe(true);
    expect((await anularCobro(c.id, "otra vez")).ok).toBe(false); // ya estaba anulado
    expect(await avisarRecibo(c.id)).toEqual({ ok: false, mensaje: expect.stringContaining("anulado") });
  });

  it("si la nota falla al anular, el cobro queda anulado y la nota se genera despues", async () => {
    const c = await cobroPagado("Nota con reintento");
    await generarReciboDeCobro(c.id);
    pdfFalso.fallarProxima = true;
    expect((await anularCobro(c.id, "Error del banco")).ok).toBe(true);
    const d = await prisma.cobro.findUniqueOrThrow({ where: { id: c.id } });
    expect(d.anuladoEn).not.toBeNull();
    expect(d.notaAnulacionEn).toBeNull();
    expect(await generarNotaDeAnulacion(c.id)).toEqual({ ok: true, datos: { numero: `${d.reciboNumero}-A` } });
    expect((await prisma.cobro.findUniqueOrThrow({ where: { id: c.id } })).notaAnulacionEn).not.toBeNull();
  });

  it("generarNotaDeAnulacion sobre un cobro sin anular o sin recibo falla con mensaje claro", async () => {
    const c = await cobroPagado("Sin anular");
    expect(await generarNotaDeAnulacion(c.id)).toEqual({ ok: false, mensaje: expect.stringContaining("anulado") });
  });
});
