// src/lib/navegacion-contrato.ts — las secciones del panel por rol (panel CRM, fase 1, 29-oct-2026). Puro: lo usan
// la barra lateral (escritorio), la barra inferior con «Mas» (telefono) y los tests. Las rutas de las fases
// siguientes (/leads, /cobros, /directorio) no existen todavia: aqui solo va lo que ya se puede abrir.
export type Rol = "dueno" | "prospectador";
export type Icono = "inicio" | "prospectos" | "solicitudes" | "proyectos" | "buscar" | "web" | "ajustes" | "pin";
export type Seccion = { href: string; texto: string; icono: Icono };

const S = {
  inicio: { href: "/inicio", texto: "Inicio", icono: "inicio" },
  prospectos: { href: "/prospectos", texto: "Prospectos", icono: "prospectos" },
  solicitudes: { href: "/solicitudes", texto: "Solicitudes", icono: "solicitudes" },
  proyectos: { href: "/proyectos", texto: "Proyectos", icono: "proyectos" },
  buscar: { href: "/buscar", texto: "Buscar", icono: "buscar" },
  web: { href: "/web", texto: "Web", icono: "web" },
  ajustes: { href: "/ajustes", texto: "Ajustes", icono: "ajustes" },
  pin: { href: "/ajustes/mi-pin", texto: "Mi PIN", icono: "pin" },
} as const satisfies Record<string, Seccion>;

// Barra lateral: todo lo que el rol puede abrir, en el orden de trabajo.
export function seccionesPara(rol: Rol): Seccion[] {
  return rol === "dueno"
    ? [S.inicio, S.prospectos, S.solicitudes, S.proyectos, S.buscar, S.web, S.ajustes]
    : [S.inicio, S.prospectos, S.buscar, S.pin];
}

// Barra inferior: hasta cuatro fijas; lo demas detras de «Mas» (una hoja). El prospectador cabe sin «Mas».
export function barraPara(rol: Rol): { fijas: Seccion[]; mas: Seccion[] } {
  const todas = seccionesPara(rol);
  if (rol === "dueno") return { fijas: todas.slice(0, 4), mas: todas.slice(4) };
  return { fijas: todas, mas: [] };
}

// Activa = la seccion cuyo href es prefijo de la ruta. /inicio solo exacta. /ajustes no se lleva /ajustes/mi-pin,
// que es seccion propia del prospectador (la coincidencia mas larga gana).
export function estaActiva(ruta: string, href: string): boolean {
  if (href === "/inicio") return ruta === "/inicio";
  if (href === "/ajustes" && (ruta === "/ajustes/mi-pin" || ruta.startsWith("/ajustes/mi-pin/"))) return false;
  return ruta === href || ruta.startsWith(href + "/");
}

// Enlaces guardados y start_url viejos siguen vivos.
export const RUTAS_VIEJAS: Record<string, string> = { "/hoy": "/inicio" };
