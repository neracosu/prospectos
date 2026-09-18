"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearProyecto } from "@/acciones/proyectos";
import { Campo } from "./Campo";

type Props = { nichos: { id: number; nombre: string }[]; clientes: { id: number; nombre: string }[]; prospecto?: { id: number; nombre: string; nichoId: number; codigo: string }; hoy: string };

export function FormularioProyecto({ nichos, clientes, prospecto, hoy }: Props) {
  const [error, setError] = useState("");
  const [formaPago, setFormaPago] = useState<"completo" | "cuotas">("completo");
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
  return (
    // Reglas copiadas de NuevoZ (src/acciones/proyectos.ts).
    <form className="tarjeta" autoComplete="off" action={(fd) => empezar(async () => { const r = await crearProyecto(fd); if (r.ok) { router.push(`/proyectos/${r.datos.id}`); router.refresh(); } else setError(r.mensaje); })}>
      {prospecto ? (
        <><input type="hidden" name="prospectoId" value={prospecto.id} /><input type="hidden" name="propuestaCodigo" value={prospecto.codigo} /><p><b>Cliente:</b> {prospecto.nombre} <span className="suave">(desde el embudo)</span></p></>
      ) : (
        <Campo nombre="clienteId" etiqueta="Cliente" control="select" requerido><option value="">Elige…</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Campo>
      )}
      <Campo nombre="nombre" etiqueta="Nombre del proyecto" regla={{ tipo: "texto", min: 2, max: 120 }} requerido placeholder="PMS Hotel" />
      <label className="campo"><span>Nicho</span><select name="nichoId" defaultValue={prospecto?.nichoId ?? nichos[0]?.id}>{nichos.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}</select></label>
      <p className="suave">Los precios salen de neracosu.com/para/. Aquí solo se copian.</p>
      <p className="suave">Montos sin punto de miles (ej. 2800,50).</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Campo nombre="pagoUnico" etiqueta="Pago único (USD)" regla={{ tipo: "monto" }} requerido inputMode="decimal" placeholder="2800 (0 si es solo mensualidad)" />
        <Campo nombre="mensualidad" etiqueta="Mensualidad (USD)" regla={{ tipo: "monto" }} requerido inputMode="decimal" placeholder="100 o 100,50" />
        <Campo nombre="horasCotizadas" etiqueta="Horas cotizadas" regla={{ tipo: "monto" }} requerido inputMode="decimal" placeholder="160" />
        <Campo nombre="diaCobroMensual" etiqueta="Día de cobro (1–28)" regla={{ tipo: "entero", min: 1, max: 28 }} requerido type="number" inputMode="numeric" min={1} max={28} defaultValue={5} />
        <Campo nombre="fechaInicio" etiqueta="Inicio" regla={{ tipo: "fecha" }} requerido type="date" defaultValue={hoy} />
        <Campo nombre="fechaEntregaEstimada" etiqueta="Entrega estimada" regla={{ tipo: "fecha" }} type="date" />
      </div>
      <label className="campo"><span>Forma de pago del pago único</span>
        <select name="formaPago" value={formaPago} onChange={(e) => setFormaPago(e.target.value as "completo" | "cuotas")}><option value="completo">Completo al inicio</option><option value="cuotas">En cuotas (cada 30 días)</option></select></label>
      {formaPago === "cuotas" && <Campo nombre="cuotas" etiqueta="Cuántas cuotas (2–12)" regla={{ tipo: "entero", min: 2, max: 12 }} requerido type="number" inputMode="numeric" min={2} max={12} defaultValue={3} />}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="boton boton--primario" disabled={pendiente} type="submit">Crear proyecto</button>
    </form>
  );
}
