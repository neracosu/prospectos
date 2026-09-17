// Lotes de la bandeja de revision. Nada entra a Prospecto sin pasar por aqui:
// primero se clasifica (nuevo / repetido / error) y despues alguien decide.
// Nada se borra: descartar es una decision, no un delete.
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { claveProspecto } from "@/lib/clave-prospecto";
import type { EntradaValidada } from "@/lib/tabla-contrato";

export const ORIGENES = ["overpass", "web", "maps", "importado"] as const;
export type Origen = (typeof ORIGENES)[number];
const OrigenZ = z.enum(ORIGENES);

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
// Mapas precargados para clasificar un lote entero sin una consulta por fila.
// La llave de `existentePorClave` es "<nichoId>|<clave>", igual que la de `vistas`.
export type CacheLote = { nichoPorSlug: Map<string, number>; existentePorClave: Map<string, number> };

const SELECT_EXISTENTE = {
  id: true, nombre: true, ciudad: true, telefono: true, whatsapp: true,
  email: true, web: true, instagram: true, facebook: true, tiktok: true,
} as const;

// Un IN con 5000 claves puede pasarse del max_allowed_packet: se parte.
const TROZO_CLAVES = 1000;
// Tope de filas que aprueba una sola llamada a aprobarNuevos.
export const TOPE_APROBACION = 500;
const ENTRADA_VACIA: EntradaValidada = { nicho: "", nombre: "", ciudad: "", fuentes: [], fuentesPorCampo: {} };

// --- Lectura defensiva del JSON de la base -------------------------------
// Las tres columnas Json se leen con guardas: un `as` a secas se cree cualquier
// cosa que haya quedado en la tabla (una migracion vieja, un script a mano).

function esObjetoPlano(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// `datos` tiene que ser un objeto: si no, la fila no se puede leer y se trata
// como error. Devuelve null en vez de lanzar para que quien lee decida.
export function leerDatos(datos: unknown): EntradaValidada | null {
  return esObjetoPlano(datos) ? (datos as unknown as EntradaValidada) : null;
}

export function listaDeTextos(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function mapaDeTextos(v: unknown): Record<string, string> {
  if (!esObjetoPlano(v)) return {};
  const salida: Record<string, string> = {};
  for (const [k, valor] of Object.entries(v)) if (typeof valor === "string") salida[k] = valor;
  return salida;
}

function trozos<T>(lista: T[], tamano: number): T[][] {
  const salida: T[][] = [];
  for (let i = 0; i < lista.length; i += tamano) salida.push(lista.slice(i, i + tamano));
  return salida;
}

// --- Clasificacion ------------------------------------------------------

// Clasifica una entrada contra la base y contra las claves ya vistas en el lote.
// Con `cache` no toca la base (lo usa crearLote); sin el consulta fila por fila
// (lo usa corregirFila, que revalida una sola).
export async function clasificar(
  entrada: EntradaValidada, errores: string[], vistas: Set<string>, cache?: CacheLote,
): Promise<{ estado: Estado; errores: string[]; existenteId: number | null }> {
  const errs = [...errores];
  const slug = (entrada.nicho ?? "").trim();
  let nichoId: number | undefined;
  if (cache) nichoId = cache.nichoPorSlug.get(slug);
  else if (slug) nichoId = (await prisma.nicho.findUnique({ where: { slug }, select: { id: true } }))?.id;
  if (nichoId === undefined) errs.push("Nicho desconocido");
  if (errs.length) return { estado: "error", errores: errs, existenteId: null };
  const clave = claveProspecto(entrada.nombre, entrada.ciudad);
  const llave = `${nichoId}|${clave}`;
  if (vistas.has(llave)) return { estado: "repetido", errores: ["Repetido en el mismo archivo"], existenteId: null };
  vistas.add(llave);
  const existenteId = cache
    ? cache.existentePorClave.get(llave) ?? null
    : (await prisma.prospecto.findUnique({ where: { nichoId_clave: { nichoId: nichoId!, clave } }, select: { id: true } }))?.id ?? null;
  return existenteId !== null
    ? { estado: "repetido", errores: [], existenteId }
    : { estado: "nuevo", errores: [], existenteId: null };
}

// Resuelve los nichos de un tiron y las claves que ya existen con un findMany
// por nicho (mismo criterio que importarProspectos en src/lib/importar.ts).
async function precargar(entradas: { entrada: EntradaValidada; errores: string[] }[]): Promise<CacheLote> {
  const slugs = [...new Set(entradas.map((e) => (e.entrada.nicho ?? "").trim()).filter(Boolean))];
  const nichos = slugs.length
    ? await prisma.nicho.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } })
    : [];
  const nichoPorSlug = new Map(nichos.map((n) => [n.slug, n.id]));
  const existentePorClave = new Map<string, number>();
  for (const [slug, nichoId] of nichoPorSlug) {
    // Solo las filas que van a llegar a la busqueda: las que ya traen error no
    // se clasifican contra la base.
    const claves = [...new Set(entradas
      .filter((e) => e.errores.length === 0 && (e.entrada.nicho ?? "").trim() === slug)
      .map((e) => claveProspecto(e.entrada.nombre, e.entrada.ciudad)))];
    for (const trozo of trozos(claves, TROZO_CLAVES)) {
      const hallados = await prisma.prospecto.findMany({
        where: { nichoId, clave: { in: trozo } }, select: { id: true, clave: true },
      });
      for (const p of hallados) existentePorClave.set(`${nichoId}|${p.clave}`, p.id);
    }
  }
  return { nichoPorSlug, existentePorClave };
}

export async function crearLote(
  origen: Origen,
  entradas: { entrada: EntradaValidada; errores: string[] }[],
  usuarioId: number,
): Promise<{ lote: string; nuevos: number; repetidos: number; errores: number }> {
  const o = OrigenZ.safeParse(origen);
  // Lanza a proposito: crearLote no devuelve Resultado y un origen inventado es
  // un error de programacion, no algo que el usuario pueda escribir.
  if (!o.success) throw new Error(`Origen desconocido: ${String(origen)}`);
  const lote = randomUUID();
  const cache = await precargar(entradas);
  const vistas = new Set<string>();
  const cuenta = { nuevos: 0, repetidos: 0, errores: 0 };
  const filas: Prisma.RevisionCreateManyInput[] = [];
  for (let i = 0; i < entradas.length; i++) {
    const c = await clasificar(entradas[i].entrada, entradas[i].errores, vistas, cache);
    cuenta[c.estado === "nuevo" ? "nuevos" : c.estado === "repetido" ? "repetidos" : "errores"]++;
    filas.push({
      lote, origen: o.data, fila: i + 1,
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
    filas: filas.map((f) => {
      const datos = leerDatos(f.datos);
      // Sin datos legibles la fila no se puede aprobar ni corregir: se muestra
      // como error para que se descarte.
      if (!datos) {
        return {
          id: f.id, lote: f.lote, origen: f.origen, fila: f.fila, datos: ENTRADA_VACIA,
          estado: "error" as Estado, errores: ["Datos inválidos"], existenteId: f.existenteId,
          existente: f.existente, decision: f.decision as Decision,
        };
      }
      return {
        id: f.id, lote: f.lote, origen: f.origen, fila: f.fila, datos,
        estado: f.estado as Estado, errores: listaDeTextos(f.errores),
        existenteId: f.existenteId, existente: f.existente, decision: f.decision as Decision,
      };
    }),
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
