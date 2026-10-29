import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { exigirSesion } from "@/lib/sesion";
import { fichaProspecto, listarNichos } from "@/lib/prospectos";
import { ETIQUETA_CANAL, type Canal } from "@/lib/canales-contrato";
import { ETIQUETA_ETAPA_LEAD, ETIQUETA_FUENTE, type FuenteLead } from "@/lib/leads-contrato";
import { formatoUSD } from "@/lib/dinero";
import { CabeceraPagina } from "@/componentes/CabeceraPagina";
import { SiguientePaso } from "@/componentes/SiguientePaso";
import { DatosLead } from "@/componentes/DatosLead";
import { BotonCopiar } from "@/componentes/BotonCopiar";

export const dynamic = "force-dynamic";

const TEXTO_EVENTO: Record<string, string> = { enviado: "Propuesta enviada", seguimiento: "Escribió de nuevo", abierto: "Abrió la propuesta", etapa: "Cambio de etapa", nota: "Nota", saltado: "Saltado", salto_deshecho: "Salto deshecho", importado: "Ingresó", lectura_web: "Leyó la web" };

// Ficha de un lead (panel CRM, fase 2): siguiente paso al frente, datos, contacto, propuesta, nota; historial a la
// derecha en escritorio y plegado en el telefono. Una fila del directorio sigue en /prospectos/<id>.
export default async function FichaLead({ params }: { params: Promise<{ id: string }> }) {
  const u = await exigirSesion();
  const id = Number((await params).id);
  const p = Number.isInteger(id) ? await fichaProspecto(id) : null;
  if (!p) notFound();
  if (!p.esLead) redirect(`/prospectos/${id}`);
  // El prospectador solo abre leads que salieron del directorio; lo demas, como si no existiera
  if (u.rol !== "dueno" && p.fuenteLead !== "directorio") notFound();
  const conValor = u.rol === "dueno" && p.valorEstimado !== null;
  const nichos = await listarNichos();
  const contacto: [string, string][] = [
    ["WhatsApp", p.whatsapp ? `https://wa.me/${p.whatsapp}` : ""], ["Teléfono", p.telefono ? `tel:${p.telefono.replace(/[^\d+]/g, "")}` : ""],
    ["Correo", p.email ? `mailto:${p.email}` : ""], ["Web", p.web], ["Instagram", p.instagram], ["Facebook", p.facebook], ["TikTok", p.tiktok],
  ];
  const wa = p.whatsapp ? `https://wa.me/${p.whatsapp}${p.mensaje ? "?text=" + encodeURIComponent(p.mensaje) : ""}` : "";
  const historial = (
    <ul className="historial" style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {p.historial.map((e) => (
        <li key={e.id}>
          {TEXTO_EVENTO[e.tipo] ?? e.tipo}{e.canal ? ` por ${ETIQUETA_CANAL[e.canal as Canal] ?? e.canal}` : ""}{e.a ? ` → ${ETIQUETA_ETAPA_LEAD[e.a as keyof typeof ETIQUETA_ETAPA_LEAD] ?? e.a}` : ""}{e.texto && e.tipo !== "abierto" ? `: ${e.texto}` : ""}
          <time>{e.creadoEn.toLocaleString("es-VE", { timeZone: "America/Caracas" })}{e.usuarioNombre ? ` · ${e.usuarioNombre}` : ""}</time>
        </li>
      ))}
      {p.historial.length === 0 && <li className="suave">Sin movimientos todavía.</li>}
    </ul>
  );
  return (
    <>
      <CabeceraPagina titulo={p.nombre}
        cifra={<><span className={`etiqueta etiqueta--${p.etapa}`}>{ETIQUETA_ETAPA_LEAD[p.etapa]}</span> {ETIQUETA_FUENTE[p.fuenteLead as FuenteLead] ?? p.fuenteLead} · {p.nichoNombre}{p.ciudad ? ` · ${p.ciudad}` : ""}{conValor ? <> · <b className="cifra__dinero">{formatoUSD(p.valorEstimado!)}</b></> : null}</>}
        accion={wa ? <a className="boton boton--primario" href={wa} target="_blank" rel="noopener noreferrer">WhatsApp</a> : undefined} />
      <div className="ficha">
        <div className="ficha__principal">
          <SiguientePaso id={p.id} etapa={p.etapa} texto={p.proximoPaso} fecha={p.proximoSeguimiento} rol={u.rol} />
          <DatosLead id={p.id} fuenteLead={p.fuenteLead} valorEstimado={p.valorEstimado} propuestaUrl={p.propuestaUrl} nichoId={p.nichoId} nichos={nichos} nota={p.nota} rol={u.rol} />
          <section className="tarjeta">
            <b>Contacto</b>
            {contacto.filter(([, h]) => h).map(([t, h]) => (
              <div key={t} className="fila"><span>{t}</span><a href={h} target="_blank" rel="noopener">{h.replace(/^(https?:\/\/|mailto:|tel:)/, "")}</a></div>
            ))}
            {!contacto.some(([, h]) => h) && <p className="suave">Sin contacto todavía.</p>}
          </section>
          {p.tienePropuesta && (
            <section className="tarjeta">
              <b>Propuesta del nicho</b>
              <div className="fila-botones"><a className="boton" href={p.enlace} target="_blank" rel="noopener">Ver</a><a className="boton" href={`${p.enlace}/pdf`}>PDF</a><BotonCopiar texto={p.enlace} etiqueta="Copiar enlace" /><BotonCopiar texto={p.mensaje} /></div>
              <p className="suave">{p.abrio ? "La abrió." : "Todavía no la ha abierto."}</p>
            </section>
          )}
          <details className="acordeon historial-plegado">
            <summary><span>Historial</span><span className="suave">{p.historial.length}</span></summary>
            <div className="acordeon__cuerpo">{historial}</div>
          </details>
          <p className="suave"><Link href="/leads">← Volver a Leads</Link></p>
        </div>
        <aside className="ficha__historial" aria-label="Historial">
          <h2>Historial</h2>
          {historial}
        </aside>
      </div>
    </>
  );
}
