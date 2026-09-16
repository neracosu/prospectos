// src/lib/clientes.ts
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { generarCodigo } from "@/lib/codigo";

export type ClienteFila = {
  id: number; nombre: string; contactoNombre: string; whatsapp: string; email: string; rif: string;
  instagram: string; facebook: string; tiktok: string; prospectoId: number | null; proyectos: number;
};

const SELECT = { id: true, nombre: true, contactoNombre: true, whatsapp: true, email: true, rif: true, instagram: true, facebook: true, tiktok: true, prospectoId: true, _count: { select: { proyectos: true } } } as const;
type Fila = Prisma.ClienteGetPayload<{ select: typeof SELECT }>;
const aFila = ({ _count, ...c }: Fila): ClienteFila => ({ ...c, proyectos: _count.proyectos });

export async function listarClientes(q?: string): Promise<ClienteFila[]> {
  const t = q?.trim();
  const filas = await prisma.cliente.findMany({ where: t ? { OR: [{ nombre: { contains: t } }, { contactoNombre: { contains: t } }, { rif: { contains: t } }] } : {}, select: SELECT, orderBy: { nombre: "asc" }, take: 100 });
  return filas.map(aFila);
}

export async function fichaCliente(id: number): Promise<(ClienteFila & { proyectosLista: { id: number; nombre: string; estado: string }[] }) | null> {
  const c = await prisma.cliente.findUnique({ where: { id }, select: { ...SELECT, proyectos: { select: { id: true, nombre: true, estado: true }, orderBy: { creadoEn: "desc" } } } });
  if (!c) return null;
  const { proyectos, ...resto } = c;
  return { ...aFila(resto), proyectosLista: proyectos };
}

// Crea el cliente a partir del prospecto ganado (o lo devuelve si ya existe).
// Copia el contacto publicado; la nota interna del prospecto NO se copia.
export async function clienteDesdeProspecto(prospectoId: number): Promise<{ id: number }> {
  const existente = await prisma.cliente.findUnique({ where: { prospectoId }, select: { id: true } });
  if (existente) return existente;
  const p = await prisma.prospecto.findUniqueOrThrow({ where: { id: prospectoId } });
  try {
    return await prisma.cliente.create({
      data: { nombre: p.nombre, whatsapp: p.whatsapp, email: p.email, instagram: p.instagram, facebook: p.facebook, tiktok: p.tiktok, prospectoId, codigo: generarCodigo() },
      select: { id: true },
    });
  } catch (err) {
    // Carrera: otro lo creo primero. prospectoId es unico, asi que se relee.
    const otra = await prisma.cliente.findUnique({ where: { prospectoId }, select: { id: true } });
    if (otra) return otra;
    throw err;
  }
}
