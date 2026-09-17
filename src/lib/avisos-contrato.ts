// src/lib/avisos-contrato.ts — los tres avisos al cliente (pieza 5b). Puro: sin base ni node:.
// A los clientes se les trata de usted por WhatsApp, como en los mensajes de cobro.
import { armarMensaje } from "@/lib/plantilla-mensaje";
import { formatoUSD } from "@/lib/dinero";
import { fechaVisible } from "@/lib/fecha-caracas";
import { ETIQUETA_CONCEPTO, type Concepto } from "@/lib/cobros-contrato";
import { ETIQUETA_CAMBIO } from "@/lib/semver-contrato";

// Sin esta variable el aviso no dice de que habla: Ajustes no deja guardarlo.
export const VARIABLE_OBLIGATORIA = { hito: "{hito}", version: "{version}", cobro: "{monto}" } as const;
export type TipoAviso = keyof typeof VARIABLE_OBLIGATORIA;

// {enlace} va SIEMPRE en su propio renglon: armarMensaje lo quita entero si el cliente no tiene acceso.
export const AVISO_POR_DEFECTO: Record<TipoAviso, string> = {
  hito: "Buenas, {cliente}. Ya quedó listo en {proyecto}: {hito}.\nPuede ver el avance en su portal: {enlace}\nCualquier duda me escribe por aquí.",
  version: "Buenas, {cliente}. Publicamos la versión {version} de {proyecto}:\n{cambios}\nPuede verla en su portal: {enlace}\nCualquier duda me escribe por aquí.",
  cobro: "Buenas, {cliente}. Registré un cobro de {proyecto}: {concepto} por {monto}, que vence el {vence}.\nPuede verlo en su portal: {enlace}\nCualquier duda me escribe por aquí.",
};
// Renglon que se les suma a los textos de fabrica del recordatorio y del vencido (src/lib/configuracion.ts).
export const RENGLON_PORTAL_COBRO = "Puede ver el detalle en su portal: {enlace}";

type Base = { cliente: string; proyecto: string; enlace: string };

export function quienRecibe(c: { nombre: string; contactoNombre: string }): string {
  return c.contactoNombre || c.nombre;
}

export function mensajeAvisoHito(plantilla: string, d: Base & { hito: string }): string {
  return armarMensaje(plantilla, { cliente: d.cliente, proyecto: d.proyecto, hito: d.hito, enlace: d.enlace });
}

export function mensajeAvisoVersion(plantilla: string, d: Base & { version: string; cambios: { tipo: string; texto: string }[] }): string {
  const cambios = d.cambios.map((c) => `• ${ETIQUETA_CAMBIO[c.tipo as keyof typeof ETIQUETA_CAMBIO] ?? c.tipo}: ${c.texto}`).join("\n");
  return armarMensaje(plantilla, { cliente: d.cliente, proyecto: d.proyecto, version: d.version, cambios, enlace: d.enlace });
}

export function mensajeAvisoCobro(plantilla: string, d: Base & { concepto: Concepto; detalle: string; monto: number; vence: string }): string {
  const concepto = d.detalle ? `${ETIQUETA_CONCEPTO[d.concepto]} (${d.detalle})` : ETIQUETA_CONCEPTO[d.concepto];
  return armarMensaje(plantilla, { cliente: d.cliente, proyecto: d.proyecto, concepto, monto: formatoUSD(d.monto), vence: fechaVisible(d.vence), enlace: d.enlace });
}
