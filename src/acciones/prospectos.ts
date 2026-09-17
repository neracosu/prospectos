"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { exigirSesion } from "@/lib/sesion";
import { CANALES, type Canal } from "@/lib/canales-contrato";
import { ETAPAS, ETIQUETA_ETAPA, puedePasar, type Etapa } from "@/lib/embudo-contrato";
import { hoyCaracas, sumarDias, esFechaIso } from "@/lib/fecha-caracas";
import { normalizarCelular, normalizarRed } from "@/lib/celular-contrato";
import { claveProspecto } from "@/lib/clave-prospecto";
import { TOPES } from "@/lib/tabla-contrato";
import { generarCodigo } from "@/lib/codigo";
import { fallo, exito, type Resultado } from "@/acciones/resultado";

// exigirSesion() va FUERA del try/catch (redirige lanzando). Cada funcion
// exportada de aqui es un endpoint publico: nada de auxiliares exportados.

const Id = z.number().int().positive();
const CanalZ = z.enum(CANALES);
const EtapaZ = z.enum(ETAPAS);
const ERROR = "No se pudo guardar. Intenta de nuevo.";
// Menos que esto entre dos "reenviar" es un doble toque, no un reenvio real.
const UMBRAL_DOBLE_TOQUE_MS = 2 * 60 * 1000;

function refrescar(id?: number) {
  revalidatePath("/hoy"); revalidatePath("/prospectos");
  if (id) revalidatePath(`/prospectos/${id}`);
}

async function nichoDe(id: number) {
  return prisma.prospecto.findUnique({ where: { id }, select: { etapa: true, nicho: { select: { diasSeguimiento: true } } } });
}

