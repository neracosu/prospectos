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
import { marcarPagado, anularCobro, agregarCobro, registrarRecordatorio, deshacerPago } from "@/acciones/cobros";
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
  it("pone el enlace del portal cuando se lo pasan, y sin el queda como antes", () => {
    const c = { concepto: "mensualidad" as const, detalle: "octubre 2026", monto: 100, vence: "2026-10-05", estado: "por_vencer" as const };
    expect(mensajeDeCobro(c, { nombre: "PMS" }, { nombre: "Hotel X", contactoNombre: "Ana" }, plantillas, "https://x.test/c/abc")).toBe("Hola Ana: Mensualidad (octubre 2026) de PMS por $100,00 vence el 05/10/2026. https://x.test/c/abc");
    expect(mensajeDeCobro(c, { nombre: "PMS" }, { nombre: "Hotel X", contactoNombre: "Ana" }, plantillas)).toBe("Hola Ana: Mensualidad (octubre 2026) de PMS por $100,00 vence el 05/10/2026.");
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

  it("anularCobro exige motivo, anula tambien uno pagado (pieza 4), y un anulado no se paga ni se anula otra vez", async () => {
    const pagado = await prisma.cobro.findFirstOrThrow({ where: { proyectoId, concepto: "extra" } });
    expect((await anularCobro(pagado.id, " ")).ok).toBe(false);
    expect((await anularCobro(pagado.id, "x".repeat(192))).ok).toBe(false);
    expect((await anularCobro(pagado.id, "se marcó por error")).ok).toBe(true);
    const d = await prisma.cobro.findUniqueOrThrow({ where: { id: pagado.id } });
    expect(d.anuladoEn).not.toBeNull();
    expect(d.pagadoEn).not.toBeNull(); // el rastro del pago no se borra
    expect(d.notaAnulacionEn).toBeNull(); // no tenia recibo: no hay nota
    expect(await anularCobro(pagado.id, "otra vez")).toEqual({ ok: false, mensaje: "Ese cobro ya estaba anulado." });
    const r = await agregarCobro(fd({ proyectoId: String(proyectoId), concepto: "cuota", detalle: "Cuota extra", monto: "100", vence: "2026-12-01" }));
    expect(r.ok).toBe(true);
    const c = await prisma.cobro.findFirstOrThrow({ where: { proyectoId, detalle: "Cuota extra" } });
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

  it("anularCobro acepta un motivo de 191 caracteres (el ancho de la columna) y rechaza 192", async () => {
    const r = await agregarCobro(fd({ proyectoId: String(proyectoId), concepto: "extra", detalle: "Motivo largo", monto: "5", vence: "2026-10-01" }));
    expect(r.ok).toBe(true);
    const c = await prisma.cobro.findFirstOrThrow({ where: { proyectoId, detalle: "Motivo largo" } });
    expect((await anularCobro(c.id, "x".repeat(192))).ok).toBe(false);
    expect((await anularCobro(c.id, "x".repeat(191))).ok).toBe(true);
    expect((await prisma.cobro.findUniqueOrThrow({ where: { id: c.id } })).anuladoMotivo).toHaveLength(191);
  });
  describe("deshacerPago", () => {
    const pagar = async (detalle: string) => {
      expect((await agregarCobro(fd({ proyectoId: String(proyectoId), concepto: "extra", detalle, monto: "80", vence: "2026-10-01" }))).ok).toBe(true);
      const c = await prisma.cobro.findFirstOrThrow({ where: { proyectoId, detalle } });
      expect((await marcarPagado(fd({ cobroId: String(c.id), pagadoEn: hoyCaracas(), canal: "zelle", referencia: "Z-9", nota: "se equivoco" }))).ok).toBe(true);
      return c.id;
    };

    it("recien pagado vuelve a quedar por cobrar, limpio y con su rastro", async () => {
      const id = await pagar("Deshacer uno");
      expect(await deshacerPago(id)).toEqual({ ok: true, datos: undefined });
      const d = await prisma.cobro.findUniqueOrThrow({ where: { id } });
      expect(d).toMatchObject({ pagadoEn: null, canal: "", referencia: "", nota: "", anuladoEn: null });
      const ev = await prisma.evento.findMany({ where: { cobroId: id, tipo: "pago_deshecho" } });
      expect(ev).toHaveLength(1);
      expect(ev[0]).toMatchObject({ usuarioId: ids.usuarioId, proyectoId });
      expect(ev[0].texto).toContain("$80,00");
      // El pago original conserva su evento: nada se borra.
      expect(await prisma.evento.count({ where: { cobroId: id, tipo: "cobro_pagado" } })).toBe(1);
      // Y se puede volver a pagar.
      expect((await marcarPagado(fd({ cobroId: String(id), pagadoEn: hoyCaracas(), canal: "efectivo", referencia: "", nota: "" }))).ok).toBe(true);
    });

    it("dos toques deshacen una sola vez", async () => {
      const id = await pagar("Deshacer doble");
      const [a, b] = await Promise.all([deshacerPago(id), deshacerPago(id)]);
      expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
      expect(await prisma.evento.count({ where: { cobroId: id, tipo: "pago_deshecho" } })).toBe(1);
    });

    it("con recibo emitido no se deshace: el pago sigue", async () => {
      const id = await pagar("Deshacer con recibo");
      await prisma.cobro.update({ where: { id }, data: { reciboNumero: "R-2026-9999", reciboGeneradoEn: new Date() } });
      expect(await deshacerPago(id)).toEqual({ ok: false, mensaje: expect.stringContaining("recibo") });
      expect((await prisma.cobro.findUniqueOrThrow({ where: { id } })).pagadoEn).not.toBeNull();
      expect(await prisma.evento.count({ where: { cobroId: id, tipo: "pago_deshecho" } })).toBe(0);
    });

    it("pasado el minuto ya no se deshace: toca anular", async () => {
      const id = await pagar("Deshacer tarde");
      await prisma.evento.updateMany({ where: { cobroId: id, tipo: "cobro_pagado" }, data: { creadoEn: new Date(Date.now() - 2 * 60 * 1000) } });
      expect(await deshacerPago(id)).toEqual({ ok: false, mensaje: expect.stringContaining("anúlalo") });
      expect((await prisma.cobro.findUniqueOrThrow({ where: { id } })).pagadoEn).not.toBeNull();
    });

    it("un cobro que nunca se pago, uno anulado o uno que no existe no se deshacen", async () => {
      expect((await agregarCobro(fd({ proyectoId: String(proyectoId), concepto: "extra", detalle: "Nunca pagado", monto: "10", vence: "2026-10-01" }))).ok).toBe(true);
      const sinPagar = await prisma.cobro.findFirstOrThrow({ where: { proyectoId, detalle: "Nunca pagado" } });
      expect((await deshacerPago(sinPagar.id)).ok).toBe(false);
      const anulado = await pagar("Deshacer anulado");
      expect((await anularCobro(anulado, "pago marcado por error")).ok).toBe(true);
      expect((await deshacerPago(anulado)).ok).toBe(false);
      expect((await prisma.cobro.findUniqueOrThrow({ where: { id: anulado } })).pagadoEn).not.toBeNull();
      expect((await deshacerPago(99999999)).ok).toBe(false);
      expect((await deshacerPago(-1)).ok).toBe(false);
    });

    it("el prospectador no deshace pagos", async () => {
      const id = await pagar("Deshacer sin permiso");
      sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
      await expect(deshacerPago(id)).rejects.toThrow("REDIRECT:/hoy");
      expect((await prisma.cobro.findUniqueOrThrow({ where: { id } })).pagadoEn).not.toBeNull();
    });
  });
});
