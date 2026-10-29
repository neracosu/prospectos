// src/lib/inicio.ts — consultas de la pantalla Inicio del dueno (panel CRM, fase 1). Lo puro vive en
// inicio-contrato.ts. «Leads activos» cuenta por etapa hasta que la fase 2 traiga esLead.
import { prisma } from "@/lib/db";
import { seguimientosQueTocan } from "@/lib/prospectos";
import { resumenMes, cobrosQueVencen, hitosQueTocan } from "@/lib/proyectos";
import { solicitudesSinAtender, personasSemana, listarSolicitudes, type SolicitudFila } from "@/lib/web";
import { armarHoy, type CifrasInicio, type ItemHoy } from "@/lib/inicio-contrato";

const ETAPAS_ACTIVAS = ["enviado", "respondio", "reunion"];

export async function datosInicio(hoy: string): Promise<{ cifras: CifrasInicio; hoyLista: ItemHoy[]; ultimas: SolicitudFila[] }> {
  const [leadsActivos, conVencido, enviados, conversando, cobros, hitos, mes, solicitudes, personasWeb, ultimas] = await Promise.all([
    prisma.prospecto.count({ where: { etapa: { in: ETAPAS_ACTIVAS } } }),
    prisma.prospecto.count({ where: { etapa: { in: ETAPAS_ACTIVAS }, proximoSeguimiento: { lt: hoy } } }),
    seguimientosQueTocan(hoy),
    // Respondio o en demo con una fecha puesta a mano desde la ficha: cuentan igual que un enviado
    prisma.prospecto.findMany({ where: { etapa: { in: ["respondio", "reunion"] }, proximoSeguimiento: { lte: hoy } }, select: { id: true, nombre: true, ciudad: true, whatsapp: true, proximoSeguimiento: true }, orderBy: { proximoSeguimiento: "asc" }, take: 50 }),
    cobrosQueVencen(hoy, 7),
    hitosQueTocan(hoy, 7),
    resumenMes(hoy),
    solicitudesSinAtender(),
    personasSemana(),
    listarSolicitudes(3),
  ]);
  return {
    cifras: { leadsActivos, conVencido, solicitudes, porCobrar: mes.porCobrar, vencido: mes.vencido, personasWeb },
    hoyLista: armarHoy({ hoy, seguimientos: [
      ...enviados.map((s) => ({ id: s.id, nombre: s.nombre, ciudad: s.ciudad, proximoSeguimiento: s.proximoSeguimiento, whatsapp: s.whatsapp, mensaje: s.mensaje })),
      ...conversando.map((s) => ({ id: s.id, nombre: s.nombre, ciudad: s.ciudad, proximoSeguimiento: s.proximoSeguimiento, whatsapp: s.whatsapp })),
    ], cobros, hitos }),
    ultimas,
  };
}
