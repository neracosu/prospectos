"use client";
import { useOptimistic, useState, useTransition } from "react";
import type { CobroFila } from "@/lib/proyectos";
import { CANALES_COBRO, ETIQUETA_CANAL_COBRO, ETIQUETA_CONCEPTO, ETIQUETA_COBRO } from "@/lib/cobros-contrato";
import { formatoUSD } from "@/lib/dinero";
import { fechaVisible } from "@/lib/fecha-caracas";
import { MasAcciones } from "@/componentes/MasAcciones";
import { aplicarCambioCobro, type CambioCobro, type CobroOptimista } from "@/lib/optimista-contrato";
import { marcarPagado, deshacerPago, anularCobro, agregarCobro, registrarRecordatorio, avisarCobro } from "@/acciones/cobros";
import { useFlotante } from "@/componentes/LineaFlotante";
import { AccionesRecibo } from "@/componentes/AccionesRecibo";

export function TabCobros({ proyectoId, cobros, hoy, emisorListo }: { proyectoId: number; cobros: CobroFila[]; hoy: string; emisorListo: boolean }) {
  const [abierto, setAbierto] = useState<{ id: number; modo: "pagar" | "anular" } | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  // Cuando window.open() vuelve bloqueado (comun en movil despues de un await),
  // se deja el enlace como texto para que lo abran con un toque.
  const [enlaceManual, setEnlaceManual] = useState<{ id: number; href: string } | null>(null);
  const [pendiente, empezar] = useTransition();
  const avisarResultado = useFlotante();
  // Pasada de UX, fase B. La fila pasa a «Pagado» al tocar Confirmar, no cuando responde el servidor; si el
  // servidor dice que no, vuelve sola a como estaba. No hay router.refresh(): cada accion ya revalida esta ruta.
  const [lista, aplicar] = useOptimistic<CobroOptimista[], CambioCobro>(cobros, aplicarCambioCobro);
  const correr = (fn: () => Promise<{ ok: boolean; mensaje?: string }>, texto: string) => empezar(async () => { const r = await fn(); if (r.ok) { setError(""); setAbierto(null); setNuevo(false); avisarResultado({ texto }); } else setError(r.mensaje ?? "No se pudo guardar. Intenta de nuevo."); });
  const pagar = (c: CobroOptimista, fd: FormData) => {
    setError("");
    empezar(async () => {
      // Mediodia de Caracas del dia elegido, igual que lo guarda marcarPagado.
      aplicar({ tipo: "pagado", id: c.id, pagadoEn: new Date(`${String(fd.get("pagadoEn"))}T12:00:00-04:00`), canal: String(fd.get("canal") ?? ""), referencia: String(fd.get("referencia") ?? "").trim() });
      const r = await marcarPagado(fd);
      if (!r.ok) return setError(r.mensaje);
      setAbierto(null);
      // El «Deshacer» vale un minuto y solo mientras no haya recibo (deshacerPago); despues, el camino es Anular.
      avisarResultado({ texto: `Pagado ${formatoUSD(c.monto)}`, deshacer: () => deshacerPago(c.id), textoDeshecho: "Pago deshecho" });
    });
  };
  const recordar = (id: number) => empezar(async () => {
    const r = await registrarRecordatorio(id);
    if (r.ok) {
      const ventana = window.open(r.datos.href, "_blank");
      if (ventana) ventana.opener = null;
      setEnlaceManual(ventana ? null : { id, href: r.datos.href });
      setError("");
    } else setError(r.mensaje);
  });
  const avisar = (id: number) => empezar(async () => {
    const r = await avisarCobro(id);
    if (r.ok) {
      const ventana = window.open(r.datos.href, "_blank");
      if (ventana) ventana.opener = null;
      setEnlaceManual(ventana ? null : { id, href: r.datos.href });
      setError("");
    } else setError(r.mensaje);
  });
  return (
    <section className="tarjeta">
      {lista.length === 0 && <p className="suave">Sin cobros.</p>}
      {lista.map((c) => (
        <div key={c.id} className={`cobro cobro--${c.estado}${c.provisional ? " cobro--provisional" : ""}`}>
          <span>{c.detalle.toLowerCase().startsWith(ETIQUETA_CONCEPTO[c.concepto].toLowerCase()) ? <b>{c.detalle}</b> : <><b>{ETIQUETA_CONCEPTO[c.concepto]}</b>{c.detalle ? `: ${c.detalle}` : ""}</>}<br /><span className="suave">{c.pagadoEn ? `Pagado el ${c.pagadoEn.toLocaleDateString("es-VE", { timeZone: "America/Caracas", day: "2-digit", month: "2-digit", year: "numeric" })} por ${ETIQUETA_CANAL_COBRO[c.canal as keyof typeof ETIQUETA_CANAL_COBRO] ?? c.canal}${c.referencia ? ` (${c.referencia})` : ""}` : `Vence el ${fechaVisible(c.vence)}`}{c.anuladoMotivo ? `. Anulado: ${c.anuladoMotivo}` : ""}{c.avisado ? ". Avisado al cliente" : ""}</span></span>
          <span style={{ textAlign: "right" }}><span className="cobro__monto">{formatoUSD(c.monto)}</span><br /><span className={`etiqueta etiqueta--${c.estado}`}>{ETIQUETA_COBRO[c.estado]}</span></span>
          {(c.estado === "vencido" || c.estado === "por_vencer" || c.estado === "pendiente") && (
            <div style={{ gridColumn: "1 / -1" }}>
              {/* Cobrar y recordar son lo de todos los dias: a la vista. Avisar y anular, detras de «···». */}
              <MasAcciones etiqueta="Más acciones de este cobro" principal={<>
                <button className="boton mini boton--primario" onClick={() => setAbierto({ id: c.id, modo: "pagar" })}>Marcar pagado</button>
                <button className="boton mini" disabled={pendiente} onClick={() => recordar(c.id)}>{c.recordadoHoy ? "Recordado hoy, reabrir" : "Recordar"}</button>
              </>}>
                {(c.concepto === "cuota" || c.concepto === "extra") && !c.avisado && <button className="boton mini" disabled={pendiente} onClick={() => avisar(c.id)}>Avisar al cliente</button>}
                <button className="boton mini boton--peligro" onClick={() => { setMotivo(""); setAbierto({ id: c.id, modo: "anular" }); }}>Anular</button>
              </MasAcciones>
            </div>
          )}
          {/* Una fila provisional (el servidor aun no confirmo el pago) no ofrece el recibo. */}
          {!c.provisional && (c.estado === "pagado" || (c.estado === "anulado" && c.reciboNumero !== "")) && (
            <AccionesRecibo key={c.estado} cobro={c} emisorListo={emisorListo} onAnular={() => { setMotivo(""); setError(""); setAbierto({ id: c.id, modo: "anular" }); }} />
          )}
          {enlaceManual?.id === c.id && (
            <p className="suave" style={{ gridColumn: "1 / -1" }}>El navegador bloqueó la ventana: <a href={enlaceManual.href} target="_blank" rel="noopener">Abrir WhatsApp</a></p>
          )}
          {abierto?.id === c.id && abierto.modo === "pagar" && (
            <form className="pregunta" style={{ gridColumn: "1 / -1" }} hidden={c.provisional} onSubmit={(e) => { e.preventDefault(); pagar(c, new FormData(e.currentTarget)); }}>
              <input type="hidden" name="cobroId" value={c.id} />
              <label className="campo"><span>Fecha de pago</span><input name="pagadoEn" type="date" defaultValue={hoy} max={hoy} required /></label>
              <label className="campo"><span>Canal</span><select name="canal">{CANALES_COBRO.map((k) => <option key={k} value={k}>{ETIQUETA_CANAL_COBRO[k]}</option>)}</select></label>
              <label className="campo"><span>Referencia</span><input name="referencia" /></label>
              <label className="campo"><span>Nota</span><input name="nota" /></label>
              <div className="fila-botones"><button className="boton boton--primario" disabled={pendiente}>Confirmar</button><button type="button" className="boton" onClick={() => setAbierto(null)}>Cancelar</button></div>
            </form>
          )}
          {abierto?.id === c.id && abierto.modo === "anular" && (
            <div className="pregunta" style={{ gridColumn: "1 / -1" }}>
              <p style={{ margin: "0 0 8px" }}>
                {c.reciboNumero
                  ? `Este cobro ya tiene el recibo ${c.reciboNumero}. Al anularlo se genera la nota ${c.reciboNumero}-A; el PDF del recibo no se borra.`
                  : c.pagadoEn ? "Este cobro ya está pagado. Al anularlo deja de contar como cobrado; el rastro del pago no se borra." : "El cobro queda anulado con su motivo; no se borra."}
              </p>
              <label className="campo"><span>Motivo</span><input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={191} autoFocus /></label>
              <div className="fila-botones"><button className="boton boton--peligro" disabled={pendiente} onClick={() => correr(() => anularCobro(c.id, motivo), "Cobro anulado")}>{pendiente ? "Anulando…" : "Anular cobro"}</button><button className="boton" onClick={() => setAbierto(null)}>Conservar</button></div>
              {error && <p className="error" role="alert">{error}</p>}
            </div>
          )}
        </div>
      ))}
      <div className="fila-botones"><button className="boton" onClick={() => setNuevo((v) => !v)}>{nuevo ? "Cancelar" : "Agregar cobro"}</button></div>
      {nuevo && (
        <form className="pregunta" action={(fd) => correr(() => agregarCobro(fd), "Cobro agregado")}>
          <input type="hidden" name="proyectoId" value={proyectoId} />
          <label className="campo"><span>Concepto</span><select name="concepto"><option value="extra">Extra (fuera de alcance)</option><option value="cuota">Cuota</option></select></label>
          <label className="campo"><span>Detalle</span><input name="detalle" required placeholder="Módulo de reportes" /></label>
          <label className="campo"><span>Monto (USD)</span><input name="monto" inputMode="decimal" required placeholder="150 o 150,50" /></label>
          <label className="campo"><span>Vence</span><input name="vence" type="date" defaultValue={hoy} required /></label>
          <button className="boton boton--primario" disabled={pendiente}>Agregar</button>
        </form>
      )}
      {error && abierto?.modo !== "anular" && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
