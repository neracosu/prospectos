// src/componentes/Pestanas.tsx — enlaces con ?t=, sin estado cliente.
import Link from "next/link";

export function Pestanas({ base, activa, items }: { base: string; activa: string; items: { clave: string; texto: string }[] }) {
  return (
    <nav className="pestanas" aria-label="Secciones del proyecto">
      {items.map((i) => (
        <Link key={i.clave} href={`${base}?t=${i.clave}`} className={"pestanas__item" + (i.clave === activa ? " activa" : "")} aria-current={i.clave === activa ? "page" : undefined}>
          {i.texto}
        </Link>
      ))}
    </nav>
  );
}
