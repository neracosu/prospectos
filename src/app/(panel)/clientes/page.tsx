import Link from "next/link";
import { exigirRol } from "@/lib/sesion";
import { listarClientes } from "@/lib/clientes";

export const dynamic = "force-dynamic";

export default async function Clientes({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await exigirRol("dueno");
  const sp = await searchParams;
  const lista = await listarClientes(sp.q);
  return (
    <>
      <div className="fila" style={{ border: 0 }}><h1 className="titulo">Clientes</h1><Link className="boton boton--primario" href="/clientes/nuevo">Nuevo</Link></div>
      <form className="tarjeta" method="get"><label className="campo"><span>Buscar</span><input name="q" defaultValue={sp.q ?? ""} placeholder="Nombre, contacto o RIF" /></label><button className="boton" type="submit">Filtrar</button></form>
      {lista.length === 0 && <p className="suave">Sin clientes con ese filtro.</p>}
      {lista.map((c) => (
        <Link key={c.id} href={`/clientes/${c.id}`} className="fila"><span><b>{c.nombre}</b><br /><span className="suave">{c.contactoNombre || "—"} · {c.proyectos} proyecto(s)</span></span></Link>
      ))}
    </>
  );
}
