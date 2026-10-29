// src/lib/leads-contrato.ts — lo que distingue a un lead (conversacion real con alguien que puede comprar) de una
// fila del directorio (prospeccion masiva). Panel CRM, fase 2 (29-oct-2026). Puro: lo usan acciones, pantallas y tests.
// Las etapas en la base son las mismas seis de embudo-contrato.ts; cambian las etiquetas y las transiciones.
import type { Etapa } from "@/lib/embudo-contrato";
import { claveProspecto, limpiar } from "@/lib/clave-prospecto";

export const FUENTES_LEAD = ["web", "embudo", "whatsapp", "instagram", "referido", "directorio", "otro"] as const;
export type FuenteLead = (typeof FUENTES_LEAD)[number];
export const ETIQUETA_FUENTE: Record<FuenteLead, string> = {
  web: "Web", embudo: "Embudo /empezar", whatsapp: "WhatsApp", instagram: "Instagram", referido: "Referido", directorio: "Directorio", otro: "Otro",
};
export function esFuenteLead(s: string): s is FuenteLead {
  return (FUENTES_LEAD as readonly string[]).includes(s);
}

export const ETIQUETA_ETAPA_LEAD: Record<Etapa, string> = {
  por_contactar: "Nuevo", enviado: "Propuesta enviada", respondio: "Conversando", reunion: "Demo o diagnóstico", ganado: "Ganado", descartado: "Descartado",
};

// Una conversacion real no sigue el orden de la cola: desde Nuevo se va a cualquiera; propuesta, conversando y demo
// van y vienen; ganado no sale; descartado vuelve a nuevo.
const SIGUIENTES_LEAD: Record<Etapa, readonly Etapa[]> = {
  por_contactar: ["enviado", "respondio", "reunion", "ganado", "descartado"],
  enviado: ["respondio", "reunion", "ganado", "descartado"],
  respondio: ["enviado", "reunion", "ganado", "descartado"],
  reunion: ["respondio", "ganado", "descartado"],
  ganado: [],
  descartado: ["por_contactar"],
};
export function puedePasarLead(de: Etapa, a: Etapa): boolean {
  return SIGUIENTES_LEAD[de].includes(a);
}
export function destinosLead(de: Etapa): Etapa[] {
  return [...SIGUIENTES_LEAD[de]];
}

// Nace lead lo que crea Neri a mano o lo que viene de una solicitud; todo lo de la bandeja nace directorio y
// asciende a lead cuando se le manda algo (marcarEnviado).
export function naceLead(origen: string): boolean {
  return origen === "manual" || origen === "solicitud";
}

// Clave de duplicado de un lead: nombre|ciudad|contacto. Dos personas con el mismo nombre y distinto WhatsApp
// conviven; el mismo nombre y el mismo contacto es la misma persona.
export function claveLead(nombre: string, ciudad: string, contacto: string): string {
  return `${claveProspecto(nombre, ciudad)}|${limpiar(contacto)}`;
}

// Del rubro del embudo /empezar al slug del nicho del panel. Lo que no encaja cae en «otro».
const NICHO_POR_RUBRO: Record<string, string> = {
  hoteles: "hoteles-estadia", comercio: "comercio", restaurantes: "restaurantes-y-bares", citas: "clinicas-y-consultorios",
  reservas: "canchas-y-espacios", logistica: "otro", otro: "otro",
};
export function nichoDesdeRubro(rubro: string): string {
  return NICHO_POR_RUBRO[rubro] ?? "otro";
}

export function fuenteDesdeSolicitud(s: { tipo: string; origen: string }): FuenteLead {
  return s.tipo === "embudo" ? "embudo" : "web";
}
