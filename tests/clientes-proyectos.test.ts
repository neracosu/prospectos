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
import { DB_HABILITADA, limpiarBase, sembrarBasico, crearProspectoDePrueba, sembrarCliente } from "./ayuda-db";
import { sesionFalsa } from "./ayuda-sesion";
import { crearProyecto, cambiarEstadoProyecto, editarProyecto } from "@/acciones/proyectos";
import { crearCliente } from "@/acciones/clientes";
import { listarProyectos, ganadosSinProyecto, fichaProyecto, resumenMes } from "@/lib/proyectos";
import { clienteDesdeProspecto, listarClientes } from "@/lib/clientes";
import { leerTarifaHora, guardarConfig, CLAVES } from "@/lib/configuracion";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe.runIf(DB_HABILITADA)("clientes y proyectos", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  beforeAll(async () => { await limpiarBase(); ids = await sembrarBasico(); });
  beforeEach(() => { sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" }; });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("el prospectador no entra a nada de esta pieza", async () => {
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
    await expect(crearCliente(fd({ nombre: "X" }))).rejects.toThrow("REDIRECT:/hoy");
    await expect(crearProyecto(fd({ nombre: "X" }))).rejects.toThrow("REDIRECT:/hoy");
    await expect(cambiarEstadoProyecto(1, "activo")).rejects.toThrow("REDIRECT:/hoy");
  });

  it("configuracion devuelve defectos y guarda", async () => {
    expect(await leerTarifaHora()).toBe(17);
    await guardarConfig(CLAVES.tarifaHora, "20");
    expect(await leerTarifaHora()).toBe(20);
    await guardarConfig(CLAVES.tarifaHora, "17");
  });

  it("clienteDesdeProspecto copia el contacto y es idempotente", async () => {
    const pr = await crearProspectoDePrueba(ids.nichoId, { nombre: "Hotel Ganado", whatsapp: "584121111111", email: "h@g.co", instagram: "https://www.instagram.com/hg/", etapa: "ganado" });
    const a = await clienteDesdeProspecto(pr.id);
    const b = await clienteDesdeProspecto(pr.id);
    expect(a.id).toBe(b.id);
    const c = await prisma.cliente.findUniqueOrThrow({ where: { id: a.id } });
    expect(c).toMatchObject({ nombre: "Hotel Ganado", whatsapp: "584121111111", email: "h@g.co", instagram: "https://www.instagram.com/hg/", prospectoId: pr.id });
    expect(c.codigo).toHaveLength(22);
  });

  it("ganadosSinProyecto lista al ganado hasta que se le crea proyecto; crearProyecto en cuotas genera los cobros", async () => {
    const pr = await prisma.prospecto.findFirstOrThrow({ where: { nombre: "Hotel Ganado" } });
    expect((await ganadosSinProyecto()).map((g) => g.id)).toContain(pr.id);
    const r = await crearProyecto(fd({ prospectoId: String(pr.id), nombre: "PMS Hotel", nichoId: String(ids.nichoId), pagoUnico: "2800", mensualidad: "100", horasCotizadas: "160", fechaInicio: "2026-09-01", diaCobroMensual: "5", formaPago: "cuotas", cuotas: "3" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await ganadosSinProyecto()).map((g) => g.id)).not.toContain(pr.id);
    const cobros = await prisma.cobro.findMany({ where: { proyectoId: r.datos.id }, orderBy: { vence: "asc" } });
    expect(cobros.map((c) => [c.concepto, c.detalle, Number(c.monto), c.vence])).toEqual([
      ["cuota", "Cuota 1 de 3", 933.33, "2026-09-01"], ["cuota", "Cuota 2 de 3", 933.33, "2026-10-01"], ["cuota", "Cuota 3 de 3", 933.34, "2026-10-31"],
    ]);
    expect(await prisma.evento.count({ where: { proyectoId: r.datos.id, tipo: "proyecto_creado" } })).toBe(1);
  });

  it("crearProyecto completo genera un solo cobro y valida montos y fechas", async () => {
    const c = await sembrarCliente({ nombre: "Cliente Directo" });
    expect((await crearProyecto(fd({ clienteId: String(c.id), nombre: "Tienda", nichoId: String(ids.nichoId), pagoUnico: "abc", mensualidad: "80", horasCotizadas: "100", fechaInicio: "2026-09-01", diaCobroMensual: "10", formaPago: "completo" }))).ok).toBe(false);
    expect((await crearProyecto(fd({ clienteId: String(c.id), nombre: "Tienda", nichoId: String(ids.nichoId), pagoUnico: "2500", mensualidad: "80", horasCotizadas: "100", fechaInicio: "2026-02-30", diaCobroMensual: "10", formaPago: "completo" }))).ok).toBe(false);
    expect((await crearProyecto(fd({ clienteId: String(c.id), nombre: "Tienda", nichoId: String(ids.nichoId), pagoUnico: "2500", mensualidad: "80", horasCotizadas: "100", fechaInicio: "2026-09-01", diaCobroMensual: "31", formaPago: "completo" }))).ok).toBe(false);
    const r = await crearProyecto(fd({ clienteId: String(c.id), nombre: "Tienda", nichoId: String(ids.nichoId), pagoUnico: "2500", mensualidad: "80", horasCotizadas: "100", fechaInicio: "2026-09-01", diaCobroMensual: "10", formaPago: "completo" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cobros = await prisma.cobro.findMany({ where: { proyectoId: r.datos.id } });
    expect(cobros).toHaveLength(1);
    expect(cobros[0]).toMatchObject({ concepto: "pago_unico", detalle: "Pago único", vence: "2026-09-01" });
    expect(Number(cobros[0].monto)).toBe(2500);
  });

  it("crearProyecto exige que el prospecto este en Ganado", async () => {
    const pr = await crearProspectoDePrueba(ids.nichoId, { nombre: "Farmacia Pendiente" });
    const r = await crearProyecto(fd({ prospectoId: String(pr.id), nombre: "Farmacia PMS", nichoId: String(ids.nichoId), pagoUnico: "1000", mensualidad: "50", horasCotizadas: "40", fechaInicio: "2026-09-01", diaCobroMensual: "5", formaPago: "completo" }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.mensaje).toMatch(/Ganado/);
    expect(await prisma.cliente.count({ where: { prospectoId: pr.id } })).toBe(0);
  });

  it("crearProyecto sin pago unico no crea cobro; con cuotas sin pago unico falla", async () => {
    const c = await sembrarCliente({ nombre: "Cliente Mensual" });
    const r = await crearProyecto(fd({ clienteId: String(c.id), nombre: "Solo Mensualidad", nichoId: String(ids.nichoId), pagoUnico: "0", mensualidad: "50", horasCotizadas: "20", fechaInicio: "2026-09-01", diaCobroMensual: "5", formaPago: "completo" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await prisma.cobro.count({ where: { proyectoId: r.datos.id } })).toBe(0);
    const r2 = await crearProyecto(fd({ clienteId: String(c.id), nombre: "Solo Mensualidad 2", nichoId: String(ids.nichoId), pagoUnico: "0", mensualidad: "50", horasCotizadas: "20", fechaInicio: "2026-09-01", diaCobroMensual: "5", formaPago: "cuotas", cuotas: "3" }));
    expect(r2.ok).toBe(false);
    if (r2.ok) return;
    expect(r2.mensaje).toBe("Sin pago único no hay cuotas.");
  });

  it("cambiarEstadoProyecto respeta el orden, fija fechaEntregaReal y deja evento", async () => {
    const p = await prisma.proyecto.findFirstOrThrow({ where: { nombre: "Tienda" } });
    expect((await cambiarEstadoProyecto(p.id, "pausado")).ok).toBe(false); // desde en_construccion no
    expect((await cambiarEstadoProyecto(p.id, "entregado")).ok).toBe(true);
    let d = await prisma.proyecto.findUniqueOrThrow({ where: { id: p.id } });
    expect(d.estado).toBe("entregado");
    expect(d.fechaEntregaReal).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((await cambiarEstadoProyecto(p.id, "activo")).ok).toBe(true);
    expect((await cambiarEstadoProyecto(p.id, "cerrado", "")).ok).toBe(false); // cerrar pide motivo
    expect((await cambiarEstadoProyecto(p.id, "cerrado", "terminó el contrato")).ok).toBe(true);
    d = await prisma.proyecto.findUniqueOrThrow({ where: { id: p.id } });
    expect(d.estado).toBe("cerrado");
    expect(await prisma.evento.count({ where: { proyectoId: p.id, tipo: "proyecto_estado" } })).toBe(3);
  });

  it("listarProyectos trae semaforo y resumenMes suma; fichaProyecto arma todo", async () => {
    const hoy = "2026-09-16";
    const lista = await listarProyectos(hoy);
    const pms = lista.find((p) => p.nombre === "PMS Hotel")!;
    expect(pms.semaforo).toBe("rojo"); // cuota 1 vencio el 2026-09-01
    expect(pms.clienteNombre).toBe("Hotel Ganado");
    expect(pms.versionActual).toBe("");
    const m = await resumenMes(hoy);
    expect(m.cobrado).toBe(0);
    expect(m.vencido).toBeCloseTo(933.33 + 2500, 2); // cuota 1 de PMS + pago unico de Tienda (vence 09-01)
    const f = await fichaProyecto(pms.id, hoy);
    expect(f?.cobros.map((c) => c.estado)).toEqual(["vencido", "pendiente", "pendiente"]);
    expect(f?.cliente.nombre).toBe("Hotel Ganado");
    expect(f?.avance).toBeNull();
    expect(f?.horasReales).toBe(0);
    expect(await fichaProyecto(999999, hoy)).toBeNull();
  });

  it("editarProyecto cambia lo editable, deja un evento con lo que cambio y no repite si nada cambio", async () => {
    const p = await prisma.proyecto.findFirstOrThrow({ where: { nombre: "PMS Hotel" } });
    expect((await editarProyecto(fd({ id: String(p.id), nombre: "PMS Hotel v2", mensualidad: "120", horasCotizadas: "170", fechaEntregaEstimada: "2026-11-30", diaCobroMensual: "7" }))).ok).toBe(true);
    const d = await prisma.proyecto.findUniqueOrThrow({ where: { id: p.id } });
    expect(d).toMatchObject({ nombre: "PMS Hotel v2", diaCobroMensual: 7, fechaEntregaEstimada: "2026-11-30" });
    expect(Number(d.mensualidad)).toBe(120);
    const eventos = await prisma.evento.findMany({ where: { proyectoId: p.id, tipo: "proyecto_editado" } });
    expect(eventos).toHaveLength(1);
    expect(eventos[0].texto).toContain("mensualidad");
    expect(eventos[0].texto).toContain("día de cobro");
    // repetir el mismo llamado (nada cambia) no debe crear un segundo evento
    expect((await editarProyecto(fd({ id: String(p.id), nombre: "PMS Hotel v2", mensualidad: "120", horasCotizadas: "170", fechaEntregaEstimada: "2026-11-30", diaCobroMensual: "7" }))).ok).toBe(true);
    expect(await prisma.evento.count({ where: { proyectoId: p.id, tipo: "proyecto_editado" } })).toBe(1);
    const r = await crearCliente(fd({ nombre: "Farmacia Sol", contactoNombre: "Ana", whatsapp: "0414 555 12 34", rif: "j-1234", instagram: "@farmasol" }));
    expect(r.ok).toBe(true);
    const cl = (await listarClientes("sol"))[0];
    expect(cl).toMatchObject({ nombre: "Farmacia Sol", whatsapp: "584145551234", instagram: "https://www.instagram.com/farmasol/", rif: "J-1234" });
  });
});
