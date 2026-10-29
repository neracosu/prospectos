// src/lib/navegacion-contrato.ts — las secciones del panel por rol (panel CRM, fase 1, 29-oct-2026). Puro: lo usan
// la barra lateral (escritorio), la barra inferior con «Mas» (telefono) y los tests. Desde la fase 3 Cobros es
// seccion propia y va entre las cuatro fijas del telefono (Inicio · Leads · Solicitudes · Cobros · Mas).
export type Rol = "dueno" | "prospectador";
export type Icono = "inicio" | "leads" | "solicitudes" | "cobros" | "proyectos" | "directorio" | "web" | "ajustes" | "pin";
export type Seccion = { href: string; texto: string; icono: Icono };

const S = {
  inicio: { href: "/inicio", texto: "Inicio", icono: "inicio" },
  leads: { href: "/leads", texto: "Leads", icono: "leads" },
  solicitudes: { href: "/solicitudes", texto: "Solicitudes", icono: "solicitudes" },
  cobros: { href: "/cobros", texto: "Cobros", icono: "cobros" },
  proyectos: { href: "/proyectos", texto: "Proyectos", icono: "proyectos" },
  directorio: { href: "/directorio", texto: "Directorio", icono: "directorio" },
  web: { href: "/web", texto: "Web", icono: "web" },
  ajustes: { href: "/ajustes", texto: "Ajustes", icono: "ajustes" },
  pin: { href: "/ajustes/mi-pin", texto: "Mi PIN", icono: "pin" },
} as const satisfies Record<string, Seccion>;

// Barra lateral: todo lo que el rol puede abrir, en el orden de trabajo.
export function seccionesPara(rol: Rol): Seccion[] {
  return rol === "dueno"
    ? [S.inicio, S.leads, S.solicitudes, S.cobros, S.proyectos, S.directorio, S.web, S.ajustes]
    : [S.inicio, S.leads, S.directorio, S.pin];
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
  // La ficha de una fila del directorio sigue viviendo en /prospectos/<id> (fase 2)
  if (href === "/directorio" && (ruta.startsWith("/prospectos/") || ruta.startsWith("/buscar"))) return true;
  if (href === "/ajustes" && (ruta === "/ajustes/mi-pin" || ruta.startsWith("/ajustes/mi-pin/"))) return false;
  return ruta === href || ruta.startsWith(href + "/");
}

// Enlaces guardados y start_url viejos siguen vivos.
export const RUTAS_VIEJAS: Record<string, string> = { "/hoy": "/inicio", "/prospectos": "/directorio?t=lista", "/buscar": "/directorio?t=buscar" };
