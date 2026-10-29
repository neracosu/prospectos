"use client";
import { Fragment, useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import type { CobroFila } from "@/lib/proyectos";
import { CANALES_COBRO, ETIQUETA_CANAL_COBRO, ETIQUETA_CONCEPTO, ETIQUETA_COBRO } from "@/lib/cobros-contrato";
import { formatoUSD } from "@/lib/dinero";
import { fechaVisible } from "@/lib/fecha-caracas";
import { MasAcciones } from "@/componentes/MasAcciones";
import { Campo } from "@/componentes/Campo";
import { aplicarCambioCobro, type CambioCobro, type CobroOptimista } from "@/lib/optimista-contrato";
import { marcarPagado, deshacerPago, anularCobro, registrarRecordatorio, avisarCobro } from "@/acciones/cobros";
import { useFlotante } from "@/componentes/LineaFlotante";
import { AccionesRecibo } from "@/componentes/AccionesRecibo";

// Tabla de cobros de todos los proyectos (/cobros, fase 3). Mismas acciones que TabCobros, fila por fila: Marcar
// pagado (formulario en linea), Recordar, Avisar, Anular con motivo y el recibo. Sin «Agregar cobro»: eso sigue en
// el proyecto. El mismo DOM sirve en el telefono (filas apiladas con data-label) y en escritorio (tabla).
export function TablaCobros({ cobros, hoy, emisorListo }: { cobros: CobroFila[]; hoy: string; emisorListo: boolean }) {
  const [abierto, setAbierto] = useState<{ id: number; modo: "pagar" | "anular" } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<{ id: number; texto: string } | null>(null);
  const [enlaceManual, setEnlaceManual] = useState<{ id: number; href: string } | null>(null);
  const [pendiente, empezar] = useTransition();
  const avisarResultado = useFlotante();
  const [lista, aplicar] = useOptimistic<CobroOptimista[], CambioCobro>(cobros, aplicarCambioCobro);
  const pagar = (c: CobroOptimista, fd: FormData) => {
    setError(null);
    empezar(async () => {
      aplicar({ tipo: "pagado", id: c.id, pagadoEn: new Date(`${String(fd.get("pagadoEn"))}T12:00:00-04:00`), canal: String(fd.get("canal") ?? ""), referencia: String(fd.get("referencia") ?? "").trim() });
      const r = await marcarPagado(fd);
      if (!r.ok) return setError({ id: c.id, texto: r.mensaje });
      setAbierto((a) => (a?.id === c.id ? null : a));
      avisarResultado({ texto: `Pagado ${formatoUSD(c.monto)} · ${c.proyectoNombre}`, deshacer: () => deshacerPago(c.id), textoDeshecho: "Pago deshecho" });
    });
  };
  const anular = (c: CobroOptimista) => empezar(async () => {
    const r = await anularCobro(c.id, motivo);
    if (!r.ok) return setError({ id: c.id, texto: r.mensaje });
    setError(null); setAbierto((a) => (a?.id === c.id ? null : a));
    avisarResultado({ texto: "Cobro anulado" });
  });
  const abrirWhatsApp = (id: number, fn: () => Promise<{ ok: true; datos: { href: string } } | { ok: false; mensaje: string }>) => empezar(async () => {
    const r = await fn();
    if (!r.ok) return setError({ id, texto: r.mensaje });
    // Sin "noopener" en las opciones: con el, window.open devuelve null SIEMPRE y no se sabria si abrio.
    const ventana = window.open(r.datos.href, "_blank");
    if (ventana) ventana.opener = null;
    setEnlaceManual(ventana ? null : { id, href: r.datos.href });
    setError(null);
  });
  const sinResolver = (c: CobroOptimista) => c.estado === "vencido" || c.estado === "por_vencer" || c.estado === "pendiente";
  return (
    <table className="tabla tabla--cobros">
      <thead><tr><th>Vence</th><th>Proyecto</th><th>Concepto</th><th className="num">Monto</th><th>Estado</th><th aria-label="Acciones" /></tr></thead>
      <tbody>
        {lista.map((c) => (
          <Fragment key={c.id}>
            <tr className={`cobro-fila cobro-fila--${c.estado}${c.provisional ? " cobro--provisional" : ""}`} data-id={c.id}>
              <td data-label="Vence" className="num">{c.pagadoEn ? <span className="suave">pagado {c.pagadoEn.toLocaleDateString("es-VE", { timeZone: "America/Caracas", day: "2-digit", month: "2-digit" })}</span> : fechaVisible(c.vence)}</td>
              <td data-label="Proyecto"><Link href={`/proyectos/${c.proyectoId}?t=cobros`}>{c.proyectoNombre}</Link></td>
              <td data-label="Concepto">{c.detalle.toLowerCase().startsWith(ETIQUETA_CONCEPTO[c.concepto].toLowerCase()) ? c.detalle : `${ETIQUETA_CONCEPTO[c.concepto]}${c.detalle ? `: ${c.detalle}` : ""}`}{c.avisado ? <span className="suave"> · avisado</span> : null}</td>
              <td data-label="Monto" className="num"><span className="cobro__monto">{formatoUSD(c.monto)}</span></td>
              <td data-label="Estado"><span className={`etiqueta etiqueta--${c.estado}`}>{ETIQUETA_COBRO[c.estado]}</span>{c.anuladoMotivo ? <span className="suave"> {c.anuladoMotivo}</span> : null}</td>
              <td className="tabla__acciones">
                {sinResolver(c) && (
                  <MasAcciones etiqueta={`Más acciones del cobro de ${c.proyectoNombre}`} principal={<>
                    <button className="boton mini boton--primario" onClick={() => { setError(null); setAbierto({ id: c.id, modo: "pagar" }); }}>Marcar pagado</button>
                    <button className="boton mini" disabled={pendiente} onClick={() => abrirWhatsApp(c.id, () => registrarRecordatorio(c.id))}>{c.recordadoHoy ? "Recordado hoy, reabrir" : "Recordar"}</button>
                  </>}>
                    {(c.concepto === "cuota" || c.concepto === "extra") && !c.avisado && <button className="boton mini" disabled={pendiente} onClick={() => abrirWhatsApp(c.id, () => avisarCobro(c.id))}>Avisar al cliente</button>}
                    <button className="boton mini boton--peligro" onClick={() => { setMotivo(""); setError(null); setAbierto({ id: c.id, modo: "anular" }); }}>Anular</button>
                  </MasAcciones>
                )}
                {!c.provisional && (c.estado === "pagado" || (c.estado === "anulado" && c.reciboNumero !== "")) && (
                  <AccionesRecibo key={c.estado} cobro={c} emisorListo={emisorListo} onAnular={() => { setMotivo(""); setError(null); setAbierto({ id: c.id, modo: "anular" }); }} />
                )}
              </td>
            </tr>
            {(abierto?.id === c.id || enlaceManual?.id === c.id || error?.id === c.id) && (
              <tr className="tabla__detalle"><td colSpan={6}>
                {enlaceManual?.id === c.id && <p className="suave">El navegador bloqueó la ventana: <a href={enlaceManual.href} target="_blank" rel="noopener">Abrir WhatsApp</a></p>}
                {abierto?.id === c.id && abierto.modo === "pagar" && (
                  <form className="pregunta" hidden={c.provisional} onSubmit={(e) => { e.preventDefault(); pagar(c, new FormData(e.currentTarget)); }}>
                    <input type="hidden" name="cobroId" value={c.id} />
                    {/* Reglas copiadas de PagoZ (src/acciones/cobros.ts). */}
                    <Campo nombre="pagadoEn" etiqueta="Fecha de pago" regla={{ tipo: "fecha" }} requerido type="date" defaultValue={hoy} max={hoy} />
                    <Campo nombre="canal" etiqueta="Canal" control="select">{CANALES_COBRO.map((k) => <option key={k} value={k}>{ETIQUETA_CANAL_COBRO[k]}</option>)}</Campo>
                    <Campo nombre="referencia" etiqueta="Referencia" regla={{ tipo: "texto", max: 80 }} autoComplete="off" />
                    <Campo nombre="nota" etiqueta="Nota" regla={{ tipo: "texto", max: 500 }} autoComplete="off" />
                    <div className="fila-botones"><button className="boton boton--primario" disabled={pendiente}>Confirmar</button><button type="button" className="boton" onClick={() => setAbierto(null)}>Cancelar</button></div>
                  </form>
                )}
                {abierto?.id === c.id && abierto.modo === "anular" && (
                  <div className="pregunta">
                    <p style={{ margin: "0 0 8px" }}>
                      {c.reciboNumero
                        ? `Este cobro ya tiene el recibo ${c.reciboNumero}. Al anularlo se genera la nota ${c.reciboNumero}-A; el PDF del recibo no se borra.`
                        : c.pagadoEn ? "Este cobro ya está pagado. Al anularlo deja de contar como cobrado; el rastro del pago no se borra." : "El cobro queda anulado con su motivo; no se borra."}
                    </p>
                    <label className="campo"><span>Motivo</span><input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={191} autoFocus /></label>
                    <div className="fila-botones"><button className="boton boton--peligro" disabled={pendiente} onClick={() => anular(c)}>{pendiente ? "Anulando…" : "Anular cobro"}</button><button className="boton" onClick={() => setAbierto(null)}>Conservar</button></div>
                  </div>
                )}
                {error?.id === c.id && <p className="error" role="alert">{error.texto}</p>}
              </td></tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}
