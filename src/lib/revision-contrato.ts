// Textos de la bandeja que ven las dos puntas: la pantalla servidor (la lista de
// lotes) y el componente cliente (la tarjeta del lote). Va aparte de
// src/lib/revision.ts porque ese importa Prisma y un componente cliente no lo
// puede tocar. "overpass" no le dice nada a nadie: el panel muestra de donde
// salio el lote en los mismos terminos de las pestanas de /buscar.
export const ETIQUETA_ORIGEN: Record<string, string> = {
  overpass: "Mapa (OSM)",
  maps: "Google Maps",
  importado: "Importado",
  web: "Lectura de web",
};

export function etiquetaOrigen(origen: string): string {
  return ETIQUETA_ORIGEN[origen] ?? origen;
}
