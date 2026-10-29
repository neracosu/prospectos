// scripts/investigar-prospectos.mts -- arma la ficha de negocio de los prospectos de la cola de correo.
// Uso (env cargado): npx tsx scripts/investigar-prospectos.mts [--depurar] [--ids 1,2,3] [--limite N] [--aplicar]
//   --depurar  solo depura el universo (cola, duplicadas, excluidas); con --aplicar marca la cola y descarta duplicadas
//   sin --depurar: investiga (web + directorio abierto + base); sin --aplicar solo dice lo que haria, no escribe
// 3 s entre prospectos; dentro de un sitio, 1 s entre paginas.
import { prisma } from "../src/lib/db";
import { depurarYMarcar, investigarProspecto } from "../src/lib/fichas";
import { crearCruzador } from "../src/lib/overture-cruce";

const arg = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const APLICAR = process.argv.includes("--aplicar");
const vivo = setInterval(() => {}, 1000);

const DEPURAR = process.argv.includes("--depurar");
const lista = arg("--ids")?.split(",").map((x) => Number(x.trim())).filter(Number.isInteger);
if (DEPURAR || !lista) {
  const d = await depurarYMarcar(APLICAR && DEPURAR);
  console.log(`universo con correo: cola ${d.cola} - duplicadas ${d.duplicadas} - excluidas`, d.excluidas);
}
if (DEPURAR) {
  console.log(APLICAR ? "aplicado: cola marcada y duplicadas descartadas" : "(ensayo: no se escribio nada)");
} else {
  const limite = Number(arg("--limite")) || undefined;
  // con --ids la lista es explicita (prospectos, tengan ficha o no); sin --ids, la cola marcada para el automatico
  const objetivos = lista
    ? (await prisma.prospecto.findMany({ where: { id: { in: lista } }, select: { id: true }, orderBy: { id: "asc" }, take: limite })).map((x) => x.id)
    : (await prisma.fichaNegocio.findMany({ where: { alAutomatico: true }, select: { prospectoId: true }, orderBy: { prospectoId: "asc" }, take: limite })).map((x) => x.prospectoId);
  console.log(`${objetivos.length} prospectos por investigar${APLICAR ? "" : " (ensayo: se investigaria, no se escribe)"}`);
  const cuenta = { investigados: 0, lista: 0, borrador: 0, sin_hallazgos: 0, revisada: 0, conGancho: 0 };
  if (APLICAR && objetivos.length) {
    const dueno = await prisma.usuario.findFirstOrThrow({ where: { rol: "dueno", activo: true }, orderBy: { id: "asc" }, select: { id: true } });
    const cruzar = await crearCruzador("VE");
    for (const id of objetivos) {
      try {
        const r = await investigarProspecto(id, { cruzar, usuarioId: dueno.id });
        cuenta.investigados++; cuenta[r.estado]++; if (r.gancho) cuenta.conGancho++;
        console.log(`  + #${id}: ${r.estado}${r.gancho ? ` - ${r.gancho}` : ""}`);
      } catch (e) { console.log(`  x #${id}: ${(e as Error).message}`); }
      await new Promise((x) => setTimeout(x, 3000));
    }
  } else for (const id of objetivos) console.log(`  - #${id}`);
  console.log(`investigados ${cuenta.investigados} - listas ${cuenta.lista} - borrador ${cuenta.borrador} - sin_hallazgos ${cuenta.sin_hallazgos} - con gancho ${cuenta.conGancho}`);
}
clearInterval(vivo);
await prisma.$disconnect();
