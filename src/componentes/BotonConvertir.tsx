"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { convertirSolicitud } from "@/acciones/leads";

// Una solicitud de la web o del embudo se vuelve lead con un toque y abre su ficha.
export function BotonConvertir({ id }: { id: number }) {
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
  return (
    <>
      <button type="button" className="boton boton--primario mini" disabled={pendiente} onClick={() => { setError(""); empezar(async () => { const r = await convertirSolicitud(id); if (r.ok) router.push(`/leads/${r.datos.id}`); else setError(r.mensaje); }); }}>
        {pendiente ? "Convirtiendo…" : "Convertir en lead"}
      </button>
      {error && <span className="error" role="alert">{error}</span>}
    </>
  );
}
