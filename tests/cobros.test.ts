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
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, sembrarCliente, sembrarProyecto } from "./ayuda-db";
import { sesionFalsa } from "./ayuda-sesion";
import { marcarPagado, anularCobro, agregarCobro, registrarRecordatorio } from "@/acciones/cobros";
import { mensajeDeCobro, enlaceWhatsappCobro } from "@/lib/mensajes-cobro";
import { hoyCaracas, sumarDias } from "@/lib/fecha-caracas";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe("mensajeDeCobro", () => {
  const plantillas = { recordatorio: "Hola {cliente}: {concepto} de {proyecto} por {monto} vence el {vence}. {enlace}", vencido: "{cliente}, venció el {vence}: {monto}" };
  it("rellena y usa la plantilla de vencido cuando toca; {enlace} queda vacio", () => {
    const c = { concepto: "mensualidad" as const, detalle: "octubre 2026", monto: 100, vence: "2026-10-05", estado: "por_vencer" as const };
    expect(mensajeDeCobro(c, { nombre: "PMS" }, { nombre: "Hotel X", contactoNombre: "Ana" }, plantillas)).toBe("Hola Ana: Mensualidad (octubre 2026) de PMS por $100,00 vence el 05/10/2026.");
    expect(mensajeDeCobro({ ...c, estado: "vencido" }, { nombre: "PMS" }, { nombre: "Hotel X", contactoNombre: "" }, plantillas)).toBe("Hotel X, venció el 05/10/2026: $100,00");
  });
  it("enlaceWhatsappCobro codifica y devuelve null sin celular", () => {
    expect(enlaceWhatsappCobro("584121234567", "Hola & adiós")).toBe("https://wa.me/584121234567?text=Hola%20%26%20adi%C3%B3s");
    expect(enlaceWhatsappCobro("", "x")).toBeNull();
  });
  it("colapsa solo espacio horizontal: una plantilla multilinea conserva ambos saltos de linea", () => {
    const c = { concepto: "extra" as const, detalle: "", monto: 10, vence: "2026-01-01", estado: "pendiente" as const };
    const multilinea = { recordatorio: "línea 1\n\nlínea 2  con  espacios", vencido: "" };
    expect(mensajeDeCobro(c, { nombre: "P" }, { nombre: "C", contactoNombre: "" }, multilinea)).toBe("línea 1\n\nlínea 2 con espacios");
  });
});

