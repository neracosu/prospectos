// src/lib/rastro.ts — base del rastro de enlaces: enlaces enviados, visitas y que es "propio".
// Lo puro (parser, visitante, linea de tiempo, textos) vive en rastro-contrato.ts.
import { prisma } from "@/lib/db";
import { generarCodigo, CODIGO_VALIDO } from "@/lib/codigo";
import { leerConfig, guardarConfig, CLAVES } from "@/lib/configuracion";
import {
  descomponerUrl, visitanteDe, resumirAparato, resumenTarjeta,
  type VisitaFila, type EventoJsNormal,
} from "@/lib/rastro-contrato";

export type EnlaceFila = { id: number; prospectoId: number; etiqueta: string; host: string; prefijo: string; token: string; origen: string; activo: boolean; enviadoEn: Date };
export type VisitaNueva = Omit<VisitaFila, "id" | "etiqueta" | "propia"> & { ip: string; ua: string; huella?: string };
// ipsSesion: IP -> ultima sesion del panel desde ella (solo decide en reenvios: ver esPropia)
export type Propios = { ips: Set<string>; visitantes: Set<string>; ipsSesion: Map<string, Date> };

const HOST_PANEL = "prospectos.neracosu.com";
const DIAS_SESION_PROPIA = 30;
const MAX_VISITANTES_SESION = 60;
const MAX_IPS_SESION = 60;
const VENTANA_REENVIO_PROPIO_MS = 24 * 3600_000;
const UNA_HORA = 3600_000;
// Fecha lejana: el visitante marcado a mano no caduca con los 30 dias.
const FECHA_PERMANENTE = "2099-01-01T00:00:00.000Z";

const SELECT_ENLACE = { id: true, prospectoId: true, etiqueta: true, host: true, prefijo: true, token: true, origen: true, activo: true, enviadoEn: true } as const;

const esP2002 = (err: unknown) => typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";

// MariaDB en modo estricto rechaza valores mas largos que la columna.
const corto = (s: string, n: number) => s.slice(0, n);

// ---- enlaces ----

export async function registrarEnlace(d: { prospectoId: number; url: string; etiqueta: string; enviadoEn?: Date }): Promise<{ ok: true; enlace: EnlaceFila } | { ok: false; error: string }> {
  const partes = descomponerUrl(d.url.trim());
  if (!partes) return { ok: false, error: "URL no es de neracosu.com" };
  // La raiz abarcaria todo el sitio: no es un enlace enviado
  if (partes.prefijo === "/") return { ok: false, error: "La raiz del sitio no se puede seguir; use una pagina concreta" };
  // /p/<codigo> lo crea obtenerOCrearEnlacePlantilla; uno manual con prefijo /p/ se tragaria los de todos
  if (partes.host === HOST_PANEL) return { ok: false, error: "El enlace /p/ se registra solo" };
  const repetido = { ok: false as const, error: "Ese enlace ya esta registrado" };
  const existe = await prisma.enlaceEnviado.findUnique({ where: { host_prefijo_prospectoId: { ...partes, prospectoId: d.prospectoId } }, select: { id: true } });
  if (existe) return repetido;
  try {
    const enlace = await prisma.enlaceEnviado.create({
      data: { prospectoId: d.prospectoId, ...partes, etiqueta: corto(d.etiqueta.trim(), 40), token: generarCodigo(), origen: "manual", enviadoEn: d.enviadoEn ?? new Date() },
      select: SELECT_ENLACE,
    });
    return { ok: true, enlace };
  } catch (err) {
    if (esP2002(err)) return repetido; // otro alta del mismo enlace gano la carrera
    throw err;
  }
}

export async function listarEnlaces(prospectoId: number): Promise<EnlaceFila[]> {
  return prisma.enlaceEnviado.findMany({ where: { prospectoId }, orderBy: { enviadoEn: "desc" }, select: SELECT_ENLACE });
}

export async function enlacesActivosPorHost(): Promise<Map<string, EnlaceFila[]>> {
  const filas = await prisma.enlaceEnviado.findMany({ where: { activo: true }, select: SELECT_ENLACE });
  const m = new Map<string, EnlaceFila[]>();
  for (const e of filas) {
    const lista = m.get(e.host);
    if (lista) lista.push(e); else m.set(e.host, [e]);
  }
  return m;
}

export async function desactivarEnlace(id: number): Promise<void> {
  await prisma.enlaceEnviado.update({ where: { id }, data: { activo: false } });
}

