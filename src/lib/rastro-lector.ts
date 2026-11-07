// src/lib/rastro-lector.ts — lee los access-logs de Apache y los convierte en visitas a enlaces enviados.
// El log vivo se trunca cada dia (cPanel lo pasa al .gz del mes): si el archivo encogio o cambio de inode,
// se relee el .gz del mes en curso y despues el vivo desde cero; la huella unica evita duplicar.
// Lo puro (visitasDeLinea) no toca archivos ni base, para probarlo solo.
import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { createGunzip } from "node:zlib";
import { prisma } from "@/lib/db";
import { hoyCaracas } from "@/lib/fecha-caracas";
import {
  parsearLinea, clasificarUa, resumirAparato, visitanteDe, huellaDe, rutaPagina, esPdf, enlaceQueCoincide, PATRON_P,
  type LineaLog,
} from "@/lib/rastro-contrato";
import {
  enlacesActivosPorHost, obtenerOCrearEnlacePlantilla, insertarVisitas, cargarPropios,
  type EnlaceFila, type VisitaNueva, type Propios,
} from "@/lib/rastro";

export type OpcionesLector = { dirLogs?: string; dirArchivo?: string; hosts?: string[]; desdeCero?: boolean; soloPrefijo?: { host: string; prefijo: string } };
export type ResultadoLectura = { lineas: number; visitas: number; archivosReleidos: string[] };

export const DIR_LOGS_DEFECTO = "/home/neracosu/access-logs";
export const DIR_ARCHIVO_DEFECTO = "/home/neracosu/logs";

const HOST_PANEL = "prospectos.neracosu.com";
const LOTE = 500;
const ESTADOS_VALIDOS = new Set([200, 206, 304]);

const dirLogsDe = (o: { dirLogs?: string }) => o.dirLogs ?? process.env.RASTRO_DIR_LOGS ?? DIR_LOGS_DEFECTO;
const dirArchivoDe = (o: { dirArchivo?: string }) => o.dirArchivo ?? process.env.RASTRO_DIR_ARCHIVO ?? DIR_ARCHIVO_DEFECTO;

function origenDe(referer: string): string {
  if (!referer) return "";
  let host: string;
  try { host = new URL(referer).hostname.toLowerCase(); } catch { return ""; }
  return host === "neracosu.com" || host.endsWith(".neracosu.com") ? "" : host;
}

// Pura. Solo necesita id y prefijo del enlace: el lector la prueba con un enlace provisional antes de crear el de /p/.
export function visitasDeLinea(l: LineaLog, enlacesDelHost: Pick<EnlaceFila, "id" | "prefijo">[], crudo: string): VisitaNueva | null {
  if (l.metodo !== "GET" || !ESTADOS_VALIDOS.has(l.estado)) return null;
  const ruta = rutaPagina(l.ruta);
  if (ruta === null) return null;
  const enlace = enlaceQueCoincide(ruta, enlacesDelHost);
  if (!enlace) return null;
  const ua = clasificarUa(l.ua);
  if (ua.clase === "robot") return null;
  const pdf = esPdf(l.ruta) || Boolean(PATRON_P.exec(ruta)?.[2]);
  const tipo = ua.clase === "reenvio" ? "reenvio" : pdf ? "pdf" : "vista";
  return {
    enlaceId: enlace.id, fuente: "log", tipo, visitante: visitanteDe(l.ip, l.ua), ip: l.ip, ua: l.ua,
    aparato: ua.clase === "visita" ? resumirAparato(l.ua) : "", pais: "", ciudad: "", red: "", geoPendiente: true,
    ruta, detalle: ua.clase === "reenvio" ? ua.app : "", origen: origenDe(l.referer), segundos: null, scroll: null,
    huella: huellaDe(crudo), ocurrioEn: l.fecha,
  };
}

// ---- procesador de lineas de una pasada (enlaces, cache de /p/, lotes) ----

type Filtro = { prefijo?: string; desde?: Date };

