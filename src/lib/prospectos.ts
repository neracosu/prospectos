// src/lib/prospectos.ts — consultas de pantalla. Las escrituras van en acciones/.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ordenarCola } from "@/lib/cola-contrato";
import { ETAPAS, type Etapa } from "@/lib/embudo-contrato";
import { mensajeDeProspecto } from "@/lib/plantilla-mensaje";
import { fraseDePromo } from "@/lib/propuesta-contrato";
import { paisDeCiudad } from "@/lib/overpass-contrato";
import { MENSAJE_CO_INICIAL, MENSAJE_CO_SEGUIMIENTO } from "@/lib/colombia-contrato";
import { hoyCaracas } from "@/lib/fecha-caracas";
import { enlacePropuesta, type ProspectoTarjeta } from "@/lib/prospectos-contrato";
import { listaDeTextos, mapaDeTextos } from "@/lib/revision";

const SELECT = {
  id: true, nombre: true, ciudad: true, nota: true, web: true, tipo: true, tamano: true, etapa: true, proximoSeguimiento: true, codigo: true,
  whatsapp: true, telefono: true, email: true, instagram: true, facebook: true, tiktok: true, ordenCola: true,
  nicho: { select: { nombre: true, slug: true, mensajeInicial: true, mensajeSeguimiento: true, plantillaPropuesta: true } },
} as const;

type FilaProspecto = Prisma.ProspectoGetPayload<{ select: typeof SELECT }>;

async function abrieron(ids: number[]): Promise<Set<number>> {
  if (!ids.length) return new Set();
  const ev = await prisma.evento.findMany({ where: { prospectoId: { in: ids }, tipo: "abierto" }, select: { prospectoId: true }, distinct: ["prospectoId"] });
  // El where ya filtra por prospectoId en la lista (nunca null); se filtra aqui solo para el tipo.
  return new Set(ev.map((e) => e.prospectoId).filter((id): id is number => id !== null));
}

