import Link from "next/link";
import { exigirRol } from "@/lib/sesion";
import { PERIODOS, resumenWeb, listarSolicitudes, podarEventosViejos } from "@/lib/web";
import { BotonAtender } from "@/componentes/BotonAtender";
import { fechaVisible, hoyCaracas } from "@/lib/fecha-caracas";

export const dynamic = "force-dynamic";

const pct = (n: number, de: number) => (de > 0 ? Math.round((100 * n) / de) : 0);
const fechaHora = (d: Date) => `${fechaVisible(hoyCaracas(d))} ${new Date(d.getTime() - 4 * 3_600_000).toISOString().slice(11, 16)}`;

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
  const [r, solicitudes] = await Promise.all([resumenWeb(dias), listarSolicitudes()]);
  const nuevas = solicitudes.filter((s) => !s.atendidaEn).length;

  return (
    <>
      <h1 className="titulo">Web</h1>
      <p className="suave">Lo que hace la gente en neracosu.com. Sin cookies ni IP: una «persona» es una visita del navegador, y quien vuelve otro día cuenta otra vez. Los robots no se cuentan.</p>

      <h2 className="titulo" id="solicitudes">Solicitudes {nuevas > 0 && <span className="etiqueta etiqueta--nuevo">{nuevas} sin atender</span>}</h2>
      {solicitudes.length === 0 && <p className="suave">Todavía no llega ninguna por el formulario.</p>}
      {solicitudes.map((s) => {
        const wa = s.whatsapp.replace(/\D/g, "");
        return (
          <article key={s.id} className={`tarjeta tarjeta--franja ${s.atendidaEn ? "tarjeta--decidida" : "tarjeta--verde"}`}>
            <div className="cabecera"><b>{s.nombre}</b><span className="suave">{fechaHora(s.creadaEn)}</span></div>
            <dl className="datos">
              <dt>Proyecto</dt><dd>{s.tipo}</dd>
              {s.presupuesto && <><dt>Presupuesto</dt><dd>{s.presupuesto}</dd></>}
              {s.pagina && <><dt>Desde</dt><dd>{s.pagina}</dd></>}
            </dl>
            <p className="web-mensaje">{s.mensaje}</p>
            <div className="fila-botones">
              {wa && <a className="boton boton--primario mini" href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
              {s.correo && <a className="boton mini" href={`mailto:${s.correo}`}>Correo</a>}
              <BotonAtender id={s.id} atendida={!!s.atendidaEn} />
            </div>
          </article>
        );
      })}

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
