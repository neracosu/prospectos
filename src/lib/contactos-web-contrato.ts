import { normalizarCelular } from "@/lib/celular-contrato";

const unicos = (xs: string[]) => [...new Set(xs)];

// Lee UNA pagina publicada por el negocio y saca lo que el mismo publico.
export function extraerContactos(html: string, urlBase: string): { emails: string[]; celulares: string[]; instagram: string[]; facebook: string[]; tiktok: string[] } {
  if (!html) return { emails: [], celulares: [], instagram: [], facebook: [], tiktok: [] };
  const emails = unicos([...html.matchAll(/(?:mailto:)?([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g)].map((m) => m[1].toLowerCase()).filter((e) => !/\.(png|jpe?g|gif|svg|webp)$/i.test(e)));
  const celulares: string[] = [];
  for (const m of html.matchAll(/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)\+?(\d{10,13})/g)) { const c = normalizarCelular(m[1]); if (c) celulares.push(c); }
  const texto = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, " ");
  for (const m of texto.matchAll(/(?:\+?58[\s.\-]*)?\(?0?4(?:12|14|16|24|26|22)\)?[\s.\-]*\d{3}[\s.\-]*\d{2}[\s.\-]*\d{2}/g)) { const c = normalizarCelular(m[0]); if (c) celulares.push(c); }
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => { try { return new URL(m[1], urlBase).toString(); } catch { return ""; } }).filter(Boolean);
  const instagram = unicos(hrefs.filter((h) => /^https?:\/\/(www\.)?instagram\.com\/[A-Za-z0-9_.]+\/?$/.test(h) && !/\/(p|reel|explore)\//.test(h)));
  const facebook = unicos(hrefs.filter((h) => /^https?:\/\/(www\.|m\.)?facebook\.com\/[A-Za-z0-9_.]+\/?$/.test(h) && !/sharer|share\.php|login/.test(h)));
  const tiktok = unicos(hrefs.filter((h) => /^https?:\/\/(www\.)?tiktok\.com\/@[A-Za-z0-9_.]+\/?$/.test(h)));
  return { emails, celulares: unicos(celulares), instagram, facebook, tiktok };
}
