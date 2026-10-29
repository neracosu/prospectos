// src/lib/correo-propuesta-contrato.ts — el correo de propuesta (29-oct-2026), inicial y de seguimiento. Puro: sin
// node:, sin prisma, sin red. Maqueta probada en Gmail (tabla de 600 px, CSS en linea). Lo consumen las acciones que
// envian el correo y el panel. El unico <img> es el pixel de apertura; el enlace y el PDF llevan el token del envio.
import { limpiarCabecera } from "@/lib/correo-contrato";
import { ANTETITULO_POR_ARQUETIPO, CREDENCIAL_POR_ARQUETIPO, PROMESA_POR_ARQUETIPO, cierreInicial, cierreSeguimiento } from "@/lib/mensajes-nicho-contrato";
import { escapar, fechaLarga, fraseDePromo } from "@/lib/propuesta-contrato";

export const BASE_PANEL = "https://prospectos.neracosu.com";
export const WA_NERI = "584222707095";

export type DatosCorreo = {
  nombre: string; ciudad: string; arquetipo: string; codigo: string; token: string; gancho: string; hojas: number;
  hoy: string; dondeCorreo: string; tipo: "inicial" | "seguimiento";
  enviadoAnteriorEn?: string; // YYYY-MM-DD, solo en el seguimiento
};

const VERDE = "#1f5a45";
const PRESENTACION = "Soy Neri Colón, desarrollador de sistemas. ";
const CREDENCIAL_BASE = "Mis sistemas funcionan en empresas de Caracas, Valencia y el exterior.";
const SALIDA = "Si prefiere no recibir más correos míos, respóndame «no» y no vuelvo a escribir.";

export function enlacesDe(d: DatosCorreo): { ver: string; pdf: string; pixel: string; whatsapp: string } {
  const texto = `Hola Neri, leí la propuesta para ${d.nombre} y quiero ver cómo quedaría con mi marca.`;
  return {
    ver: `${BASE_PANEL}/r/${d.token}`,
    pdf: `${BASE_PANEL}/p/${d.codigo}/pdf?e=${d.token}`,
    pixel: `${BASE_PANEL}/api/correo/a/${d.token}.png`,
    whatsapp: `https://wa.me/${WA_NERI}?text=${encodeURIComponent(texto)}`,
  };
}

const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const promesa = (d: DatosCorreo) => PROMESA_POR_ARQUETIPO[d.arquetipo] ?? "";

export function asuntoPropuesta(d: DatosCorreo): string {
  const nombre = limpiarCabecera(d.nombre);
  if (d.tipo === "seguimiento") return limpiarCabecera(`Le reenvío la propuesta para ${nombre}`);
  const p = promesa(d);
  return limpiarCabecera(p ? `Propuesta para ${nombre}: ${p}` : `Propuesta para ${nombre}`);
}

const previoDe = (d: DatosCorreo) => d.tipo === "seguimiento"
  ? "Le dejo otra vez la propuesta, por si se le pasó."
  : "Le adjunto la propuesta en PDF y un diagnóstico gratis por escrito, sin compromiso.";

// Contenido en bruto (sin escapar): el HTML y el texto plano se arman de lo mismo.
type Contenido = {
  antetitulo: string; titulo: string; saludo: string; presentacion: string; gancho: string;
  intro: string; enganche: string; temporada: string; esSeguimiento: boolean;
};

function contenidoDe(d: DatosCorreo): Contenido {
  const seg = d.tipo === "seguimiento";
  const antetitulo = ANTETITULO_POR_ARQUETIPO[d.arquetipo] ?? "Propuesta";
  const p = promesa(d);
  if (seg) {
    const cuando = d.enviadoAnteriorEn ? `el ${fechaLarga(d.enviadoAnteriorEn)}` : "hace unos días";
    return {
      antetitulo: `${antetitulo} · ${d.ciudad}`, titulo: `Su propuesta, otra vez`, saludo: `Estimado equipo de ${d.nombre}:`,
      presentacion: `Le escribí ${cuando} con la propuesta para ${d.nombre}; se la dejo otra vez aquí:`,
      gancho: "", intro: "", enganche: cierreSeguimiento(d.arquetipo), temporada: "", esSeguimiento: true,
    };
  }
  const promo = fraseDePromo(d.hoy);
  return {
    antetitulo: `${antetitulo} · ${d.ciudad}`,
    titulo: p ? `${mayuscula(p)}.` : "Su propuesta.",
    saludo: `Estimado equipo de ${d.nombre}:`,
    presentacion: PRESENTACION + (CREDENCIAL_POR_ARQUETIPO[d.arquetipo] ?? CREDENCIAL_BASE),
    gancho: d.gancho.trim(),
    intro: `Le adjunto la propuesta completa en PDF, ${d.hojas} hojas pensadas para ${d.nombre}, y aquí la puede leer directo en el teléfono:`,
    enganche: cierreInicial(d.arquetipo),
    temporada: promo, esSeguimiento: false,
  };
}

