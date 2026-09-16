// src/acciones/proyectos.ts
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { exigirRol } from "@/lib/sesion";
import { esFechaIso, hoyCaracas } from "@/lib/fecha-caracas";
import { MONTO_TEXTO, montoDesdeTexto, formatoUSD } from "@/lib/dinero";
import { generarCuotas } from "@/lib/cobros-contrato";
import { ESTADOS_PROYECTO, puedePasarProyecto, type EstadoProyecto } from "@/lib/proyectos-contrato";
import { clienteDesdeProspecto } from "@/lib/clientes";
import { fallo, exito, type Resultado } from "@/acciones/resultado";

// exigirRol("dueno") va FUERA del try/catch. Cada export es un endpoint publico.
const ERROR = "No se pudo guardar. Intenta de nuevo.";
const Monto = z.string().trim().regex(MONTO_TEXTO);
const Fecha = z.string().trim().refine(esFechaIso, "fecha");
const Id = z.number().int().positive();

function refrescar(id?: number) {
  revalidatePath("/proyectos"); revalidatePath("/hoy"); revalidatePath("/clientes");
  if (id) revalidatePath(`/proyectos/${id}`);
}

const NuevoZ = z.object({
  clienteId: z.coerce.number().int().positive().optional(),
  prospectoId: z.coerce.number().int().positive().optional(),
  nombre: z.string().trim().min(2).max(120),
  nichoId: z.coerce.number().int().positive(),
  pagoUnico: Monto, mensualidad: Monto, horasCotizadas: Monto,
  fechaInicio: Fecha,
  fechaEntregaEstimada: z.string().trim().optional().transform((s) => (s ? s : undefined)).refine((s) => !s || esFechaIso(s), "fecha"),
  diaCobroMensual: z.coerce.number().int().min(1).max(28),
  formaPago: z.enum(["completo", "cuotas"]),
  cuotas: z.coerce.number().int().min(2).max(12).optional(),
  propuestaCodigo: z.string().trim().max(30).default(""),
}).refine((d) => d.clienteId || d.prospectoId, "cliente").refine((d) => d.formaPago !== "cuotas" || d.cuotas, "cuotas");

export async function crearProyecto(formData: FormData): Promise<Resultado<{ id: number }>> {
  const u = await exigirRol("dueno");
  const e = NuevoZ.safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("Revisa nombre, montos (números con hasta 2 decimales), fechas y día de cobro (1 a 28).");
  const d = e.data;
  const pagoUnico = montoDesdeTexto(d.pagoUnico)!;
  // Sin pago unico, el proyecto puede ser solo-mensualidad; pero no hay como repartir
  // en cuotas un monto de cero.
  if (d.formaPago === "cuotas" && pagoUnico === 0) return fallo("Sin pago único no hay cuotas.");
  const cuotas = pagoUnico === 0 ? [] : generarCuotas(pagoUnico, d.formaPago === "cuotas" ? d.cuotas! : 1, d.fechaInicio);
  try {
    const clienteId = d.clienteId ?? (await clienteDesdeProspecto(d.prospectoId!)).id;
    const p = await prisma.proyecto.create({
      data: {
        clienteId, nombre: d.nombre, nichoId: d.nichoId, pagoUnico: new Prisma.Decimal(d.pagoUnico.replace(",", ".")), mensualidad: new Prisma.Decimal(d.mensualidad.replace(",", ".")),
        horasCotizadas: new Prisma.Decimal(d.horasCotizadas.replace(",", ".")), fechaInicio: d.fechaInicio, fechaEntregaEstimada: d.fechaEntregaEstimada ?? null,
        diaCobroMensual: d.diaCobroMensual, propuestaCodigo: d.propuestaCodigo,
        ...(cuotas.length ? { cobros: { create: cuotas.map((c) => ({ concepto: cuotas.length === 1 ? "pago_unico" : "cuota", detalle: c.detalle, monto: new Prisma.Decimal(c.monto.toFixed(2)), vence: c.vence })) } } : {}),
        eventos: { create: { tipo: "proyecto_creado", usuarioId: u.id, texto: cuotas.length === 0 ? "sin pago único" : d.formaPago === "cuotas" ? `${cuotas.length} cuotas` : "pago único" } },
      },
      select: { id: true },
    });
    refrescar(p.id);
    return exito({ id: p.id });
  } catch (err) {
    if (err instanceof Error && err.message === "PROSPECTO_NO_GANADO") return fallo("Ese prospecto no está en «Ganado».");
    console.error("crearProyecto", err); return fallo(ERROR);
  }
}

