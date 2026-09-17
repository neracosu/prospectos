// src/lib/recibos-contrato.ts — reglas puras de los recibos (pieza 4). Sin base, sin disco, sin node:.
import { ETIQUETA_CANAL_COBRO, nombreMes, type CanalCobro, type Concepto } from "@/lib/cobros-contrato";
import { formatoUSD } from "@/lib/dinero";
import { fechaVisible } from "@/lib/fecha-caracas";
import { compararSemver } from "@/lib/semver-contrato";
import type { DatosEmisor } from "@/lib/configuracion";

export const SERIE_RECIBO = "R";
// "Recibo de pago", nunca "factura": la factura es un documento fiscal del SENIAT y este panel no la emite.
export const PIE_RECIBO = "Este documento es un recibo de pago y no constituye factura fiscal.";
export const PIE_NOTA = "Esta nota deja sin efecto el recibo indicado. No constituye documento fiscal.";
// R-AAAA-NNNN: cuatro digitos como minimo; pasado el 9999 el numero crece, no se reinicia.
export const NUMERO_RECIBO = /^R-(\d{4})-(\d{4,})$/;
// Un documento guardado: el recibo o su nota de anulacion (-A).
export const DOCUMENTO_RECIBO = /^R-(\d{4})-\d{4,}(-A)?$/;
// Lo unico que acepta la ruta de descarga. [1] = numero del recibo, [3] = "-A" si es la nota.
export const ARCHIVO_RECIBO = /^(R-(\d{4})-\d{4,})(-A)?\.pdf$/;

export function numeroRecibo(anio: number, n: number): string {
  if (!Number.isInteger(anio) || anio < 2000 || anio > 9999 || !Number.isInteger(n) || n < 1) throw new Error("NUMERO_INVALIDO");
  return `${SERIE_RECIBO}-${anio}-${String(n).padStart(4, "0")}`;
}

export function numeroNota(numero: string): string {
  return `${numero}-A`;
}

export function anioDeDocumento(nombre: string): string | null {
  return DOCUMENTO_RECIBO.exec(nombre)?.[1] ?? null;
}

// Proyecto + tipo + detalle: "PMS Hotel: Mensualidad — octubre 2026", "…: Pago único — cuota 2 de 3".
export function conceptoRecibo(c: { concepto: Concepto; detalle: string; mes: string | null }, proyecto: string): string {
  const detalle = c.detalle.trim();
  let texto: string;
  if (c.concepto === "mensualidad") texto = c.mes ? `Mensualidad — ${nombreMes(c.mes)}` : detalle || "Mensualidad";
  else if (c.concepto === "cuota") {
    const m = /^cuota (\d+) de (\d+)$/i.exec(detalle);
    texto = m ? `Pago único — cuota ${m[1]} de ${m[2]}` : detalle ? `Cuota — ${detalle}` : "Cuota";
  } else if (c.concepto === "pago_unico") texto = !detalle || detalle.toLowerCase() === "pago único" ? "Pago único" : `Pago único — ${detalle}`;
  else texto = detalle ? `Extra — ${detalle}` : "Extra";
  return `${proyecto}: ${texto}`;
}

// Solo las mensualidades traen `mes`: las versiones publicadas ese mes son lo que esa mensualidad pago.
export function versionesIncluidas(versiones: { version: string; fecha: string }[], mes: string | null): string {
  if (!mes) return "";
  const delMes = versiones.filter((v) => v.fecha.startsWith(`${mes}-`)).map((v) => v.version).sort(compararSemver);
  if (delMes.length === 0) return "";
  return delMes.length === 1 ? `Incluye v${delMes[0]}` : `Incluye v${delMes[0]} a v${delMes[delMes.length - 1]}`;
}

// Que le falta al emisor para poder emitir. Lista vacia = listo.
export function faltantesEmisor(e: DatosEmisor): string[] {
  const faltan: string[] = [];
  if (!e.nombre.trim()) faltan.push("nombre");
  if (!e.rif.trim()) faltan.push("RIF");
  if (!e.whatsapp.trim()) faltan.push("WhatsApp");
  if (!e.email.trim()) faltan.push("correo");
  return faltan;
}

export function celularVisible(whatsapp: string): string {
  const m = /^58(\d{3})(\d{7})$/.exec(whatsapp);
  return m ? `+58 ${m[1]}-${m[2]}` : whatsapp;
}