const parrafo = (t: string, extra = "") =>
  `<p style="margin:0 0 14px;font:16px/1.55 Arial,Helvetica,sans-serif;color:#1a1d1c;${extra}">${t}</p>`;

function boton(href: string, texto: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 22px"><tr>
      <td style="background:${VERDE};border-radius:4px;"><a href="${escapar(href)}" style="display:inline-block;padding:13px 22px;font:700 15px/1 Arial,Helvetica,sans-serif;color:#ffffff;text-decoration:none;">${texto}</a></td>
    </tr></table>`;
}

function cajaGancho(gancho: string): string {
  if (!gancho) return "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 18px"><tr>
<td style="background:#f1f4f2;border-left:4px solid ${VERDE};padding:14px 16px;font:16px/1.55 Georgia,'Times New Roman',serif;color:#1a1d1c;">${escapar(gancho)}</td>
</tr></table>`;
}

function botonWhatsApp(href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 22px"><tr>
      <td style="border:2px solid ${VERDE};border-radius:4px;"><a href="${escapar(href)}" style="display:inline-block;padding:11px 20px;font:700 15px/1 Arial,Helvetica,sans-serif;color:${VERDE};text-decoration:none;">Responder por WhatsApp</a></td>
      <td style="padding-left:14px;font:14px/1.4 Arial,Helvetica,sans-serif;color:#687170;">o responda este mismo correo</td>
    </tr></table>`;
}

const FIRMA_HTML = `<b>Ing. Neri Colón</b><br>
      <span style="color:#687170">NERACOSU · 17 años desarrollando plataformas · La Guaira</span><br>
      <a href="https://neracosu.com" style="color:${VERDE};text-decoration:none;">neracosu.com</a> · <a href="https://wa.me/${WA_NERI}" style="color:${VERDE};text-decoration:none;">WhatsApp 0422-270 7095</a> · <a href="mailto:info@neracosu.com" style="color:${VERDE};text-decoration:none;">info@neracosu.com</a>`;

function cuerpoHtml(d: DatosCorreo, c: Contenido, asunto: string, previo: string): string {
  const e = enlacesDe(d);
  const nombre = escapar(d.nombre);
  const pdf = `<a href="${escapar(e.pdf)}" style="color:${VERDE};">o descargue el PDF</a>`;
  const temporada = c.temporada
    ? parrafo(`<b style="color:${VERDE}">Temporada:</b> ${escapar(c.temporada)}`, "font-size:15px;color:#4a5250")
    : "";
  const centro = c.esSeguimiento
    ? `${parrafo(escapar(c.saludo))}
    ${parrafo(escapar(c.presentacion))}
    ${boton(e.ver, "Ver la propuesta")}
    ${parrafo(pdf, "font-size:14px")}
    ${parrafo(escapar(c.enganche))}`
    : `${parrafo(escapar(c.saludo))}
    ${parrafo(escapar(c.presentacion))}
    ${cajaGancho(c.gancho)}
    ${parrafo(escapar(c.intro))}
    ${boton(e.ver, "Ver la propuesta")}
    ${parrafo(pdf, "font-size:14px")}
    ${parrafo(escapar(c.enganche))}`;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapar(asunto)}</title></head>
<body style="margin:0;padding:0;background:#e9ecea;">
<div style="display:none;max-height:0;overflow:hidden;color:#e9ecea;">${escapar(previo)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#e9ecea;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #d0d6d3;">
  <tr><td style="padding:22px 28px 18px;border-bottom:1px solid #d0d6d3;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font:700 20px/1 Arial,Helvetica,sans-serif;letter-spacing:.14em;color:#1a1d1c;">NERACOSU<span style="color:#5ed29c">.</span></td>
      <td align="right" style="font:12px/1.3 Arial,Helvetica,sans-serif;color:#687170;text-transform:uppercase;letter-spacing:.08em;">Propuesta para<br><b style="color:#1a1d1c;text-transform:none;letter-spacing:0;font-size:13px">${nombre}</b></td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:30px 28px 8px;">
    <p style="margin:0 0 6px;font:12px/1.3 Arial,Helvetica,sans-serif;color:#93661c;text-transform:uppercase;letter-spacing:.12em;">${escapar(c.antetitulo)}</p>
    <h1 style="margin:0 0 20px;font:400 28px/1.2 Georgia,'Times New Roman',serif;color:#1a1d1c;">${escapar(c.titulo)}</h1>
    ${centro}
    ${botonWhatsApp(e.whatsapp)}
    ${temporada}
  </td></tr>
  <tr><td style="padding:8px 28px 26px;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-top:1px solid #d0d6d3;width:100%;"><tr><td style="padding-top:18px;font:15px/1.5 Arial,Helvetica,sans-serif;color:#1a1d1c;">
      ${FIRMA_HTML}
    </td></tr></table>
  </td></tr>
</table>
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;"><tr><td style="padding:16px 10px 0;font:12px/1.5 Arial,Helvetica,sans-serif;color:#687170;">
  Le escribo porque ${nombre} publica este correo en ${escapar(d.dondeCorreo)}. ${SALIDA}
</td></tr></table>
</td></tr></table>
<img src="${escapar(e.pixel)}" width="1" height="1" alt="" style="display:block">
</body></html>`;
}

