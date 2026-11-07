// CORS de la ruta publica del rastro: la llaman las propuestas y demos que viven en neracosu.com y sus subdominios.
// Solo https; nada de cookies.
const RE_SUB = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.neracosu\.com$/;

export function origenPermitidoRastro(origin: string | null): string | null {
  if (!origin) return null;
  if (origin === "https://neracosu.com" || origin === "https://www.neracosu.com") return origin;
  return RE_SUB.test(origin) ? origin : null;
}

export function cabecerasCorsRastro(origin: string | null): Record<string, string> {
  const o = origenPermitidoRastro(origin);
  const base: Record<string, string> = { "cache-control": "no-store", vary: "Origin" };
  return o ? { ...base, "access-control-allow-origin": o, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", "access-control-max-age": "86400" } : base;
}

export function preflightRastro(req: Request): Response {
  return new Response(null, { status: 204, headers: cabecerasCorsRastro(req.headers.get("origin")) });
}
