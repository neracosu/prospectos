"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CobroFila } from "@/lib/proyectos";
import { generarReciboDeCobro, avisarRecibo, generarNotaDeAnulacion } from "@/acciones/recibos";

type Accion = "recibo" | "aviso" | "nota";

// Botones de recibo de una fila de cobro pagado (o anulado que tuvo recibo).
// Generar tarda 3-10 s (lanza Chromium): el propio boton lo dice, no hay respuesta optimista
// (el numero lo decide el servidor) y el resultado sale aqui mismo, en la fila.
export function AccionesRecibo({ cobro, emisorListo, onAnular }: { cobro: CobroFila; emisorListo: boolean; onAnular: () => void }) {
  const [enCurso, setEnCurso] = useState<Accion | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [enlaceManual, setEnlaceManual] = useState("");
  const [, empezar] = useTransition();
  const router = useRouter();
  const anulado = cobro.estado === "anulado";

  // aria-disabled no bloquea el clic: el guardia es este.
  const correr = (accion: Accion, tarea: () => Promise<void>) => {
    if (enCurso) return;
    setEnCurso(accion); setAviso(null);
    empezar(async () => { try { await tarea(); } finally { setEnCurso(null); } });
  };

  const generar = () => correr("recibo", async () => {
    const r = await generarReciboDeCobro(cobro.id);
    if (r.ok) { setAviso({ tipo: "ok", texto: `Recibo ${r.datos.numero} generado.` }); router.refresh(); } else setAviso({ tipo: "error", texto: r.mensaje });
  });

  const avisar = () => correr("aviso", async () => {
    const r = await avisarRecibo(cobro.id);
    if (!r.ok) { setAviso({ tipo: "error", texto: r.mensaje }); return; }
    let copiado = false;
    try { await navigator.clipboard.writeText(r.datos.mensaje); copiado = true; } catch { /* sin permiso de portapapeles: el mensaje igual va en el enlace */ }
    if (!r.datos.href) { setAviso({ tipo: copiado ? "ok" : "error", texto: copiado ? "Mensaje copiado. El cliente no tiene WhatsApp cargado: pégalo donde le escribas." : "El cliente no tiene WhatsApp cargado. Agrégalo en su ficha." }); return; }
    // window.open despues de un await suele volver bloqueado en el telefono: queda el enlace a mano.
    // Sin "noopener" en las opciones: con el, window.open devuelve null SIEMPRE y no se sabria si abrio.
    const ventana = window.open(r.datos.href, "_blank");
    if (ventana) ventana.opener = null;
    setEnlaceManual(ventana ? "" : r.datos.href);
    setAviso({ tipo: "ok", texto: `${copiado ? "Mensaje copiado. " : ""}Adjunta el PDF del recibo desde el teléfono.` });
    router.refresh();
  });

  const generarNota = () => correr("nota", async () => {
    const r = await generarNotaDeAnulacion(cobro.id);
    if (r.ok) { setAviso({ tipo: "ok", texto: `Nota ${r.datos.numero} generada.` }); router.refresh(); } else setAviso({ tipo: "error", texto: r.mensaje });
  });

  return (
    <div style={{ gridColumn: "1 / -1" }}>
      <div className="fila-botones">
        {!cobro.reciboNumero && !anulado && (emisorListo
          ? <button type="button" className="boton mini boton--primario" aria-disabled={enCurso !== null} onClick={generar}>{enCurso === "recibo" ? "Generando recibo…" : "Generar recibo"}</button>
          : <Link className="boton mini" href="/ajustes">Completa tus datos en Ajustes</Link>)}
        {cobro.reciboNumero && <a className={`boton mini${anulado ? "" : " boton--primario"}`} href={`/recibos/${cobro.reciboNumero}.pdf`} target="_blank" rel="noopener">{anulado ? `Recibo ${cobro.reciboNumero} (anulado)` : `Recibo ${cobro.reciboNumero}`}</a>}
        {cobro.reciboNumero && !anulado && <button type="button" className="boton mini" aria-disabled={enCurso !== null} onClick={avisar}>{enCurso === "aviso" ? "Abriendo WhatsApp…" : "Enviar por WhatsApp"}</button>}
        {anulado && cobro.reciboNumero && (cobro.notaAnulacion
          ? <a className="boton mini" href={`/recibos/${cobro.reciboNumero}-A.pdf`} target="_blank" rel="noopener">Nota de anulación</a>
          : <button type="button" className="boton mini boton--primario" aria-disabled={enCurso !== null} onClick={generarNota}>{enCurso === "nota" ? "Generando nota…" : "Generar nota de anulación"}</button>)}
        {!anulado && <button type="button" className="boton mini boton--peligro" aria-disabled={enCurso !== null} onClick={() => { if (!enCurso) onAnular(); }}>Anular</button>}
      </div>
      {!cobro.reciboNumero && !anulado && !emisorListo && <p className="suave">Para generar recibos hacen falta tu nombre, RIF, WhatsApp y correo.</p>}
      {/* La region existe desde el principio: un lector de pantalla solo anuncia cambios dentro de una region que ya estaba. */}
      <p role="status" className={`estado-fila${aviso?.tipo === "error" ? " estado-fila--error" : ""}`}>{aviso?.texto ?? ""}</p>
      {enlaceManual && <p className="suave">El navegador bloqueó la ventana: <a href={enlaceManual} target="_blank" rel="noopener">Abrir WhatsApp</a></p>}
    </div>
  );
}
