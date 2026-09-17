// Google Maps: solo UNA ficha por vez, leida de los meta del HTML inicial. Si Google cambia el
// formato, extraerFichaMaps devuelve null y el panel ofrece cargar a mano con el enlace como fuente.
export function esUrlMaps(url: string): boolean {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return false;
    const h = u.hostname.toLowerCase();
    return (h.endsWith("google.com") && u.pathname.startsWith("/maps")) || h === "maps.google.com" || h === "maps.app.goo.gl" || (h === "goo.gl" && u.pathname.startsWith("/maps"));
  } catch { return false; }
}

function meta(html: string, prop: string): string {
  const m = html.match(new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']*)["']`, "i")) ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${prop}["']`, "i"));
  return m ? m[1].replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"') : "";
}

export function extraerFichaMaps(html: string): { nombre: string; direccion: string; telefono: string; web: string } | null {
  const titulo = meta(html, "og:title");
  if (!titulo) return null;
  const nombre = titulo.replace(/\s*[-–·]\s*Google Maps\s*$/i, "").trim();
  const direccion = meta(html, "og:description").trim();
  const tel = html.match(/"(\+58[\d\s().-]{7,20})"/);
  const web = html.match(/"(https?:\/\/(?!(?:www\.)?google\.|maps\.|schema\.org|gstatic|ggpht|googleusercontent)[^"\s]+\.[a-z]{2,}[^"\s]*)"/i);
  return { nombre, direccion, telefono: tel ? tel[1].trim() : "", web: web ? web[1] : "" };
}
