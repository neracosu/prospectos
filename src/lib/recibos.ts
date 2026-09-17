// src/lib/recibos.ts — genera y guarda los recibos de pago y sus notas de anulacion (pieza 4).
// Usa node: -> NO importarlo desde la cadena de src/instrumentation.ts (ver CLAUDE.md).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { hoyCaracas } from "@/lib/fecha-caracas";
import { leerEmisor } from "@/lib/configuracion";
import { conTurnoGlobal, imprimirPdf, escribirAtomico } from "@/lib/pdf";
import type { Concepto } from "@/lib/cobros-contrato";
import {
  SERIE_RECIBO, anioDeDocumento, numeroRecibo, numeroNota, conceptoRecibo, versionesIncluidas, faltantesEmisor,
  camposRecibo, camposNota, renderDocumento, fuentesDePlantilla, incrustarFuentes, type DatosRecibo,
} from "@/lib/recibos-contrato";

const DIR_PLANTILLAS = path.join(process.cwd(), "plantillas");
const dirArchivos = () => process.env.PROSPECTOS_DIR_ARCHIVOS ?? "/home/neracosu/prospectos-archivos";

// nombre = "R-2026-0001" o "R-2026-0001-A" (sin .pdf). Fuera del docroot, una carpeta por anio.
export function rutaDocumento(nombre: string): string {
  const anio = anioDeDocumento(nombre);
  if (!anio) throw new Error("DOCUMENTO_INVALIDO");
  return path.join(dirArchivos(), "recibos", anio, `${nombre}.pdf`);
}

async function plantillaConFuentes(): Promise<string> {
  const plantilla = await readFile(path.join(DIR_PLANTILLAS, "recibo.html"), "utf8");
  const fuentes: Record<string, string> = {};
  for (const archivo of fuentesDePlantilla(plantilla)) fuentes[archivo] = (await readFile(path.join(DIR_PLANTILLAS, "fuentes", archivo))).toString("base64");
  return incrustarFuentes(plantilla, fuentes);
}

const INCLUIR = { proyecto: { include: { cliente: true, versiones: { select: { version: true, fecha: true } } } } } as const;
type CobroCompleto = NonNullable<Awaited<ReturnType<typeof leerCobro>>>;
function leerCobro(db: Pick<typeof prisma, "cobro">, id: number) {
  return db.cobro.findUnique({ where: { id }, include: INCLUIR });
}

function datosDe(c: CobroCompleto, numero: string, emitidoEl: string, emisor: DatosRecibo["emisor"]): DatosRecibo {
  return {
    numero, emitidoEl, emisor,
    cliente: { nombre: c.proyecto.cliente.nombre, rif: c.proyecto.cliente.rif, contactoNombre: c.proyecto.cliente.contactoNombre },
    concepto: conceptoRecibo({ concepto: c.concepto as Concepto, detalle: c.detalle, mes: c.mes }, c.proyecto.nombre),
    versiones: versionesIncluidas(c.proyecto.versiones, c.mes),
    monto: Number(c.monto), fechaPago: hoyCaracas(c.pagadoEn ?? new Date()), canal: c.canal, referencia: c.referencia,
  };
}

