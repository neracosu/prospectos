// src/lib/rastro-lector.ts — lee los access-logs de Apache y los convierte en visitas a enlaces enviados.
// El log vivo se trunca cada dia (cPanel lo pasa al .gz del mes): si el archivo encogio o cambio de inode,
// se relee el .gz del mes en curso y despues el vivo desde cero; la huella unica evita duplicar.
// Lo puro (visitasDeLinea) no toca archivos ni base, para probarlo solo.
import { closeSync, createReadStream, existsSync, openSync, readdirSync, readSync, statSync } from "node:fs";
import { join } from "node:path";
import { pipeline } from "node:stream";
import { createGunzip } from "node:zlib";
import { prisma } from "@/lib/db";
import { hoyCaracas } from "@/lib/fecha-caracas";
import {
  parsearLinea, clasificarUa, resumirAparato, visitanteDe, huellaDe, rutaPagina, esPdf, enlaceQueCoincide, PATRON_P,
  type LineaLog,
} from "@/lib/rastro-contrato";
import {
  enlacesActivosPorHost, obtenerOCrearEnlacePlantilla, insertarVisitas, cargarPropios, esPropia,
  type EnlaceFila, type VisitaNueva, type Propios,
} from "@/lib/rastro";

export type OpcionesLector = { dirLogs?: string; dirArchivo?: string; hosts?: string[]; desdeCero?: boolean; soloPrefijo?: { host: string; prefijo: string }; silencioso?: boolean };
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

type Filtro = { prefijo?: string; desde?: Date; ensayo?: boolean };

class Procesador {
  lineas = 0;
  visitas = 0;
  private lote: VisitaNueva[] = [];
  // codigo -> fila (o null) y si ya se intento crearla
  private plantillas = new Map<string, { enlace: EnlaceFila | null; conCrear: boolean }>();
  readonly enlacesConVisita = new Set<number>();

  constructor(private enlaces: Map<string, EnlaceFila[]>, private propios: Propios, private filtro: Filtro = {}) {}

  private enlacesDe(host: string): EnlaceFila[] {
    const todos = this.enlaces.get(host) ?? [];
    return this.filtro.prefijo === undefined ? todos : todos.filter((e) => e.prefijo === this.filtro.prefijo);
  }

  private async plantilla(codigo: string, crear: boolean): Promise<EnlaceFila | null> {
    const previa = this.plantillas.get(codigo);
    if (previa && (previa.enlace || previa.conCrear || !crear)) return previa.enlace;
    const enlace = await obtenerOCrearEnlacePlantilla(codigo, { crear });
    this.plantillas.set(codigo, { enlace, conCrear: crear });
    return enlace;
  }

  private async existeProspecto(codigo: string): Promise<boolean> {
    return (await prisma.prospecto.count({ where: { codigo } })) > 0;
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
      // la linea cuenta (no es robot, ni 404, ni POST) se busca el enlace de verdad. Se crea solo si la linea
      // no es propia (Neri mirando su propio /p/ no prueba que se envio) y nunca en un ensayo.
      const m = PATRON_P.exec(rutaPagina(l.ruta) ?? "");
      const prefijo = m ? `/p/${m[1]}` : "";
      const provisional = m && (this.filtro.prefijo === undefined || this.filtro.prefijo === prefijo) ? visitasDeLinea(l, [{ id: 0, prefijo }], crudo) : null;
      if (m && provisional) {
        const propia = esPropia(provisional.ip, provisional.visitante, this.propios, provisional);
        const e = await this.plantilla(m[1], !propia && !this.filtro.ensayo);
        if (e) {
          if (e.activo) v = visitasDeLinea(l, [e], crudo);
        } else if (this.filtro.ensayo && !propia && (await this.existeProspecto(m[1]))) {
          v = provisional; // el ensayo cuenta lo que importaria sin crear la fila
        }
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
    // ensayo: se cuentan las que coinciden (pueden incluir huellas ya guardadas) y no se escribe nada
    this.visitas += this.filtro.ensayo ? lote.length : await insertarVisitas(lote, this.propios);
    for (const v of lote) this.enlacesConVisita.add(v.enlaceId);
  }
}

// ---- lectura de archivos ----

// Parte un flujo de bytes en lineas completas; `bytes` cuenta hasta el salto de linea incluido.
// Con `conResto` tambien entrega la ultima linea sin salto (archivos cerrados como el .gz).
async function* lineasDe(flujo: AsyncIterable<Buffer>, conResto = false): AsyncGenerator<{ linea: string; bytes: number }> {
  let resto = Buffer.alloc(0);
  for await (const trozo of flujo) {
    let buf = resto.length ? Buffer.concat([resto, trozo]) : trozo;
    let corte: number;
    while ((corte = buf.indexOf(0x0a)) !== -1) {
      yield { linea: buf.subarray(0, corte).toString("utf8").replace(/\r$/, ""), bytes: corte + 1 };
      buf = buf.subarray(corte + 1);
    }
    resto = Buffer.from(buf);
  }
  if (conResto && resto.length) yield { linea: resto.toString("utf8").replace(/\r$/, ""), bytes: resto.length };
}

// Lee desde `inicio` solo las lineas completas: una linea a medio escribir queda para la proxima pasada.
// Devuelve la posicion en bytes justo despues del ultimo salto de linea leido.
async function leerVivo(ruta: string, inicio: number, alLinea: (s: string) => Promise<void>): Promise<number> {
  let posicion = inicio;
  for await (const { linea, bytes } of lineasDe(createReadStream(ruta, { start: inicio }))) {
    await alLinea(linea);
    posicion += bytes;
  }
  return posicion;
}

// Node descomprime los .gz de varios miembros (cPanel agrega uno por dia) sin nada especial.
// pipeline propaga el error de cualquier tramo (EACCES, gz cortado) al for await.
async function leerGz(ruta: string, alLinea: (s: string) => Promise<void>): Promise<void> {
  const flujo = pipeline(createReadStream(ruta), createGunzip(), () => {});
  for await (const { linea } of lineasDe(flujo, true)) await alLinea(linea);
}

const nombreMes = (d: Date) => `${d.toLocaleString("en-US", { month: "short" })}-${d.getFullYear()}`;

// El mes anterior va primero: lo escrito entre la ultima pasada y la rotacion de fin de mes quedo alli.
function mesesARevisar(ahora = new Date()): string[] {
  return [nombreMes(new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1)), nombreMes(ahora)];
}

