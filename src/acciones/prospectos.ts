"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { exigirSesion } from "@/lib/sesion";
import { CANALES, type Canal } from "@/lib/canales-contrato";
import { ETAPAS, puedePasar, type Etapa } from "@/lib/embudo-contrato";
import { hoyCaracas, sumarDias, esFechaIso } from "@/lib/fecha-caracas";
import { normalizarCelular, normalizarRed } from "@/lib/celular-contrato";
import { claveProspecto } from "@/lib/clave-prospecto";
import { generarCodigo } from "@/lib/codigo";
import { fallo, exito, type Resultado } from "@/acciones/resultado";

// exigirSesion() va FUERA del try/catch (redirige lanzando). Cada funcion
// exportada de aqui es un endpoint publico: nada de auxiliares exportados.

const Id = z.number().int().positive();
const CanalZ = z.enum(CANALES);
const EtapaZ = z.enum(ETAPAS);
const ERROR = "No se pudo guardar. Intenta de nuevo.";

function refrescar(id?: number) {
  revalidatePath("/hoy"); revalidatePath("/prospectos");
  if (id) revalidatePath(`/prospectos/${id}`);
}

async function nichoDe(id: number) {
  return prisma.prospecto.findUnique({ where: { id }, select: { etapa: true, nicho: { select: { diasSeguimiento: true } } } });
}

export async function marcarEnviado(prospectoId: number, canal: Canal): Promise<Resultado> {
  const u = await exigirSesion();
  const e = z.object({ id: Id, canal: CanalZ }).safeParse({ id: prospectoId, canal });
  if (!e.success) return fallo("Ese canal no existe.");
  try {
    const p = await nichoDe(e.data.id);
    if (!p) return fallo("Ese prospecto ya no existe.");
    const hoy = hoyCaracas();
    // Condicionado a la etapa leida: dos toques no cuentan dos envios.
    const r = await prisma.prospecto.updateMany({
      where: { id: e.data.id, etapa: "por_contactar" },
      data: { etapa: "enviado", proximoSeguimiento: sumarDias(hoy, p.nicho.diasSeguimiento) },
    });
    if (r.count === 0) return fallo("Ya estaba marcado como enviado.");
    await prisma.evento.create({ data: { prospectoId: e.data.id, usuarioId: u.id, tipo: "enviado", de: "por_contactar", a: "enviado", canal: e.data.canal } });
    refrescar(e.data.id);
    return exito();
  } catch (err) {
    console.error("marcarEnviado", err);
    return fallo(ERROR);
  }
}

export async function saltar(prospectoId: number): Promise<Resultado> {
  const u = await exigirSesion();
  const e = Id.safeParse(prospectoId);
  if (!e.success) return fallo(ERROR);
  try {
    const max = await prisma.prospecto.aggregate({ _max: { ordenCola: true } });
    await prisma.prospecto.update({ where: { id: e.data }, data: { ordenCola: (max._max.ordenCola ?? 0) + 1 } });
    await prisma.evento.create({ data: { prospectoId: e.data, usuarioId: u.id, tipo: "saltado" } });
    refrescar();
    return exito();
  } catch (err) {
    console.error("saltar", err);
    return fallo(ERROR);
  }
}

export async function escribirDeNuevo(prospectoId: number, canal: Canal): Promise<Resultado> {
  const u = await exigirSesion();
  const e = z.object({ id: Id, canal: CanalZ }).safeParse({ id: prospectoId, canal });
  if (!e.success) return fallo("Ese canal no existe.");
  try {
    const p = await nichoDe(e.data.id);
    if (!p || p.etapa !== "enviado") return fallo("Solo se reenvía a un prospecto en «Enviado».");
    await prisma.prospecto.update({ where: { id: e.data.id }, data: { proximoSeguimiento: sumarDias(hoyCaracas(), p.nicho.diasSeguimiento) } });
    await prisma.evento.create({ data: { prospectoId: e.data.id, usuarioId: u.id, tipo: "seguimiento", canal: e.data.canal } });
    refrescar(e.data.id);
    return exito();
  } catch (err) {
    console.error("escribirDeNuevo", err);
    return fallo(ERROR);
  }
}

async function pasarA(usuarioId: number, id: number, a: Etapa, texto = ""): Promise<Resultado> {
  const p = await prisma.prospecto.findUnique({ where: { id }, select: { etapa: true } });
  if (!p) return fallo("Ese prospecto ya no existe.");
  const de = p.etapa as Etapa;
  if (!puedePasar(de, a)) return fallo(`No se puede pasar de «${de}» a «${a}».`);
  const r = await prisma.prospecto.updateMany({ where: { id, etapa: de }, data: { etapa: a, ...(a === "respondio" || a === "ganado" || a === "descartado" ? { proximoSeguimiento: null } : {}) } });
  if (r.count === 0) return fallo("Alguien más acaba de cambiar este prospecto. Recarga.");
  await prisma.evento.create({ data: { prospectoId: id, usuarioId, tipo: "etapa", de, a, texto } });
  refrescar(id);
  return exito();
}

