// Reglas puras del directorio abierto (Overture Maps): a que nicho y a que ciudad pertenece cada lugar y como se
// convierte en una fila de la bandeja. Sin Prisma ni node: lo importan la accion, el script de carga y la pantalla.
import { normalizarCelular, normalizarRed, type Pais } from "@/lib/celular-contrato";
import { CIUDADES, type Ciudad } from "@/lib/overpass-contrato";
import type { EntradaValidada } from "@/lib/tabla-contrato";
import { claveProspecto } from "@/lib/clave-prospecto";

// Las cuatro listas van como texto con un valor por renglon: la tabla no lleva columnas Json a proposito.
export type LugarOverture = {
  id: string; nombre: string; categoriaBase: string; categoriaFina: string; lat: number; lon: number;
  direccion: string; telefonos: string; correos: string; webs: string; redes: string; confianza: number; publicacion: string;
  pais: Pais;
};

// `bases` es basic_category de Overture. Donde la base es muy ancha se afina con taxonomy.primary:
// `finas` deja pasar solo esas y `sinFinas` las quita.
export type ReglaNicho = { bases: string[]; finas?: string[]; sinFinas?: string[] };
export const REGLAS_NICHO: Record<string, ReglaNicho> = {
  "hoteles-estadia": { bases: ["hotel", "lodging"], sinFinas: ["motel"] },
  "restaurantes-y-bares": { bases: ["restaurant", "casual_eatery", "fast_food_restaurant", "bar", "cafe", "coffee_shop"], sinFinas: ["bakery"] },
  "clinicas-y-consultorios": { bases: ["hospital", "health_care", "outpatient_care_facility", "diagnostics_imaging_or_lab_service", "medical_service", "primary_care_or_general_clinic", "vision_or_eye_care_clinic"] },
  odontologias: { bases: ["dental_clinic"] },
  farmacias: { bases: ["pharmacy_and_drug_store"] },
  "peluquerias-y-barberias": { bases: ["personal_or_beauty_service"], finas: ["barber", "hair_salon"] },
  "spas-y-estetica": { bases: ["personal_or_beauty_service", "wellness_service"], sinFinas: ["barber", "hair_salon"] },
  gimnasios: { bases: ["gym", "fitness_studio"] },
  "canchas-y-espacios": { bases: ["sport_or_fitness_facility", "sport_field", "sport_court", "sport_or_recreation_club"] },
  eventos: { bases: ["event_or_party_service", "event_venue"] },
  veterinarias: { bases: ["animal_or_pet_service"], finas: ["veterinarian"] },
  "licorerias-y-bodegones": { bases: ["food_and_beverage_store"], finas: ["liquor_store"] },
  "emprendimientos-comida": { bases: ["casual_eatery"], finas: ["bakery"] },
  "emprendimientos-moda": { bases: ["fashion_and_apparel_store"] },
  comercio: { bases: ["hardware_home_and_garden_store", "electronics_store", "convenience_store", "vehicle_parts_store"] },
  "talleres-y-autolavados": { bases: ["automotive_service"] },
  educacion: { bases: ["specialty_school"] },
};
// Nichos que el directorio no cubre: 4 moteles y 2 tiendas de cosmeticos en todo el pais (medido el 5-oct-2026).
export const SIN_EQUIVALENCIA = ["hoteles", "cosmeticos"];

export function reglaDeNicho(slug: string): ReglaNicho | undefined {
  return Object.hasOwn(REGLAS_NICHO, slug) ? REGLAS_NICHO[slug] : undefined;
}

function coincideNicho(r: ReglaNicho, l: Pick<LugarOverture, "categoriaBase" | "categoriaFina">): boolean {
  if (!r.bases.includes(l.categoriaBase)) return false;
  if (r.finas && !r.finas.includes(l.categoriaFina)) return false;
  return !r.sinFinas?.includes(l.categoriaFina);
}

const RADIO_TIERRA_M = 6_371_000;
const rad = (g: number) => (g * Math.PI) / 180;

function distanciaM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.sqrt(a));
}

