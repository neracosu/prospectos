// src/lib/web-contrato.ts — medicion de neracosu.com (21-oct). Puro: valida lo que manda la web y arma el resumen
// que ve Neri en /web. Sin IP ni cookies: la «persona» es la sesion al azar que el navegador guarda en
// sessionStorage, asi que alguien que vuelve otro dia cuenta otra vez. Es una cifra aproximada y se dice asi.
import { hoyCaracas } from "@/lib/fecha-caracas";

export const ORIGENES_WEB = ["https://neracosu.com", "https://www.neracosu.com"] as const;

export function origenPermitido(origin: string | null): string | null {
  return origin && (ORIGENES_WEB as readonly string[]).includes(origin) ? origin : null;
}

// Lo que la web puede mandar. Un clic o una seccion fuera de estas listas se descarta.
export const TIPOS_EVENTO = ["vista", "clic", "seccion", "paso"] as const;
// Embudo /empezar (29-oct): cada paso se manda una vez por visita. La landing se mide como /empezar.html
// (medir.js agrega .html), pero se acepta tambien /empezar por si alguien la manda limpia.
export const PASOS_EMBUDO = [
  { id: "p1", nombre: "Respondieron la 1" },
  { id: "p2", nombre: "Respondieron la 2" },
  { id: "p3", nombre: "Respondieron la 3" },
  { id: "p4", nombre: "Respondieron la 4" },
  { id: "resultado", nombre: "Vieron su recomendación" },
  { id: "datos", nombre: "Abrieron el formulario" },
  { id: "enviado", nombre: "Dejaron sus datos" },
] as const;
const IDS_PASO: readonly string[] = PASOS_EMBUDO.map((p) => p.id);
const RUTAS_EMPEZAR = ["/empezar.html", "/empezar"];
export const CALIFICACIONES = ["demo", "diagnostico"] as const;
export const CLAVES_RESPUESTAS = ["rubro", "actual", "objetivo", "tamano", "sistema"] as const;
const NOMBRES_RESPUESTA: Record<(typeof CLAVES_RESPUESTAS)[number], string> = {
  rubro: "Rubro", actual: "Hoy trabaja con", objetivo: "Quiere lograr", tamano: "Tamaño", sistema: "Sistema recomendado",
};
export const CLICS = ["whatsapp", "calculadora", "para", "correo", "telefono"] as const;
export const SECCIONES_HOME = [
  { id: "industrias", nombre: "Rubros (enlaces a /para/)" },
  { id: "productos", nombre: "Productos propios" },
  { id: "portafolio", nombre: "Portafolio" },
  { id: "sobre-mi", nombre: "Quién soy" },
  { id: "faq", nombre: "Preguntas frecuentes" },
  { id: "blog", nombre: "Blog" },
  { id: "contacto", nombre: "Formulario de contacto" },
] as const;
const IDS_SECCION: readonly string[] = SECCIONES_HOME.map((s) => s.id);

const ROBOT = /bot|crawl|spider|slurp|headless|lighthouse|facebookexternalhit|preview|python|curl|wget|java\/|go-http|okhttp|axios|scrapy|phantom|selenium|puppeteer|playwright/i;
export function esBot(ua: string | null | undefined): boolean {
  if (!ua || !ua.startsWith("Mozilla/")) return true;
  return ROBOT.test(ua);
}

