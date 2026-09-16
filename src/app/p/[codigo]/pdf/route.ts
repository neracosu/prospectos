import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/db";
import { permitirIntento } from "@/lib/rate-limit";
import { ipCliente } from "@/lib/ip";
import { leerPlantilla, generarPdf, hashDe } from "@/lib/propuesta";
import { renderPropuesta } from "@/lib/propuesta-contrato";
import { CODIGO_VALIDO } from "@/lib/codigo";

// Nombre de archivo seguro para el header (ASCII, sin comillas ni barras);
// la version completa con acentos y demas va aparte en filename* (UTF-8).
function saneado(nombre: string): string {
  return nombre.replace(/[^A-Za-z0-9 _-]/g, "").trim().slice(0, 60);
}

function respuestaOcupada(): Response {
  return new Response("El servidor está ocupado generando otro PDF. Intenta en unos segundos.", {
    status: 503,
    headers: { "cache-control": "no-store" },
  });
}

function respuestaFalloGenerico(): Response {
  return new Response("No se pudo generar el PDF ahora. Intenta de nuevo en un momento.", {
    status: 503,
    headers: { "cache-control": "no-store" },
  });
}

export async function GET(_req: Request, ctx: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await ctx.params;
  if (!CODIGO_VALIDO.test(codigo)) return new Response("No encontrado", { status: 404 });
  if (!permitirIntento(`pdf:${await ipCliente()}`, 10, 60_000)) return new Response("Demasiadas descargas. Intenta en un minuto.", { status: 429 });
  const p = await prisma.prospecto.findUnique({ where: { codigo }, select: { nombre: true, nicho: { select: { plantillaPropuesta: true } } } });
  if (!p || !p.nicho.plantillaPropuesta) return new Response("No encontrado", { status: 404 });
  const plantilla = await leerPlantilla(p.nicho.plantillaPropuesta);
  if (!plantilla) return new Response("No encontrado", { status: 404 });
  try {
    const html = renderPropuesta(plantilla, p.nombre, "#");
    const ruta = await generarPdf(codigo, html, hashDe(html));
    const bytes = await readFile(ruta);
    const nombreArchivo = `Propuesta-NERACOSU-${saneado(p.nombre) || "Propuesta"}.pdf`;
    const nombreCompleto = `Propuesta-NERACOSU-${p.nombre}.pdf`;
    return new Response(bytes, { headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${nombreArchivo}"; filename*=UTF-8''${encodeURIComponent(nombreCompleto)}`,
      "x-robots-tag": "noindex", "cache-control": "no-store",
    } });
  } catch (err) {
    // Si el PDF falla, la propuesta en linea sigue funcionando; se avisa y se registra.
    if (err instanceof Error && err.message === "PDF_OCUPADO") {
      console.error("generarPdf ocupado", codigo);
      return respuestaOcupada();
    }
    console.error("generarPdf", codigo, err);
    return respuestaFalloGenerico();
  }
}
