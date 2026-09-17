// src/lib/mensajes-cobro.ts — arma el mensaje de cobro (puro).
import { rellenar } from "@/lib/plantilla-mensaje";
import { formatoUSD } from "@/lib/dinero";
import { ETIQUETA_CONCEPTO, type Concepto, type EstadoCobro } from "@/lib/cobros-contrato";
import { fechaVisible } from "@/lib/fecha-caracas";

export function mensajeDeCobro(
  c: { concepto: Concepto; detalle: string; monto: number; vence: string; estado: EstadoCobro },
  proyecto: { nombre: string }, cliente: { nombre: string; contactoNombre: string },
  plantillas: { recordatorio: string; vencido: string },
): string {
  const plantilla = c.estado === "vencido" ? plantillas.vencido : plantillas.recordatorio;
  const concepto = c.detalle ? `${ETIQUETA_CONCEPTO[c.concepto]} (${c.detalle})` : ETIQUETA_CONCEPTO[c.concepto];
  // {enlace} es el portal del cliente (pieza 5); hasta entonces va vacio.
  const texto = rellenar(plantilla, { cliente: cliente.contactoNombre || cliente.nombre, proyecto: proyecto.nombre, monto: formatoUSD(c.monto), concepto, vence: fechaVisible(c.vence), enlace: "" });
  // Solo se colapsa el espacio horizontal (no el salto de linea), asi las plantillas
  // multilinea sobreviven; el espacio sobrante al final de cada linea tambien se recorta.
  return texto
    .split("\n")
    .map((linea) => linea.replace(/[^\S\n]{2,}/g, " ").replace(/[^\S\n]+$/, ""))
    .join("\n")
    .replace(/\s+$/, "");
}

export function enlaceWhatsappCobro(whatsapp: string, mensaje: string): string | null {
  return whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(mensaje)}` : null;
}
