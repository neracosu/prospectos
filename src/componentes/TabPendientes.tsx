"use client";
import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PendienteFila } from "@/lib/proyectos";
import { fechaVisible } from "@/lib/fecha-caracas";
import { agregarPendiente, marcarPendiente, alternarVisible, moverPendiente, eliminarPendiente, avisarHito } from "@/acciones/pendientes";

export function TabPendientes({ proyectoId, pendientes, avance }: { proyectoId: number; pendientes: PendienteFila[]; avance: number | null }) {
  const [error, setError] = useState("");
  const [abierta, setAbierta] = useState<number | null>(null); // la fila con sus acciones secundarias a la vista
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
  const correr = (fn: () => Promise<{ ok: boolean; mensaje?: string }>) => empezar(async () => { const r = await fn(); if (r.ok) { setError(""); router.refresh(); } else setError(r.mensaje ?? "Error"); });
  // Igual que en TabVersiones: si window.open() vuelve bloqueado (comun en movil despues de un await), se deja el enlace a la vista.
  const [enlaceManual, setEnlaceManual] = useState<{ id: number; href: string } | null>(null);
  const avisar = (id: number) => empezar(async () => {
    const r = await avisarHito(id);
    if (r.ok) {
      // Sin "noopener" en las opciones: con el, window.open devuelve null SIEMPRE y no se sabria si abrio.
      const ventana = window.open(r.datos.href, "_blank");
      if (ventana) ventana.opener = null;
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
            <span style={{ flex: 1 }}>
              <span className={p.hecho ? "hecho" : ""}>{p.texto}</span>
              {/* Lo que antes decia un icono de ojo ahora lo dice el texto: si lo ve el cliente, para cuando, y si ya se aviso. */}
              <small className="pendiente__dato">{[p.visibleCliente ? "Lo ve el cliente" : "Interno", p.fechaEstimada ? `para el ${fechaVisible(p.fechaEstimada)}` : null, p.avisado ? "avisado" : null].filter(Boolean).join(", ")}</small>
            </span>
            <button type="button" className="boton mini boton--mas" aria-label={`Más acciones de: ${p.texto}`} aria-expanded={abierta === p.id} onClick={() => setAbierta((a) => (a === p.id ? null : p.id))}><span aria-hidden="true">···</span></button>
          </div>
          {abierta === p.id && (
            <div className="fila-botones fila-botones--secundarias" style={{ margin: "0 0 8px" }}>
              <button className="boton mini" disabled={pendiente} onClick={() => correr(() => alternarVisible(p.id))}>{p.visibleCliente ? "Pasar a interno" : "Mostrar al cliente"}</button>
              <button className="boton mini" disabled={pendiente || i === 0} onClick={() => correr(() => moverPendiente(p.id, "arriba"))}>Subir</button>
              <button className="boton mini" disabled={pendiente || i === pendientes.length - 1} onClick={() => correr(() => moverPendiente(p.id, "abajo"))}>Bajar</button>
              <button className="boton mini boton--peligro" disabled={pendiente} onClick={() => { if (confirm("¿Eliminar este pendiente?")) correr(() => eliminarPendiente(p.id)); }}>Eliminar</button>
            </div>
          )}
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
