import { normalizarCelular, normalizarRed, type Pais } from "@/lib/celular-contrato";
import type { EntradaValidada } from "@/lib/tabla-contrato";

// `alias` son los otros nombres con los que el mismo lugar aparece escrito en una
// direccion (el municipio pegado, el nombre viejo, el que usa Google). Nunca se
// pone aqui el nombre de un ESTADO que no sea tambien el de la ciudad: "Miranda"
// no puede convertirse en "Los Teques" porque una direccion diga el estado, ni un
// nombre de municipio que se repite en medio pais: hay un Municipio Libertador en
// Carabobo, Merida, Aragua, Tachira, Monagas, Sucre y Barinas, ademas del de
// Caracas.
export type Ciudad = { slug: string; nombre: string; estado: string; pais: Pais; lat: number; lon: number; radioM: number; alias?: string[] };
export const CIUDADES: Ciudad[] = [
  { slug: "caracas", nombre: "Caracas", estado: "Distrito Capital", pais: "VE", lat: 10.4806, lon: -66.9036, radioM: 18000, alias: ["Distrito Capital", "Caracas D.C.", "Dtto. Capital"] },
  { slug: "la-guaira", nombre: "La Guaira", estado: "La Guaira", pais: "VE", lat: 10.6031, lon: -66.9354, radioM: 12000, alias: ["Maiquetía", "Catia La Mar", "Vargas"] },
  { slug: "los-teques", nombre: "Los Teques", estado: "Miranda", pais: "VE", lat: 10.3444, lon: -67.0428, radioM: 8000 },
  { slug: "valencia", nombre: "Valencia", estado: "Carabobo", pais: "VE", lat: 10.162, lon: -68.0077, radioM: 15000, alias: ["Naguanagua", "San Diego"] },
  { slug: "maracay", nombre: "Maracay", estado: "Aragua", pais: "VE", lat: 10.2469, lon: -67.5958, radioM: 12000 },
  // Region central (17-sep-2026): Carabobo, Aragua y Cojedes fuera de las dos capitales, mas los pueblos de Miranda
  // que gravitan sobre Caracas. Radios cortos para que un lote sea de una sola ciudad.
  { slug: "puerto-cabello", nombre: "Puerto Cabello", estado: "Carabobo", pais: "VE", lat: 10.4731, lon: -68.0125, radioM: 8000, alias: ["Morón"] },
  { slug: "guacara", nombre: "Guacara", estado: "Carabobo", pais: "VE", lat: 10.2287, lon: -67.8778, radioM: 7000, alias: ["San Joaquín", "Los Guayos"] },
  { slug: "la-victoria", nombre: "La Victoria", estado: "Aragua", pais: "VE", lat: 10.2273, lon: -67.3312, radioM: 7000 },
  { slug: "cagua-turmero", nombre: "Cagua – Turmero", estado: "Aragua", pais: "VE", lat: 10.2079, lon: -67.4681, radioM: 8000, alias: ["Cagua", "Turmero", "Santa Cruz de Aragua"] },
  { slug: "san-carlos", nombre: "San Carlos", estado: "Cojedes", pais: "VE", lat: 9.6612, lon: -68.5822, radioM: 7000 },
  { slug: "guarenas-guatire", nombre: "Guarenas – Guatire", estado: "Miranda", pais: "VE", lat: 10.4715, lon: -66.6017, radioM: 9000, alias: ["Guarenas", "Guatire"] },
  { slug: "valles-del-tuy", nombre: "Valles del Tuy", estado: "Miranda", pais: "VE", lat: 10.2399, lon: -66.8582, radioM: 9000, alias: ["Charallave", "Cúa", "Ocumare del Tuy", "Santa Teresa del Tuy"] },
  { slug: "maracaibo", nombre: "Maracaibo", estado: "Zulia", pais: "VE", lat: 10.6427, lon: -71.6125, radioM: 18000 },
  { slug: "barquisimeto", nombre: "Barquisimeto", estado: "Lara", pais: "VE", lat: 10.0678, lon: -69.3474, radioM: 12000 },
  { slug: "barcelona-plc", nombre: "Barcelona – Puerto La Cruz", estado: "Anzoátegui", pais: "VE", lat: 10.1667, lon: -64.6833, radioM: 15000, alias: ["Barcelona", "Puerto La Cruz", "Lechería", "Guanta"] },
  { slug: "merida", nombre: "Mérida", estado: "Mérida", pais: "VE", lat: 8.5897, lon: -71.1561, radioM: 10000 },
  { slug: "san-cristobal", nombre: "San Cristóbal", estado: "Táchira", pais: "VE", lat: 7.7669, lon: -72.225, radioM: 10000 },
  { slug: "puerto-ordaz", nombre: "Puerto Ordaz", estado: "Bolívar", pais: "VE", lat: 8.2973, lon: -62.7112, radioM: 15000, alias: ["Ciudad Guayana", "San Félix"] },
  { slug: "cumana", nombre: "Cumaná", estado: "Sucre", pais: "VE", lat: 10.4534, lon: -64.1675, radioM: 10000 },
  { slug: "porlamar", nombre: "Porlamar (Margarita)", estado: "Nueva Esparta", pais: "VE", lat: 10.9577, lon: -63.8497, radioM: 15000, alias: ["Porlamar", "Pampatar", "Margarita", "Isla de Margarita"] },
  // Colombia (6-oct-2026): las siete ciudades con las que Neri arranca alla. `estado` es el departamento.
  { slug: "bogota", nombre: "Bogotá", estado: "Bogotá D.C.", pais: "CO", lat: 4.711, lon: -74.0721, radioM: 20000, alias: ["Bogotá, D.C.", "Bogotá D.C.", "Santa Fe de Bogotá"] },
  { slug: "medellin", nombre: "Medellín", estado: "Antioquia", pais: "CO", lat: 6.2442, lon: -75.5812, radioM: 14000, alias: ["Envigado", "Itagüí", "Bello", "Sabaneta"] },
  { slug: "cali", nombre: "Cali", estado: "Valle del Cauca", pais: "CO", lat: 3.4516, lon: -76.532, radioM: 13000, alias: ["Santiago de Cali"] },
  { slug: "barranquilla", nombre: "Barranquilla", estado: "Atlántico", pais: "CO", lat: 10.9685, lon: -74.7813, radioM: 12000, alias: ["Soledad"] },
  { slug: "cartagena", nombre: "Cartagena", estado: "Bolívar", pais: "CO", lat: 10.391, lon: -75.4794, radioM: 12000, alias: ["Cartagena de Indias"] },
  { slug: "santa-marta", nombre: "Santa Marta", estado: "Magdalena", pais: "CO", lat: 11.2408, lon: -74.199, radioM: 10000 },
  { slug: "cucuta", nombre: "Cúcuta", estado: "Norte de Santander", pais: "CO", lat: 7.8939, lon: -72.5078, radioM: 10000, alias: ["San José de Cúcuta", "Villa del Rosario", "Los Patios"] },
];
export function ciudadPorSlug(slug: string): Ciudad | undefined { return CIUDADES.find((c) => c.slug === slug); }

