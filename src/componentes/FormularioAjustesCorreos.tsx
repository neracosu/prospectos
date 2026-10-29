"use client";
import { useState, useTransition } from "react";
import { guardarCorreos } from "@/acciones/ajustes";
import { Campo } from "@/componentes/Campo";
import { useFlotante } from "@/componentes/LineaFlotante";

// Ajustes › Correos: tope diario y el interruptor del envio automatico (la misma accion que «Pausar/Reanudar» de
// /correos). guardarCorreos revalida /ajustes y /correos: la respuesta trae la pantalla nueva.
export function FormularioAjustesCorreos({ tope, automatico }: { tope: number; automatico: boolean }) {
  const [msj, setMsj] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, empezar] = useTransition();
  const guardar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    empezar(async () => {
      const r = await guardarCorreos(fd);
      setMsj(r.ok ? { ok: true, texto: "Guardado." } : { ok: false, texto: r.mensaje });
    });
  };
  return (
    <form className="tarjeta" onSubmit={guardar}>
      <b>Propuesta por correo</b>
      <p className="suave">El automático manda de lunes a viernes, de 9:00 a 17:00, un lote por hora hasta llegar al tope del día. Solo toma los negocios que usted dejó «al automático».</p>
      <Campo nombre="tope" etiqueta="Correos por día (de 1 a 200)" regla={{ tipo: "entero", min: 1, max: 200 }} requerido type="number" inputMode="numeric" min={1} max={200} step={1} defaultValue={tope} />
      <label className="campo"><span>Envío automático</span>
        <select name="automatico" defaultValue={automatico ? "on" : "off"}>
          <option value="on">Encendido</option>
          <option value="off">Pausado</option>
        </select>
      </label>
      <button className="boton boton--primario" disabled={pendiente}>Guardar</button>
      {msj && <p className={msj.ok ? "suave" : "error"} role="status">{msj.texto}</p>}
    </form>
  );
}

// «Pausar» / «Reanudar» de /correos: guarda el interruptor con el tope que ya hay.
export function InterruptorAutomatico({ tope, activo }: { tope: number; activo: boolean }) {
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState("");
  const avisar = useFlotante();
  const cambiar = () => {
    setError("");
    const fd = new FormData();
    fd.set("tope", String(tope));
    fd.set("automatico", activo ? "off" : "on");
    empezar(async () => {
      const r = await guardarCorreos(fd);
      if (!r.ok) return setError(r.mensaje);
      avisar({ texto: activo ? "Envío automático en pausa" : "Envío automático reanudado" });
    });
  };
  return (
    <>
      <button type="button" className={"boton" + (activo ? "" : " boton--primario")} disabled={pendiente} onClick={cambiar}>
        {pendiente ? "Guardando…" : activo ? "Pausar" : "Reanudar"}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}
