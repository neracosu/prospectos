"use client";
import { useState, type ReactNode } from "react";
import { canalesDisponibles, type Canal, type ContactoProspecto } from "@/lib/canales-contrato";
import { BotonCopiar } from "./BotonCopiar";
import { MasAcciones } from "./MasAcciones";

// Dibuja un boton por canal disponible. Al tocar uno, abre la app externa y
// avisa al padre que canal se uso para que pregunte "¿Se envio?" al volver.
// El primer canal disponible es la accion principal (la unica en verde); los demas canales y copiar quedan
// detras de «···». `alLado` es lo que el padre necesita a un toque junto a la principal (Saltar, en la cola).
export function BotonesCanal({ contacto, mensaje, onAbierto, alLado }: { contacto: ContactoProspecto; mensaje: string; onAbierto: (canal: Canal) => void; alLado?: ReactNode }) {
  const [copiando, setCopiando] = useState<Canal | null>(null);
  const acciones = canalesDisponibles(contacto, mensaje);
  if (!acciones.length) return <><p className="suave">Sin contacto publicado.</p><div className="fila-botones"><BotonCopiar texto={mensaje} />{alLado}</div></>;
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
    <MasAcciones principal={<>{enlace(acciones[0], true)}{alLado}</>} etiqueta="Otros canales y copiar el mensaje">
      {acciones.slice(1).map((a) => enlace(a, false))}
      <BotonCopiar texto={mensaje} />
    </MasAcciones>
  );
}
