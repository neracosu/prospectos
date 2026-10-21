// src/lib/correo.ts — aviso por correo de cada solicitud que llega por neracosu.com (21-oct). Sale por el sendmail
// local del servidor (exim de cPanel); info@neracosu.com reenvia al Gmail de Neri. Usa node: : fuera de la cadena de
// src/instrumentation.ts.
import { spawn } from "node:child_process";
import type { SolicitudNormal } from "@/lib/web-contrato";

const DE = "info@neracosu.com";
const PARA = () => process.env.PROSPECTOS_AVISO_CORREO || "info@neracosu.com";
const PANEL = "https://prospectos.neracosu.com/web";

// Nada que venga de la web llega a una cabecera con un salto de linea (inyeccion de cabeceras).
export function limpiarCabecera(s: string): string {
  return s.replace(/[\r\n\t]+/g, " ").replace(/[^\x20-\x7e\u00a0-\uffff]/g, "").trim().slice(0, 200);
}

function codificar(s: string): string {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;
}

export function armarCorreo(d: SolicitudNormal): string {
  const asunto = `Solicitud web: ${limpiarCabecera(d.nombre)} (${limpiarCabecera(d.tipo)})`;
  const responderA = d.correo && !/[\r\n]/.test(d.correo) ? `Reply-To: ${limpiarCabecera(d.correo)}\n` : "";
  const wa = d.whatsapp.replace(/\D/g, "");
  const cuerpo = [
    `${d.nombre} escribio desde neracosu.com${d.pagina ? ` (${d.pagina})` : ""}.`,
    "",
    `Tipo de proyecto: ${d.tipo}`,
    d.presupuesto ? `Presupuesto: ${d.presupuesto}` : "",
    d.correo ? `Correo: ${d.correo}` : "",
    d.whatsapp ? `WhatsApp: ${d.whatsapp}${wa ? `  ->  https://wa.me/${wa}` : ""}` : "",
    "",
    "Mensaje:",
    d.mensaje,
    "",
    `Verla en el panel: ${PANEL}`,
  ].filter((l, i, xs) => l !== "" || xs[i - 1] !== "").join("\n");
  return `From: Web NERACOSU <${DE}>\nTo: ${PARA()}\n${responderA}Subject: ${codificar(asunto)}\nMIME-Version: 1.0\nContent-Type: text/plain; charset=UTF-8\nContent-Transfer-Encoding: 8bit\n\n${cuerpo}\n`;
}

// true si sendmail lo acepto. Fuera de produccion no manda nada (tests, next dev).
export async function avisarSolicitud(d: SolicitudNormal): Promise<boolean> {
  if (process.env.NODE_ENV !== "production") return false;
  const mensaje = armarCorreo(d);
  return new Promise((resolver) => {
    let listo = false;
    const fin = (ok: boolean) => { if (!listo) { listo = true; resolver(ok); } };
    try {
      const p = spawn("/usr/sbin/sendmail", ["-t", "-i", "-f", DE], { stdio: ["pipe", "ignore", "pipe"] });
      const plazo = setTimeout(() => { p.kill(); fin(false); }, 15_000);
      p.on("error", (e) => { clearTimeout(plazo); console.error("avisarSolicitud", e); fin(false); });
      p.on("close", (codigo) => { clearTimeout(plazo); if (codigo !== 0) console.error("avisarSolicitud: sendmail salio con", codigo); fin(codigo === 0); });
      p.stdin.end(mensaje, "utf8");
    } catch (e) { console.error("avisarSolicitud", e); fin(false); }
  });
}
