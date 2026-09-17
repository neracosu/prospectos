import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/db";
import { sesionActual } from "@/lib/sesion";
import { ARCHIVO_RECIBO } from "@/lib/recibos-contrato";
import { rutaDocumento } from "@/lib/recibos";

const SIN_CACHE = { "cache-control": "private, no-store", "x-robots-tag": "noindex" };
const noEncontrado = (texto = "No encontrado") => new Response(texto, { status: 404, headers: SIN_CACHE });

// /recibos/R-2026-0001.pdf y /recibos/R-2026-0001-A.pdf. Solo el dueno; en la pieza 5 tambien
// la sesion de cliente del clienteId correcto (por eso el cobro se busca por numero).
export async function GET(_req: Request, ctx: { params: Promise<{ archivo: string }> }) {
  const u = await sesionActual();
  // Location relativa: detras del proxy de Apache, la URL de la peticion es la de 127.0.0.1.
  if (!u) return new Response(null, { status: 307, headers: { location: "/entrar", ...SIN_CACHE } });
  if (u.rol !== "dueno") return new Response("No tienes permiso para ver recibos.", { status: 403, headers: SIN_CACHE });
  const { archivo } = await ctx.params;
  const m = ARCHIVO_RECIBO.exec(archivo);
  if (!m) return noEncontrado();
  const numero = m[1];
  const esNota = Boolean(m[3]);
  const cobro = await prisma.cobro.findFirst({ where: { reciboNumero: numero }, select: { notaAnulacionEn: true } });
  if (!cobro || (esNota && !cobro.notaAnulacionEn)) return noEncontrado();
  try {
    const bytes = await readFile(rutaDocumento(esNota ? `${numero}-A` : numero));
    return new Response(bytes, { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${archivo}"`, ...SIN_CACHE } });
  } catch {
    // Un recibo emitido no se regenera: si el archivo no esta, se dice y se revisa a mano.
    console.error("recibo sin archivo en disco", archivo);
    return noEncontrado("Recibo no disponible: el archivo no está en el servidor.");
  }
}
