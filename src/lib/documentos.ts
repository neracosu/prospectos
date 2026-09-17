// src/lib/documentos.ts — documentos que Neri sube a un proyecto y el cliente ve en su portal (pieza 5b).
// El archivo va fuera del docroot: <dir>/documentos/<clienteId>/<uuid>.<ext>. No se regenera NUNCA y nada lo borra.
// Usa node: -> NO importarlo desde la cadena de src/instrumentation.ts (ver CLAUDE.md).
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { dirArchivos, escribirAtomico } from "@/lib/archivos";
import { TAMANO_MAXIMO, TIPOS, RUTA_DOCUMENTO, detectarTipo, nombreVisible } from "@/lib/documentos-contrato";

export type DocumentoFila = { id: number; nombre: string; tipoMime: string; tamano: number; subidoEn: Date };

// La ruta sale SIEMPRE de la base, pero igual se valida: de aqui no se lee nada que no sea documentos/<n>/<uuid>.<ext>.
export function rutaDeDocumento(archivo: string): string {
  if (!RUTA_DOCUMENTO.test(archivo)) throw new Error("DOCUMENTO_INVALIDO");
  const raiz = path.join(dirArchivos(), "documentos");
  const ruta = path.resolve(dirArchivos(), archivo);
  if (!ruta.startsWith(raiz + path.sep)) throw new Error("DOCUMENTO_INVALIDO");
  return ruta;
}

export async function guardarDocumento(d: { proyectoId: number; nombre: string; nombreArchivo: string; bytes: Uint8Array; usuarioId: number }): Promise<{ id: number }> {
  if (d.bytes.length === 0) throw new Error("ARCHIVO_VACIO");
  if (d.bytes.length > TAMANO_MAXIMO) throw new Error("ARCHIVO_GRANDE");
  const tipoMime = detectarTipo(d.bytes);
  if (!tipoMime) throw new Error("TIPO_NO_PERMITIDO");
  const proyecto = await prisma.proyecto.findUnique({ where: { id: d.proyectoId }, select: { clienteId: true } });
  if (!proyecto) throw new Error("PROYECTO_NO_EXISTE");
  const nombre = nombreVisible(d.nombre, d.nombreArchivo);
  const archivo = `documentos/${proyecto.clienteId}/${randomUUID()}.${TIPOS[tipoMime].ext}`;
  const ruta = rutaDeDocumento(archivo);
  // Primero el archivo, despues la fila: una fila sin archivo le daria al cliente un enlace roto.
  await escribirAtomico(ruta, d.bytes);
  try {
    // Fila y evento van juntos: un documento subido nunca queda sin su rastro.
    return await prisma.$transaction(async (tx) => {
      const fila = await tx.documento.create({ data: { proyectoId: d.proyectoId, nombre, archivo, tipoMime, tamano: d.bytes.length, usuarioId: d.usuarioId }, select: { id: true } });
      await tx.evento.create({ data: { proyectoId: d.proyectoId, usuarioId: d.usuarioId, tipo: "documento_subido", texto: nombre } });
      return fila;
    });
  } catch (err) {
    // La base no lo conoce: ese archivo no es de nadie. Es el unico rm de la pieza y solo toca lo que acaba de escribir.
    await rm(ruta, { force: true });
    throw err;
  }
}

export async function quitarDocumento(id: number, usuarioId: number): Promise<{ proyectoId: number; quitado: boolean }> {
  const d = await prisma.documento.findUnique({ where: { id }, select: { proyectoId: true, nombre: true } });
  if (!d) throw new Error("DOCUMENTO_NO_EXISTE");
  // Marca y evento van juntos; si dos toques llegaron a la vez, solo uno cuenta.
  const quitado = await prisma.$transaction(async (tx) => {
    const r = await tx.documento.updateMany({ where: { id, quitadoEn: null }, data: { quitadoEn: new Date() } });
    if (r.count === 0) return false;
    await tx.evento.create({ data: { proyectoId: d.proyectoId, usuarioId, tipo: "documento_quitado", texto: d.nombre } });
    return true;
  });
  return { proyectoId: d.proyectoId, quitado };
}

export async function documentosDeProyecto(proyectoId: number): Promise<DocumentoFila[]> {
  return prisma.documento.findMany({
    where: { proyectoId, quitadoEn: null },
    select: { id: true, nombre: true, tipoMime: true, tamano: true, subidoEn: true },
    orderBy: [{ subidoEn: "desc" }, { id: "desc" }],
  });
}

export async function documentoParaServir(id: number): Promise<{ nombre: string; tipoMime: string; archivo: string; quitado: boolean; clienteId: number } | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const d = await prisma.documento.findUnique({ where: { id }, select: { nombre: true, tipoMime: true, archivo: true, quitadoEn: true, proyecto: { select: { clienteId: true } } } });
  return d ? { nombre: d.nombre, tipoMime: d.tipoMime, archivo: d.archivo, quitado: d.quitadoEn !== null, clienteId: d.proyecto.clienteId } : null;
}
