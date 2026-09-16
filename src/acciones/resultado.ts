// Toda Server Action devuelve esto. Nunca una excepcion.
export type Resultado<T = undefined> =
  | { ok: true; datos: T }
  | { ok: false; mensaje: string };

export function fallo(mensaje: string): { ok: false; mensaje: string } {
  return { ok: false, mensaje };
}
export function exito(): { ok: true; datos: undefined };
export function exito<T>(datos: T): { ok: true; datos: T };
export function exito<T>(datos?: T) {
  return { ok: true, datos };
}
