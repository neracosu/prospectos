// "Hoy" es el dia de Caracas (UTC-4 fijo, sin horario de verano), no el del
// servidor ni el del navegador. Todo lo que diga "hoy" pasa por aqui.
const DESFASE_MS = -4 * 60 * 60 * 1000;

export function hoyCaracas(ahora: Date = new Date()): string {
  return new Date(ahora.getTime() + DESFASE_MS).toISOString().slice(0, 10);
}

export function esFechaIso(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(fecha + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function tocaHoy(proximo: string | null, hoy: string): boolean {
  return proximo !== null && proximo <= hoy;
}

// Fecha de negocio (YYYY-MM-DD) como se escribe en Venezuela: dd/mm/aaaa.
export function fechaVisible(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
