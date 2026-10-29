// src/lib/cobros.ts — consultas de la seccion /cobros (panel CRM, fase 3): los cobros de todos los proyectos por
// filtro. Lo puro (filtros, orden) vive en cobros-contrato.ts; la fila es la misma CobroFila de la ficha del proyecto.
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import { ordenarCobros, type FiltroCobros } from "@/lib/cobros-contrato";
import { aCobroFila, resumenMes, type CobroFila } from "@/lib/proyectos";

const TOPE = 300;

function finDeMes(hoy: string): string {
  const [a, m] = hoy.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${hoy.slice(0, 7)}-${String(ultimo).padStart(2, "0")}`;
}

function whereDe(filtro: FiltroCobros, hoy: string): Prisma.CobroWhereInput {
  if (filtro === "pagados") return { pagadoEn: { not: null }, anuladoEn: null };
  const pendiente: Prisma.CobroWhereInput = { pagadoEn: null, anuladoEn: null };
  if (filtro === "vencidos") return { ...pendiente, vence: { lt: hoy } };
  // Misma regla que filtrarCobros y que cifrasDelMes.porCobrar: desde hoy hasta fin de mes
  if (filtro === "mes") return { ...pendiente, vence: { gte: hoy, lte: finDeMes(hoy) } };
  return pendiente;
}

export async function listarCobros(filtro: FiltroCobros, hoy: string): Promise<CobroFila[]> {
  // Los pagados se piden del mas reciente al mas viejo: con mas de TOPE, el corte deja fuera los viejos, no los de hoy
  const orden: Prisma.CobroOrderByWithRelationInput[] = filtro === "pagados" ? [{ pagadoEn: "desc" }, { vence: "desc" }] : [{ vence: "asc" }];
  const filas = await prisma.cobro.findMany({ where: whereDe(filtro, hoy), include: { proyecto: { select: { nombre: true } } }, orderBy: orden, take: TOPE });
  const desde = new Date(`${hoy}T00:00:00-04:00`);
  const recordadosHoy = new Set((await prisma.evento.findMany({ where: { tipo: "recordatorio", creadoEn: { gte: desde }, cobroId: { in: filas.map((f) => f.id) } }, select: { cobroId: true } })).map((e) => e.cobroId));
  return ordenarCobros(filas.map((c) => aCobroFila(c, hoy, recordadosHoy, c.proyecto.nombre)));
}

// Las tres cifras de arriba de /cobros: por cobrar este mes, vencido, cobrado este mes.
export const cifrasCobros = resumenMes;
