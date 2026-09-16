// src/lib/rate-limit.ts — limite de intentos en memoria del proceso (un solo PM2).
const intentos = new Map<string, { n: number; desde: number }>();
const MAX_ENTRADAS = 10_000;

export function permitirIntento(claveOriginal: string, max = 5, ventanaMs = 15 * 60_000): boolean {
  const clave = claveOriginal.slice(0, 200);
  const ahora = Date.now();
  const reg = intentos.get(clave);
  if (!reg || ahora - reg.desde > ventanaMs) {
    if (intentos.size >= MAX_ENTRADAS) {
      for (const [k, v] of intentos) if (ahora - v.desde > ventanaMs) intentos.delete(k);
    }
    intentos.set(clave, { n: 1, desde: ahora });
    return true;
  }
  reg.n += 1;
  return reg.n <= max;
}

// Solo para tests.
export function _reiniciarIntentos(): void { intentos.clear(); }
