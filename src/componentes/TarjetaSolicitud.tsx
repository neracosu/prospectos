import React from "react";
import { BotonAtender } from "@/componentes/BotonAtender";
import { fechaVisible, hoyCaracas } from "@/lib/fecha-caracas";
import { clasificarOrigen, respuestasLegibles } from "@/lib/web-contrato";
import type { SolicitudFila } from "@/lib/web";

const fechaHora = (d: Date) => `${fechaVisible(hoyCaracas(d))} ${new Date(d.getTime() - 4 * 3_600_000).toISOString().slice(11, 16)}`;

// Una solicitud de la web o del embudo /empezar (antes vivia dentro de /web; desde la fase 1 del panel CRM
// tiene su seccion). Verde si esta sin atender; «decidida» si ya se atendio.
export function TarjetaSolicitud({ s }: { s: SolicitudFila }) {
  const wa = s.whatsapp.replace(/\D/g, "");
  const embudo = s.tipo === "embudo";
  const respuestas = embudo ? respuestasLegibles(s.respuestas) : [];
  return (
    <article className={`tarjeta tarjeta--franja ${s.atendidaEn ? "tarjeta--decidida" : "tarjeta--verde"}`}>
      <div className="cabecera">
        <b>{s.nombre}{embudo && s.calificacion && <> <span className="etiqueta etiqueta--nuevo">{s.calificacion === "demo" ? "Califica para demostración" : "Diagnóstico por escrito"}</span></>}</b>
        <span className="suave">{fechaHora(s.creadaEn)}</span>
      </div>
      <dl className="datos">
        <dt>Proyecto</dt><dd>{embudo ? "Embudo /empezar" : s.tipo}</dd>
        {embudo && s.origen && <><dt>Llegó desde</dt><dd>{clasificarOrigen(s.origen)}</dd></>}
        {respuestas.map((r) => <React.Fragment key={r.clave}><dt>{r.clave}</dt><dd>{r.valor}</dd></React.Fragment>)}
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
}
