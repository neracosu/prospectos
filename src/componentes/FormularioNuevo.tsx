"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearProspecto } from "@/acciones/prospectos";

const CAMPOS: [string, string, string?][] = [
  ["nombre", "Nombre del negocio"], ["ciudad", "Ciudad"], ["estado", "Estado"], ["tipo", "Tipo"], ["tamano", "Tamaño (ej. 20 hab.)"],
  ["telefono", "Teléfono(s)", "tel"], ["whatsapp", "WhatsApp", "tel"], ["email", "Correo", "email"], ["web", "Web", "url"],
  ["instagram", "Instagram"], ["facebook", "Facebook"], ["tiktok", "TikTok"], ["fuente", "Fuente (URL donde publican el contacto)", "url"],
];

// `valores` llega desde la pantalla servidor con lo que traiga la URL: es el
// camino de "cargarlo a mano" cuando no se pudo leer una ficha de Google Maps.
// La fuente prellenada se ve y no se edita (viene del enlace que se leyo), pero
// va en el formulario: un readOnly si se envia, un disabled no.
export type ValoresNuevo = { fuente?: string; nombre?: string; web?: string; telefono?: string; nota?: string };

export function FormularioNuevo({ nichos, valores = {} }: { nichos: { id: number; nombre: string }[]; valores?: ValoresNuevo }) {
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
  const fuenteFija = (valores.fuente ?? "").trim();
  const inicial: Record<string, string> = {
    nombre: valores.nombre ?? "", web: valores.web ?? "", telefono: valores.telefono ?? "", fuente: fuenteFija,
  };
  return (
    <form className="tarjeta" action={(fd) => empezar(async () => { const r = await crearProspecto(fd); if (r.ok) router.push(`/prospectos/${r.datos.id}`); else setError(r.mensaje); })}>
      <label className="campo"><span>Nicho</span><select name="nichoId" required>{nichos.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}</select></label>
      {CAMPOS.map(([n, t, tipo]) => (
        <label key={n} className="campo">
          <span>{n === "fuente" && fuenteFija ? "Fuente (del enlace que se leyó)" : t}</span>
          <input
            name={n}
            type={tipo ?? "text"}
            defaultValue={inicial[n] ?? ""}
            readOnly={n === "fuente" && !!fuenteFija}
            required={n === "nombre" || n === "ciudad"}
          />
        </label>
      ))}
      <label className="campo"><span>Nota interna</span><textarea name="nota" rows={3} defaultValue={valores.nota ?? ""} /></label>
      <p className="suave">Solo datos que el negocio publicó. Nada de contactos personales.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="boton boton--primario" disabled={pendiente} type="submit">Guardar</button>
    </form>
  );
}
