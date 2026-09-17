import Link from "next/link";

// Cabecera del portal del cliente. "Salir" es un enlace normal a la ruta que borra la cookie.
export function PortalBarra({ codigo, activa }: { codigo: string; activa?: "inicio" | "contacto" }) {
  const base = `/c/${codigo}`;
  return (
    <header className="portal__barra">
      <Link className="portal__logo" href={`${base}/inicio`} aria-label="NERACOSU, ir al inicio">NERACOSU<i>.</i></Link>
      <nav className="portal__nav" aria-label="Portal">
        <Link href={`${base}/inicio`} aria-current={activa === "inicio" ? "page" : undefined}>Inicio</Link>
        <Link href={`${base}/contacto`} aria-current={activa === "contacto" ? "page" : undefined}>Contacto</Link>
        <a href={`${base}/salir`}>Salir</a>
      </nav>
    </header>
  );
}