// La caja que encierra el circulo de la ciudad: es lo que se le pide a la base. La distancia exacta va en codigo.
export function cajaDeCiudad(c: Ciudad): { latMin: number; latMax: number; lonMin: number; lonMax: number } {
  const dLat = (c.radioM / RADIO_TIERRA_M) * (180 / Math.PI);
  const dLon = dLat / Math.cos(rad(c.lat));
  return { latMin: c.lat - dLat, latMax: c.lat + dLat, lonMin: c.lon - dLon, lonMax: c.lon + dLon };
}

// Los radios se solapan (Valencia y Guacara, Caracas y La Guaira). Un lugar es de UNA sola ciudad: la de centro
// mas cercano entre las que lo cubren. Si no, el mismo negocio entraria dos veces con ciudades distintas y la clave
// nombre|ciudad no lo veria como repetido.
export function ciudadDeLugar(lat: number, lon: number): Ciudad | undefined {
  let mejor: Ciudad | undefined;
  let menor = Infinity;
  for (const c of CIUDADES) {
    const d = distanciaM(lat, lon, c.lat, c.lon);
    if (d <= c.radioM && d < menor) { mejor = c; menor = d; }
  }
  return mejor;
}

const lineas = (t: string): string[] => (t ?? "").split("\n").map((s) => s.trim()).filter(Boolean);

const CORREO = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const MAX_EMAIL = 120; // el mismo tope que el alta manual y la importacion
// Correos que no son del negocio sino de un intermediario que administra su pagina.
const DOMINIOS_DESCARTADOS = ["explore.partners"];

function primerCorreo(lista: string[]): string {
  for (const c of lista) {
    const v = c.toLowerCase();
    if (v.length > MAX_EMAIL || !CORREO.test(v)) continue;
    if (DOMINIOS_DESCARTADOS.some((d) => v.endsWith(`@${d}`) || v.endsWith(`.${d}`))) continue;
    return v;
  }
  return "";
}

// normalizarCelular busca el patron en cualquier parte del texto: de "+14165551234" (un numero de Canada) o de un
// fijo con digitos de mas saca un movil venezolano que no existe. Aqui el numero entero tiene que ser el movil.
const MOVIL_EXACTO = /^(?:\+?58)?0?4(?:12|14|16|24|26|22)\d{7}$/;
const MOVIL_EXACTO_CO = /^(?:\+?57)?3\d{9}$/;
const movilExacto = (t: string, pais: Pais): string =>
  (pais === "CO" ? MOVIL_EXACTO_CO : MOVIL_EXACTO).test(t.replace(/[\s().-]/g, "")) ? normalizarCelular(t, pais) : "";

const MAX_WEB = 191; // TOPES.texto: una web mas larga dejaria la fila marcada como error por un dato secundario