// El numero va impreso en el PDF y a la vez solo se puede gastar si el PDF existe. Las dos
// cosas se cumplen asi: con la fila del contador bloqueada se calcula el numero, se genera
// el PDF, y recien al final se confirma. Si Chromium falla, la excepcion deshace la
// transaccion y el numero sigue libre. El bloqueo ademas serializa las generaciones.
export async function generarRecibo(cobroId: number, usuarioId: number): Promise<{ numero: string; nuevo: boolean; proyectoId: number }> {
  const emisor = await leerEmisor();
  if (faltantesEmisor(emisor).length > 0) throw new Error("EMISOR_INCOMPLETO");
  const plantilla = await plantillaConFuentes();
  const hoy = hoyCaracas();
  const anio = Number(hoy.slice(0, 4));
  // La fila del contador tiene que existir para poder bloquearla. Va FUERA de la transaccion:
  // dos INSERT IGNORE simultaneos dentro de transacciones largas se pueden interbloquear.
  await prisma.$executeRaw`INSERT IGNORE INTO Correlativo (serie, anio, ultimo) VALUES (${SERIE_RECIBO}, ${anio}, 0)`;
  return prisma.$transaction(async (tx) => {
    const filas = await tx.$queryRaw<{ ultimo: number | bigint }[]>`SELECT ultimo FROM Correlativo WHERE serie = ${SERIE_RECIBO} AND anio = ${anio} FOR UPDATE`;
    // Con el contador bloqueado nadie mas esta generando: lo que se lea ahora del cobro es definitivo.
    const c = await leerCobro(tx, cobroId);
    if (!c) throw new Error("COBRO_NO_EXISTE");
    if (c.reciboNumero) return { numero: c.reciboNumero, nuevo: false, proyectoId: c.proyectoId }; // un recibo emitido no cambia
    if (!c.pagadoEn || c.anuladoEn) throw new Error("RECIBO_NO_APLICA");
    const numero = numeroRecibo(anio, Number(filas[0].ultimo) + 1);
    const html = renderDocumento(plantilla, camposRecibo(datosDe(c, numero, hoy, emisor)));
    // Pisa el archivo si existiera: solo puede ser el resto de una transaccion que no llego a confirmar.
    await conTurnoGlobal(async () => escribirAtomico(rutaDocumento(numero), await imprimirPdf(html)));
    await tx.$executeRaw`UPDATE Correlativo SET ultimo = ultimo + 1 WHERE serie = ${SERIE_RECIBO} AND anio = ${anio}`;
    const r = await tx.cobro.updateMany({ where: { id: cobroId, reciboNumero: "", anuladoEn: null, pagadoEn: { not: null } }, data: { reciboNumero: numero, reciboGeneradoEn: new Date() } });
    if (r.count === 0) throw new Error("RECIBO_NO_APLICA"); // lo anularon mientras se generaba
    await tx.evento.create({ data: { proyectoId: c.proyectoId, cobroId, usuarioId, tipo: "recibo_generado", texto: numero } });
    return { numero, nuevo: true, proyectoId: c.proyectoId };
    // ReadCommitted: la lectura del cobro tiene que ver lo que confirmo quien tenia el bloqueo antes.
    // timeout: hasta 20 s de fila de Chromium mas la generacion.
  }, { isolationLevel: "ReadCommitted", maxWait: 60_000, timeout: 90_000 });
}

// La nota no gasta correlativo: es el numero del recibo con -A. Si Chromium fallo al anular,
// se puede reintentar despues; por eso el cobro guarda notaAnulacionEn.
export async function generarNotaAnulacion(cobroId: number, usuarioId: number): Promise<{ numero: string; nueva: boolean; proyectoId: number }> {
  const c = await leerCobro(prisma, cobroId);
  if (!c) throw new Error("COBRO_NO_EXISTE");
  if (!c.anuladoEn || !c.reciboNumero || !c.reciboGeneradoEn) throw new Error("NOTA_NO_APLICA");
  const numero = numeroNota(c.reciboNumero);
  if (c.notaAnulacionEn) return { numero, nueva: false, proyectoId: c.proyectoId };
  const datos = datosDe(c, c.reciboNumero, hoyCaracas(c.reciboGeneradoEn), await leerEmisor());
  const html = renderDocumento(await plantillaConFuentes(), camposNota(datos, { anuladoEl: hoyCaracas(c.anuladoEn), motivo: c.anuladoMotivo }));
  await conTurnoGlobal(async () => escribirAtomico(rutaDocumento(numero), await imprimirPdf(html)));
  // Marca y evento van juntos; si dos toques llegaron a la vez, solo uno cuenta.
  const nueva = await prisma.$transaction(async (tx) => {
    const r = await tx.cobro.updateMany({ where: { id: cobroId, notaAnulacionEn: null }, data: { notaAnulacionEn: new Date() } });
    if (r.count === 0) return false;
    await tx.evento.create({ data: { proyectoId: c.proyectoId, cobroId, usuarioId, tipo: "nota_anulacion", texto: numero } });
    return true;
  });
  return { numero, nueva, proyectoId: c.proyectoId };
}