// La propuesta /p/<codigo> se rastrea sola: la fila se crea la primera vez que hace falta.
// Con crear: false solo busca (el ensayo del importador y las lineas propias no crean nada).
export async function obtenerOCrearEnlacePlantilla(codigo: string, o: { crear?: boolean } = {}): Promise<EnlaceFila | null> {
  if (!CODIGO_VALIDO.test(codigo)) return null;
  const prospecto = await prisma.prospecto.findUnique({ where: { codigo }, select: { id: true } });
  if (!prospecto) return null;
  const clave = { host: HOST_PANEL, prefijo: `/p/${codigo}`, prospectoId: prospecto.id };
  const leer = () => prisma.enlaceEnviado.findUnique({ where: { host_prefijo_prospectoId: clave }, select: SELECT_ENLACE });
  const existe = await leer();
  if (existe || o.crear === false) return existe;
  const enviado = await prisma.evento.findFirst({ where: { prospectoId: prospecto.id, tipo: "enviado" }, orderBy: { creadoEn: "asc" }, select: { creadoEn: true } });
  try {
    return await prisma.enlaceEnviado.create({
      data: { ...clave, etiqueta: "Propuesta", origen: "plantilla", token: generarCodigo(), enviadoEn: enviado?.creadoEn ?? new Date() },
      select: SELECT_ENLACE,
    });
  } catch (err) {
    if (!esP2002(err)) throw err;
    return leer(); // otra peticion la creo a la vez
  }
}

// ---- propios (Neri y su equipo no cuentan como visita del prospecto) ----

// Regla 3: WhatsApp arma la vista previa desde el telefono del REMITENTE, con un UA que no es el del navegador.
// Un reenvio desde una IP con sesion del panel a menos de 24 h es Neri enviando. Solo reenvios: un UA de vista
// previa nunca es el navegador de un prospecto, asi una IP compartida (CGNAT) casi no pesa.
export function esPropia(ip: string, visitante: string, p: Propios, v?: { tipo: string; ocurrioEn: Date }): boolean {
  if (p.ips.has(ip) || p.visitantes.has(visitante)) return true;
  if (v?.tipo !== "reenvio") return false;
  const sesion = p.ipsSesion.get(ip);
  return !!sesion && Math.abs(v.ocurrioEn.getTime() - sesion.getTime()) <= VENTANA_REENVIO_PROPIO_MS;
}

async function leerJson<T>(clave: string, vacio: T): Promise<T> {
  try { return JSON.parse(await leerConfig(clave)) as T; } catch { return vacio; }
}

async function leerMapaFechas(clave: string): Promise<Record<string, string>> {
  const m = await leerJson<unknown>(clave, {});
  return m && typeof m === "object" && !Array.isArray(m) ? (m as Record<string, string>) : {};
}
const leerVisitantesSesion = () => leerMapaFechas(CLAVES.rastroVisitantesSesion);
const leerIpsSesion = () => leerMapaFechas(CLAVES.rastroIpsSesion);

// Los mas recientes primero, con tope
const recortar = (mapa: Record<string, string>, tope: number) =>
  Object.fromEntries(Object.entries(mapa).sort((a, b) => Date.parse(b[1]) - Date.parse(a[1])).slice(0, tope));

export async function leerIpsPropias(): Promise<string[]> {
  const l = await leerJson<unknown>(CLAVES.rastroIpsPropias, []);
  return Array.isArray(l) ? l.filter((x): x is string => typeof x === "string") : [];
}

export async function cargarPropios(ahora: Date = new Date()): Promise<Propios> {
  const desde = ahora.getTime() - DIAS_SESION_PROPIA * 86400_000;
  const visitantes = new Set<string>();
  for (const [v, iso] of Object.entries(await leerVisitantesSesion())) {
    const t = Date.parse(iso);
    if (Number.isFinite(t) && (t >= desde || new Date(t).getUTCFullYear() >= 2099)) visitantes.add(v);
  }
  const ipsSesion = new Map<string, Date>();
  for (const [ip, iso] of Object.entries(await leerIpsSesion())) {
    const t = Date.parse(iso);
    if (Number.isFinite(t)) ipsSesion.set(ip, new Date(t));
  }
  return { ips: new Set(await leerIpsPropias()), visitantes, ipsSesion };
}

