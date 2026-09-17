import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, sembrarCliente, sembrarProyecto } from "./ayuda-db";
import { darAcceso, desactivarAcceso } from "@/lib/acceso-cliente";
import { clienteParaEntrada, inicioPortal, proyectoPortal } from "@/lib/portal";

const HOY = "2026-09-17";

describe.runIf(DB_HABILITADA)("consultas del portal", () => {
  let a: Awaited<ReturnType<typeof sembrarCliente>>;
  let b: Awaited<ReturnType<typeof sembrarCliente>>;
  let pms: number, reservas: number, cerrado: number, deB: number;
  beforeAll(async () => {
    await limpiarBase();
    const ids = await sembrarBasico();
    a = await sembrarCliente({ nombre: "Hotel A" });
    b = await sembrarCliente({ nombre: "Farmacia B" });
    pms = (await sembrarProyecto(a.id, ids.nichoId, { nombre: "PMS Hotel", estado: "activo" })).id;
    reservas = (await sembrarProyecto(a.id, ids.nichoId, { nombre: "Reservas en línea", estado: "en_construccion" })).id;
    cerrado = (await sembrarProyecto(a.id, ids.nichoId, { nombre: "Página vieja", estado: "cerrado" })).id;
    deB = (await sembrarProyecto(b.id, ids.nichoId, { nombre: "Inventario B", estado: "activo" })).id;
    await prisma.pendiente.createMany({ data: [
      { proyectoId: pms, texto: "Recepción y habitaciones", visibleCliente: true, hecho: true, hechoEn: new Date("2026-07-02T16:00:00Z"), fechaEstimada: "2026-06-30", orden: 1 },
      { proyectoId: pms, texto: "Reporte de ocupación", visibleCliente: true, hecho: false, fechaEstimada: "2026-09-30", orden: 2 },
      { proyectoId: pms, texto: "SECRETO refactor interno", visibleCliente: false, hecho: false, orden: 3 },
    ] });
    const v1 = await prisma.version.create({ data: { proyectoId: pms, version: "1.4.2", fecha: "2026-08-28" } });
    const v2 = await prisma.version.create({ data: { proyectoId: pms, version: "1.10.0", fecha: "2026-09-10" } });
    await prisma.cambio.createMany({ data: [{ versionId: v1.id, tipo: "arreglo", texto: "Cierre de caja", orden: 1 }, { versionId: v2.id, tipo: "nuevo", texto: "Reporte semanal", orden: 1 }] });
    await prisma.horas.create({ data: { proyectoId: pms, fecha: "2026-09-01", horas: "3.50", descripcion: "SECRETO horas de depuracion", usuarioId: ids.usuarioId } });
    await prisma.cobro.createMany({ data: [
      { proyectoId: pms, concepto: "mensualidad", detalle: "Mensualidad de septiembre 2026", mes: "2026-09", monto: "100.00", vence: "2026-09-05", nota: "SECRETO nota interna" },
      { proyectoId: pms, concepto: "mensualidad", detalle: "Mensualidad de octubre 2026", mes: "2026-10", monto: "100.00", vence: "2026-10-05" },
      { proyectoId: pms, concepto: "cuota", detalle: "Cuota 3 de 3", monto: "933.34", vence: "2026-07-15", pagadoEn: new Date("2026-07-15T16:00:00Z"), canal: "pago_movil", reciboNumero: "R-2026-0004", reciboGeneradoEn: new Date() },
      { proyectoId: pms, concepto: "extra", detalle: "SECRETO cobro anulado", monto: "50.00", vence: "2026-08-01", pagadoEn: new Date("2026-08-01T16:00:00Z"), canal: "zelle", anuladoEn: new Date(), anuladoMotivo: "error", reciboNumero: "R-2026-0005", reciboGeneradoEn: new Date() },
      { proyectoId: deB, concepto: "extra", detalle: "SECRETO cobro de B", monto: "10.00", vence: "2026-09-01" },
    ] });
  });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("clienteParaEntrada dice el nombre y si puede entrar; un codigo que no existe es null", async () => {
    expect(await clienteParaEntrada(a.codigo)).toEqual({ nombre: "Hotel A", acceso: "sin_acceso" });
    await darAcceso(a.id);
    expect(await clienteParaEntrada(a.codigo)).toEqual({ nombre: "Hotel A", acceso: "activo" });
    await desactivarAcceso(a.id);
    expect(await clienteParaEntrada(a.codigo)).toEqual({ nombre: "Hotel A", acceso: "desactivado" });
    expect(await clienteParaEntrada("A".repeat(22))).toBeNull();
    expect(await clienteParaEntrada("../etc")).toBeNull();
  });

  it("inicio: todos sus proyectos (los cerrados al final), version actual por semver, hitos solo visibles, y el aviso del vencido", async () => {
    const r = await inicioPortal(a.id, HOY);
    expect(r.proyectos.map((p) => p.nombre)).toEqual(["PMS Hotel", "Reservas en línea", "Página vieja"]);
    expect(r.proyectos[0]).toMatchObject({ id: pms, estado: "activo", versionActual: "1.10.0", versionFecha: "2026-09-10", hitos: { hechos: 1, total: 2, porcentaje: 50 } });
    expect(r.proyectos[1]).toMatchObject({ versionActual: "", versionFecha: null, hitos: { hechos: 0, total: 0, porcentaje: null } });
    expect(r.aviso).toMatchObject({ gravedad: "vencido", otros: 0, cobro: { texto: "Mensualidad de septiembre 2026", proyectoNombre: "PMS Hotel", monto: 100 } });
    expect((await inicioPortal(b.id, HOY)).proyectos.map((p) => p.nombre)).toEqual(["Inventario B"]);
  });

  it("proyecto: hitos con sus fechas, versiones de la mas nueva a la mas vieja, cobros separados y sin anulados", async () => {
    const p = await proyectoPortal(a.id, pms, HOY);
    expect(p).not.toBeNull();
    if (!p) return;
    expect(p).toMatchObject({ nombre: "PMS Hotel", pagoUnico: 2800, mensualidad: 100, diaCobroMensual: 5 });
    expect(p.listaHitos).toEqual([
      { texto: "Recepción y habitaciones", hecho: true, hechoEl: "2026-07-02", fechaEstimada: "2026-06-30" },
      { texto: "Reporte de ocupación", hecho: false, hechoEl: null, fechaEstimada: "2026-09-30" },
    ]);
    expect(p.versiones.map((v) => v.version)).toEqual(["1.10.0", "1.4.2"]);
    expect(p.versiones[0].cambios).toEqual([{ tipo: "nuevo", texto: "Reporte semanal" }]);
    expect(p.cobros.porPagar.map((c) => [c.texto, c.estado])).toEqual([["Mensualidad de septiembre 2026", "vencido"], ["Mensualidad de octubre 2026", "pendiente"]]);
    expect(p.cobros.pagados).toEqual([expect.objectContaining({ texto: "Cuota 3 de 3", monto: 933.34, pagadoEl: "2026-07-15", canal: "Pago móvil", reciboNumero: "R-2026-0004" })]);
  });

  it("nada interno sale del portal: ni pendientes internos, ni horas, ni notas, ni anulados, ni lo de otro cliente", async () => {
    const todo = JSON.stringify([await inicioPortal(a.id, HOY), await proyectoPortal(a.id, pms, HOY), await proyectoPortal(a.id, reservas, HOY), await proyectoPortal(a.id, cerrado, HOY)]);
    expect(todo).not.toContain("SECRETO");
    expect(todo).not.toMatch(/horas|tarifa|nota/i);
  });

  it("aislamiento: el proyecto de otro cliente no existe para este", async () => {
    expect(await proyectoPortal(a.id, deB, HOY)).toBeNull();
    expect(await proyectoPortal(b.id, pms, HOY)).toBeNull();
    expect(await proyectoPortal(a.id, 999_999, HOY)).toBeNull();
    expect((await proyectoPortal(b.id, deB, HOY))?.nombre).toBe("Inventario B");
  });
});
