// scripts/cargar-overture.mts — valida el JSONL que deja extraer-overture.py y, con --aplicar, REEMPLAZA la tabla
// LugarOverture en una sola transaccion. Sin --aplicar solo cuenta. Se niega a aplicar si lo nuevo es menos de la
// mitad de lo que ya hay (una descarga cortada no vacia el directorio).
// Uso (con el env cargado; DATABASE_URL decide la base):
//   npx tsx scripts/cargar-overture.mts ~/overture/ve-2026-09-23.1.jsonl [--aplicar]
import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { validarLugar, puedeReemplazar, ciudadDeLugar, REGLAS_NICHO, type LugarOverture } from "../src/lib/overture-contrato";
import { reemplazarLugares } from "../src/lib/overture";

const args = process.argv.slice(2);
const archivo = args.find((a) => !a.startsWith("--"));
const aplicar = args.includes("--aplicar");
// --forzar salta el freno de «menos de la mitad»: solo para cuando el recorte baja a proposito (un filtro nuevo).
const forzar = args.includes("--forzar");
const m = archivo ? /(ve|co)-(\d{4}-\d{2}-\d{2}\.\d+)\.jsonl$/.exec(path.basename(archivo)) : null;
if (!archivo || !m) { console.error("Uso: cargar-overture.mts <ruta>/<ve|co>-<publicacion>.jsonl [--aplicar]"); process.exit(2); }
// El pais sale del nombre del archivo: cada pais se carga y se reemplaza por separado.
const pais = m[1].toUpperCase() as "VE" | "CO";
const publicacion = m[2];

const porId = new Map<string, LugarOverture>();
let ilegibles = 0, invalidos = 0, repetidos = 0, otroRubro = 0, fueraDeCiudad = 0;
// Solo se guarda lo que el panel puede ofrecer: rubros con regla y lugares dentro de una ciudad del panel de ese
// pais. Colombia entera son mas de 200.000 filas; sin esto la base y el respaldo diario cargan con peso muerto.
const BASES = new Set(Object.values(REGLAS_NICHO).flatMap((r) => r.bases));
for (const renglon of readFileSync(archivo, "utf8").split("\n")) {
  if (!renglon.trim()) continue;
  let crudo: unknown;
  try { crudo = JSON.parse(renglon); } catch { ilegibles++; continue; }
  const l = validarLugar(crudo, publicacion, pais);
  if (!l) { invalidos++; continue; }
  if (!BASES.has(l.categoriaBase)) { otroRubro++; continue; }
  if (ciudadDeLugar(l.lat, l.lon)?.pais !== pais) { fueraDeCiudad++; continue; }
  // El primero gana: el extractor no deberia repetir ids, pero un id repetido reventaria la carga entera.
  if (porId.has(l.id)) { repetidos++; continue; }
  porId.set(l.id, l);
}
const lugares = [...porId.values()];
const actuales = await prisma.lugarOverture.count({ where: { pais } });
console.log(`Publicación ${publicacion} (${pais}): ${lugares.length} válidas, ${ilegibles} ilegibles, ${invalidos} inválidas, ${repetidos} con id repetido; ${otroRubro} de otros rubros y ${fueraDeCiudad} fuera de las ciudades del panel no se guardan.`);
console.log(`En la tabla hoy, de ${pais}: ${actuales}.`);

let salida = 0;
if (!aplicar) {
  console.log("Sin --aplicar: no se escribió nada.");
} else if (!forzar && !puedeReemplazar(actuales, lugares.length)) {
  console.error(`ALTO: ${lugares.length} filas nuevas son menos de la mitad de las ${actuales} que hay. No se reemplazó nada (si la baja es a propósito, --forzar).`);
  salida = 1;
} else {
  console.log(`Reemplazadas: ahora hay ${await reemplazarLugares(lugares, pais)} lugares.`);
}
await prisma.$disconnect();
process.exit(salida);
