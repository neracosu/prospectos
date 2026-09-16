import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { verificarToken } from "@/lib/auth";
import { COOKIE_SESION } from "@/lib/sesion";
import { permitirIntento } from "@/lib/rate-limit";
import { ipCliente } from "@/lib/ip";
import { leerPlantilla } from "@/lib/propuesta";
import { renderPropuesta } from "@/lib/propuesta-contrato";
import { CODIGO_VALIDO } from "@/lib/codigo";

const MINUTOS_DEDUPE = 30;

// Bots que piden el enlace para armar la vista previa (WhatsApp la busca apenas
// se envia el mensaje, antes de que nadie lo abra de verdad): no cuentan como
// una apertura real.
const BOT_UA = /whatsapp|facebookexternalhit|telegrambot|twitterbot|slackbot|discordbot|linkedinbot|bot\b|crawler|spider|preview/i;

function encabezados() {
  return { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex, nofollow", "cache-control": "no-store" };
}

// No se usa sesionActual() aqui: esa funcion puede hacer redirect() (lanza una
// excepcion de Next) cuando el usuario del token ya no esta activo, y esta ruta
// no tiene donde mandar ese redirect. Alcanza con un token valido para no
// contar la visita como apertura del prospecto; no hace falta ir a la base.
async function tieneSesion(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE_SESION)?.value;
  if (!token) return false;
  return (await verificarToken(token)) !== null;
}

async function encontrarProspecto(codigo: string) {
  if (!CODIGO_VALIDO.test(codigo)) return null;
  const p = await prisma.prospecto.findUnique({ where: { codigo }, select: { id: true, nombre: true, nicho: { select: { plantillaPropuesta: true } } } });
  if (!p || !p.nicho.plantillaPropuesta) return null;
  const plantilla = await leerPlantilla(p.nicho.plantillaPropuesta);
  if (!plantilla) return null;
  return { id: p.id, nombre: p.nombre, plantilla };
}

// Deja un Evento "abierto", salvo que quien abre tenga sesion (Neri revisando
// su propio enlace), sea un bot de vista previa, o ya haya una apertura reciente
// de la misma IP (refrescos o reintentos del propio navegador no deben sumar
// aperturas nuevas cada vez). El texto guarda la IP solo para deduplicar; la
// ficha del prospecto la oculta (no imprime el texto de eventos "abierto").
async function registrarAbiertoSiHaceFalta(prospectoId: number, req: Request): Promise<void> {
  if (BOT_UA.test(req.headers.get("user-agent") ?? "")) return;
  if (await tieneSesion()) return;
  try {
    const ip = await ipCliente();
    const desde = new Date(Date.now() - MINUTOS_DEDUPE * 60_000);
    const previo = await prisma.evento.findFirst({
      where: { prospectoId, tipo: "abierto", texto: ip, creadoEn: { gte: desde } },
    });
    if (previo) return;
    await prisma.evento.create({ data: { prospectoId, tipo: "abierto", texto: ip } });
  } catch (err) {
    // Si falla el registro del evento, la propuesta se sigue sirviendo igual:
    // el visitante no debe notar un problema interno de bitacora.
    console.error("registrarAbierto", prospectoId, err);
  }
}

// La unica ruta publica. Solo expone el nombre del negocio.
export async function GET(req: Request, ctx: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await ctx.params;
  if (!CODIGO_VALIDO.test(codigo)) return new Response("No encontrado", { status: 404 });
  // Un codigo invalido y uno que agoto el limite de intentos responden igual
  // (404): no hay forma de distinguir "existe pero estas apurando" desde afuera.
  if (!permitirIntento(`p:${await ipCliente()}`, 60, 60_000)) return new Response("No encontrado", { status: 404 });
  const p = await encontrarProspecto(codigo);
  if (!p) return new Response("No encontrado", { status: 404 });
  await registrarAbiertoSiHaceFalta(p.id, req);
  try {
    const html = renderPropuesta(p.plantilla, p.nombre, `/p/${codigo}/pdf`);
    return new Response(html, { headers: encabezados() });
  } catch (err) {
    // Una plantilla sin los marcadores esperados no debe tumbar la ruta
    // publica: se registra y se responde como si el codigo no existiera.
    console.error("renderPropuesta", codigo, err);
    return new Response("No encontrado", { status: 404 });
  }
}

// Next enrutaria un HEAD sin handler propio al GET (y ejecutaria sus efectos,
// como el Evento "abierto"): se define aparte para dar los mismos encabezados
// sin cuerpo y sin registrar nada.
export async function HEAD(_req: Request, ctx: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await ctx.params;
  if (!CODIGO_VALIDO.test(codigo)) return new Response(null, { status: 404 });
  if (!permitirIntento(`p:${await ipCliente()}`, 60, 60_000)) return new Response(null, { status: 404 });
  const p = await encontrarProspecto(codigo);
  if (!p) return new Response(null, { status: 404 });
  return new Response(null, { headers: encabezados() });
}
