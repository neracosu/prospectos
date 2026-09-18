// scripts/generar-propuestas.mts — ronda de PDFs: genera por adelantado la propuesta en PDF de los primeros N
// prospectos «por contactar» de la cola (los que Neri va a mandar), por el mismo camino y la misma cache que
// /p/<codigo>/pdf (~/prospectos-archivos/propuestas/<codigo>-<hash>.pdf). Chromium de a uno. Lo que ya existe no
// se regenera. Si no se corre, el PDF igual se genera al primer toque en la ficha: esto solo lo deja listo.
// Uso (env cargado): npx tsx scripts/generar-propuestas.mts [--primeros 100]
import { prisma } from "../src/lib/db";
import { leerPlantilla, generarPdf, hashDe, rutaPdf } from "../src/lib/propuesta";
import { renderPropuesta } from "../src/lib/propuesta-contrato";
import { stat } from "node:fs/promises";
const i = process.argv.indexOf("--primeros");
const N = i >= 0 ? Number(process.argv[i + 1]) || 100 : 100;
const vivo = setInterval(() => {}, 1000);
const filas = await prisma.prospecto.findMany({ where: { etapa: "por_contactar" }, orderBy: { ordenCola: "asc" }, take: N, select: { codigo: true, nombre: true, ciudad: true, web: true, nicho: { select: { plantillaPropuesta: true, nombre: true } } } });
const plantillas = new Map<string, string | null>();
let hechos = 0, existian = 0, sinPlantilla = 0, fallidos = 0;
const t0 = Date.now();
for (const p of filas) {
  const slug = p.nicho.plantillaPropuesta;
  if (!slug) { sinPlantilla++; continue; }
  if (!plantillas.has(slug)) plantillas.set(slug, await leerPlantilla(slug));
  const plantilla = plantillas.get(slug); if (!plantilla) { sinPlantilla++; continue; }
  const html = renderPropuesta(plantilla, p.nombre, "#", { ciudad: p.ciudad, rubro: p.nicho.nombre.toLowerCase(), conWeb: !!p.web });
  const hash = hashDe(html);
  try { await stat(rutaPdf(p.codigo, hash)); existian++; continue; } catch {}
  try { await generarPdf(p.codigo, html, hash); hechos++; }
  catch (e) { fallidos++; console.log(`  x ${p.nombre}: ${(e as Error).message.slice(0, 80)}`); }
}
console.log(`generados ${hechos}, ya existían ${existian}, sin plantilla ${sinPlantilla}, fallidos ${fallidos}, en ${((Date.now() - t0) / 1000).toFixed(0)} s`);
clearInterval(vivo);
await prisma.$disconnect();
