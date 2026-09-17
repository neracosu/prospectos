"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Hoy · Prospectos · Buscar · Proyectos · Ajustes. Buscar entro con la pieza 2 y
// lo usan los dos roles. El prospectador no ve Proyectos ni Ajustes (solo
// "Mi PIN").
export function BarraInferior({ rol }: { rol: "dueno" | "prospectador" }) {
  const ruta = usePathname();
  const items = [
    { href: "/hoy", texto: "Hoy" },
    { href: "/prospectos", texto: "Prospectos" },
    { href: "/buscar", texto: "Buscar" },
    ...(rol === "dueno" ? [{ href: "/proyectos", texto: "Proyectos" }, { href: "/ajustes", texto: "Ajustes" }] : [{ href: "/ajustes/mi-pin", texto: "Mi PIN" }]),
  ];
  return (
    <nav className="barra" aria-label="Secciones">
      {items.map((i) => (
        <Link key={i.href} href={i.href} className={"barra__item" + (ruta.startsWith(i.href) ? " activo" : "")}>{i.texto}</Link>
      ))}
    </nav>
  );
}
