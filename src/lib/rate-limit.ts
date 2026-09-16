// src/lib/rate-limit.ts — bloqueo por intentos FALLIDOS, en memoria del proceso (un solo PM2).
const fallos = new Map<string, { n: number; desde: number }>();
const MAX_ENTRADAS = 10_000;
export const MAX_FALLOS = 5;
export const VENTANA_MS = 15 * 60_000;

function podar(mapa: Map<string, { n: number; desde: number }>, ahora: number, ventanaMs: number) {
  for (const [k, v] of mapa) if (ahora - v.desde > ventanaMs) mapa.delete(k);
  // Si todo esta fresco, sale el mas viejo: el Map tiene tope real.
  while (mapa.size >= MAX_ENTRADAS) {
    const primero = mapa.keys().next().value;
    if (primero === undefined) break;
    mapa.delete(primero);
  }
}

// true si la clave esta bloqueada (alcanzo el maximo dentro de la ventana).
export function bloqueado(claveOriginal: string, max = MAX_FALLOS, ventanaMs = VENTANA_MS, ahora = Date.now()): boolean {
  const clave = claveOriginal.slice(0, 200);
  const reg = fallos.get(clave);
  if (!reg) return false;
  if (ahora - reg.desde > ventanaMs) { fallos.delete(clave); return false; }
  return reg.n >= max;
}

// Registra un fallo. Al cruzar el maximo, reinicia `desde` para que el bloqueo dure la ventana completa.
export function registrarFallo(claveOriginal: string, max = MAX_FALLOS, ventanaMs = VENTANA_MS, ahora = Date.now()): void {
  const clave = claveOriginal.slice(0, 200);
  const reg = fallos.get(clave);
  if (!reg || ahora - reg.desde > ventanaMs) { podar(fallos, ahora, ventanaMs); fallos.set(clave, { n: 1, desde: ahora }); return; }
  reg.n += 1;
  if (reg.n === max) reg.desde = ahora;
}

export function olvidarFallos(claveOriginal: string): void { fallos.delete(claveOriginal.slice(0, 200)); }

// Solo para tests.
export function _reiniciarIntentos(): void { fallos.clear(); intentos.clear(); }

// --- Contador simple por ventana: cada llamada cuenta, exito o fallo. Lo usan
// limites que no distinguen entre los dos (por ejemplo /p/<codigo> mas adelante).
const intentos = new Map<string, { n: number; desde: number }>();

export function permitirIntento(claveOriginal: string, max = 5, ventanaMs = 15 * 60_000, ahora = Date.now()): boolean {
  const clave = claveOriginal.slice(0, 200);
  const reg = intentos.get(clave);
  if (!reg || ahora - reg.desde > ventanaMs) {
    podar(intentos, ahora, ventanaMs);
    intentos.set(clave, { n: 1, desde: ahora });
    return true;
  }
  reg.n += 1;
  return reg.n <= max;
}
