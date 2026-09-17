"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Canal } from "@/lib/canales-contrato";
import type { ProspectoTarjeta } from "@/lib/prospectos-contrato";
import { escribirDeNuevo, marcarRespondio, descartar } from "@/acciones/prospectos";
import { fechaVisible } from "@/lib/fecha-caracas";
import { BotonesCanal } from "./BotonesCanal";
import { MasAcciones } from "./MasAcciones";

export function TarjetaSeguimiento({ p, hoy }: { p: ProspectoTarjeta; hoy: string }) {
  const router = useRouter();
  const [modo, setModo] = useState<"normal" | "escribir" | "pregunta" | "descartar">("normal");
  const [canal, setCanal] = useState<Canal | null>(null);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [oculta, setOculta] = useState(false);
  const [pendiente, empezar] = useTransition();
  if (oculta) return null;
  const atrasado = (p.proximoSeguimiento ?? hoy) < hoy;
  const correr = (fn: () => Promise<{ ok: boolean; mensaje?: string }>) => empezar(async () => { const r = await fn(); if (r.ok) { setOculta(true); router.refresh(); } else setError(r.mensaje ?? "Error"); });

  return (
    <article className={`tarjeta tarjeta--franja tarjeta--${atrasado ? "rojo" : "ambar"}`}>
      <Link href={`/prospectos/${p.id}`}><b>{p.nombre}</b></Link>
      {/* La franja dice la urgencia; el texto tambien: nunca solo el color. */}
      <div className="suave">{p.ciudad}. {atrasado ? `Atrasado desde el ${fechaVisible(p.proximoSeguimiento ?? hoy)}` : "Toca hoy"}</div>
      <div className={p.abrio ? "" : "suave"}>{p.abrio ? "Abrió la propuesta" : "No ha abierto la propuesta"}</div>
      {modo === "normal" && (
        <MasAcciones principal={<>
          <button className="boton boton--primario" disabled={pendiente} onClick={() => correr(() => marcarRespondio(p.id))}>Respondió</button>
          <button className="boton" onClick={() => setModo("escribir")}>Escribir de nuevo</button>
        </>}>
          <button className="boton boton--peligro" onClick={() => setModo("descartar")}>Descartar</button>
        </MasAcciones>
      )}
      {modo === "escribir" && <BotonesCanal contacto={p} mensaje={p.mensaje} onAbierto={(c) => { setCanal(c); setModo("pregunta"); }} />}
      {modo === "pregunta" && canal && (
        <div className="pregunta"><b>¿Se envió?</b>
          <div className="fila-botones">
            <button className="boton boton--primario" disabled={pendiente} onClick={() => correr(() => escribirDeNuevo(p.id, canal))}>Sí</button>
            <button className="boton" onClick={() => setModo("normal")}>No</button>
          </div>
        </div>
      )}
      {modo === "descartar" && (
        <div className="pregunta">
          <label className="campo"><span>Motivo</span><input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus /></label>
          <div className="fila-botones">
            <button className="boton boton--peligro" disabled={pendiente} onClick={() => correr(() => descartar(p.id, motivo))}>Descartar</button>
            <button className="boton" onClick={() => setModo("normal")}>Cancelar</button>
          </div>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </article>
  );
}
