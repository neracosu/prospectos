"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import type { Seccion } from "@/lib/navegacion-contrato";
import { Icono } from "@/componentes/Icono";

// Hoja que abre «Mas» en la barra inferior: las secciones que no caben en cuatro. Cierra con Escape, con el velo
// y al navegar; devuelve el foco al boton que la abrio (lo hace quien la monta, al desmontarla).
export function HojaMas({ secciones, onCerrar, onBuscar }: { secciones: Seccion[]; onCerrar: () => void; onBuscar?: () => void }) {
  const primera = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    primera.current?.focus();
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") onCerrar(); };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [onCerrar]);
  return (
    <>
      <div className="velo" onClick={onCerrar} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label="Más secciones" className="hoja">
        <ul className="hoja__lista">
          {onBuscar && <li><button type="button" className="hoja__item hoja__item--boton" onClick={() => { onCerrar(); onBuscar(); }}><Icono nombre="buscar" /><span>Buscar</span></button></li>}
          {secciones.map((s, i) => (
            <li key={s.href}>
              <Link ref={i === 0 ? primera : undefined} href={s.href} className="hoja__item" onClick={onCerrar}>
                <Icono nombre={s.icono} />
                <span>{s.texto}</span>
              </Link>
            </li>
          ))}
        </ul>
        <button type="button" className="boton hoja__cerrar" onClick={onCerrar}>Cerrar</button>
      </div>
    </>
  );
}
