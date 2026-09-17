// src/lib/pdf.ts — HTML -> PDF con Playwright. Lo comparten las propuestas y los recibos.
// Usa node: -> NO importarlo desde la cadena de src/instrumentation.ts (ver CLAUDE.md).
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

// --- Fila global de generacion -------------------------------------------
// El daemon PM2 de este servidor es compartido con otros sitios (incluido uno
// que cobra plata real): no se deja mas de una generacion de PDF con Chromium
// corriendo a la vez en todo el proceso, para que una tormenta de descargas
// aca no le robe CPU/RAM a los demas. Quien espera mas de 20s su turno se
// rinde en vez de seguir haciendo fila indefinidamente.
const ESPERA_MAXIMA_MS = 20_000;
let colaGlobal: Promise<void> = Promise.resolve();
let generaciones = 0;

export async function conTurnoGlobal<T>(tarea: () => Promise<T>): Promise<T> {
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

// Lanza Chromium y devuelve el PDF. No hace fila: llamar siempre dentro de conTurnoGlobal.
export async function imprimirPdf(html: string): Promise<Buffer> {
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
    // tagged: estructura e idioma accesibles para lectores de pantalla.
    return await p.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, tagged: true });
  } finally {
    await b.close();
  }
}

// Escritura atomica: nunca se debe leer un archivo a medio escribir. Pisa lo que hubiera.
export async function escribirAtomico(salida: string, bytes: Buffer): Promise<void> {
  await mkdir(path.dirname(salida), { recursive: true, mode: 0o700 });
  const temporal = `${salida}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporal, bytes, { mode: 0o600 });
    await rename(temporal, salida);
  } catch (err) {
    await rm(temporal, { force: true });
    throw err;
  }
}