export async function marcarEnviado(prospectoId: number, canal: Canal): Promise<Resultado> {
  const u = await exigirSesion();
  const eId = Id.safeParse(prospectoId);
  if (!eId.success) return fallo("Ese prospecto no existe.");
  const eCanal = CanalZ.safeParse(canal);
  if (!eCanal.success) return fallo("Ese canal no existe.");
  try {
    const p = await nichoDe(eId.data);
    if (!p) return fallo("Ese prospecto ya no existe.");
    const hoy = hoyCaracas();
    // Condicionado a la etapa leida: dos toques no cuentan dos envios.
    const r = await prisma.prospecto.updateMany({
      where: { id: eId.data, etapa: "por_contactar" },
      data: { etapa: "enviado", proximoSeguimiento: sumarDias(hoy, p.nicho.diasSeguimiento) },
    });
    if (r.count === 0) {
      // Se releen la etapa actual: pudo cambiar entre la lectura de arriba y el updateMany.
      const actual = await prisma.prospecto.findUnique({ where: { id: eId.data }, select: { etapa: true } });
      const etapaActual = (actual?.etapa ?? p.etapa) as Etapa;
      if (etapaActual === "enviado") return fallo("Ya estaba marcado como enviado.");
      return fallo(`Este prospecto está en «${ETIQUETA_ETAPA[etapaActual]}».`);
    }
    await prisma.evento.create({ data: { prospectoId: eId.data, usuarioId: u.id, tipo: "enviado", de: "por_contactar", a: "enviado", canal: eCanal.data } });
    refrescar(eId.data);
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
    const p = await prisma.prospecto.findUnique({ where: { id: e.data }, select: { etapa: true } });
    if (!p) return fallo("Ese prospecto ya no existe.");
    const max = await prisma.prospecto.aggregate({ _max: { ordenCola: true } });
    // Condicionado a la etapa leida: no se salta un prospecto que ya no esta en la cola.
    const r = await prisma.prospecto.updateMany({
      where: { id: e.data, etapa: "por_contactar" },
      data: { ordenCola: (max._max.ordenCola ?? 0) + 1 },
    });
    if (r.count === 0) return fallo("Solo se salta a un prospecto por contactar.");
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
  const eId = Id.safeParse(prospectoId);
  if (!eId.success) return fallo("Ese prospecto no existe.");
  const eCanal = CanalZ.safeParse(canal);
  if (!eCanal.success) return fallo("Ese canal no existe.");
  try {
    // Todo dentro de una transaccion con SELECT ... FOR UPDATE: la decision
    // "es un doble toque o un reenvio real" lee la etapa, la fecha y el ultimo
    // evento, y ESCRIBE el nuevo evento, en el mismo tramo bloqueado por fila.
    // Un `updateMany` condicionado (como en marcarEnviado y saltar) no alcanza
    // aqui porque el update y la creacion del evento son dos sentencias distintas:
    // sin el candado, un segundo toque concurrente puede leer entre una y otra
    // y no ver el evento recien creado, duplicandolo.
    const resultado = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM Prospecto WHERE id = ${eId.data} FOR UPDATE`;
      const actual = await tx.prospecto.findUnique({
        where: { id: eId.data },
        select: { etapa: true, proximoSeguimiento: true, nicho: { select: { diasSeguimiento: true } } },
      });
      if (!actual) return fallo("Ese prospecto ya no existe.");
      if (actual.etapa !== "enviado") return fallo("Solo se reenvía a un prospecto en «Enviado».");
      const objetivo = sumarDias(hoyCaracas(), actual.nicho.diasSeguimiento);
      // Si la fecha ya esta en el objetivo, un doble toque y un reenvio real el
      // mismo dia se ven igual en la fila: se distinguen por la antiguedad del
      // ultimo evento de envio.
      let registrarEvento = actual.proximoSeguimiento !== objetivo;
      if (!registrarEvento) {
        const ultimo = await tx.evento.findFirst({
          where: { prospectoId: eId.data, tipo: { in: ["enviado", "seguimiento"] } },
          orderBy: { creadoEn: "desc" },
        });
        registrarEvento = !ultimo || Date.now() - ultimo.creadoEn.getTime() >= UMBRAL_DOBLE_TOQUE_MS;
      }
      await tx.prospecto.update({ where: { id: eId.data }, data: { proximoSeguimiento: objetivo } });
      if (registrarEvento) {
        await tx.evento.create({ data: { prospectoId: eId.data, usuarioId: u.id, tipo: "seguimiento", canal: eCanal.data } });
      }
      return exito();
    });
    if (resultado.ok) refrescar(eId.data);
    return resultado;
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
  const u = await exigirSesion();
  const e = Id.safeParse(prospectoId);
  if (!e.success) return fallo(ERROR);
  if (fecha !== "" && !esFechaIso(fecha)) return fallo("Fecha inválida.");
  try {
    // Condicionado a la etapa leida: un ganado/descartado concurrente no deja un
    // proximoSeguimiento colgado en una fila que ya no lo necesita.
    const r = await prisma.prospecto.updateMany({
      where: { id: e.data, etapa: { notIn: ["ganado", "descartado"] } },
      data: { proximoSeguimiento: fecha || null },
    });
    if (r.count === 0) {
      const actual = await prisma.prospecto.findUnique({ where: { id: e.data }, select: { etapa: true } });
      if (!actual) return fallo("Ese prospecto ya no existe.");
      return fallo("Un prospecto ganado o descartado no lleva seguimiento.");
    }
    await prisma.evento.create({
      data: { prospectoId: e.data, usuarioId: u.id, tipo: "nota", texto: fecha ? `Seguimiento movido a ${fecha}` : "Seguimiento quitado" },
    });
    refrescar(e.data);
    return exito();
  } catch (err) { console.error("editarSeguimiento", err); return fallo(ERROR); }
}

const Nuevo = z.object({
  nichoId: z.coerce.number().int().positive(),
  // Los tres que comparte con la importacion salen de TOPES (src/lib/tabla-contrato.ts).
  nombre: z.string().trim().min(2).max(TOPES.nombre),
  ciudad: z.string().trim().min(2).max(TOPES.ciudad),
  estado: z.string().trim().max(TOPES.estado).default(""),
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
  } catch (err: unknown) {
    const esDuplicado = typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
    if (esDuplicado) return fallo("Ya existe un prospecto con ese nombre en esa ciudad.");
    console.error("crearProspecto", err);
    return fallo(ERROR);
  }
}
