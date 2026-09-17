"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";

// Lo que dejo una busqueda o una importacion, antes de abrir la bandeja. Se
// muestra en la misma pantalla en vez de saltar derecho al lote: saltando en el
// mismo tic se pierden los avisos que solo se pueden dar aqui (las columnas
// ignoradas, la antiguedad de la cache) y nadie se entera de cuanto entro.
export function ResumenLote({
  lote,
  nuevos,
  repetidos,
  errores,
  children,
}: {
  lote: string;
  nuevos: number;
  repetidos: number;
  errores: number;
  children?: React.ReactNode;
}) {
  const total = nuevos + repetidos + errores;
  const caja = useRef<HTMLElement>(null);
  // El resumen aparece debajo de un formulario largo: si no se lleva el foco y
  // la vista, en el telefono nadie se entera de que ya termino. Salta de lote a
  // lote, no en cada render.
  useEffect(() => {
    caja.current?.focus();
    caja.current?.scrollIntoView({ block: "start" });
  }, [lote]);
  return (
    <section className="tarjeta" ref={caja} tabIndex={-1}>
      <b>
        {total} {total === 1 ? "ficha encontrada" : "fichas encontradas"}
      </b>
      <dl className="datos">
        <dt>Nuevas</dt>
        <dd>{nuevos}</dd>
        {repetidos > 0 && (
          <>
            <dt>Ya estaban</dt>
            <dd>{repetidos}</dd>
          </>
        )}
        {errores > 0 && (
          <>
            <dt>Con problemas</dt>
            <dd>{errores}</dd>
          </>
        )}
      </dl>
      {children}
      <p className="suave">Nada entra al panel hasta que lo apruebes una por una en la bandeja.</p>
      <div className="fila-botones">
        <Link className="boton boton--primario" href={`/buscar?t=bandeja&lote=${lote}`}>
          Revisar en la bandeja
        </Link>
      </div>
    </section>
  );
}
