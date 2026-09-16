import { notFound } from "next/navigation";
import { exigirSesion } from "@/lib/sesion";
import { fichaProspecto } from "@/lib/prospectos";
import { ETIQUETA_CANAL, type Canal } from "@/lib/canales-contrato";
import { Etapa } from "@/componentes/Etapa";
import { FichaAcciones } from "@/componentes/FichaAcciones";
import { BotonCopiar } from "@/componentes/BotonCopiar";

export const dynamic = "force-dynamic";

const TEXTO_EVENTO: Record<string, string> = { enviado: "Enviado", seguimiento: "Escribió de nuevo", abierto: "Abrió la propuesta", etapa: "Cambio de etapa", nota: "Nota", saltado: "Saltado", importado: "Ingresó" };

export default async function Ficha({ params }: { params: Promise<{ id: string }> }) {
  await exigirSesion();
  const id = Number((await params).id);
  const p = Number.isInteger(id) ? await fichaProspecto(id) : null;
  if (!p) notFound();
  const contacto: [string, string][] = [
    ["WhatsApp", p.whatsapp ? `https://wa.me/${p.whatsapp}` : ""], ["Teléfono", p.telefono ? `tel:${p.telefono.replace(/[^\d+]/g, "")}` : ""],
    ["Correo", p.email ? `mailto:${p.email}` : ""], ["Web", p.web], ["Instagram", p.instagram], ["Facebook", p.facebook], ["TikTok", p.tiktok],
  ];
  return (
    <>
      <h1 className="titulo">{p.nombre} <Etapa etapa={p.etapa} /></h1>
      <p className="suave">{p.ciudad} · {p.nichoNombre}{p.tipo ? ` · ${p.tipo}` : ""}{p.tamano ? ` · ${p.tamano}` : ""}</p>
      <section className="tarjeta">
        <b>Contacto</b>
        {contacto.filter(([, h]) => h).map(([t, h]) => <div key={t} className="fila"><span>{t}</span><a href={h} target="_blank" rel="noopener">{h.replace(/^(https?:\/\/|mailto:|tel:)/, "")}</a></div>)}
        {p.fuentes.length > 0 && <p className="suave">Fuentes: {p.fuentes.map((f, i) => <a key={i} href={f} target="_blank" rel="noopener">[{i + 1}] </a>)}</p>}
      </section>
      <section className="tarjeta">
        <b>Propuesta</b>
        <div className="fila-botones"><a className="boton" href={p.enlace} target="_blank" rel="noopener">Ver</a><BotonCopiar texto={p.enlace} etiqueta="Copiar enlace" /><BotonCopiar texto={p.mensaje} /></div>
        <p className="suave">{p.abrio ? "El prospecto abrió la propuesta." : "Todavía no la ha abierto."}</p>
      </section>
      <FichaAcciones id={p.id} etapa={p.etapa} nota={p.nota} proximoSeguimiento={p.proximoSeguimiento} contacto={p} mensaje={p.mensaje} />
      <section className="tarjeta">
        <b>Historial</b>
        <ul className="historial" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {p.historial.map((e) => (
            <li key={e.id}>
              {TEXTO_EVENTO[e.tipo] ?? e.tipo}{e.canal ? ` por ${ETIQUETA_CANAL[e.canal as Canal] ?? e.canal}` : ""}{e.a ? ` → ${e.a}` : ""}{e.texto ? `: ${e.texto}` : ""}
              <time>{e.creadoEn.toLocaleString("es-VE", { timeZone: "America/Caracas" })}{e.usuarioNombre ? ` · ${e.usuarioNombre}` : ""}</time>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
