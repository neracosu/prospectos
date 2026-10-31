// scripts/leer-rebotes.mts -- lee el buzon de info@ (maildir) y bloquea en el panel las direcciones que rebotaron.
// Uso (env cargado): node_modules/.bin/tsx scripts/leer-rebotes.mts [--aplicar] [--dias N] [--buzon RUTA]
//   Sin --aplicar solo dice que haria. Idempotente: una direccion ya bloqueada no se vuelve a anotar.
//   Solo bloquea rebotes PERMANENTES (5.x.x) de direcciones que tienen un envio del panel (EnvioCorreo); el resto (rebotes
//   del reenviador a Gmail, temporales, correos ajenos) se informa y no se toca. Lo corre el crontab cada hora.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { leerRebote } from "../src/lib/rebotes-contrato";
import { bloquearPorSistema } from "../src/lib/correos";
import { normalizarCorreo } from "../src/lib/ficha-contrato";

const arg = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const APLICAR = process.argv.includes("--aplicar");
const DIAS = Number(arg("--dias") ?? 7);
const BUZON = arg("--buzon") ?? path.join(process.env.HOME ?? "/home/neracosu", "mail", "neracosu.com", "info");
const desde = Date.now() - DIAS * 86_400_000;

const archivos: string[] = [];
for (const carpeta of ["new", "cur"]) {
  const dir = path.join(BUZON, carpeta);
  try { for (const f of readdirSync(dir)) { const p = path.join(dir, f); if (statSync(p).mtimeMs >= desde) archivos.push(p); } } catch { /* carpeta ausente */ }
}
let avisos = 0, nuevos = 0, ya = 0, temporales = 0, ajenos = 0;
const vistos = new Set<string>();
for (const a of archivos) {
  const r = leerRebote(readFileSync(a, "utf8"));
  if (!r) continue;
  avisos++;
  for (const email of r.fallidos) {
    const e = normalizarCorreo(email);
    if (!e || vistos.has(e)) continue;
    vistos.add(e);
    if (!r.permanente) { temporales++; console.log(`  ~ temporal ${e} (${r.estado || "sin estado"}): ${r.motivo}`); continue; }
    const p = await prisma.prospecto.findFirst({ where: { email: e, envios: { some: {} } }, select: { id: true, nombre: true } });
    if (!p) { ajenos++; console.log(`  - ajeno ${e}: ${r.motivo.slice(0, 80)}`); continue; }
    if (!APLICAR && (await prisma.correoBloqueado.findUnique({ where: { email: e } }))) { ya++; continue; }
    if (!APLICAR) { console.log(`  + bloquearia ${e} (#${p.id} ${p.nombre}): ${r.motivo.slice(0, 100)}`); nuevos++; continue; }
    const res = await bloquearPorSistema(p.id, e, "rebote", `rebotó (${r.estado || "5.x.x"}): ${r.motivo}`.slice(0, 300));
    if (res === "nuevo") { nuevos++; console.log(`  + bloqueado ${e} (#${p.id} ${p.nombre})`); } else ya++;
  }
}
console.log(`[rebotes] ${new Date().toISOString().slice(0, 16)}: ${archivos.length} mensajes de ${DIAS} dias, ${avisos} avisos de rebote, ${nuevos} ${APLICAR ? "bloqueados" : "por bloquear"}, ${ya} ya estaban, ${temporales} temporales, ${ajenos} ajenos`);
await prisma.$disconnect();
