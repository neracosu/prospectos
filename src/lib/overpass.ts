// src/lib/overpass.ts -- Overpass con cache de 7 dias y UNA consulta a la vez.
//
// La politica de uso de Overpass (es un servicio publico y gratuito) pide no
// pegarle en paralelo ni a rafagas: TODO el proceso pasa por una sola cola y deja
// 5 s entre una consulta y la siguiente. La cache de `BusquedaOsm` evita repetir
// la misma busqueda (nicho + ciudad) durante una semana: el mapa no cambia tanto.
//
// La cache es honesta: solo se guarda una respuesta 200, sin `remark` de Overpass
// (asi avisa que la consulta se le cayo o la corto por tiempo) y con al menos un
// negocio. Una respuesta vacia o a medias guardada por una semana es peor que no
// tener cache: el usuario ve "no hay nada" siete dias seguidos sin saber por que.
//
// Este modulo NO es "use server": es una lib. La accion que lo usa vive en
// src/acciones/buscar.ts.
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { descargar as descargarReal } from "@/lib/red-segura";
import { armarConsultaOverpass, prospectosDesdeOverpass, ciudadPorSlug } from "@/lib/overpass-contrato";
import { leerDatos } from "@/lib/revision";
import type { EntradaValidada } from "@/lib/tabla-contrato";

const ENDPOINT = "https://overpass-api.de/api/interpreter";
const CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;
export const ESPERA_MS = 5000;
// La consulta lleva [timeout:60], asi que el servidor puede tardar hasta un minuto
// en contestar: el plazo TOTAL de descargar() (30 s por defecto) tiene que ser mas
// largo que eso o se corta una respuesta legitima. timeoutMs es inactividad.
const INACTIVIDAD_MS = 60_000;
const PLAZO_TOTAL_MS = 90_000;
const MAX_BYTES = 8 * 1024 * 1024;
// Como suena un `remark` de Overpass cuando la consulta NO se completo.
const REMARK_ROTO = /error|timed out|timeout|out of memory|too many|rejected/i;

export type ResultadoOverpass =
  | { ok: true; entradas: EntradaValidada[]; desdeCache: boolean; consultadoEn: Date; antiguedadDias: number }
  | { ok: false; motivo: string };

let cola: Promise<void> = Promise.resolve();
let ultimaConsulta = 0;

// La espera entre consultas se puede acortar SOLO en las pruebas: ahi la red esta
// simulada y no se toca el servidor publico. La puerta es la misma que la lista
// blanca de red-segura (el "!== production" es a proposito: si PROSPECTOS_TEST_DB
// quedara puesto por error en produccion, igual no alcanza). Un valor vacio, cero
// o raro cae en los 5 s de la politica.
function enPruebas(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    (process.env.NODE_ENV === "test" || process.env.PROSPECTOS_TEST_DB === "1")
  );
}
function esperaConfigurada(): number {
  if (!enPruebas()) return ESPERA_MS;
  const v = Number(process.env.PROSPECTOS_OVERPASS_ESPERA_MS);
  return Number.isFinite(v) && v > 0 ? v : ESPERA_MS;
}

// Serializa: cada consulta espera a que termine la anterior y a que hayan pasado
// los milisegundos de la politica desde que esa anterior se libero. Devuelve la
// funcion que libera el turno; quien la pide DEBE llamarla (va en un finally).
// El timer va con unref para que una espera pendiente no sostenga el proceso.
function turno(esperaMs: number): Promise<() => void> {
  return new Promise((resolver) => {
    const anterior = cola;
    let liberar!: () => void;
    cola = new Promise<void>((r) => {
      liberar = r;
    });
    anterior.then(() => {
      const falta = Math.max(0, ultimaConsulta + esperaMs - Date.now());
      const t = setTimeout(
        () =>
          resolver(() => {
            ultimaConsulta = Date.now();
            liberar();
          }),
        falta
      );
      t.unref?.();
    });
  });
}

// Las columnas Json se leen con guardas: un `as` a secas se cree cualquier cosa
// que haya quedado en la tabla (una migracion vieja, un script a mano).
function etiquetasDe(valor: unknown): [string, string][] {
  if (!Array.isArray(valor)) return [];
  const salida: [string, string][] = [];
  for (const par of valor) {
    if (Array.isArray(par) && typeof par[0] === "string" && typeof par[1] === "string") salida.push([par[0], par[1]]);
  }
  return salida;
}

function entradasGuardadas(valor: unknown): EntradaValidada[] {
  if (!Array.isArray(valor)) return [];
  const salida: EntradaValidada[] = [];
  for (const x of valor) {
    const d = leerDatos(x);
    if (d) salida.push(d);
  }
  return salida;
}

// Huella de la consulta que produjo estos resultados. Si el nicho cambia sus
// etiquetas de OpenStreetMap, la busqueda guardada ya no responde a la pregunta
// que se esta haciendo y la cache no vale. Va DENTRO del JSON `resultados` para
// no pedir una migracion; el formato viejo (un arreglo pelado) se lee igual y
// simplemente no coincide, asi que se vuelve a consultar.
function huellaQl(ql: string): string {
  return createHash("sha256").update(ql).digest("hex").slice(0, 12);
}

type Guardado = { ql: string; entradas: EntradaValidada[] };

function leerGuardado(valor: unknown): Guardado {
  if (Array.isArray(valor)) return { ql: "", entradas: entradasGuardadas(valor) };
  if (typeof valor === "object" && valor !== null) {
    const o = valor as { ql?: unknown; entradas?: unknown };
    return { ql: typeof o.ql === "string" ? o.ql : "", entradas: entradasGuardadas(o.entradas) };
  }
  return { ql: "", entradas: [] };
}

