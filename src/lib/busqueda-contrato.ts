// src/lib/busqueda-contrato.ts — busqueda global del panel (panel CRM, fase 4). Puro: normaliza la consulta y ordena
// los resultados que trae la accion buscarGlobal. Lo importa tambien el navegador (BusquedaGlobal).
export type TipoResultado = "lead" | "directorio" | "cliente" | "proyecto";
export type ResultadoBusqueda = { tipo: TipoResultado; id: number; titulo: string; sub: string; href: string };
export const ETIQUETA_TIPO: Record<TipoResultado, string> = { lead: "Lead", directorio: "Directorio", cliente: "Cliente", proyecto: "Proyecto" };
export const TOPE_RESULTADOS = 20;
const ORDEN_TIPO: Record<TipoResultado, number> = { lead: 0, proyecto: 1, cliente: 2, directorio: 3 };

// Recorta, colapsa espacios y exige al menos dos caracteres; mas de 80 se cortan.
export function normalizarConsulta(q: string): string {
  const t = (q ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  return t.length >= 2 ? t : "";
}

const plano = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

// Primero lo que EMPIEZA por la consulta (sin acentos ni mayusculas), luego lo que la contiene; dentro de cada grupo
// por tipo (lead, proyecto, cliente, directorio) y por titulo. Tope de 20.
export function ordenarResultados(q: string, lista: ResultadoBusqueda[]): ResultadoBusqueda[] {
  const n = plano(normalizarConsulta(q));
  const grupo = (r: ResultadoBusqueda) => (n && plano(r.titulo).startsWith(n) ? 0 : 1);
  return [...lista]
    .sort((a, b) => grupo(a) - grupo(b) || ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo] || plano(a.titulo).localeCompare(plano(b.titulo)))
    .slice(0, TOPE_RESULTADOS);
}