describe.runIf(DB_HABILITADA)("acciones de cobros", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  let proyectoId: number;
  beforeAll(async () => {
    await limpiarBase(); ids = await sembrarBasico();
    const c = await sembrarCliente({ nombre: "Hotel Cobros", whatsapp: "584129999999" });
    proyectoId = (await sembrarProyecto(c.id, ids.nichoId, { estado: "activo" })).id;
  });
  beforeEach(() => { sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" }; });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("el prospectador no toca cobros", async () => {
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
    await expect(anularCobro(1, "x")).rejects.toThrow("REDIRECT:/hoy");
  });

  it("agregarCobro valida y crea; pago_unico y mensualidad no se agregan a mano", async () => {
    expect((await agregarCobro(fd({ proyectoId: String(proyectoId), concepto: "mensualidad", detalle: "x", monto: "10", vence: "2026-10-01" }))).ok).toBe(false);
    expect((await agregarCobro(fd({ proyectoId: String(proyectoId), concepto: "extra", detalle: "Reportes", monto: "10,5x", vence: "2026-10-01" }))).ok).toBe(false);
    const r = await agregarCobro(fd({ proyectoId: String(proyectoId), concepto: "extra", detalle: "Módulo de reportes", monto: "350", vence: "2026-10-01" }));
    expect(r.ok).toBe(true);
    const c = await prisma.cobro.findFirstOrThrow({ where: { proyectoId, concepto: "extra" } });
    expect(Number(c.monto)).toBe(350);
    expect(await prisma.evento.count({ where: { cobroId: c.id, tipo: "cobro_agregado" } })).toBe(1);
  });

  it("marcarPagado: dos toques cuentan uno; valida fecha y canal", async () => {
    const c = await prisma.cobro.findFirstOrThrow({ where: { proyectoId, concepto: "extra" } });
    const hoy = hoyCaracas();
    expect((await marcarPagado(fd({ cobroId: String(c.id), pagadoEn: sumarDias(hoy, 1), canal: "zelle", referencia: "", nota: "" }))).ok).toBe(false); // futuro
    expect((await marcarPagado(fd({ cobroId: String(c.id), pagadoEn: hoy, canal: "paloma", referencia: "", nota: "" }))).ok).toBe(false);
    const [a, b] = await Promise.all([
      marcarPagado(fd({ cobroId: String(c.id), pagadoEn: hoy, canal: "zelle", referencia: "Z-123", nota: "" })),
      marcarPagado(fd({ cobroId: String(c.id), pagadoEn: hoy, canal: "zelle", referencia: "Z-123", nota: "" })),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const d = await prisma.cobro.findUniqueOrThrow({ where: { id: c.id } });
    expect(d.pagadoEn).not.toBeNull();
    expect(d.canal).toBe("zelle");
    expect(await prisma.evento.count({ where: { cobroId: c.id, tipo: "cobro_pagado" } })).toBe(1);
  });

  it("anularCobro exige motivo, no anula uno pagado, y un anulado no se paga", async () => {
    const pagado = await prisma.cobro.findFirstOrThrow({ where: { proyectoId, concepto: "extra" } });
    expect((await anularCobro(pagado.id, "error")).ok).toBe(false);
    const r = await agregarCobro(fd({ proyectoId: String(proyectoId), concepto: "cuota", detalle: "Cuota extra", monto: "100", vence: "2026-12-01" }));
    expect(r.ok).toBe(true);
    const c = await prisma.cobro.findFirstOrThrow({ where: { proyectoId, detalle: "Cuota extra" } });
    expect((await anularCobro(c.id, " ")).ok).toBe(false);
    expect((await anularCobro(c.id, "se acordó otra cosa")).ok).toBe(true);
    expect((await marcarPagado(fd({ cobroId: String(c.id), pagadoEn: hoyCaracas(), canal: "efectivo", referencia: "", nota: "" }))).ok).toBe(false);
    expect((await prisma.cobro.findUniqueOrThrow({ where: { id: c.id } })).anuladoMotivo).toBe("se acordó otra cosa");
  });

  it("registrarRecordatorio devuelve el enlace de WhatsApp una vez por dia; el segundo toque repite el mismo enlace sin duplicar evento", async () => {
    const r = await agregarCobro(fd({ proyectoId: String(proyectoId), concepto: "extra", detalle: "Soporte", monto: "40", vence: "2026-01-01" })); // vencido
    expect(r.ok).toBe(true);
    const c = await prisma.cobro.findFirstOrThrow({ where: { proyectoId, detalle: "Soporte" } });
    const a = await registrarRecordatorio(c.id);
    expect(a.ok).toBe(true);
    if (a.ok) { expect(a.datos.repetido).toBe(false); expect(a.datos.href).toMatch(/^https:\/\/wa\.me\/584129999999\?text=/); expect(decodeURIComponent(a.datos.href)).toContain("venció"); }
    const b = await registrarRecordatorio(c.id);
    expect(b.ok).toBe(true);
    if (b.ok && a.ok) { expect(b.datos.repetido).toBe(true); expect(b.datos.href).toBe(a.datos.href); }
    expect(await prisma.evento.count({ where: { cobroId: c.id, tipo: "recordatorio" } })).toBe(1);
  });

  it("registrarRecordatorio sin WhatsApp del cliente falla con mensaje claro", async () => {
    const c2 = await sembrarCliente({ nombre: "Sin Cel", whatsapp: "" });
    const p2 = await sembrarProyecto(c2.id, ids.nichoId, { estado: "activo" });
    await agregarCobro(fd({ proyectoId: String(p2.id), concepto: "extra", detalle: "Cobro", monto: "1", vence: "2026-12-01" }));
    const c = await prisma.cobro.findFirstOrThrow({ where: { proyectoId: p2.id } });
    expect(await registrarRecordatorio(c.id)).toEqual({ ok: false, mensaje: expect.stringContaining("WhatsApp") });
  });

  it("agregarCobro guarda montos con coma decimal", async () => {
    const r = await agregarCobro(fd({ proyectoId: String(proyectoId), concepto: "extra", detalle: "Coma decimal", monto: "10,50", vence: "2026-10-01" }));
    expect(r.ok).toBe(true);
    const c = await prisma.cobro.findFirstOrThrow({ where: { proyectoId, detalle: "Coma decimal" } });
    expect(Number(c.monto)).toBe(10.5);
  });

  it("agregarCobro rechaza pago_unico aunque el detalle sea valido", async () => {
    const r = await agregarCobro(fd({ proyectoId: String(proyectoId), concepto: "pago_unico", detalle: "Pago inicial", monto: "100", vence: "2026-10-01" }));
    expect(r.ok).toBe(false);
  });

  it("marcarPagado guarda el mediodia de Caracas del dia elegido", async () => {
    const r = await agregarCobro(fd({ proyectoId: String(proyectoId), concepto: "extra", detalle: "Fecha exacta", monto: "20", vence: "2026-09-01" }));
    expect(r.ok).toBe(true);
    const c = await prisma.cobro.findFirstOrThrow({ where: { proyectoId, detalle: "Fecha exacta" } });
    const p = await marcarPagado(fd({ cobroId: String(c.id), pagadoEn: "2026-09-16", canal: "efectivo", referencia: "", nota: "" }));
    expect(p.ok).toBe(true);
    const d = await prisma.cobro.findUniqueOrThrow({ where: { id: c.id } });
    expect(d.pagadoEn?.toISOString()).toBe("2026-09-16T16:00:00.000Z");
  });

  it("anularCobro deja un solo evento cobro_anulado", async () => {
    const r = await agregarCobro(fd({ proyectoId: String(proyectoId), concepto: "extra", detalle: "Para anular", monto: "15", vence: "2026-10-01" }));
    expect(r.ok).toBe(true);
    const c = await prisma.cobro.findFirstOrThrow({ where: { proyectoId, detalle: "Para anular" } });
    const a = await anularCobro(c.id, "ya no aplica");
    expect(a.ok).toBe(true);
    expect(await prisma.evento.count({ where: { cobroId: c.id, tipo: "cobro_anulado" } })).toBe(1);
  });
});
