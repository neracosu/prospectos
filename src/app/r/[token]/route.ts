import { registrarClic } from "@/lib/correos";
import { tieneSesion } from "@/lib/sesion-ligera";

export const dynamic = "force-dynamic";

// Enlace del correo: cuenta el clic y manda a la propuesta llevando el token para contar el PDF.
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  let codigo: string | null = null;
  try { codigo = await registrarClic(token, { conSesion: await tieneSesion() }); } catch (err) { console.error("clic correo", err); }
  if (!codigo) return new Response("No encontrado", { status: 404 });
  return new Response(null, { status: 302, headers: { location: `/p/${codigo}?e=${token}`, "cache-control": "no-store", "x-robots-tag": "noindex" } });
}
