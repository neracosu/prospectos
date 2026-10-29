import Link from "next/link";
import { exigirRol } from "@/lib/sesion";
import { PERIODOS, resumenWeb, podarEventosViejos } from "@/lib/web";
import { CabeceraPagina } from "@/componentes/CabeceraPagina";
import { fechaVisible, hoyCaracas } from "@/lib/fecha-caracas";

export const dynamic = "force-dynamic";

const pct = (n: number, de: number) => (de > 0 ? Math.round((100 * n) / de) : 0);

function Barras({ filas }: { filas: { nombre: string; n: number; de: number }[] }) {
  return (
    <div className="web-barras">
      {filas.map((f) => (
        <div key={f.nombre} className="web-barra">
          <div className="web-barra__texto"><span>{f.nombre}</span><b>{f.n}{f.de > 0 && <span className="suave"> · {pct(f.n, f.de)} %</span>}</b></div>
          <div className="progreso" aria-hidden="true"><i style={{ width: `${pct(f.n, f.de)}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

export default async function Web({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  await exigirRol("dueno");
  const pedido = Number((await searchParams).d);
  const dias = (PERIODOS as readonly number[]).includes(pedido) ? pedido : 7;
  await podarEventosViejos().catch(() => 0);
  const r = await resumenWeb(dias);

  return (
    <>
      <CabeceraPagina titulo="Web" accion={<Link href="/solicitudes" className="boton">Solicitudes</Link>} />
      <p className="suave">Lo que hace la gente en neracosu.com. Sin cookies ni IP: una «persona» es una visita del navegador, y quien vuelve otro día cuenta otra vez. Los robots no se cuentan.</p>

      <h2 className="titulo">Visitas</h2>
      <nav className="pestanas" aria-label="Periodo">
        {PERIODOS.map((p) => <Link key={p} href={`/web?d=${p}`} className={`pestanas__item${p === dias ? " activa" : ""}`} aria-current={p === dias ? "page" : undefined}>{p} días</Link>)}
      </nav>
      <div className="tarjeta cifras">
        <div><b>{r.personas}</b><span className="suave">personas</span></div>
        <div><b>{pct(r.moviles, r.personas)} %</b><span className="suave">en teléfono</span></div>
        <div><b>{pct(r.seFueron, r.personas)} %</b><span className="suave">se fue sin tocar nada</span></div>
      </div>

      <section className="tarjeta">
        <h3 className="web-sub">Del clic a la solicitud</h3>
        <Barras filas={r.embudo.map((p) => ({ nombre: p.paso, n: p.personas, de: r.personas }))} />
      </section>

      <section className="tarjeta">
        <h3 className="web-sub">Embudo de /empezar</h3>
        {r.empezar.personas === 0 ? <p className="suave">Nadie ha abierto /empezar en este periodo.</p> : (<>
          <p className="suave">De {r.empezar.personas} que la abrieron.</p>
          <Barras filas={r.empezar.pasos.map((p) => ({ nombre: p.nombre, n: p.personas, de: r.empezar.personas }))} />
          <h4 className="web-sub">Por dónde llegaron</h4>
          <Barras filas={r.empezar.origenes.map((o) => ({ nombre: `${o.nombre} · ${o.enviaron} dejaron datos`, n: o.personas, de: r.empezar.personas }))} />
        </>)}
      </section>

      <section className="tarjeta">
        <h3 className="web-sub">Hasta dónde bajan en la home</h3>
        <p className="suave">De {r.home.personas} que la vieron.</p>
        <Barras filas={r.home.secciones.map((s) => ({ nombre: s.nombre, n: s.personas, de: r.home.personas }))} />
      </section>

      <section className="tarjeta">
        <h3 className="web-sub">De dónde vienen</h3>
        {r.origenes.length === 0 ? <p className="suave">Sin datos todavía.</p> : <Barras filas={r.origenes.map((o) => ({ nombre: o.nombre, n: o.personas, de: r.personas }))} />}
      </section>

      <section className="tarjeta">
        <h3 className="web-sub">Qué tocan</h3>
        {r.clics.length === 0 ? <p className="suave">Nadie tocó WhatsApp, la calculadora ni los precios en este periodo.</p> : <Barras filas={r.clics.map((c) => ({ nombre: c.destino, n: c.personas, de: r.personas }))} />}
      </section>

      <section className="tarjeta">
        <h3 className="web-sub">Páginas más vistas</h3>
        {r.paginas.length === 0 ? <p className="suave">Sin datos todavía.</p> : <Barras filas={r.paginas.map((p) => ({ nombre: p.ruta, n: p.personas, de: r.personas }))} />}
      </section>

      <section className="tarjeta">
        <h3 className="web-sub">Personas por día</h3>
        {r.porDia.length === 0 ? <p className="suave">Sin datos todavía.</p> : (
          <ul className="web-dias">
            {r.porDia.map((d) => <li key={d.dia}><span>{fechaVisible(d.dia)}</span><b>{d.personas}</b></li>)}
          </ul>
        )}
      </section>
    </>
  );
}