class Procesador {
  lineas = 0;
  visitas = 0;
  private lote: VisitaNueva[] = [];
  private plantillas = new Map<string, EnlaceFila | null>();
  readonly enlacesConVisita = new Set<number>();

  constructor(private enlaces: Map<string, EnlaceFila[]>, private propios: Propios, private filtro: Filtro = {}) {}

  private enlacesDe(host: string): EnlaceFila[] {
    const todos = this.enlaces.get(host) ?? [];
    return this.filtro.prefijo === undefined ? todos : todos.filter((e) => e.prefijo === this.filtro.prefijo);
  }

  private async plantilla(codigo: string): Promise<EnlaceFila | null> {
    if (!this.plantillas.has(codigo)) this.plantillas.set(codigo, await obtenerOCrearEnlacePlantilla(codigo));
    return this.plantillas.get(codigo)!;
  }

  async linea(host: string, crudo: string): Promise<void> {
    if (!crudo.trim()) return;
    this.lineas++;
    const l = parsearLinea(crudo);
    if (!l) return;
    if (this.filtro.desde && l.fecha < this.filtro.desde) return;
    let v = visitasDeLinea(l, this.enlacesDe(host), crudo);
    if (!v && host === HOST_PANEL) {
      // La propuesta /p/<codigo> no se registra a mano: se prueba con un enlace provisional y solo si
      // la linea cuenta (no es robot, ni 404, ni POST) se busca o crea el enlace de verdad.
      const m = PATRON_P.exec(rutaPagina(l.ruta) ?? "");
      const prefijo = m ? `/p/${m[1]}` : "";
      if (m && (this.filtro.prefijo === undefined || this.filtro.prefijo === prefijo) && visitasDeLinea(l, [{ id: 0, prefijo }], crudo)) {
        const e = await this.plantilla(m[1]);
        if (e?.activo) v = visitasDeLinea(l, [e], crudo);
      }
    }
    if (!v) return;
    this.lote.push(v);
    if (this.lote.length >= LOTE) await this.vaciar();
  }

  async vaciar(): Promise<void> {
    if (!this.lote.length) return;
    const lote = this.lote;
    this.lote = [];
    this.visitas += await insertarVisitas(lote, this.propios);
    for (const v of lote) this.enlacesConVisita.add(v.enlaceId);
  }
}

// ---- lectura de archivos ----

// Lee desde `inicio` solo las lineas completas: una linea a medio escribir queda para la proxima pasada.
// Devuelve la posicion en bytes justo despues del ultimo salto de linea leido.
async function leerVivo(ruta: string, inicio: number, alLinea: (s: string) => Promise<void>): Promise<number> {
  let posicion = inicio;
  let resto = Buffer.alloc(0);
  for await (const trozo of createReadStream(ruta, { start: inicio })) {
    let buf = resto.length ? Buffer.concat([resto, trozo as Buffer]) : (trozo as Buffer);
    let corte: number;
    while ((corte = buf.indexOf(0x0a)) !== -1) {
      await alLinea(buf.subarray(0, corte).toString("utf8").replace(/\r$/, ""));
      posicion += corte + 1;
      buf = buf.subarray(corte + 1);
    }
    resto = Buffer.from(buf);
  }
  return posicion;
}

