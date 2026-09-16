import type { ContactoProspecto } from "@/lib/canales-contrato";
import type { Etapa } from "@/lib/embudo-contrato";

// Lo que pinta una tarjeta de prospecto en cualquier pantalla (cola, seguimientos, busqueda, ficha).
export type ProspectoTarjeta = ContactoProspecto & {
  id: number;
  nombre: string;
  ciudad: string;
  nichoNombre: string;
  nichoSlug: string;
  nota: string;
  tipo: string;
  tamano: string;
  etapa: Etapa;
  proximoSeguimiento: string | null;
  abrio: boolean;
  codigo: string;
  enlace: string;
  mensaje: string;
};

export function enlacePropuesta(codigo: string): string {
  const base = (process.env.PROSPECTOS_URL_PUBLICA ?? "").replace(/\/+$/, "");
  return `${base}/p/${codigo}`;
}
