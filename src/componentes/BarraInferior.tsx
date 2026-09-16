"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Hoy · Prospectos · Buscar · Proyectos · Ajustes. Buscar se activa en la
// pieza 4; hasta entonces va deshabilitado. El prospectador no ve Proyectos
// ni Ajustes (solo "Mi PIN").
export function BarraInferior({ rol }: { rol: "dueno" | "prospectador" }) {
  const ruta = usePathname();
  const items = [
    { href: "/hoy", texto: "Hoy" },
    { href: "/prospectos", texto: "Prospectos" },
    { href: "/buscar", texto: "Buscar", pronto: true },
    ...(rol === "dueno" ? [{ href: "/proyectos", texto: "Proyectos" }, { href: "/ajustes", texto: "Ajustes" }] : [{ href: "/ajustes/mi-pin", texto: "Mi PIN" }]),
  ];
  return (
    <nav className="barra" aria-label="Secciones">
      {items.map((i) =>
        i.pronto ? (
          <span key={i.href} className="barra__item barra__item--pronto" aria-disabled="true">{i.texto}</span>
        ) : (
          <Link key={i.href} href={i.href} className={"barra__item" + (ruta.startsWith(i.href) ? " activo" : "")}>{i.texto}</Link>
        ),
      )}
    </nav>
  );
}
