"use client";
import { useState, useTransition } from "react";
import { cambiarMiPin } from "@/acciones/ajustes";

export function FormularioPin() {
  const [msj, setMsj] = useState("");
  const [pendiente, empezar] = useTransition();
  return (
    <form
      className="tarjeta"
      action={(fd) =>
        empezar(async () => {
          const r = await cambiarMiPin(fd);
          setMsj(r.ok ? "PIN cambiado." : r.mensaje);
        })
      }
    >
      <label className="campo">
        <span>PIN actual</span>
        <input name="actual" inputMode="numeric" required />
      </label>
      <label className="campo">
        <span>PIN nuevo (6 números)</span>
        <input name="nuevo" inputMode="numeric" pattern="\d{6}" required />
      </label>
      <button className="boton boton--primario" disabled={pendiente}>Cambiar</button>
      {msj && <p className="suave" role="status">{msj}</p>}
    </form>
  );
}
