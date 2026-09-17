"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CobroFila } from "@/lib/proyectos";
import { CANALES_COBRO, ETIQUETA_CANAL_COBRO, ETIQUETA_CONCEPTO, ETIQUETA_COBRO } from "@/lib/cobros-contrato";
import { formatoUSD } from "@/lib/dinero";
import { marcarPagado, anularCobro, agregarCobro, registrarRecordatorio } from "@/acciones/cobros";
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
  const router = useRouter();
  const correr = (fn: () => Promise<{ ok: boolean; mensaje?: string }>) => empezar(async () => { const r = await fn(); if (r.ok) { setError(""); setAbierto(null); setNuevo(false); router.refresh(); } else setError(r.mensaje ?? "Error"); });
  const recordar = (id: number) => empezar(async () => {
    const r = await registrarRecordatorio(id);
    if (r.ok) {
      const ventana = window.open(r.datos.href, "_blank");
      if (ventana) ventana.opener = null;
      setEnlaceManual(ventana ? null : { id, href: r.datos.href });
      setError("");
      router.refresh();
    } else setError(r.mensaje);
  });
  return (
    <section className="tarjeta">
      {cobros.length === 0 && <p className="suave">Sin cobros.</p>}
      {cobros.map((c) => (
        <div key={c.id} className="cobro">
          <span><b>{ETIQUETA_CONCEPTO[c.concepto]}</b>{c.detalle ? ` · ${c.detalle}` : ""}<br /><span className="suave">vence {c.vence}{c.pagadoEn ? ` · pagado ${c.pagadoEn.toLocaleDateString("es-VE", { timeZone: "America/Caracas" })} por ${c.canal}${c.referencia ? ` (${c.referencia})` : ""}` : ""}{c.anuladoMotivo ? ` · anulado: ${c.anuladoMotivo}` : ""}</span></span>
          <span style={{ textAlign: "right" }}><span className="cobro__monto">{formatoUSD(c.monto)}</span><br /><span className={`etiqueta etiqueta--${c.estado}`}>{ETIQUETA_COBRO[c.estado]}</span></span>
          {(c.estado === "vencido" || c.estado === "por_vencer" || c.estado === "pendiente") && (
            <div className="fila-botones" style={{ gridColumn: "1 / -1" }}>
              <button className="boton mini boton--primario" onClick={() => setAbierto({ id: c.id, modo: "pagar" })}>Marcar pagado</button>
              <button className="boton mini" disabled={pendiente} onClick={() => recordar(c.id)}>{c.recordadoHoy ? "Recordado hoy · reabrir" : "Recordar"}</button>
              <button className="boton mini boton--peligro" onClick={() => { setMotivo(""); setAbierto({ id: c.id, modo: "anular" }); }}>Anular</button>
            </div>
          )}
          {(c.estado === "pagado" || (c.estado === "anulado" && c.reciboNumero !== "")) && (
            <AccionesRecibo cobro={c} emisorListo={emisorListo} onAnular={() => { setMotivo(""); setError(""); setAbierto({ id: c.id, modo: "anular" }); }} />
          )}
          {enlaceManual?.id === c.id && (
            <p className="suave" style={{ gridColumn: "1 / -1" }}>El navegador bloqueó la ventana: <a href={enlaceManual.href} target="_blank" rel="noopener">Abrir WhatsApp</a></p>
          )}
          {abierto?.id === c.id && abierto.modo === "pagar" && (
            <form className="pregunta" style={{ gridColumn: "1 / -1" }} action={(fd) => correr(() => marcarPagado(fd))}>
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
              <label className="campo"><span>Motivo</span><input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} autoFocus /></label>
              <div className="fila-botones"><button className="boton boton--peligro" disabled={pendiente} onClick={() => correr(() => anularCobro(c.id, motivo))}>{pendiente ? "Anulando…" : "Anular cobro"}</button><button className="boton" onClick={() => setAbierto(null)}>Conservar</button></div>
              {error && <p className="error" role="alert">{error}</p>}
            </div>
          )}
        </div>
      ))}
      <div className="fila-botones"><button className="boton" onClick={() => setNuevo((v) => !v)}>{nuevo ? "Cancelar" : "Agregar cobro"}</button></div>
      {nuevo && (
        <form className="pregunta" action={(fd) => correr(() => agregarCobro(fd))}>
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
