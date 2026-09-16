"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearProspecto } from "@/acciones/prospectos";

const CAMPOS: [string, string, string?][] = [
  ["nombre", "Nombre del negocio"], ["ciudad", "Ciudad"], ["estado", "Estado"], ["tipo", "Tipo"], ["tamano", "Tamaño (ej. 20 hab.)"],
  ["telefono", "Teléfono(s)", "tel"], ["whatsapp", "WhatsApp", "tel"], ["email", "Correo", "email"], ["web", "Web", "url"],
  ["instagram", "Instagram"], ["facebook", "Facebook"], ["tiktok", "TikTok"], ["fuente", "Fuente (URL donde publican el contacto)", "url"],
];

export function FormularioNuevo({ nichos }: { nichos: { id: number; nombre: string }[] }) {
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
  return (
    <form className="tarjeta" action={(fd) => empezar(async () => { const r = await crearProspecto(fd); if (r.ok) router.push(`/prospectos/${r.datos.id}`); else setError(r.mensaje); })}>
      <label className="campo"><span>Nicho</span><select name="nichoId" required>{nichos.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}</select></label>
      {CAMPOS.map(([n, t, tipo]) => <label key={n} className="campo"><span>{t}</span><input name={n} type={tipo ?? "text"} required={n === "nombre" || n === "ciudad"} /></label>)}
      <label className="campo"><span>Nota interna</span><textarea name="nota" rows={3} /></label>
      <p className="suave">Solo datos que el negocio publicó. Nada de contactos personales.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="boton boton--primario" disabled={pendiente} type="submit">Guardar</button>
    </form>
  );
}
