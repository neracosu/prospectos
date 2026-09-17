// Lotes de la bandeja de revision. Nada entra a Prospecto sin pasar por aqui:
// primero se clasifica (nuevo / repetido / error) y despues alguien decide.
// Nada se borra: descartar es una decision, no un delete.
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { claveProspecto } from "@/lib/clave-prospecto";
import type { EntradaValidada } from "@/lib/tabla-contrato";

export type Estado = "nuevo" | "repetido" | "error";
export type Decision = "pendiente" | "aprobado" | "completado" | "descartado";
export type ExistenteResumen = {
  id: number; nombre: string; ciudad: string; telefono: string; whatsapp: string;
  email: string; web: string; instagram: string; facebook: string; tiktok: string;
};
export type FilaRevision = {
  id: number; lote: string; origen: string; fila: number; datos: EntradaValidada;
  estado: Estado; errores: string[]; existenteId: number | null;
  existente: ExistenteResumen | null; decision: Decision;
};
export type LoteResumen = { lote: string; origen: string; creadoEn: Date; pendientes: number; total: number };

const SELECT_EXISTENTE = {
  id: true, nombre: true, ciudad: true, telefono: true, whatsapp: true,
  email: true, web: true, instagram: true, facebook: true, tiktok: true,
} as const;

// Clasifica una entrada contra la base y contra las claves ya vistas en el lote.
// `vistas` lleva "<nichoId>|<clave>": el mismo nombre en dos nichos no es repetido.
export async function clasificar(
  entrada: EntradaValidada, errores: string[], vistas: Set<string>,
): Promise<{ estado: Estado; errores: string[]; existenteId: number | null }> {
  const errs = [...errores];
  const nicho = entrada.nicho
    ? await prisma.nicho.findUnique({ where: { slug: entrada.nicho }, select: { id: true } })
    : null;
  if (!nicho) errs.push("Nicho desconocido");
  if (errs.length) return { estado: "error", errores: errs, existenteId: null };
  const clave = claveProspecto(entrada.nombre, entrada.ciudad);
  const vista = `${nicho!.id}|${clave}`;
  if (vistas.has(vista)) return { estado: "repetido", errores: ["Repetido en el mismo archivo"], existenteId: null };
  vistas.add(vista);
  const existente = await prisma.prospecto.findUnique({
    where: { nichoId_clave: { nichoId: nicho!.id, clave } }, select: { id: true },
  });
  return existente
    ? { estado: "repetido", errores: [], existenteId: existente.id }
    : { estado: "nuevo", errores: [], existenteId: null };
}

export async function crearLote(
  origen: string,
  entradas: { entrada: EntradaValidada; errores: string[] }[],
  usuarioId: number,
): Promise<{ lote: string; nuevos: number; repetidos: number; errores: number }> {
  const lote = randomUUID();
  const vistas = new Set<string>();
  const cuenta = { nuevos: 0, repetidos: 0, errores: 0 };
  const filas: Prisma.RevisionCreateManyInput[] = [];
  for (let i = 0; i < entradas.length; i++) {
    const c = await clasificar(entradas[i].entrada, entradas[i].errores, vistas);
    cuenta[c.estado === "nuevo" ? "nuevos" : c.estado === "repetido" ? "repetidos" : "errores"]++;
    filas.push({
      lote, origen, fila: i + 1,
      datos: entradas[i].entrada as unknown as Prisma.InputJsonValue,
      estado: c.estado, errores: c.errores, existenteId: c.existenteId, usuarioId,
    });
  }
  if (filas.length) await prisma.revision.createMany({ data: filas });
  return { lote, ...cuenta };
}

export async function loteConDetalle(
  lote: string,
): Promise<{ lote: string; origen: string; creadoEn: Date; filas: FilaRevision[] } | null> {
  const filas = await prisma.revision.findMany({
    where: { lote }, orderBy: { fila: "asc" }, include: { existente: { select: SELECT_EXISTENTE } },
  });
  if (!filas.length) return null;
  return {
    lote, origen: filas[0].origen, creadoEn: filas[0].creadoEn,
    filas: filas.map((f) => ({
      id: f.id, lote: f.lote, origen: f.origen, fila: f.fila,
      datos: f.datos as unknown as EntradaValidada,
      estado: f.estado as Estado,
      errores: Array.isArray(f.errores) ? (f.errores as string[]) : [],
      existenteId: f.existenteId, existente: f.existente, decision: f.decision as Decision,
    })),
  };
}

// Los ultimos 20 lotes, el mas nuevo primero, con cuantas filas quedan sin decidir.
export async function lotesRecientes(): Promise<LoteResumen[]> {
  const grupos = await prisma.revision.groupBy({
    by: ["lote", "origen"], _count: { _all: true }, _min: { creadoEn: true },
    orderBy: { _min: { creadoEn: "desc" } }, take: 20,
  });
  if (!grupos.length) return [];
  const pendientes = await prisma.revision.groupBy({
    by: ["lote"], where: { decision: "pendiente", lote: { in: grupos.map((g) => g.lote) } }, _count: { _all: true },
  });
  return grupos.map((g) => ({
    lote: g.lote, origen: g.origen, creadoEn: g._min.creadoEn!,
    total: g._count._all,
    pendientes: pendientes.find((p) => p.lote === g.lote)?._count._all ?? 0,
  }));
}

// Los lotes ya decididos se limpian a los 30 dias (los pendientes se quedan).
// Esto borra el registro de la revision, nunca un Prospecto.
export async function limpiarLotesViejos(dias = 30): Promise<number> {
  const antes = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  const r = await prisma.revision.deleteMany({ where: { decision: { not: "pendiente" }, creadoEn: { lt: antes } } });
  return r.count;
}
