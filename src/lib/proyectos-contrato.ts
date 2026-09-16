import type { EstadoCobro } from "@/lib/cobros-contrato";

export const ESTADOS_PROYECTO = ["en_construccion", "entregado", "activo", "pausado", "cerrado"] as const;
export type EstadoProyecto = (typeof ESTADOS_PROYECTO)[number];
export const ETIQUETA_ESTADO: Record<EstadoProyecto, string> = {
  en_construccion: "En construcción", entregado: "Entregado", activo: "Activo", pausado: "Pausado", cerrado: "Cerrado",
};

const SIGUIENTES: Record<EstadoProyecto, readonly EstadoProyecto[]> = {
  en_construccion: ["entregado", "activo", "cerrado"],
  entregado: ["activo", "cerrado"],
  activo: ["pausado", "cerrado"],
  pausado: ["activo", "cerrado"],
  cerrado: [],
};
export function puedePasarProyecto(de: EstadoProyecto, a: EstadoProyecto): boolean {
  return SIGUIENTES[de].includes(a);
}
export function esEstadoProyecto(s: string): s is EstadoProyecto {
  return (ESTADOS_PROYECTO as readonly string[]).includes(s);
}

// % de avance visible al cliente. null = sin hitos publicados (no es 0 %).
export function porcentajeAvance(pendientes: { hecho: boolean; visibleCliente: boolean }[]): number | null {
  const visibles = pendientes.filter((p) => p.visibleCliente);
  if (!visibles.length) return null;
  return Math.round((visibles.filter((p) => p.hecho).length / visibles.length) * 100);
}

export type Semaforo = "rojo" | "amarillo" | "verde";
export function semaforo(estados: EstadoCobro[]): Semaforo {
  if (estados.includes("vencido")) return "rojo";
  if (estados.includes("por_vencer")) return "amarillo";
  return "verde";
}