export async function marcarRespondio(prospectoId: number): Promise<Resultado> {
  const u = await exigirSesion();
  const e = Id.safeParse(prospectoId);
  if (!e.success) return fallo(ERROR);
  try { return await pasarA(u.id, e.data, "respondio"); } catch (err) { console.error("marcarRespondio", err); return fallo(ERROR); }
}

export async function descartar(prospectoId: number, motivo: string): Promise<Resultado> {
  const u = await exigirSesion();
  const e = z.object({ id: Id, motivo: z.string().trim().min(2).max(300) }).safeParse({ id: prospectoId, motivo });
  if (!e.success) return fallo("Escribe el motivo.");
  try { return await pasarA(u.id, e.data.id, "descartado", e.data.motivo); } catch (err) { console.error("descartar", err); return fallo(ERROR); }
}

export async function cambiarEtapa(prospectoId: number, a: Etapa, motivo = ""): Promise<Resultado> {
  const u = await exigirSesion();
  const e = z.object({ id: Id, a: EtapaZ, motivo: z.string().trim().max(300) }).safeParse({ id: prospectoId, a, motivo });
  if (!e.success) return fallo("Etapa inválida.");
  if (e.data.a === "descartado" && e.data.motivo.length < 2) return fallo("Escribe el motivo.");
  if (e.data.a === "enviado") return fallo("Para marcar enviado usa el botón de envío.");
  try { return await pasarA(u.id, e.data.id, e.data.a, e.data.motivo); } catch (err) { console.error("cambiarEtapa", err); return fallo(ERROR); }
}

export async function guardarNota(prospectoId: number, nota: string): Promise<Resultado> {
  const u = await exigirSesion();
  const e = z.object({ id: Id, nota: z.string().trim().max(2000) }).safeParse({ id: prospectoId, nota });
  if (!e.success) return fallo("La nota es muy larga.");
  try {
    await prisma.prospecto.update({ where: { id: e.data.id }, data: { nota: e.data.nota } });
    await prisma.evento.create({ data: { prospectoId: e.data.id, usuarioId: u.id, tipo: "nota", texto: e.data.nota.slice(0, 200) } });
    refrescar(e.data.id);
    return exito();
  } catch (err) { console.error("guardarNota", err); return fallo(ERROR); }
}

export async function editarSeguimiento(prospectoId: number, fecha: string): Promise<Resultado> {
  await exigirSesion();
  const e = Id.safeParse(prospectoId);
  if (!e.success) return fallo(ERROR);
  if (fecha !== "" && !esFechaIso(fecha)) return fallo("Fecha inválida.");
  try {
    await prisma.prospecto.update({ where: { id: e.data }, data: { proximoSeguimiento: fecha || null } });
    refrescar(e.data);
    return exito();
  } catch (err) { console.error("editarSeguimiento", err); return fallo(ERROR); }
}

const Nuevo = z.object({
  nichoId: z.coerce.number().int().positive(),
  nombre: z.string().trim().min(2).max(120),
  ciudad: z.string().trim().min(2).max(80),
  estado: z.string().trim().max(60).default(""),
  tipo: z.string().trim().max(60).default(""),
  tamano: z.string().trim().max(40).default(""),
  telefono: z.string().trim().max(80).default(""),
  whatsapp: z.string().trim().max(40).default(""),
  email: z.string().trim().max(120).default(""),
  web: z.string().trim().max(200).default(""),
  instagram: z.string().trim().max(200).default(""),
  facebook: z.string().trim().max(200).default(""),
  tiktok: z.string().trim().max(200).default(""),
  nota: z.string().trim().max(2000).default(""),
  fuente: z.string().trim().max(300).default(""),
});

export async function crearProspecto(formData: FormData): Promise<Resultado<{ id: number }>> {
  const u = await exigirSesion();
  const e = Nuevo.safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("Revisa nombre, ciudad y nicho.");
  const d = e.data;
  try {
    const p = await prisma.prospecto.create({
      data: {
        nichoId: d.nichoId, nombre: d.nombre, ciudad: d.ciudad, estado: d.estado, tipo: d.tipo, tamano: d.tamano, telefono: d.telefono,
        whatsapp: normalizarCelular(d.whatsapp) || normalizarCelular(d.telefono), email: d.email, web: d.web,
        instagram: normalizarRed(d.instagram, "instagram"), facebook: normalizarRed(d.facebook, "facebook"), tiktok: normalizarRed(d.tiktok, "tiktok"),
        nota: d.nota, fuentes: d.fuente ? [d.fuente] : [], origen: "manual", codigo: generarCodigo(), clave: claveProspecto(d.nombre, d.ciudad),
        ordenCola: ((await prisma.prospecto.aggregate({ _max: { ordenCola: true } }))._max.ordenCola ?? 0) + 1,
        eventos: { create: { tipo: "importado", usuarioId: u.id, texto: "manual" } },
      },
      select: { id: true },
    });
    refrescar(p.id);
    return exito({ id: p.id });
  } catch (err: any) {
    if (err?.code === "P2002") return fallo("Ya existe un prospecto con ese nombre en esa ciudad.");
    console.error("crearProspecto", err);
    return fallo(ERROR);
  }
}
