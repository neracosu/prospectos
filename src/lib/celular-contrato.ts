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

// Hosts que de verdad son de cada red (con o sin www/m/web). Una URL de otro
// dominio no es un usuario de esta red: la web del negocio, un acortador o un
// enlace de WhatsApp guardados en la columna de Instagram se leen despues como si
// fueran el Instagram del negocio, y eso es un dato inventado.
const HOSTS_RED: Record<keyof typeof BASE_RED, RegExp> = {
  instagram: /^(?:www\.|m\.)?instagram\.com$/i,
  facebook: /^(?:www\.|m\.|web\.)?(?:facebook\.com|fb\.com|fb\.me)$/i,
  tiktok: /^(?:www\.|m\.|vm\.|vt\.)?tiktok\.com$/i,
};

// Los enlaces cortos de TikTok (vm./vt.) no llevan el usuario: el trozo que traen
// es el codigo del enlace ("ZMabc123"), asi que armar "@ZMabc123" seria inventar
// una cuenta que no existe. Se guardan tal cual, que es un enlace que si lleva al
// negocio; resolverlos pediria salir a la red desde una funcion pura.
const CORTOS_TIKTOK = /^(?:vm|vt)\.tiktok\.com$/i;

export function normalizarRed(valor: string, red: keyof typeof BASE_RED): string {
  const v = (valor ?? "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) {
    let u: URL;
    try {
      u = new URL(v);
    } catch {
      return "";
    }
    if (!HOSTS_RED[red].test(u.hostname)) return "";
    if (red === "tiktok" && CORTOS_TIKTOK.test(u.hostname)) return u.toString();
    // Del pathname, nunca de la URL entera: asi se cae solo el "?igsh=..." que
    // pega Instagram al compartir y dos veces el mismo perfil no son dos valores.
    const usuario = decodeURIComponent(u.pathname).replace(/^\/+/, "").replace(/\/+$/, "").replace(/^@/, "");
    return usuario ? BASE_RED[red](usuario) : "";
  }
  // Sin protocolo hay dos formas distintas: un dominio con camino
  // ("instagram.com/hotelx", "mi-sitio.com/x") y un usuario suelto ("hotel.yare").
  // Se mira si lo que va antes de la primera barra parece un host: si lo parece,
  // se trata como URL (y ahi se aplica el filtro de dominio de arriba); si no, es
  // un usuario. Un usuario con punto y sin barra sigue siendo un usuario.
  const barra = v.indexOf("/");
  if (barra > 0 && v.slice(0, barra).includes(".")) return normalizarRed("https://" + v, red);
  const usuario = v.replace(/^@/, "").replace(/\/+$/, "");
  return usuario ? BASE_RED[red](usuario) : "";
}
