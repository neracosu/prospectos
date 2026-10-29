// src/lib/inicio-contrato.ts — la pantalla Inicio del dueno (panel CRM, fase 1). Puro: arma la lista «Hoy» con
// lo que toca (seguimientos de prospectos, cobros que vencen, hitos con fecha) ordenada por fecha, y define las
// cifras de arriba. Lo que no tenga fecha ISO valida se omite: una fila rota no tumba la portada.
import { esFechaIso } from "@/lib/fecha-caracas";
import { formatoUSD } from "@/lib/dinero";

export type EstadoHoy = "vencido" | "hoy" | "proximo";
export type ItemHoy = { tipo: "seguimiento" | "cobro" | "hito"; id: string; titulo: string; sub: string; fecha: string; estado: EstadoHoy; href: string; enlaceWhatsApp?: string };

export type CifrasInicio = { leadsActivos: number; conVencido: number; solicitudes: number; porCobrar: number; vencido: number; personasWeb: number };

export type EntradaHoy = {
  hoy: string;
  seguimientos: { id: number; nombre: string; ciudad: string; proximoSeguimiento: string | null; whatsapp?: string; mensaje?: string }[];
  cobros: { id: number; proyectoId: number; proyectoNombre: string; concepto: string; monto: number; vence: string }[];
  hitos: { id: number; proyectoId: number; proyectoNombre: string; texto: string; fechaEstimada: string | null }[];
};

export function estadoDe(fecha: string, hoy: string): EstadoHoy {
  return fecha < hoy ? "vencido" : fecha === hoy ? "hoy" : "proximo";
}

const CONCEPTO: Record<string, string> = { pago_unico: "Pago único", cuota: "Cuota", mensualidad: "Mensualidad", extra: "Extra" };
// A igual fecha: primero el dinero, despues a quien hay que escribirle, despues los hitos.
const ORDEN_TIPO: Record<ItemHoy["tipo"], number> = { cobro: 0, seguimiento: 1, hito: 2 };

export function armarHoy(e: EntradaHoy): ItemHoy[] {
  const items: ItemHoy[] = [];
  for (const s of e.seguimientos) {
    if (!s.proximoSeguimiento || !esFechaIso(s.proximoSeguimiento)) continue;
    // El boton de WhatsApp lleva el mensaje de seguimiento del nicho ya escrito, como la tarjeta de la cola.
    const num = (s.whatsapp || "").replace(/\D/g, "");
    const enlaceWhatsApp = num ? `https://wa.me/${num}${s.mensaje ? "?text=" + encodeURIComponent(s.mensaje) : ""}` : undefined;
    items.push({ tipo: "seguimiento", id: `s${s.id}`, titulo: s.nombre, sub: s.ciudad ? `Seguimiento · ${s.ciudad}` : "Seguimiento", fecha: s.proximoSeguimiento, estado: estadoDe(s.proximoSeguimiento, e.hoy), href: `/prospectos/${s.id}`, enlaceWhatsApp });
  }
  for (const c of e.cobros) {
    if (!esFechaIso(c.vence)) continue;
    items.push({ tipo: "cobro", id: `c${c.id}`, titulo: `${CONCEPTO[c.concepto] ?? c.concepto} ${formatoUSD(c.monto)}`, sub: c.proyectoNombre, fecha: c.vence, estado: estadoDe(c.vence, e.hoy), href: `/proyectos/${c.proyectoId}?t=cobros` });
  }
  for (const h of e.hitos) {
    if (!h.fechaEstimada || !esFechaIso(h.fechaEstimada)) continue;
    items.push({ tipo: "hito", id: `h${h.id}`, titulo: h.texto, sub: `Hito · ${h.proyectoNombre}`, fecha: h.fechaEstimada, estado: estadoDe(h.fechaEstimada, e.hoy), href: `/proyectos/${h.proyectoId}?t=pendientes` });
  }
  return items.sort((a, b) => a.fecha.localeCompare(b.fecha) || ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo] || a.titulo.localeCompare(b.titulo));
}
