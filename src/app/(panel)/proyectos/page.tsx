import Link from "next/link";
import { exigirRol } from "@/lib/sesion";
import { hoyCaracas } from "@/lib/fecha-caracas";
import { listarProyectos, ganadosSinProyecto, resumenMes } from "@/lib/proyectos";
import { formatoUSD } from "@/lib/dinero";
import { Semaforo } from "@/componentes/Semaforo";
import { EstadoProyecto } from "@/componentes/EstadoProyecto";

export const dynamic = "force-dynamic";

export default async function Proyectos() {
  await exigirRol("dueno");
  const hoy = hoyCaracas();
  const [lista, ganados, mes] = await Promise.all([listarProyectos(hoy), ganadosSinProyecto(), resumenMes(hoy)]);
  return (
    <>
      <div className="fila" style={{ border: 0 }}><h1 className="titulo">Proyectos</h1><Link className="boton boton--primario" href="/proyectos/nuevo">Nuevo</Link></div>
      <section className="tarjeta cifras">
        <div><b>{formatoUSD(mes.cobrado)}</b>cobrado este mes</div>
        <div className="vencido"><b>{formatoUSD(mes.vencido)}</b>vencido</div>
        <div><b>{formatoUSD(mes.porCobrar)}</b>por cobrar</div>
      </section>
      {ganados.length > 0 && (
        <section className="tarjeta">
          <b>Ganados sin proyecto</b>
          {ganados.map((g) => (
            <div key={g.id} className="fila"><span>{g.nombre} · <span className="suave">{g.ciudad}</span></span><Link className="boton mini" href={`/proyectos/nuevo?prospecto=${g.id}`}>Crear proyecto</Link></div>
          ))}
        </section>
      )}
      {lista.length === 0 && <p className="suave">Todavía no hay proyectos. <Link href="/proyectos/nuevo">Crea el primero</Link> (los clientes que ya tienes entran a mano).</p>}
      {lista.map((p) => (
        <Link key={p.id} href={`/proyectos/${p.id}`} className="fila">
          <span><Semaforo valor={p.semaforo} /><b>{p.nombre}</b><br /><span className="suave">{p.clienteNombre}{p.versionActual ? ` · v${p.versionActual}` : ""}{p.avance !== null ? ` · ${p.avance} %` : ""}</span></span>
          <EstadoProyecto estado={p.estado} />
        </Link>
      ))}
      <p className="suave" style={{ marginTop: 16 }}><Link href="/clientes">Ver clientes</Link></p>
    </>
  );
}
