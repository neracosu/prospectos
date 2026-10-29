"use server";
import { prisma } from "@/lib/db";
import { exigirSesion } from "@/lib/sesion";
import { exito, type Resultado } from "@/acciones/resultado";
import { normalizarConsulta, ordenarResultados, type ResultadoBusqueda } from "@/lib/busqueda-contrato";
import { ETIQUETA_ETAPA_LEAD } from "@/lib/leads-contrato";
import { ETIQUETA_ESTADO, type EstadoProyecto } from "@/lib/proyectos-contrato";
import type { Etapa } from "@/lib/embudo-contrato";

// Busqueda global (fase 4). Mismas reglas que /leads y /directorio: el prospectador solo alcanza el directorio y los
// leads que salieron de el; clientes y proyectos son del dueno. Nunca devuelve montos.
export async function buscarGlobal(q: string): Promise<Resultado<ResultadoBusqueda[]>> {
  const u = await exigirSesion();
  const t = normalizarConsulta(String(q ?? ""));
  if (!t) return exito([]);
  const dueno = u.rol === "dueno";
  const texto = { OR: [{ nombre: { contains: t } }, { ciudad: { contains: t } }, { whatsapp: { contains: t } }, { instagram: { contains: t } }, { email: { contains: t } }] };
  const [leads, directorio, clientes, proyectos] = await Promise.all([
    prisma.prospecto.findMany({ where: { esLead: true, ...(dueno ? {} : { fuenteLead: "directorio" }), ...texto }, select: { id: true, nombre: true, etapa: true, nicho: { select: { nombre: true } } }, take: 10 }),
    prisma.prospecto.findMany({ where: { esLead: false, ...texto }, select: { id: true, nombre: true, ciudad: true, nicho: { select: { nombre: true } } }, take: 10 }),
    dueno ? prisma.cliente.findMany({ where: { OR: [{ nombre: { contains: t } }, { contactoNombre: { contains: t } }, { rif: { contains: t } }] }, select: { id: true, nombre: true, contactoNombre: true }, take: 5 }) : Promise.resolve([]),
    dueno ? prisma.proyecto.findMany({ where: { nombre: { contains: t } }, select: { id: true, nombre: true, estado: true, cliente: { select: { nombre: true } } }, take: 5 }) : Promise.resolve([]),
  ]);
  const lista: ResultadoBusqueda[] = [
    ...leads.map((p) => ({ tipo: "lead" as const, id: p.id, titulo: p.nombre, sub: `${ETIQUETA_ETAPA_LEAD[p.etapa as Etapa] ?? p.etapa} · ${p.nicho.nombre}`, href: `/leads/${p.id}` })),
    ...directorio.map((p) => ({ tipo: "directorio" as const, id: p.id, titulo: p.nombre, sub: [p.ciudad, p.nicho.nombre].filter(Boolean).join(" · "), href: `/prospectos/${p.id}` })),
    ...clientes.map((c) => ({ tipo: "cliente" as const, id: c.id, titulo: c.nombre, sub: c.contactoNombre, href: `/clientes/${c.id}` })),
    ...proyectos.map((p) => ({ tipo: "proyecto" as const, id: p.id, titulo: p.nombre, sub: `${p.cliente.nombre} · ${ETIQUETA_ESTADO[p.estado as EstadoProyecto] ?? p.estado}`, href: `/proyectos/${p.id}` })),
  ];
  return exito(ordenarResultados(t, lista));
}
