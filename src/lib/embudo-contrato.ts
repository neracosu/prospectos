export const ETAPAS = ["por_contactar", "enviado", "respondio", "reunion", "ganado", "descartado"] as const;
export type Etapa = (typeof ETAPAS)[number];

export const ETIQUETA_ETAPA: Record<Etapa, string> = {
  por_contactar: "Por contactar", enviado: "Enviado", respondio: "Respondió",
  reunion: "Reunión", ganado: "Ganado", descartado: "Descartado",
};

// Hacia donde puede ir cada etapa. Nada retrocede salvo reactivar un descartado.
const SIGUIENTES: Record<Etapa, readonly Etapa[]> = {
  por_contactar: ["enviado", "descartado"],
  enviado: ["respondio", "descartado"],
  respondio: ["reunion", "ganado", "descartado"],
  reunion: ["ganado", "descartado"],
  ganado: [],
  descartado: ["por_contactar"],
};

export function puedePasar(de: Etapa, a: Etapa): boolean {
  return SIGUIENTES[de].includes(a);
}

export function esEtapa(s: string): s is Etapa {
  return (ETAPAS as readonly string[]).includes(s);
}
