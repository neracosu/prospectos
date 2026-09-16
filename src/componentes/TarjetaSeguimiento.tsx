"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import type { Canal } from "@/lib/canales-contrato";
import type { ProspectoTarjeta } from "@/lib/prospectos-contrato";
import { escribirDeNuevo, marcarRespondio, descartar } from "@/acciones/prospectos";
import { BotonesCanal } from "./BotonesCanal";

export function TarjetaSeguimiento({ p }: { p: ProspectoTarjeta }) {
  const [modo, setModo] = useState<"normal" | "escribir" | "pregunta" | "descartar">("normal");
  const [canal, setCanal] = useState<Canal | null>(null);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [oculta, setOculta] = useState(false);
  const [pendiente, empezar] = useTransition();
  if (oculta) return null;
  const correr = (fn: () => Promise<{ ok: boolean; mensaje?: string }>) => empezar(async () => { const r = await fn(); if (r.ok) setOculta(true); else setError(r.mensaje ?? "Error"); });

  return (
    <article className="tarjeta">
      <Link href={`/prospectos/${p.id}`}><b>{p.nombre}</b></Link>
      <div className="suave">{p.ciudad} · seguimiento {p.proximoSeguimiento} · {p.abrio ? "abrió la propuesta" : "no ha abierto la propuesta"}</div>
      {modo === "normal" && (
        <div className="fila-botones">
          <button className="boton boton--primario" disabled={pendiente} onClick={() => correr(() => marcarRespondio(p.id))}>Respondió</button>
          <button className="boton" onClick={() => setModo("escribir")}>Escribir de nuevo</button>
          <button className="boton boton--peligro" onClick={() => setModo("descartar")}>Descartar</button>
        </div>
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
