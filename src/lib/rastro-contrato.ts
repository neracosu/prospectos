// src/lib/rastro-contrato.ts — rastro de enlaces a prospectos. Puro: parsea el access-log, clasifica user-agents
// y calcula visitante, huella y prefijos. Sin I/O ni base de datos, para probarlo sin nada levantado.
import { createHash } from "node:crypto";

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

const hash16 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
export const visitanteDe = (ip: string, ua: string) => hash16(`${ip}|${ua}`);
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

export function descomponerUrl(url: string): { host: string; prefijo: string } | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  const host = u.hostname.toLowerCase();
  if (host !== "neracosu.com" && !host.endsWith(".neracosu.com")) return null;
  const ruta = u.pathname.endsWith("/index.html") ? u.pathname.slice(0, -"index.html".length) : u.pathname;
  return { host, prefijo: ruta.slice(0, ruta.lastIndexOf("/") + 1) };
}

export function enlaceQueCoincide<T extends { prefijo: string }>(ruta: string, enlaces: T[]): T | null {
  let mejor: T | null = null;
  for (const e of enlaces) {
    if (ruta.startsWith(e.prefijo) && (!mejor || e.prefijo.length > mejor.prefijo.length)) mejor = e;
  }
  return mejor;
}

export const PATRON_P = /^\/p\/([A-Za-z0-9_-]{22})(\/pdf)?$/;

export function etiquetaScript(token: string, base = "https://prospectos.neracosu.com"): string {
  return `<script src="${base}/rastro.js?v=1" data-enlace="${token}" defer></script>`;
}
