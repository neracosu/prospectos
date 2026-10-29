"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { exigirRol } from "@/lib/sesion";
import { permitirIntento } from "@/lib/rate-limit";
import { GANCHO_MAX, normalizarCorreo, type EstadoFicha } from "@/lib/ficha-contrato";
import { guardarFicha, investigarProspecto, marcarAlAutomatico } from "@/lib/fichas";
import { enviarA, enviadosHoy } from "@/lib/correos";
import { leerCorreosPorDia } from "@/lib/configuracion";
import { hoyCaracas } from "@/lib/fecha-caracas";
import { fallo, exito, type Resultado } from "@/acciones/resultado";

// exigirRol() va FUERA del try/catch (redirige lanzando). Cada funcion exportada
// de aqui es un endpoint publico: nada de auxiliares exportados.

const Id = z.number().int().positive();
const ERROR = "No se pudo guardar. Intenta de nuevo.";
const ERROR_GANCHO = `El gancho va en una sola línea, sin HTML, de hasta ${GANCHO_MAX} caracteres.`;
const RESUMEN_MAX = 1000;
const GanchoZ = z.string().trim().max(GANCHO_MAX).regex(/^[^<>\r\n]*$/);
const ResumenZ = z.string().trim().max(RESUMEN_MAX);

function refrescar(id: number) {
  revalidatePath("/correos"); revalidatePath(`/prospectos/${id}`); revalidatePath("/inicio");
}

export async function guardarGancho(prospectoId: number, fd: FormData): Promise<Resultado> {
  const u = await exigirRol("dueno");
  const eId = Id.safeParse(prospectoId);
  if (!eId.success) return fallo("Ese prospecto no existe.");
  const g = GanchoZ.safeParse(String(fd.get("gancho") ?? ""));
  if (!g.success) return fallo(ERROR_GANCHO);
  const r = ResumenZ.safeParse(String(fd.get("resumen") ?? ""));
  if (!r.success) return fallo(`El resumen puede tener hasta ${RESUMEN_MAX} caracteres.`);
  try {
    const existe = await prisma.prospecto.findUnique({ where: { id: eId.data }, select: { id: true } });
    if (!existe) return fallo("Ese prospecto no existe.");
    await guardarFicha(eId.data, { gancho: g.data, resumen: r.data }, u.id);
    refrescar(eId.data);
    return exito();
  } catch {
    return fallo(ERROR);
  }
}

export async function reinvestigar(prospectoId: number): Promise<Resultado<{ estado: EstadoFicha }>> {
  const u = await exigirRol("dueno");
  const eId = Id.safeParse(prospectoId);
  if (!eId.success) return fallo("Ese prospecto no existe.");
  if (!permitirIntento(`reinvestigar:${eId.data}`, 1, 60_000)) return fallo("Espere un minuto antes de volver a investigar este negocio.");
  try {
    const existe = await prisma.prospecto.findUnique({ where: { id: eId.data }, select: { id: true } });
    if (!existe) return fallo("Ese prospecto no existe.");
    const f = await investigarProspecto(eId.data, { usuarioId: u.id });
    refrescar(eId.data);
    return exito({ estado: f.estado });
  } catch {
    return fallo("No se pudo investigar el negocio. Intenta de nuevo en un rato.");
  }
}

export async function bloquearCorreo(prospectoId: number, motivo: "no_quiere" | "rebote"): Promise<Resultado> {
  const u = await exigirRol("dueno");
  const eId = Id.safeParse(prospectoId);
  if (!eId.success) return fallo("Ese prospecto no existe.");
  const eMotivo = z.enum(["no_quiere", "rebote"]).safeParse(motivo);
  if (!eMotivo.success) return fallo("Motivo no válido.");
  try {
    const p = await prisma.prospecto.findUnique({ where: { id: eId.data }, select: { email: true } });
    if (!p) return fallo("Ese prospecto no existe.");
    const email = normalizarCorreo(p.email).slice(0, 120);
    if (!email) return fallo("Este prospecto no tiene correo que bloquear.");
    await prisma.$transaction([
      prisma.correoBloqueado.upsert({ where: { email }, create: { email, motivo: eMotivo.data }, update: { motivo: eMotivo.data } }),
      prisma.evento.create({ data: { prospectoId: eId.data, usuarioId: u.id, tipo: "correo_bloqueado", texto: `${email} (${eMotivo.data})` } }),
    ]);
    refrescar(eId.data);
    return exito();
  } catch {
    return fallo(ERROR);
  }
}

export async function ponerAlAutomatico(prospectoId: number, si: boolean): Promise<Resultado> {
  await exigirRol("dueno");
  const eId = Id.safeParse(prospectoId);
  if (!eId.success || typeof si !== "boolean") return fallo("Ese prospecto no existe.");
  try {
    const existe = await prisma.prospecto.findUnique({ where: { id: eId.data }, select: { id: true } });
    if (!existe) return fallo("Ese prospecto no existe.");
    await marcarAlAutomatico(eId.data, si);
    refrescar(eId.data);
    return exito();
  } catch {
    return fallo(ERROR);
  }
}

export async function enviarPropuestaCorreo(prospectoId: number, reenviar = false): Promise<Resultado<{ token: string }>> {
  const u = await exigirRol("dueno");
  const eId = Id.safeParse(prospectoId);
  if (!eId.success || typeof reenviar !== "boolean") return fallo("Ese prospecto no existe.");
  try {
    const tope = await leerCorreosPorDia();
    const n = await enviadosHoy(hoyCaracas());
    if (n >= tope) return fallo(`Hoy ya salieron ${n} de ${tope}. Suba el tope en Ajustes o espere a mañana.`);
    const r = await enviarA(eId.data, "inicial", u.id, { reenviar });
    if (r.ok) refrescar(eId.data);
    return r;
  } catch (err) {
    console.error("enviarPropuestaCorreo", err);
    return fallo("No se pudo enviar. Intente de nuevo.");
  }
}
