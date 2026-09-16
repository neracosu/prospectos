import { randomBytes } from "node:crypto";
// 16 bytes aleatorios: no se adivina ni se recorre. Vale para /p/<codigo> y
// para el portal del cliente (pieza 5).
export function generarCodigo(): string {
  return randomBytes(16).toString("base64url");
}
