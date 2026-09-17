// src/lib/origen.ts — la comprobacion de origen que Next hace sola en las Server Actions, para los route
// handlers que escriben (la subida de documentos). Detras de Apache el host publico viene en X-Forwarded-Host.
export function mismoOrigen(headers: Headers): boolean {
  const origen = headers.get("origin");
  const esperado = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0].trim();
  if (!origen || !esperado) return false;
  try { return new URL(origen).host === esperado; } catch { return false; }
}
