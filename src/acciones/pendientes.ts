"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { exigirRol } from "@/lib/sesion";
import { esFechaIso } from "@/lib/fecha-caracas";
import { fallo, exito, type Resultado } from "@/acciones/resultado";

// exigirRol("dueno") FUERA del try/catch. Un pendiente es un item de lista: es lo unico
// de la pieza que si se elimina.
const ERROR = "No se pudo guardar. Intenta de nuevo.";
const Id = z.number().int().positive();
const refrescar = (proyectoId: number) => { revalidatePath(`/proyectos/${proyectoId}`); revalidatePath("/proyectos"); };

const NuevoZ = z.object({
  proyectoId: z.coerce.number().int().positive(),
  texto: z.string().trim().min(2).max(200),
  visibleCliente: z.string().optional(),
  fechaEstimada: z.string().trim().optional().transform((s) => (s ? s : undefined)).refine((s) => !s || esFechaIso(s), "fecha"),
});
export async function agregarPendiente(formData: FormData): Promise<Resultado<{ id: number }>> {
  await exigirRol("dueno");
  const e = NuevoZ.safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("Escribe el pendiente (2 a 200 letras) y una fecha válida si la pones.");
  const d = e.data;
  try {
    const max = await prisma.pendiente.aggregate({ where: { proyectoId: d.proyectoId }, _max: { orden: true } });
    const p = await prisma.pendiente.create({ data: { proyectoId: d.proyectoId, texto: d.texto, visibleCliente: d.visibleCliente === "on", fechaEstimada: d.fechaEstimada ?? null, orden: (max._max.orden ?? 0) + 1 }, select: { id: true } });
    refrescar(d.proyectoId);
    return exito({ id: p.id });
  } catch (err) { console.error("agregarPendiente", err); return fallo(ERROR); }
}

export async function marcarPendiente(id: number, hecho: boolean): Promise<Resultado> {
  const u = await exigirRol("dueno");
  const e = z.object({ id: Id, hecho: z.boolean() }).safeParse({ id, hecho });
  if (!e.success) return fallo(ERROR);
  try {
    const p = await prisma.pendiente.findUnique({ where: { id: e.data.id } });
    if (!p) return fallo("Ese pendiente ya no existe.");
    // Update y evento van juntos: un hito visible nunca queda cumplido sin su rastro.
    await prisma.$transaction(async (tx) => {
      const r = await tx.pendiente.updateMany({ where: { id: p.id, hecho: !e.data.hecho }, data: { hecho: e.data.hecho, hechoEn: e.data.hecho ? new Date() : null } });
      if (r.count === 1 && e.data.hecho && p.visibleCliente) await tx.evento.create({ data: { proyectoId: p.proyectoId, usuarioId: u.id, tipo: "hito_cumplido", texto: p.texto } });
    });
    refrescar(p.proyectoId);
    return exito();
  } catch (err) { console.error("marcarPendiente", err); return fallo(ERROR); }
}

export async function alternarVisible(id: number): Promise<Resultado> {
  await exigirRol("dueno");
  const e = Id.safeParse(id);
  if (!e.success) return fallo(ERROR);
  try {
    const p = await prisma.pendiente.findUnique({ where: { id: e.data } });
    if (!p) return fallo("Ese pendiente ya no existe.");
    await prisma.pendiente.update({ where: { id: p.id }, data: { visibleCliente: !p.visibleCliente } });
    refrescar(p.proyectoId);
    return exito();
  } catch (err) { console.error("alternarVisible", err); return fallo(ERROR); }
}

export async function moverPendiente(id: number, direccion: "arriba" | "abajo"): Promise<Resultado> {
  await exigirRol("dueno");
  const e = z.object({ id: Id, direccion: z.enum(["arriba", "abajo"]) }).safeParse({ id, direccion });
  if (!e.success) return fallo(ERROR);
  try {
    const p = await prisma.pendiente.findUnique({ where: { id: e.data.id } });
    if (!p) return fallo("Ese pendiente ya no existe.");
    const vecino = await prisma.pendiente.findFirst({
      where: { proyectoId: p.proyectoId, orden: e.data.direccion === "arriba" ? { lt: p.orden } : { gt: p.orden } },
      orderBy: { orden: e.data.direccion === "arriba" ? "desc" : "asc" },
    });
    if (!vecino) return exito(); // ya esta en el extremo
    await prisma.$transaction([
      prisma.pendiente.update({ where: { id: p.id }, data: { orden: vecino.orden } }),
      prisma.pendiente.update({ where: { id: vecino.id }, data: { orden: p.orden } }),
    ]);
    refrescar(p.proyectoId);
    return exito();
  } catch (err) { console.error("moverPendiente", err); return fallo(ERROR); }
}

export async function eliminarPendiente(id: number): Promise<Resultado> {
  await exigirRol("dueno");
  const e = Id.safeParse(id);
  if (!e.success) return fallo(ERROR);
  try {
    const p = await prisma.pendiente.findUnique({ where: { id: e.data }, select: { proyectoId: true } });
    if (!p) return exito();
    await prisma.pendiente.delete({ where: { id: e.data } });
    refrescar(p.proyectoId);
    return exito();
  } catch (err) { console.error("eliminarPendiente", err); return fallo(ERROR); }
}
