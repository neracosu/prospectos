// Mismo criterio que ~/propuestas/hoteles/prospectos/armar.py (moviles):
// celulares venezolanos 0412/0414/0416/0424/0426/0422, a 58XXXXXXXXXX.
const CELULAR = /(?:\+?58[\s.\-]*)?\(?0?(4(?:12|14|16|24|26|22))\)?[\s.\-]*(\d{3})[\s.\-]*(\d{2})[\s.\-]*(\d{2})/;

export function normalizarCelular(texto: string): string {
  const m = CELULAR.exec(texto ?? "");
  return m ? `58${m[1]}${m[2]}${m[3]}${m[4]}` : "";
}

const BASE_RED = {
  instagram: (u: string) => `https://www.instagram.com/${u}/`,
  facebook: (u: string) => `https://www.facebook.com/${u}`,
  tiktok: (u: string) => `https://www.tiktok.com/@${u}`,
} as const;

export function normalizarRed(valor: string, red: keyof typeof BASE_RED): string {
  const v = (valor ?? "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  const usuario = v.replace(/^@/, "").replace(/\/+$/, "");
  return usuario ? BASE_RED[red](usuario) : "";
}