function diasDesde(consultadoEn: Date, ahora: Date): number {
  return Math.max(0, Math.floor((ahora.getTime() - consultadoEn.getTime()) / DIA_MS));
}

async function cacheDe(nichoId: number, area: string, ql: string): Promise<{ entradas: EntradaValidada[]; consultadoEn: Date } | null> {
  const fila = await prisma.busquedaOsm.findUnique({ where: { nichoId_area: { nichoId, area } } });
  if (!fila) return null;
  const g = leerGuardado(fila.resultados);
  // Sin la misma huella, lo guardado responde a otras etiquetas: no sirve.
  if (g.ql !== ql || !g.entradas.length) return null;
  return { entradas: g.entradas, consultadoEn: fila.consultadoEn };
}

export async function buscarEnOverpass(
  nichoId: number,
  slugCiudad: string,
  opts: { descargar?: typeof descargarReal; ahora?: Date; esperaMs?: number } = {}
): Promise<ResultadoOverpass> {
  const ciudad = ciudadPorSlug(slugCiudad);
  if (!ciudad) return { ok: false, motivo: "Ciudad desconocida." };
  const nicho = await prisma.nicho.findUnique({ where: { id: nichoId }, select: { slug: true, etiquetaOsm: true } });
  if (!nicho) return { ok: false, motivo: "Nicho desconocido." };
  const etiquetas = etiquetasDe(nicho.etiquetaOsm);
  if (!etiquetas.length) return { ok: false, motivo: "Ese nicho no tiene etiquetas de OpenStreetMap configuradas." };
  const ahora = opts.ahora ?? new Date();
  const ql = armarConsultaOverpass(etiquetas, ciudad);
  const huella = huellaQl(ql);
  const area = ciudad.slug;

  const cache = await cacheDe(nichoId, area, huella);
  if (cache && ahora.getTime() - cache.consultadoEn.getTime() < CACHE_MS) {
    return { ok: true, entradas: cache.entradas, desdeCache: true, consultadoEn: cache.consultadoEn, antiguedadDias: diasDesde(cache.consultadoEn, ahora) };
  }

  const descargar = opts.descargar ?? descargarReal;
  const liberar = await turno(opts.esperaMs ?? esperaConfigurada());
  try {
    // Se vuelve a mirar la cache YA con el turno en la mano: tres pedidos del mismo
    // par que llegan juntos con la cache fria harian tres consultas identicas; el
    // primero la llena y los otros dos salen de ahi.
    const recien = await cacheDe(nichoId, area, huella);
    if (recien && ahora.getTime() - recien.consultadoEn.getTime() < CACHE_MS) {
      return { ok: true, entradas: recien.entradas, desdeCache: true, consultadoEn: recien.consultadoEn, antiguedadDias: diasDesde(recien.consultadoEn, ahora) };
    }
    const viejo = recien ?? cache;
    const r = await descargar(ENDPOINT, {
      metodo: "POST",
      cuerpo: "data=" + encodeURIComponent(ql),
      contentType: "application/x-www-form-urlencoded",
      timeoutMs: INACTIVIDAD_MS,
      plazoTotalMs: PLAZO_TOTAL_MS,
      maxBytes: MAX_BYTES,
    });
    // Con cache vencida es mejor lo viejo que nada, pero se dice de que fecha es.
    const conLoViejo = (motivo: string): ResultadoOverpass =>
      viejo
        ? { ok: true, entradas: viejo.entradas, desdeCache: true, consultadoEn: viejo.consultadoEn, antiguedadDias: diasDesde(viejo.consultadoEn, ahora) }
        : { ok: false, motivo };
    if (!r.ok) return conLoViejo(`Overpass no respondió (${r.motivo}). Intenta en un rato.`);
    if (r.estado !== 200) return conLoViejo(`Overpass respondió ${r.estado}. Intenta en un rato.`);
    let json: unknown;
    try {
      json = JSON.parse(r.texto);
    } catch {
      return conLoViejo("Overpass devolvió una respuesta que no se pudo leer. Intenta en un rato.");
    }
    const aviso = typeof (json as { remark?: unknown }).remark === "string" ? (json as { remark: string }).remark.trim() : "";
    // Overpass usa `remark` tanto para un aviso inocente como para decir que la
    // consulta se le cayo. Solo el segundo caso invalida lo que vino: un remark
    // informativo con resultados se cachea como cualquier otra respuesta.
    const avisoMalo = aviso !== "" && REMARK_ROTO.test(aviso);
    const entradas = prospectosDesdeOverpass(json, ciudad, nicho.slug);
    // Las tres condiciones para guardar: 200, sin aviso de que la consulta se
    // rompio y con algo que guardar. Si falta una, se devuelve lo que vino pero la
    // cache no se toca.
    if (r.estado === 200 && !avisoMalo && entradas.length > 0) {
      const guardado = { ql: huella, entradas } as unknown as Prisma.InputJsonValue;
      await prisma.busquedaOsm.upsert({
        where: { nichoId_area: { nichoId, area } },
        update: { resultados: guardado, consultadoEn: ahora },
        create: { nichoId, area, resultados: guardado, consultadoEn: ahora },
      });
    }
    if (avisoMalo && !entradas.length) return conLoViejo(`Overpass no pudo completar la consulta (${aviso.slice(0, 120)}). Intenta en un rato.`);
    return { ok: true, entradas, desdeCache: false, consultadoEn: ahora, antiguedadDias: 0 };
  } finally {
    liberar();
  }
}
