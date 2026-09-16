// src/lib/configuracion.ts — clave/valor con defectos. Solo el dueno escribe.
import { prisma } from "@/lib/db";

export const CLAVES = {
  tarifaHora: "tarifa_hora",
  mensajeRecordatorio: "mensaje_cobro_recordatorio",
  mensajeVencido: "mensaje_cobro_vencido",
  emisor: "datos_emisor",
} as const;

export const DEFECTOS: Record<string, string> = {
  [CLAVES.tarifaHora]: "17",
  [CLAVES.mensajeRecordatorio]: "Buenas, {cliente}. Le recuerdo el cobro de {concepto} de {proyecto} por {monto}, que vence el {vence}. Cualquier duda me escribe por aquí. Gracias.",
  [CLAVES.mensajeVencido]: "Buenas, {cliente}. Le escribo por el cobro de {concepto} de {proyecto} por {monto}, que venció el {vence}. ¿Me confirma cuándo lo podemos regularizar? Gracias.",
  [CLAVES.emisor]: JSON.stringify({ nombre: "Neri Colón", rif: "", whatsapp: "", email: "" }),
};

export async function leerConfig(clave: string): Promise<string> {
  const fila = await prisma.configuracion.findUnique({ where: { clave } });
  return fila?.valor ?? DEFECTOS[clave] ?? "";
}

export async function guardarConfig(clave: string, valor: string): Promise<void> {
  await prisma.configuracion.upsert({ where: { clave }, update: { valor }, create: { clave, valor } });
}

export async function leerTarifaHora(): Promise<number> {
  const n = Number(await leerConfig(CLAVES.tarifaHora));
  return Number.isFinite(n) && n > 0 ? n : 17;
}

export type DatosEmisor = { nombre: string; rif: string; whatsapp: string; email: string };
export async function leerEmisor(): Promise<DatosEmisor> {
  try { return { nombre: "", rif: "", whatsapp: "", email: "", ...JSON.parse(await leerConfig(CLAVES.emisor)) }; }
  catch { return { nombre: "Neri Colón", rif: "", whatsapp: "", email: "" }; }
}
