"use client";
import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { barraPara, estaActiva, type Rol } from "@/lib/navegacion-contrato";
import { HojaMas } from "@/componentes/HojaMas";
import { abrirBusqueda } from "@/componentes/BusquedaGlobal";
import { Icono } from "@/componentes/Icono";

// Barra inferior del telefono (hasta 1023 px): cuatro secciones fijas y «Mas» con el resto (panel CRM, fase 1).
// El prospectador cabe en cuatro, sin «Mas». Las secciones salen de navegacion-contrato.ts.
export function BarraInferior({ rol }: { rol: Rol }) {
  const ruta = usePathname();
  const { fijas, mas } = barraPara(rol);
  const [abierta, setAbierta] = useState(false);
  const botonMas = useRef<HTMLButtonElement>(null);
  const cerrar = useCallback(() => { setAbierta(false); requestAnimationFrame(() => botonMas.current?.focus()); }, []);
  const enMas = mas.some((s) => estaActiva(ruta, s.href));
  return (
    <>
      <nav className="barra" aria-label="Secciones">
        {fijas.map((s) => {
          const activa = estaActiva(ruta, s.href);
          return (
            <Link key={s.href} href={s.href} className={"barra__item" + (activa ? " activo" : "")} aria-current={activa ? "page" : undefined}>
              <Icono nombre={s.icono} />
              <span>{s.texto}</span>
            </Link>
          );
        })}
        {mas.length > 0 && (
          <button ref={botonMas} type="button" className={"barra__item barra__mas" + (enMas ? " activo" : "")} aria-haspopup="dialog" aria-expanded={abierta} onClick={() => setAbierta((a) => !a)}>
            <Icono nombre="mas" />
            <span>Más</span>
          </button>
        )}
      </nav>
      {abierta && <HojaMas secciones={mas} onCerrar={cerrar} onBuscar={abrirBusqueda} />}
    </>
  );
}
