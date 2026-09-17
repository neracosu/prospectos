import { normalizarCelular } from "@/lib/celular-contrato";

const unicos = (xs: string[]) => [...new Set(xs)];

// Lee UNA pagina publicada por el negocio y saca lo que el mismo publico.
// Aplica un patron a cada href y devuelve la URL SIN parametros de consulta
// (?hl=en, ?utm_...): el patron solo exige que el path sea un unico segmento,
// asi que /p/, /sharer/, etc. ya quedan fuera sin necesidad del excluir; el
// excluir es una segunda barrera explicita para los casos citados en el brief.
function limpiarRed(hrefs: string[], patron: RegExp, excluir?: RegExp): string[] {
  const salida: string[] = [];
  for (const h of hrefs) {
    const m = h.match(patron);
    if (!m) continue;
    if (excluir && excluir.test(h)) continue;
    salida.push(m[1]);
  }
  return unicos(salida);
}

export function extraerContactos(html: string, urlBase: string): { emails: string[]; celulares: string[]; instagram: string[]; facebook: string[]; tiktok: string[] } {
  if (!html) return { emails: [], celulares: [], instagram: [], facebook: [], tiktok: [] };
  const texto = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, " ");
  // Correos: solo de un mailto: explicito o del texto visible (sin scripts/estilos),
  // nunca del HTML crudo completo, o un tracker de analitica en un <script> se cuela.
  const emailsBrutos: string[] = [];
  for (const m of html.matchAll(/href=["']mailto:([^"'?]+)(?:\?[^"']*)?["']/gi)) emailsBrutos.push(m[1]);
  for (const m of texto.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) emailsBrutos.push(m[0]);
  const emails = unicos(emailsBrutos.map((e) => e.toLowerCase()).filter((e) => !/\.(png|jpe?g|gif|svg|webp)$/i.test(e)));
  const celulares: string[] = [];
  for (const m of html.matchAll(/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)\+?(\d{10,13})/g)) { const c = normalizarCelular(m[1]); if (c) celulares.push(c); }
  for (const m of texto.matchAll(/(?:\+?58[\s.\-]*)?\(?0?4(?:12|14|16|24|26|22)\)?[\s.\-]*\d{3}[\s.\-]*\d{2}[\s.\-]*\d{2}/g)) { const c = normalizarCelular(m[0]); if (c) celulares.push(c); }
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => { try { return new URL(m[1], urlBase).toString(); } catch { return ""; } }).filter(Boolean);
  const instagram = limpiarRed(hrefs, /^(https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.]+\/?)(?:\?.*)?$/, /\/(p|reel|explore)\//);
  const facebook = limpiarRed(hrefs, /^(https?:\/\/(?:www\.|m\.)?facebook\.com\/[A-Za-z0-9_.]+\/?)(?:\?.*)?$/, /sharer|share\.php|login/);
  const tiktok = limpiarRed(hrefs, /^(https?:\/\/(?:www\.)?tiktok\.com\/@[A-Za-z0-9_.]+\/?)(?:\?.*)?$/);
  return { emails, celulares: unicos(celulares), instagram, facebook, tiktok };
}
