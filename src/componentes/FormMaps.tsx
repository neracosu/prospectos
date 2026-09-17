"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { cargarMaps } from "@/acciones/buscar";

// Una ficha por vez. No se barre Google: se lee el enlace que alguien pego o
// compartio desde el telefono, y nada mas.
export function FormMaps({ nichos, urlInicial }: { nichos: { id: number; nombre: string }[]; urlInicial: string }) {
  const [error, setError] = useState("");
  const [lote, setLote] = useState("");
  const [manual, setManual] = useState("");
  const [pendiente, empezar] = useTransition();

  return (
    <>
      <form
        className="tarjeta"
        action={(fd) =>
          empezar(async () => {
            setError("");
            setLote("");
            setManual("");
            const r = await cargarMaps(fd);
            if (!r.ok) return setError(r.mensaje);
            if ("manual" in r.datos) setManual(r.datos.url);
            else setLote(r.datos.lote);
          })
        }
      >
        <b>Leer una ficha de Google Maps</b>
        <p className="suave">
          Pega el enlace de <b>una</b> ficha, o compártela desde el teléfono a esta app. Se lee esa ficha y
          nada más.
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
          <span>Enlace de Google Maps</span>
          <input
            name="url"
            type="url"
            defaultValue={urlInicial}
            placeholder="https://maps.app.goo.gl/…"
            maxLength={2000}
            required
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="boton boton--primario" disabled={pendiente} type="submit">
          {pendiente ? "Leyendo la ficha…" : "Leer la ficha"}
        </button>
      </form>
      {lote && (
        <section className="tarjeta">
          <b>Ficha leída</b>
          <p className="suave">
            Quedó en la bandeja con el enlace como fuente. Revísala antes de que entre al panel.
          </p>
          <div className="fila-botones">
            <Link className="boton boton--primario" href={`/buscar?t=bandeja&lote=${lote}`}>
              Revisar en la bandeja
            </Link>
          </div>
        </section>
      )}
      {manual && (
        <section className="tarjeta">
          <b>No se pudo leer esa ficha</b>
          <p className="suave">
            Google cambia el formato de sus páginas seguido. Cárgalo a mano: el enlace queda puesto como
            fuente y solo tienes que copiar lo que ves en la ficha.
          </p>
          <div className="fila-botones">
            <Link className="boton boton--primario" href={`/prospectos/nuevo?fuente=${encodeURIComponent(manual)}`}>
              Cargarlo a mano
            </Link>
            <a className="boton" href={manual} target="_blank" rel="noopener">
              Abrir en Maps
            </a>
          </div>
        </section>
      )}
    </>
  );
}
