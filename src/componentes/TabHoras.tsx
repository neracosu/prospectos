"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { HorasFila } from "@/lib/proyectos";
import { registrarHoras, eliminarHoras } from "@/acciones/horas";
import { formatoUSD, redondear2 } from "@/lib/dinero";

export function TabHoras({ proyectoId, horas, cotizadas, reales, tarifa, hoy }: { proyectoId: number; horas: HorasFila[]; cotizadas: number; reales: number; tarifa: number; hoy: string }) {
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
  const correr = (fn: () => Promise<{ ok: boolean; mensaje?: string }>) => empezar(async () => { const r = await fn(); if (r.ok) { setError(""); router.refresh(); } else setError(r.mensaje ?? "Error"); });
  const diff = redondear2(reales - cotizadas);
  return (
    <section className="tarjeta">
      <div className="cifras">
        <div><b>{cotizadas}</b>cotizadas</div>
        <div><b>{reales}</b>reales</div>
        <div className={diff > 0 ? "vencido" : ""}><b>{diff > 0 ? "+" : ""}{diff} h</b>{formatoUSD(Math.abs(diff) * tarifa)} a ${tarifa}/h</div>
      </div>
      <p className="suave">Solo tú ves esto. El cliente nunca ve horas ni tarifa.</p>
      <form className="pregunta" action={(fd) => correr(() => registrarHoras(fd))}>
        <input type="hidden" name="proyectoId" value={proyectoId} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label className="campo"><span>Fecha</span><input name="fecha" type="date" defaultValue={hoy} max={hoy} required /></label>
          <label className="campo"><span>Horas (pasos de 0,25)</span><input name="horas" inputMode="decimal" placeholder="2.5" required /></label>
        </div>
        <label className="campo"><span>Qué hiciste</span><input name="descripcion" required /></label>
        <button className="boton boton--primario" disabled={pendiente}>Registrar</button>
      </form>
      <ul className="historial" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {horas.map((h) => <li key={h.id}>{h.fecha} · <b>{h.horas} h</b> · {h.descripcion} <button className="boton mini" disabled={pendiente} onClick={() => correr(() => eliminarHoras(h.id))} title="Solo el mismo día">×</button><time>{h.usuarioNombre}</time></li>)}
      </ul>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
