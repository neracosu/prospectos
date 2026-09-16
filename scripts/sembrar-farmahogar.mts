// Farmahogar ya recibio propuesta el 15-sep: entra en `enviado` con seguimiento el 2026-09-18.
import { prisma } from "../src/lib/db";
import { importarProspectos } from "../src/lib/importar";
import { sumarDias } from "../src/lib/fecha-caracas";

const nicho = await prisma.nicho.findUnique({ where: { slug: "farmacias" } });
if (!nicho) { console.error("Falta el nicho farmacias"); process.exit(1); }
const r = await importarProspectos(nicho.id, [{
  nombre: "Farmahogar", ciudad: "Caracas", tipo: "farmacia",
  nota: "Propuesta enviada el 2026-09-08 (archivo ~/propuestas/archivo/2026-09-08-farmahogar.md). Cargado a mano.",
  fuentes: [],
}], { origen: "manual" });
if (r.nuevos === 1) {
  const p = await prisma.prospecto.findFirstOrThrow({ where: { nichoId: nicho.id, nombre: "Farmahogar" } });
  await prisma.prospecto.update({ where: { id: p.id }, data: { etapa: "enviado", proximoSeguimiento: sumarDias("2026-09-15", nicho.diasSeguimiento) } });
  await prisma.evento.create({ data: { prospectoId: p.id, tipo: "enviado", canal: "whatsapp", de: "por_contactar", a: "enviado", texto: "Cargado a mano; enviado el 2026-09-15", creadoEn: new Date("2026-09-15T14:00:00-04:00") } });
}
console.log(r);
await prisma.$disconnect();
