import Link from "next/link";
import { exigirSesion } from "@/lib/sesion";
import { hoyCaracas } from "@/lib/fecha-caracas";
import { listarLeads, listarDescartados } from "@/lib/leads";
import { listarNichos } from "@/lib/prospectos";
import { esEtapa } from "@/lib/embudo-contrato";
import { ETIQUETA_ETAPA_LEAD, ETIQUETA_FUENTE, FUENTES_LEAD, esFuenteLead } from "@/lib/leads-contrato";
import { formatoUSD } from "@/lib/dinero";
import { CabeceraPagina } from "@/componentes/CabeceraPagina";
import { TarjetaLead } from "@/componentes/TarjetaLead";
import { ColumnaTablero } from "@/componentes/ColumnaTablero";

export const dynamic = "force-dynamic";

// Leads (panel CRM, fase 2): conversaciones reales. Mismo DOM para telefono y escritorio: cinco columnas por etapa;
// en el telefono se ve una a la vez (chips con ?etapa=), en escritorio las cinco como tablero.
export default async function Leads({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirSesion();
  const sp = await searchParams;
  const hoy = hoyCaracas();
  const fuente = sp.fuente && esFuenteLead(sp.fuente) ? sp.fuente : undefined;
  const nichoId = sp.nicho ? Number(sp.nicho) || undefined : undefined;
  const q = sp.q?.trim() || undefined;
  const filtros = { rol: u.rol, fuente, nichoId, q };
  const [r, nichos] = await Promise.all([listarLeads(filtros, hoy), u.rol === "dueno" ? listarNichos() : Promise.resolve([])]);
  const verDescartados = sp.etapa === "descartado";
  const descartados = verDescartados ? await listarDescartados(filtros, hoy) : [];
  const activa = sp.etapa && esEtapa(sp.etapa) && sp.etapa !== "descartado" ? sp.etapa : (r.columnas.find((c) => c.leads.length > 0)?.etapa ?? "por_contactar");
  const con = (k: string, v: string) => { const p = new URLSearchParams(); for (const [a, b] of Object.entries(sp)) if (b && a !== k) p.set(a, b); if (v) p.set(k, v); const s = p.toString(); return `/leads${s ? "?" + s : ""}`; };
  const hayFiltro = Boolean(fuente || nichoId || q);

  return (
    <>
      <CabeceraPagina titulo="Leads" cifra={`${r.total} en el tablero${u.rol === "dueno" && r.valorTotal ? ` · ${formatoUSD(r.valorTotal)}` : ""}`} accion={u.rol === "dueno" ? <Link href="/leads/nuevo" className="boton boton--primario">Nuevo lead</Link> : undefined} />

      {u.rol === "dueno" && (
        <details className="acordeon acordeon--filtros" open={hayFiltro}>
          <summary><span>Filtros</span><span className="suave">{hayFiltro ? "activos" : "fuente, nicho, texto"}</span></summary>
          <form className="acordeon__cuerpo filtros" method="get">
            <label className="campo"><span>Buscar</span><input name="q" defaultValue={q ?? ""} placeholder="Nombre, ciudad o contacto" /></label>
            <label className="campo"><span>Fuente</span><select name="fuente" defaultValue={fuente ?? ""}><option value="">Todas</option>{FUENTES_LEAD.map((f) => <option key={f} value={f}>{ETIQUETA_FUENTE[f]}</option>)}</select></label>
            <label className="campo"><span>Nicho</span><select name="nicho" defaultValue={nichoId ?? ""}><option value="">Todos</option>{nichos.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}</select></label>
            <div className="fila-botones"><button className="boton" type="submit">Filtrar</button>{hayFiltro && <Link className="boton" href="/leads">Quitar filtros</Link>}</div>
          </form>
        </details>
      )}

      {r.total === 0 && !verDescartados && (
        <p className="suave">Todavía no tienes leads{hayFiltro ? " con esos filtros" : ""}. Convierte una <Link href="/solicitudes">solicitud</Link> o <Link href="/leads/nuevo">crea uno</Link>.</p>
      )}

      <nav className="pestanas tablero-chips" aria-label="Etapa">
        {r.columnas.map((c) => (
          <Link key={c.etapa} href={con("etapa", c.etapa)} className={"pestanas__item" + (c.etapa === activa && !verDescartados ? " activa" : "")} aria-current={c.etapa === activa && !verDescartados ? "page" : undefined}>
            {ETIQUETA_ETAPA_LEAD[c.etapa]} <b>{c.leads.length}</b>
          </Link>
        ))}
      </nav>

      <div className="tablero" data-activa={verDescartados ? "descartado" : activa}>
        {r.columnas.map((c) => (
          <section key={c.etapa} className="tablero__columna" data-etapa={c.etapa} aria-label={ETIQUETA_ETAPA_LEAD[c.etapa]}>
            <header className="tablero__titulo">
              <span>{ETIQUETA_ETAPA_LEAD[c.etapa]} <b>{c.leads.length}</b></span>
              {u.rol === "dueno" && c.valor > 0 && <span className="suave">{formatoUSD(c.valor)}</span>}
            </header>
            <ColumnaTablero etapa={c.etapa}>
              {c.leads.length === 0 && <p className="suave tablero__vacio">Nada aquí.</p>}
              {c.leads.map((l) => <TarjetaLead key={l.id} lead={l} conValor={u.rol === "dueno"} arrastrable />)}
            </ColumnaTablero>
          </section>
        ))}
        {verDescartados && (
          <section className="tablero__columna" data-etapa="descartado" aria-label="Descartados">
            <header className="tablero__titulo"><span>Descartados <b>{descartados.length}</b></span></header>
            <div className="tablero__lista">{descartados.map((l) => <TarjetaLead key={l.id} lead={l} conValor={u.rol === "dueno"} />)}</div>
          </section>
        )}
      </div>
      <p className="suave">{verDescartados ? <Link href={con("etapa", "")}>Volver al tablero</Link> : <Link href={con("etapa", "descartado")}>Descartados ({r.descartados})</Link>}</p>
    </>
  );
}
