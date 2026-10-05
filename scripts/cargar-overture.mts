// scripts/cargar-overture.mts — valida el JSONL que deja extraer-overture.py y, con --aplicar, REEMPLAZA la tabla
// LugarOverture en una sola transaccion. Sin --aplicar solo cuenta. Se niega a aplicar si lo nuevo es menos de la
// mitad de lo que ya hay (una descarga cortada no vacia el directorio).
// Uso (con el env cargado; DATABASE_URL decide la base):
//   npx tsx scripts/cargar-overture.mts ~/overture/ve-2026-09-23.1.jsonl [--aplicar]
import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { validarLugar, puedeReemplazar, type LugarOverture } from "../src/lib/overture-contrato";
import { reemplazarLugares } from "../src/lib/overture";

const args = process.argv.slice(2);
const archivo = args.find((a) => !a.startsWith("--"));
const aplicar = args.includes("--aplicar");
const m = archivo ? /ve-(\d{4}-\d{2}-\d{2}\.\d+)\.jsonl$/.exec(path.basename(archivo)) : null;
if (!archivo || !m) { console.error("Uso: cargar-overture.mts <ruta>/ve-<publicacion>.jsonl [--aplicar]"); process.exit(2); }
const publicacion = m[1];

const porId = new Map<string, LugarOverture>();
let ilegibles = 0, invalidos = 0, repetidos = 0;
for (const renglon of readFileSync(archivo, "utf8").split("\n")) {
  if (!renglon.trim()) continue;
  let crudo: unknown;
  try { crudo = JSON.parse(renglon); } catch { ilegibles++; continue; }
  const l = validarLugar(crudo, publicacion);
  if (!l) { invalidos++; continue; }
  // El primero gana: el extractor no deberia repetir ids, pero un id repetido reventaria la carga entera.
  if (porId.has(l.id)) { repetidos++; continue; }
  porId.set(l.id, l);
}
const lugares = [...porId.values()];
const actuales = await prisma.lugarOverture.count();
console.log(`Publicación ${publicacion}: ${lugares.length} válidas, ${ilegibles} ilegibles, ${invalidos} inválidas, ${repetidos} con id repetido.`);
console.log(`En la tabla hoy: ${actuales}.`);

let salida = 0;
if (!aplicar) {
  console.log("Sin --aplicar: no se escribió nada.");
} else if (!puedeReemplazar(actuales, lugares.length)) {
  console.error(`ALTO: ${lugares.length} filas nuevas son menos de la mitad de las ${actuales} que hay. No se reemplazó nada.`);
  salida = 1;
} else {
  console.log(`Reemplazadas: ahora hay ${await reemplazarLugares(lugares)} lugares.`);
}
await prisma.$disconnect();
process.exit(salida);
