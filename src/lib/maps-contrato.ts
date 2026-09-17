// Google Maps: solo UNA ficha por vez, leida de los meta del HTML inicial. Si Google cambia el
// formato, extraerFichaMaps devuelve null y el panel ofrece cargar a mano con el enlace como fuente.
// Coincidencia exacta del host o de un subdominio suyo (nunca "endsWith" pelado:
// eso dejaba pasar "evilgoogle.com" porque tambien termina en "google.com").
function esHostOSubdominio(h: string, base: string): boolean {
  return h === base || h.endsWith(`.${base}`);
}

export function esUrlMaps(url: string): boolean {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return false;
    const h = u.hostname.toLowerCase();
    return (esHostOSubdominio(h, "google.com") && u.pathname.startsWith("/maps")) || h === "maps.google.com" || h === "maps.app.goo.gl" || (h === "goo.gl" && u.pathname.startsWith("/maps"));
  } catch { return false; }
}

function meta(html: string, prop: string): string {
  const m = html.match(new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']*)["']`, "i")) ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${prop}["']`, "i"));
  return m ? m[1].replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"') : "";
}

// Dominios propios de Google (paginas, CDN de fotos, static assets, APIs) que
// nunca son la web del negocio, aunque aparezcan citados en el HTML inicial.
const DOMINIOS_GOOGLE = ["google.com", "googleusercontent.com", "gstatic.com", "ggpht.com", "maps.app.goo.gl", "goo.gl", "schema.org", "w3.org", "googleapis.com"];

function esDominioDeGoogle(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return DOMINIOS_GOOGLE.some((d) => h === d || h.endsWith(`.${d}`));
}

// Recorre TODAS las URLs citadas del HTML inicial y se queda con la primera
// que no sea de Google: asi no cae en el CDN de fotos (lh3.googleusercontent.com)
// ni en ningun otro dominio propio de Maps.
function extraerWeb(html: string): string {
  for (const m of html.matchAll(/"(https?:\/\/[^"\s]+)"/gi)) {
    let hostname: string;
    try { hostname = new URL(m[1]).hostname; } catch { continue; }
    if (!esDominioDeGoogle(hostname)) return m[1];
  }
  return "";
}

export function extraerFichaMaps(html: string): { nombre: string; direccion: string; telefono: string; web: string } | null {
  const titulo = meta(html, "og:title");
  if (!titulo) return null;
  const nombre = titulo.replace(/\s*[-–·]\s*Google Maps\s*$/i, "").trim();
  const direccion = meta(html, "og:description").trim();
  const tel = html.match(/"(\+58[\d\s().-]{7,20})"/);
  return { nombre, direccion, telefono: tel ? tel[1].trim() : "", web: extraerWeb(html) };
}
