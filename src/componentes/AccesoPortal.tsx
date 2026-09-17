"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EstadoAcceso } from "@/lib/acceso-cliente";
import { enviarAcceso, regenerarPinCliente, desactivarAccesoCliente, type AccesoEnviado } from "@/acciones/acceso-cliente";
import { BotonCopiar } from "@/componentes/BotonCopiar";

type Accion = "enviar" | "regenerar" | "desactivar";
const TEXTO_ESTADO: Record<EstadoAcceso["estado"], string> = { sin_acceso: "Todavía no tiene acceso.", activo: "Acceso activo.", desactivado: "Acceso desactivado." };

// Acceso del cliente a su portal (/c/<codigo>). El enlace y el PIN van en dos mensajes separados a
// proposito: si el cliente reenvia el chat, no va todo junto. El PIN se ve UNA vez: esta hasheado.
export function AccesoPortal({ clienteId, enlace, acceso, tieneWhatsapp }: { clienteId: number; enlace: string; acceso: EstadoAcceso; tieneWhatsapp: boolean }) {
  const [enCurso, setEnCurso] = useState<Accion | null>(null);
  const [enviado, setEnviado] = useState<AccesoEnviado | null>(null);
  const [confirmando, setConfirmando] = useState<"regenerar" | "desactivar" | null>(null);
  const [error, setError] = useState("");
  const [, empezar] = useTransition();
  const router = useRouter();

  const correr = (accion: Accion, tarea: () => Promise<{ ok: true; datos: AccesoEnviado | undefined } | { ok: false; mensaje: string }>) => {
    if (enCurso) return;
    setEnCurso(accion); setError("");
    empezar(async () => {
      try {
        const r = await tarea();
        if (r.ok) { setEnviado(r.datos ?? null); setConfirmando(null); router.refresh(); } else setError(r.mensaje);
      } finally { setEnCurso(null); }
    });
  };

  return (
    <section className="tarjeta">
      <b>Portal del cliente</b>
      <p className="suave" style={{ margin: "4px 0 0" }}>
        {TEXTO_ESTADO[acceso.estado]}
        {acceso.ultimoIngreso ? ` Entró ${acceso.ingresos} ${acceso.ingresos === 1 ? "vez" : "veces"}; la última, el ${acceso.ultimoIngreso.toLocaleString("es-VE", { timeZone: "America/Caracas", dateStyle: "short", timeStyle: "short" })}.` : acceso.estado === "activo" ? " Todavía no ha entrado." : ""}
      </p>
      <p className="recorte suave" title={enlace} style={{ margin: "8px 0 0" }}>{enlace}</p>
      <div className="fila-botones">
        <BotonCopiar texto={enlace} etiqueta="Copiar enlace" />
        {acceso.estado !== "desactivado" && <button type="button" className="boton boton--primario" aria-disabled={enCurso !== null} onClick={() => correr("enviar", () => enviarAcceso(clienteId))}>{enCurso === "enviar" ? "Preparando…" : acceso.estado === "activo" ? "Reenviar enlace" : "Enviar acceso"}</button>}
        {acceso.estado !== "sin_acceso" && <button type="button" className="boton" aria-disabled={enCurso !== null} onClick={() => { if (!enCurso) setConfirmando("regenerar"); }}>{acceso.estado === "desactivado" ? "Reactivar con PIN nuevo" : "Regenerar PIN"}</button>}
        {acceso.estado === "activo" && <button type="button" className="boton boton--peligro" aria-disabled={enCurso !== null} onClick={() => { if (!enCurso) setConfirmando("desactivar"); }}>Desactivar acceso</button>}
      </div>

      {confirmando === "regenerar" && (
        <div className="pregunta">
          <p style={{ margin: "0 0 8px" }}>Se genera un PIN nuevo. El anterior deja de servir y las sesiones que el cliente tenga abiertas se cierran.</p>
          <div className="fila-botones"><button type="button" className="boton boton--primario" aria-disabled={enCurso !== null} onClick={() => correr("regenerar", () => regenerarPinCliente(clienteId))}>{enCurso === "regenerar" ? "Generando…" : "Generar PIN nuevo"}</button><button type="button" className="boton" onClick={() => setConfirmando(null)}>Dejar el actual</button></div>
        </div>
      )}
      {confirmando === "desactivar" && (
        <div className="pregunta">
          <p style={{ margin: "0 0 8px" }}>El cliente deja de poder entrar y se cierran sus sesiones. No se borra nada: se reactiva con un PIN nuevo.</p>
          <div className="fila-botones"><button type="button" className="boton boton--peligro" aria-disabled={enCurso !== null} onClick={() => correr("desactivar", () => desactivarAccesoCliente(clienteId))}>{enCurso === "desactivar" ? "Desactivando…" : "Desactivar acceso"}</button><button type="button" className="boton" onClick={() => setConfirmando(null)}>Dejarlo activo</button></div>
        </div>
      )}

      {enviado && (
        <div className="pregunta">
          {enviado.pin
            ? <p style={{ margin: "0 0 8px" }}>PIN del cliente: <b style={{ fontSize: 20, letterSpacing: ".12em" }}>{enviado.pin}</b><br /><span className="suave">Solo se muestra esta vez. Envíalo aparte del enlace.</span></p>
            : <p style={{ margin: "0 0 8px" }}>El cliente ya tiene su PIN: aquí va solo el enlace. Si lo perdió, usa «Regenerar PIN».</p>}
          {tieneWhatsapp ? (
            <div className="fila-botones">
              {enviado.hrefEnlace && <a className="boton boton--primario" href={enviado.hrefEnlace} target="_blank" rel="noopener">1. Enviar el enlace</a>}
              {enviado.hrefPin && <a className="boton" href={enviado.hrefPin} target="_blank" rel="noopener">2. Enviar el PIN</a>}
            </div>
          ) : (
            <>
              <p className="suave" style={{ margin: "0 0 8px" }}>El cliente no tiene WhatsApp cargado: copia los mensajes y envíalos por donde le escribas.</p>
              <div className="fila-botones">
                <BotonCopiar texto={enviado.mensajeEnlace} etiqueta="Copiar mensaje del enlace" />
                {enviado.mensajePin && <BotonCopiar texto={enviado.mensajePin} etiqueta="Copiar mensaje del PIN" />}
              </div>
            </>
          )}
        </div>
      )}
      <p role="status" className="estado-fila estado-fila--error">{error}</p>
    </section>
  );
}
