"use client";
import { useState, type ReactNode } from "react";
import { canalesDisponibles, type Canal, type ContactoProspecto } from "@/lib/canales-contrato";
import { BotonCopiar } from "./BotonCopiar";
import { MasAcciones } from "./MasAcciones";

// Dibuja un boton por canal disponible. Al tocar uno, abre la app externa y
// avisa al padre que canal se uso para que pregunte "¿Se envio?" al volver.
// El primer canal disponible es la accion principal; los demas, copiar y `extra` (lo que el padre quiera
// sumar, como Saltar) quedan detras de «···»: una tarjeta ensena una sola accion en verde.
export function BotonesCanal({ contacto, mensaje, onAbierto, extra }: { contacto: ContactoProspecto; mensaje: string; onAbierto: (canal: Canal) => void; extra?: ReactNode }) {
  const [copiando, setCopiando] = useState<Canal | null>(null);
  const acciones = canalesDisponibles(contacto, mensaje);
  if (!acciones.length) return <><p className="suave">Sin contacto publicado.</p><div className="fila-botones"><BotonCopiar texto={mensaje} />{extra}</div></>;
  const enlace = (a: (typeof acciones)[number], principal: boolean) => (
    <a key={a.canal} href={a.href} target={a.canal === "whatsapp" || a.modo === "copiar_y_abrir" ? "_blank" : undefined} rel="noopener"
      className={"boton" + (principal ? " boton--primario" : "")}
      onClick={async () => {
        if (a.modo === "copiar_y_abrir") { setCopiando(a.canal); try { await navigator.clipboard.writeText(mensaje); } catch {} }
        onAbierto(a.canal);
      }}>
      {copiando === a.canal ? "Mensaje copiado…" : a.etiqueta}
    </a>
  );
  return (
    <MasAcciones principal={enlace(acciones[0], true)} etiqueta="Otros canales y más acciones">
      {acciones.slice(1).map((a) => enlace(a, false))}
      <BotonCopiar texto={mensaje} />
      {extra}
    </MasAcciones>
  );
}
