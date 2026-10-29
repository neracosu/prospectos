"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import type { LeadTarjeta } from "@/lib/leads";
import type { Etapa } from "@/lib/embudo-contrato";
import { destinosLead, ETIQUETA_ETAPA_LEAD, ETIQUETA_FUENTE, type FuenteLead } from "@/lib/leads-contrato";
import { moverLead } from "@/acciones/leads";
import { formatoUSD } from "@/lib/dinero";
import { fechaVisible } from "@/lib/fecha-caracas";

// Un lead en el tablero o en la lista: nombre, fuente, valor, siguiente paso con su fecha, WhatsApp y «Mover a».
// Al mover, la tarjeta se va de su columna al instante; la accion revalida y la columna nueva la trae.
export function TarjetaLead({ lead, compacta = false }: { lead: LeadTarjeta; compacta?: boolean }) {
  const [oculta, setOculta] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  if (oculta) return null;
  const destinos = destinosLead(lead.etapa);
  const mover = (a: Etapa) => {
    if (a === "descartado" && motivo.trim().length < 2) { setError("Escribe el motivo."); return; }
    setError("");
    setOculta(true);
    empezar(async () => {
      const r = await moverLead(lead.id, a, motivo);
      if (!r.ok) { setOculta(false); setError(r.mensaje); }
    });
  };
  const wa = lead.whatsapp.replace(/\D/g, "");
  return (
    <article className={`lead${lead.estadoPaso ? ` lead--${lead.estadoPaso}` : ""}`} data-id={lead.id}>
      <div className="lead__cabecera">
        <Link href={`/leads/${lead.id}`} className="lead__nombre">{lead.nombre}</Link>
        {lead.valorEstimado !== null && <span className="lead__valor">{formatoUSD(lead.valorEstimado)}</span>}
      </div>
      <div className="lead__meta suave">{ETIQUETA_FUENTE[lead.fuenteLead as FuenteLead] ?? lead.fuenteLead} · {lead.nichoNombre}{lead.ciudad ? ` · ${lead.ciudad}` : ""}</div>
      {(lead.proximoPaso || lead.proximoSeguimiento) && (
        <div className="lead__paso">
          <span>{lead.proximoPaso || "Siguiente paso sin texto"}</span>
          {lead.proximoSeguimiento && <span className={`lead__fecha lead__fecha--${lead.estadoPaso}`}>{lead.estadoPaso === "hoy" ? "Hoy" : lead.estadoPaso === "vencido" ? `Vencido · ${fechaVisible(lead.proximoSeguimiento)}` : fechaVisible(lead.proximoSeguimiento)}</span>}
        </div>
      )}
      {!compacta && (
        <div className="lead__acciones">
          {wa && <a className="boton boton--primario mini" href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
          {destinos.length > 0 && (
            <button type="button" className="boton mini" aria-expanded={abierto} onClick={() => setAbierto((a) => !a)} disabled={pendiente}>Mover a…</button>
          )}
        </div>
      )}
      {abierto && (
        <div className="lead__mover">
          {destinos.map((d) => (
            <button key={d} type="button" className={`boton mini${d === "descartado" ? " boton--peligro" : ""}`} onClick={() => mover(d)} disabled={pendiente}>{ETIQUETA_ETAPA_LEAD[d]}</button>
          ))}
          {destinos.includes("descartado") && <input className="lead__motivo" placeholder="Motivo si lo descartas" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} />}
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </article>
  );
}
