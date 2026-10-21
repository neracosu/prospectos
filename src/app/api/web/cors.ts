// Cabeceras CORS de las dos rutas publicas que llama neracosu.com. Solo ese origen; nada de cookies.
import { origenPermitido } from "@/lib/web-contrato";

export function cabecerasCors(origin: string | null): Record<string, string> {
  const o = origenPermitido(origin);
  const base: Record<string, string> = { "cache-control": "no-store", vary: "Origin" };
  return o ? { ...base, "access-control-allow-origin": o, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", "access-control-max-age": "86400" } : base;
}

export function preflight(req: Request): Response {
  return new Response(null, { status: 204, headers: cabecerasCors(req.headers.get("origin")) });
}

// El navegador manda text/plain (peticion simple, sin consulta previa). Se lee con tope de bytes.
export async function leerJson(req: Request, tope: number): Promise<unknown | undefined> {
  if (Number(req.headers.get("content-length") ?? "0") > tope) return undefined;
  const t = await req.text();
  if (t.length > tope) return undefined;
  try { return JSON.parse(t); } catch { return undefined; }
}
