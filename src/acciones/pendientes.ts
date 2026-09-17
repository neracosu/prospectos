"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { exigirRol } from "@/lib/sesion";
import { esFechaIso } from "@/lib/fecha-caracas";
import { fallo, exito, type Resultado } from "@/acciones/resultado";
import { leerConfig, CLAVES } from "@/lib/configuracion";
import { enlaceWhatsappCobro } from "@/lib/mensajes-cobro";
import { enlaceSiTieneAcceso } from "@/lib/acceso-cliente";
import { mensajeAvisoHito, quienRecibe } from "@/lib/avisos-contrato";

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
      const r = await tx.pendiente.updateMany({ where: { id: p.id, hecho: !e.data.hecho }, data: { hecho: e.data.hecho, hechoEn: e.data.hecho ? new Date() : null, ...(e.data.hecho ? {} : { avisadoEn: null }) } });
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

// Aviso al cliente de un hito cumplido (pieza 5b). Como marcarAvisada de las versiones: se marca y se deja
// rastro en la misma transaccion, y un hito no se avisa dos veces (desmarcarlo le borra el aviso).
const HITO_YA_AVISADO = "HITO_YA_AVISADO";
export async function avisarHito(id: number): Promise<Resultado<{ href: string }>> {
  const u = await exigirRol("dueno");
  const e = Id.safeParse(id);
  if (!e.success) return fallo(ERROR);
  try {
    const p = await prisma.pendiente.findUnique({ where: { id: e.data }, include: { proyecto: { include: { cliente: true } } } });
    if (!p) return fallo("Ese pendiente ya no existe.");
    if (!p.hecho || !p.visibleCliente) return fallo("Solo se avisa un hito cumplido y visible al cliente.");
    const cliente = p.proyecto.cliente;
    // Sin WhatsApp no hay a quien avisar: se corta antes de marcar nada.
    if (!cliente.whatsapp) return fallo("El cliente no tiene WhatsApp cargado. Agrégalo en su ficha antes de avisar.");
    // El mensaje se arma ANTES de marcar nada: si leer la plantilla o el enlace fallara, no queda
    // avisado algo que nunca llego a abrir WhatsApp.
    const mensaje = mensajeAvisoHito(await leerConfig(CLAVES.avisoHito), { cliente: quienRecibe(cliente), proyecto: p.proyecto.nombre, hito: p.texto, enlace: await enlaceSiTieneAcceso(p.proyecto.clienteId) });
    // El whatsapp ya se valido arriba, asi que el enlace nunca sale nulo.
    const href = enlaceWhatsappCobro(cliente.whatsapp, mensaje)!;
    await prisma.$transaction(async (tx) => {
      const r = await tx.pendiente.updateMany({ where: { id: p.id, hecho: true, visibleCliente: true, avisadoEn: null }, data: { avisadoEn: new Date() } });
      if (r.count === 0) throw new Error(HITO_YA_AVISADO);
      await tx.evento.create({ data: { proyectoId: p.proyectoId, usuarioId: u.id, tipo: "aviso_cliente", canal: "whatsapp", texto: `hito: ${p.texto}` } });
    });
    refrescar(p.proyectoId);
    return exito({ href });
  } catch (err) {
    if (err instanceof Error && err.message === HITO_YA_AVISADO) return fallo("Este hito ya se avisó.");
    console.error("avisarHito", err); return fallo(ERROR);
  }
}
