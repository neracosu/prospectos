"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { exigirRol } from "@/lib/sesion";
import { hoyCaracas } from "@/lib/fecha-caracas";
import type { Concepto } from "@/lib/cobros-contrato";
import { conceptoRecibo, mensajeRecibo } from "@/lib/recibos-contrato";
import { generarRecibo, generarNotaAnulacion } from "@/lib/recibos";
import { enlaceWhatsappCobro } from "@/lib/mensajes-cobro";
import { fallo, exito, type Resultado } from "@/acciones/resultado";

// exigirRol("dueno") va FUERA del try/catch. Solo el dueno genera, avisa y anula recibos.
const ERROR = "No se pudo completar. Intenta de nuevo.";
const Id = z.number().int().positive();
function refrescar(proyectoId: number) { revalidatePath(`/proyectos/${proyectoId}`); }
const codigoDe = (err: unknown) => (err instanceof Error ? err.message : "");

export async function generarReciboDeCobro(cobroId: number): Promise<Resultado<{ numero: string }>> {
  const u = await exigirRol("dueno");
  const e = Id.safeParse(cobroId);
  if (!e.success) return fallo(ERROR);
  try {
    const r = await generarRecibo(e.data, u.id);
    refrescar(r.proyectoId);
    return exito({ numero: r.numero });
  } catch (err) {
    const codigo = codigoDe(err);
    if (codigo === "EMISOR_INCOMPLETO") return fallo("Completa tus datos en Ajustes (nombre, RIF, WhatsApp y correo) antes de generar recibos.");
    if (codigo === "COBRO_NO_EXISTE") return fallo("Ese cobro no existe.");
    if (codigo === "RECIBO_NO_APLICA") return fallo("Solo un cobro pagado y sin anular puede tener recibo.");
    if (codigo === "PDF_OCUPADO") return fallo("El servidor está generando otro PDF. Intenta de nuevo en unos segundos.");
    if (codigo === "CORRELATIVO_DESFASADO") { console.error("generarReciboDeCobro: contador desfasado", e.data); return fallo("El contador de recibos quedó por detrás de los ya emitidos. No se generó nada: hay que revisar la tabla Correlativo."); }
    // El cobro sigue pagado y sin numero: no se gasto ningun correlativo.
    console.error("generarReciboDeCobro", e.data, err);
    return fallo("No se pudo generar el recibo. Intenta de nuevo.");
  }
}

// Devuelve el mensaje (para copiarlo) y el enlace de WhatsApp. El PDF lo adjunta Neri desde el
// telefono: WhatsApp no adjunta por enlace. Deja rastro una vez por dia de Caracas.
export async function avisarRecibo(cobroId: number): Promise<Resultado<{ href: string | null; mensaje: string; repetido: boolean }>> {
  const u = await exigirRol("dueno");
  const e = Id.safeParse(cobroId);
  if (!e.success) return fallo(ERROR);
  try {
    const c = await prisma.cobro.findUnique({ where: { id: e.data }, include: { proyecto: { include: { cliente: true } } } });
    if (!c) return fallo("Ese cobro no existe.");
    if (!c.reciboNumero) return fallo("Ese cobro todavía no tiene recibo.");
    if (c.anuladoEn) return fallo("Ese recibo está anulado: no se envía.");
    const cliente = c.proyecto.cliente;
    const mensaje = mensajeRecibo({
      cliente: cliente.contactoNombre || cliente.nombre, numero: c.reciboNumero, monto: Number(c.monto),
      concepto: conceptoRecibo({ concepto: c.concepto as Concepto, detalle: c.detalle, mes: c.mes }, c.proyecto.nombre),
    });
    const href = enlaceWhatsappCobro(cliente.whatsapp, mensaje);
    const texto = `recibo ${c.reciboNumero}`;
    const desde = new Date(`${hoyCaracas()}T00:00:00-04:00`);
    const yaHoy = await prisma.evento.findFirst({ where: { cobroId: c.id, tipo: "aviso_cliente", texto, creadoEn: { gte: desde } }, select: { id: true } });
    if (yaHoy) return exito({ href, mensaje, repetido: true });
    await prisma.evento.create({ data: { proyectoId: c.proyectoId, cobroId: c.id, usuarioId: u.id, tipo: "aviso_cliente", canal: href ? "whatsapp" : "", texto } });
    refrescar(c.proyectoId);
    return exito({ href, mensaje, repetido: false });
  } catch (err) { console.error("avisarRecibo", err); return fallo(ERROR); }
}

// Reintento de la nota cuando Chromium fallo al anular.
export async function generarNotaDeAnulacion(cobroId: number): Promise<Resultado<{ numero: string }>> {
  const u = await exigirRol("dueno");
  const e = Id.safeParse(cobroId);
  if (!e.success) return fallo(ERROR);
  try {
    const r = await generarNotaAnulacion(e.data, u.id);
    refrescar(r.proyectoId);
    return exito({ numero: r.numero });
  } catch (err) {
    const codigo = codigoDe(err);
    if (codigo === "COBRO_NO_EXISTE") return fallo("Ese cobro no existe.");
    if (codigo === "NOTA_NO_APLICA") return fallo("La nota solo aplica a un cobro anulado que ya tenía recibo.");
    if (codigo === "EMISOR_INCOMPLETO") return fallo("Completa tus datos en Ajustes (nombre, RIF, WhatsApp y correo) antes de generar la nota.");
    if (codigo === "PDF_OCUPADO") return fallo("El servidor está generando otro PDF. Intenta de nuevo en unos segundos.");
    console.error("generarNotaDeAnulacion", e.data, err);
    return fallo("No se pudo generar la nota. Intenta de nuevo.");
  }
}
