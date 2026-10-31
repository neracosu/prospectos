// src/lib/correos-contrato.ts — lo puro de la pantalla /correos (29-oct-2026): filtros, porcentajes, hitos del envio y
// el texto del proximo lote del automatico. Lo importa el navegador: sin prisma, sin node:, sin red.
import { tamanoLote } from "@/lib/correo-propuesta-contrato";

export const ESTADOS_COLA = ["listas", "enviadas", "seguimiento", "fallidas", "bloqueadas"] as const;
export type EstadoCola = (typeof ESTADOS_COLA)[number];
export const ETIQUETA_ESTADO_COLA: Record<EstadoCola, string> = {
  listas: "Listas", enviadas: "Enviadas", seguimiento: "Seguimiento", fallidas: "Fallidas", bloqueadas: "Bloqueadas",
};
export const esEstadoCola = (s: string): s is EstadoCola => (ESTADOS_COLA as readonly string[]).includes(s);

export function porcentaje(n: number, de: number): string {
  return de > 0 ? `${Math.round((n * 100) / de)} %` : "—";
}

export function recortar(s: string, max = 90): string {
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}

export function fechaCorta(d: Date): string {
  return new Date(d).toLocaleDateString("es-VE", { timeZone: "America/Caracas", day: "2-digit", month: "2-digit" });
}

export type EnvioVisible = { id: number; tipo: string; enviadoEn: Date; abiertoEn: Date | null; clicEn: Date | null; pdfEn: Date | null; fallo: string };

// Un envio que salio de verdad (la reserva «en curso» todavia no lo es para la pantalla).
export const yaEnviado = (e: EnvioVisible | null): boolean => !!e && e.fallo === "";

export function hitosDe(e: EnvioVisible | null): string[] {
  if (!e) return [];
  if (e.fallo === "en curso") return ["Enviando…"];
  // «interrumpido»: el proceso murio a medias; el correo pudo haber salido antes de que se anotara.
  if (e.fallo === "interrumpido") return [`Falló ${fechaCorta(e.enviadoEn)}: interrumpido (puede haber salido)`];
  if (e.fallo) return [`Falló ${fechaCorta(e.enviadoEn)}: ${e.fallo}`];
  const h = [`${e.tipo === "seguimiento" ? "Seguimiento" : "Enviado"} ${fechaCorta(e.enviadoEn)}`];
  if (e.abiertoEn) h.push(`Abrió ${fechaCorta(e.abiertoEn)}`);
  if (e.clicEn) h.push(`Vio ${fechaCorta(e.clicEn)}`);
  if (e.pdfEn) h.push(`PDF ${fechaCorta(e.pdfEn)}`);
  return h;
}

// Una sola regla para la tabla, la hoja y el servidor. A mano, una ficha cuyo nombre no coincide con la web sale solo si
// Neri ya la reviso (al guardar el gancho queda «revisada»); el automatico nunca la toma. Un correo bloqueado no sale nunca.
// "pedido" (31-oct-2026): el propio negocio pidio la propuesta por correo (por ejemplo, respondiendo al WhatsApp). Sale
// aunque ya se le haya escrito por otro canal, sin ficha y con un correo generico: lo dio el mismo.
export type ModoEnvio = "manual" | "automatico" | "pedido";
export function puedeEnviar(f: { bloqueado: string; nombreNoCoincide: boolean; estadoFicha: string; arquetipo: string }, modo: ModoEnvio): boolean {
  if (f.bloqueado || f.arquetipo === "") return false;
  if (modo === "pedido") return true;
  if (f.nombreNoCoincide) return modo === "manual" && f.estadoFicha === "revisada";
  return true;
}

// El cron corre al minuto 0 de cada hora; el automatico solo manda de lunes a viernes de 9:00 a 16:59 de Caracas
// (UTC-4 fijo). Devuelve cuando sale el siguiente lote, en palabras.
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
export function proximoLote(ahora: Date, o: { activo: boolean; delDia: number; tope: number }): string {
  if (!o.activo) return "Pausado: no sale nada solo.";
  const local = new Date(ahora.getTime() - 4 * 3600_000); // campos UTC = hora de Caracas
  const dia = local.getUTCDay(), hora = local.getUTCHours();
  const habil = (d: number) => d >= 1 && d <= 5;
  const lote = `hasta ${tamanoLote(o.tope)} correos.`;
  const topeCumplido = o.delDia >= o.tope;
  if (!topeCumplido && habil(dia) && hora < 16 && hora >= 8) return `Próximo lote hoy a las ${hora + 1}:00, ${lote}`;
  if (!topeCumplido && habil(dia) && hora < 8) return `Próximo lote hoy a las 9:00, ${lote}`;
  let n = 1;
  while (!habil((dia + n) % 7)) n++;
  const cuando = n === 1 ? "mañana" : `el ${DIAS[(dia + n) % 7]}`;
  return `${topeCumplido ? "El tope de hoy ya se cumplió. " : ""}Próximo lote ${cuando} a las 9:00, ${lote}`;
}
