import type { Icono as NombreIcono } from "@/lib/navegacion-contrato";

// Iconos de linea de 20 px para la navegacion. Decorativos (aria-hidden): el texto va al lado.
const TRAZOS: Record<NombreIcono | "mas", string> = {
  inicio: "M3 11 12 3l9 8M5 10v10h5v-6h4v6h5V10",
  leads: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  solicitudes: "M4 4h16v12H7l-3 3zM8 9h8M8 12h5",
  cobros: "M3 6h18v12H3zM3 10h18M7 15h3",
  buscar: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-4-4",
  proyectos: "M3 7h18v13H3zM8 7V4h8v3M3 12h18",
  directorio: "M4 4h16v16H4zM4 9h16M4 14h16M9 4v16",
  web: "M3 3v18h18M7 15l4-4 3 3 5-6",
  ajustes: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1",
  pin: "M12 2a5 5 0 0 1 5 5v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1V7a5 5 0 0 1 5-5M9 10h6V7a3 3 0 0 0-6 0z",
  mas: "M5 12h.01M12 12h.01M19 12h.01",
};

export function Icono({ nombre }: { nombre: NombreIcono | "mas" }) {
  return (
    <svg className="icono" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={TRAZOS[nombre]} />
    </svg>
  );
}
