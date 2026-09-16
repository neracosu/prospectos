import { sumarDias } from "@/lib/fecha-caracas";
import { redondear2 } from "@/lib/dinero";

export const CONCEPTOS = ["pago_unico", "cuota", "mensualidad", "extra"] as const;
export type Concepto = (typeof CONCEPTOS)[number];
export const ETIQUETA_CONCEPTO: Record<Concepto, string> = { pago_unico: "Pago único", cuota: "Cuota", mensualidad: "Mensualidad", extra: "Extra" };

export const CANALES_COBRO = ["zelle", "pago_movil", "efectivo", "binance", "transferencia", "otro"] as const;
export type CanalCobro = (typeof CANALES_COBRO)[number];
export const ETIQUETA_CANAL_COBRO: Record<CanalCobro, string> = { zelle: "Zelle", pago_movil: "Pago móvil", efectivo: "Efectivo", binance: "Binance", transferencia: "Transferencia", otro: "Otro" };

export type EstadoCobro = "pagado" | "anulado" | "vencido" | "por_vencer" | "pendiente";
export const ETIQUETA_COBRO: Record<EstadoCobro, string> = { pagado: "Pagado", anulado: "Anulado", vencido: "Vencido", por_vencer: "Por vencer", pendiente: "Pendiente" };

const DIAS_AVISO = 7;

export function estadoCobro(c: { vence: string; pagadoEn: Date | null; anuladoEn: Date | null }, hoy: string): EstadoCobro {
  if (c.anuladoEn) return "anulado";
  if (c.pagadoEn) return "pagado";
  if (c.vence < hoy) return "vencido";
  if (c.vence <= sumarDias(hoy, DIAS_AVISO)) return "por_vencer";
  return "pendiente";
}

export function mesDe(fecha: string): string {
  return fecha.slice(0, 7);
}

// Mes de Caracas de un instante: se corre 4 horas y se recorta.
function mesCaracas(d: Date): string {
  return new Date(d.getTime() - 4 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

export function cifrasDelMes(
  cobros: { monto: number; vence: string; pagadoEn: Date | null; anuladoEn: Date | null }[], mes: string, hoy: string,
): { cobrado: number; vencido: number; porCobrar: number } {
  let cobrado = 0, vencido = 0, porCobrar = 0;
  for (const c of cobros) {
    if (c.anuladoEn) continue;
    if (c.pagadoEn) { if (mesCaracas(c.pagadoEn) === mes) cobrado += c.monto; continue; }
    if (c.vence < hoy) vencido += c.monto;
    else if (mesDe(c.vence) === mes) porCobrar += c.monto;
  }
  return { cobrado: redondear2(cobrado), vencido: redondear2(vencido), porCobrar: redondear2(porCobrar) };
}

export function generarCuotas(total: number, n: number, primera: string, cadaDias = 30): { detalle: string; monto: number; vence: string }[] {
  if (n <= 1) return [{ detalle: "Pago único", monto: redondear2(total), vence: primera }];
  const parte = Math.floor((total / n) * 100) / 100;
  const cuotas = [];
  let acumulado = 0;
  for (let i = 1; i <= n; i++) {
    const monto = i === n ? redondear2(total - acumulado) : parte;
    acumulado = redondear2(acumulado + monto);
    cuotas.push({ detalle: `Cuota ${i} de ${n}`, monto, vence: sumarDias(primera, cadaDias * (i - 1)) });
  }
  return cuotas;
}

export function venceMensualidad(mes: string, dia: number): string {
  return `${mes}-${String(dia).padStart(2, "0")}`;
}

function mesSiguiente(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
}

// Que mensualidades hay que crear hoy: las que vencen entre hoy-60 y hoy+7, del proyecto activo,
// no antes de fechaInicio y que no existan ya. Idempotente por construccion.
// El rescate de 60 dias atras solo aplica si ya existe alguna mensualidad generada, y nunca va
// antes del primer mes que se facturo (el minimo de existentes): un cliente que recien se activa
// no debe nacer con cobros vencidos fantasma, y uno viejo tampoco resucita meses de antes de que
// existiera su primera mensualidad.
export function mensualidadesQueTocan(
  p: { estado: string; diaCobroMensual: number; fechaInicio: string }, hoy: string, existentes: string[],
): { mes: string; vence: string }[] {
  if (p.estado !== "activo") return [];
  const desde = existentes.length === 0 ? hoy : sumarDias(hoy, -60), hasta = sumarDias(hoy, DIAS_AVISO);
  // Piso del rescate: el mes mas viejo ya facturado. Sin esto, un mes despues de la primera
  // mensualidad el rescate de 60 dias volvia a abrirse y generaba los meses fantasma otra vez.
  const piso = existentes.length === 0 ? null : existentes.reduce((a, b) => (a < b ? a : b));
  const salida = [];
  let mes = mesDe(desde);
  const tope = mesDe(hasta);
  while (mes <= tope) {
    const vence = venceMensualidad(mes, p.diaCobroMensual);
    if ((piso === null || mes >= piso) && vence >= desde && vence <= hasta && vence >= p.fechaInicio && !existentes.includes(mes)) salida.push({ mes, vence });
    mes = mesSiguiente(mes);
  }
  return salida;
}
