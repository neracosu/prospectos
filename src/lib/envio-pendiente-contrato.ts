import { CANALES, type Canal } from "@/lib/canales-contrato";

// «Toque el canal y me fui a WhatsApp»: lo que la tarjeta recuerda en sessionStorage para volver a preguntar
// «¿Se envio?» si el navegador recargo la pestana mientras tanto (pasada de UX, fase B). Uno solo a la vez:
// el ultimo canal tocado pisa al anterior. Puro: el acceso a sessionStorage vive en el componente.
export const CLAVE_ENVIO_PENDIENTE = "pr:envio-pendiente";
export const VIGENCIA_ENVIO_MS = 30 * 60 * 1000;
// `accion` dice que ejecuta el «Si»: marcar enviado o registrar un seguimiento. Sin ella, un recuerdo de Hoy
// (envio) que sobrevivio a una recarga aparecia en la ficha ya enviada y su «Si» registraba un seguimiento falso.
export const ACCIONES_ENVIO = ["envio", "seguimiento"] as const;
export type AccionEnvio = (typeof ACCIONES_ENVIO)[number];
export type EnvioPendiente = { prospectoId: number; canal: Canal; accion: AccionEnvio; en: number };

export function serializarEnvio(e: EnvioPendiente): string {
  return JSON.stringify({ prospectoId: e.prospectoId, canal: e.canal, accion: e.accion, en: e.en });
}

// Lo guardado es texto que pudo tocar cualquiera: se valida la forma entera o no vale.
export function leerEnvio(texto: string | null, ahora: number): EnvioPendiente | null {
  if (!texto) return null;
  let v: unknown;
  try { v = JSON.parse(texto); } catch { return null; }
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const { prospectoId, canal, accion, en } = v as Record<string, unknown>;
  if (typeof prospectoId !== "number" || !Number.isInteger(prospectoId) || prospectoId <= 0) return null;
  if (typeof canal !== "string" || !(CANALES as readonly string[]).includes(canal)) return null;
  if (typeof accion !== "string" || !(ACCIONES_ENVIO as readonly string[]).includes(accion)) return null;
  if (typeof en !== "number" || !Number.isFinite(en)) return null;
  if (en > ahora || ahora - en >= VIGENCIA_ENVIO_MS) return null;
  return { prospectoId, canal: canal as Canal, accion: accion as AccionEnvio, en };
}
