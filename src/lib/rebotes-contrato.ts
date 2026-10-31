// src/lib/rebotes-contrato.ts -- lee un mensaje crudo del buzon (maildir) y, si es un aviso de rebote (DSN), saca los
// destinatarios que fallaron, el estado y el motivo. Puro: sin node:, sin prisma, sin red. Lo usa scripts/leer-rebotes.mts.
// Formatos vistos el 2026-10-31 en info@: el DSN de exim (Mailer-Daemon@<servidor>, «Mail delivery failed») y el de Gmail
// (mailer-daemon@googlemail.com, «Delivery Status Notification (Failure)»). Los dos traen X-Failed-Recipients y una parte
// message/delivery-status con Final-Recipient, Action y Status.

export type Rebote = {
  fallidos: string[];       // direcciones normalizadas (minusculas, sin espacios)
  estado: string;           // «5.1.1», «5.0.0», «4.4.1» o «» si no vino
  permanente: boolean;      // 5.x.x o Action: failed sin estado; un 4.x.x es temporal y no se bloquea
  motivo: string;           // una linea, hasta 200 caracteres
  asuntoOriginal: string;   // el asunto del mensaje que reboto, si el DSN lo incluye
};

const unfold = (s: string) => s.replace(/\r\n/g, "\n").replace(/\n[ \t]+/g, " ");

function cabeceras(crudo: string): string {
  const i = crudo.indexOf("\n\n");
  return i < 0 ? crudo : crudo.slice(0, i);
}

function direcciones(s: string): string[] {
  return [...s.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)].map((m) => m[0].toLowerCase());
}

export function esAvisoDeRebote(crudo: string): boolean {
  const cab = unfold(cabeceras(crudo));
  if (/^X-Failed-Recipients:/im.test(cab)) return true;
  if (/^Content-Type:.*multipart\/report.*report-type=delivery-status/im.test(cab)) return true;
  return /^From:.*mailer-daemon/im.test(cab) && /^Subject:.*(delivery|deliver|undeliver|returned|failure)/im.test(cab);
}

export function leerRebote(crudo: string): Rebote | null {
  if (!esAvisoDeRebote(crudo)) return null;
  const texto = unfold(crudo);
  const fallidos = new Set<string>();
  for (const m of texto.matchAll(/^X-Failed-Recipients:\s*(.+)$/gim)) direcciones(m[1]).forEach((d) => fallidos.add(d));
  for (const m of texto.matchAll(/^(?:Final|Original)-Recipient:\s*(?:rfc822;)?\s*(.+)$/gim)) direcciones(m[1]).forEach((d) => fallidos.add(d));
  const estado = /^Status:\s*([245]\.\d{1,3}\.\d{1,3})/im.exec(texto)?.[1] ?? "";
  const accion = /^Action:\s*(\w+)/im.exec(texto)?.[1]?.toLowerCase() ?? "";
  const permanente = estado ? estado.startsWith("5") : accion === "failed" || /permanent error|could not be delivered|wasn.t delivered/i.test(texto);
  const motivoCrudo = /^Diagnostic-Code:\s*(?:smtp;)?\s*(.+)$/im.exec(texto)?.[1]
    ?? /^\s*(5\d\d[ -].+)$/m.exec(texto)?.[1]
    ?? /(Address not found[^\n]*|The mail server could not deliver mail[^\n]*|mailbox is disabled[^\n]*|does not exist[^\n]*)/i.exec(texto)?.[1]
    ?? "";
  const motivo = motivoCrudo.replace(/\s+/g, " ").trim().slice(0, 200);
  // El asunto original viene en la parte text/rfc822-headers (despues del asunto del propio aviso).
  const asuntos = [...texto.matchAll(/^Subject:\s*(.+)$/gim)].map((m) => m[1].trim());
  const asuntoOriginal = asuntos.length > 1 ? asuntos[asuntos.length - 1] : "";
  return { fallidos: [...fallidos], estado, permanente, motivo, asuntoOriginal };
}
