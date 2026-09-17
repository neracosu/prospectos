"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { exigirRol } from "@/lib/sesion";
import { hoyCaracas, esFechaIso } from "@/lib/fecha-caracas";
import { MONTO_TEXTO, formatoUSD } from "@/lib/dinero";
import { CANALES_COBRO, ETIQUETA_CANAL_COBRO, estadoCobro, type Concepto } from "@/lib/cobros-contrato";
import { leerConfig, CLAVES } from "@/lib/configuracion";
import { mensajeDeCobro, enlaceWhatsappCobro } from "@/lib/mensajes-cobro";
import { generarNotaAnulacion } from "@/lib/recibos";
import { fallo, exito, type Resultado } from "@/acciones/resultado";

// exigirRol("dueno") va FUERA del try/catch. Nada se borra: los cobros se anulan con motivo (tambien los pagados).
const ERROR = "No se pudo guardar. Intenta de nuevo.";
const COBRO_YA_RESUELTO = "COBRO_YA_RESUELTO";
const Id = z.number().int().positive();
function refrescar(proyectoId: number) { revalidatePath("/proyectos"); revalidatePath(`/proyectos/${proyectoId}`); revalidatePath("/hoy"); }

const PagoZ = z.object({
  cobroId: z.coerce.number().int().positive(),
  pagadoEn: z.string().trim().refine(esFechaIso, "fecha"),
  canal: z.enum(CANALES_COBRO),
  referencia: z.string().trim().max(80).default(""),
  nota: z.string().trim().max(500).default(""),
});

export async function marcarPagado(formData: FormData): Promise<Resultado> {
  const u = await exigirRol("dueno");
  const e = PagoZ.safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("Revisa la fecha y el canal.");
  const d = e.data;
  if (d.pagadoEn > hoyCaracas()) return fallo("La fecha de pago no puede ser futura.");
  try {
    const c = await prisma.cobro.findUnique({ where: { id: d.cobroId }, select: { proyectoId: true, monto: true } });
    if (!c) return fallo("Ese cobro no existe.");
    // Update y evento van juntos: si el evento fallara, el pago tampoco queda a medias.
    await prisma.$transaction(async (tx) => {
      // Mediodia de Caracas del dia elegido: el mes de Caracas del pago queda bien en cifrasDelMes.
      const r = await tx.cobro.updateMany({ where: { id: d.cobroId, pagadoEn: null, anuladoEn: null }, data: { pagadoEn: new Date(`${d.pagadoEn}T12:00:00-04:00`), canal: d.canal, referencia: d.referencia, nota: d.nota } });
      if (r.count === 0) throw new Error(COBRO_YA_RESUELTO);
      await tx.evento.create({ data: { proyectoId: c.proyectoId, cobroId: d.cobroId, usuarioId: u.id, tipo: "cobro_pagado", texto: `${formatoUSD(Number(c.monto))} por ${ETIQUETA_CANAL_COBRO[d.canal]}${d.referencia ? ` (${d.referencia})` : ""}` } });
    });
    refrescar(c.proyectoId);
    return exito();
  } catch (err) {
    if (err instanceof Error && err.message === COBRO_YA_RESUELTO) return fallo("Ese cobro ya estaba pagado o anulado.");
    console.error("marcarPagado", err); return fallo(ERROR);
  }
}

// Desde la pieza 4 tambien se anula un cobro pagado: es la unica forma de corregir un pago
// marcado por error o un recibo mal emitido. Nada se borra: el pago, el recibo y su PDF quedan,
// y si habia recibo se genera la nota de anulacion R-...-A.
export async function anularCobro(cobroId: number, motivo: string): Promise<Resultado> {
  const u = await exigirRol("dueno");
  const e = z.object({ id: Id, motivo: z.string().trim().min(2).max(191) }).safeParse({ id: cobroId, motivo });
  if (!e.success) return fallo("Escribe el motivo (hasta 191 caracteres).");
  try {
    const c = await prisma.cobro.findUnique({ where: { id: e.data.id }, select: { proyectoId: true } });
    if (!c) return fallo("Ese cobro no existe.");
    await prisma.$transaction(async (tx) => {
      const r = await tx.cobro.updateMany({ where: { id: e.data.id, anuladoEn: null }, data: { anuladoEn: new Date(), anuladoMotivo: e.data.motivo } });
      if (r.count === 0) throw new Error(COBRO_YA_RESUELTO);
      await tx.evento.create({ data: { proyectoId: c.proyectoId, cobroId: e.data.id, usuarioId: u.id, tipo: "cobro_anulado", texto: e.data.motivo } });
    });
    // Se lee DESPUES de anular: si un recibo se estaba generando a la vez, o quedo emitido
    // antes de la anulacion (y entonces lleva nota) o su transaccion fallo (y no hay recibo).
    const despues = await prisma.cobro.findUnique({ where: { id: e.data.id }, select: { reciboNumero: true } });
    if (despues?.reciboNumero) {
      // Si Chromium falla, el cobro ya quedo anulado: la nota se genera despues desde la fila.
      try { await generarNotaAnulacion(e.data.id, u.id); } catch (err) { console.error("anularCobro: nota de anulacion", e.data.id, err); }
    }
    refrescar(c.proyectoId);
    return exito();
  } catch (err) {
    if (err instanceof Error && err.message === COBRO_YA_RESUELTO) return fallo("Ese cobro ya estaba anulado.");
    console.error("anularCobro", err); return fallo(ERROR);
  }
}