export type DatosRecibo = {
  numero: string;
  emitidoEl: string; // YYYY-MM-DD, dia de Caracas
  emisor: DatosEmisor;
  cliente: { nombre: string; rif: string; contactoNombre: string };
  concepto: string;
  versiones: string;
  monto: number;
  fechaPago: string; // YYYY-MM-DD
  canal: string;
  referencia: string;
};
export type DatosAnulacion = { anuladoEl: string; motivo: string };

function camposComunes(d: DatosRecibo): Record<string, string> {
  return {
    emisor_nombre: d.emisor.nombre, emisor_rif: d.emisor.rif, emisor_whatsapp: celularVisible(d.emisor.whatsapp), emisor_email: d.emisor.email,
    cliente_nombre: d.cliente.nombre, cliente_rif: d.cliente.rif, cliente_contacto: d.cliente.contactoNombre,
    monto: formatoUSD(d.monto), concepto: d.concepto,
    fecha_pago: fechaVisible(d.fechaPago), canal: ETIQUETA_CANAL_COBRO[d.canal as CanalCobro] ?? d.canal, referencia: d.referencia,
  };
}

export function camposRecibo(d: DatosRecibo): Record<string, string> {
  return {
    ...camposComunes(d), clase: "", titulo: "Recibo de pago", numero: d.numero, emitido_texto: `Emitido el ${fechaVisible(d.emitidoEl)}`,
    es_recibo: "1", es_anulacion: "", monto_etiqueta: "la cantidad de", versiones: d.versiones, motivo: "", pie: PIE_RECIBO,
  };
}

export function camposNota(d: DatosRecibo, a: DatosAnulacion): Record<string, string> {
  return {
    ...camposComunes(d), clase: "anulacion", titulo: "Nota de anulación", numero: numeroNota(d.numero), emitido_texto: `Emitida el ${fechaVisible(a.anuladoEl)}`,
    es_recibo: "", es_anulacion: "1", recibo_anulado: d.numero, recibo_emitido: fechaVisible(d.emitidoEl),
    monto_etiqueta: "por la cantidad de", versiones: "", motivo: a.motivo, pie: PIE_NOTA,
  };
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function escaparHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

// Bloques <!--si:x-->...<!--fin:x--> (sin anidar) se quedan solo si campos.x trae texto;
// {{x}} se reemplaza por el dato escapado. Un marcador sin dato queda vacio, no a la vista.
export function renderDocumento(plantilla: string, campos: Record<string, string>): string {
  if (!plantilla.includes("{{numero}}") || !plantilla.includes("{{titulo}}")) throw new Error("PLANTILLA_SIN_MARCADORES");
  const sinBloques = plantilla.replace(/<!--si:([a-z_]+)-->([\s\S]*?)<!--fin:\1-->/g, (_todo, clave: string, dentro: string) => (campos[clave] ? dentro : ""));
  return sinBloques.replace(/\{\{([a-z_]+)\}\}/g, (_todo, clave: string) => escaparHtml(campos[clave] ?? ""));
}

const URL_FUENTE = /url\("fuentes\/([a-z0-9-]+\.woff2)"\)/g;

export function fuentesDePlantilla(plantilla: string): string[] {
  return [...new Set([...plantilla.matchAll(URL_FUENTE)].map((m) => m[1]))];
}

// fuentes: { "archivo.woff2": "<base64>" }. El PDF no puede depender de la red.
export function incrustarFuentes(plantilla: string, fuentes: Record<string, string>): string {
  return plantilla.replace(URL_FUENTE, (_todo, archivo: string) => {
    const base64 = fuentes[archivo];
    if (!base64) throw new Error(`FUENTE_FALTANTE:${archivo}`);
    return `url("data:font/woff2;base64,${base64}")`;
  });
}

// El PDF no viaja en el enlace de WhatsApp: lo adjunta Neri desde el telefono.
export function mensajeRecibo(d: { cliente: string; numero: string; concepto: string; monto: number }): string {
  return `Buenas, ${d.cliente}. Le envío el recibo de pago ${d.numero} por ${formatoUSD(d.monto)}, correspondiente a ${d.concepto}. Gracias por su pago.`;
}
