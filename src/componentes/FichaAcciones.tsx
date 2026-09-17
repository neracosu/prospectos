"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import type { ContactoProspecto } from "@/lib/canales-contrato";
import { ETAPAS, ETIQUETA_ETAPA, puedePasar, type Etapa } from "@/lib/embudo-contrato";
import { fechaVisible } from "@/lib/fecha-caracas";
import { cambiarEtapa, guardarNota, editarSeguimiento, marcarEnviado, escribirDeNuevo } from "@/acciones/prospectos";
import { BotonesCanal } from "./BotonesCanal";
import { PreguntaEnvio, useEnvioPendiente } from "./PreguntaEnvio";
import { useFlotante } from "./LineaFlotante";

// Pasada de UX, fase B: cada resultado se avisa en la linea flotante y no hay router.refresh(): las acciones ya
// revalidan esta ficha y su respuesta trae la pagina nueva (la etapa de arriba la pinta el servidor).
export function FichaAcciones(props: { id: number; etapa: Etapa; nota: string; proximoSeguimiento: string | null; contacto: ContactoProspecto; mensaje: string; rol: "dueno" | "prospectador" }) {
  const avisar = useFlotante();
  const envio = useEnvioPendiente(props.id, props.etapa === "por_contactar" ? "envio" : "seguimiento");
  const [nota, setNota] = useState(props.nota);
  const [fecha, setFecha] = useState(props.proximoSeguimiento ?? "");
  // Al marcar enviado el servidor fija el seguimiento: el campo tiene que seguirlo. Sin esto se quedaba con la
  // fecha vieja y, al salir del campo, la mandaba de vuelta y pisaba la del servidor.
  const [fechaDelServidor, setFechaDelServidor] = useState(props.proximoSeguimiento ?? "");
  if (fechaDelServidor !== (props.proximoSeguimiento ?? "")) { setFechaDelServidor(props.proximoSeguimiento ?? ""); setFecha(props.proximoSeguimiento ?? ""); }
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  const correr = (fn: () => Promise<{ ok: boolean; mensaje?: string }>, texto: string) => empezar(async () => {
    const r = await fn();
    if (r.ok) { setError(""); envio.cerrar(); avisar({ texto }); } else setError(r.mensaje ?? "No se pudo guardar. Intenta de nuevo.");
  });
  const destinos = ETAPAS.filter((e) => e !== "enviado" && puedePasar(props.etapa, e));
  const puedeEnviar = props.etapa === "por_contactar" || props.etapa === "enviado";
  const canal = envio.canal;

  return (
    <>
      {puedeEnviar && (
        <section className="tarjeta">
          <b>{props.etapa === "por_contactar" ? "Enviar propuesta" : "Escribir de nuevo"}</b>
          {canal ? (
            <PreguntaEnvio volvio={envio.volvio} pendiente={pendiente}
              onSi={() => props.etapa === "por_contactar" ? correr(() => marcarEnviado(props.id, canal), "Marcado como enviado") : correr(() => escribirDeNuevo(props.id, canal), "Seguimiento registrado")}
              onNo={envio.cerrar} />
          ) : <BotonesCanal contacto={props.contacto} mensaje={props.mensaje} onAbierto={envio.abrir} />}
        </section>
      )}
      <section className="tarjeta">
        <b>Etapa</b>
        <div className="fila-botones">
          {destinos.map((e) => <button key={e} className={"boton" + (e === "descartado" ? " boton--peligro" : "")} disabled={pendiente} onClick={() => correr(() => cambiarEtapa(props.id, e, motivo), `Pasó a «${ETIQUETA_ETAPA[e]}»`)}>{ETIQUETA_ETAPA[e]}</button>)}
        </div>
        {destinos.includes("descartado") && <label className="campo"><span>Motivo (para descartar)</span><input value={motivo} onChange={(e) => setMotivo(e.target.value)} /></label>}
        <label className="campo"><span>Próximo seguimiento</span><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} onBlur={() => { if (fecha !== (props.proximoSeguimiento ?? "")) correr(() => editarSeguimiento(props.id, fecha), fecha ? `Seguimiento movido al ${fechaVisible(fecha)}` : "Seguimiento quitado"); }} /></label>
        {props.etapa === "ganado" && props.rol === "dueno" && (
          <div className="fila-botones"><Link className="boton boton--primario" href={`/proyectos/nuevo?prospecto=${props.id}`}>Crear proyecto</Link></div>
        )}
      </section>
      <section className="tarjeta">
        <label className="campo"><span>Nota interna (nunca sale del panel)</span><textarea rows={3} value={nota} onChange={(e) => setNota(e.target.value)} /></label>
        <button className="boton" disabled={pendiente || nota === props.nota} onClick={() => correr(() => guardarNota(props.id, nota), "Nota guardada")}>Guardar nota</button>
      </section>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}
