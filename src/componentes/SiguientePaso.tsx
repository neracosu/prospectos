"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import type { Etapa } from "@/lib/embudo-contrato";
import { destinosLead, ETIQUETA_ETAPA_LEAD } from "@/lib/leads-contrato";
import { guardarSiguientePaso, moverLead } from "@/acciones/leads";

// La tarjeta principal de la ficha de un lead: que sigue y para cuando, y «Mover a…». La accion revalida la ficha,
// asi que la cabecera (etapa) cambia sola; aqui solo se muestra el resultado de cada toque.
export function SiguientePaso({ id, etapa, texto, fecha, rol }: { id: number; etapa: Etapa; texto: string; fecha: string | null; rol: "dueno" | "prospectador" }) {
  const [msj, setMsj] = useState<{ texto: string; tono: "ok" | "error" } | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [pendiente, empezar] = useTransition();
  const destinos = destinosLead(etapa);
  return (
    <section className="tarjeta siguiente-paso">
      <form onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget; const t = (f.elements.namedItem("texto") as HTMLInputElement).value; const d = (f.elements.namedItem("fecha") as HTMLInputElement).value; empezar(async () => { const r = await guardarSiguientePaso(id, t, d); setMsj(r.ok ? { texto: "Siguiente paso guardado.", tono: "ok" } : { texto: r.mensaje, tono: "error" }); }); }}>
        <b>Siguiente paso</b>
        <label className="campo"><span>Qué sigue</span><input name="texto" defaultValue={texto} maxLength={160} placeholder="mandar propuesta, armar demo, esperar su plan…" /></label>
        <label className="campo"><span>Para cuándo</span><input name="fecha" type="date" defaultValue={fecha ?? ""} /></label>
        <div className="fila-botones">
          <button className="boton boton--primario" type="submit" disabled={pendiente}>Guardar</button>
          {destinos.length > 0 && <button type="button" className="boton" aria-expanded={abierto} onClick={() => setAbierto((a) => !a)} disabled={pendiente}>Mover a…</button>}
          {etapa === "ganado" && rol === "dueno" && <Link className="boton boton--primario" href={`/proyectos/nuevo?prospecto=${id}`}>Crear cliente y proyecto</Link>}
        </div>
      </form>
      {abierto && (
        <div className="lead__mover">
          {destinos.map((d) => (
            <button key={d} type="button" className={`boton mini${d === "descartado" ? " boton--peligro" : ""}`} disabled={pendiente}
              onClick={() => { if (d === "descartado" && motivo.trim().length < 2) { setMsj({ texto: "Escribe el motivo.", tono: "error" }); return; } empezar(async () => { const r = await moverLead(id, d, motivo); setMsj(r.ok ? { texto: `Ahora está en «${ETIQUETA_ETAPA_LEAD[d]}».`, tono: "ok" } : { texto: r.mensaje, tono: "error" }); if (r.ok) setAbierto(false); }); }}>
              {ETIQUETA_ETAPA_LEAD[d]}
            </button>
          ))}
          {destinos.includes("descartado") && <input className="lead__motivo" placeholder="Motivo si lo descartas" value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} />}
        </div>
      )}
      {msj && <p className={msj.tono === "error" ? "error" : "suave"} role="status">{msj.texto}</p>}
    </section>
  );
}
