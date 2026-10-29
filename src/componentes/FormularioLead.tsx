"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearLead } from "@/acciones/leads";
import { Campo } from "@/componentes/Campo";
import { FUENTES_LEAD, ETIQUETA_FUENTE } from "@/lib/leads-contrato";

// Alta corta de un lead: lo que hace falta para empezar la conversacion. Lo demas se completa en la ficha.
export function FormularioLead({ nichos, nichoInicial }: { nichos: { id: number; nombre: string; slug: string }[]; nichoInicial?: number }) {
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
  const otro = nichos.find((n) => n.slug === "otro")?.id;
  return (
    <form className="tarjeta" autoComplete="off" action={(fd) => empezar(async () => { const r = await crearLead(fd); if (r.ok) router.push(`/leads/${r.datos.id}`); else setError(r.mensaje); })}>
      <Campo nombre="nombre" etiqueta="Nombre del negocio o de la persona" requerido regla={{ tipo: "texto", min: 2, max: 120 }} />
      <label className="campo"><span>¿Por dónde llegó?</span>
        <select name="fuenteLead" required defaultValue="whatsapp">{FUENTES_LEAD.filter((f) => f !== "directorio").map((f) => <option key={f} value={f}>{ETIQUETA_FUENTE[f]}</option>)}</select>
      </label>
      <label className="campo"><span>Nicho</span>
        <select name="nichoId" required defaultValue={nichoInicial ?? otro ?? nichos[0]?.id}>{nichos.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}</select>
      </label>
      <Campo nombre="whatsapp" etiqueta="WhatsApp" regla={{ tipo: "texto", max: 40 }} type="text" inputMode="tel" />
      <Campo nombre="instagram" etiqueta="Instagram" regla={{ tipo: "texto", max: 200 }} />
      <Campo nombre="correo" etiqueta="Correo" regla={{ tipo: "texto", max: 120 }} type="text" inputMode="email" />
      <Campo nombre="ciudad" etiqueta="Ciudad (si aplica)" regla={{ tipo: "texto", max: 80 }} />
      <Campo nombre="proximoPaso" etiqueta="Siguiente paso" regla={{ tipo: "texto", max: 160 }} placeholder="mandar propuesta, armar demo, esperar su plan…" />
      <label className="campo"><span>Para cuándo</span><input type="date" name="proximoSeguimiento" /></label>
      <label className="campo"><span>Valor estimado (USD, pago único)</span><input type="text" name="valorEstimado" inputMode="decimal" placeholder="2100" /></label>
      <Campo nombre="propuestaUrl" etiqueta="Enlace a la propuesta o al prototipo" regla={{ tipo: "texto", max: 300 }} />
      <Campo nombre="nota" etiqueta="Nota" control="textarea" regla={{ tipo: "texto", max: 2000 }} rows={3} />
      <p className="suave">Con un contacto basta: WhatsApp, Instagram o correo.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="boton boton--primario" disabled={pendiente} type="submit">Guardar lead</button>
    </form>
  );
}
