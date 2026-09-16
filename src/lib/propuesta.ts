// src/lib/propuesta.ts
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const DIR_PLANTILLAS = path.join(process.cwd(), "plantillas");
const dirArchivos = () => process.env.PROSPECTOS_DIR_ARCHIVOS ?? "/home/neracosu/prospectos-archivos";

export async function leerPlantilla(slug: string): Promise<string | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  try { return await readFile(path.join(DIR_PLANTILLAS, `${slug}.html`), "utf8"); } catch { return null; }
}

// La clave de cache es el contenido ya renderizado (plantilla + nombre), no la
// plantilla sola: dos prospectos con la misma plantilla pero nombre distinto
// no deben compartir PDF.
export function rutaPdf(codigo: string, hashContenido: string): string {
  return path.join(dirArchivos(), "propuestas", `${codigo}-${hashContenido}.pdf`);
}

export function hashDe(texto: string): string {
  return createHash("sha256").update(texto).digest("hex").slice(0, 12);
}

// --- Fila global de generacion -------------------------------------------
// El daemon PM2 de este servidor es compartido con otros sitios (incluido uno
// que cobra plata real): no se deja mas de una generacion de PDF con Chromium
// corriendo a la vez en todo el proceso, para que una tormenta de descargas
// aca no le robe CPU/RAM a los demas. Quien espera mas de 20s su turno se
// rinde en vez de seguir haciendo fila indefinidamente.
const ESPERA_MAXIMA_MS = 20_000;
let colaGlobal: Promise<void> = Promise.resolve();
let generaciones = 0;

async function conTurnoGlobal<T>(tarea: () => Promise<T>): Promise<T> {
  let liberar!: () => void;
  const miEslabon = new Promise<void>((resolve) => { liberar = resolve; });
  const turnoAnterior = colaGlobal;
  colaGlobal = miEslabon; // el siguiente en la fila espera a que YO libere
  const gane = await Promise.race([
    turnoAnterior.then(() => true as const),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), ESPERA_MAXIMA_MS)),
  ]);
  if (!gane) {
    // Nos rendimos, pero SIN liberar ya mismo: si liberaramos ahora, a quien
    // viene detras (que espera nuestro eslabon) le pareceria libre la fila
    // aunque el dueno real de antes siga generando su PDF, y arrancarian dos
    // Chromium a la vez. En cambio encadenamos: nuestro eslabon se resuelve
    // recien cuando de verdad termine el turno anterior.
    turnoAnterior.finally(liberar);
    throw new Error("PDF_OCUPADO");
  }
  try {
    return await tarea();
  } finally {
    liberar();
  }
}

// Solo para tests: cuenta cuantas veces se lanzo Chromium de verdad.
export function _generacionesParaTests(): number {
  return generaciones;
}

// Llamadas concurrentes para el mismo archivo esperan la misma promesa en vez
// de generar el PDF por duplicado.
const enVuelo = new Map<string, Promise<string>>();

// Genera el PDF con Playwright (mismo criterio que ~/propuestas/hoteles/pdf.cjs) y lo
// guarda fuera del docroot. Si ya existe para este contenido, no regenera.
export async function generarPdf(codigo: string, html: string, hashContenido: string): Promise<string> {
  const salida = rutaPdf(codigo, hashContenido);
  const existente = enVuelo.get(salida);
  if (existente) return existente;
  const promesa = generarUnaVez(salida, html).finally(() => { enVuelo.delete(salida); });
  enVuelo.set(salida, promesa);
  return promesa;
}

async function generarUnaVez(salida: string, html: string): Promise<string> {
  try { await stat(salida); return salida; } catch { /* no existe: generar */ }
  await mkdir(path.dirname(salida), { recursive: true, mode: 0o700 });
  return conTurnoGlobal(async () => {
    // Pudo haberse escrito mientras esperabamos el turno (otra llamada, otro
    // proceso): revisar de nuevo antes de gastar un Chromium entero.
    try { await stat(salida); return salida; } catch { /* sigue sin existir */ }
    generaciones += 1;
    const { chromium } = await import("playwright");
    const b = await chromium.launch();
    try {
      const p = await b.newPage();
      try {
        await p.setContent(html, { waitUntil: "networkidle", timeout: 30_000 });
      } catch {
        // Si Google Fonts no responde (red bloqueada), seguir con "load" y
        // esperar solo las fuentes en vez de la quietud total de la red.
        await p.setContent(html, { waitUntil: "load", timeout: 30_000 });
      }
      await p.evaluate(async () => { await (document as any).fonts.ready; });
      await p.emulateMedia({ media: "print" });
      const pdf = await p.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
      // Escritura atomica: nunca se debe leer un archivo a medio escribir.
      const temporal = `${salida}.${process.pid}.${randomUUID()}.tmp`;
      await writeFile(temporal, pdf, { mode: 0o600 });
      await rename(temporal, salida);
    } finally {
      await b.close();
    }
    return salida;
  });
}
