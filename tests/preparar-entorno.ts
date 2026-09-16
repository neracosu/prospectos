import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Corre ANTES de que cualquier test importe @/lib/db (instancia PrismaClient al
// importar leyendo DATABASE_URL). Por eso vive en setupFiles.
const RUTA_ENV = process.env.PROSPECTOS_ENV_FILE ?? "/home/neracosu/.config/prospectos/env";
// Marca que la base de tests DEBE tener en el nombre: si la URL apunta a otro
// lado, los tests no arrancan en vez de escribir donde no deben.
const MARCA = "prospectos_test";

// El archivo esta pensado para cargarse con "set -a; . env; set +a" (bash),
// asi que un valor puede traer segmentos entre comillas simples o dobles
// (para proteger caracteres como "!" de la expansion de historial). Bash los
// quita al sourcear; esta funcion imita ese mismo desarmado para que leer el
// archivo a mano en Node de el mismo valor.
function quitarComillasDeBash(valor: string): string {
  let resultado = "";
  let i = 0;
  while (i < valor.length) {
    const c = valor[i];
    if (c === "'" || c === '"') {
      const fin = valor.indexOf(c, i + 1);
      if (fin === -1) { resultado += valor.slice(i); break; }
      resultado += valor.slice(i + 1, fin);
      i = fin + 1;
    } else {
      resultado += c;
      i++;
    }
  }
  return resultado;
}

function leerDelArchivoEnv(clave: string): string | undefined {
  try {
    for (const linea of readFileSync(RUTA_ENV, "utf8").split("\n")) {
      if (linea.startsWith(`${clave}=`)) return quitarComillasDeBash(linea.slice(clave.length + 1).trim());
    }
  } catch {
    // Puede no existir en otra maquina; lo que importa es si al final hay URL.
  }
  return undefined;
}

if (process.env.PROSPECTOS_TEST_DB === "1") {
  const url = process.env.TEST_DATABASE_URL ?? leerDelArchivoEnv("TEST_DATABASE_URL");
  if (!url) throw new Error(`PROSPECTOS_TEST_DB=1 pero no hay TEST_DATABASE_URL (ni en el entorno ni en ${RUTA_ENV}).`);
  if (!url.includes(MARCA)) throw new Error(`TEST_DATABASE_URL no apunta a una base de tests (falta "${MARCA}").`);
  process.env.DATABASE_URL = url;
}
process.env.SESION_SECRET ??= "secreto-de-tests-no-usar-en-produccion";
process.env.PROSPECTOS_DIR_ARCHIVOS ??= path.join(os.tmpdir(), "prospectos-tests-archivos");
process.env.PROSPECTOS_URL_PUBLICA ??= "http://localhost:3013";