// Mismo contrato que prospectosDesdeOverpass. La fuente de cada dato es la pagina de Facebook del negocio (de ahi
// lo saco Meta) o, si no tiene, su web. Sin ninguna de las dos el lugar no entra: no habria como sostener que el
// dato lo publico el propio negocio.
export function prospectosDesdeOverture(
  lugares: LugarOverture[], c: Ciudad, nicho: string, op: { soloContactables: boolean },
): EntradaValidada[] {
  const regla = reglaDeNicho(nicho);
  if (!regla) return [];
  const salida: EntradaValidada[] = [];
  for (const l of [...lugares].sort((a, b) => b.confianza - a.confianza)) {
    if (!coincideNicho(regla, l)) continue;
    if (l.pais !== c.pais) continue;
    if (ciudadDeLugar(l.lat, l.lon)?.slug !== c.slug) continue;
    // Solo URL: Overture a veces trae un telefono o un usuario suelto en las redes, y normalizarRed los tomaria por
    // un usuario ("facebook.com/+58 414-…"), que ademas quedaria como fuente de toda la fila.
    const redes = lineas(l.redes).filter((r) => /^https?:\/\//i.test(r));
    const facebook = redes.map((r) => normalizarRed(r, "facebook")).find(Boolean) ?? "";
    const instagram = redes.map((r) => normalizarRed(r, "instagram")).find(Boolean) ?? "";
    const web = lineas(l.webs).find((w) => /^https?:\/\//i.test(w) && w.length <= MAX_WEB) ?? "";
    const fuente = facebook || web;
    if (!fuente) continue;
    const telefonos = lineas(l.telefonos);
    const telefono = telefonos[0] ?? "";
    const whatsapp = telefonos.map((t) => movilExacto(t, c.pais)).find(Boolean) ?? "";
    const email = primerCorreo(lineas(l.correos));
    if (op.soloContactables && !telefono && !whatsapp && !email) continue;
    const entrada: EntradaValidada = {
      nicho, nombre: l.nombre.trim(), ciudad: c.nombre, estado: c.estado, tipo: l.categoriaFina, tamano: "",
      telefono, whatsapp, email, web, instagram, facebook, tiktok: "",
      nota: l.direccion ? `Dirección: ${l.direccion}` : "", fuentes: [fuente], fuentesPorCampo: {},
    };
    for (const k of ["nombre", "ciudad", "tipo", "telefono", "whatsapp", "email", "web", "instagram", "facebook"] as const) {
      if (entrada[k]) entrada.fuentesPorCampo[k] = fuente;
    }
    salida.push(entrada);
  }
  return salida;
}

// Una ciudad grande trae miles de fichas de un solo nicho (restaurantes en Cali: 1.784) y nadie revisa eso en una
// bandeja. Cada busqueda deja pasar como mucho TOPE_LOTE, las de mayor confianza entre las que TODAVIA no pasaron por
// la bandeja (`vistas`: claves nombre|ciudad): asi la siguiente busqueda trae las siguientes, no las mismas.
export const TOPE_LOTE = 300;
export function tomarLote(entradas: EntradaValidada[], vistas: Set<string>, tope = TOPE_LOTE): { lote: EntradaValidada[]; quedan: number } {
  const sinVer = entradas.filter((e) => !vistas.has(claveProspecto(e.nombre, e.ciudad)));
  return { lote: sinVer.slice(0, tope), quedan: Math.max(0, sinVer.length - tope) };
}

// --- Carga ------------------------------------------------------------------
const MAX_POR_LISTA = 5;
// \p{Cc} y no un rango escrito con escapes: ver "Trampa de herramienta" en el CLAUDE.md del proyecto.
const limpio = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\p{Cc}+/gu, " ").trim().slice(0, max) : "");
const lista = (v: unknown): string =>
  Array.isArray(v) ? v.map((x) => limpio(x, 500)).filter(Boolean).slice(0, MAX_POR_LISTA).join("\n") : "";
const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// Un renglon del JSONL que deja extraer-overture.py. Devuelve null si no sirve: el script lo cuenta y lo salta.
// La caja de cada pais, con holgura. El filtro fino por pais lo hace el extractor (campo `country` de Overture);
// esto solo ataja un archivo de otro continente.
const CAJA_PAIS: Record<Pais, [number, number, number, number]> = { VE: [0, 13, -74, -59], CO: [-4.5, 13.5, -79.5, -66.5] };

export function validarLugar(crudo: unknown, publicacion: string, pais: Pais = "VE"): LugarOverture | null {
  if (!crudo || typeof crudo !== "object") return null;
  const o = crudo as Record<string, unknown>;
  const id = limpio(o.id, 64), nombre = limpio(o.nombre, 191), categoriaBase = limpio(o.categoriaBase, 80);
  const lat = numero(o.lat), lon = numero(o.lon), confianza = numero(o.confianza);
  if (!id || !nombre || !categoriaBase || lat === null || lon === null || confianza === null) return null;
  const [latMin, latMax, lonMin, lonMax] = CAJA_PAIS[pais];
  if (lat < latMin || lat > latMax || lon < lonMin || lon > lonMax) return null;
  return {
    id, nombre, categoriaBase, categoriaFina: limpio(o.categoriaFina, 80), lat, lon, direccion: limpio(o.direccion, 191),
    telefonos: lista(o.telefonos), correos: lista(o.correos), webs: lista(o.webs), redes: lista(o.redes), confianza, publicacion, pais,
  };
}

// Una descarga cortada no puede vaciar el directorio: lo nuevo tiene que ser al menos la mitad de lo que hay.
export function puedeReemplazar(actuales: number, nuevas: number): boolean {
  return nuevas > 0 && nuevas * 2 >= actuales;
}

// "2026-09-23.1" -> "23/09/2026"
export function fechaDePublicacion(publicacion: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(publicacion);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : publicacion;
}
