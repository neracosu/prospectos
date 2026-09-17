// src/lib/overpass.ts -- Overpass con cache de 7 dias y UNA consulta a la vez.
//
// La politica de uso de Overpass (es un servicio publico y gratuito) pide no
// pegarle en paralelo ni a rafagas: TODO el proceso pasa por una sola cola y deja
// 5 s entre una consulta y la siguiente. La cache de `BusquedaOsm` evita repetir
// la misma busqueda (nicho + ciudad) durante una semana: el mapa no cambia tanto.
//
// Este modulo NO es "use server": es una lib. La accion que lo usa vive en
// src/acciones/buscar.ts.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { descargar as descargarReal } from "@/lib/red-segura";
import { armarConsultaOverpass, prospectosDesdeOverpass, ciudadPorSlug } from "@/lib/overpass-contrato";
import { leerDatos } from "@/lib/revision";
import type { EntradaValidada } from "@/lib/tabla-contrato";

const ENDPOINT = "https://overpass-api.de/api/interpreter";
const CACHE_MS = 7 * 24 * 60 * 60 * 1000;
export const ESPERA_MS = 5000;
// La consulta lleva [timeout:60], asi que el servidor puede tardar hasta un minuto
// en contestar: el plazo TOTAL de descargar() (30 s por defecto) tiene que ser mas
// largo que eso o se corta una respuesta legitima. timeoutMs es inactividad.
const INACTIVIDAD_MS = 60_000;
const PLAZO_TOTAL_MS = 90_000;
const MAX_BYTES = 8 * 1024 * 1024;

let cola: Promise<void> = Promise.resolve();
let ultimaConsulta = 0;

// Serializa: cada consulta espera a que termine la anterior y a que hayan pasado
// ESPERA_MS desde que esa anterior se libero. Devuelve la funcion que libera el
// turno; quien la pide DEBE llamarla (va en un finally).
// El timer va con unref para que una espera pendiente no sostenga el proceso.
function turno(): Promise<() => void> {
  return new Promise((resolver) => {
    const anterior = cola;
    let liberar!: () => void;
    cola = new Promise<void>((r) => {
      liberar = r;
    });
    anterior.then(() => {
      const falta = Math.max(0, ultimaConsulta + ESPERA_MS - Date.now());
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

export async function buscarEnOverpass(
  nichoId: number,
  slugCiudad: string,
  opts: { descargar?: typeof descargarReal; ahora?: Date } = {}
): Promise<{ ok: true; entradas: EntradaValidada[]; desdeCache: boolean } | { ok: false; motivo: string }> {
  const ciudad = ciudadPorSlug(slugCiudad);
  if (!ciudad) return { ok: false, motivo: "Ciudad desconocida." };
  const nicho = await prisma.nicho.findUnique({ where: { id: nichoId }, select: { slug: true, etiquetaOsm: true } });
  if (!nicho) return { ok: false, motivo: "Nicho desconocido." };
  const etiquetas = etiquetasDe(nicho.etiquetaOsm);
  if (!etiquetas.length) return { ok: false, motivo: "Ese nicho no tiene etiquetas de OpenStreetMap configuradas." };
  const ahora = opts.ahora ?? new Date();
  const cache = await prisma.busquedaOsm.findUnique({ where: { nichoId_area: { nichoId, area: ciudad.slug } } });
  if (cache && ahora.getTime() - cache.consultadoEn.getTime() < CACHE_MS) {
    return { ok: true, entradas: entradasGuardadas(cache.resultados), desdeCache: true };
  }
  const descargar = opts.descargar ?? descargarReal;
  const liberar = await turno();
  try {
    const r = await descargar(ENDPOINT, {
      metodo: "POST",
      cuerpo: "data=" + encodeURIComponent(armarConsultaOverpass(etiquetas, ciudad)),
      contentType: "application/x-www-form-urlencoded",
      timeoutMs: INACTIVIDAD_MS,
      plazoTotalMs: PLAZO_TOTAL_MS,
      maxBytes: MAX_BYTES,
    });
    if (!r.ok) {
      // Con cache vencida es mejor lo viejo que nada: se avisa que viene de la cache.
      return cache
        ? { ok: true, entradas: entradasGuardadas(cache.resultados), desdeCache: true }
        : { ok: false, motivo: `Overpass no respondió (${r.motivo}). Intenta en un rato.` };
    }
    let json: unknown;
    try {
      json = JSON.parse(r.texto);
    } catch {
      return { ok: false, motivo: "Overpass devolvió una respuesta que no se pudo leer. Intenta en un rato." };
    }
    const entradas = prospectosDesdeOverpass(json, ciudad, nicho.slug);
    const guardar = entradas as unknown as Prisma.InputJsonValue;
    await prisma.busquedaOsm.upsert({
      where: { nichoId_area: { nichoId, area: ciudad.slug } },
      update: { resultados: guardar, consultadoEn: ahora },
      create: { nichoId, area: ciudad.slug, resultados: guardar, consultadoEn: ahora },
    });
    return { ok: true, entradas, desdeCache: false };
  } finally {
    liberar();
  }
}
