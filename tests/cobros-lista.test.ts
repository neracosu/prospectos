import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, sembrarCliente, sembrarProyecto } from "./ayuda-db";
import { listarCobros } from "@/lib/cobros";
import { fichaProyecto } from "@/lib/proyectos";
import { hoyCaracas, sumarDias } from "@/lib/fecha-caracas";

// Seccion /cobros (fase 3): los cobros de todos los proyectos, con el nombre del proyecto en cada fila.
describe.runIf(DB_HABILITADA)("listarCobros", () => {
  const hoy = hoyCaracas();
  let p1 = 0, p2 = 0;
  beforeAll(async () => {
    await limpiarBase();
    const ids = await sembrarBasico();
    const c = await sembrarCliente({ nombre: "Cliente Lista" });
    p1 = (await sembrarProyecto(c.id, ids.nichoId, { nombre: "PMS Hotel", estado: "activo" })).id;
    p2 = (await sembrarProyecto(c.id, ids.nichoId, { nombre: "Tienda", estado: "activo" })).id;
    await prisma.cobro.create({ data: { proyectoId: p1, concepto: "cuota", detalle: "Cuota 1 de 2", monto: "100.00", vence: sumarDias(hoy, -3) } });
    await prisma.cobro.create({ data: { proyectoId: p2, concepto: "extra", detalle: "Pagado", monto: "50.00", vence: sumarDias(hoy, -10), pagadoEn: new Date(), canal: "zelle" } });
    await prisma.cobro.create({ data: { proyectoId: p2, concepto: "extra", detalle: "Anulado", monto: "70.00", vence: hoy, anuladoEn: new Date(), anuladoMotivo: "prueba" } });
  });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("vencidos trae el de PMS Hotel con su nombre de proyecto", async () => {
    const v = await listarCobros("vencidos", hoy);
    expect(v).toHaveLength(1);
    expect(v[0].proyectoNombre).toBe("PMS Hotel");
    expect(v[0].proyectoId).toBe(p1);
    expect(v[0].estado).toBe("vencido");
  });
  it("pagados trae el de Tienda; pendientes no trae el anulado", async () => {
    const pag = await listarCobros("pagados", hoy);
    expect(pag.map((c) => c.proyectoNombre)).toEqual(["Tienda"]);
    const pen = await listarCobros("pendientes", hoy);
    expect(pen.map((c) => c.detalle)).toEqual(["Cuota 1 de 2"]);
  });
  it("mes trae solo lo que vence desde hoy dentro del mes, igual que la cifra", async () => {
    const mes = await listarCobros("mes", hoy);
    expect(mes.map((c) => c.detalle)).not.toContain("Cuota 1 de 2"); // vencida: va en vencidos
    expect(mes.every((c) => c.vence >= hoy && c.vence.slice(0, 7) === hoy.slice(0, 7))).toBe(true);
  });
  it("pagados: con mas de 300 pagados, la lista trae los mas recientes", async () => {
    const viejos = Array.from({ length: 305 }, (_, i) => ({ proyectoId: p2, concepto: "extra", detalle: `Viejo ${i}`, monto: "1.00", vence: "2020-01-01", pagadoEn: new Date("2020-01-02T12:00:00Z"), canal: "zelle" }));
    await prisma.cobro.createMany({ data: viejos });
    const pag = await listarCobros("pagados", hoy);
    expect(pag).toHaveLength(300);
    expect(pag[0].detalle).toBe("Pagado"); // el pagado de hoy, no uno del 2020
    await prisma.cobro.deleteMany({ where: { detalle: { startsWith: "Viejo " } } });
  });
  it("fichaProyecto rellena el proyecto en cada CobroFila", async () => {
    const f = await fichaProyecto(p1, hoy);
    expect(f!.cobros[0].proyectoNombre).toBe("PMS Hotel");
    expect(f!.cobros[0].proyectoId).toBe(p1);
  });
});
