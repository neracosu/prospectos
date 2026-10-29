"use client";
import { useCallback, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { FilaCola } from "@/lib/correos";
import { ANTETITULO_POR_ARQUETIPO } from "@/lib/mensajes-nicho-contrato";
import { hitosDe, recortar, yaEnviado, puedeEnviar } from "@/lib/correos-contrato";
import { enviarPropuestaCorreo } from "@/acciones/correos";
import { useFlotante } from "@/componentes/LineaFlotante";
import { VistaPreviaCorreo } from "@/componentes/VistaPreviaCorreo";

const ESTADO_FICHA: Record<string, string> = { sin_hallazgos: "Sin hallazgos", borrador: "Borrador", lista: "Lista", revisada: "Revisada" };

// La cola de /correos: una fila por negocio con su correo, gancho, estado de la ficha e hitos del ultimo envio, y dos
// botones: «Ver» (la vista previa) y «Enviar» directo. Mismo DOM en el telefono (filas apiladas con data-label) y en
// escritorio (tabla). Sin router.refresh(): las acciones revalidan /correos y la respuesta trae las filas nuevas.
export function ColaCorreos({ filas }: { filas: FilaCola[] }) {
  const [abierta, setAbierta] = useState<FilaCola | null>(null);
  const [enCurso, setEnCurso] = useState<number | null>(null);
  const [error, setError] = useState<{ id: number; texto: string } | null>(null);
  const [, empezar] = useTransition();
  const avisar = useFlotante();
  const anterior = useRef<HTMLElement | null>(null);

  const abrir = (f: FilaCola, e: React.MouseEvent<HTMLButtonElement>) => { anterior.current = e.currentTarget; setAbierta(f); };
  const cerrar = useCallback(() => {
    setAbierta(null);
    const a = anterior.current; anterior.current = null;
    requestAnimationFrame(() => { if (a && a.isConnected) a.focus(); });
  }, []);
  const enviar = (f: FilaCola) => {
    // Antes de la transicion: el «Enviando…» se ve al tocar
    setEnCurso(f.prospectoId); setError(null);
    empezar(async () => {
      let r: Awaited<ReturnType<typeof enviarPropuestaCorreo>>;
      try { r = await enviarPropuestaCorreo(f.prospectoId); } catch { r = { ok: false, mensaje: "No se pudo enviar. Intente de nuevo." }; }
      setEnCurso(null);
      if (!r.ok) return setError({ id: f.prospectoId, texto: r.mensaje });
      avisar({ texto: `Correo enviado a ${f.nombre}` });
    });
  };
  // La hoja muestra la fila al dia (despues de cada accion llega la nueva); si ya no esta en este filtro, la ultima vista.
  const filaAbierta = abierta ? filas.find((f) => f.prospectoId === abierta.prospectoId) ?? abierta : null;

  return (
    <>
      <table className="tabla cola-correos">
        <thead><tr><th>Negocio</th><th>Ciudad</th><th>Plantilla</th><th>Correo</th><th>Gancho</th><th>Ficha</th><th>Hitos</th><th aria-label="Acciones" /></tr></thead>
        <tbody>
          {filas.map((f) => {
            const hitos = hitosDe(f.envio);
            const conBoton = puedeEnviar(f, "manual") && (!yaEnviado(f.envio) || f.tocaSeguimiento);
            return (
              <tr key={f.prospectoId} className="cola-correos__fila" data-id={f.prospectoId}>
                <td data-label="Negocio"><Link href={`/prospectos/${f.prospectoId}`} className="cola-correos__nombre">{f.nombre}</Link></td>
                <td data-label="Ciudad">{f.ciudad}</td>
                <td data-label="Plantilla">{ANTETITULO_POR_ARQUETIPO[f.arquetipo] ?? (f.arquetipo || "Sin plantilla")}</td>
                <td data-label="Correo" className="cola-correos__correo">{f.email}</td>
                <td data-label="Gancho" className="cola-correos__gancho">{f.gancho ? <span title={f.gancho}>{recortar(f.gancho, 90)}</span> : <span className="suave">Sin gancho</span>}</td>
                <td data-label="Ficha">
                  <span className="etiqueta">{ESTADO_FICHA[f.estadoFicha] ?? f.estadoFicha}</span>
                  {f.alAutomatico && <span className="suave"> · automático</span>}
                  {f.nombreNoCoincide && <span className="error"> · el nombre no coincide con su web</span>}
                  {f.bloqueado && <span className="error"> · bloqueado</span>}
                </td>
                <td data-label="Hitos" className="cola-correos__hitos">{hitos.length ? hitos.join(" · ") : <span className="suave">Sin enviar</span>}</td>
                <td className="tabla__acciones">
                  <button type="button" className="boton mini" onClick={(e) => abrir(f, e)} aria-label={`Ver el correo de ${f.nombre}`}>Ver</button>
                  {conBoton && (
                    <button type="button" className="boton mini boton--primario" disabled={enCurso !== null} onClick={() => enviar(f)} aria-label={`${f.tocaSeguimiento ? "Enviar seguimiento" : "Enviar"} a ${f.nombre}`}>
                      {enCurso === f.prospectoId ? "Enviando…" : f.tocaSeguimiento ? "Enviar seguimiento" : "Enviar"}
                    </button>
                  )}
                  {error?.id === f.prospectoId && <p className="error cola-correos__error" role="alert">{error.texto}</p>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {filaAbierta && <VistaPreviaCorreo key={filaAbierta.prospectoId} fila={filaAbierta} onCerrar={cerrar} />}
    </>
  );
}
