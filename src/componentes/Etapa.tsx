import { ETIQUETA_ETAPA, type Etapa as TipoEtapa } from "@/lib/embudo-contrato";
export function Etapa({ etapa }: { etapa: TipoEtapa }) {
  return <span className={`etiqueta etiqueta--${etapa}`}>{ETIQUETA_ETAPA[etapa]}</span>;
}
