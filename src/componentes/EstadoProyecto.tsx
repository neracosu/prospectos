import { ETIQUETA_ESTADO, type EstadoProyecto as Tipo } from "@/lib/proyectos-contrato";

export function EstadoProyecto({ estado }: { estado: Tipo }) {
  return <span className={`etiqueta etiqueta--proyecto-${estado}`}>{ETIQUETA_ESTADO[estado]}</span>;
}