function aTarjeta(f: FilaProspecto, abrio: boolean, plantilla: "inicial" | "seguimiento"): ProspectoTarjeta & { ordenCola: number } {
  const enlace = enlacePropuesta(f.codigo);
  // A un prospecto de Colombia no se le manda la propuesta (esta escrita para Venezuela) ni el mensaje del nicho:
  // lleva el mensaje propio de colombia-contrato.ts.
  const co = paisDeCiudad(f.ciudad) === "CO";
  const tienePropuesta = !co && f.nicho.plantillaPropuesta !== "";
  const base = co
    ? (plantilla === "inicial" ? MENSAJE_CO_INICIAL : MENSAJE_CO_SEGUIMIENTO)
    : (plantilla === "inicial" ? f.nicho.mensajeInicial : f.nicho.mensajeSeguimiento);
  // Sin plantilla no hay enlace que ofrecer: se rellena {enlace} con vacio y
  // se recorta para que no quede un ": " o similar colgando en el mensaje.
  const mensaje = mensajeDeProspecto(base, { nombre: f.nombre, enlace: tienePropuesta ? enlace : "", promo: fraseDePromo(hoyCaracas()), ciudad: f.ciudad, rubro: f.nicho.nombre.toLowerCase() });
  return {
    id: f.id, nombre: f.nombre, ciudad: f.ciudad, nichoNombre: f.nicho.nombre, nichoSlug: f.nicho.slug, nota: f.nota, web: f.web, tipo: f.tipo, tamano: f.tamano,
    etapa: f.etapa as Etapa, proximoSeguimiento: f.proximoSeguimiento, abrio, codigo: f.codigo, enlace, tienePropuesta,
    mensaje,
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

export type FiltrosProspectos = { q?: string; nichoId?: number; etapa?: Etapa; ciudad?: string };
export const POR_PAGINA_PROSPECTOS = 100;

// Los mismos filtros para la lista y para los totales: lo que se cuenta es lo que se lista.
function whereDe(f: FiltrosProspectos): Prisma.ProspectoWhereInput {
  const q = f.q?.trim();
  return {
    ...(f.nichoId ? { nichoId: f.nichoId } : {}),
    ...(f.etapa ? { etapa: f.etapa } : {}),
    ...(f.ciudad ? { ciudad: f.ciudad } : {}),
    ...(q ? { OR: [{ nombre: { contains: q } }, { ciudad: { contains: q } }, { whatsapp: { contains: q } }, { telefono: { contains: q } }] } : {}),
  };
}

export async function buscarProspectos(f: FiltrosProspectos & { pagina?: number }): Promise<ProspectoTarjeta[]> {
  const pagina = Math.max(1, Math.trunc(f.pagina ?? 1) || 1);
  const filas = await prisma.prospecto.findMany({
    where: whereDe(f),
    select: SELECT, orderBy: [{ etapa: "asc" }, { nombre: "asc" }], skip: (pagina - 1) * POR_PAGINA_PROSPECTOS, take: POR_PAGINA_PROSPECTOS,
  });
  const ab = await abrieron(filas.map((x) => x.id));
  return filas.map((x) => aTarjeta(x, ab.has(x.id), x.etapa === "por_contactar" ? "inicial" : "seguimiento"));
}

export type EventoFila = { id: number; tipo: string; de: string; a: string; canal: string; texto: string; creadoEn: Date; usuarioNombre: string };

export async function fichaProspecto(
  id: number,
): Promise<(ProspectoTarjeta & { fuentes: string[]; fuentesPorCampo: Record<string, string>; historial: EventoFila[] }) | null> {
  const f = await prisma.prospecto.findUnique({ where: { id }, select: { ...SELECT, fuentes: true, fuentesPorCampo: true } });
  if (!f) return null;
  const eventos = await prisma.evento.findMany({ where: { prospectoId: id }, orderBy: { creadoEn: "desc" }, take: 200, include: { usuario: { select: { nombre: true } } } });
  const ab = await abrieron([id]);
  const t = aTarjeta(f, ab.has(id), f.etapa === "por_contactar" ? "inicial" : "seguimiento");
  return {
    ...t, fuentes: listaDeTextos(f.fuentes),
    // Se lee con guarda: la columna es Json y puede traer cualquier cosa de una
    // carga vieja. Sin fuente, el dato se muestra sin enlace, no con uno roto.
    fuentesPorCampo: mapaDeTextos(f.fuentesPorCampo),
    historial: eventos.map((e) => ({ id: e.id, tipo: e.tipo, de: e.de, a: e.a, canal: e.canal, texto: e.texto, creadoEn: e.creadoEn, usuarioNombre: e.usuario?.nombre ?? "" })),
  };
}

// Totales de la pantalla de prospectos (17-sep: «veo solo listado, no veo totales»): cuantos hay con los filtros
// puestos y como se reparten por etapa, nicho y ciudad. Cada reparto sirve de filtro al tocarlo.
export type ResumenProspectos = {
  total: number;
  porEtapa: { etapa: Etapa; n: number }[];
  porNicho: { nichoId: number; nombre: string; n: number }[];
  porCiudad: { ciudad: string; n: number }[];
};
export async function resumenProspectos(f: FiltrosProspectos): Promise<ResumenProspectos> {
  const where = whereDe(f);
  const [total, etapas, nichos, ciudades, nombres] = await Promise.all([
    prisma.prospecto.count({ where }),
    prisma.prospecto.groupBy({ by: ["etapa"], where, _count: { _all: true } }),
    prisma.prospecto.groupBy({ by: ["nichoId"], where, _count: { _all: true } }),
    prisma.prospecto.groupBy({ by: ["ciudad"], where, _count: { _all: true }, orderBy: [{ _count: { ciudad: "desc" } }, { ciudad: "asc" }] }),
    prisma.nicho.findMany({ select: { id: true, nombre: true } }),
  ]);
  const nombreDe = new Map(nombres.map((n) => [n.id, n.nombre]));
  return {
    total,
    porEtapa: ETAPAS.map((e) => ({ etapa: e, n: etapas.find((x) => x.etapa === e)?._count._all ?? 0 })).filter((x) => x.n > 0),
    porNicho: nichos.map((x) => ({ nichoId: x.nichoId, nombre: nombreDe.get(x.nichoId) ?? String(x.nichoId), n: x._count._all })).sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre)),
    porCiudad: ciudades.map((x) => ({ ciudad: x.ciudad, n: x._count._all })),
  };
}

export async function listarNichos(): Promise<{ id: number; slug: string; nombre: string }[]> {
  return prisma.nicho.findMany({ select: { id: true, slug: true, nombre: true }, orderBy: { nombre: "asc" } });
}
