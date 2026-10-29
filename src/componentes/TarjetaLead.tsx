"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import type { LeadTarjeta } from "@/lib/leads";
import type { Etapa } from "@/lib/embudo-contrato";
import { destinosLead, ETIQUETA_ETAPA_LEAD, ETIQUETA_FUENTE, type FuenteLead } from "@/lib/leads-contrato";
import { moverLead } from "@/acciones/leads";
import { formatoUSD } from "@/lib/dinero";
// dd/mm: cabe en una columna estrecha del tablero
const fechaCorta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// Un lead en el tablero o en la lista: nombre, fuente, valor, siguiente paso con su fecha, WhatsApp y «Mover a».
// Al mover, la tarjeta se va de su columna al instante; la accion revalida y la columna nueva la trae.
export function TarjetaLead({ lead, compacta = false, conValor = true, arrastrable = false }: { lead: LeadTarjeta; compacta?: boolean; conValor?: boolean; arrastrable?: boolean }) {
  const [arrastrando, setArrastrando] = useState(false);
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
    <article
      className={`lead${lead.estadoPaso ? ` lead--${lead.estadoPaso}` : ""}${arrastrando ? " lead--arrastrando" : ""}`}
      data-id={lead.id}
      draggable={arrastrable || undefined}
      // El dato real va en text/plain; el tipo con la etapa es una marca legible durante dragover (ColumnaTablero)
      onDragStart={arrastrable ? (e) => { e.dataTransfer.setData("text/plain", `${lead.id}:${lead.etapa}`); e.dataTransfer.setData(`application/x-lead-etapa-${lead.etapa}`, "1"); e.dataTransfer.effectAllowed = "move"; setArrastrando(true); } : undefined}
      onDragEnd={arrastrable ? () => setArrastrando(false) : undefined}
    >
      <Link href={`/leads/${lead.id}`} className="lead__nombre">{lead.nombre}</Link>
      {conValor && lead.valorEstimado !== null && <span className="lead__valor">{formatoUSD(lead.valorEstimado)}</span>}
      <div className="lead__meta suave">{ETIQUETA_FUENTE[lead.fuenteLead as FuenteLead] ?? lead.fuenteLead} · {lead.nichoNombre}{lead.ciudad ? ` · ${lead.ciudad}` : ""}</div>
      {(lead.proximoPaso || lead.proximoSeguimiento) && (
        <div className="lead__paso">
          <span>{lead.proximoPaso || "Siguiente paso sin texto"}</span>
          {lead.proximoSeguimiento && <span className={`lead__fecha lead__fecha--${lead.estadoPaso}`}>{lead.estadoPaso === "hoy" ? "Hoy" : lead.estadoPaso === "vencido" ? `Vencido ${fechaCorta(lead.proximoSeguimiento)}` : fechaCorta(lead.proximoSeguimiento)}</span>}
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
