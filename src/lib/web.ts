// src/lib/web.ts — consultas de la medicion de neracosu.com (21-oct). Lo puro vive en web-contrato.ts.
import { prisma } from "@/lib/db";
import { resumirWeb, type EventoNormal, type SolicitudNormal, type ResumenWeb } from "@/lib/web-contrato";

export const PERIODOS = [7, 30, 90] as const;
// Lo mas viejo que se guarda. Se poda al abrir /web: con el indice por fecha cuesta poco.
const DIAS_GUARDADOS = 400;

export async function registrarEvento(e: EventoNormal): Promise<void> {
  await prisma.eventoWeb.create({ data: e });
}

export async function guardarSolicitud(d: SolicitudNormal): Promise<{ id: number }> {
  return prisma.solicitudWeb.create({ data: d, select: { id: true } });
}

export async function resumenWeb(dias: number, ahora = new Date()): Promise<ResumenWeb> {
  const desde = new Date(ahora.getTime() - dias * 86_400_000);
  const [eventos, solicitudes] = await Promise.all([
    prisma.eventoWeb.findMany({
      where: { creadoEn: { gte: desde } },
      select: { sesion: true, tipo: true, ruta: true, detalle: true, origen: true, movil: true, creadoEn: true },
    }),
    prisma.solicitudWeb.count({ where: { creadaEn: { gte: desde } } }),
  ]);
  return resumirWeb(eventos, solicitudes);
}

export async function podarEventosViejos(ahora = new Date()): Promise<number> {
  const r = await prisma.eventoWeb.deleteMany({ where: { creadoEn: { lt: new Date(ahora.getTime() - DIAS_GUARDADOS * 86_400_000) } } });
  return r.count;
}

export type SolicitudFila = {
  id: number; nombre: string; correo: string; whatsapp: string; tipo: string; presupuesto: string; mensaje: string; pagina: string;
  creadaEn: Date; atendidaEn: Date | null;
};

// Las sin atender primero; dentro de cada grupo, la mas nueva arriba.
export async function listarSolicitudes(limite = 50): Promise<SolicitudFila[]> {
  return prisma.solicitudWeb.findMany({
    orderBy: [{ creadaEn: "desc" }],
    take: limite,
    select: { id: true, nombre: true, correo: true, whatsapp: true, tipo: true, presupuesto: true, mensaje: true, pagina: true, creadaEn: true, atendidaEn: true },
  }).then((xs) => [...xs.filter((x) => !x.atendidaEn), ...xs.filter((x) => x.atendidaEn)]);
}

export async function solicitudesSinAtender(): Promise<number> {
  return prisma.solicitudWeb.count({ where: { atendidaEn: null } });
}

// Para la tarjeta de Hoy: personas distintas que vieron alguna pagina en los ultimos 7 dias.
export async function personasSemana(ahora = new Date()): Promise<number> {
  const g = await prisma.eventoWeb.groupBy({
    by: ["sesion"],
    where: { tipo: "vista", creadoEn: { gte: new Date(ahora.getTime() - 7 * 86_400_000) } },
  });
  return g.length;
}
