"use client";
import { useState } from "react";
import { canalesDisponibles, type Canal, type ContactoProspecto } from "@/lib/canales-contrato";
import { BotonCopiar } from "./BotonCopiar";

// Dibuja un boton por canal disponible. Al tocar uno, abre la app externa y
// avisa al padre que canal se uso para que pregunte "¿Se envio?" al volver.
export function BotonesCanal({ contacto, mensaje, onAbierto }: { contacto: ContactoProspecto; mensaje: string; onAbierto: (canal: Canal) => void }) {
  const [copiando, setCopiando] = useState<Canal | null>(null);
  const acciones = canalesDisponibles(contacto, mensaje);
  if (!acciones.length) return <p className="suave">Sin contacto publicado. <BotonCopiar texto={mensaje} /></p>;
  return (
    <div className="fila-botones">
      {acciones.map((a, i) => (
        <a key={a.canal} href={a.href} target={a.canal === "whatsapp" || a.modo === "copiar_y_abrir" ? "_blank" : undefined} rel="noopener"
          className={"boton" + (i === 0 ? " boton--primario" : "")}
          onClick={async () => {
            if (a.modo === "copiar_y_abrir") { setCopiando(a.canal); try { await navigator.clipboard.writeText(mensaje); } catch {} }
            onAbierto(a.canal);
          }}>
          {copiando === a.canal ? "Mensaje copiado…" : a.etiqueta}
        </a>
      ))}
      <BotonCopiar texto={mensaje} />
    </div>
  );
}
