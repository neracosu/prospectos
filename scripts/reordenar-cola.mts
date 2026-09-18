// scripts/reordenar-cola.mts — renumera ordenCola de los prospectos «por contactar» por bloques de nicho, en el orden
// de ataque que Neri aprobo el 17-sep (producto listo y ticket primero). Dentro de cada nicho conserva el orden que
// tenian. La cola de Hoy toma los 500 primeros y, entre ellos, pone primero a los que tienen WhatsApp.
// Uso (env cargado): npx tsx scripts/reordenar-cola.mts [--aplicar]
import { prisma } from "../src/lib/db";
const ORDEN = [
  "hoteles", "hoteles-estadia", "canchas-y-espacios", "eventos", "restaurantes-y-bares",
  "comercio", "licorerias-y-bodegones", "emprendimientos-moda", "emprendimientos-comida", "cosmeticos",
  "farmacias",
  "clinicas-y-consultorios", "odontologias", "peluquerias-y-barberias", "spas-y-estetica", "veterinarias", "talleres-y-autolavados",
  "gimnasios", "educacion",
];
const APLICAR = process.argv.includes("--aplicar");
const nichos = await prisma.nicho.findMany({ select: { id: true, slug: true } });
const faltan = nichos.filter((n) => !ORDEN.includes(n.slug)).map((n) => n.slug);
if (faltan.length) { console.error("Nichos sin lugar en el orden:", faltan.join(", ")); process.exit(2); }
let orden = 0;
for (const slug of ORDEN) {
  const n = nichos.find((x) => x.slug === slug)!;
  const filas = await prisma.prospecto.findMany({ where: { nichoId: n.id, etapa: "por_contactar" }, select: { id: true }, orderBy: [{ ordenCola: "asc" }, { id: "asc" }] });
  const desde = orden + 1;
  if (APLICAR) for (const f of filas) await prisma.prospecto.update({ where: { id: f.id }, data: { ordenCola: ++orden } });
  else orden += filas.length;
  console.log(`${slug.padEnd(26)} ${String(filas.length).padStart(5)}  posiciones ${desde}–${orden}`);
}
console.log(APLICAR ? `Listo: ${orden} prospectos renumerados.` : `Ensayo: ${orden} prospectos. Repite con --aplicar.`);
await prisma.$disconnect();
