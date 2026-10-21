"use client";
import { useOptimistic, useTransition, useState } from "react";
import { marcarSolicitud } from "@/acciones/web";

// Marca o desmarca una solicitud de la web como atendida. Se ve al tocar (useOptimistic) y se revierte si falla.
export function BotonAtender({ id, atendida }: { id: number; atendida: boolean }) {
  const [vista, setVista] = useOptimistic(atendida);
  const [, empezar] = useTransition();
  const [error, setError] = useState("");
  return (
    <>
      <button type="button" className="boton mini" aria-pressed={vista} onClick={() => {
        setError("");
        empezar(async () => {
          setVista(!vista);
          const r = await marcarSolicitud(id, !vista);
          if (!r.ok) setError(r.mensaje);
        });
      }}>{vista ? "Atendida ✓" : "Marcar atendida"}</button>
      {error && <span className="error" role="alert">{error}</span>}
    </>
  );
}
