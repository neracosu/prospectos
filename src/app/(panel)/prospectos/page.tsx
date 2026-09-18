import Link from "next/link";
import { exigirSesion } from "@/lib/sesion";
import { buscarProspectos, listarNichos, resumenProspectos, POR_PAGINA_PROSPECTOS } from "@/lib/prospectos";
import { ETAPAS, ETIQUETA_ETAPA, esEtapa } from "@/lib/embudo-contrato";
import { Etapa } from "@/componentes/Etapa";

export const dynamic = "force-dynamic";

// Un enlace a esta misma pantalla con un filtro cambiado y el resto igual. Repetir el valor que ya esta puesto lo quita.
function con(sp: Record<string, string | undefined>, clave: string, valor: string): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v && k !== "pagina" && k !== clave) p.set(k, v);
  if (sp[clave] !== valor) p.set(clave, valor);
  const s = p.toString();
  return `/prospectos${s ? `?${s}` : ""}`;
}
// La misma pantalla, otra pagina, con todos los filtros iguales.
function pagina(sp: Record<string, string | undefined>, n: number): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v && k !== "pagina") p.set(k, v);
  p.set("pagina", String(n));
  return `/prospectos?${p.toString()}`;
}

export default async function Prospectos({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await exigirSesion();
  const sp = await searchParams;
  const etapa = sp.etapa && esEtapa(sp.etapa) ? sp.etapa : undefined;
  const nichoId = sp.nicho ? Number(sp.nicho) || undefined : undefined;
  const ciudad = sp.ciudad?.trim() || undefined;
  const actual = Math.max(1, Number(sp.pagina) || 1);
  const filtros = { q: sp.q, etapa, nichoId, ciudad };
  const [lista, nichos, resumen] = await Promise.all([buscarProspectos({ ...filtros, pagina: actual }), listarNichos(), resumenProspectos(filtros)]);
  const paginas = Math.max(1, Math.ceil(resumen.total / POR_PAGINA_PROSPECTOS));
  const desde = resumen.total === 0 ? 0 : (actual - 1) * POR_PAGINA_PROSPECTOS + 1;
  const hasta = Math.min(resumen.total, (actual - 1) * POR_PAGINA_PROSPECTOS + lista.length);
  const hayFiltro = Boolean(sp.q || etapa || nichoId || ciudad);
  const CIUDADES_A_LA_VISTA = 12;

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
        {ciudad && <input type="hidden" name="ciudad" value={ciudad} />}
        <div className="fila-botones"><button className="boton" type="submit">Filtrar</button>{hayFiltro && <Link className="boton" href="/prospectos">Quitar filtros</Link>}</div>
      </form>

      {/* Totales con los filtros puestos: cada reparto es un filtro al tocarlo (y se quita al tocarlo de nuevo). */}
      <section className="tarjeta totales" aria-label="Totales">
        <p className="dia"><b className="dia__numero">{resumen.total}</b> {resumen.total === 1 ? "prospecto" : "prospectos"}{hayFiltro ? " con estos filtros" : ""}</p>
        <div className="totales__grupo"><span className="totales__rotulo">Por etapa</span>
          <div className="totales__chips">{resumen.porEtapa.map((e) => <Link key={e.etapa} href={con(sp, "etapa", e.etapa)} className={`etiqueta etiqueta--${e.etapa} totales__chip${etapa === e.etapa ? " totales__chip--activo" : ""}`}>{ETIQUETA_ETAPA[e.etapa]} <b>{e.n}</b></Link>)}</div>
        </div>
        <div className="totales__grupo"><span className="totales__rotulo">Por nicho</span>
          <div className="totales__chips">{resumen.porNicho.map((n) => <Link key={n.nichoId} href={con(sp, "nicho", String(n.nichoId))} className={`etiqueta totales__chip${nichoId === n.nichoId ? " totales__chip--activo" : ""}`}>{n.nombre} <b>{n.n}</b></Link>)}</div>
        </div>
        <div className="totales__grupo"><span className="totales__rotulo">Por ciudad</span>
          <div className="totales__chips">
            {resumen.porCiudad.slice(0, CIUDADES_A_LA_VISTA).map((c) => <Link key={c.ciudad} href={con(sp, "ciudad", c.ciudad)} className={`etiqueta totales__chip${ciudad === c.ciudad ? " totales__chip--activo" : ""}`}>{c.ciudad || "(sin ciudad)"} <b>{c.n}</b></Link>)}
            {resumen.porCiudad.length > CIUDADES_A_LA_VISTA && <span className="suave">y {resumen.porCiudad.length - CIUDADES_A_LA_VISTA} ciudades más</span>}
          </div>
        </div>
      </section>

      {lista.length === 0 && <p className="suave">Nada con esos filtros.</p>}
      {lista.map((p) => (
        <Link key={p.id} href={`/prospectos/${p.id}`} className="fila">
          <span><b>{p.nombre}</b><br /><span className="suave">{p.ciudad} · {p.nichoNombre}</span></span>
          <Etapa etapa={p.etapa} />
        </Link>
      ))}
      {paginas > 1 && (
        <nav className="paginador" aria-label="Páginas">
          <p className="suave paginador__cuenta">{desde}–{hasta} de {resumen.total}</p>
          <div className="paginador__botones">
            {actual > 1 ? <Link className="boton" href={pagina(sp, actual - 1)}>Anteriores</Link> : <span />}
            {actual < paginas ? <Link className="boton" href={pagina(sp, actual + 1)}>Siguientes</Link> : <span />}
          </div>
        </nav>
      )}
    </>
  );
}
