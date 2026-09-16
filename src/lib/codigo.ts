import { randomBytes } from "node:crypto";
// 16 bytes aleatorios: no se adivina ni se recorre. Vale para /p/<codigo> y
// para el portal del cliente (pieza 5).
export function generarCodigo(): string {
  return randomBytes(16).toString("base64url");
}

// base64url de 16 bytes: siempre 22 caracteres. Unica fuente de este patron;
// las rutas /p/<codigo> lo importan en vez de repetir el regex.
export const CODIGO_VALIDO = /^[A-Za-z0-9_-]{22}$/;
