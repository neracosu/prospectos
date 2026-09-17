// Solo tipos de @/lib/proyectos: este archivo lo importa el navegador y no puede arrastrar Prisma.
import type { CobroFila, PendienteFila } from "@/lib/proyectos";

// Reductores de las listas optimistas (pasada de UX, fase B): lo que la pantalla ensena entre el toque y la
// respuesta del servidor. Cada uno copia lo que hace su Server Action; si la accion cambia, esto cambia con ella.

export type CambioCobro = { tipo: "pagado"; id: number; pagadoEn: Date; canal: string; referencia: string };
// provisional = el servidor todavia no confirmo el pago: la fila no ofrece generar el recibo.
export type CobroOptimista = CobroFila & { provisional?: boolean };

export function aplicarCambioCobro(cobros: CobroOptimista[], c: CambioCobro): CobroOptimista[] {
  return cobros.map((x) => (x.id === c.id ? { ...x, estado: "pagado" as const, pagadoEn: c.pagadoEn, canal: c.canal, referencia: c.referencia, provisional: true } : x));
}

export type CambioPendiente =
  | { tipo: "marcar"; id: number; hecho: boolean }
  // Lleva el valor destino y no «alternar»: si useOptimistic lo reaplica sobre una base que ya trae el cambio, da lo mismo.
  | { tipo: "visible"; id: number; visible: boolean }
  | { tipo: "mover"; id: number; direccion: "arriba" | "abajo" };

export function aplicarCambioPendiente(lista: PendienteFila[], c: CambioPendiente): PendienteFila[] {
  if (c.tipo === "marcar") {
    // Desmarcar borra el avisado, igual que marcarPendiente en el servidor.
    return lista.map((p) => (p.id === c.id ? { ...p, hecho: c.hecho, avisado: c.hecho ? p.avisado : false } : p));
  }
  if (c.tipo === "visible") return lista.map((p) => (p.id === c.id ? { ...p, visibleCliente: c.visible } : p));
  const i = lista.findIndex((p) => p.id === c.id);
  const j = c.direccion === "arriba" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= lista.length) return lista;
  const r = [...lista];
  [r[i], r[j]] = [r[j], r[i]];
  return r;
}

export type CambioFila = { id: number; decision: "aprobado" | "completado" | "descartado" };

// Los contadores son del lote entero y las filas son las de la pagina: solo se descuenta una fila que esta
// a la vista y sigue pendiente.
export function aplicarDecision<F extends { id: number; decision: string; estado: string }, L extends { pendientes: number; aprobables: number; filas: F[] }>(lote: L, c: CambioFila): L {
  const fila = lote.filas.find((f) => f.id === c.id);
  if (!fila || fila.decision !== "pendiente") return lote;
  return {
    ...lote,
    pendientes: Math.max(0, lote.pendientes - 1),
    aprobables: Math.max(0, lote.aprobables - (fila.estado === "nuevo" ? 1 : 0)),
    filas: lote.filas.map((f) => (f.id === c.id ? { ...f, decision: c.decision } : f)),
  };
}
