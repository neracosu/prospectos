"use client";
import { useState, useTransition } from "react";
import { guardarIpsPropiasAccion } from "@/acciones/rastro";
import { Campo } from "@/componentes/Campo";
import { useFlotante } from "@/componentes/LineaFlotante";

// Ajustes › Rastro de enlaces: IPs propias (casa, VPN) cuyas visitas no cuentan como del prospecto.
// Ajustes lo monta con key={ips}: al guardar se remonta con la lista que quedo (el servidor descarta lo que no es IP),
// por eso el exito va a la linea flotante y no a un estado propio.
export function FormularioAjustesRastro({ ips }: { ips: string[] }) {
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  const avisar = useFlotante();
  const guardar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    empezar(async () => {
      setError("");
      const r = await guardarIpsPropiasAccion(fd);
      if (r.ok) avisar({ texto: "IPs guardadas" });
      else setError(r.mensaje);
    });
  };
  return (
    <form className="tarjeta" onSubmit={guardar}>
      <b>IPs propias</b>
      <p className="suave">Las visitas desde estas IP no cuentan como del prospecto. Agregue aquí la de su casa y la de su VPN.</p>
      <Campo etiqueta="IPs propias (una por línea)" nombre="ips" control="textarea" rows={4} autoComplete="off"
        spellCheck={false} defaultValue={ips.join("\n")} />
      <button className="boton boton--primario" disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar"}</button>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}
