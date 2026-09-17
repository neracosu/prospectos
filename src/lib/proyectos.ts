// src/lib/proyectos.ts — consultas de pantalla de proyectos.
import { prisma } from "@/lib/db";
import { estadoCobro, cifrasDelMes, mesDe, type Concepto, type EstadoCobro } from "@/lib/cobros-contrato";
import { semaforo, porcentajeAvance, type EstadoProyecto, type Semaforo } from "@/lib/proyectos-contrato";
import { compararSemver, type TipoCambio } from "@/lib/semver-contrato";
import { redondear2 } from "@/lib/dinero";
import type { ClienteFila } from "@/lib/clientes";

export type ProyectoResumen = { id: number; nombre: string; clienteId: number; clienteNombre: string; estado: EstadoProyecto; versionActual: string; semaforo: Semaforo; avance: number | null };
export type CobroFila = { id: number; concepto: Concepto; detalle: string; monto: number; vence: string; estado: EstadoCobro; pagadoEn: Date | null; canal: string; referencia: string; nota: string; anuladoMotivo: string; recordadoHoy: boolean; reciboNumero: string; notaAnulacion: boolean };
export type PendienteFila = { id: number; texto: string; hecho: boolean; visibleCliente: boolean; orden: number; fechaEstimada: string | null };
export type HorasFila = { id: number; fecha: string; horas: number; descripcion: string; usuarioNombre: string };
export type VersionFila = { id: number; version: string; fecha: string; avisadoEn: Date | null; cambios: { id: number; tipo: TipoCambio; texto: string }[] };
export type EventoProyecto = { id: number; tipo: string; texto: string; creadoEn: Date; usuarioNombre: string };
export type ProyectoFicha = ProyectoResumen & {
  nichoNombre: string; pagoUnico: number; mensualidad: number; horasCotizadas: number; fechaInicio: string; fechaEntregaEstimada: string | null; fechaEntregaReal: string | null;
  diaCobroMensual: number; propuestaCodigo: string; cliente: ClienteFila; cobros: CobroFila[]; pendientes: PendienteFila[]; horas: HorasFila[]; horasReales: number; versiones: VersionFila[]; historial: EventoProyecto[];
};

function versionActualDe(versiones: { version: string }[]): string {
  return [...versiones].sort((a, b) => compararSemver(b.version, a.version))[0]?.version ?? "";
}

export async function listarProyectos(hoy: string): Promise<ProyectoResumen[]> {
  const filas = await prisma.proyecto.findMany({
    select: { id: true, nombre: true, clienteId: true, estado: true, cliente: { select: { nombre: true } }, versiones: { select: { version: true } },
      cobros: { select: { vence: true, pagadoEn: true, anuladoEn: true } }, pendientes: { select: { hecho: true, visibleCliente: true } } },
    orderBy: [{ estado: "asc" }, { nombre: "asc" }],
  });
  return filas.map((p) => ({
    id: p.id, nombre: p.nombre, clienteId: p.clienteId, clienteNombre: p.cliente.nombre, estado: p.estado as EstadoProyecto,
    versionActual: versionActualDe(p.versiones), semaforo: semaforo(p.cobros.map((c) => estadoCobro(c, hoy))), avance: porcentajeAvance(p.pendientes),
  }));
}

// Ganado sin proyecto: o no tiene cliente todavia, o tiene cliente pero ese
// cliente no tiene ningun proyecto (p.ej. lo creo clienteDesdeProspecto pero
// crearProyecto no llego a completarse). { cliente: { is: null } } es la forma
// correcta en Prisma de filtrar por ausencia de una relacion 1:1 opcional.
export async function ganadosSinProyecto(): Promise<{ id: number; nombre: string; ciudad: string }[]> {
  return prisma.prospecto.findMany({
    where: { etapa: "ganado", OR: [{ cliente: { is: null } }, { cliente: { proyectos: { none: {} } } }] },
    select: { id: true, nombre: true, ciudad: true }, orderBy: { nombre: "asc" },
  });
}

