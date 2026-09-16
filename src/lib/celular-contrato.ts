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

const DOMINIO_RED: Record<keyof typeof BASE_RED, string> = {
  instagram: "instagram.com",
  facebook: "facebook.com",
  tiktok: "tiktok.com",
};

// Si `v` empieza por el dominio de esta red (con o sin protocolo, con o sin
// www), devuelve lo que sigue despues de la barra; si no, null.
function trasDominio(v: string, dominio: string): string | null {
  const re = new RegExp(`^(?:https?:\\/\\/)?(?:www\\.)?${dominio.replace(/\./g, "\\.")}\\/+`, "i");
  const m = re.exec(v);
  return m ? v.slice(m[0].length) : null;
}

// Acepta @usuario, usuario suelto, o la URL completa en cualquier forma
// (con/sin protocolo, con/sin www, con/sin barra final) y siempre devuelve la
// URL canonica. Una URL con protocolo que NO es de esta red (la web propia
// del negocio, por ejemplo) se deja tal cual: no hay usuario que extraerle.
export function normalizarRed(valor: string, red: keyof typeof BASE_RED): string {
  const v = (valor ?? "").trim();
  if (!v) return "";
  const resto = trasDominio(v, DOMINIO_RED[red]);
  if (resto === null) {
    if (/^https?:\/\//i.test(v)) return v;
    const usuario = v.replace(/^@/, "").replace(/\/+$/, "");
    return usuario ? BASE_RED[red](usuario) : "";
  }
  const usuario = resto.replace(/^@/, "").replace(/\/+$/, "");
  return usuario ? BASE_RED[red](usuario) : "";
}
