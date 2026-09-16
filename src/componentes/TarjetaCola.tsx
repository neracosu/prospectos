"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import type { Canal } from "@/lib/canales-contrato";
import type { ProspectoTarjeta } from "@/lib/prospectos-contrato";
import { marcarEnviado, saltar } from "@/acciones/prospectos";
import { BotonesCanal } from "./BotonesCanal";

export function TarjetaCola({ p }: { p: ProspectoTarjeta }) {
  const [canal, setCanal] = useState<Canal | null>(null);
  const [error, setError] = useState("");
  const [oculta, setOculta] = useState(false);
  const [pendiente, empezar] = useTransition();
  if (oculta) return null;

  function confirmar(si: boolean) {
    if (!si || !canal) return setCanal(null);
    empezar(async () => {
      const r = await marcarEnviado(p.id, canal);
      if (r.ok) setOculta(true); else setError(r.mensaje);
    });
  }

  return (
    <article className="tarjeta">
      <Link href={`/prospectos/${p.id}`}><b>{p.nombre}</b></Link>
      <div className="suave">{p.ciudad} · {p.nichoNombre}{p.tamano ? ` · ${p.tamano}` : ""}</div>
      {p.nota && <p className="suave" style={{ whiteSpace: "pre-line" }}>{p.nota}</p>}
      {canal ? (
        <div className="pregunta" role="group" aria-label="¿Se envió?">
          <b>¿Se envió?</b>
          <div className="fila-botones">
            <button className="boton boton--primario" disabled={pendiente} onClick={() => confirmar(true)}>Sí</button>
            <button className="boton" disabled={pendiente} onClick={() => confirmar(false)}>No</button>
          </div>
        </div>
      ) : (
        <>
          <BotonesCanal contacto={p} mensaje={p.mensaje} onAbierto={setCanal} />
          <div className="fila-botones">
            <button className="boton" disabled={pendiente} onClick={() => empezar(async () => { const r = await saltar(p.id); if (r.ok) setOculta(true); else setError(r.mensaje); })}>Saltar</button>
          </div>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </article>
  );
}
