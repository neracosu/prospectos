import Link from "next/link";
import { formatoUSD } from "@/lib/dinero";
import type { CifrasInicio as Cifras } from "@/lib/inicio-contrato";

// Las cuatro cifras de arriba de Inicio. Cada una es un enlace a su seccion. El verde queda para el dinero;
// lo vencido va en rojo solo si hay.
export function CifrasInicio({ cifras }: { cifras: Cifras }) {
  return (
    <div className="cifras-inicio">
      <Link href="/leads" className="cifra">
        <b>{cifras.leadsActivos}</b>
        <span>Leads activos</span>
        {cifras.conVencido > 0 && <small className="cifra__alerta">{cifras.conVencido} con seguimiento vencido</small>}
      </Link>
      <Link href="/solicitudes" className={"cifra" + (cifras.solicitudes > 0 ? " cifra--nueva" : "")}>
        <b>{cifras.solicitudes}</b>
        <span>Solicitudes sin atender</span>
      </Link>
      <Link href="/cobros" className="cifra">
        <b className="cifra__dinero">{formatoUSD(cifras.porCobrar)}</b>
        <span>Por cobrar este mes</span>
        {cifras.vencido > 0 && <small className="cifra__alerta">{formatoUSD(cifras.vencido)} vencido</small>}
      </Link>
      <Link href="/web" className="cifra">
        <b>{cifras.personasWeb}</b>
        <span>Personas en la web (7 días)</span>
      </Link>
    </div>
  );
}
