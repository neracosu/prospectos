import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { verificarToken } from "@/lib/auth";
import { COOKIE_SESION } from "@/lib/sesion";
import { permitirIntento } from "@/lib/rate-limit";
import { ipCliente } from "@/lib/ip";
import { leerPlantilla } from "@/lib/propuesta";
import { renderPropuesta } from "@/lib/propuesta-contrato";

const NO = () => new Response("No encontrado", { status: 404 });

// La unica ruta publica. Solo expone el nombre del negocio. Cada visita deja un
// Evento "abierto", salvo si quien abre tiene sesion (Neri revisando su enlace).
//
// No se usa sesionActual() aqui: esa funcion puede hacer redirect() (lanza una
// excepcion de Next) cuando el usuario del token ya no esta activo, y esta ruta
// no tiene donde mandar ese redirect. Alcanza con un token valido para no
// contar la visita como apertura del prospecto; no hace falta ir a la base.
async function tieneSesion(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE_SESION)?.value;
  if (!token) return false;
  return (await verificarToken(token)) !== null;
}

export async function GET(_req: Request, ctx: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{22}$/.test(codigo)) return NO();
  if (!permitirIntento(`p:${await ipCliente()}`, 60, 60_000)) return NO();
  const p = await prisma.prospecto.findUnique({ where: { codigo }, select: { id: true, nombre: true, nicho: { select: { plantillaPropuesta: true } } } });
  if (!p || !p.nicho.plantillaPropuesta) return NO();
  const plantilla = await leerPlantilla(p.nicho.plantillaPropuesta);
  if (!plantilla) return NO();
  if (!(await tieneSesion())) await prisma.evento.create({ data: { prospectoId: p.id, tipo: "abierto" } });
  const html = renderPropuesta(plantilla, p.nombre, `/p/${codigo}/pdf`);
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex, nofollow", "cache-control": "no-store" } });
}
