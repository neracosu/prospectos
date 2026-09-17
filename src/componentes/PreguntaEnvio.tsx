"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Canal } from "@/lib/canales-contrato";
import { CLAVE_ENVIO_PENDIENTE, leerEnvio, serializarEnvio, type AccionEnvio } from "@/lib/envio-pendiente-contrato";

// «Toque el canal y me fui a WhatsApp» (pasada de UX, fase B). La pregunta sale al tocar el canal, como siempre
// (un tel: cancelado o un «copiar» nunca esconden la pestana, y ahi tambien hay que preguntar); `volvio` pasa a
// true cuando la pestana regresa a primer plano, y ahi la pregunta se resalta. Si el navegador recargo la
// pestana mientras tanto, sessionStorage recuerda que quedo pendiente y la tarjeta vuelve a preguntar.
// `accion` es lo que ejecutaria el «Si» de quien llama: un recuerdo de OTRA accion no es suyo y no lo toma.
export function useEnvioPendiente(prospectoId: number, accion: AccionEnvio) {
  const [canal, setCanal] = useState<Canal | null>(null);
  const [volvio, setVolvio] = useState(false);

  // En un efecto y no en el estado inicial: el servidor no tiene sessionStorage y la hidratacion tiene que coincidir.
  useEffect(() => {
    try {
      const e = leerEnvio(sessionStorage.getItem(CLAVE_ENVIO_PENDIENTE), Date.now());
      if (e?.prospectoId === prospectoId && e.accion === accion) { setCanal(e.canal); setVolvio(true); }
    } catch { /* sin sessionStorage (modo privado, bloqueado) solo se pierde el recuerdo tras una recarga */ }
  }, [prospectoId, accion]);

  useEffect(() => {
    if (!canal) return;
    const alVolver = () => { if (document.visibilityState === "visible") setVolvio(true); };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, [canal]);

  const abrir = useCallback((c: Canal) => {
    setCanal(c); setVolvio(false);
    try { sessionStorage.setItem(CLAVE_ENVIO_PENDIENTE, serializarEnvio({ prospectoId, canal: c, accion, en: Date.now() })); } catch {}
  }, [prospectoId, accion]);

  const cerrar = useCallback(() => {
    setCanal(null); setVolvio(false);
    try {
      // Solo se borra lo propio: otra tarjeta pudo haber pisado la clave despues.
      const e = leerEnvio(sessionStorage.getItem(CLAVE_ENVIO_PENDIENTE), Date.now());
      if (!e || e.prospectoId === prospectoId) sessionStorage.removeItem(CLAVE_ENVIO_PENDIENTE);
    } catch {}
  }, [prospectoId]);

  return { canal, volvio, abrir, cerrar };
}

export function PreguntaEnvio({ volvio, pendiente, onSi, onNo }: { volvio: boolean; pendiente: boolean; onSi: () => void; onNo: () => void }) {
  const caja = useRef<HTMLDivElement>(null);
  const si = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!volvio) return;
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    caja.current?.scrollIntoView({ block: "center", behavior: quieto ? "auto" : "smooth" });
    si.current?.focus({ preventScroll: true });
  }, [volvio]);
  return (
    <div ref={caja} className={"pregunta" + (volvio ? " pregunta--resaltada" : "")} role="group" aria-label="¿Se envió?">
      <b>¿Se envió?</b>
      <div className="fila-botones">
        <button ref={si} className="boton boton--primario" disabled={pendiente} onClick={onSi}>Sí</button>
        <button className="boton" disabled={pendiente} onClick={onNo}>No</button>
      </div>
    </div>
  );
}
