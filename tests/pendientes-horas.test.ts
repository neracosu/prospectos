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
import { agregarPendiente, marcarPendiente, alternarVisible, moverPendiente, eliminarPendiente } from "@/acciones/pendientes";
import { registrarHoras, eliminarHoras } from "@/acciones/horas";
import { fichaProyecto } from "@/lib/proyectos";
import { hoyCaracas, sumarDias } from "@/lib/fecha-caracas";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe.runIf(DB_HABILITADA)("pendientes y horas", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  let proyectoId: number;
  beforeAll(async () => {
    await limpiarBase(); ids = await sembrarBasico();
    const c = await sembrarCliente();
    proyectoId = (await sembrarProyecto(c.id, ids.nichoId, { horasCotizadas: "10" })).id;
  });
  beforeEach(() => { sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" }; });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("pendientes: agregar, ordenar, marcar (con evento solo si visible), alternar y eliminar", async () => {
    const a = await agregarPendiente(fd({ proyectoId: String(proyectoId), texto: "Módulo de reservas", visibleCliente: "on", fechaEstimada: "2026-10-15" }));
    const b = await agregarPendiente(fd({ proyectoId: String(proyectoId), texto: "Refactorizar cron" }));
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    let f = (await fichaProyecto(proyectoId, hoyCaracas()))!;
    expect(f.pendientes.map((p) => p.texto)).toEqual(["Módulo de reservas", "Refactorizar cron"]);
    expect(f.avance).toBe(0);
    expect((await moverPendiente(b.datos.id, "arriba")).ok).toBe(true);
    f = (await fichaProyecto(proyectoId, hoyCaracas()))!;
    expect(f.pendientes.map((p) => p.texto)).toEqual(["Refactorizar cron", "Módulo de reservas"]);
    expect((await marcarPendiente(b.datos.id, true)).ok).toBe(true); // interno: sin evento
    expect((await marcarPendiente(a.datos.id, true)).ok).toBe(true); // visible: evento hito_cumplido
    expect(await prisma.evento.count({ where: { proyectoId, tipo: "hito_cumplido" } })).toBe(1); // update y evento van juntos (misma transaccion)
    f = (await fichaProyecto(proyectoId, hoyCaracas()))!;
    expect(f.avance).toBe(100);
    expect((await alternarVisible(b.datos.id)).ok).toBe(true);
    f = (await fichaProyecto(proyectoId, hoyCaracas()))!;
    expect(f.avance).toBe(100); // los dos visibles y hechos
    expect((await eliminarPendiente(b.datos.id)).ok).toBe(true);
    expect(await prisma.pendiente.count({ where: { proyectoId } })).toBe(1);
    expect((await agregarPendiente(fd({ proyectoId: String(proyectoId), texto: "x" }))).ok).toBe(false); // muy corto
  });

  it("horas: valida fecha y pasos de 0.25, suma en la ficha y solo se borra el mismo dia", async () => {
    const hoy = hoyCaracas();
    expect((await registrarHoras(fd({ proyectoId: String(proyectoId), fecha: sumarDias(hoy, 1), horas: "2", descripcion: "x" }))).ok).toBe(false);
    expect((await registrarHoras(fd({ proyectoId: String(proyectoId), fecha: hoy, horas: "0.1", descripcion: "x" }))).ok).toBe(false);
    expect((await registrarHoras(fd({ proyectoId: String(proyectoId), fecha: hoy, horas: "2.3", descripcion: "x" }))).ok).toBe(false);
    expect((await registrarHoras(fd({ proyectoId: String(proyectoId), fecha: hoy, horas: "2.5", descripcion: "Reservas" }))).ok).toBe(true);
    expect(await prisma.evento.count({ where: { proyectoId, tipo: "horas" } })).toBe(1); // horas y evento van juntos (misma transaccion)
    expect((await registrarHoras(fd({ proyectoId: String(proyectoId), fecha: "2026-09-01", horas: "8", descripcion: "Base de datos" }))).ok).toBe(true);
    const f = (await fichaProyecto(proyectoId, hoy))!;
    expect(f.horasReales).toBe(10.5);
    expect(f.horasCotizadas).toBe(10);
    expect(f.horas[0].usuarioNombre).toBe("Neri");
    const vieja = await prisma.horas.findFirstOrThrow({ where: { proyectoId, fecha: "2026-09-01" } });
    await prisma.horas.update({ where: { id: vieja.id }, data: { creadoEn: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } });
    expect((await eliminarHoras(vieja.id)).ok).toBe(false);
    const deHoy = await prisma.horas.findFirstOrThrow({ where: { proyectoId, fecha: hoy } });
    expect((await eliminarHoras(deHoy.id)).ok).toBe(true);
    expect(await prisma.evento.count({ where: { proyectoId, tipo: "horas" } })).toBe(2);
  });
});
