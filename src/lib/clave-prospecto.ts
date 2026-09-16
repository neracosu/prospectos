// Igual que clave() en armar.py: reimportar no duplica aunque cambie el formato.
function limpiar(s: string): string {
  return (s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
export function claveProspecto(nombre: string, ciudad: string): string {
  return `${limpiar(nombre)}|${limpiar(ciudad)}`;
}
