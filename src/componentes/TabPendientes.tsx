"use client";
import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PendienteFila } from "@/lib/proyectos";
import { agregarPendiente, marcarPendiente, alternarVisible, moverPendiente, eliminarPendiente, avisarHito } from "@/acciones/pendientes";

export function TabPendientes({ proyectoId, pendientes, avance }: { proyectoId: number; pendientes: PendienteFila[]; avance: number | null }) {
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
  const correr = (fn: () => Promise<{ ok: boolean; mensaje?: string }>) => empezar(async () => { const r = await fn(); if (r.ok) { setError(""); router.refresh(); } else setError(r.mensaje ?? "Error"); });
  // Igual que en TabVersiones: si window.open() vuelve bloqueado (comun en movil despues de un await), se deja el enlace a la vista.
  const [enlaceManual, setEnlaceManual] = useState<{ id: number; href: string } | null>(null);
  const avisar = (id: number) => empezar(async () => {
    const r = await avisarHito(id);
    if (r.ok) {
      const ventana = window.open(r.datos.href, "_blank", "noopener");
      setEnlaceManual(ventana ? null : { id, href: r.datos.href });
      setError("");
      router.refresh();
    } else setError(r.mensaje);
  });
  return (
    <section className="tarjeta">
      <b>{avance === null ? "Sin hitos publicados" : `Avance visible: ${avance} %`}</b>
      {avance !== null && <div className="progreso"><i style={{ width: `${avance}%` }} /></div>}
      {pendientes.map((p, i) => (
        <Fragment key={p.id}>
          <div className="pendiente">
            <input type="checkbox" checked={p.hecho} disabled={pendiente} onChange={(e) => correr(() => marcarPendiente(p.id, e.target.checked))} aria-label={p.texto} />
            <span style={{ flex: 1 }}><span className={p.hecho ? "hecho" : ""}>{p.texto}</span>{p.fechaEstimada ? <span className="suave"> · {p.fechaEstimada}</span> : null}{p.avisado ? <span className="suave"> · avisado</span> : null}</span>
            <button className="boton mini" title={p.visibleCliente ? "Visible al cliente" : "Interno"} disabled={pendiente} onClick={() => correr(() => alternarVisible(p.id))}>{p.visibleCliente ? "👁" : "—"}</button>
            <button className="boton mini" disabled={pendiente || i === 0} aria-label="Subir" onClick={() => correr(() => moverPendiente(p.id, "arriba"))}>↑</button>
            <button className="boton mini" disabled={pendiente || i === pendientes.length - 1} aria-label="Bajar" onClick={() => correr(() => moverPendiente(p.id, "abajo"))}>↓</button>
            <button className="boton mini boton--peligro" disabled={pendiente} aria-label="Eliminar" onClick={() => { if (confirm("¿Eliminar este pendiente?")) correr(() => eliminarPendiente(p.id)); }}>×</button>
          </div>
          {p.hecho && p.visibleCliente && !p.avisado && (
            <div className="fila-botones" style={{ margin: "0 0 8px" }}><button className="boton mini" disabled={pendiente} onClick={() => avisar(p.id)}>Avisar al cliente</button></div>
          )}
          {enlaceManual?.id === p.id && <p className="suave">El navegador bloqueó la ventana: <a href={enlaceManual.href} target="_blank" rel="noopener">Abrir WhatsApp</a></p>}
        </Fragment>
      ))}
      <form className="pregunta" action={(fd) => correr(async () => { const r = await agregarPendiente(fd); return r; })}>
        <input type="hidden" name="proyectoId" value={proyectoId} />
        <label className="campo"><span>Nuevo pendiente</span><input name="texto" required /></label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label className="campo"><span><input type="checkbox" name="visibleCliente" /> Visible al cliente</span></label>
          <label className="campo"><span>Fecha estimada</span><input name="fechaEstimada" type="date" /></label>
        </div>
        <button className="boton boton--primario" disabled={pendiente}>Agregar</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