const NuevoZ = z.object({
  proyectoId: z.coerce.number().int().positive(),
  concepto: z.enum(["cuota", "extra"]), // pago_unico nace con el proyecto; mensualidad la genera el cron
  detalle: z.string().trim().min(2).max(120),
  monto: z.string().trim().regex(MONTO_TEXTO),
  vence: z.string().trim().refine(esFechaIso, "fecha"),
});
export async function agregarCobro(formData: FormData): Promise<Resultado> {
  const u = await exigirRol("dueno");
  const e = NuevoZ.safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("Revisa concepto (cuota o extra), detalle, monto y fecha.");
  const d = e.data;
  try {
    // Cobro y evento van juntos: un cobro nuevo nunca queda sin su rastro.
    await prisma.$transaction(async (tx) => {
      const nuevo = await tx.cobro.create({ data: { proyectoId: d.proyectoId, concepto: d.concepto, detalle: d.detalle, monto: new Prisma.Decimal(d.monto.replace(",", ".")), vence: d.vence }, select: { id: true } });
      await tx.evento.create({ data: { proyectoId: d.proyectoId, cobroId: nuevo.id, usuarioId: u.id, tipo: "cobro_agregado", texto: `${d.concepto}: ${d.detalle}` } });
    });
    refrescar(d.proyectoId);
    return exito();
  } catch (err) { console.error("agregarCobro", err); return fallo(ERROR); }
}

// Devuelve el enlace de WhatsApp con el mensaje. Deja rastro la primera vez del dia de Caracas;
// si ya se recordo hoy, devuelve el mismo enlace con repetido:true (para reabrir WhatsApp si
// la ventana no abrio), sin duplicar el evento.
export async function registrarRecordatorio(cobroId: number): Promise<Resultado<{ href: string; repetido: boolean }>> {
  const u = await exigirRol("dueno");
  const e = Id.safeParse(cobroId);
  if (!e.success) return fallo(ERROR);
  try {
    const c = await prisma.cobro.findUnique({ where: { id: e.data }, include: { proyecto: { include: { cliente: true } } } });
    if (!c) return fallo("Ese cobro no existe.");
    if (c.pagadoEn || c.anuladoEn) return fallo("Ese cobro ya está pagado o anulado.");
    const hoy = hoyCaracas();
    const mensaje = mensajeDeCobro({ concepto: c.concepto as Concepto, detalle: c.detalle, monto: Number(c.monto), vence: c.vence, estado: estadoCobro(c, hoy) }, c.proyecto, c.proyecto.cliente,
      { recordatorio: await leerConfig(CLAVES.mensajeRecordatorio), vencido: await leerConfig(CLAVES.mensajeVencido) });
    const href = enlaceWhatsappCobro(c.proyecto.cliente.whatsapp, mensaje);
    if (!href) return fallo("El cliente no tiene WhatsApp cargado. Agrégalo en su ficha o copia el mensaje.");
    const desde = new Date(`${hoy}T00:00:00-04:00`);
    const yaHoy = await prisma.evento.findFirst({ where: { cobroId: c.id, tipo: "recordatorio", creadoEn: { gte: desde } }, select: { id: true } });
    if (yaHoy) return exito({ href, repetido: true });
    await prisma.evento.create({ data: { proyectoId: c.proyectoId, cobroId: c.id, usuarioId: u.id, tipo: "recordatorio", canal: "whatsapp", texto: c.detalle } });
    refrescar(c.proyectoId);
    return exito({ href, repetido: false });
  } catch (err) { console.error("registrarRecordatorio", err); return fallo(ERROR); }
}
