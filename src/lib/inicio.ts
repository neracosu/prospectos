// src/lib/inicio.ts — consultas de la pantalla Inicio del dueno (panel CRM, fase 1). Lo puro vive en
// inicio-contrato.ts. Desde la fase 2 cuenta leads (esLead); los seguimientos de la prospeccion masiva
// (fuenteLead directorio, en Propuesta enviada) no entran aqui: viven en Directorio › Cola.
import { prisma } from "@/lib/db";
import { seguimientosQueTocan } from "@/lib/prospectos";
import { resumenMes, cobrosQueVencen, hitosQueTocan } from "@/lib/proyectos";
import { solicitudesSinAtender, personasSemana, listarSolicitudes, type SolicitudFila } from "@/lib/web";
import { armarHoy, type CifrasInicio, type ItemHoy } from "@/lib/inicio-contrato";

const ETAPAS_ACTIVAS = ["enviado", "respondio", "reunion"];

export async function datosInicio(hoy: string): Promise<{ cifras: CifrasInicio; hoyLista: ItemHoy[]; ultimas: SolicitudFila[] }> {
  const [leadsActivos, conVencido, enviados, conversando, cobros, hitos, mes, solicitudes, personasWeb, ultimas] = await Promise.all([
    prisma.prospecto.count({ where: { esLead: true, etapa: { in: ETAPAS_ACTIVAS } } }),
    prisma.prospecto.count({ where: { esLead: true, etapa: { in: ETAPAS_ACTIVAS }, proximoSeguimiento: { lt: hoy }, OR: [{ fuenteLead: { not: "directorio" } }, { etapa: { in: ["respondio", "reunion"] } }] } }),
    seguimientosQueTocan(hoy).then(async (xs) => {
      const propios = new Set((await prisma.prospecto.findMany({ where: { id: { in: xs.map((x) => x.id) }, esLead: true, fuenteLead: { not: "directorio" } }, select: { id: true } })).map((p) => p.id));
      return xs.filter((x) => propios.has(x.id));
    }),
    // Respondio o en demo con una fecha puesta a mano desde la ficha: cuentan igual que un enviado
    prisma.prospecto.findMany({ where: { esLead: true, etapa: { in: ["respondio", "reunion"] }, proximoSeguimiento: { lte: hoy } }, select: { id: true, nombre: true, ciudad: true, whatsapp: true, proximoSeguimiento: true }, orderBy: { proximoSeguimiento: "asc" }, take: 50 }),
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
