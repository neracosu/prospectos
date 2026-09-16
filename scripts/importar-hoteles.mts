// scripts/importar-hoteles.mts   (se ejecuta: npx tsx scripts/importar-hoteles.mts)
import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { importarProspectos, prospectoDesdeHotelJson, type HotelJson } from "../src/lib/importar";

const DIR = "/home/neracosu/propuestas/hoteles/prospectos/fuentes";
const nicho = await prisma.nicho.findUnique({ where: { slug: "hoteles" } });
if (!nicho) { console.error("Falta el nicho hoteles: corre scripts/sembrar-nichos.mjs"); process.exit(1); }
let total = { nuevos: 0, repetidos: 0 };
for (const archivo of ["capital.json", "centro.json", "interior.json"]) {
  const lista = (JSON.parse(readFileSync(path.join(DIR, archivo), "utf8")) as HotelJson[]).map(prospectoDesdeHotelJson);
  const r = await importarProspectos(nicho.id, lista, { origen: "importado" });
  console.log(`${archivo}: ${r.nuevos} nuevos, ${r.repetidos} repetidos`);
  total = { nuevos: total.nuevos + r.nuevos, repetidos: total.repetidos + r.repetidos };
}
console.log("total:", total, "| en base:", await prisma.prospecto.count({ where: { nichoId: nicho.id } }));
await prisma.$disconnect();
