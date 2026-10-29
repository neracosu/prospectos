"use client";
import { useState, useTransition } from "react";
import { FUENTES_LEAD, ETIQUETA_FUENTE, type FuenteLead } from "@/lib/leads-contrato";
import { guardarDatosLead } from "@/acciones/leads";
import { guardarNota } from "@/acciones/prospectos";

// Datos del lead que Neri completa con el tiempo: fuente, valor estimado, enlace a la propuesta o prototipo, nicho, nota.
export function DatosLead({ id, fuenteLead, valorEstimado, propuestaUrl, nichoId, nichos, nota, rol }: {
  id: number; fuenteLead: string; valorEstimado: number | null; propuestaUrl: string; nichoId: number;
  nichos: { id: number; nombre: string }[]; nota: string; rol: "dueno" | "prospectador";
}) {
  const [msj, setMsj] = useState("");
  const [pendiente, empezar] = useTransition();
  return (
    <section className="tarjeta ficha__datos">
      {rol === "dueno" && (
        <form onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); empezar(async () => {
          const r = await guardarDatosLead(id, { fuenteLead: String(f.get("fuenteLead")) as FuenteLead, valorEstimado: String(f.get("valorEstimado") ?? ""), propuestaUrl: String(f.get("propuestaUrl") ?? ""), nichoId: Number(f.get("nichoId")) });
          setMsj(r.ok ? "Datos guardados." : r.mensaje); }); }}>
          <b>Datos del lead</b>
          <div className="ficha__grilla">
            <label className="campo"><span>Fuente</span><select name="fuenteLead" defaultValue={fuenteLead}>{FUENTES_LEAD.map((f) => <option key={f} value={f}>{ETIQUETA_FUENTE[f]}</option>)}</select></label>
            <label className="campo"><span>Nicho</span><select name="nichoId" defaultValue={nichoId}>{nichos.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}</select></label>
            <label className="campo"><span>Valor estimado (USD)</span><input name="valorEstimado" inputMode="decimal" defaultValue={valorEstimado === null ? "" : String(valorEstimado)} placeholder="2100" /></label>
            <label className="campo"><span>Propuesta o prototipo (enlace)</span><input name="propuestaUrl" defaultValue={propuestaUrl} maxLength={300} placeholder="https://…" /></label>
          </div>
          <div className="fila-botones"><button className="boton" type="submit" disabled={pendiente}>Guardar datos</button>{propuestaUrl && <a className="boton" href={propuestaUrl} target="_blank" rel="noopener noreferrer">Abrir propuesta</a>}</div>
        </form>
      )}
      <form onSubmit={(e) => { e.preventDefault(); const t = (e.currentTarget.elements.namedItem("nota") as HTMLTextAreaElement).value; empezar(async () => { const r = await guardarNota(id, t); setMsj(r.ok ? "Nota guardada." : r.mensaje); }); }}>
        <label className="campo"><span>Nota interna</span><textarea name="nota" rows={4} defaultValue={nota} maxLength={2000} /></label>
        <button className="boton" type="submit" disabled={pendiente}>Guardar nota</button>
      </form>
      {msj && <p className="suave" role="status">{msj}</p>}
    </section>
  );
}
