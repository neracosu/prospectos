"use client";
import { useState, useTransition } from "react";
import { guardarMensajesCobro, guardarDatosEmisor, guardarTarifa, guardarMensajesAviso } from "@/acciones/ajustes";
import type { DatosEmisor } from "@/lib/configuracion";
import { Campo } from "@/componentes/Campo";

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
      <p className="suave">Variables: {"{cliente} {proyecto} {monto} {concepto} {vence} {enlace}"}. {"{enlace}"} es el portal del cliente: ponlo en su propio renglón, porque si ese cliente no tiene acceso activo ese renglón no se envía.</p>
      <label className="campo"><span>Recordatorio (antes de vencer)</span><textarea name="recordatorio" rows={4} defaultValue={recordatorio} /></label>
      <label className="campo"><span>Vencido</span><textarea name="vencido" rows={4} defaultValue={vencido} /></label>
      <button className="boton boton--primario" disabled={pendiente}>Guardar</button>
      {msj && <p className={msj.ok ? "suave" : "error"} role="status">{msj.texto}</p>}
    </form>
  );
}

export function FormularioMensajesAviso({ hito, version, cobro }: { hito: string; version: string; cobro: string }) {
  const { msj, pendiente, enviar } = useEnvio();
  return (
    <form className="tarjeta" action={(fd) => enviar(() => guardarMensajesAviso(fd))}>
      <b>Avisos al cliente</b>
      <p className="suave">Lo que se abre en WhatsApp con «Avisar al cliente». Variables de todos: {"{cliente} {proyecto} {enlace}"}. {"{enlace}"} va en su propio renglón: si el cliente no tiene acceso al portal, ese renglón no se envía.</p>
      <label className="campo"><span>Hito cumplido (lleva {"{hito}"})</span><textarea name="hito" rows={4} defaultValue={hito} /></label>
      <label className="campo"><span>Versión publicada (lleva {"{version}"}; {"{cambios}"} es la lista de cambios)</span><textarea name="version" rows={5} defaultValue={version} /></label>
      <label className="campo"><span>Cobro registrado (lleva {"{monto}"}; también {"{concepto}"} y {"{vence}"})</span><textarea name="cobro" rows={4} defaultValue={cobro} /></label>
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
      {/* Son los datos del propio dueno: aqui si aplica el autocompletado del telefono. */}
      <Campo nombre="nombre" etiqueta="Nombre" regla={{ tipo: "texto", min: 2, max: 80 }} requerido defaultValue={emisor.nombre} autoComplete="organization" />
      <Campo nombre="rif" etiqueta="RIF" regla={{ tipo: "texto", max: 20 }} defaultValue={emisor.rif} autoComplete="off" />
      <Campo nombre="whatsapp" etiqueta="WhatsApp" regla={{ tipo: "texto", max: 40 }} type="tel" inputMode="tel" defaultValue={emisor.whatsapp} autoComplete="tel" />
      <Campo nombre="email" etiqueta="Correo" regla={{ tipo: "texto", max: 120 }} inputMode="email" defaultValue={emisor.email} autoComplete="email" />
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
