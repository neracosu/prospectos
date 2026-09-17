import { CANALES, type Canal } from "@/lib/canales-contrato";

// «Toque el canal y me fui a WhatsApp»: lo que la tarjeta recuerda en sessionStorage para volver a preguntar
// «¿Se envio?» si el navegador recargo la pestana mientras tanto (pasada de UX, fase B). Uno solo a la vez:
// el ultimo canal tocado pisa al anterior. Puro: el acceso a sessionStorage vive en el componente.
export const CLAVE_ENVIO_PENDIENTE = "pr:envio-pendiente";
export const VIGENCIA_ENVIO_MS = 30 * 60 * 1000;
export type EnvioPendiente = { prospectoId: number; canal: Canal; en: number };

export function serializarEnvio(e: EnvioPendiente): string {
  return JSON.stringify({ prospectoId: e.prospectoId, canal: e.canal, en: e.en });
}

// Lo guardado es texto que pudo tocar cualquiera: se valida la forma entera o no vale.
export function leerEnvio(texto: string | null, ahora: number): EnvioPendiente | null {
  if (!texto) return null;
  let v: unknown;
  try { v = JSON.parse(texto); } catch { return null; }
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const { prospectoId, canal, en } = v as Record<string, unknown>;
  if (typeof prospectoId !== "number" || !Number.isInteger(prospectoId) || prospectoId <= 0) return null;
  if (typeof canal !== "string" || !(CANALES as readonly string[]).includes(canal)) return null;
  if (typeof en !== "number" || !Number.isFinite(en)) return null;
  if (en > ahora || ahora - en >= VIGENCIA_ENVIO_MS) return null;
  return { prospectoId, canal: canal as Canal, en };
}
