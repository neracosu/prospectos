// scripts/dividir-hoteles.mts — reparte los prospectos del nicho `hoteles` en dos segmentos segun Prospecto.tipo:
// los de paso/motel se quedan; urbanos, economicos y posadas pasan a `hoteles-estadia` (decision de Neri, 17-sep-2026:
// venden por noche, la propuesta de alta rotacion no les habla). Deja un evento `nota` en cada uno movido.
// Por defecto solo muestra lo que haria. Con --aplicar escribe. Idempotente: lo ya movido no se toca.
//   npx tsx scripts/dividir-hoteles.mts            (ensayo)
//   npx tsx scripts/dividir-hoteles.mts --aplicar
import { prisma } from "../src/lib/db";

const APLICAR = process.argv.includes("--aplicar");
// Lo que se queda en alta rotacion. Todo lo demas del nicho hoteles pasa a estadia.
const DE_PASO = /paso|motel/i;

const origen = await prisma.nicho.findUnique({ where: { slug: "hoteles" }, select: { id: true } });
const destino = await prisma.nicho.findUnique({ where: { slug: "hoteles-estadia" }, select: { id: true } });
if (!origen || !destino) { console.error("Faltan los nichos: corre scripts/sembrar-nichos.mjs primero."); process.exit(2); }

const todos = await prisma.prospecto.findMany({ where: { nichoId: origen.id }, select: { id: true, nombre: true, tipo: true, etapa: true }, orderBy: { id: "asc" } });
const mover = todos.filter((p) => !DE_PASO.test(p.tipo));
const porTipo = new Map<string, number>();
for (const p of mover) porTipo.set(p.tipo || "(sin tipo)", (porTipo.get(p.tipo || "(sin tipo)") ?? 0) + 1);
console.log(`En «hoteles»: ${todos.length}. Se quedan (de paso/motel): ${todos.length - mover.length}. Pasan a «hoteles-estadia»: ${mover.length}.`);
for (const [tipo, n] of porTipo) console.log(`  ${n.toString().padStart(3)}  ${tipo}`);
const enviados = mover.filter((p) => p.etapa !== "por_contactar");
if (enviados.length) console.log(`  ⚠ ${enviados.length} ya no están «por contactar» (se mueven igual, conservan su etapa): ${enviados.map((p) => p.nombre).join(", ")}`);

if (!APLICAR) { console.log("Ensayo: no se escribió nada. Repite con --aplicar."); await prisma.$disconnect(); process.exit(0); }

let movidos = 0;
for (const p of mover) {
  await prisma.$transaction([
    prisma.prospecto.update({ where: { id: p.id }, data: { nichoId: destino.id } }),
    prisma.evento.create({ data: { prospectoId: p.id, tipo: "nota", texto: `Pasó al nicho «Hoteles de estadía» (tipo: ${p.tipo || "sin tipo"})` } }),
  ]);
  movidos++;
}
const quedan = await prisma.prospecto.count({ where: { nichoId: origen.id } });
const alla = await prisma.prospecto.count({ where: { nichoId: destino.id } });
console.log(`Listo: ${movidos} movidos. Ahora «hoteles» tiene ${quedan} y «hoteles-estadia» ${alla}.`);
await prisma.$disconnect();