export function rutaLimpia(x: unknown): string | null {
  if (typeof x !== "string" || !x.startsWith("/") || x.startsWith("//")) return null;
  return x.split(/[?#]/)[0].slice(0, 191);
}

const SESION = /^[a-z0-9]{8,32}$/;
const texto = (x: unknown) => (typeof x === "string" ? x.trim() : "");

export type EventoNormal = { sesion: string; tipo: (typeof TIPOS_EVENTO)[number]; ruta: string; detalle: string; origen: string; movil: boolean };

// Forma corta a proposito (s, t, r, d, o, m): va en cada sendBeacon.
export function normalizarEvento(x: unknown): EventoNormal | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const sesion = texto(o.s);
  const tipo = texto(o.t) as EventoNormal["tipo"];
  const ruta = rutaLimpia(o.r);
  if (!SESION.test(sesion) || !TIPOS_EVENTO.includes(tipo) || !ruta) return null;
  let detalle = "";
  if (tipo === "clic") {
    detalle = texto(o.d);
    if (!(CLICS as readonly string[]).includes(detalle)) return null;
  } else if (tipo === "seccion") {
    detalle = texto(o.d);
    if (!IDS_SECCION.includes(detalle)) return null;
  } else if (tipo === "paso") {
    detalle = texto(o.d);
    if (!IDS_PASO.includes(detalle)) return null;
  }
  const origen = tipo === "vista" ? texto(o.o).toLowerCase().replace(/[^a-z0-9.\-]/g, "").slice(0, 120) : "";
  return { sesion, tipo, ruta, detalle, origen, movil: o.m === true };
}

export type SolicitudNormal = {
  nombre: string; correo: string; whatsapp: string; tipo: string; presupuesto: string; mensaje: string; pagina: string; sesion: string;
  // Embudo /empezar: JSON de {rubro, actual, objetivo, tamano, sistema} ("" si no vino), demo|diagnostico|"", y el ?de= del enlace.
  respuestas: string; calificacion: "" | "demo" | "diagnostico"; origen: string;
};

const limpiarOrigen = (x: unknown) => texto(x).toLowerCase().replace(/[^a-z0-9.\-]/g, "").slice(0, 120);

// Solo las claves conocidas, valores como texto corto; si aun asi pasa de 400 caracteres, se recorta mas y, si no cabe, va vacio.
function limpiarRespuestas(x: unknown): string {
  if (!x || typeof x !== "object") return "";
  const o = x as Record<string, unknown>;
  for (const largo of [40, 20]) {
    const r: Record<string, string> = {};
    for (const k of CLAVES_RESPUESTAS) {
      const v = o[k];
      // Solo primitivos: String({toString: 1}) lanza y un arreglo u objeto no es una respuesta.
      if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") continue;
      const t = String(v).trim().slice(0, largo);
      if (t) r[k] = t;
    }
    if (Object.keys(r).length === 0) return "";
    const json = JSON.stringify(r);
    if (json.length <= 400) return json;
  }
  return "";
}

export function respuestasLegibles(json: string): { clave: string; valor: string }[] {
  if (!json) return [];
  let o: unknown;
  try { o = JSON.parse(json); } catch { return []; }
  if (!o || typeof o !== "object") return [];
  const r = o as Record<string, unknown>;
  return CLAVES_RESPUESTAS.filter((k) => typeof r[k] === "string" && r[k]).map((k) => ({ clave: NOMBRES_RESPUESTA[k], valor: r[k] as string }));
}
type ResultadoSolicitud = { ok: true; datos: SolicitudNormal } | { ok: false; mensaje: string; robot?: boolean };

const CORREO = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;
const WHATSAPP = /^[0-9+()\s.-]{7,40}$/;

export function normalizarSolicitud(x: unknown): ResultadoSolicitud {
  if (!x || typeof x !== "object") return { ok: false, mensaje: "No se pudo leer el formulario." };
  const o = x as Record<string, unknown>;
  // Campo trampa: invisible para una persona, los robots lo llenan.
  if (texto(o.sitio)) return { ok: false, mensaje: "No se pudo enviar.", robot: true };
  const nombre = texto(o.nombre).replace(/\s+/g, " ");
  const correo = typeof o.email === "string" ? o.email.trim() : "";
  const whatsapp = texto(o.phone);
  const tipo = texto(o.type);
  const presupuesto = texto(o.budget);
  // El embudo manda el resumen como mensaje; si viene vacio, igual tiene que guardarse.
  const mensaje = texto(o.message) || (tipo === "embudo" ? "Embudo /empezar" : "");
  const respuestas = limpiarRespuestas(o.respuestas);
  const cal = texto(o.calificacion);
  const calificacion = (CALIFICACIONES as readonly string[]).includes(cal) ? (cal as SolicitudNormal["calificacion"]) : "";
  const origen = limpiarOrigen(o.origen);
  if (nombre.length < 2 || nombre.length > 120) return { ok: false, mensaje: "Escriba su nombre." };
  if (correo && (correo.length > 191 || !CORREO.test(correo))) return { ok: false, mensaje: "Revise su correo: parece mal escrito." };
  if (whatsapp && (!WHATSAPP.test(whatsapp) || whatsapp.replace(/\D/g, "").length < 7)) return { ok: false, mensaje: "Revise su número de WhatsApp." };
  if (!correo && !whatsapp) return { ok: false, mensaje: "Déjeme su correo o su WhatsApp para poder responderle." };
  if (!tipo || tipo.length > 80) return { ok: false, mensaje: "Elija el tipo de proyecto." };
  if (presupuesto.length > 40) return { ok: false, mensaje: "Elija un rango de presupuesto." };
  if (mensaje.length < 5) return { ok: false, mensaje: "Cuénteme un poco sobre su proyecto." };
  if (mensaje.length > 4000) return { ok: false, mensaje: "El mensaje es muy largo: resúmalo en menos de 4.000 caracteres." };
  const sesion = texto(o.sesion);
  return {
    ok: true,
    datos: { nombre, correo, whatsapp, tipo, presupuesto, mensaje, pagina: rutaLimpia(o.pagina) ?? "", sesion: SESION.test(sesion) ? sesion : "", respuestas, calificacion, origen },
  };
}

// De dominio (o utm_source) a un nombre que se entienda en el panel.
export function clasificarOrigen(origen: string): string {
  const o = origen.toLowerCase();
  if (!o) return "Directo o desde una app";
  if (o.includes("google")) return "Google";
  if (o.includes("facebook") || o === "fb") return "Facebook";
  if (o.includes("instagram") || o === "ig") return "Instagram";
  if (o.includes("whatsapp") || o === "wa") return "WhatsApp";
  if (o.includes("tiktok")) return "TikTok";
  if (o.includes("linkedin")) return "LinkedIn";
  if (o.includes("bing")) return "Bing";
  if (o.includes("chatgpt") || o.includes("openai")) return "ChatGPT";
  if (o === "t.co" || o.includes("twitter") || o === "x.com") return "X (Twitter)";
  return o.replace(/^www\./, "");
}

export type EventoParaResumen = { sesion: string; tipo: string; ruta: string; detalle: string; origen: string; movil: boolean; creadoEn: Date };

export type ResumenWeb = {
  personas: number;
  moviles: number;
  vistas: number;
  seFueron: number;
  porDia: { dia: string; personas: number }[];
  origenes: { nombre: string; personas: number }[];
  paginas: { ruta: string; personas: number }[];
  embudo: { paso: string; personas: number }[];
  clics: { destino: string; personas: number }[];
  home: { personas: number; secciones: { id: string; nombre: string; personas: number }[] };
  empezar: { personas: number; pasos: { id: string; nombre: string; personas: number }[]; origenes: { nombre: string; personas: number; enviaron: number }[] };
};

const NOMBRE_CLIC: Record<string, string> = { whatsapp: "WhatsApp", calculadora: "Calculadora", para: "Precios por rubro (/para/)", correo: "Correo", telefono: "Teléfono" };

function ordenar<T extends { personas: number }>(xs: T[], clave: (x: T) => string): T[] {
  return xs.sort((a, b) => b.personas - a.personas || clave(a).localeCompare(clave(b)));
}

export function resumirWeb(eventos: EventoParaResumen[], solicitudes: number): ResumenWeb {
  type Persona = { primera?: EventoParaResumen; rutas: Set<string>; clics: Set<string>; secciones: Set<string>; pasos: Set<string>; dias: Set<string>; movil: boolean };
  const gente = new Map<string, Persona>();
  let vistas = 0;
  const orden = [...eventos].sort((a, b) => a.creadoEn.getTime() - b.creadoEn.getTime());
  for (const e of orden) {
    let p = gente.get(e.sesion);
    if (!p) { p = { rutas: new Set(), clics: new Set(), secciones: new Set(), pasos: new Set(), dias: new Set(), movil: false }; gente.set(e.sesion, p); }
    p.dias.add(hoyCaracas(e.creadoEn));
    if (e.tipo === "vista") {
      vistas++;
      p.primera ??= e;
      p.rutas.add(e.ruta);
      if (e.movil) p.movil = true;
    } else if (e.tipo === "clic") p.clics.add(e.detalle);
    else if (e.tipo === "seccion") p.secciones.add(e.detalle);
    else if (e.tipo === "paso") p.pasos.add(e.detalle);
  }
  // Solo cuenta como persona quien tuvo al menos una vista (un clic suelto sin vista no se entiende).
  const personas = [...gente.values()].filter((p) => p.primera);

  const contar = (claves: Iterable<string>, mapa: Map<string, number>) => { for (const k of claves) mapa.set(k, (mapa.get(k) ?? 0) + 1); };
  const porDia = new Map<string, number>(), origenes = new Map<string, number>(), paginas = new Map<string, number>(), clics = new Map<string, number>();
  for (const p of personas) {
    contar(p.dias, porDia);
    contar([clasificarOrigen(p.primera!.origen)], origenes);
    contar(p.rutas, paginas);
    contar(p.clics, clics);
  }
  const vieronHome = personas.filter((p) => p.rutas.has("/"));
  const empezar = personas.filter((p) => RUTAS_EMPEZAR.some((r) => p.rutas.has(r)));
  const porOrigen = new Map<string, { personas: number; enviaron: number }>();
  for (const p of empezar) {
    const k = clasificarOrigen(p.primera!.origen);
    const v = porOrigen.get(k) ?? { personas: 0, enviaron: 0 };
    v.personas++; if (p.pasos.has("enviado")) v.enviaron++;
    porOrigen.set(k, v);
  }
  const cuantos = (f: (p: Persona) => boolean) => personas.filter(f).length;

  return {
    personas: personas.length,
    moviles: cuantos((p) => p.movil),
    vistas,
    seFueron: cuantos((p) => p.rutas.size === 1 && p.clics.size === 0),
    porDia: [...porDia].map(([dia, n]) => ({ dia, personas: n })).sort((a, b) => a.dia.localeCompare(b.dia)),
    origenes: ordenar([...origenes].map(([nombre, n]) => ({ nombre, personas: n })), (x) => x.nombre),
    paginas: ordenar([...paginas].map(([ruta, n]) => ({ ruta, personas: n })), (x) => x.ruta).slice(0, 15),
    embudo: [
      { paso: "Entraron a la web", personas: personas.length },
      { paso: "Vieron precios por rubro (/para/)", personas: cuantos((p) => [...p.rutas].some((r) => r.startsWith("/para/"))) },
      { paso: "Abrieron la calculadora", personas: cuantos((p) => p.rutas.has("/calculadora.html")) },
      { paso: "Tocaron WhatsApp, correo o teléfono", personas: cuantos((p) => p.clics.has("whatsapp") || p.clics.has("correo") || p.clics.has("telefono")) },
      { paso: "Enviaron el formulario", personas: solicitudes },
    ],
    clics: ordenar([...clics].map(([d, n]) => ({ destino: NOMBRE_CLIC[d] ?? d, personas: n })), (x) => x.destino),
    home: {
      personas: vieronHome.length,
      secciones: SECCIONES_HOME.map((s) => ({ id: s.id, nombre: s.nombre, personas: vieronHome.filter((p) => p.secciones.has(s.id)).length })),
    },
    empezar: {
      personas: empezar.length,
      pasos: PASOS_EMBUDO.map((x) => ({ id: x.id, nombre: x.nombre, personas: empezar.filter((p) => p.pasos.has(x.id)).length })),
      origenes: ordenar([...porOrigen].map(([nombre, v]) => ({ nombre, ...v })), (x) => x.nombre),
    },
  };
}

// «Personas por dia» en barras (fase 3): altura en porcentaje entero respecto al dia mas alto; 0 si no hay maximo.
export function alturaBarra(n: number, max: number): number {
  if (max <= 0 || n <= 0) return 0;
  return Math.round((100 * n) / max);
}

// Los dias sin visitas tambien se dibujan: una barra en 0 por cada fecha del rango (ISO, inclusive).
export function rellenarDias(porDia: { dia: string; personas: number }[], desde: string, hasta: string): { dia: string; personas: number }[] {
  const mapa = new Map(porDia.map((d) => [d.dia, d.personas]));
  const salida: { dia: string; personas: number }[] = [];
  const d = new Date(`${desde}T00:00:00Z`);
  for (let dia = desde; dia <= hasta; d.setUTCDate(d.getUTCDate() + 1), dia = d.toISOString().slice(0, 10)) salida.push({ dia, personas: mapa.get(dia) ?? 0 });
  return salida;
}
