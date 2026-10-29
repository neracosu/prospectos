// src/lib/leads.ts — consultas de leads (panel CRM, fase 2). Lo puro vive en leads-contrato.ts.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { Etapa } from "@/lib/embudo-contrato";
import { estadoDe, type EstadoHoy } from "@/lib/inicio-contrato";
import type { FuenteLead } from "@/lib/leads-contrato";
import type { Rol } from "@/lib/navegacion-contrato";

export type LeadTarjeta = {
  id: number; nombre: string; ciudad: string; nichoNombre: string; etapa: Etapa; fuenteLead: string; valorEstimado: number | null;
  proximoPaso: string; proximoSeguimiento: string | null; whatsapp: string; instagram: string; correo: string; propuestaUrl: string;
  estadoPaso: EstadoHoy | "";
};
export type ColumnaLeads = { etapa: Etapa; leads: LeadTarjeta[]; valor: number };
export type FiltrosLeads = { rol: Rol; fuente?: FuenteLead; nichoId?: number; q?: string; etapa?: Etapa };

// Las cinco columnas del tablero, sin descartados (van aparte, con su conteo).
export const COLUMNAS: Etapa[] = ["por_contactar", "enviado", "respondio", "reunion", "ganado"];

const SELECT = {
  id: true, nombre: true, ciudad: true, etapa: true, fuenteLead: true, valorEstimado: true, proximoPaso: true, proximoSeguimiento: true,
  whatsapp: true, instagram: true, email: true, propuestaUrl: true, nicho: { select: { nombre: true } },
} satisfies Prisma.ProspectoSelect;

function whereDe(f: FiltrosLeads): Prisma.ProspectoWhereInput {
  const q = f.q?.trim();
  return {
    esLead: true,
    // El prospectador solo ve lo que salio del directorio: si pide otra fuente por la URL, las dos condiciones se
    // suman y no ve nada (no se le abre la otra fuente en silencio)
    ...(f.rol === "prospectador" ? { fuenteLead: "directorio" } : {}),
    ...(f.fuente ? { AND: [{ fuenteLead: f.fuente }] } : {}),
    ...(f.nichoId ? { nichoId: f.nichoId } : {}),
    ...(q ? { OR: [{ nombre: { contains: q } }, { ciudad: { contains: q } }, { whatsapp: { contains: q } }, { instagram: { contains: q } }, { email: { contains: q } }] } : {}),
  };
}

function aTarjeta(f: Prisma.ProspectoGetPayload<{ select: typeof SELECT }>, hoy: string): LeadTarjeta {
  return {
    id: f.id, nombre: f.nombre, ciudad: f.ciudad, nichoNombre: f.nicho.nombre, etapa: f.etapa as Etapa, fuenteLead: f.fuenteLead,
    valorEstimado: f.valorEstimado === null ? null : Number(f.valorEstimado), proximoPaso: f.proximoPaso, proximoSeguimiento: f.proximoSeguimiento,
    whatsapp: f.whatsapp, instagram: f.instagram, correo: f.email, propuestaUrl: f.propuestaUrl,
    estadoPaso: f.proximoSeguimiento ? estadoDe(f.proximoSeguimiento, hoy) : "",
  };
}

// Dentro de cada columna: por fecha del siguiente paso (los sin fecha al final) y nombre.
function ordenar(a: LeadTarjeta, b: LeadTarjeta): number {
  if (a.proximoSeguimiento && b.proximoSeguimiento) return a.proximoSeguimiento.localeCompare(b.proximoSeguimiento) || a.nombre.localeCompare(b.nombre);
  if (a.proximoSeguimiento) return -1;
  if (b.proximoSeguimiento) return 1;
  return a.nombre.localeCompare(b.nombre);
}

export async function listarLeads(f: FiltrosLeads, hoy: string): Promise<{ columnas: ColumnaLeads[]; descartados: number; total: number; valorTotal: number }> {
  const where = whereDe(f);
  const [filas, descartados] = await Promise.all([
    prisma.prospecto.findMany({ where: { ...where, etapa: f.etapa ?? { in: COLUMNAS } }, select: SELECT, take: 1000 }),
    prisma.prospecto.count({ where: { ...where, etapa: "descartado" } }),
  ]);
  const tarjetas = filas.map((x) => aTarjeta(x, hoy));
  const columnas = COLUMNAS.map((etapa) => {
    const leads = tarjetas.filter((l) => l.etapa === etapa).sort(ordenar);
    return { etapa, leads, valor: leads.reduce((s, l) => s + (l.valorEstimado ?? 0), 0) };
  });
  return { columnas, descartados, total: tarjetas.length, valorTotal: columnas.reduce((s, c) => s + c.valor, 0) };
}

export async function listarDescartados(f: FiltrosLeads, hoy: string): Promise<LeadTarjeta[]> {
  const filas = await prisma.prospecto.findMany({ where: { ...whereDe(f), etapa: "descartado" }, select: SELECT, orderBy: { nombre: "asc" }, take: 200 });
  return filas.map((x) => aTarjeta(x, hoy));
}

export async function fichaLead(id: number, hoy: string): Promise<LeadTarjeta | null> {
  const f = await prisma.prospecto.findUnique({ where: { id }, select: SELECT });
  return f ? aTarjeta(f, hoy) : null;
}
