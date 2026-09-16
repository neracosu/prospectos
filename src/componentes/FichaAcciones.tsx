"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Canal, ContactoProspecto } from "@/lib/canales-contrato";
import { ETAPAS, ETIQUETA_ETAPA, puedePasar, type Etapa } from "@/lib/embudo-contrato";
import { cambiarEtapa, guardarNota, editarSeguimiento, marcarEnviado, escribirDeNuevo } from "@/acciones/prospectos";
import { BotonesCanal } from "./BotonesCanal";

export function FichaAcciones(props: { id: number; etapa: Etapa; nota: string; proximoSeguimiento: string | null; contacto: ContactoProspecto; mensaje: string }) {
  const [nota, setNota] = useState(props.nota);
  const [fecha, setFecha] = useState(props.proximoSeguimiento ?? "");
  const [motivo, setMotivo] = useState("");
  const [canal, setCanal] = useState<Canal | null>(null);
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
  const correr = (fn: () => Promise<{ ok: boolean; mensaje?: string }>) => empezar(async () => { const r = await fn(); if (r.ok) { setError(""); setCanal(null); router.refresh(); } else setError(r.mensaje ?? "Error"); });
  const destinos = ETAPAS.filter((e) => e !== "enviado" && puedePasar(props.etapa, e));
  const puedeEnviar = props.etapa === "por_contactar" || props.etapa === "enviado";

  return (
    <>
      {puedeEnviar && (
        <section className="tarjeta">
          <b>{props.etapa === "por_contactar" ? "Enviar propuesta" : "Escribir de nuevo"}</b>
          {canal ? (
            <div className="pregunta"><b>¿Se envió?</b>
              <div className="fila-botones">
                <button className="boton boton--primario" disabled={pendiente} onClick={() => correr(() => props.etapa === "por_contactar" ? marcarEnviado(props.id, canal) : escribirDeNuevo(props.id, canal))}>Sí</button>
                <button className="boton" onClick={() => setCanal(null)}>No</button>
              </div>
            </div>
          ) : <BotonesCanal contacto={props.contacto} mensaje={props.mensaje} onAbierto={setCanal} />}
        </section>
      )}
      <section className="tarjeta">
        <b>Etapa</b>
        <div className="fila-botones">
          {destinos.map((e) => <button key={e} className={"boton" + (e === "descartado" ? " boton--peligro" : "")} disabled={pendiente} onClick={() => correr(() => cambiarEtapa(props.id, e, motivo))}>{ETIQUETA_ETAPA[e]}</button>)}
        </div>
        {destinos.includes("descartado") && <label className="campo"><span>Motivo (para descartar)</span><input value={motivo} onChange={(e) => setMotivo(e.target.value)} /></label>}
        <label className="campo"><span>Próximo seguimiento</span><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} onBlur={() => correr(() => editarSeguimiento(props.id, fecha))} /></label>
      </section>
      <section className="tarjeta">
        <label className="campo"><span>Nota interna (nunca sale del panel)</span><textarea rows={3} value={nota} onChange={(e) => setNota(e.target.value)} /></label>
        <button className="boton" disabled={pendiente || nota === props.nota} onClick={() => correr(() => guardarNota(props.id, nota))}>Guardar nota</button>
      </section>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}
