"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearProyecto } from "@/acciones/proyectos";

type Props = { nichos: { id: number; nombre: string }[]; clientes: { id: number; nombre: string }[]; prospecto?: { id: number; nombre: string; nichoId: number; codigo: string } };

export function FormularioProyecto({ nichos, clientes, prospecto }: Props) {
  const [error, setError] = useState("");
  const [formaPago, setFormaPago] = useState<"completo" | "cuotas">("completo");
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
  const hoy = new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
  return (
    <form className="tarjeta" action={(fd) => empezar(async () => { const r = await crearProyecto(fd); if (r.ok) { router.push(`/proyectos/${r.datos.id}`); router.refresh(); } else setError(r.mensaje); })}>
      {prospecto ? (
        <><input type="hidden" name="prospectoId" value={prospecto.id} /><input type="hidden" name="propuestaCodigo" value={prospecto.codigo} /><p><b>Cliente:</b> {prospecto.nombre} <span className="suave">(desde el embudo)</span></p></>
      ) : (
        <label className="campo"><span>Cliente</span><select name="clienteId" required><option value="">Elige…</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
      )}
      <label className="campo"><span>Nombre del proyecto</span><input name="nombre" required placeholder="PMS Hotel" /></label>
      <label className="campo"><span>Nicho</span><select name="nichoId" defaultValue={prospecto?.nichoId ?? nichos[0]?.id}>{nichos.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}</select></label>
      <p className="suave">Los precios salen de neracosu.com/para/. Aquí solo se copian.</p>
      <p className="suave">Montos sin punto de miles (ej. 2800,50).</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label className="campo"><span>Pago único (USD)</span><input name="pagoUnico" inputMode="decimal" required placeholder="2800 (0 si es solo mensualidad)" /></label>
        <label className="campo"><span>Mensualidad (USD)</span><input name="mensualidad" inputMode="decimal" required placeholder="100 o 100,50" /></label>
        <label className="campo"><span>Horas cotizadas</span><input name="horasCotizadas" inputMode="decimal" required placeholder="160" /></label>
        <label className="campo"><span>Día de cobro (1–28)</span><input name="diaCobroMensual" type="number" min={1} max={28} defaultValue={5} required /></label>
        <label className="campo"><span>Inicio</span><input name="fechaInicio" type="date" defaultValue={hoy} required /></label>
        <label className="campo"><span>Entrega estimada</span><input name="fechaEntregaEstimada" type="date" /></label>
      </div>
      <label className="campo"><span>Forma de pago del pago único</span>
        <select name="formaPago" value={formaPago} onChange={(e) => setFormaPago(e.target.value as "completo" | "cuotas")}><option value="completo">Completo al inicio</option><option value="cuotas">En cuotas (cada 30 días)</option></select></label>
      {formaPago === "cuotas" && <label className="campo"><span>Cuántas cuotas (2–12)</span><input name="cuotas" type="number" min={2} max={12} defaultValue={3} /></label>}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="boton boton--primario" disabled={pendiente} type="submit">Crear proyecto</button>
    </form>
  );
}
