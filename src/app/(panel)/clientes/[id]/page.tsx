import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirRol } from "@/lib/sesion";
import { fichaCliente } from "@/lib/clientes";
import { FormularioCliente } from "@/componentes/FormularioCliente";
import { EstadoProyecto } from "@/componentes/EstadoProyecto";
import type { EstadoProyecto as Tipo } from "@/lib/proyectos-contrato";

export const dynamic = "force-dynamic";

export default async function Cliente({ params }: { params: Promise<{ id: string }> }) {
  await exigirRol("dueno");
  const id = Number((await params).id);
  const c = Number.isInteger(id) ? await fichaCliente(id) : null;
  if (!c) notFound();
  return (
    <>
      <h1 className="titulo">{c.nombre}</h1>
      <section className="tarjeta"><b>Proyectos</b>
        {c.proyectosLista.length === 0 && <p className="suave">Ninguno todavía.</p>}
        {c.proyectosLista.map((p) => <Link key={p.id} href={`/proyectos/${p.id}`} className="fila"><span>{p.nombre}</span><EstadoProyecto estado={p.estado as Tipo} /></Link>)}
        <div className="fila-botones"><Link className="boton" href="/proyectos/nuevo">Nuevo proyecto</Link></div>
      </section>
      <FormularioCliente cliente={c} />
    </>
  );
}
