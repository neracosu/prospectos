// src/lib/correo-contrato.ts — piezas puras del correo (sin node:, sin red): las usan correo.ts y el contrato del
// correo de propuesta. Nada que venga de fuera llega a una cabecera con un salto de linea (inyeccion de cabeceras).
export function limpiarCabecera(s: string): string {
  return s.replace(/[\r\n\t]+/g, " ").replace(/[^\x20-\x7e\u00a0-\uffff]/g, "").trim().slice(0, 200);
}

export function codificar(s: string): string {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;
}
