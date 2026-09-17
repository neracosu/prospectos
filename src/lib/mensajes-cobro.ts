// src/lib/mensajes-cobro.ts — arma el mensaje de cobro (puro).
import { armarMensaje } from "@/lib/plantilla-mensaje";
import { formatoUSD } from "@/lib/dinero";
import { ETIQUETA_CONCEPTO, type Concepto, type EstadoCobro } from "@/lib/cobros-contrato";
import { fechaVisible } from "@/lib/fecha-caracas";

export function mensajeDeCobro(
  c: { concepto: Concepto; detalle: string; monto: number; vence: string; estado: EstadoCobro },
  proyecto: { nombre: string }, cliente: { nombre: string; contactoNombre: string },
  plantillas: { recordatorio: string; vencido: string },
  enlace = "",
): string {
  const plantilla = c.estado === "vencido" ? plantillas.vencido : plantillas.recordatorio;
  const concepto = c.detalle ? `${ETIQUETA_CONCEPTO[c.concepto]} (${c.detalle})` : ETIQUETA_CONCEPTO[c.concepto];
  // {enlace} es el portal del cliente (pieza 5); sin acceso activo, armarMensaje quita entero el renglon que lo lleva.
  return armarMensaje(plantilla, { cliente: cliente.contactoNombre || cliente.nombre, proyecto: proyecto.nombre, monto: formatoUSD(c.monto), concepto, vence: fechaVisible(c.vence), enlace });
}

export function enlaceWhatsappCobro(whatsapp: string, mensaje: string): string | null {
  return whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(mensaje)}` : null;
}
