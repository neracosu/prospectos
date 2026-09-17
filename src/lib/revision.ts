// Lotes de la bandeja de revision. Nada entra a Prospecto sin pasar por aqui:
// primero se clasifica (nuevo / repetido / error) y despues alguien decide.
// Nada se borra: descartar es una decision, no un delete.
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { claveProspecto } from "@/lib/clave-prospecto";
import { POR_PAGINA } from "@/lib/revision-contrato";
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
// Texto de la fila cuyo JSON no se puede leer. Lo mira la pantalla para ofrecer
// solo "Descartar": esa fila no se aprueba ni se corrige.
export const DATOS_ILEGIBLES = "Datos inválidos";
// Funcion, no constante: devuelve un objeto nuevo cada vez. Un singleton con
// `fuentes: []` y `fuentesPorCampo: {}` lo comparten todas las filas ilegibles y
// quien le empuje algo a uno se lo empuja a todas.
function entradaVacia(): EntradaValidada {
  return { nicho: "", nombre: "", ciudad: "", fuentes: [], fuentesPorCampo: {} };
}

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
  // La llave es el slug PEDIDO, no el que devolvio la base. MySQL compara con una
  // colacion insensible a mayusculas y acentos, asi que un nicho guardado como
  // "Posadas" entra en el findMany de "posadas": indexar por n.slug dejaba a
  // clasificar sin encontrarlo y la misma fila daba "Nicho desconocido" con cache
  // y "nuevo" sin cache.
  const nichoPorSlug = new Map<string, number>();
  for (const pedido of slugs) {
    const hallado = nichos.find((n) => n.slug.localeCompare(pedido, undefined, { sensitivity: "base" }) === 0);
    if (hallado) nichoPorSlug.set(pedido, hallado.id);
  }
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
  // randomUUID del crypto global (Web Crypto), no de "node:crypto": este modulo
  // lo importa el cron de src/instrumentation.ts, que Next tambien compila para
  // el runtime edge, y ahi un import con esquema "node:" no compila.
  const lote = crypto.randomUUID();
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

export type LoteDetalle = {
  lote: string; origen: string; creadoEn: Date;
  // Del lote ENTERO, no de la pagina: el resumen de arriba no puede cambiar
  // segun en que pagina estes parado.
  total: number; pendientes: number; aprobables: number;
  pagina: number; paginas: number; porPagina: number; desde: number; hasta: number;
  filas: FilaRevision[];
};

function aFilaRevision(f: Prisma.RevisionGetPayload<{ include: { existente: { select: typeof SELECT_EXISTENTE } } }>): FilaRevision {
  const datos = leerDatos(f.datos);
  // Sin datos legibles la fila no se puede aprobar ni corregir: se muestra
  // como error para que se descarte.
  if (!datos) {
    return {
      id: f.id, lote: f.lote, origen: f.origen, fila: f.fila, datos: entradaVacia(),
      estado: "error" as Estado, errores: [DATOS_ILEGIBLES], existenteId: f.existenteId,
      existente: f.existente, decision: f.decision as Decision,
    };
  }
  return {
    id: f.id, lote: f.lote, origen: f.origen, fila: f.fila, datos,
    estado: f.estado as Estado, errores: listaDeTextos(f.errores),
    existenteId: f.existenteId, existente: f.existente, decision: f.decision as Decision,
  };
}

// Cuantas filas del lote puede aprobar de verdad aprobarNuevos: las que estan
// en "nuevo" y sin decidir, menos las que tienen el JSON roto (esas no se
// pueden aprobar nunca, solo descartar). El JSON se mira en la base con
// JSON_TYPE para no traerse el contenido de miles de filas; si el motor no lo
// soporta, se cae al conteo simple, que a lo sumo cuenta de mas.
async function contarAprobables(lote: string, nuevas: number): Promise<number> {
  if (nuevas === 0) return 0;
  try {
    const r = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT COUNT(*) AS n FROM Revision
      WHERE lote = ${lote} AND estado = 'nuevo' AND decision = 'pendiente' AND JSON_TYPE(datos) = 'OBJECT'`;
    return Number(r[0]?.n ?? nuevas);
  } catch {
    return nuevas;
  }
}

// Una pagina del lote: primero lo que falta decidir (que es a lo que se vino),
// despues lo ya decidido. Dentro de cada grupo, por numero de fila, que es el
// orden del archivo y no cambia entre recargas.
export async function loteConDetalle(
  lote: string,
  opciones: { pagina?: number; porPagina?: number } = {},
): Promise<LoteDetalle | null> {
  // Lo que llega por la URL es texto de afuera: un numero que no se entiende
  // ("1e309" es Infinity, "hola" es NaN) vale 1, no revienta la consulta.
  const entero = (v: unknown, porDefecto: number): number => {
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) ? n : porDefecto;
  };
  const porPagina = Math.min(Math.max(1, entero(opciones.porPagina ?? POR_PAGINA, POR_PAGINA)), 200);

  const [total, pendientes, nuevas, primera] = await Promise.all([
    prisma.revision.count({ where: { lote } }),
    prisma.revision.count({ where: { lote, decision: "pendiente" } }),
    prisma.revision.count({ where: { lote, estado: "nuevo", decision: "pendiente" } }),
    prisma.revision.findFirst({ where: { lote }, orderBy: { fila: "asc" }, select: { origen: true, creadoEn: true } }),
  ]);
  if (!primera) return null;

  // La pagina se acota al total DESPUES de contarlo: pedir la 4 de un lote de
  // tres paginas devuelve la 3, no una lista vacia con un "Filas 151-200 de
  // 120" que miente, y el skip nunca se va de rango.
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const pagina = Math.min(Math.max(1, entero(opciones.pagina, 1)), paginas);
  const saltar = (pagina - 1) * porPagina;

  const incluir = { existente: { select: SELECT_EXISTENTE } } as const;
  const crudas = [];
  // Los pendientes y los decididos salen en dos consultas y no en un ORDER BY
  // con CASE: asi el orden es el mismo en MySQL y en cualquier otro motor, y
  // cada consulta usa el indice por (lote, fila).
  if (saltar < pendientes) {
    crudas.push(...await prisma.revision.findMany({
      where: { lote, decision: "pendiente" }, orderBy: { fila: "asc" },
      skip: saltar, take: porPagina, include: incluir,
    }));
  }
  if (crudas.length < porPagina) {
    const saltarDecididas = Math.max(0, saltar - pendientes);
    crudas.push(...await prisma.revision.findMany({
      where: { lote, decision: { not: "pendiente" } }, orderBy: { fila: "asc" },
      skip: saltarDecididas, take: porPagina - crudas.length, include: incluir,
    }));
  }

  return {
    lote, origen: primera.origen, creadoEn: primera.creadoEn,
    total, pendientes, aprobables: await contarAprobables(lote, nuevas),
    pagina, paginas, porPagina,
    desde: total === 0 ? 0 : saltar + 1,
    hasta: saltar + crudas.length,
    filas: crudas.map(aFilaRevision),
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
