import { notFound, redirect } from "next/navigation";
import { exigirSesion } from "@/lib/sesion";
import { fichaProspecto } from "@/lib/prospectos";
import { ETIQUETA_CANAL, type Canal } from "@/lib/canales-contrato";
import { Etapa } from "@/componentes/Etapa";
import { FichaAcciones } from "@/componentes/FichaAcciones";
import { BotonCopiar } from "@/componentes/BotonCopiar";
import { EnviarPorCorreo } from "@/componentes/EnviarPorCorreo";
import { SugerenciasWeb } from "@/componentes/SugerenciasWeb";
import { FichaNegocioBloque } from "@/componentes/FichaNegocioBloque";
import { RastroBloque } from "@/componentes/RastroBloque";

export const dynamic = "force-dynamic";

const TEXTO_EVENTO: Record<string, string> = { enviado: "Enviado", seguimiento: "Escribió de nuevo", abierto: "Abrió la propuesta", etapa: "Cambio de etapa", nota: "Nota", saltado: "Saltado", salto_deshecho: "Salto deshecho", importado: "Ingresó", lectura_web: "Leyó la web", correo_abierto: "Abrió el correo", correo_clic: "Tocó “Ver la propuesta” en el correo", pdf_descargado: "Descargó el PDF", correo_bloqueado: "Correo bloqueado", ficha_generada: "Ficha investigada", ficha_revisada: "Ficha revisada" };

export default async function Ficha({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const u = await exigirSesion();
  const id = Number((await params).id);
  const p = Number.isInteger(id) ? await fichaProspecto(id) : null;
  if (!p) notFound();
  // Un lead tiene su propia ficha (fase 2); aqui queda la fila del directorio con las acciones de la cola.
  if (p.esLead) redirect(`/leads/${id}`);
  const conPropias = (await searchParams).mias === "1";
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
      <p className="suave" style={{ margin: 0 }}>Directorio</p>
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
      <FichaNegocioBloque prospectoId={p.id} ficha={p.ficha} correoBloqueado={p.correoBloqueado} tieneCorreo={!!p.email} esDueno={u.rol === "dueno"} />
      {p.tienePropuesta && (
        <section className="tarjeta">
          <b>Propuesta</b>
          <div className="fila-botones"><a className="boton" href={p.enlace} target="_blank" rel="noopener">Ver</a><a className="boton" href={`${p.enlace}/pdf`}>PDF</a><BotonCopiar texto={p.enlace} etiqueta="Copiar enlace" /><BotonCopiar texto={p.mensaje} /></div>
          <p className="suave">{p.abrio ? "El prospecto abrió la propuesta." : "Todavía no la ha abierto."}</p>
        </section>
      )}
      {p.tienePropuesta && u.rol === "dueno" && <EnviarPorCorreo id={p.id} email={p.email} />}
      <FichaAcciones id={p.id} etapa={p.etapa} nota={p.nota} proximoSeguimiento={p.proximoSeguimiento} contacto={p} mensaje={p.mensaje} rol={u.rol} />
      <RastroBloque prospectoId={p.id} propuestaUrl={p.propuestaUrl} rol={u.rol} conPropias={conPropias} ruta={`/prospectos/${p.id}`} />
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
