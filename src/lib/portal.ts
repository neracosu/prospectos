// src/lib/portal.ts — lo que lee el portal del cliente (pieza 5). Todo filtra por clienteId y selecciona
// campo por campo: horas, tarifa, notas, pendientes internos y cobros anulados no salen de aqui nunca.
import { prisma } from "@/lib/db";
import { hoyCaracas } from "@/lib/fecha-caracas";
import { estadoCobro, ETIQUETA_CANAL_COBRO, type CanalCobro, type Concepto } from "@/lib/cobros-contrato";
import type { EstadoProyecto } from "@/lib/proyectos-contrato";
import type { TipoCambio } from "@/lib/semver-contrato";
import { CODIGO_VALIDO } from "@/lib/codigo";
import {
  resumenHitos, versionesDelMasNuevo, textoCobro, separarCobros, avisoDeCobros,
  type AvisoCobros, type CobroPortal, type HitoPortal, type ResumenHitos,
} from "@/lib/portal-contrato";

export async function clienteParaEntrada(codigo: string): Promise<{ nombre: string; acceso: "activo" | "sin_acceso" | "desactivado" } | null> {
  if (!CODIGO_VALIDO.test(codigo)) return null;
  const c = await prisma.cliente.findUnique({ where: { codigo }, select: { nombre: true, usuario: { select: { activo: true, rol: true } } } });
  if (!c) return null;
  const acceso = !c.usuario || c.usuario.rol !== "cliente" ? "sin_acceso" : c.usuario.activo ? "activo" : "desactivado";
  return { nombre: c.nombre, acceso };
}

export type ProyectoTarjeta = { id: number; nombre: string; estado: EstadoProyecto; versionActual: string; versionFecha: string | null; hitos: ResumenHitos };

// Lo unico que se lee de un cobro. `nota` y `referencia` son internas: no se seleccionan.
const COBRO = { id: true, concepto: true, detalle: true, monto: true, vence: true, pagadoEn: true, anuladoEn: true, canal: true, reciboNumero: true } as const;
type CobroLeido = { id: number; concepto: string; detalle: string; monto: unknown; vence: string; pagadoEn: Date | null; anuladoEn: Date | null; canal: string; reciboNumero: string };

function aCobroPortal(c: CobroLeido, proyecto: { id: number; nombre: string }, hoy: string): CobroPortal {
  return {
    id: c.id, proyectoId: proyecto.id, proyectoNombre: proyecto.nombre, texto: textoCobro({ concepto: c.concepto as Concepto, detalle: c.detalle }),
    monto: Number(c.monto), vence: c.vence, estado: estadoCobro(c, hoy), pagadoEl: c.pagadoEn ? hoyCaracas(c.pagadoEn) : null,
    canal: c.canal ? ETIQUETA_CANAL_COBRO[c.canal as CanalCobro] ?? c.canal : "", reciboNumero: c.reciboNumero,
  };
}

// Primero lo que esta vivo; lo cerrado al final (un cliente sin proyectos activos ve los cerrados, no una pantalla vacia).
const ORDEN_ESTADO: Record<string, number> = { activo: 0, en_construccion: 1, entregado: 2, pausado: 3, cerrado: 4 };

export async function inicioPortal(clienteId: number, hoy: string): Promise<{ proyectos: ProyectoTarjeta[]; aviso: AvisoCobros | null }> {
  const filas = await prisma.proyecto.findMany({
    where: { clienteId },
    select: {
      id: true, nombre: true, estado: true,
      versiones: { select: { version: true, fecha: true } },
      pendientes: { where: { visibleCliente: true }, select: { hecho: true } },
      cobros: { where: { anuladoEn: null }, select: COBRO },
    },
  });
  const ordenadas = [...filas].sort((x, y) => (ORDEN_ESTADO[x.estado] ?? 9) - (ORDEN_ESTADO[y.estado] ?? 9) || x.nombre.localeCompare(y.nombre, "es"));
  const proyectos = ordenadas.map((p) => {
    const actual = versionesDelMasNuevo(p.versiones)[0];
    return { id: p.id, nombre: p.nombre, estado: p.estado as EstadoProyecto, versionActual: actual?.version ?? "", versionFecha: actual?.fecha ?? null, hitos: resumenHitos(p.pendientes) };
  });
  const cobros = filas.flatMap((p) => p.cobros.map((c) => aCobroPortal(c, p, hoy)));
  return { proyectos, aviso: avisoDeCobros(cobros) };
}

export type ProyectoPortal = ProyectoTarjeta & {
  pagoUnico: number; mensualidad: number; diaCobroMensual: number; propuestaCodigo: string;
  listaHitos: HitoPortal[];
  versiones: { version: string; fecha: string; cambios: { tipo: TipoCambio; texto: string }[] }[];
  cobros: { porPagar: CobroPortal[]; pagados: CobroPortal[] };
};

// El id del proyecto viene de la URL: SIEMPRE se busca junto con el clienteId de la sesion.
export async function proyectoPortal(clienteId: number, proyectoId: number, hoy: string): Promise<ProyectoPortal | null> {
  if (!Number.isInteger(proyectoId) || proyectoId <= 0) return null;
  const p = await prisma.proyecto.findFirst({
    where: { id: proyectoId, clienteId },
    select: {
      id: true, nombre: true, estado: true, pagoUnico: true, mensualidad: true, diaCobroMensual: true, propuestaCodigo: true,
      versiones: { select: { version: true, fecha: true, cambios: { select: { tipo: true, texto: true }, orderBy: { orden: "asc" } } } },
      pendientes: { where: { visibleCliente: true }, select: { texto: true, hecho: true, hechoEn: true, fechaEstimada: true }, orderBy: { orden: "asc" } },
      cobros: { where: { anuladoEn: null }, select: COBRO },
    },
  });
  if (!p) return null;
  const versiones = versionesDelMasNuevo(p.versiones).map((v) => ({ version: v.version, fecha: v.fecha, cambios: v.cambios.map((c) => ({ tipo: c.tipo as TipoCambio, texto: c.texto })) }));
  const listaHitos: HitoPortal[] = p.pendientes.map((h) => ({ texto: h.texto, hecho: h.hecho, hechoEl: h.hecho && h.hechoEn ? hoyCaracas(h.hechoEn) : null, fechaEstimada: h.fechaEstimada }));
  return {
    id: p.id, nombre: p.nombre, estado: p.estado as EstadoProyecto, versionActual: versiones[0]?.version ?? "", versionFecha: versiones[0]?.fecha ?? null,
    hitos: resumenHitos(listaHitos), pagoUnico: Number(p.pagoUnico), mensualidad: Number(p.mensualidad), diaCobroMensual: p.diaCobroMensual, propuestaCodigo: p.propuestaCodigo,
    listaHitos, versiones, cobros: separarCobros(p.cobros.map((c) => aCobroPortal(c, p, hoy))),
  };
}
