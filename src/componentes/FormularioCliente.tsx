"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearCliente, editarCliente } from "@/acciones/clientes";
import type { ClienteFila } from "@/lib/clientes";

const CAMPOS: [keyof ClienteFila, string, string?][] = [["nombre", "Nombre del negocio"], ["contactoNombre", "Persona de contacto"], ["whatsapp", "WhatsApp", "tel"], ["email", "Correo", "email"], ["rif", "RIF"], ["instagram", "Instagram"], ["facebook", "Facebook"], ["tiktok", "TikTok"]];

export function FormularioCliente({ cliente }: { cliente?: ClienteFila }) {
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
  return (
    <form className="tarjeta" action={(fd) => empezar(async () => {
      const r = cliente ? await editarCliente(fd) : await crearCliente(fd);
      if (r.ok) { router.push(cliente ? `/clientes/${cliente.id}` : `/clientes/${(r as { datos: { id: number } }).datos.id}`); router.refresh(); } else setError(r.mensaje);
    })}>
      {cliente && <input type="hidden" name="id" value={cliente.id} />}
      {CAMPOS.map(([n, t, tipo]) => <label key={n} className="campo"><span>{t}</span><input name={n} type={tipo ?? "text"} defaultValue={cliente ? String(cliente[n] ?? "") : ""} required={n === "nombre"} /></label>)}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="boton boton--primario" disabled={pendiente} type="submit">Guardar</button>
    </form>
  );
}
