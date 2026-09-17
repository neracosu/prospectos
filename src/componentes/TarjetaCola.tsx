"use client";
import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import type { ProspectoTarjeta } from "@/lib/prospectos-contrato";
import { AJUSTE_ENVIO, invertir } from "@/lib/hoy-contrato";
import { marcarEnviado, saltar, deshacerSalto } from "@/acciones/prospectos";
import { BotonesCanal } from "./BotonesCanal";
import { PreguntaEnvio, useEnvioPendiente } from "./PreguntaEnvio";
import { useFlotante } from "./LineaFlotante";
import { useAjusteHoy } from "./ResumenHoy";

// Pasada de UX, fase B: la tarjeta se va al tocar, no cuando responde el servidor. Dos reglas de React que
// sostienen esto: `ocultar` (useOptimistic) solo vale DENTRO de la transicion, y un setState normal dentro de
// una transicion asincrona no se pinta hasta que termina; por eso `ajustar` se llama ANTES de `empezar`.
// No hay router.refresh(): la accion ya revalida /hoy y su respuesta trae la lista nueva.
export function TarjetaCola({ p }: { p: ProspectoTarjeta }) {
  const avisar = useFlotante();
  const ajustar = useAjusteHoy();
  const envio = useEnvioPendiente(p.id);
  const [error, setError] = useState("");
  // Enviado de verdad: no vuelve a la cola. Un salto NO la marca: con la cola corta sigue en la lista, al final.
  const [hecha, setHecha] = useState(false);
  const [oculta, ocultar] = useOptimistic(false);
  const [pendiente, empezar] = useTransition();
  if (oculta || hecha) return null;

  function confirmar(si: boolean) {
    const canal = envio.canal;
    if (!si || !canal) return envio.cerrar();
    setError("");
    ajustar(AJUSTE_ENVIO);
    empezar(async () => {
      ocultar(true);
      const r = await marcarEnviado(p.id, canal);
      if (r.ok) { envio.cerrar(); setHecha(true); avisar({ texto: `Enviado a ${p.nombre}` }); }
      else { ajustar(invertir(AJUSTE_ENVIO)); setError(r.mensaje); }
    });
  }

  function saltarlo() {
    setError("");
    empezar(async () => {
      ocultar(true);
      const r = await saltar(p.id);
      if (!r.ok) return setError(r.mensaje);
      const orden = r.datos.ordenAnterior;
      avisar({ texto: `Saltaste a ${p.nombre}`, deshacer: () => deshacerSalto(p.id, orden), textoDeshecho: "Volvió a su lugar en la cola" });
    });
  }

  return (
    <article className="tarjeta">
      <Link href={`/prospectos/${p.id}`}><b>{p.nombre}</b></Link>
      <div className="suave">{p.ciudad}, {p.nichoNombre}{p.tamano ? `, ${p.tamano}` : ""}</div>
      {p.nota && <p className="suave" style={{ whiteSpace: "pre-line" }}>{p.nota}</p>}
      {envio.canal ? (
        <PreguntaEnvio volvio={envio.volvio} pendiente={pendiente} onSi={() => confirmar(true)} onNo={() => confirmar(false)} />
      ) : (
        <BotonesCanal contacto={p} mensaje={p.mensaje} onAbierto={envio.abrir}
          alLado={<button className="boton" disabled={pendiente} onClick={saltarlo}>Saltar</button>} />
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </article>
  );
}
