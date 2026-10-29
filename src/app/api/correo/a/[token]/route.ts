import { registrarApertura } from "@/lib/correos";
import { tieneSesion } from "@/lib/sesion-ligera";

export const dynamic = "force-dynamic";

// PNG 1x1 transparente.
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=", "base64");

// Siempre 200 con el mismo PNG: no dice si el token existe. Cuenta la apertura si es de un envio real.
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  // El <img> del correo pide /api/correo/a/<token>.png y el segmento llega entero: se quita la extension.
  const token = (await ctx.params).token.replace(/\.png$/i, "");
  try { await registrarApertura(token, { conSesion: await tieneSesion() }); } catch (err) { console.error("pixel correo", err); }
  return new Response(PIXEL, { headers: { "content-type": "image/png", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}
