"use client";
import { useId, useState, type ReactNode } from "react";

// Una tarjeta ensena UNA accion principal; las secundarias viven detras de este boton (pasada de UX, fase A).
// Nada de gestos ocultos: es un boton visible que despliega otra fila de botones, y se anuncia con aria-expanded.
export function MasAcciones({ principal, children, etiqueta = "Más acciones" }: { principal: ReactNode; children: ReactNode; etiqueta?: string }) {
  const [abierto, setAbierto] = useState(false);
  const id = useId();
  return (
    <>
      <div className="fila-botones">
        {principal}
        <button type="button" className="boton boton--mas" aria-label={etiqueta} aria-expanded={abierto} aria-controls={id} onClick={() => setAbierto((a) => !a)}><span aria-hidden="true">···</span></button>
      </div>
      {abierto && <div className="fila-botones fila-botones--secundarias" id={id}>{children}</div>}
    </>
  );
}
