// src/lib/mensajes-cobro.ts — arma el mensaje de cobro (puro).
import { rellenar } from "@/lib/plantilla-mensaje";
import { formatoUSD } from "@/lib/dinero";
import { ETIQUETA_CONCEPTO, type Concepto, type EstadoCobro } from "@/lib/cobros-contrato";

function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export function mensajeDeCobro(
  c: { concepto: Concepto; detalle: string; monto: number; vence: string; estado: EstadoCobro },
  proyecto: { nombre: string }, cliente: { nombre: string; contactoNombre: string },
  plantillas: { recordatorio: string; vencido: string },
): string {
  const plantilla = c.estado === "vencido" ? plantillas.vencido : plantillas.recordatorio;
  const concepto = c.detalle ? `${ETIQUETA_CONCEPTO[c.concepto]} (${c.detalle})` : ETIQUETA_CONCEPTO[c.concepto];
  // {enlace} es el portal del cliente (pieza 5); hasta entonces va vacio.
  return rellenar(plantilla, { cliente: cliente.contactoNombre || cliente.nombre, proyecto: proyecto.nombre, monto: formatoUSD(c.monto), concepto, vence: fechaLarga(c.vence), enlace: "" }).replace(/\s+$/, "").replace(/\s{2,}/g, " ");
}

export function enlaceWhatsappCobro(whatsapp: string, mensaje: string): string | null {
  return whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(mensaje)}` : null;
}
