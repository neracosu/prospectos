// src/lib/propuesta.ts
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { conTurnoGlobal, imprimirPdf, escribirAtomico } from "@/lib/pdf";

// Los tests de propuesta lo importan desde aqui.
export { _generacionesParaTests } from "@/lib/pdf";

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
  return conTurnoGlobal(async () => {
    // Pudo haberse escrito mientras esperabamos el turno (otra llamada, otro
    // proceso): revisar de nuevo antes de gastar un Chromium entero.
    try { await stat(salida); return salida; } catch { /* sigue sin existir */ }
    await escribirAtomico(salida, await imprimirPdf(html));
    return salida;
  });
}
