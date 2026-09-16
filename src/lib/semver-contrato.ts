export const TIPOS_CAMBIO = ["nuevo", "mejora", "arreglo"] as const;
export type TipoCambio = (typeof TIPOS_CAMBIO)[number];
export const ETIQUETA_CAMBIO: Record<TipoCambio, string> = { nuevo: "Nuevo", mejora: "Mejora", arreglo: "Arreglo" };

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export function esSemver(s: string): boolean {
  return SEMVER.test(s);
}
export function compararSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

// Encabezados que se reconocen (espanol e ingles, Keep a Changelog).
const TIPO_POR_ENCABEZADO: Record<string, TipoCambio> = {
  nuevo: "nuevo", nuevos: "nuevo", agregado: "nuevo", added: "nuevo",
  mejora: "mejora", mejoras: "mejora", cambiado: "mejora", changed: "mejora",
  arreglo: "arreglo", arreglos: "arreglo", corregido: "arreglo", fixed: "arreglo",
};

// Convierte el bloque pegado de CHANGELOG.md en cambios. Las vinetas bajo un
// encabezado desconocido se ignoran; las vinetas sin encabezado son "mejora".
export function parsearChangelog(md: string): { tipo: TipoCambio; texto: string }[] {
  const salida: { tipo: TipoCambio; texto: string }[] = [];
  let tipo: TipoCambio | null = "mejora";
  for (const linea of md.split(/\r?\n/)) {
    const enc = linea.match(/^#{1,6}\s+(.+?)\s*$/);
    if (enc) { tipo = TIPO_POR_ENCABEZADO[enc[1].trim().toLowerCase()] ?? null; continue; }
    const vineta = linea.match(/^\s*[-*+]\s+(.+?)\s*$/);
    if (vineta && tipo) salida.push({ tipo, texto: vineta[1] });
  }
  return salida;
}
