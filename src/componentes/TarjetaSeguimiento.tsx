"use client";
import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import type { ProspectoTarjeta } from "@/lib/prospectos-contrato";
import { AJUSTE_DESCARTE_ENVIADO, AJUSTE_RESPONDIO, invertir, type AjusteHoy } from "@/lib/hoy-contrato";
import { escribirDeNuevo, marcarRespondio, descartar } from "@/acciones/prospectos";
import { fechaVisible } from "@/lib/fecha-caracas";
import { BotonesCanal } from "./BotonesCanal";
import { MasAcciones } from "./MasAcciones";
import { PreguntaEnvio, useEnvioPendiente } from "./PreguntaEnvio";
import { useFlotante } from "./LineaFlotante";
import { useAjusteHoy } from "./ResumenHoy";

// Mismo patron que TarjetaCola (pasada de UX, fase B): la tarjeta se va al tocar y vuelve con su error si el
// servidor dice que no. Ninguna de estas acciones lleva «Deshacer»: el embudo no retrocede.
export function TarjetaSeguimiento({ p, hoy }: { p: ProspectoTarjeta; hoy: string }) {
  const avisar = useFlotante();
  const ajustar = useAjusteHoy();
  const envio = useEnvioPendiente(p.id);
  const [modo, setModo] = useState<"normal" | "escribir" | "descartar">("normal");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [hecha, setHecha] = useState(false);
  const [oculta, ocultar] = useOptimistic(false);
  const [pendiente, empezar] = useTransition();
  if (oculta || hecha) return null;
  const atrasado = (p.proximoSeguimiento ?? hoy) < hoy;

  // `ajustar` va ANTES de la transicion: adentro no se pintaria hasta que el servidor responda.
  function correr(fn: () => Promise<{ ok: boolean; mensaje?: string }>, texto: string, ajuste: AjusteHoy = {}) {
    setError("");
    ajustar(ajuste);
    empezar(async () => {
      ocultar(true);
      const r = await fn();
      if (r.ok) { envio.cerrar(); setHecha(true); avisar({ texto }); }
      else { ajustar(invertir(ajuste)); setError(r.mensaje ?? "No se pudo guardar. Intenta de nuevo."); }
    });
  }

  const canal = envio.canal;
  return (
    <article className={`tarjeta tarjeta--franja tarjeta--${atrasado ? "rojo" : "ambar"}`}>
      <Link href={`/prospectos/${p.id}`}><b>{p.nombre}</b></Link>
      {/* La franja dice la urgencia; el texto tambien: nunca solo el color. */}
      <div className="suave">{p.ciudad}. {atrasado ? `Atrasado desde el ${fechaVisible(p.proximoSeguimiento ?? hoy)}` : "Toca hoy"}</div>
      <div className={p.abrio ? "" : "suave"}>{p.abrio ? "Abrió la propuesta" : "No ha abierto la propuesta"}</div>
      {canal ? (
        <PreguntaEnvio volvio={envio.volvio} pendiente={pendiente}
          onSi={() => correr(() => escribirDeNuevo(p.id, canal), `Seguimiento enviado a ${p.nombre}`)}
          onNo={() => { envio.cerrar(); setModo("normal"); }} />
      ) : (
        <>
          {modo === "normal" && (
            <MasAcciones principal={<>
              <button className="boton boton--primario" disabled={pendiente} onClick={() => correr(() => marcarRespondio(p.id), `${p.nombre} respondió`, AJUSTE_RESPONDIO)}>Respondió</button>
              <button className="boton" onClick={() => setModo("escribir")}>Escribir de nuevo</button>
            </>}>
              <button className="boton boton--peligro" onClick={() => setModo("descartar")}>Descartar</button>
            </MasAcciones>
          )}
          {modo === "escribir" && <BotonesCanal contacto={p} mensaje={p.mensaje} onAbierto={envio.abrir} />}
          {modo === "descartar" && (
            <div className="pregunta">
              <label className="campo"><span>Motivo</span><input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus /></label>
              <div className="fila-botones">
                <button className="boton boton--peligro" disabled={pendiente} onClick={() => correr(() => descartar(p.id, motivo), `Descartaste a ${p.nombre}`, AJUSTE_DESCARTE_ENVIADO)}>Descartar</button>
                <button className="boton" onClick={() => setModo("normal")}>Cancelar</button>
              </div>
            </div>
          )}
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </article>
  );
}
