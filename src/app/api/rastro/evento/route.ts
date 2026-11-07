import { clasificarUa, esIpDeMeta, normalizarEventoJs } from "@/lib/rastro-contrato";
import { registrarEventoJs } from "@/lib/rastro";
import { permitirIntento } from "@/lib/rate-limit";
import { ipDesdeCabeceras } from "@/lib/ip";
import { leerJson } from "../../web/cors";
import { cabecerasCorsRastro, origenPermitidoRastro, preflightRastro } from "../cors";

// POST /api/rastro/evento — lo que hace quien abre un enlace enviado (public/rastro.js, por sendBeacon). Publica,
// sin sesion. Un robot recibe 204 igual para que no aprenda nada; solo no se guarda.
export const OPTIONS = preflightRastro;

export async function POST(req: Request) {
  const h = cabecerasCorsRastro(req.headers.get("origin"));
  const fin = (status: number) => new Response(null, { status, headers: h });
  if (!origenPermitidoRastro(req.headers.get("origin"))) return fin(403);
  const ua = req.headers.get("user-agent") ?? "";
  if (clasificarUa(ua).clase === "robot") return fin(204);
  const ip = ipDesdeCabeceras(req.headers.get("x-forwarded-for"), req.headers.get("x-real-ip"));
  // La vista previa de Meta tambien corre el script con UA de navegador: no es el prospecto
  if (esIpDeMeta(ip)) return fin(204);
  if (!permitirIntento(`rastro:${ip}`, 120, 60_000)) return fin(429);
  try {
    const e = normalizarEventoJs(await leerJson(req, 2_000));
    if (!e) return fin(400);
    return fin((await registrarEventoJs(e, ip, ua)) ? 204 : 404);
  } catch (err) {
    console.error("evento rastro", err);
    return fin(500);
  }
}
