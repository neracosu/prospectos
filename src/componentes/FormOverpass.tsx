"use client";
import { useState, useTransition } from "react";
import { buscarOverpass } from "@/acciones/buscar";
import { ResumenLote } from "./ResumenLote";

type Salida = { lote: string; nuevos: number; repetidos: number; errores: number; desdeCache: boolean; antiguedadDias: number };

// La consulta a OpenStreetMap tarda: hasta 90 s, mas 5 s de cola si hay otra en
// vuelo. El boton se apaga mientras tanto y el texto de espera dice cuanto,
// porque una pantalla quieta durante minuto y medio parece rota.
export function FormOverpass({
  nichos,
  ciudades,
}: {
  nichos: { id: number; nombre: string }[];
  ciudades: { slug: string; nombre: string }[];
}) {
  const [error, setError] = useState("");
  const [salida, setSalida] = useState<Salida | null>(null);
  const [pendiente, empezar] = useTransition();

  return (
    <>
      <form
        className="tarjeta"
        action={(fd) =>
          empezar(async () => {
            setError("");
            setSalida(null);
            const r = await buscarOverpass(fd);
            if (r.ok) setSalida(r.datos);
            else setError(r.mensaje);
          })
        }
      >
        <b>Buscar en el mapa</b>
        <p className="suave">
          Trae los negocios del nicho que están cargados en OpenStreetMap: nombre, dirección y, cuando el
          negocio los publicó, teléfono, web e Instagram. Una ciudad por vez.
        </p>
        <label className="campo">
          <span>Nicho</span>
          <select name="nichoId" required>
            {nichos.map((n) => (
              <option key={n.id} value={n.id}>
                {n.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Ciudad</span>
          <select name="ciudad" required>
            {ciudades.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="boton boton--primario" disabled={pendiente} type="submit">
          {pendiente ? "Consultando…" : "Buscar en OpenStreetMap"}
        </button>
        <p className="suave" role="status" aria-live="polite">
          {pendiente
            ? "Consultando OpenStreetMap: puede tardar hasta minuto y medio. No cierres esta pantalla."
            : "El resultado se guarda 7 días: la misma ciudad con el mismo nicho no se vuelve a consultar."}
        </p>
      </form>
      {salida && (
        <ResumenLote lote={salida.lote} nuevos={salida.nuevos} repetidos={salida.repetidos} errores={salida.errores}>
          {salida.desdeCache && (
            <p className="aviso">
              {salida.antiguedadDias > 0
                ? `Resultados de hace ${salida.antiguedadDias} ${salida.antiguedadDias === 1 ? "día" : "días"}: salieron de la consulta guardada.`
                : "Resultados de hoy: salieron de la consulta guardada."}
            </p>
          )}
        </ResumenLote>
      )}
    </>
  );
}
