import { normalizarSolicitud, origenPermitido } from "@/lib/web-contrato";
import { guardarSolicitud } from "@/lib/web";
import { avisarSolicitud } from "@/lib/correo";
import { permitirIntento } from "@/lib/rate-limit";
import { ipDesdeCabeceras } from "@/lib/ip";
import { cabecerasCors, leerJson, preflight } from "../cors";

// POST /api/web/solicitud — el formulario de contacto de neracosu.com. Publica, sin sesion: guarda la solicitud y
// avisa a Neri por correo. Si el correo falla, la solicitud queda igual en /web.
export const OPTIONS = preflight;

export async function POST(req: Request) {
  const h = cabecerasCors(req.headers.get("origin"));
  const responder = (status: number, cuerpo: object) => Response.json(cuerpo, { status, headers: h });
  if (!origenPermitido(req.headers.get("origin"))) return responder(403, { ok: false, mensaje: "No se pudo enviar." });
  const ip = ipDesdeCabeceras(req.headers.get("x-forwarded-for"), req.headers.get("x-real-ip"));
  if (!permitirIntento(`websol:${ip}`, 5, 15 * 60_000)) return responder(429, { ok: false, mensaje: "Recibí varios mensajes seguidos desde su conexión. Escríbame por WhatsApp, por favor." });
  const r = normalizarSolicitud(await leerJson(req, 20_000));
  if (!r.ok) return r.robot ? responder(200, { ok: true }) : responder(400, { ok: false, mensaje: r.mensaje });
  try {
    await guardarSolicitud(r.datos);
  } catch (err) {
    console.error("solicitud web", err);
    return responder(500, { ok: false, mensaje: "No se pudo guardar su mensaje. Escríbame por WhatsApp, por favor." });
  }
  await avisarSolicitud(r.datos).catch((err) => console.error("aviso solicitud", err));
  return responder(200, { ok: true });
}
