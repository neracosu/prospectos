// src/lib/portal-contrato.ts — reglas puras del portal del cliente (pieza 5). Sin base, sin disco, sin node:.
import { ETIQUETA_CONCEPTO, type Concepto, type EstadoCobro } from "@/lib/cobros-contrato";
import { compararSemver } from "@/lib/semver-contrato";
import { fechaVisible } from "@/lib/fecha-caracas";
import { formatoUSD } from "@/lib/dinero";

// Un hito es un pendiente visible al cliente. Los internos nunca llegan hasta aqui.
export type HitoPortal = { texto: string; hecho: boolean; hechoEl: string | null; fechaEstimada: string | null };
export type ResumenHitos = { hechos: number; total: number; porcentaje: number | null };

// porcentaje null = sin hitos publicados (no es 0 %).
export function resumenHitos(hitos: { hecho: boolean }[]): ResumenHitos {
  const hechos = hitos.filter((h) => h.hecho).length;
  return { hechos, total: hitos.length, porcentaje: hitos.length ? Math.round((hechos / hitos.length) * 100) : null };
}

export function textoFechaHito(h: HitoPortal): string {
  if (h.hecho) {
    if (!h.hechoEl) return "Cumplido";
    return h.fechaEstimada ? `Cumplido el ${fechaVisible(h.hechoEl)} · estimado ${fechaVisible(h.fechaEstimada)}` : `Cumplido el ${fechaVisible(h.hechoEl)}`;
  }
  return h.fechaEstimada ? `Estimado para el ${fechaVisible(h.fechaEstimada)}` : "Sin fecha todavía";
}

export function versionesDelMasNuevo<T extends { version: string }>(versiones: T[]): T[] {
  return [...versiones].sort((a, b) => compararSemver(b.version, a.version));
}

export type CobroPortal = {
  id: number; proyectoId: number; proyectoNombre: string; texto: string; monto: number; vence: string;
  estado: EstadoCobro; pagadoEl: string | null; canal: string; reciboNumero: string;
};

export function textoCobro(c: { concepto: Concepto; detalle: string }): string {
  return c.detalle.trim() || ETIQUETA_CONCEPTO[c.concepto];
}

// Un cobro anulado nunca se le muestra al cliente: se descarta aqui aunque la consulta ya lo filtre.
export function separarCobros(cobros: CobroPortal[]): { porPagar: CobroPortal[]; pagados: CobroPortal[] } {
  const porPagar = cobros.filter((c) => c.estado === "vencido" || c.estado === "por_vencer" || c.estado === "pendiente").sort((a, b) => a.vence.localeCompare(b.vence));
  const pagados = cobros.filter((c) => c.estado === "pagado").sort((a, b) => (b.pagadoEl ?? "").localeCompare(a.pagadoEl ?? ""));
  return { porPagar, pagados };
}

export type AvisoCobros = { gravedad: "vencido" | "por_vencer"; cobro: CobroPortal; otros: number };

// Lo mas urgente primero: el vencido mas viejo; si no hay vencidos, el que vence antes.
export function avisoDeCobros(cobros: CobroPortal[]): AvisoCobros | null {
  const urgentes = cobros.filter((c) => c.estado === "vencido" || c.estado === "por_vencer");
  if (urgentes.length === 0) return null;
  const vencidos = urgentes.filter((c) => c.estado === "vencido");
  const grupo = vencidos.length ? vencidos : urgentes;
  const cobro = [...grupo].sort((a, b) => a.vence.localeCompare(b.vence))[0];
  return { gravedad: vencidos.length ? "vencido" : "por_vencer", cobro, otros: urgentes.length - 1 };
}

export function textoAviso(a: AvisoCobros): string {
  const c = a.cobro;
  const base = a.gravedad === "vencido"
    ? `Tienes un cobro vencido: ${formatoUSD(c.monto)} de ${c.texto} (${c.proyectoNombre}). Venció el ${fechaVisible(c.vence)}.`
    : `Tienes un cobro por vencer: ${formatoUSD(c.monto)} de ${c.texto} (${c.proyectoNombre}). Vence el ${fechaVisible(c.vence)}.`;
  return a.otros > 0 ? `${base} Hay ${a.otros} más por revisar.` : base;
}

export function enlacePortal(base: string, codigo: string): string {
  const limpia = base.replace(/\/+$/, "");
  if (!limpia) throw new Error("Falta PROSPECTOS_URL_PUBLICA");
  return `${limpia}/c/${codigo}`;
}

// El enlace y el PIN van en mensajes separados a proposito: si el cliente reenvia el chat, no va todo junto.
export function mensajeEnlacePortal(quien: string, enlace: string): string {
  return `Buenas, ${quien}. Desde este enlace puede ver cómo van sus proyectos, las versiones publicadas, sus cobros y sus recibos: ${enlace}\nEn un momento le envío el PIN para entrar.`;
}

export function mensajePinPortal(pin: string): string {
  return `Su PIN para entrar es ${pin}. Es solo suyo: no lo comparta.`;
}

// "Neri Colón" -> "Neri". Lo usa el portal para decir a quien escribirle.
export function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] || "Neri";
}
