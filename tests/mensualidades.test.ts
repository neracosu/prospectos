import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, sembrarCliente, sembrarProyecto } from "./ayuda-db";
import { generarMensualidades, proximoDisparoMs } from "@/lib/mensualidades";

describe("proximoDisparoMs", () => {
  it("apunta a las 06:00 de Caracas siguientes", () => {
    // 2026-09-16 05:00 Caracas = 09:00Z -> falta 1 h
    expect(proximoDisparoMs(new Date("2026-09-16T09:00:00Z"))).toBe(60 * 60 * 1000);
    // 2026-09-16 06:00:01 Caracas -> manana a las 06:00 (menos 1 s)
    expect(proximoDisparoMs(new Date("2026-09-16T10:00:01Z"))).toBe(24 * 60 * 60 * 1000 - 1000);
  });
});

describe.runIf(DB_HABILITADA)("generarMensualidades", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  let activo: number, pausado: number, cero: number, cerrado: number;
  beforeAll(async () => {
    await limpiarBase(); ids = await sembrarBasico();
    const c = await sembrarCliente();
    activo = (await sembrarProyecto(c.id, ids.nichoId, { nombre: "Activo", estado: "activo", fechaInicio: "2026-08-01", diaCobroMensual: 20, mensualidad: "120.00" })).id;
    // Mensualidad previa de julio: sin esta, la primera activacion no rescataria agosto (ya vencido).
    await prisma.cobro.create({ data: { proyectoId: activo, concepto: "mensualidad", detalle: "Mensualidad de julio 2026", monto: "120.00", vence: "2026-07-20", mes: "2026-07" } });
    pausado = (await sembrarProyecto(c.id, ids.nichoId, { nombre: "Pausado", estado: "pausado", fechaInicio: "2026-08-01", diaCobroMensual: 20 })).id;
    cero = (await sembrarProyecto(c.id, ids.nichoId, { nombre: "SoloPagoUnico", estado: "activo", fechaInicio: "2026-08-01", diaCobroMensual: 20, mensualidad: "0.00" })).id;
    cerrado = (await sembrarProyecto(c.id, ids.nichoId, { nombre: "Cerrado", estado: "cerrado", fechaInicio: "2026-08-01", diaCobroMensual: 20 })).id;
  });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("crea las que tocan, con monto de la mensualidad, y es idempotente", async () => {
    const r1 = await generarMensualidades("2026-09-16");
    expect(r1).toEqual({ creadas: 2, proyectos: 2 }); // agosto (perdida) y septiembre (en 4 dias); activo + cero cuentan como activos
    const cobros = await prisma.cobro.findMany({ where: { proyectoId: activo }, orderBy: { vence: "asc" } });
    expect(cobros.map((c) => [c.concepto, c.mes, c.vence, Number(c.monto), c.detalle])).toEqual([
      ["mensualidad", "2026-07", "2026-07-20", 120, "Mensualidad de julio 2026"], // sembrada a mano en el beforeAll
      ["mensualidad", "2026-08", "2026-08-20", 120, "Mensualidad de agosto 2026"],
      ["mensualidad", "2026-09", "2026-09-20", 120, "Mensualidad de septiembre 2026"],
    ]);
    const eventos = await prisma.evento.findMany({ where: { proyectoId: activo, tipo: "cobro_agregado" }, orderBy: { creadoEn: "asc" } });
    expect(eventos.map((e) => e.texto)).toEqual(["mensualidad 2026-08", "mensualidad 2026-09"]);
    expect(eventos.every((e) => e.cobroId !== null)).toBe(true);
    const r2 = await generarMensualidades("2026-09-16");
    expect(r2).toEqual({ creadas: 0, proyectos: 2 });
    expect(await prisma.cobro.count({ where: { proyectoId: pausado } })).toBe(0);
    expect(await prisma.cobro.count({ where: { proyectoId: cerrado } })).toBe(0);
    expect(await prisma.evento.count({ where: { proyectoId: activo, tipo: "cobro_agregado" } })).toBe(2);
  });

  it("un proyecto con mensualidad en 0 (solo pago unico) no genera cobros", async () => {
    expect(await prisma.cobro.count({ where: { proyectoId: cero } })).toBe(0);
  });

  it("dos corridas simultaneas no duplican (unico proyecto+mes)", async () => {
    await Promise.all([generarMensualidades("2026-10-15"), generarMensualidades("2026-10-15")]);
    expect(await prisma.cobro.count({ where: { proyectoId: activo, mes: "2026-10" } })).toBe(1);
  });
});
