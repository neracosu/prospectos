import { normalizarCelular, normalizarRed } from "@/lib/celular-contrato";
import type { EntradaValidada } from "@/lib/tabla-contrato";

export type Ciudad = { slug: string; nombre: string; estado: string; lat: number; lon: number; radioM: number };
export const CIUDADES: Ciudad[] = [
  { slug: "caracas", nombre: "Caracas", estado: "Distrito Capital", lat: 10.4806, lon: -66.9036, radioM: 18000 },
  { slug: "la-guaira", nombre: "La Guaira", estado: "La Guaira", lat: 10.6031, lon: -66.9354, radioM: 12000 },
  { slug: "los-teques", nombre: "Los Teques", estado: "Miranda", lat: 10.3444, lon: -67.0428, radioM: 8000 },
  { slug: "valencia", nombre: "Valencia", estado: "Carabobo", lat: 10.162, lon: -68.0077, radioM: 15000 },
  { slug: "maracay", nombre: "Maracay", estado: "Aragua", lat: 10.2469, lon: -67.5958, radioM: 12000 },
  { slug: "maracaibo", nombre: "Maracaibo", estado: "Zulia", lat: 10.6427, lon: -71.6125, radioM: 18000 },
  { slug: "barquisimeto", nombre: "Barquisimeto", estado: "Lara", lat: 10.0678, lon: -69.3474, radioM: 12000 },
  { slug: "barcelona-plc", nombre: "Barcelona – Puerto La Cruz", estado: "Anzoátegui", lat: 10.1667, lon: -64.6833, radioM: 15000 },
  { slug: "merida", nombre: "Mérida", estado: "Mérida", lat: 8.5897, lon: -71.1561, radioM: 10000 },
  { slug: "san-cristobal", nombre: "San Cristóbal", estado: "Táchira", lat: 7.7669, lon: -72.225, radioM: 10000 },
  { slug: "puerto-ordaz", nombre: "Puerto Ordaz", estado: "Bolívar", lat: 8.2973, lon: -62.7112, radioM: 15000 },
  { slug: "cumana", nombre: "Cumaná", estado: "Sucre", lat: 10.4534, lon: -64.1675, radioM: 10000 },
  { slug: "porlamar", nombre: "Porlamar (Margarita)", estado: "Nueva Esparta", lat: 10.9577, lon: -63.8497, radioM: 15000 },
];
export function ciudadPorSlug(slug: string): Ciudad | undefined { return CIUDADES.find((c) => c.slug === slug); }

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
      telefono, whatsapp: normalizarCelular(t["contact:whatsapp"] ?? "") || normalizarCelular(telefono), email: t.email ?? t["contact:email"] ?? "", web,
      instagram: normalizarRed(t["contact:instagram"] ?? "", "instagram"), facebook: normalizarRed(t["contact:facebook"] ?? "", "facebook"), tiktok: normalizarRed(t["contact:tiktok"] ?? "", "tiktok"),
      nota: direccion ? `Dirección: ${direccion}` : "", fuentes: [fuente], fuentesPorCampo: {},
    };
    for (const k of ["nombre", "ciudad", "tipo", "tamano", "telefono", "whatsapp", "email", "web", "instagram", "facebook", "tiktok"] as const) if (entrada[k]) entrada.fuentesPorCampo[k] = fuente;
    return entrada;
  });
}
