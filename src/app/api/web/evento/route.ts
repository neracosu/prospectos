import { esBot, normalizarEvento, origenPermitido } from "@/lib/web-contrato";
import { registrarEvento } from "@/lib/web";
import { permitirIntento } from "@/lib/rate-limit";
import { ipDesdeCabeceras } from "@/lib/ip";
import { cabecerasCors, leerJson, preflight } from "../cors";

// POST /api/web/evento — lo que hace la gente en neracosu.com (assets/js/medir.js, por sendBeacon). Publica, sin
// sesion. Un robot recibe 204 igual, para que no aprenda nada; solo no se guarda.
export const OPTIONS = preflight;

export async function POST(req: Request) {
  const h = cabecerasCors(req.headers.get("origin"));
  if (!origenPermitido(req.headers.get("origin"))) return new Response(null, { status: 403, headers: h });
  if (esBot(req.headers.get("user-agent"))) return new Response(null, { status: 204, headers: h });
  const ip = ipDesdeCabeceras(req.headers.get("x-forwarded-for"), req.headers.get("x-real-ip"));
  if (!permitirIntento(`web:${ip}`, 120, 60_000)) return new Response(null, { status: 429, headers: h });
  const e = normalizarEvento(await leerJson(req, 2_000));
  if (!e) return new Response(null, { status: 400, headers: h });
  try { await registrarEvento(e); } catch (err) { console.error("evento web", err); return new Response(null, { status: 500, headers: h }); }
  return new Response(null, { status: 204, headers: h });
}
