// src/componentes/Pestanas.tsx — enlaces con ?t=, sin estado cliente.
import Link from "next/link";

export function Pestanas({ base, activa, items, etiqueta = "Secciones del proyecto" }: { base: string; activa: string; items: { clave: string; texto: string }[]; etiqueta?: string }) {
  return (
    <nav className="pestanas" aria-label={etiqueta}>
      {items.map((i) => (
        <Link key={i.clave} href={`${base}?t=${i.clave}`} className={"pestanas__item" + (i.clave === activa ? " activa" : "")} aria-current={i.clave === activa ? "page" : undefined}>
          {i.texto}
        </Link>
      ))}
    </nav>
  );
}
