import { notFound } from "next/navigation";
import { exigirCliente } from "@/lib/sesion-cliente";
import { proyectoPortal } from "@/lib/portal";
import { hoyCaracas, fechaVisible } from "@/lib/fecha-caracas";
import { formatoUSD } from "@/lib/dinero";
import { ETIQUETA_COBRO } from "@/lib/cobros-contrato";
import { ETIQUETA_CAMBIO } from "@/lib/semver-contrato";
import { textoFechaHito } from "@/lib/portal-contrato";
import { PortalBarra } from "@/componentes/PortalBarra";
import { Pestanas } from "@/componentes/Pestanas";
import { EstadoProyecto } from "@/componentes/EstadoProyecto";

export const dynamic = "force-dynamic";
const PESTANAS = [{ clave: "avance", texto: "Avance" }, { clave: "versiones", texto: "Versiones" }, { clave: "cobros", texto: "Cobros" }, { clave: "documentos", texto: "Documentos" }];

export default async function ProyectoDelPortal({ params, searchParams }: { params: Promise<{ codigo: string; id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { codigo, id } = await params;
  const s = await exigirCliente(codigo);
  // El id viene de la URL: proyectoPortal lo busca SIEMPRE junto al clienteId de la sesion. Ajeno = 404.
  const p = await proyectoPortal(s.clienteId, Number(id), hoyCaracas());
  if (!p) notFound();
  const tParam = (await searchParams).t;
  const t = tParam && PESTANAS.some((x) => x.clave === tParam) ? tParam : "avance";
  return (
    <main className="portal">
      <PortalBarra codigo={codigo} />
      <h1>{p.nombre}</h1>
      <p className="portal__bajada"><EstadoProyecto estado={p.estado} /></p>
      <Pestanas base={`/c/${codigo}/proyecto/${p.id}`} activa={t} items={PESTANAS} />

      {t === "avance" && (
        <section className="tarjeta">
          {p.hitos.porcentaje === null ? <p style={{ margin: 0 }}>Sin hitos publicados todavía.</p> : (
            <>
              <h2>{p.hitos.porcentaje} % de avance</h2>
              <p className="suave" style={{ margin: "4px 0 0" }}>{p.hitos.hechos} de {p.hitos.total} hitos cumplidos</p>
              <div className="progreso"><i style={{ width: `${p.hitos.porcentaje}%` }} /></div>
              <ul className="hitos">
                {p.listaHitos.map((h, i) => (
                  <li key={i}>
                    <span className={`hitos__marca${h.hecho ? " hitos__marca--hecho" : ""}`} aria-hidden="true">{h.hecho ? "✓" : ""}</span>
                    <span>{h.texto}<small>{textoFechaHito(h)}</small></span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {t === "versiones" && (
        <section className="tarjeta">
          {p.versiones.length === 0 && <p style={{ margin: 0 }}>Todavía no hay versiones publicadas.</p>}
          {p.versiones.map((v, i) => (
            <article key={v.version} className={`version${i === 0 ? " version--actual" : ""}`}>
              <div className="version__numero">{v.version}<small>{fechaVisible(v.fecha)}{i === 0 ? <><br />versión actual</> : null}</small></div>
              <ul>{v.cambios.map((c, j) => <li key={j}><b>{ETIQUETA_CAMBIO[c.tipo]}</b>{c.texto}</li>)}</ul>
            </article>
          ))}
        </section>
      )}

      {t === "cobros" && (
        <>
          <section className="tarjeta">
            <dl className="acordado">
              <div><dt>Precio acordado</dt><dd>{formatoUSD(p.pagoUnico)}</dd></div>
              <div><dt>Mensualidad</dt><dd>{p.mensualidad > 0 ? formatoUSD(p.mensualidad) : "No aplica"}</dd></div>
              <div><dt>Día de cobro</dt><dd>{p.mensualidad > 0 ? p.diaCobroMensual : "—"}</dd></div>
            </dl>
          </section>
          <section className="tarjeta">
            <h2>Por pagar</h2>
            {p.cobros.porPagar.length === 0 && <p className="suave" style={{ margin: "8px 0 0" }}>Estás al día: no tienes cobros pendientes.</p>}
            {p.cobros.porPagar.map((c) => (
              <div key={c.id} className="cobro">
                <span>{c.texto}<small>{c.estado === "vencido" ? `Venció el ${fechaVisible(c.vence)}` : `Vence el ${fechaVisible(c.vence)}`}</small></span>
                <span style={{ textAlign: "right" }}><span className="cobro__monto">{formatoUSD(c.monto)}</span><br /><span className={`etiqueta etiqueta--${c.estado}`}>{ETIQUETA_COBRO[c.estado]}</span></span>
              </div>
            ))}
            {p.cobros.porPagar.length > 0 && <p className="suave" style={{ margin: "12px 0 0" }}>El pago sigue como siempre: por WhatsApp, Zelle o pago móvil.</p>}
          </section>
          <section className="tarjeta">
            <h2>Pagados</h2>
            {p.cobros.pagados.length === 0 && <p className="suave" style={{ margin: "8px 0 0" }}>Todavía no hay pagos registrados.</p>}
            {p.cobros.pagados.map((c) => (
              <div key={c.id} className="cobro">
                <span>{c.texto}<small>Pagado el {fechaVisible(c.pagadoEl ?? c.vence)}{c.canal ? ` por ${c.canal}` : ""}</small></span>
                <span style={{ textAlign: "right" }}><span className="cobro__monto">{formatoUSD(c.monto)}</span></span>
                {c.reciboNumero && <div style={{ gridColumn: "1 / -1" }}><a className="boton mini" href={`/recibos/${c.reciboNumero}.pdf`} target="_blank" rel="noopener">Descargar recibo {c.reciboNumero}</a></div>}
              </div>
            ))}
          </section>
        </>
      )}

      {t === "documentos" && (
        <section className="tarjeta">
          {p.propuestaCodigo
            ? <p style={{ margin: 0 }}><a className="boton" href={`/p/${p.propuestaCodigo}`} target="_blank" rel="noopener">Ver la propuesta aceptada</a></p>
            : <p style={{ margin: 0 }}>Todavía no hay documentos de este proyecto.</p>}
        </section>
      )}
    </main>
  );
}
