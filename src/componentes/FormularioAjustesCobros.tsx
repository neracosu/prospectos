"use client";
import { useState, useTransition } from "react";
import { guardarMensajesCobro, guardarDatosEmisor, guardarTarifa } from "@/acciones/ajustes";
import type { DatosEmisor } from "@/lib/configuracion";

function useEnvio() {
  const [msj, setMsj] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, empezar] = useTransition();
  const enviar = (fn: () => Promise<{ ok: boolean; mensaje?: string }>) => empezar(async () => { const r = await fn(); setMsj(r.ok ? { ok: true, texto: "Guardado." } : { ok: false, texto: r.mensaje ?? "Error" }); });
  return { msj, pendiente, enviar };
}

export function FormularioMensajesCobro({ recordatorio, vencido }: { recordatorio: string; vencido: string }) {
  const { msj, pendiente, enviar } = useEnvio();
  return (
    <form className="tarjeta" action={(fd) => enviar(() => guardarMensajesCobro(fd))}>
      <b>Mensajes de cobro</b>
      <p className="suave">Variables: {"{cliente} {proyecto} {monto} {concepto} {vence} {enlace}"}. {"{enlace}"} queda vacío hasta que exista el portal del cliente.</p>
      <label className="campo"><span>Recordatorio (antes de vencer)</span><textarea name="recordatorio" rows={4} defaultValue={recordatorio} /></label>
      <label className="campo"><span>Vencido</span><textarea name="vencido" rows={4} defaultValue={vencido} /></label>
      <button className="boton boton--primario" disabled={pendiente}>Guardar</button>
      {msj && <p className={msj.ok ? "suave" : "error"} role="status">{msj.texto}</p>}
    </form>
  );
}

export function FormularioEmisor({ emisor }: { emisor: DatosEmisor }) {
  const { msj, pendiente, enviar } = useEnvio();
  return (
    <form className="tarjeta" action={(fd) => enviar(() => guardarDatosEmisor(fd))}>
      <b>Datos del emisor (para los recibos)</b>
      <label className="campo"><span>Nombre</span><input name="nombre" defaultValue={emisor.nombre} required /></label>
      <label className="campo"><span>RIF</span><input name="rif" defaultValue={emisor.rif} /></label>
      <label className="campo"><span>WhatsApp</span><input name="whatsapp" inputMode="tel" defaultValue={emisor.whatsapp} /></label>
      <label className="campo"><span>Correo</span><input name="email" type="email" defaultValue={emisor.email} /></label>
      <button className="boton boton--primario" disabled={pendiente}>Guardar</button>
      {msj && <p className={msj.ok ? "suave" : "error"} role="status">{msj.texto}</p>}
    </form>
  );
}

export function FormularioTarifa({ tarifa }: { tarifa: number }) {
  const { msj, pendiente, enviar } = useEnvio();
  return (
    <form className="tarjeta" action={(fd) => enviar(() => guardarTarifa(fd))}>
      <b>Tarifa por hora</b>
      <p className="suave">La misma que usa la calculadora de neracosu.com. Sirve para comparar horas cotizadas y reales.</p>
      <label className="campo"><span>Dólares por hora</span><input name="tarifa" type="number" step="0.5" min={1} max={500} defaultValue={tarifa} /></label>
      <button className="boton boton--primario" disabled={pendiente}>Guardar</button>
      {msj && <p className={msj.ok ? "suave" : "error"} role="status">{msj.texto}</p>}
    </form>
  );
}
