// src/lib/archivos.ts — el directorio de archivos fuera del docroot y la escritura atomica. Lo comparten
// los recibos y los documentos del cliente: los dos guardan cosas que NO se regeneran nunca.
// Usa node: -> NO importarlo desde la cadena de src/instrumentation.ts (ver CLAUDE.md).
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const DIR_PRODUCCION = "/home/neracosu/prospectos-archivos";

// Fuera de produccion (next dev, tests, scripts) jamas se escribe en el directorio real: el correlativo de la
// base de pruebas arranca bajo y pisaria recibos emitidos, y los tests borran <dir>/recibos y <dir>/documentos.
export function dirArchivos(): string {
  const dir = process.env.PROSPECTOS_DIR_ARCHIVOS ?? DIR_PRODUCCION;
  if (process.env.NODE_ENV !== "production" && path.resolve(dir) === DIR_PRODUCCION) throw new Error("DIR_ARCHIVOS_DE_PRODUCCION");
  return dir;
}

// Escritura atomica: nunca se debe leer un archivo a medio escribir. Pisa lo que hubiera.
export async function escribirAtomico(salida: string, bytes: Uint8Array): Promise<void> {
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
