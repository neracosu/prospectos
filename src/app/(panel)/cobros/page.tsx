import Link from "next/link";
import { exigirRol } from "@/lib/sesion";
import { hoyCaracas } from "@/lib/fecha-caracas";
import { listarCobros, cifrasCobros } from "@/lib/cobros";
import { FILTROS_COBROS, ETIQUETA_FILTRO_COBROS, esFiltroCobros, type FiltroCobros } from "@/lib/cobros-contrato";
import { leerEmisor } from "@/lib/configuracion";
import { faltantesEmisor } from "@/lib/recibos-contrato";
import { formatoUSD } from "@/lib/dinero";
import { CabeceraPagina } from "@/componentes/CabeceraPagina";
import { TablaCobros } from "@/componentes/TablaCobros";

export const dynamic = "force-dynamic";

// Cobros (panel CRM, fase 3): el dinero de todos los proyectos en un solo sitio. Tres cifras arriba, un filtro
// (pendientes · vencidos · este mes · pagados) y una tabla con las mismas acciones que la pestana Cobros del proyecto.
export default async function Cobros({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  await exigirRol("dueno");
  const hoy = hoyCaracas();
  const pedido = (await searchParams).f ?? "";
  const filtro: FiltroCobros = esFiltroCobros(pedido) ? pedido : "pendientes";
  const [cobros, cifras, emisor] = await Promise.all([listarCobros(filtro, hoy), cifrasCobros(hoy), leerEmisor()]);
  return (
    <>
      <CabeceraPagina titulo="Cobros" cifra={`${cobros.length} ${cobros.length === 1 ? "cobro" : "cobros"} · ${ETIQUETA_FILTRO_COBROS[filtro].toLowerCase()}`} />
      <div className="cifras-inicio cifras-inicio--tres">
        <Link href="/cobros?f=mes" className={"cifra" + (filtro === "mes" ? " cifra--activa" : "")}><b className="cifra__dinero">{formatoUSD(cifras.porCobrar)}</b><span>Por cobrar este mes</span></Link>
        <Link href="/cobros?f=vencidos" className={"cifra" + (filtro === "vencidos" ? " cifra--activa" : "")}><b className={cifras.vencido > 0 ? "cifra__rojo" : ""}>{formatoUSD(cifras.vencido)}</b><span>Vencido</span></Link>
        <Link href="/cobros?f=pagados" className={"cifra" + (filtro === "pagados" ? " cifra--activa" : "")}><b className="cifra__dinero">{formatoUSD(cifras.cobrado)}</b><span>Cobrado este mes</span></Link>
      </div>
      <nav className="pestanas" aria-label="Filtro de cobros">
        {FILTROS_COBROS.map((f) => <Link key={f} href={`/cobros?f=${f}`} className={"pestanas__item" + (f === filtro ? " activa" : "")} aria-current={f === filtro ? "page" : undefined}>{ETIQUETA_FILTRO_COBROS[f]}</Link>)}
      </nav>
      {cobros.length === 0
        ? <p className="suave">Nada {ETIQUETA_FILTRO_COBROS[filtro].toLowerCase() === "este mes" ? "por cobrar este mes" : ETIQUETA_FILTRO_COBROS[filtro].toLowerCase()}. Los cobros nacen en cada <Link href="/proyectos">proyecto</Link> (pago único, cuotas) y el cron crea las mensualidades.</p>
        : <TablaCobros cobros={cobros} hoy={hoy} emisorListo={faltantesEmisor(emisor).length === 0} />}
    </>
  );
}