// Lo llama sesionActual en cada pagina del panel: quien entra al panel es propio.
// Anota el visitante (IP+UA) y la IP sola. Leer-modificar-escribir sin bloqueo: perder una anotacion entre dos
// sesiones simultaneas no importa.
export async function anotarVisitanteSesion(ip: string, ua: string, ahora: Date = new Date()): Promise<void> {
  const visitante = visitanteDe(ip, ua);
  const [visitantes, ips] = await Promise.all([leerVisitantesSesion(), leerIpsSesion()]);
  // Anotado hace menos de una hora (o marcado a mano con fecha 2099): no se escribe.
  const fresca = (iso: string | undefined) => { const t = Date.parse(iso ?? ""); return Number.isFinite(t) && ahora.getTime() - t < UNA_HORA; };
  const cambiaVisitante = !fresca(visitantes[visitante]);
  const cambiaIp = ip !== "" && ip !== "desconocida" && !fresca(ips[ip]);
  if (cambiaVisitante) {
    visitantes[visitante] = ahora.toISOString();
    await guardarConfig(CLAVES.rastroVisitantesSesion, JSON.stringify(recortar(visitantes, MAX_VISITANTES_SESION)));
  }
  if (cambiaIp) {
    ips[ip] = ahora.toISOString();
    await guardarConfig(CLAVES.rastroIpsSesion, JSON.stringify(recortar(ips, MAX_IPS_SESION)));
  }
}

export async function marcarVisitantePropio(visitante: string): Promise<number> {
  const mapa = await leerVisitantesSesion();
  mapa[visitante] = FECHA_PERMANENTE;
  await guardarConfig(CLAVES.rastroVisitantesSesion, JSON.stringify(mapa));
  const propias = await prisma.visitaEnlace.updateMany({ where: { visitante }, data: { propia: true } });
  // El reenvio que visitasDe le muestra con este visitante (alias por IP) tambien es suyo: sin esto «Es mío» no lo quita.
  const ips = (await prisma.visitaEnlace.findMany({ where: { visitante }, distinct: ["ip"], select: { ip: true } })).map((f) => f.ip);
  const reenvios = ips.length ? await prisma.visitaEnlace.updateMany({ where: { tipo: "reenvio", ip: { in: ips }, propia: false }, data: { propia: true } }) : { count: 0 };
  return propias.count + reenvios.count;
}

const RE_IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const RE_IPV6 = /^[0-9a-fA-F:]+$/;
const pareceIp = (s: string) => RE_IPV4.test(s) || (s.includes(":") && RE_IPV6.test(s));

export async function guardarIpsPropias(lista: string[]): Promise<void> {
  const limpias = [...new Set(lista.map((s) => s.trim()).filter(pareceIp))];
  await guardarConfig(CLAVES.rastroIpsPropias, JSON.stringify(limpias));
  if (limpias.length) await prisma.visitaEnlace.updateMany({ where: { ip: { in: limpias } }, data: { propia: true } });
}

// ---- visitas ----

export async function insertarVisitas(vs: VisitaNueva[], propios: Propios): Promise<number> {
  if (!vs.length) return 0;
  const r = await prisma.visitaEnlace.createMany({
    skipDuplicates: true, // la huella es unica: releer el mismo log no duplica
    data: vs.map((v) => ({
      enlaceId: v.enlaceId, fuente: v.fuente, tipo: v.tipo, visitante: v.visitante, ip: corto(v.ip, 45), ua: corto(v.ua, 300),
      aparato: corto(v.aparato, 60), pais: corto(v.pais, 60), ciudad: corto(v.ciudad, 80), red: v.red, geoPendiente: v.geoPendiente,
      ruta: corto(v.ruta, 200), detalle: corto(v.detalle, 40), origen: corto(v.origen, 120), segundos: v.segundos, scroll: v.scroll,
      huella: v.huella, ocurrioEn: v.ocurrioEn, propia: esPropia(v.ip, v.visitante, propios, v),
    })),
  });
  return r.count;
}

const DIAS_PODA = 400;

// Spec §2a: las visitas se guardan 400 dias. La corre el script del cron una vez por pasada.
export async function podarVisitasViejas(ahora: Date = new Date()): Promise<number> {
  const limite = new Date(ahora.getTime() - DIAS_PODA * 86400_000);
  return (await prisma.visitaEnlace.deleteMany({ where: { ocurrioEn: { lt: limite } } })).count;
}