function cuerpoTexto(d: DatosCorreo, c: Contenido): string {
  const e = enlacesDe(d);
  const lineas = c.esSeguimiento
    ? [c.saludo, "", c.presentacion, e.ver, `O descargue el PDF: ${e.pdf}`, "", c.enganche, ""]
    : [c.saludo, "", c.presentacion, "", ...(c.gancho ? [c.gancho, ""] : []), c.intro, e.ver, `O descargue el PDF: ${e.pdf}`, "", c.enganche, ""];
  return [
    ...lineas,
    `Responder por WhatsApp: ${e.whatsapp}`,
    "o responda este mismo correo.",
    "",
    ...(c.temporada ? [`Temporada: ${c.temporada}`, ""] : []),
    "Ing. Neri Colón",
    "NERACOSU · 17 años desarrollando plataformas · La Guaira",
    "neracosu.com · WhatsApp 0422-270 7095 · info@neracosu.com",
    "",
    `Le escribo porque ${d.nombre} publica este correo en ${d.dondeCorreo}. ${SALIDA}`,
  ].join("\n");
}

export function armarCorreoPropuesta(d: DatosCorreo): { asunto: string; previo: string; html: string; texto: string } {
  const asunto = asuntoPropuesta(d);
  const previo = previoDe(d);
  const c = contenidoDe(d);
  return { asunto, previo, html: cuerpoHtml(d, c, asunto, previo), texto: cuerpoTexto(d, c) };
}

// Ventana del envio automatico: lunes a viernes, 09:00 a 16:59 hora de Caracas.
export function ventanaDeEnvio(ahora: Date): boolean {
  const partes = new Intl.DateTimeFormat("es-VE", { timeZone: "America/Caracas", weekday: "short", hour: "2-digit", hour12: false }).formatToParts(ahora);
  const dia = (partes.find((p) => p.type === "weekday")?.value ?? "").toLowerCase().replace(".", "");
  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? "-1") % 24;
  return ["lun", "mar", "mie", "mié", "jue", "vie"].includes(dia) && hora >= 9 && hora <= 16;
}

// Cuantos manda cada pasada del cron (9 pasadas al dia): el tope diario repartido en ocho.
export function tamanoLote(tope: number): number {
  return Math.max(1, Math.ceil(tope / 8));
}
