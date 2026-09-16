import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/db";
import { permitirIntento } from "@/lib/rate-limit";
import { ipCliente } from "@/lib/ip";
import { leerPlantilla, generarPdf, hashDe } from "@/lib/propuesta";
import { renderPropuesta } from "@/lib/propuesta-contrato";

export async function GET(_req: Request, ctx: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{22}$/.test(codigo)) return new Response("No encontrado", { status: 404 });
  if (!permitirIntento(`pdf:${await ipCliente()}`, 10, 60_000)) return new Response("Demasiadas descargas. Intenta en un minuto.", { status: 429 });
  const p = await prisma.prospecto.findUnique({ where: { codigo }, select: { nombre: true, nicho: { select: { plantillaPropuesta: true, nombre: true } } } });
  if (!p || !p.nicho.plantillaPropuesta) return new Response("No encontrado", { status: 404 });
  const plantilla = await leerPlantilla(p.nicho.plantillaPropuesta);
  if (!plantilla) return new Response("No encontrado", { status: 404 });
  try {
    const html = renderPropuesta(plantilla, p.nombre, "#");
    const ruta = await generarPdf(codigo, html, hashDe(plantilla));
    const bytes = await readFile(ruta);
    return new Response(bytes, { headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="Propuesta-NERACOSU-${p.nicho.nombre}.pdf"`,
      "x-robots-tag": "noindex", "cache-control": "no-store",
    } });
  } catch (err) {
    // Si el PDF falla, la propuesta en linea sigue funcionando; se avisa y se registra.
    console.error("generarPdf", codigo, err);
    return new Response("No se pudo generar el PDF ahora. Intenta de nuevo en un momento.", { status: 503 });
  }
}
