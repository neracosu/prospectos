import Link from "next/link";
import { exigirSesion } from "@/lib/sesion";
import { buscarProspectos, listarNichos } from "@/lib/prospectos";
import { ETAPAS, ETIQUETA_ETAPA, esEtapa } from "@/lib/embudo-contrato";
import { Etapa } from "@/componentes/Etapa";

export const dynamic = "force-dynamic";

export default async function Prospectos({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await exigirSesion();
  const sp = await searchParams;
  const etapa = sp.etapa && esEtapa(sp.etapa) ? sp.etapa : undefined;
  const nichoId = sp.nicho ? Number(sp.nicho) || undefined : undefined;
  const [lista, nichos] = await Promise.all([buscarProspectos({ q: sp.q, etapa, nichoId }), listarNichos()]);
  return (
    <>
      <div className="fila" style={{ border: 0 }}><h1 className="titulo">Prospectos</h1><Link className="boton boton--primario" href="/prospectos/nuevo">Nuevo</Link></div>
      <form className="tarjeta" method="get">
        <label className="campo"><span>Buscar</span><input name="q" defaultValue={sp.q ?? ""} placeholder="Nombre, ciudad o teléfono" /></label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label className="campo"><span>Nicho</span>
            <select name="nicho" defaultValue={sp.nicho ?? ""}><option value="">Todos</option>{nichos.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}</select></label>
          <label className="campo"><span>Etapa</span>
            <select name="etapa" defaultValue={sp.etapa ?? ""}><option value="">Todas</option>{ETAPAS.map((e) => <option key={e} value={e}>{ETIQUETA_ETAPA[e]}</option>)}</select></label>
        </div>
        <button className="boton" type="submit">Filtrar</button>
      </form>
      {lista.length === 0 && <p className="suave">Nada con esos filtros.</p>}
      {lista.map((p) => (
        <Link key={p.id} href={`/prospectos/${p.id}`} className="fila">
          <span><b>{p.nombre}</b><br /><span className="suave">{p.ciudad} · {p.nichoNombre}</span></span>
          <Etapa etapa={p.etapa} />
        </Link>
      ))}
    </>
  );
}
