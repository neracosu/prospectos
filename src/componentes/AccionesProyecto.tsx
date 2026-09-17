"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ESTADOS_PROYECTO, ETIQUETA_ESTADO, puedePasarProyecto, type EstadoProyecto } from "@/lib/proyectos-contrato";
import { cambiarEstadoProyecto, editarProyecto } from "@/acciones/proyectos";
import { MasAcciones } from "@/componentes/MasAcciones";

type P = { id: number; nombre: string; estado: EstadoProyecto; mensualidad: number; horasCotizadas: number; fechaEntregaEstimada: string | null; diaCobroMensual: number };

export function AccionesProyecto({ proyecto }: { proyecto: P }) {
  const [motivo, setMotivo] = useState("");
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
  const correr = (fn: () => Promise<{ ok: boolean; mensaje?: string }>) => empezar(async () => { const r = await fn(); if (r.ok) { setError(""); setEditando(false); router.refresh(); } else setError(r.mensaje ?? "Error"); });
  const destinos = ESTADOS_PROYECTO.filter((e) => puedePasarProyecto(proyecto.estado, e));
  const botonEditar = <button className="boton mini" onClick={() => setEditando((v) => !v)}>{editando ? "Cancelar" : "Editar proyecto"}</button>;
  return (
    <section className="tarjeta tarjeta--compacta">
      {/* Pausar o cerrar un proyecto pasa pocas veces: vive detras de «···» y no le quita la primera pantalla a los cobros. */}
      {destinos.length === 0 ? <div className="fila-botones">{botonEditar}</div> : (
        <MasAcciones etiqueta="Cambiar el estado del proyecto" principal={botonEditar}>
          {destinos.includes("cerrado") && <label className="campo" style={{ flexBasis: "100%", margin: 0 }}><span>Motivo (solo para cerrar)</span><input value={motivo} onChange={(e) => setMotivo(e.target.value)} /></label>}
          {destinos.map((e) => <button key={e} className={"boton mini" + (e === "cerrado" ? " boton--peligro" : "")} disabled={pendiente} onClick={() => correr(() => cambiarEstadoProyecto(proyecto.id, e, motivo))}>Pasar a {ETIQUETA_ESTADO[e].toLowerCase()}</button>)}
        </MasAcciones>
      )}
      {editando && (
        <form action={(fd) => correr(() => editarProyecto(fd))}>
          <input type="hidden" name="id" value={proyecto.id} />
          <label className="campo"><span>Nombre</span><input name="nombre" defaultValue={proyecto.nombre} required /></label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label className="campo"><span>Mensualidad (USD)</span><input name="mensualidad" inputMode="decimal" defaultValue={proyecto.mensualidad} /></label>
            <label className="campo"><span>Horas cotizadas</span><input name="horasCotizadas" inputMode="decimal" defaultValue={proyecto.horasCotizadas} /></label>
            <label className="campo"><span>Entrega estimada</span><input name="fechaEntregaEstimada" type="date" defaultValue={proyecto.fechaEntregaEstimada ?? ""} /></label>
            <label className="campo"><span>Día de cobro</span><input name="diaCobroMensual" type="number" min={1} max={28} defaultValue={proyecto.diaCobroMensual} /></label>
          </div>
          <p className="suave">Cambiar el día de cobro no toca las mensualidades ya generadas.</p>
          <button className="boton boton--primario" disabled={pendiente}>Guardar</button>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
