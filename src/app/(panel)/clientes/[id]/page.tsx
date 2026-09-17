import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirRol } from "@/lib/sesion";
import { fichaCliente } from "@/lib/clientes";
import { FormularioCliente } from "@/componentes/FormularioCliente";
import { EstadoProyecto } from "@/componentes/EstadoProyecto";
import type { EstadoProyecto as Tipo } from "@/lib/proyectos-contrato";
import { estadoAcceso } from "@/lib/acceso-cliente";
import { enlacePortal } from "@/lib/portal-contrato";
import { prisma } from "@/lib/db";
import { AccesoPortal } from "@/componentes/AccesoPortal";

export const dynamic = "force-dynamic";

export default async function Cliente({ params }: { params: Promise<{ id: string }> }) {
  await exigirRol("dueno");
  const id = Number((await params).id);
  const c = Number.isInteger(id) ? await fichaCliente(id) : null;
  if (!c) notFound();
  const [acceso, conCodigo] = await Promise.all([estadoAcceso(c.id), prisma.cliente.findUniqueOrThrow({ where: { id: c.id }, select: { codigo: true } })]);
  const enlace = enlacePortal(process.env.PROSPECTOS_URL_PUBLICA ?? "", conCodigo.codigo);
  return (
    <>
      <h1 className="titulo">{c.nombre}</h1>
      <section className="tarjeta"><b>Proyectos</b>
        {c.proyectosLista.length === 0 && <p className="suave">Ninguno todavía.</p>}
        {c.proyectosLista.map((p) => <Link key={p.id} href={`/proyectos/${p.id}`} className="fila"><span>{p.nombre}</span><EstadoProyecto estado={p.estado as Tipo} /></Link>)}
        <div className="fila-botones"><Link className="boton" href="/proyectos/nuevo">Nuevo proyecto</Link></div>
      </section>
      <AccesoPortal clienteId={c.id} enlace={enlace} acceso={acceso} tieneWhatsapp={c.whatsapp !== ""} />
      <FormularioCliente cliente={c} />
    </>
  );
}
