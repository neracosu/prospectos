// scripts/pregenerar-pdf-correos.mts — genera por adelantado el PDF (con el gancho de la ficha) de cada fila
// «lista» de la cola de correo, por el mismo camino y la misma cache que el envio (htmlDelPdf de correos.ts):
// ~/prospectos-archivos/propuestas/<codigo>-<hash>.pdf. Chromium de a uno. Lo que ya existe no se regenera.
// OJO: el hash incluye la fecha de la propuesta (fechaDePropuesta: dia del primer envio o el de hoy), asi que
// pregenerar vale para el mismo dia; si la fecha cambia, el envio vuelve a generar.
// Uso (env cargado): npx tsx scripts/pregenerar-pdf-correos.mts [--limite N] [--ids 1,2,3] [--aplicar]
// Sin --aplicar solo cuenta cuantos faltan y cuantos ya existen.
import { pathToFileURL } from "node:url";
import { stat } from "node:fs/promises";
import { prisma } from "../src/lib/db";
import { colaCorreo, htmlDelPdf } from "../src/lib/correos";
import { generarPdf, rutaPdf } from "../src/lib/propuesta";
import { hoyCaracas } from "../src/lib/fecha-caracas";

export type ResumenPregenerado = { faltan: number; existian: number; generados: number; sinPlantilla: number; fallidos: number; segundos: number };

export async function pregenerar(o: { aplicar?: boolean; limite?: number; ids?: number[] } = {}): Promise<ResumenPregenerado> {
  const t0 = Date.now();
  let filas = await colaCorreo(hoyCaracas(), { estado: "listas" });
  if (o.ids?.length) filas = filas.filter((f) => o.ids!.includes(f.prospectoId));
  if (o.limite && o.limite > 0) filas = filas.slice(0, o.limite);
  const r: ResumenPregenerado = { faltan: 0, existian: 0, generados: 0, sinPlantilla: 0, fallidos: 0, segundos: 0 };
  for (const f of filas) {
    const d = await htmlDelPdf(f.prospectoId);
    if ("error" in d) { r.sinPlantilla++; continue; }
    try { await stat(rutaPdf(d.codigo, d.hash)); r.existian++; continue; } catch {}
    r.faltan++;
    if (!o.aplicar) continue;
    try { await generarPdf(d.codigo, d.html, d.hash); r.generados++; }
    catch (e) { r.fallidos++; console.log(`  x ${f.nombre}: ${(e as Error).message.slice(0, 80)}`); }
  }
  r.segundos = (Date.now() - t0) / 1000;
  return r;
}

async function main() {
  const a = process.argv;
  const val = (k: string) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  const aplicar = a.includes("--aplicar");
  const limite = val("--limite") ? Number(val("--limite")) : undefined;
  const ids = val("--ids") ? val("--ids")!.split(",").map(Number).filter(Boolean) : undefined;
  const vivo = setInterval(() => {}, 1000);
  const r = await pregenerar({ aplicar, limite, ids });
  console.log(aplicar ? "(aplicado)" : "(ensayo: sin --aplicar no se genera nada)");
  console.log(`faltan ${r.faltan}, existian ${r.existian}`);
  console.log(`generados ${r.generados} / existian ${r.existian} / sin plantilla ${r.sinPlantilla} / fallidos ${r.fallidos}, en ${r.segundos.toFixed(1)} s`);
  clearInterval(vivo);
  await prisma.$disconnect();
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
