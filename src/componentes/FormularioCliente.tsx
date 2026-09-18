"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearCliente, editarCliente } from "@/acciones/clientes";
import type { ClienteFila } from "@/lib/clientes";
import { Campo } from "./Campo";
import type { Regla } from "@/lib/validacion-contrato";

// Las reglas copian ClienteZ (src/acciones/clientes.ts).
const CAMPOS: [keyof ClienteFila, string, Regla, string?][] = [["nombre", "Nombre del negocio", { tipo: "texto", min: 2, max: 120 }], ["contactoNombre", "Persona de contacto", { tipo: "texto", max: 80 }], ["whatsapp", "WhatsApp", { tipo: "texto", max: 40 }, "tel"], ["email", "Correo", { tipo: "texto", max: 120 }, "email"], ["rif", "RIF", { tipo: "texto", max: 20 }], ["instagram", "Instagram", { tipo: "texto", max: 200 }], ["facebook", "Facebook", { tipo: "texto", max: 200 }], ["tiktok", "TikTok", { tipo: "texto", max: 200 }]];

export function FormularioCliente({ cliente }: { cliente?: ClienteFila }) {
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
  return (
    <form className="tarjeta" autoComplete="off" action={(fd) => empezar(async () => {
      const r = cliente ? await editarCliente(fd) : await crearCliente(fd);
      if (r.ok) { router.push(cliente ? `/clientes/${cliente.id}` : `/clientes/${(r as { datos: { id: number } }).datos.id}`); router.refresh(); } else setError(r.mensaje);
    })}>
      {cliente && <input type="hidden" name="id" value={cliente.id} />}
      {CAMPOS.map(([n, t, regla, tipo]) => <Campo key={n} nombre={n} etiqueta={t} regla={regla} type={tipo === "email" ? "text" : (tipo ?? "text")} inputMode={tipo === "email" ? "email" : undefined} defaultValue={cliente ? String(cliente[n] ?? "") : ""} requerido={n === "nombre"} />)}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="boton boton--primario" disabled={pendiente} type="submit">Guardar</button>
    </form>
  );
}
