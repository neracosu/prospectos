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

const d = await depurarYMarcar(APLICAR && process.argv.includes("--depurar"));
console.log(`universo con correo: cola ${d.cola} · duplicadas ${d.duplicadas} · excluidas`, d.excluidas);
if (process.argv.includes("--depurar")) {
  console.log(APLICAR ? "aplicado: cola marcada y duplicadas descartadas" : "(ensayo: no se escribio nada)");
} else {
  const dueno = await prisma.usuario.findFirstOrThrow({ where: { rol: "dueno", activo: true }, orderBy: { id: "asc" }, select: { id: true } });
  const cruzar = await crearCruzador("VE");
  const lista = arg("--ids")?.split(",").map((x) => Number(x.trim())).filter(Number.isInteger);
  const limite = Number(arg("--limite")) || undefined;
  const fichas = await prisma.fichaNegocio.findMany({ where: lista ? { prospectoId: { in: lista } } : { alAutomatico: true }, select: { prospectoId: true }, orderBy: { prospectoId: "asc" }, take: limite });
  console.log(`${fichas.length} prospectos por investigar${APLICAR ? "" : " (ensayo: se investigaria, no se escribe)"}`);
  const cuenta = { investigados: 0, lista: 0, borrador: 0, sin_hallazgos: 0, revisada: 0, conGancho: 0 };
  for (const f of fichas) {
    if (!APLICAR) { console.log(`  - #${f.prospectoId}`); continue; }
    try {
      const r = await investigarProspecto(f.prospectoId, { cruzar, usuarioId: dueno.id });
      cuenta.investigados++; cuenta[r.estado]++; if (r.gancho) cuenta.conGancho++;
      console.log(`  + #${f.prospectoId}: ${r.estado}${r.gancho ? ` · ${r.gancho}` : ""}`);
    } catch (e) { console.log(`  x #${f.prospectoId}: ${(e as Error).message}`); }
    await new Promise((x) => setTimeout(x, 3000));
  }
  console.log(`investigados ${cuenta.investigados} · listas ${cuenta.lista} · borrador ${cuenta.borrador} · sin_hallazgos ${cuenta.sin_hallazgos} · con gancho ${cuenta.conGancho}`);
}
clearInterval(vivo);
await prisma.$disconnect();
