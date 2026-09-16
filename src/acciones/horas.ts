"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { exigirRol } from "@/lib/sesion";
import { hoyCaracas, esFechaIso } from "@/lib/fecha-caracas";
import { fallo, exito, type Resultado } from "@/acciones/resultado";

// Horas: control interno del dueno. Nunca salen al portal del cliente (pieza 5).
const ERROR = "No se pudo guardar. Intenta de nuevo.";
const HORAS = /^\d{1,3}([.,](25|5|50|75|0|00))?$/; // pasos de 0.25

const NuevoZ = z.object({
  proyectoId: z.coerce.number().int().positive(),
  fecha: z.string().trim().refine(esFechaIso, "fecha"),
  horas: z.string().trim().regex(HORAS),
  descripcion: z.string().trim().min(1).max(300),
});
export async function registrarHoras(formData: FormData): Promise<Resultado> {
  const u = await exigirRol("dueno");
  const e = NuevoZ.safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("Horas en pasos de 0,25 (0,25 · 0,5 · 0,75 · 1 …), fecha válida y qué hiciste.");
  const d = e.data;
  const horas = Number(d.horas.replace(",", "."));
  if (horas < 0.25) return fallo("Mínimo 0,25 horas.");
  if (d.fecha > hoyCaracas()) return fallo("La fecha no puede ser futura.");
  try {
    await prisma.horas.create({ data: { proyectoId: d.proyectoId, fecha: d.fecha, horas: new Prisma.Decimal(horas.toFixed(2)), descripcion: d.descripcion, usuarioId: u.id } });
    await prisma.evento.create({ data: { proyectoId: d.proyectoId, usuarioId: u.id, tipo: "horas", texto: `${horas} h: ${d.descripcion}` } });
    revalidatePath(`/proyectos/${d.proyectoId}`);
    return exito();
  } catch (err) { console.error("registrarHoras", err); return fallo(ERROR); }
}

// Solo se borra el mismo dia de Caracas en que se registro (error de tipeo). Despues queda.
export async function eliminarHoras(id: number): Promise<Resultado> {
  await exigirRol("dueno");
  const e = z.number().int().positive().safeParse(id);
  if (!e.success) return fallo(ERROR);
  try {
    const h = await prisma.horas.findUnique({ where: { id: e.data } });
    if (!h) return exito();
    const desde = new Date(`${hoyCaracas()}T00:00:00-04:00`);
    if (h.creadoEn < desde) return fallo("Solo se borra el mismo día que se registró.");
    await prisma.horas.delete({ where: { id: e.data } });
    revalidatePath(`/proyectos/${h.proyectoId}`);
    return exito();
  } catch (err) { console.error("eliminarHoras", err); return fallo(ERROR); }
}
