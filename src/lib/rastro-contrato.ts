// src/lib/rastro-contrato.ts — rastro de enlaces a prospectos. Puro: parsea el access-log, clasifica user-agents
// y calcula visitante, huella y prefijos. Sin I/O ni base de datos, para probarlo sin nada levantado.
import { createHash } from "node:crypto";
import { hoyCaracas } from "@/lib/fecha-caracas";

export type LineaLog = { ip: string; fecha: Date; metodo: string; ruta: string; estado: number; referer: string; ua: string };

const MESES: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
// combined: ip - - [fecha] "req" estado bytes "referer" "ua"; los campos entre comillas admiten \"
const RE_COMBINED = /^(\S+) \S+ \S+ \[(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})\] "((?:[^"\\]|\\.)*)" (\d{3}) (\S+) "((?:[^"\\]|\\.)*)" "((?:[^"\\]|\\.)*)"\s*$/;

const desescapar = (s: string) => s.replace(/\\(["\\])/g, "$1");

export function parsearLinea(linea: string): LineaLog | null {
  const m = RE_COMBINED.exec(linea);
  if (!m) return null;
  const mes = MESES[m[3]];
  if (mes === undefined) return null;
  const desfase = (m[8] === "-" ? -1 : 1) * (Number(m[9]) * 60 + Number(m[10]));
  const ms = Date.UTC(Number(m[4]), mes, Number(m[2]), Number(m[5]), Number(m[6]), Number(m[7])) - desfase * 60_000;
  const partes = desescapar(m[11]).split(" ");
  if (!partes[1] || !partes[1].startsWith("/")) return null;
  const ref = desescapar(m[14]);
  return {
    ip: m[1], fecha: new Date(ms), metodo: partes[0] ?? "", ruta: partes[1] ?? "", estado: Number(m[12]),
    referer: ref === "-" ? "" : ref, ua: desescapar(m[15]),
  };
}

export type ClaseUa = { clase: "reenvio"; app: string } | { clase: "robot" } | { clase: "visita"; aparato: string; enApp: boolean };

function appDeReenvio(ua: string): string | null {
  const u = ua.toLowerCase();
  if (u.includes("whatsapp") && !u.includes("mozilla")) return "whatsapp";
  if (u.includes("facebookexternalhit") || u.includes("facebot")) return "facebook";
  if (u.includes("telegrambot")) return "telegram";
  if (u.includes("twitterbot")) return "twitter";
  if (u.includes("slackbot")) return "slack";
  if (u.includes("discordbot")) return "discord";
  if (u.includes("linkedinbot")) return "linkedin";
  if (u.includes("instagram") && u.includes("externalhit")) return "instagram";
  if (u.includes("imessage")) return "imessage";
  if (/\bpreview\b/.test(u)) return "otro";
  return null;
}

const RE_ROBOT = /bot\b|\bcrawl|spider|headlesschrome|\bcurl(?![a-z])|python-requests|go-http|atalaya-monitor|claudebot|getdomaindata|semrush|lighthouse/i;

function enAppDe(ua: string): boolean {
  if (/iPhone|iPad/.test(ua) && !ua.includes("Safari/")) return true;
  if (/Android/.test(ua) && ua.includes("; wv)")) return true;
  return /Instagram|FBAN|FBAV|WhatsApp/.test(ua);
}

export function resumirAparato(ua: string): string {
  let so = "Otro";
  if (/iPhone/.test(ua)) so = "iPhone";
  else if (/iPad/.test(ua)) so = "iPad";
  else if (/Android/.test(ua)) so = "Android";
  else if (/Windows/.test(ua)) so = "Windows";
  else if (/Mac/.test(ua)) so = "Mac";
  else if (/Linux/.test(ua)) so = "Linux";

  let version = "";
  if (so === "iPhone" || so === "iPad") {
    const v = /OS (\d+)_(\d+)/.exec(ua);
    if (v) version = `iOS ${v[1]}.${v[2]}`;
  }

  let navegador = "";
  if (enAppDe(ua)) navegador = "en una app";
  else if (/Edg\//.test(ua)) navegador = "Edge";
  else if (/SamsungBrowser/.test(ua)) navegador = "Samsung";
  else if (/Firefox\//.test(ua)) navegador = "Firefox";
  else if (/Chrome\/(\d+)/.test(ua)) navegador = `Chrome ${/Chrome\/(\d+)/.exec(ua)![1]}`;
  else if (/Safari\//.test(ua)) navegador = "Safari";

  return [so, version, navegador].filter(Boolean).join(" · ");
}

export function clasificarUa(ua: string): ClaseUa {
  if (!ua.trim()) return { clase: "robot" };
  const app = appDeReenvio(ua);
  if (app) return { clase: "reenvio", app };
  if (RE_ROBOT.test(ua)) return { clase: "robot" };
  return { clase: "visita", aparato: resumirAparato(ua), enApp: enAppDe(ua) };
}

// Rangos de Meta (AS32934): sus vistas previas piden la pagina desde muchas IPs a la vez, algunas con UA de navegador.
const CIDR_META = ["31.13.24.0/21", "31.13.64.0/18", "45.64.40.0/22", "57.141.0.0/16", "57.144.0.0/14", "66.220.144.0/20", "69.63.176.0/20",
  "69.171.224.0/19", "74.119.76.0/22", "102.132.96.0/20", "103.4.96.0/22", "129.134.0.0/16", "157.240.0.0/16", "163.70.128.0/17",
  "173.252.64.0/18", "179.60.192.0/22", "185.60.216.0/22", "185.89.216.0/22", "204.15.20.0/22"];
const PREFIJO_META_V6 = "2a03:2880:"; // 2a03:2880::/32

function ipv4ANumero(ip: string): number | null {
  const partes = ip.split(".");
  if (partes.length !== 4) return null;
  let n = 0;
  for (const p of partes) {
    if (!/^\d{1,3}$/.test(p) || Number(p) > 255) return null;
    n = n * 256 + Number(p);
  }
  return n;
}

const RANGOS_META = CIDR_META.map((c) => {
  const [red, bits] = c.split("/");
  const tam = 2 ** (32 - Number(bits));
  const inicio = Math.floor(ipv4ANumero(red)! / tam) * tam;
  return { inicio, fin: inicio + tam };
});

export function esIpDeMeta(ip: string): boolean {
  const n = ipv4ANumero(ip);
  if (n !== null) return RANGOS_META.some((r) => n >= r.inicio && n < r.fin);
  return ip.toLowerCase().startsWith(PREFIJO_META_V6);
}

const hash16 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
export const visitanteDe = (ip: string, ua: string) => hash16(`${ip}|${ua}`);
// Apps que appDeReenvio puede devolver: su visitante (visitanteDe("reenvio", app)) es de todos los prospectos a la vez.
const APPS_REENVIO = ["whatsapp", "facebook", "telegram", "twitter", "slack", "discord", "linkedin", "instagram", "imessage", "otro"];
const VISITANTES_REENVIO = new Set(APPS_REENVIO.map((a) => visitanteDe("reenvio", a)));
export const esVisitanteDeReenvio = (visitante: string) => VISITANTES_REENVIO.has(visitante);
export const huellaDe = (linea: string) => hash16(linea);

const RE_ASSET = /\.(css|js|mjs|png|jpe?g|gif|webp|svg|json|woff2?|ttf|ico|map|txt|xml|avif)$/i;

export function rutaPagina(ruta: string): string | null {
  let r = ruta.split("#")[0].split("?")[0];
  if (r.endsWith("/index.html")) return r.slice(0, -"index.html".length);
  const ultimo = r.slice(r.lastIndexOf("/") + 1);
  if (RE_ASSET.test(ultimo)) return null;
  return r;
}

export function esPdf(ruta: string): boolean {
  return /\.pdf$/i.test(ruta.split("#")[0].split("?")[0]);
}

const RE_EXTENSION = /\.[a-z0-9]{1,5}$/i;
const RE_HTML = /\.html?$/i;

export function descomponerUrl(url: string): { host: string; prefijo: string } | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.toLowerCase();
  if (host !== "neracosu.com" && !host.endsWith(".neracosu.com")) return null;
  let ruta = u.pathname;
  if (ruta.endsWith("/index.html")) ruta = ruta.slice(0, -"index.html".length);
  else if (RE_HTML.test(ruta)) ruta = ruta.replace(RE_HTML, "/"); // /x-1.html es la pagina /x-1 (URL limpia)
  else if (!ruta.endsWith("/")) {
    // URL limpia sin barra final (/propuesta/x-1) es su propia carpeta; solo un archivo con extension se recorta al directorio
    const corte = ruta.lastIndexOf("/") + 1;
    ruta = RE_EXTENSION.test(ruta.slice(corte)) ? ruta.slice(0, corte) : ruta + "/";
  }
  // La raiz ("/") se devuelve igual: es de neracosu.com, y registrarEnlace la rechaza con su propio mensaje
  return { host, prefijo: ruta };
}

// "/factura" (sin barra final) tambien es la carpeta "/factura/"
export function enlaceQueCoincide<T extends { prefijo: string }>(ruta: string, enlaces: T[]): T | null {
  let mejor: T | null = null;
  for (const e of enlaces) {
    const coincide = ruta.startsWith(e.prefijo) || ruta + "/" === e.prefijo;
    if (coincide && (!mejor || e.prefijo.length > mejor.prefijo.length)) mejor = e;
  }
  return mejor;
}

export const PATRON_P = /^\/p\/([A-Za-z0-9_-]{22})(\/pdf)?$/;

export function etiquetaScript(token: string, base = "https://prospectos.neracosu.com"): string {
  return `<script src="${base}/rastro.js?v=1" data-enlace="${token}" defer></script>`;
}

// ---- linea de tiempo fundida (log + js) y resumenes ----

export type VisitaFila = { id: number; enlaceId: number; etiqueta: string; fuente: "log" | "js"; tipo: string; visitante: string; aparato: string; pais: string; ciudad: string; red: string; geoPendiente: boolean; ruta: string; detalle: string; origen: string; segundos: number | null; scroll: number | null; propia: boolean; ocurrioEn: Date };
export type Apertura = { clase: "apertura" | "vuelta" | "reenvio" | "envio" | "pdf" | "clic"; enlaceId: number; etiqueta: string; visitante: string; ruta: string; ocurrioEn: Date; segundos: number | null; scroll: number | null; origen: string; detalle: string; clics: string[] };
export type Visitante = { visitante: string; numero: number; aparato: string; lugar: string; red: string; propio: boolean };
export type LineaTiempo = { visitantes: Visitante[]; dias: { dia: string; filas: Apertura[] }[] };

const VENTANA_PAR_MS = 90_000;     // vista (log) + inicio (js) del mismo visitante y ruta
const VENTANA_RECARGA_MS = 60_000; // recargas y reenvios repetidos

export function textoLugar(v: { pais: string; ciudad: string; red: string; geoPendiente: boolean }): string {
  if (v.red) return "desde una VPN";
  if (v.pais && v.ciudad) return `${v.pais}, ${v.ciudad}`;
  if (v.pais) return v.pais;
  if (v.ciudad) return v.ciudad;
  return v.geoPendiente ? "ubicación: en unos minutos" : "ubicación desconocida";
}

type Abierta = { fila: Apertura; ultimoPorFuente: Partial<Record<"log" | "js", number>> };

function armarVisitantes(orden: VisitaFila[]): Visitante[] {
  const porId = new Map<string, VisitaFila[]>();
  for (const v of orden) {
    const l = porId.get(v.visitante);
    if (l) l.push(v); else porId.set(v.visitante, [v]);
  }
  return [...porId.entries()].map(([visitante, vs], i) => {
    const conGeo = [...vs].reverse().find((x) => x.pais || x.ciudad || x.red);
    const ref = conGeo ?? vs[vs.length - 1];
    return { visitante, numero: i + 1, aparato: vs[vs.length - 1].aparato, lugar: textoLugar(ref), red: ref.red, propio: vs.some((x) => x.propia) };
  });
}

// Primera apertura no propia de cada enlace (aunque se muestren las propias: Neri abriendo no es el prospecto).
function primerasAperturas(visitas: VisitaFila[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const v of visitas) {
    if (v.propia || (v.tipo !== "vista" && v.tipo !== "inicio")) continue;
    const ms = v.ocurrioEn.getTime();
    const previa = m.get(v.enlaceId);
    if (previa === undefined || ms < previa) m.set(v.enlaceId, ms);
  }
  return m;
}

// Un reenvio no propio antes de que nadie abra el enlace es la vista previa del envio de Neri, no del prospecto.
const esEnvio = (v: VisitaFila, primeras: Map<number, number>) => {
  if (v.tipo !== "reenvio" || v.propia) return false;
  const primera = primeras.get(v.enlaceId);
  return primera === undefined || v.ocurrioEn.getTime() < primera;
};

const VENTANA_RASTREADOR_MS = 120_000;
// Solo vistas previas no propias: la de Neri no convierte la vista de otro en un reenvio ajeno
const esPreviaDeMeta = (v: VisitaFila) => v.tipo === "reenvio" && !v.propia && (v.detalle === "facebook" || v.detalle === "instagram");

// Meta tambien pide la pagina desde IPs de AWS con UA de navegador Android y sin correr js. Una vista de log no propia
// a <= 120 s de una vista previa facebook/instagram del mismo enlace, de un visitante que no tiene nada mas que vistas
// asi (ni inicio js, ni otra fila lejos), es parte de esa vista previa: se reescribe como ella (visitante, detalle)
// y sigue su suerte (envio o reenvio, y se funde a 60 s). Un prospecto real que abre desde Instagram deja inicio.
function absorberRastreadores(visitas: VisitaFila[]): VisitaFila[] {
  const previas = visitas.filter(esPreviaDeMeta);
  if (!previas.length) return visitas;
  const cercana = (v: VisitaFila): VisitaFila | undefined => {
    let mejor: VisitaFila | undefined;
    let dist = Infinity;
    for (const r of previas) {
      const d = Math.abs(r.ocurrioEn.getTime() - v.ocurrioEn.getTime());
      if (r.enlaceId === v.enlaceId && d <= VENTANA_RASTREADOR_MS && d < dist) { mejor = r; dist = d; }
    }
    return mejor;
  };
  const candidata = (v: VisitaFila) => v.tipo === "vista" && v.fuente === "log" && !v.propia && cercana(v) !== undefined;
  const porVisitante = new Map<string, VisitaFila[]>();
  for (const v of visitas) {
    const l = porVisitante.get(v.visitante);
    if (l) l.push(v); else porVisitante.set(v.visitante, [v]);
  }
  return visitas.map((v) => {
    if (!candidata(v) || !porVisitante.get(v.visitante)!.every(candidata)) return v;
    const r = cercana(v)!;
    return { ...v, tipo: "reenvio", visitante: r.visitante, detalle: r.detalle, aparato: "" };
  });
}

export function armarLineaTiempo(entrada: VisitaFila[], o: { conPropias?: boolean } = {}): LineaTiempo {
  const visitas = absorberRastreadores(entrada);
  const primeras = primerasAperturas(visitas);
  const orden = visitas.filter((v) => o.conPropias || !v.propia)
    .sort((a, b) => a.ocurrioEn.getTime() - b.ocurrioEn.getTime() || a.id - b.id);
  const filas: Apertura[] = [];
  const abiertas = new Map<string, Abierta>();   // visitante|ruta -> apertura vigente
  const yaAbrio = new Set<string>();
  const ultimoReenvio = new Map<string, number>();
  const nueva = (clase: Apertura["clase"], v: VisitaFila): Apertura => {
    const f: Apertura = { clase, enlaceId: v.enlaceId, etiqueta: v.etiqueta, visitante: v.visitante, ruta: v.ruta, ocurrioEn: v.ocurrioEn, segundos: v.segundos, scroll: v.scroll, origen: v.origen, detalle: v.detalle, clics: [] };
    filas.push(f);
    return f;
  };

  for (const v of orden) {
    const clave = `${v.visitante}|${v.ruta}`;
    const ms = v.ocurrioEn.getTime();
    const ab = abiertas.get(clave);
    if (v.tipo === "vista" || v.tipo === "inicio") {
      const previo = ab?.ultimoPorFuente[v.fuente];
      const mismaApertura = ab && (previo === undefined ? ms - ab.fila.ocurrioEn.getTime() <= VENTANA_PAR_MS : ms - previo <= VENTANA_RECARGA_MS);
      if (ab && mismaApertura) {
        ab.ultimoPorFuente[v.fuente] = ms;
        if (v.origen && !ab.fila.origen) ab.fila.origen = v.origen;
      } else {
        const fila = nueva(yaAbrio.has(clave) ? "vuelta" : "apertura", v);
        yaAbrio.add(clave);
        abiertas.set(clave, { fila, ultimoPorFuente: { [v.fuente]: ms } });
      }
    } else if (v.tipo === "fin") {
      if (ab) {
        if (v.segundos !== null) ab.fila.segundos = v.segundos;
        if (v.scroll !== null) ab.fila.scroll = v.scroll;
      }
    } else if (v.tipo === "clic") {
      if (ab) ab.fila.clics.push(v.detalle); else nueva("clic", v);
    } else if (v.tipo === "reenvio") {
      const previo = ultimoReenvio.get(clave);
      ultimoReenvio.set(clave, ms);
      if (previo === undefined || ms - previo > VENTANA_RECARGA_MS) nueva(esEnvio(v, primeras) ? "envio" : "reenvio", v);
    } else if (v.tipo === "pdf") {
      nueva("pdf", v);
    }
  }

  const recientesPrimero = [...filas].sort((a, b) => a.ocurrioEn.getTime() - b.ocurrioEn.getTime()).reverse();
  const dias: LineaTiempo["dias"] = [];
  for (const f of recientesPrimero) {
    const dia = hoyCaracas(f.ocurrioEn);
    const ultimo = dias[dias.length - 1];
    if (ultimo && ultimo.dia === dia) ultimo.filas.push(f); else dias.push({ dia, filas: [f] });
  }
  // El envio no es un visitante del prospecto
  return { visitantes: armarVisitantes(orden.filter((v) => !esEnvio(v, primeras))), dias };
}

export type ResumenEnlace = { visitantes: number; aperturas: number; reenvios: number; pdfs: number };

export function resumirEnlace(visitas: VisitaFila[], enlaceId: number): ResumenEnlace {
  const filas = armarLineaTiempo(visitas.filter((v) => v.enlaceId === enlaceId)).dias.flatMap((d) => d.filas);
  const aperturas = filas.filter((f) => f.clase === "apertura" || f.clase === "vuelta");
  return {
    visitantes: new Set(aperturas.map((f) => f.visitante)).size,
    aperturas: aperturas.length,
    reenvios: filas.filter((f) => f.clase === "reenvio").length,
    pdfs: filas.filter((f) => f.clase === "pdf").length,
  };
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function textoResumenEnlace(r: ResumenEnlace): string {
  const partes: string[] = [];
  if (r.aperturas > 0) partes.push(plural(r.visitantes, "visitante", "visitantes"), plural(r.aperturas, "apertura", "aperturas"));
  if (r.reenvios > 0) partes.push(`reenviado ${plural(r.reenvios, "vez", "veces")}`);
  if (r.pdfs > 0) partes.push(`PDF bajado ${plural(r.pdfs, "vez", "veces")}`);
  return partes.length ? partes.join(" · ") : "Sin abrir";
}

export function haceCuanto(desde: Date, ahora: Date): string {
  const s = (ahora.getTime() - desde.getTime()) / 1000;
  if (s < 60) return "hace un momento";
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 7 * 86400) return `hace ${Math.floor(s / 86400)} d`;
  return `hace ${Math.floor(s / (7 * 86400))} sem`;
}

export type DatosTarjeta = { etiqueta: string; enviadoEn: Date; ultimaApertura: Date | null; visitantes: number; reenvio: boolean };

export function resumenTarjeta(d: DatosTarjeta, ahora: Date): string {
  if (!d.ultimaApertura) return `Sin abrir · enviada ${haceCuanto(d.enviadoEn, ahora)}`;
  const que = d.etiqueta.startsWith("Demo") ? "demo" : d.etiqueta.toLowerCase();
  const partes = [`Vio la ${que} ${haceCuanto(d.ultimaApertura, ahora)}`];
  if (d.reenvio) partes.push("la reenvió");
  if (d.visitantes > 1) partes.push(`${d.visitantes} personas`);
  return partes.join(" · ");
}

// ---- eventos del script rastro.js (vienen de la calle: se normaliza todo) ----

export type EventoJsNormal = { token: string; tipo: "inicio" | "fin" | "clic"; ruta: string; origen: string; segundos: number | null; scroll: number | null; detalle: string };

const TIPOS_JS = new Set(["inicio", "fin", "clic"]);
const RE_TOKEN = /^[A-Za-z0-9_-]{22}$/;
const RE_DETALLE = /^[a-z0-9-]{1,40}$/;

function enteroEntre(x: unknown, min: number, max: number): number | null {
  if (typeof x !== "number" || !Number.isFinite(x)) return null;
  return Math.min(max, Math.max(min, Math.round(x)));
}

export function normalizarEventoJs(x: unknown): EventoJsNormal | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.token !== "string" || !RE_TOKEN.test(o.token)) return null;
  if (typeof o.tipo !== "string" || !TIPOS_JS.has(o.tipo)) return null;
  if (typeof o.ruta !== "string" || !o.ruta.startsWith("/")) return null;
  const ruta = rutaPagina(o.ruta);
  if (ruta === null) return null;
  const detalle = typeof o.detalle === "string" && RE_DETALLE.test(o.detalle) ? o.detalle : "";
  if (o.tipo === "clic" && !detalle) return null;
  return {
    token: o.token,
    tipo: o.tipo as EventoJsNormal["tipo"],
    ruta: ruta.slice(0, 200),
    origen: typeof o.origen === "string" ? o.origen.trim().slice(0, 120) : "",
    segundos: enteroEntre(o.segundos, 0, 86400),
    scroll: enteroEntre(o.scroll, 0, 100),
    detalle,
  };
}
