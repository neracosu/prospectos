// src/lib/prospectos.ts — consultas de pantalla. Las escrituras van en acciones/.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ordenarCola } from "@/lib/cola-contrato";
import { ETAPAS, type Etapa } from "@/lib/embudo-contrato";
import { rellenar } from "@/lib/plantilla-mensaje";
import { enlacePropuesta, type ProspectoTarjeta } from "@/lib/prospectos-contrato";

const SELECT = {
  id: true, nombre: true, ciudad: true, nota: true, tipo: true, tamano: true, etapa: true, proximoSeguimiento: true, codigo: true,
  whatsapp: true, telefono: true, email: true, instagram: true, facebook: true, tiktok: true, ordenCola: true,
  nicho: { select: { nombre: true, slug: true, mensajeInicial: true, mensajeSeguimiento: true } },
} as const;

type FilaProspecto = Prisma.ProspectoGetPayload<{ select: typeof SELECT }>;

async function abrieron(ids: number[]): Promise<Set<number>> {
  if (!ids.length) return new Set();
  const ev = await prisma.evento.findMany({ where: { prospectoId: { in: ids }, tipo: "abierto" }, select: { prospectoId: true }, distinct: ["prospectoId"] });
  return new Set(ev.map((e) => e.prospectoId));
}

function aTarjeta(f: FilaProspecto, abrio: boolean, plantilla: "inicial" | "seguimiento"): ProspectoTarjeta & { ordenCola: number } {
  const enlace = enlacePropuesta(f.codigo);
  const base = plantilla === "inicial" ? f.nicho.mensajeInicial : f.nicho.mensajeSeguimiento;
  return {
    id: f.id, nombre: f.nombre, ciudad: f.ciudad, nichoNombre: f.nicho.nombre, nichoSlug: f.nicho.slug, nota: f.nota, tipo: f.tipo, tamano: f.tamano,
    etapa: f.etapa as Etapa, proximoSeguimiento: f.proximoSeguimiento, abrio, codigo: f.codigo, enlace,
    mensaje: rellenar(base, { nombre: f.nombre, enlace }),
    whatsapp: f.whatsapp, telefono: f.telefono, email: f.email, instagram: f.instagram, facebook: f.facebook, tiktok: f.tiktok, ordenCola: f.ordenCola,
  };
}

export async function colaDelDia(limite = 10): Promise<ProspectoTarjeta[]> {
  const filas = await prisma.prospecto.findMany({ where: { etapa: "por_contactar" }, select: SELECT, orderBy: { ordenCola: "asc" }, take: 500 });
  return ordenarCola(filas.map((f) => aTarjeta(f, false, "inicial"))).slice(0, limite);
}

export async function seguimientosQueTocan(hoy: string): Promise<ProspectoTarjeta[]> {
  const filas = await prisma.prospecto.findMany({
    where: { etapa: "enviado", proximoSeguimiento: { lte: hoy } }, select: SELECT, orderBy: { proximoSeguimiento: "asc" }, take: 50,
  });
  const ab = await abrieron(filas.map((f) => f.id));
  return filas.map((f) => aTarjeta(f, ab.has(f.id), "seguimiento"));
}

export async function resumenHoy(hoy: string): Promise<{ embudo: Record<Etapa, number>; porUsuario: { id: number; nombre: string; enviados: number; meta: number }[] }> {
  const grupos = await prisma.prospecto.groupBy({ by: ["etapa"], _count: { _all: true } });
  const embudo = Object.fromEntries(ETAPAS.map((e) => [e, 0])) as Record<Etapa, number>;
  for (const g of grupos) if (g.etapa in embudo) embudo[g.etapa as Etapa] = g._count._all;
  // Enviados de hoy (dia de Caracas): eventos `enviado` entre 00:00 y 24:00 Caracas.
  const desde = new Date(`${hoy}T00:00:00-04:00`), hasta = new Date(`${hoy}T23:59:59.999-04:00`);
  const usuarios = await prisma.usuario.findMany({ where: { activo: true, rol: { in: ["dueno", "prospectador"] } }, select: { id: true, nombre: true, metaDiaria: true } });
  const enviados = await prisma.evento.groupBy({ by: ["usuarioId"], where: { tipo: "enviado", creadoEn: { gte: desde, lte: hasta } }, _count: { _all: true } });
  const porUsuario = usuarios.map((u) => ({ id: u.id, nombre: u.nombre, meta: u.metaDiaria, enviados: enviados.find((e) => e.usuarioId === u.id)?._count._all ?? 0 }));
  return { embudo, porUsuario };
}

export async function buscarProspectos(f: { q?: string; nichoId?: number; etapa?: Etapa }): Promise<ProspectoTarjeta[]> {
  const q = f.q?.trim();
  const filas = await prisma.prospecto.findMany({
    where: {
      ...(f.nichoId ? { nichoId: f.nichoId } : {}),
      ...(f.etapa ? { etapa: f.etapa } : {}),
      ...(q ? { OR: [{ nombre: { contains: q } }, { ciudad: { contains: q } }, { whatsapp: { contains: q } }, { telefono: { contains: q } }] } : {}),
    },
    select: SELECT, orderBy: [{ etapa: "asc" }, { nombre: "asc" }], take: 100,
  });
  const ab = await abrieron(filas.map((x) => x.id));
  return filas.map((x) => aTarjeta(x, ab.has(x.id), x.etapa === "por_contactar" ? "inicial" : "seguimiento"));
}

export type EventoFila = { id: number; tipo: string; de: string; a: string; canal: string; texto: string; creadoEn: Date; usuarioNombre: string };

export async function fichaProspecto(id: number): Promise<(ProspectoTarjeta & { fuentes: string[]; historial: EventoFila[] }) | null> {
  const f = await prisma.prospecto.findUnique({ where: { id }, select: { ...SELECT, fuentes: true } });
  if (!f) return null;
  const eventos = await prisma.evento.findMany({ where: { prospectoId: id }, orderBy: { creadoEn: "desc" }, take: 200, include: { usuario: { select: { nombre: true } } } });
  const ab = await abrieron([id]);
  const t = aTarjeta(f, ab.has(id), f.etapa === "por_contactar" ? "inicial" : "seguimiento");
  return {
    ...t, fuentes: Array.isArray(f.fuentes) ? (f.fuentes as string[]) : [],
    historial: eventos.map((e) => ({ id: e.id, tipo: e.tipo, de: e.de, a: e.a, canal: e.canal, texto: e.texto, creadoEn: e.creadoEn, usuarioNombre: e.usuario?.nombre ?? "" })),
  };
}

export async function listarNichos(): Promise<{ id: number; slug: string; nombre: string }[]> {
  return prisma.nicho.findMany({ select: { id: true, slug: true, nombre: true }, orderBy: { nombre: "asc" } });
}
