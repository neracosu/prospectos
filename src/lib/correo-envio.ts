// src/lib/correo-envio.ts — envio de la propuesta por correo (nodemailer sobre el sendmail local, con adjunto).
// Usa node: : fuera de la cadena de src/instrumentation.ts.
import nodemailer from "nodemailer";

const DE = "info@neracosu.com";
const REMITENTE = `NERACOSU <${DE}>`;

export type Mensaje = { para: string; asunto: string; html: string; texto: string; adjunto?: { nombre: string; ruta: string } };
type Transporte = { sendMail: (o: Record<string, unknown>) => Promise<{ messageId: string }> };

let deTests: Transporte | null = null;
export function _transporteParaTests(t: Transporte | null): void { deTests = t; }

let real: Transporte | null = null;
function transporte(): Transporte {
  if (deTests) return deTests;
  real ??= nodemailer.createTransport({ sendmail: true, path: "/usr/sbin/sendmail", args: ["-i", "-f", DE], newline: "unix" }) as unknown as Transporte;
  return real;
}

export async function enviarCorreo(m: Mensaje): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  // Fuera de produccion no sale nada (tests, next dev), salvo el transporte capturable de los tests.
  if (!deTests && process.env.NODE_ENV !== "production") {
    return process.env.PROSPECTOS_CORREO_SIMULADO === "1" ? { ok: true, id: "simulado" } : { ok: false, error: "fuera de produccion" };
  }
  try {
    const r = await transporte().sendMail({
      from: REMITENTE,
      replyTo: REMITENTE,
      envelope: { from: DE, to: m.para },
      to: m.para,
      subject: m.asunto,
      html: m.html,
      text: m.texto,
      ...(m.adjunto ? { attachments: [{ filename: m.adjunto.nombre, path: m.adjunto.ruta, contentType: "application/pdf" }] } : {}),
    });
    return { ok: true, id: r.messageId };
  } catch (e) {
    return { ok: false, error: (e instanceof Error ? e.message : String(e)).slice(0, 300) };
  }
}
