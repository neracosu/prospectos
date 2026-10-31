"use client";
import { useState, useTransition } from "react";
import { enviarPropuestaPedida } from "@/acciones/correos";

// «Le pidieron la propuesta por correo»: un campo con el correo (prellenado si ya lo hay) y un boton. Sale ahora mismo
// con el PDF, aunque ya se le haya escrito por WhatsApp; si el correo es nuevo, se guarda en la ficha con su fuente.
export function EnviarPorCorreo({ id, email }: { id: number; email: string }) {
  const [correo, setCorreo] = useState(email);
  const [msj, setMsj] = useState("");
  const [pendiente, empezar] = useTransition();
  return (
    <section className="tarjeta">
      <b>¿Le pidieron la propuesta por correo?</b>
      <form onSubmit={(e) => { e.preventDefault(); empezar(async () => { const r = await enviarPropuestaPedida(id, correo); setMsj(r.ok ? "Enviada. Queda en el historial y en Correos." : r.mensaje); }); }}>
        <label className="campo"><span>Correo del negocio</span><input name="correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} required maxLength={120} placeholder="info@negocio.com" autoComplete="off" /></label>
        <div className="fila-botones"><button className="boton boton--primario" type="submit" disabled={pendiente || !correo.trim()}>{pendiente ? "Enviando…" : "Enviar la propuesta por correo"}</button></div>
        <p className="suave">Sale ahora mismo con el PDF adjunto, aunque ya se le haya escrito por WhatsApp. Si el correo es nuevo, se guarda en la ficha.</p>
      </form>
      {msj && <p className="suave" role="status">{msj}</p>}
    </section>
  );
}
