// scripts/verificar-dominios-correo.mts -- antes de encolar: comprueba que el dominio de cada correo de la cola «listas»
// reciba correo (MX o A) y bloquea los muertos con motivo "dominio". El automatico y el envio a mano hacen la misma
// comprobacion al momento de enviar; este script la adelanta para toda la cola de una vez.
// Uso (env cargado): node_modules/.bin/tsx scripts/verificar-dominios-correo.mts [--aplicar]
import { prisma } from "../src/lib/db";
import { colaCorreo, bloquearPorSistema } from "../src/lib/correos";
import { dominioRecibeCorreo, dominioDe } from "../src/lib/correo-dominio";
import { normalizarCorreo } from "../src/lib/ficha-contrato";
import { hoyCaracas } from "../src/lib/fecha-caracas";

const APLICAR = process.argv.includes("--aplicar");
const cola = await colaCorreo(hoyCaracas(), { estado: "listas" });
const porDominio = new Map<string, typeof cola>();
for (const f of cola) { const d = dominioDe(normalizarCorreo(f.email)); porDominio.set(d, [...(porDominio.get(d) ?? []), f]); }
let muertos = 0, dudas = 0, bloqueados = 0;
for (const [dominio, filas] of porDominio) {
  const v = await dominioRecibeCorreo(`x@${dominio}`);
  if (v === "si") continue;
  if (v === "duda") { dudas++; console.log(`  ? duda ${dominio} (${filas.length}): DNS no respondio, no se toca`); continue; }
  muertos++;
  for (const f of filas) {
    console.log(`  - ${APLICAR ? "bloqueado" : "bloquearia"} ${f.email} (#${f.prospectoId} ${f.nombre}): ${dominio} sin MX ni A`);
    if (APLICAR && (await bloquearPorSistema(f.prospectoId, f.email, "dominio", "sin MX ni A: ese dominio no recibe correo")) === "nuevo") bloqueados++;
  }
}
console.log(`[dominios] ${cola.length} en cola, ${porDominio.size} dominios, ${muertos} muertos, ${dudas} en duda, ${bloqueados} bloqueados`);
await prisma.$disconnect();
