// scripts/ajustar-mensajes.mts — corrige frases de los mensajes de WhatsApp de cada nicho (5-oct-2026) SIN pisar lo
// que Neri haya editado en Ajustes: no reescribe el mensaje, solo reemplaza las frases que prometian de mas. Las
// mismas frases se corrigieron en scripts/sembrar-nichos.mjs, que solo vale para nichos nuevos.
// Uso (con el env cargado; DATABASE_URL decide la base):
//   npx tsx scripts/ajustar-mensajes.mts            # muestra que cambiaria
//   npx tsx scripts/ajustar-mensajes.mts --aplicar
import { prisma } from "../src/lib/db";

// «Se paga una sola vez» es cierto solo donde no hay mensualidad (cobros y pagos). En citas el sistema se construye:
// no es una adaptacion.
function pago(plantilla: string | null): string {
  if (plantilla === "cobros-y-pagos") return "que se paga una sola vez y queda a su nombre";
  if (plantilla === "citas-y-servicios") return "con un pago único y un servicio mensual, y queda a su nombre";
  return "con un pago único de adaptación y un servicio mensual, y queda a su nombre";
}

export function ajustar(texto: string, slug: string, plantilla: string | null): string {
  let t = texto
    .replaceAll("propuesta de 9 páginas pensada para {nombre}", "propuesta de 9 páginas para {nombre}")
    .replaceAll("que se paga una sola vez y queda a su nombre", pago(plantilla))
    // La propuesta de comercio ofrece tienda en linea, no pedidos por WhatsApp ni por Instagram.
    .replaceAll("sistema propio de pedidos por WhatsApp e Instagram, catálogo, inventario", "sistema propio de tienda en línea, catálogo, inventario")
    .replaceAll("descuenta solo, punto de venta en bolívares y divisas con la tasa del día y pedidos por WhatsApp,", "descuenta solo y punto de venta en bolívares y divisas con la tasa del día,");
  // «se la muestro funcionando»: «la» era la propuesta, no el sistema.
  if (slug === "hoteles") t = t.replaceAll("se la muestro funcionando", "le muestro el sistema funcionando");
  if (slug === "hoteles-estadia") t = t.replaceAll("se la muestro funcionando", "le muestro la página de reservas funcionando");
  // El gancho de la temporada promocional va justo antes de la pregunta con la que cierra el primer mensaje.
  if (!t.includes("{promo}")) t = t.replace(" ¿Le parece si", " {promo} ¿Le parece si");
  return t;
}

const aplicar = process.argv.includes("--aplicar");
const nichos = await prisma.nicho.findMany({ select: { id: true, slug: true, plantillaPropuesta: true, mensajeInicial: true, mensajeSeguimiento: true }, orderBy: { slug: "asc" } });
let cambian = 0;
for (const n of nichos) {
  const inicial = ajustar(n.mensajeInicial, n.slug, n.plantillaPropuesta);
  const seguimiento = ajustar(n.mensajeSeguimiento, n.slug, n.plantillaPropuesta);
  const cambios = [inicial !== n.mensajeInicial ? "inicial" : "", seguimiento !== n.mensajeSeguimiento ? "seguimiento" : ""].filter(Boolean);
  console.log(`${n.slug.padEnd(26)} ${cambios.length ? cambios.join(" y ") : "sin cambios"}`);
  if (!cambios.length) continue;
  cambian++;
  if (aplicar) await prisma.nicho.update({ where: { id: n.id }, data: { mensajeInicial: inicial, mensajeSeguimiento: seguimiento } });
}
console.log(aplicar ? `Aplicado: ${cambian} nichos actualizados.` : `Sin --aplicar: cambiarían ${cambian} nichos. No se escribió nada.`);
await prisma.$disconnect();
