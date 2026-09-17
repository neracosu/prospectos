import { notFound } from "next/navigation";
import { exigirSesion } from "@/lib/sesion";
import { fichaProspecto } from "@/lib/prospectos";
import { ETIQUETA_CANAL, type Canal } from "@/lib/canales-contrato";
import { Etapa } from "@/componentes/Etapa";
import { FichaAcciones } from "@/componentes/FichaAcciones";
import { BotonCopiar } from "@/componentes/BotonCopiar";
import { SugerenciasWeb } from "@/componentes/SugerenciasWeb";

export const dynamic = "force-dynamic";

const TEXTO_EVENTO: Record<string, string> = { enviado: "Enviado", seguimiento: "Escribió de nuevo", abierto: "Abrió la propuesta", etapa: "Cambio de etapa", nota: "Nota", saltado: "Saltado", importado: "Ingresó", lectura_web: "Leyó la web" };

export default async function Ficha({ params }: { params: Promise<{ id: string }> }) {
  const u = await exigirSesion();
  const id = Number((await params).id);
  const p = Number.isInteger(id) ? await fichaProspecto(id) : null;
  if (!p) notFound();
  // [etiqueta, enlace, campo]: el campo es el que guarda fuentesPorCampo, para
  // poder mostrar al lado de cada dato donde lo publica el negocio.
  const contacto: [string, string, string][] = [
    ["WhatsApp", p.whatsapp ? `https://wa.me/${p.whatsapp}` : "", "whatsapp"],
    ["Teléfono", p.telefono ? `tel:${p.telefono.replace(/[^\d+]/g, "")}` : "", "telefono"],
    ["Correo", p.email ? `mailto:${p.email}` : "", "email"],
    ["Web", p.web, "web"], ["Instagram", p.instagram, "instagram"], ["Facebook", p.facebook, "facebook"], ["TikTok", p.tiktok, "tiktok"],
  ];
  return (
    <>
      <h1 className="titulo">{p.nombre} <Etapa etapa={p.etapa} /></h1>
      <p className="suave">{p.ciudad} · {p.nichoNombre}{p.tipo ? ` · ${p.tipo}` : ""}{p.tamano ? ` · ${p.tamano}` : ""}</p>
      <section className="tarjeta">
        <b>Contacto</b>
        {contacto.filter(([, h]) => h).map(([t, h, campo]) => {
          const fuente = p.fuentesPorCampo[campo] ?? "";
          return (
            <div key={t} className="fila">
              <span>{t}</span>
              <span className="fila__valor">
                <a href={h} target="_blank" rel="noopener">{h.replace(/^(https?:\/\/|mailto:|tel:)/, "")}</a>
                {/^https?:\/\//i.test(fuente) && (
                  <a className="fuente-dato" href={fuente} target="_blank" rel="noopener" title={fuente} aria-label={`Dónde publican el dato: ${t}`}>↗</a>
                )}
              </span>
            </div>
          );
        })}
        {p.fuentes.length > 0 && <p className="suave">Fuentes: {p.fuentes.map((f, i) => <a key={i} href={f} target="_blank" rel="noopener">[{i + 1}] </a>)}</p>}
      </section>
      <SugerenciasWeb prospectoId={p.id} tieneWeb={!!p.web} />
      {p.tienePropuesta && (
        <section className="tarjeta">
          <b>Propuesta</b>
          <div className="fila-botones"><a className="boton" href={p.enlace} target="_blank" rel="noopener">Ver</a><BotonCopiar texto={p.enlace} etiqueta="Copiar enlace" /><BotonCopiar texto={p.mensaje} /></div>
          <p className="suave">{p.abrio ? "El prospecto abrió la propuesta." : "Todavía no la ha abierto."}</p>
        </section>
      )}
      <FichaAcciones id={p.id} etapa={p.etapa} nota={p.nota} proximoSeguimiento={p.proximoSeguimiento} contacto={p} mensaje={p.mensaje} rol={u.rol} />
      <section className="tarjeta">
        <b>Historial</b>
        <ul className="historial" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {p.historial.map((e) => (
            <li key={e.id}>
              {/* En "abierto" el texto guarda la IP para deduplicar: es un dato interno, no se muestra aqui. */}
              {TEXTO_EVENTO[e.tipo] ?? e.tipo}{e.canal ? ` por ${ETIQUETA_CANAL[e.canal as Canal] ?? e.canal}` : ""}{e.a ? ` → ${e.a}` : ""}{e.texto && e.tipo !== "abierto" ? `: ${e.texto}` : ""}
              <time>{e.creadoEn.toLocaleString("es-VE", { timeZone: "America/Caracas" })}{e.usuarioNombre ? ` · ${e.usuarioNombre}` : ""}</time>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