export async function cambiarEstadoProyecto(proyectoId: number, a: EstadoProyecto, motivo = ""): Promise<Resultado> {
  const u = await exigirRol("dueno");
  const e = z.object({ id: Id, a: z.enum(ESTADOS_PROYECTO), motivo: z.string().trim().max(300) }).safeParse({ id: proyectoId, a, motivo });
  if (!e.success) return fallo("Estado inválido.");
  if (e.data.a === "cerrado" && e.data.motivo.length < 2) return fallo("Escribe por qué se cierra.");
  try {
    const p = await prisma.proyecto.findUnique({ where: { id: e.data.id }, select: { estado: true } });
    if (!p) return fallo("Ese proyecto no existe.");
    const de = p.estado as EstadoProyecto;
    if (!puedePasarProyecto(de, e.data.a)) return fallo(`No se puede pasar de «${de}» a «${e.data.a}».`);
    // El estado y su evento se escriben juntos: si uno falla, el otro tampoco queda.
    await prisma.$transaction(async (tx) => {
      const r = await tx.proyecto.updateMany({ where: { id: e.data.id, estado: de }, data: { estado: e.data.a, ...(e.data.a === "entregado" ? { fechaEntregaReal: hoyCaracas() } : {}) } });
      if (r.count === 0) throw new Error("ESTADO_CAMBIO_CONCURRENTE");
      await tx.evento.create({ data: { proyectoId: e.data.id, usuarioId: u.id, tipo: "proyecto_estado", texto: `${de} → ${e.data.a}${e.data.motivo ? `: ${e.data.motivo}` : ""}` } });
    });
    refrescar(e.data.id);
    return exito();
  } catch (err) {
    if (err instanceof Error && err.message === "ESTADO_CAMBIO_CONCURRENTE") return fallo("Alguien más acaba de cambiar este proyecto. Recarga.");
    console.error("cambiarEstadoProyecto", err); return fallo(ERROR);
  }
}

const EditarZ = z.object({
  id: z.coerce.number().int().positive(), nombre: z.string().trim().min(2).max(120), mensualidad: Monto, horasCotizadas: Monto,
  fechaEntregaEstimada: z.string().trim().optional().transform((s) => (s ? s : undefined)).refine((s) => !s || esFechaIso(s), "fecha"),
  diaCobroMensual: z.coerce.number().int().min(1).max(28),
});
export async function editarProyecto(formData: FormData): Promise<Resultado> {
  const u = await exigirRol("dueno");
  const e = EditarZ.safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("Revisa nombre, montos, fecha y día de cobro (1 a 28).");
  const d = e.data;
  try {
    const actual = await prisma.proyecto.findUnique({ where: { id: d.id }, select: { nombre: true, mensualidad: true, horasCotizadas: true, fechaEntregaEstimada: true, diaCobroMensual: true } });
    if (!actual) return fallo("Ese proyecto no existe.");
    const mensualidadNueva = Number(d.mensualidad.replace(",", "."));
    const horasNuevas = Number(d.horasCotizadas.replace(",", "."));
    const entregaNueva = d.fechaEntregaEstimada ?? null;
    // Solo se deja rastro de lo que de verdad cambio; nada de "editado" sin decir que.
    const cambios: string[] = [];
    if (actual.nombre !== d.nombre) cambios.push(`nombre: ${actual.nombre} → ${d.nombre}`);
    if (Number(actual.mensualidad) !== mensualidadNueva) cambios.push(`mensualidad: ${formatoUSD(Number(actual.mensualidad))} → ${formatoUSD(mensualidadNueva)}`);
    if (Number(actual.horasCotizadas) !== horasNuevas) cambios.push(`horas: ${Number(actual.horasCotizadas)} → ${horasNuevas}`);
    if ((actual.fechaEntregaEstimada ?? null) !== entregaNueva) cambios.push(`entrega: ${actual.fechaEntregaEstimada ?? "—"} → ${entregaNueva ?? "—"}`);
    if (actual.diaCobroMensual !== d.diaCobroMensual) cambios.push(`día de cobro: ${actual.diaCobroMensual} → ${d.diaCobroMensual}`);
    if (cambios.length === 0) return exito();
    const texto = cambios.join(" · ");
    // Update y evento van juntos: si el evento fallara, el cambio tampoco queda a medias.
    await prisma.$transaction([
      // Cambiar diaCobroMensual no toca cobros ya generados (aplica desde el mes siguiente).
      prisma.proyecto.update({ where: { id: d.id }, data: { nombre: d.nombre, mensualidad: new Prisma.Decimal(d.mensualidad.replace(",", ".")), horasCotizadas: new Prisma.Decimal(d.horasCotizadas.replace(",", ".")), fechaEntregaEstimada: entregaNueva, diaCobroMensual: d.diaCobroMensual } }),
      prisma.evento.create({ data: { proyectoId: d.id, usuarioId: u.id, tipo: "proyecto_editado", texto } }),
    ]);
    refrescar(d.id);
    return exito();
  } catch (err) { console.error("editarProyecto", err); return fallo(ERROR); }
}