export async function visitasDe(prospectoId: number, limite = 500): Promise<VisitaFila[]> {
  const filas = await prisma.visitaEnlace.findMany({
    where: { enlace: { prospectoId } },
    orderBy: { ocurrioEn: "desc" },
    take: limite,
    include: { enlace: { select: { etiqueta: true } } },
  });
  // Alias del reenvio: la vista previa sale de la misma IP que el navegador de quien reenvio. Un reenvio cuyo
  // visitante no abrio nada en este prospecto toma el visitante y el aparato de una fila no-reenvio con su IP
  // (la mas reciente). Solo en lo devuelto: la base no cambia.
  const abrieron = new Set(filas.filter((f) => f.tipo === "vista" || f.tipo === "inicio").map((f) => f.visitante));
  const porIp = new Map<string, { visitante: string; aparato: string }>();
  // Solo de filas no propias: un reenvio ajeno no se disfraza de visitante de Neri.
  for (const f of filas) if (f.tipo !== "reenvio" && !f.propia && !porIp.has(f.ip)) porIp.set(f.ip, { visitante: f.visitante, aparato: f.aparato });
  const alias = (f: (typeof filas)[number]) => (f.tipo === "reenvio" && !abrieron.has(f.visitante) ? porIp.get(f.ip) : undefined);
  // Sin ip ni ua: la IP se guarda pero no se muestra.
  return filas.map((f) => ({
    id: f.id, enlaceId: f.enlaceId, etiqueta: f.enlace.etiqueta, fuente: f.fuente as VisitaFila["fuente"], tipo: f.tipo, visitante: alias(f)?.visitante ?? f.visitante,
    aparato: alias(f)?.aparato ?? f.aparato, pais: f.pais, ciudad: f.ciudad, red: f.red, geoPendiente: f.geoPendiente, ruta: f.ruta, detalle: f.detalle,
    origen: f.origen, segundos: f.segundos, scroll: f.scroll, propia: f.propia, ocurrioEn: f.ocurrioEn,
  }));
}

// Dos consultas en total, sin importar cuantos prospectos haya en el tablero.
// La tarjeta nombra el enlace que el prospecto abrio de ultimo (nunca uno que no abrio);
// si no abrio ninguno, el enviado mas reciente con "Sin abrir".
export async function resumenesParaTablero(prospectoIds: number[], ahora: Date = new Date()): Promise<Map<number, string>> {
  const m = new Map<number, string>();
  if (!prospectoIds.length) return m;
  const enlaces = await prisma.enlaceEnviado.findMany({
    where: { prospectoId: { in: prospectoIds } },
    orderBy: [{ enviadoEn: "desc" }, { id: "desc" }],
    select: { id: true, prospectoId: true, etiqueta: true, enviadoEn: true },
  });
  if (!enlaces.length) return m;
  const grupos = await prisma.visitaEnlace.groupBy({
    by: ["enlaceId", "visitante", "tipo"],
    where: { enlaceId: { in: enlaces.map((e) => e.id) }, propia: false, tipo: { in: ["vista", "inicio", "reenvio"] } },
    _max: { ocurrioEn: true },
  });
  const porId = new Map(enlaces.map((e) => [e.id, e]));
  type Acumulado = { enlace: (typeof enlaces)[number]; ultimaApertura: Date | null; visitantes: Set<string>; reenvio: boolean };
  const datos = new Map<number, Acumulado>();
  // Los enlaces vienen del mas reciente al mas viejo: el primero de cada prospecto es el de "Sin abrir".
  for (const e of enlaces) if (!datos.has(e.prospectoId)) datos.set(e.prospectoId, { enlace: e, ultimaApertura: null, visitantes: new Set(), reenvio: false });
  for (const g of grupos) {
    const e = porId.get(g.enlaceId)!;
    const d = datos.get(e.prospectoId)!;
    if (g.tipo === "reenvio") { d.reenvio = true; continue; }
    d.visitantes.add(g.visitante);
    const t = g._max.ocurrioEn;
    if (t && (!d.ultimaApertura || t > d.ultimaApertura)) { d.ultimaApertura = t; d.enlace = e; }
  }
  for (const [id, d] of datos) {
    m.set(id, resumenTarjeta({ etiqueta: d.enlace.etiqueta, enviadoEn: d.enlace.enviadoEn, ultimaApertura: d.ultimaApertura, visitantes: d.visitantes.size, reenvio: d.reenvio }, ahora));
  }
  return m;
}

export async function registrarEventoJs(e: EventoJsNormal, ip: string, ua: string): Promise<boolean> {
  const enlace = await prisma.enlaceEnviado.findFirst({ where: { token: e.token, activo: true }, select: { id: true } });
  if (!enlace) return false;
  const visitante = visitanteDe(ip, ua);
  await prisma.visitaEnlace.create({
    data: {
      enlaceId: enlace.id, fuente: "js", tipo: e.tipo, visitante, ip: corto(ip, 45), ua: corto(ua, 300), aparato: corto(resumirAparato(ua), 60),
      geoPendiente: true, ruta: corto(e.ruta, 200), detalle: corto(e.detalle, 40), origen: corto(e.origen, 120), segundos: e.segundos, scroll: e.scroll,
      ocurrioEn: new Date(), propia: esPropia(ip, visitante, await cargarPropios()),
    },
  });
  return true;
}