// Sin acentos, en minusculas y sin puntuacion, para comparar un trozo de direccion
// con el nombre de una ciudad SIN parecidos: "la urbina" no es "la guaira".
export function normalizarNombreCiudad(texto: string): string {
  return (texto ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Coincidencia EXACTA (ya normalizada) contra el nombre o alguno de los alias.
// Nada de startsWith ni includes: "San Cristobal de las Casas" no es San Cristobal
// y "Valencia" de Espana tampoco es la de Carabobo, pero al menos lo parcial no
// inventa ciudades donde solo coincide la primera palabra.
export function ciudadPorNombre(texto: string): Ciudad | undefined {
  const n = normalizarNombreCiudad(texto);
  if (!n) return undefined;
  return CIUDADES.find(
    (c) => normalizarNombreCiudad(c.nombre) === n || (c.alias ?? []).some((a) => normalizarNombreCiudad(a) === n)
  );
}

// El pais de un prospecto sale de su ciudad: no hay columna. Lo que no es una ciudad colombiana del panel es
// Venezuela, que es donde estaba todo antes del 6-oct-2026.
export function paisDeCiudad(nombre: string): Pais {
  return ciudadPorNombre(nombre)?.pais ?? "VE";
}

export function armarConsultaOverpass(etiquetas: [string, string][], c: Ciudad): string {
  const partes = etiquetas.map(([k, v]) => `nwr["${k}"="${v}"](around:${c.radioM},${c.lat},${c.lon});`).join("\n  ");
  return `[out:json][timeout:60];\n(\n  ${partes}\n);\nout center tags;`;
}

type Elemento = { type: string; id: number; tags?: Record<string, string> };

export function prospectosDesdeOverpass(json: unknown, c: Ciudad, nicho: string): EntradaValidada[] {
  const elementos = ((json as { elements?: Elemento[] })?.elements ?? []).filter((e) => e.tags?.name);
  return elementos.map((e) => {
    const t = e.tags!; const fuente = `https://www.openstreetmap.org/${e.type}/${e.id}`;
    const telefono = t.phone ?? t["contact:phone"] ?? ""; const web = t.website ?? t["contact:website"] ?? "";
    const direccion = [t["addr:street"], t["addr:housenumber"], t["addr:suburb"]].filter(Boolean).join(" ");
    const entrada: EntradaValidada = {
      nicho, nombre: t.name.trim(), ciudad: c.nombre, estado: c.estado, tipo: t.tourism ?? t.amenity ?? t.shop ?? "", tamano: t.rooms ? `${t.rooms} hab.` : "",
      telefono, whatsapp: normalizarCelular(t["contact:whatsapp"] ?? "", c.pais) || normalizarCelular(telefono, c.pais), email: t.email ?? t["contact:email"] ?? "", web,
      instagram: normalizarRed(t["contact:instagram"] ?? "", "instagram"), facebook: normalizarRed(t["contact:facebook"] ?? "", "facebook"), tiktok: normalizarRed(t["contact:tiktok"] ?? "", "tiktok"),
      nota: direccion ? `Dirección: ${direccion}` : "", fuentes: [fuente], fuentesPorCampo: {},
    };
    for (const k of ["nombre", "ciudad", "tipo", "tamano", "telefono", "whatsapp", "email", "web", "instagram", "facebook", "tiktok"] as const) if (entrada[k]) entrada.fuentesPorCampo[k] = fuente;
    return entrada;
  });
}
