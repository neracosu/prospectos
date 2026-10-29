import Link from "next/link";
import { exigirRol } from "@/lib/sesion";
import { hoyCaracas, fechaVisible } from "@/lib/fecha-caracas";
import { listarProyectos, ganadosSinProyecto } from "@/lib/proyectos";
import { ESTADOS_PROYECTO, ETIQUETA_ESTADO, esEstadoProyecto } from "@/lib/proyectos-contrato";
import { formatoUSD } from "@/lib/dinero";
import { CabeceraPagina } from "@/componentes/CabeceraPagina";
import { Semaforo } from "@/componentes/Semaforo";
import { EstadoProyecto } from "@/componentes/EstadoProyecto";

export const dynamic = "force-dynamic";

// Proyectos (panel CRM, fase 3): tabla con filtro por estado. El dinero vive en /cobros; «Ganados sin proyecto» es un
// aviso bajo la cabecera, no una seccion. Clientes sigue siendo su pagina, enlazada como pestana secundaria.
export default async function Proyectos({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  await exigirRol("dueno");
  const hoy = hoyCaracas();
  const pedido = (await searchParams).estado ?? "";
  const estado = esEstadoProyecto(pedido) ? pedido : undefined;
  const [lista, ganados] = await Promise.all([listarProyectos(hoy, estado), ganadosSinProyecto()]);
  return (
    <>
      <CabeceraPagina titulo="Proyectos" cifra={`${lista.length} ${lista.length === 1 ? "proyecto" : "proyectos"}${estado ? ` · ${ETIQUETA_ESTADO[estado].toLowerCase()}` : ""}`} accion={<Link className="boton boton--primario" href="/proyectos/nuevo">Nuevo proyecto</Link>} />
      {ganados.length > 0 && (
        <div className="aviso" role="status">
          <b>{ganados.length} {ganados.length === 1 ? "ganado" : "ganados"} sin proyecto.</b>
          {ganados.map((g) => <div key={g.id} className="aviso__fila"><span>{g.nombre}{g.ciudad ? <span className="suave"> · {g.ciudad}</span> : null}</span><Link className="boton mini" href={`/proyectos/nuevo?prospecto=${g.id}`}>Crear proyecto</Link></div>)}
        </div>
      )}
      <nav className="pestanas" aria-label="Estado">
        <Link href="/proyectos" className={"pestanas__item" + (!estado ? " activa" : "")} aria-current={!estado ? "page" : undefined}>Todos</Link>
        {ESTADOS_PROYECTO.map((e) => <Link key={e} href={`/proyectos?estado=${e}`} className={"pestanas__item" + (e === estado ? " activa" : "")} aria-current={e === estado ? "page" : undefined}>{ETIQUETA_ESTADO[e]}</Link>)}
        <Link href="/clientes" className="pestanas__item pestanas__item--aparte">Clientes</Link>
      </nav>
      {lista.length === 0 && <p className="suave">{estado ? `Ningún proyecto ${ETIQUETA_ESTADO[estado].toLowerCase()}.` : <>Todavía no hay proyectos. <Link href="/proyectos/nuevo">Crea el primero</Link> (los clientes que ya tienes entran a mano).</>}</p>}
      {lista.length > 0 && (
        <table className="tabla tabla--proyectos">
          <thead><tr><th>Proyecto</th><th>Cliente</th><th>Nicho</th><th>Estado</th><th className="num">Mensualidad</th><th className="num">Próximo cobro</th><th className="num">Avance</th></tr></thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id} data-id={p.id}>
                <td data-label="Proyecto"><Link href={`/proyectos/${p.id}`} className="tabla__principal"><Semaforo valor={p.semaforo} /><b>{p.nombre}</b>{p.versionActual ? <span className="suave"> v{p.versionActual}</span> : null}</Link></td>
                <td data-label="Cliente">{p.clienteNombre}</td>
                <td data-label="Nicho">{p.nichoNombre}</td>
                <td data-label="Estado"><EstadoProyecto estado={p.estado} /></td>
                <td data-label="Mensualidad" className="num">{p.mensualidad > 0 ? `${formatoUSD(p.mensualidad)}/mes` : "—"}</td>
                <td data-label="Próximo cobro" className="num">{p.proximoCobro ? fechaVisible(p.proximoCobro) : "—"}</td>
                <td data-label="Avance" className="num">{p.avance !== null ? `${p.avance} %` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