// Mismo inode y no encogio, pero si el byte anterior a la posicion no es un salto de linea,
// el archivo se trunco y volvio a crecer por encima de la posicion: hay que releerlo.
function sigueIgual(ruta: string, posicion: number): boolean {
  if (posicion === 0) return true;
  const fd = openSync(ruta, "r");
  try {
    const b = Buffer.alloc(1);
    return readSync(fd, b, 0, 1, posicion - 1) === 1 && b[0] === 0x0a;
  } finally {
    closeSync(fd);
  }
}

const avisarError = (ruta: string, err: unknown) => console.error(`[rastro] error en ${ruta}: ${err instanceof Error ? err.message : String(err)}`);

async function leerHost(host: string, p: Procesador, o: OpcionesLector, guardarEstado: boolean, releidos: string[]): Promise<void> {
  const dirLogs = dirLogsDe(o);
  for (const nombre of [`${host}-ssl_log`, host]) {
    const ruta = join(dirLogs, nombre);
    let st: ReturnType<typeof statSync>;
    try { st = statSync(ruta); } catch { continue; } // sin ese archivo: nada que leer
    if (!st.isFile()) continue;
    const alLinea = (s: string) => p.linea(host, s);
    // Un archivo que falla (permisos, gz cortado) no tumba la pasada ni guarda su posicion: se reintenta en la proxima.
    try {
      let inicio = 0;
      if (!o.desdeCero) {
        const previa = await prisma.lecturaLog.findUnique({ where: { archivo: ruta } });
        if (previa) {
          const pos = Number(previa.posicion);
          if (previa.inode === BigInt(st.ino) && st.size >= pos && sigueIgual(ruta, pos)) {
            inicio = pos;
          } else {
            // Rotado o truncado: lo que faltaba por leer quedo en el .gz del mes (o del anterior, a fin de mes).
            for (const mes of mesesARevisar()) {
              const gz = join(dirArchivoDe(o), `${nombre}-${mes}.gz`);
              if (!existsSync(gz)) continue;
              // Un gz roto no impide leer el vivo: se avisa y se sigue.
              try { await leerGz(gz, alLinea); releidos.push(gz); } catch (err) { avisarError(gz, err); }
            }
          }
        }
      }
      const posicion = await leerVivo(ruta, inicio, alLinea);
      await p.vaciar();
      if (guardarEstado) {
        const datos = { inode: BigInt(st.ino), posicion: BigInt(posicion), leidoEn: new Date() };
        await prisma.lecturaLog.upsert({ where: { archivo: ruta }, create: { archivo: ruta, ...datos }, update: datos });
      }
    } catch (err) {
      avisarError(ruta, err);
      await p.vaciar();
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
    // El candado evita trabajo doble; la garantia final contra duplicados es la huella unica de VisitaEnlace.
    await tx.$queryRaw`SELECT clave FROM Configuracion WHERE clave = 'candado_rastro' FOR UPDATE`;
    const enlaces = await enlacesActivosPorHost();
    const hosts = o.soloPrefijo ? [o.soloPrefijo.host] : o.hosts ?? [...new Set([...enlaces.keys(), HOST_PANEL])];
    const p = new Procesador(enlaces, await cargarPropios(), { prefijo: o.soloPrefijo?.prefijo });
    // Con soloPrefijo se saltan las lineas de otros enlaces: guardar la posicion las perderia.
    const guardarEstado = !o.soloPrefijo;
    const releidos: string[] = [];
    for (const host of hosts) await leerHost(host, p, o, guardarEstado, releidos);
    if (!o.silencioso) avisar(p);
    return { lineas: p.lineas, visitas: p.visitas, archivosReleidos: releidos };
  }, { timeout: 300_000, maxWait: 60_000 });
}

const escaparRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Carga la historia de un host desde todos sus .gz (p. ej. al registrar un enlace enviado hace dias).
// No toca LecturaLog: la huella unica evita duplicar lo que el lector ya guardo.
export async function importarArchivados(o: { host: string; prefijo?: string; desde?: Date; dirArchivo?: string; ensayo?: boolean }): Promise<ResultadoLectura> {
  const dir = dirArchivoDe(o);
  const re = new RegExp(`^${escaparRe(o.host)}-(ssl_log-)?[A-Z][a-z]{2}-\\d{4}\\.gz$`);
  let nombres: string[];
  try { nombres = readdirSync(dir).filter((n) => re.test(n)).sort(); } catch { nombres = []; }
  const p = new Procesador(await enlacesActivosPorHost(), await cargarPropios(), { prefijo: o.prefijo, desde: o.desde, ensayo: o.ensayo });
  for (const n of nombres) {
    const ruta = join(dir, n);
    try { await leerGz(ruta, (s) => p.linea(o.host, s)); } catch (err) { avisarError(ruta, err); }
    await p.vaciar();
  }
  if (!o.ensayo) avisar(p);
  return { lineas: p.lineas, visitas: p.visitas, archivosReleidos: [] };
}