export async function resumenMes(hoy: string): Promise<{ cobrado: number; vencido: number; porCobrar: number }> {
  const cobros = await prisma.cobro.findMany({ select: { monto: true, vence: true, pagadoEn: true, anuladoEn: true } });
  return cifrasDelMes(cobros.map((c) => ({ ...c, monto: Number(c.monto) })), mesDe(hoy), hoy);
}

export async function fichaProyecto(id: number, hoy: string): Promise<ProyectoFicha | null> {
  const p = await prisma.proyecto.findUnique({
    where: { id },
    include: {
      nicho: { select: { nombre: true } },
      cliente: { select: { id: true, nombre: true, contactoNombre: true, whatsapp: true, email: true, rif: true, instagram: true, facebook: true, tiktok: true, prospectoId: true, _count: { select: { proyectos: true } } } },
      cobros: { orderBy: { vence: "asc" } },
      pendientes: { orderBy: { orden: "asc" } },
      horas: { orderBy: { fecha: "desc" }, include: { usuario: { select: { nombre: true } } } },
      versiones: { include: { cambios: { orderBy: { orden: "asc" } } } },
      eventos: { orderBy: { creadoEn: "desc" }, take: 100, include: { usuario: { select: { nombre: true } } } },
    },
  });
  if (!p) return null;
  const desde = new Date(`${hoy}T00:00:00-04:00`);
  const recordadosHoy = new Set((await prisma.evento.findMany({ where: { proyectoId: id, tipo: "recordatorio", creadoEn: { gte: desde } }, select: { cobroId: true } })).map((e) => e.cobroId));
  const cobros: CobroFila[] = p.cobros.map((c) => ({
    id: c.id, concepto: c.concepto as Concepto, detalle: c.detalle, monto: Number(c.monto), vence: c.vence, estado: estadoCobro(c, hoy), pagadoEn: c.pagadoEn,
    canal: c.canal, referencia: c.referencia, nota: c.nota, anuladoMotivo: c.anuladoMotivo, recordadoHoy: recordadosHoy.has(c.id),
    reciboNumero: c.reciboNumero, notaAnulacion: c.notaAnulacionEn !== null,
  }));
  const versiones: VersionFila[] = [...p.versiones].sort((a, b) => compararSemver(b.version, a.version)).map((v) => ({ id: v.id, version: v.version, fecha: v.fecha, avisadoEn: v.avisadoEn, cambios: v.cambios.map((c) => ({ id: c.id, tipo: c.tipo as TipoCambio, texto: c.texto })) }));
  const { _count, ...cl } = p.cliente;
  return {
    id: p.id, nombre: p.nombre, clienteId: p.clienteId, clienteNombre: p.cliente.nombre, estado: p.estado as EstadoProyecto, versionActual: versiones[0]?.version ?? "",
    semaforo: semaforo(cobros.map((c) => c.estado)), avance: porcentajeAvance(p.pendientes), nichoNombre: p.nicho.nombre,
    pagoUnico: Number(p.pagoUnico), mensualidad: Number(p.mensualidad), horasCotizadas: Number(p.horasCotizadas), fechaInicio: p.fechaInicio,
    fechaEntregaEstimada: p.fechaEntregaEstimada, fechaEntregaReal: p.fechaEntregaReal, diaCobroMensual: p.diaCobroMensual, propuestaCodigo: p.propuestaCodigo,
    cliente: { ...cl, proyectos: _count.proyectos }, cobros,
    pendientes: p.pendientes.map((x) => ({ id: x.id, texto: x.texto, hecho: x.hecho, visibleCliente: x.visibleCliente, orden: x.orden, fechaEstimada: x.fechaEstimada })),
    horas: p.horas.map((h) => ({ id: h.id, fecha: h.fecha, horas: Number(h.horas), descripcion: h.descripcion, usuarioNombre: h.usuario?.nombre ?? "" })),
    horasReales: redondear2(p.horas.reduce((s, h) => s + Number(h.horas), 0)), versiones,
    historial: p.eventos.map((e) => ({ id: e.id, tipo: e.tipo, texto: e.texto, creadoEn: e.creadoEn, usuarioNombre: e.usuario?.nombre ?? "" })),
  };
}
