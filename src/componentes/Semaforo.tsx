import type { Semaforo as Tipo } from "@/lib/proyectos-contrato";

const TEXTO: Record<Tipo, string> = { rojo: "Cobro vencido", amarillo: "Vence pronto", verde: "Al día" };

export function Semaforo({ valor }: { valor: Tipo }) {
  return <span className={`semaforo semaforo--${valor}`} title={TEXTO[valor]} aria-label={TEXTO[valor]} />;
}
