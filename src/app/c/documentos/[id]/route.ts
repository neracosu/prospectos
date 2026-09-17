import { readFile } from "node:fs/promises";
import { sesionActual } from "@/lib/sesion";
import { sesionCliente } from "@/lib/sesion-cliente";
import { ipCliente } from "@/lib/ip";
import { permitirIntento } from "@/lib/rate-limit";
import { CODIGO_VALIDO } from "@/lib/codigo";
import { disposicion } from "@/lib/documentos-contrato";
import { documentoParaServir, rutaDeDocumento } from "@/lib/documentos";

const SIN_CACHE = { "cache-control": "private, no-store", "x-robots-tag": "noindex" };
const noEncontrado = (texto = "No encontrado") => new Response(texto, { status: 404, headers: SIN_CACHE });

// GET /c/documentos/<id> — el unico camino a un documento (pieza 5b). Entra el dueno, o el cliente dueno del
// proyecto. Para el cliente, lo ajeno, lo quitado y lo inexistente son EL MISMO 404: no hay forma de tantear ids.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await sesionActual();
  const cliente = u ? null : await sesionCliente();
  if (u && u.rol !== "dueno") return new Response("No tienes permiso para ver documentos.", { status: 403, headers: SIN_CACHE });
  // El limite de /c/* (120 por minuto por IP) tambien vale aqui; al dueno no se le cuenta.
  if (!u && !permitirIntento(`c:${await ipCliente()}`, 120, 60_000)) return noEncontrado();
  if (!u && !cliente) {
    // Sesion vencida: el enlace del portal trae ?c=<codigo>. El codigo lo puso quien pide, asi que volver a SU
    // pantalla de PIN no revela nada; sin el, 404 (decir de que cliente es el documento seria regalar su codigo).
    const c = new URL(req.url).searchParams.get("c") ?? "";
    return CODIGO_VALIDO.test(c) ? new Response(null, { status: 307, headers: { location: `/c/${c}`, ...SIN_CACHE } }) : noEncontrado();
  }
  const { id } = await ctx.params;
  const d = /^\d{1,9}$/.test(id) ? await documentoParaServir(Number(id)) : null;
  if (!d) return noEncontrado();
  if (cliente && (d.clienteId !== cliente.clienteId || d.quitado)) return noEncontrado();
  try {
    const bytes = await readFile(rutaDeDocumento(d.archivo));
    return new Response(bytes, { headers: { "content-type": d.tipoMime, "content-disposition": disposicion(d.tipoMime, d.nombre), ...SIN_CACHE } });
  } catch {
    // Un documento no se regenera: si el archivo no esta, se dice y se revisa a mano.
    console.error("documento sin archivo en disco", id);
    return noEncontrado(cliente ? "Documento no disponible. Escríbenos y te lo enviamos." : "Documento no disponible: el archivo no está en el servidor.");
  }
}