// Node descomprime los .gz de varios miembros (cPanel agrega uno por dia) sin nada especial.
async function leerGz(ruta: string, alLinea: (s: string) => Promise<void>): Promise<void> {
  const rl = createInterface({ input: createReadStream(ruta).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const linea of rl) await alLinea(linea);
}

function mesEnCurso(ahora = new Date()): string {
  return `${ahora.toLocaleString("en-US", { month: "short" })}-${ahora.getFullYear()}`;
}

async function leerHost(host: string, p: Procesador, o: OpcionesLector, guardarEstado: boolean, releidos: string[]): Promise<void> {
  const dirLogs = dirLogsDe(o);
  for (const nombre of [`${host}-ssl_log`, host]) {
    const ruta = join(dirLogs, nombre);
    let st: ReturnType<typeof statSync>;
    try { st = statSync(ruta); } catch { continue; } // sin ese archivo: nada que leer
    if (!st.isFile()) continue;
    const alLinea = (s: string) => p.linea(host, s);
    let inicio = 0;
    if (!o.desdeCero) {
      const previa = await prisma.lecturaLog.findUnique({ where: { archivo: ruta } });
      if (previa) {
        if (previa.inode !== BigInt(st.ino) || st.size < Number(previa.posicion)) {
          // Rotado o truncado: lo que faltaba por leer quedo en el .gz del mes.
          const gz = join(dirArchivoDe(o), `${nombre}-${mesEnCurso()}.gz`);
          if (existsSync(gz)) await leerGz(gz, alLinea);
          releidos.push(ruta);
        } else {
          inicio = Number(previa.posicion);
        }
      }
    }
    const posicion = await leerVivo(ruta, inicio, alLinea);
    await p.vaciar();
    if (guardarEstado) {
      const datos = { inode: BigInt(st.ino), posicion: BigInt(posicion), leidoEn: new Date() };
      await prisma.lecturaLog.upsert({ where: { archivo: ruta }, create: { archivo: ruta, ...datos }, update: datos });
    }
  }
}

function avisar(p: Procesador): void {
  if (!p.visitas) return;
  const hora = new Intl.DateTimeFormat("es-VE", { timeZone: "America/Caracas", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  console.log(`[rastro] ${hoyCaracas()} ${hora}: ${p.lineas} lineas, ${p.visitas} visitas, ${p.enlacesConVisita.size} enlaces`);
}

export async function leerLogs(o: OpcionesLector = {}): Promise<ResultadoLectura> {
  // La fila la siembra la migracion; esto es respaldo para una base sin ella.
  await prisma.$executeRaw`INSERT IGNORE INTO Configuracion (clave, valor) VALUES ('candado_rastro', '1')`;
  return prisma.$transaction(async (tx) => {
    // Dos pasadas a la vez (cron + alta de enlace) se ponen en fila: la segunda ve la posicion ya guardada.
    await tx.$queryRaw`SELECT clave FROM Configuracion WHERE clave = 'candado_rastro' FOR UPDATE`;
    const enlaces = await enlacesActivosPorHost();
    const hosts = o.soloPrefijo ? [o.soloPrefijo.host] : o.hosts ?? [...new Set([...enlaces.keys(), HOST_PANEL])];
    const p = new Procesador(enlaces, await cargarPropios(), { prefijo: o.soloPrefijo?.prefijo });
    // Con soloPrefijo se saltan las lineas de otros enlaces: guardar la posicion las perderia.
    const guardarEstado = !o.soloPrefijo;
    const releidos: string[] = [];
    for (const host of hosts) await leerHost(host, p, o, guardarEstado, releidos);
    avisar(p);
    return { lineas: p.lineas, visitas: p.visitas, archivosReleidos: releidos };
  }, { timeout: 60_000, maxWait: 60_000 });
}

const escaparRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Carga la historia de un host desde todos sus .gz (p. ej. al registrar un enlace enviado hace dias).
// No toca LecturaLog: la huella unica evita duplicar lo que el lector ya guardo.
export async function importarArchivados(o: { host: string; prefijo?: string; desde?: Date; dirArchivo?: string }): Promise<ResultadoLectura> {
  const dir = dirArchivoDe(o);
  const re = new RegExp(`^${escaparRe(o.host)}-(ssl_log-)?[A-Z][a-z]{2}-\\d{4}\\.gz$`);
  let nombres: string[];
  try { nombres = readdirSync(dir).filter((n) => re.test(n)).sort(); } catch { nombres = []; }
  const p = new Procesador(await enlacesActivosPorHost(), await cargarPropios(), { prefijo: o.prefijo, desde: o.desde });
  for (const n of nombres) {
    await leerGz(join(dir, n), (s) => p.linea(o.host, s));
    await p.vaciar();
  }
  avisar(p);
  return { lineas: p.lineas, visitas: p.visitas, archivosReleidos: [] };
}
