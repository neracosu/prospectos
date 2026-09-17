"use client";
import { useState, useTransition } from "react";
import { importarTexto, importarArchivo } from "@/acciones/buscar";
import { ResumenLote } from "./ResumenLote";

type Salida = { lote: string; nuevos: number; repetidos: number; errores: number; desconocidas: string[] };
type Cual = "archivo" | "texto";
type Resultado = { cual: Cual; datos: Salida };

// Dos caminos con la misma gramatica: un archivo o unas filas pegadas desde
// Excel. Los dos terminan en la bandeja, asi que el resultado se muestra igual.
export function FormImportar() {
  const [error, setError] = useState<{ cual: Cual; mensaje: string } | null>(null);
  const [salida, setSalida] = useState<Resultado | null>(null);
  const [corriendo, setCorriendo] = useState<Cual | null>(null);
  const [pendiente, empezar] = useTransition();

  const correr = (cual: Cual, fn: () => Promise<{ ok: true; datos: Salida } | { ok: false; mensaje: string }>) =>
    empezar(async () => {
      setError(null);
      setSalida(null);
      setCorriendo(cual);
      const r = await fn();
      setCorriendo(null);
      if (r.ok) setSalida({ cual, datos: r.datos });
      else setError({ cual, mensaje: r.mensaje });
    });

  return (
    <>
      <section className="tarjeta">
        <b>Plantilla</b>
        <p className="suave">
          Descárgala, llénala con datos que el negocio publica y con la dirección donde los publica, y
          súbela acá.
        </p>
        <div className="fila-botones">
          <a className="boton" href="/buscar/plantilla?formato=xlsx">
            Excel (.xlsx)
          </a>
          <a className="boton" href="/buscar/plantilla?formato=csv">
            CSV
          </a>
        </div>
      </section>

      <form className="tarjeta" action={(fd) => correr("archivo", () => importarArchivo(fd))}>
        <b>Subir un archivo</b>
        <label className="campo">
          <span>.xlsx, .csv o .txt — hasta 5 MB y 5.000 filas</span>
          <input
            name="archivo"
            type="file"
            accept=".xlsx,.csv,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
          />
        </label>
        {error?.cual === "archivo" && (
          <p className="error" role="alert">
            {error.mensaje}
          </p>
        )}
        <button className="boton boton--primario" disabled={pendiente} type="submit">
          {corriendo === "archivo" ? "Leyendo el archivo…" : "Subir el archivo"}
        </button>
      </form>

      {salida?.cual === "archivo" && (
        <ResumenLote
          lote={salida.datos.lote}
          nuevos={salida.datos.nuevos}
          repetidos={salida.datos.repetidos}
          errores={salida.datos.errores}
        >
          {salida.datos.desconocidas.length > 0 && (
            <p className="aviso">
              Estas columnas no se entienden y quedaron afuera: {salida.datos.desconocidas.join(", ")}.
            </p>
          )}
        </ResumenLote>
      )}

      <form className="tarjeta" action={(fd) => correr("texto", () => importarTexto(fd))}>
        <b>O pegar filas desde Excel</b>
        <label className="campo">
          <span>La primera fila son los encabezados: nicho, nombre, ciudad, whatsapp, fuente…</span>
          <textarea
            name="texto"
            rows={6}
            placeholder={"nicho\tnombre\tciudad\twhatsapp\nhoteles\tHotel Ejemplo\tCaracas\t0412 555 12 34"}
          />
        </label>
        {error?.cual === "texto" && (
          <p className="error" role="alert">
            {error.mensaje}
          </p>
        )}
        <button className="boton boton--primario" disabled={pendiente} type="submit">
          {corriendo === "texto" ? "Leyendo las filas…" : "Revisar las filas"}
        </button>
      </form>

      {salida?.cual === "texto" && (
        <ResumenLote
          lote={salida.datos.lote}
          nuevos={salida.datos.nuevos}
          repetidos={salida.datos.repetidos}
          errores={salida.datos.errores}
        >
          {salida.datos.desconocidas.length > 0 && (
            <p className="aviso">
              Estas columnas no se entienden y quedaron afuera: {salida.datos.desconocidas.join(", ")}.
            </p>
          )}
        </ResumenLote>
      )}
    </>
  );
}
