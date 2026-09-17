import Link from "next/link";
import { exigirCliente } from "@/lib/sesion-cliente";
import { inicioPortal } from "@/lib/portal";
import { hoyCaracas, fechaVisible } from "@/lib/fecha-caracas";
import { leerEmisor } from "@/lib/configuracion";
import { textoAviso, primerNombre } from "@/lib/portal-contrato";
import { PortalBarra } from "@/componentes/PortalBarra";
import { EstadoProyecto } from "@/componentes/EstadoProyecto";

export const dynamic = "force-dynamic";

export default async function InicioPortal({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const s = await exigirCliente(codigo);
  const hoy = hoyCaracas();
  const [{ proyectos, aviso }, emisor] = await Promise.all([inicioPortal(s.clienteId, hoy), leerEmisor()]);
  return (
    <main className="portal">
      <PortalBarra codigo={codigo} activa="inicio" />
      <h1>{s.nombre}</h1>
      <p className="portal__bajada">Así van tus sistemas hoy, {fechaVisible(hoy)}.</p>
      {aviso && (
        <section className={`portal__aviso${aviso.gravedad === "vencido" ? " portal__aviso--vencido" : ""}`} role="status">
          <p>{textoAviso(aviso)}</p>
          <Link className="boton mini" href={`/c/${codigo}/proyecto/${aviso.cobro.proyectoId}?t=cobros`}>Ver cobros</Link>
        </section>
      )}
      {proyectos.length === 0 && <p className="tarjeta">Todavía no tienes proyectos cargados. Escríbele a {primerNombre(emisor.nombre)} si esperabas ver alguno.</p>}
      {proyectos.map((p) => (
        <Link key={p.id} className="tarjeta proyecto" href={`/c/${codigo}/proyecto/${p.id}`}>
          <div className="proyecto__cabeza"><h2>{p.nombre}</h2><EstadoProyecto estado={p.estado} /></div>
          <dl className="proyecto__datos">
            <div><dt>Versión actual</dt><dd>{p.versionActual ? <>{p.versionActual} <small>del {fechaVisible(p.versionFecha ?? hoy)}</small></> : <small>Todavía sin versiones</small>}</dd></div>
            <div><dt>Avance</dt><dd>{p.hitos.porcentaje === null ? <small>Sin hitos publicados</small> : <>{p.hitos.porcentaje} % <small>{p.hitos.hechos} de {p.hitos.total} hitos</small></>}</dd></div>
          </dl>
          {p.hitos.porcentaje !== null && <div className="progreso"><i style={{ width: `${p.hitos.porcentaje}%` }} /></div>}
        </Link>
      ))}
      <p className="portal__pie">Te atiende {emisor.nombre || "Neri Colón"}. <Link href={`/c/${codigo}/contacto`}>Cómo escribirle</Link></p>
    </main>
  );
}
