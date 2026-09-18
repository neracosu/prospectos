"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearProspecto } from "@/acciones/prospectos";
import { TOPES } from "@/lib/tabla-contrato";
import { Campo } from "./Campo";
import type { Regla } from "@/lib/validacion-contrato";

// Las reglas copian las de crearProspecto (src/acciones/prospectos.ts): el servidor sigue mandando.
// Web, redes y fuente no exigen http:// porque el servidor tampoco.
const CAMPOS: [string, string, Regla, string?][] = [
  ["nombre", "Nombre del negocio", { tipo: "texto", min: 2, max: TOPES.nombre }], ["ciudad", "Ciudad", { tipo: "texto", min: 2, max: TOPES.ciudad }],
  ["estado", "Estado", { tipo: "texto", max: TOPES.estado }], ["tipo", "Tipo", { tipo: "texto", max: 60 }], ["tamano", "Tamaño (ej. 20 hab.)", { tipo: "texto", max: 40 }],
  ["telefono", "Teléfono(s)", { tipo: "texto", max: 80 }, "tel"], ["whatsapp", "WhatsApp", { tipo: "texto", max: 40 }, "tel"], ["email", "Correo", { tipo: "correo" }, "email"],
  ["web", "Web", { tipo: "texto", max: 200 }, "url"], ["instagram", "Instagram", { tipo: "texto", max: 200 }], ["facebook", "Facebook", { tipo: "texto", max: 200 }],
  ["tiktok", "TikTok", { tipo: "texto", max: 200 }], ["fuente", "Fuente (URL donde publican el contacto)", { tipo: "texto", max: 300 }, "url"],
];

// `valores` llega desde la pantalla servidor con lo que traiga la URL: es el
// camino de "cargarlo a mano" cuando no se pudo leer una ficha de Google Maps.
// La fuente prellenada se ve y no se edita (viene del enlace que se leyo), pero
// va en el formulario: un readOnly si se envia, un disabled no.
export type ValoresNuevo = { fuente?: string; nombre?: string; web?: string; telefono?: string; nota?: string; nichoId?: number };

export function FormularioNuevo({ nichos, valores = {} }: { nichos: { id: number; nombre: string }[]; valores?: ValoresNuevo }) {
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
  const fuenteFija = (valores.fuente ?? "").trim();
  const inicial: Record<string, string> = {
    nombre: valores.nombre ?? "", web: valores.web ?? "", telefono: valores.telefono ?? "", fuente: fuenteFija,
  };
  return (
    // autoComplete off: son datos del negocio, no de quien escribe; rellenar el telefono de Neri aqui seria un dato falso.
    <form className="tarjeta" autoComplete="off" action={(fd) => empezar(async () => { const r = await crearProspecto(fd); if (r.ok) router.push(`/prospectos/${r.datos.id}`); else setError(r.mensaje); })}>
      <label className="campo"><span>Nicho</span><select name="nichoId" required defaultValue={valores.nichoId ?? nichos[0]?.id}>{nichos.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}</select></label>
      {CAMPOS.map(([n, t, regla, tipo]) => (
        <Campo key={n} nombre={n} etiqueta={n === "fuente" && fuenteFija ? "Fuente (del enlace que se leyó)" : t} regla={regla}
          requerido={n === "nombre" || n === "ciudad"}
          // type="url" nativo exigiria http://, que el servidor no exige: web y fuente van como texto.
          type={tipo === "url" ? "text" : (tipo ?? "text")} inputMode={tipo === "url" ? "url" : undefined}
          defaultValue={inicial[n] ?? ""} readOnly={n === "fuente" && !!fuenteFija} />
      ))}
      <Campo nombre="nota" etiqueta="Nota interna" control="textarea" regla={{ tipo: "texto", max: 2000 }} rows={3} defaultValue={valores.nota ?? ""} />
      <p className="suave">Solo datos que el negocio publicó. Nada de contactos personales.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="boton boton--primario" disabled={pendiente} type="submit">Guardar</button>
    </form>
  );
}
