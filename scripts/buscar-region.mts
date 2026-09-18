// scripts/buscar-region.mts — corre el buscador por OpenStreetMap (Overpass) para varias ciudades y nichos y deja
// cada resultado como un lote en la bandeja, igual que el boton «Buscar» del panel: NADA entra al panel sin pasar
// por la bandeja. Respeta el turno del panel (una consulta a la vez, 5 s entre consultas, cache de 7 dias).
// Uso (con el env cargado; DATABASE_URL decide la base; PROSPECTOS_OVERPASS_ESPERA_MS=15000 para no chocar con el limite de Overpass):
//   npx tsx scripts/buscar-region.mts <slug-nicho,...> <slug-ciudad,...>
//   npx tsx scripts/buscar-region.mts hoteles-estadia,restaurantes-y-bares valencia,maracay
import { prisma } from "../src/lib/db";
import { buscarEnOverpass } from "../src/lib/overpass";
import { crearLote } from "../src/lib/revision";
import { validarTopes } from "../src/lib/tabla-contrato";
import { ciudadPorSlug } from "../src/lib/overpass-contrato";

const [nichosArg, ciudadesArg] = process.argv.slice(2);
if (!nichosArg || !ciudadesArg) { console.error("Uso: buscar-region.mts <nichos> <ciudades>"); process.exit(2); }
const dueno = await prisma.usuario.findFirst({ where: { rol: "dueno", activo: true }, orderBy: { id: "asc" }, select: { id: true } });
if (!dueno) { console.error("No hay un dueno activo: los lotes llevan quien los pidio."); process.exit(2); }
const nichos = await prisma.nicho.findMany({ where: { slug: { in: nichosArg.split(",") } }, select: { id: true, slug: true } });
const ciudades = ciudadesArg.split(",").map((s) => { const c = ciudadPorSlug(s); if (!c) { console.error(`Ciudad desconocida: ${s}`); process.exit(2); } return c; });
// La espera entre consultas de overpass.ts va con unref (pensada para el servidor, que siempre esta vivo): en un
// script, con el bucle de eventos vacio, Node sale con codigo 13 en medio de la espera. Esto lo mantiene vivo.
const vivo = setInterval(() => {}, 1000);
let total = { nuevos: 0, repetidos: 0, errores: 0 };
for (const n of nichos) {
  for (const c of ciudades) {
    const t0 = Date.now();
    // Overpass limita por IP (429) y a veces corta la conexion: se reintenta hasta tres veces con espera creciente.
    let r = await buscarEnOverpass(n.id, c.slug);
    for (let intento = 1; !r.ok && intento <= 3 && /429|no respondió|conectar/i.test(r.motivo); intento++) {
      const espera = 30_000 * intento;
      console.log(`${n.slug.padEnd(24)} ${c.nombre.padEnd(20)} ${r.motivo} Espero ${espera / 1000} s y reintento (${intento}/3).`);
      await new Promise((f) => setTimeout(f, espera));
      r = await buscarEnOverpass(n.id, c.slug);
    }
    if (!r.ok) { console.log(`${n.slug.padEnd(24)} ${c.nombre.padEnd(20)} FALLO: ${r.motivo}`); continue; }
    if (!r.entradas.length) { console.log(`${n.slug.padEnd(24)} ${c.nombre.padEnd(20)} sin resultados`); continue; }
    const lote = await crearLote("overpass", r.entradas.map((e) => ({ entrada: e, errores: validarTopes(e) })), dueno.id);
    total = { nuevos: total.nuevos + lote.nuevos, repetidos: total.repetidos + lote.repetidos, errores: total.errores + lote.errores };
    console.log(`${n.slug.padEnd(24)} ${c.nombre.padEnd(20)} ${String(r.entradas.length).padStart(4)} resultados -> nuevos ${lote.nuevos}, repetidos ${lote.repetidos}, con error ${lote.errores}${r.desdeCache ? " (cache)" : ""}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
}
console.log(`TOTAL en la bandeja: nuevos ${total.nuevos}, repetidos ${total.repetidos}, con error ${total.errores}`);
clearInterval(vivo);
await prisma.$disconnect();
