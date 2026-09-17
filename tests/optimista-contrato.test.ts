import { describe, it, expect } from "vitest";
import type { CobroFila, PendienteFila } from "@/lib/proyectos";
import { aplicarCambioCobro, aplicarCambioPendiente, aplicarDecision } from "@/lib/optimista-contrato";

const cobro = (id: number, extra: Partial<CobroFila> = {}): CobroFila => ({ id, concepto: "mensualidad", detalle: "Mensualidad de septiembre 2026", monto: 100, vence: "2026-09-05", estado: "vencido", pagadoEn: null, canal: "", referencia: "", nota: "", anuladoMotivo: "", recordadoHoy: false, reciboNumero: "", notaAnulacion: false, avisado: false, ...extra });
const pend = (id: number, extra: Partial<PendienteFila> = {}): PendienteFila => ({ id, texto: `Pendiente ${id}`, hecho: false, visibleCliente: true, orden: id, fechaEstimada: null, avisado: false, ...extra });

describe("aplicarCambioCobro", () => {
  it("marca pagado y provisional solo la fila tocada", () => {
    const cuando = new Date("2026-09-17T16:00:00Z");
    const antes = [cobro(1), cobro(2)];
    const r = aplicarCambioCobro(antes, { tipo: "pagado", id: 2, pagadoEn: cuando, canal: "zelle", referencia: "ABC" });
    expect(r[0]).toBe(antes[0]);
    expect(r[1]).toMatchObject({ id: 2, estado: "pagado", pagadoEn: cuando, canal: "zelle", referencia: "ABC", provisional: true });
    expect(antes[1].estado).toBe("vencido"); // no muta la lista original
  });
  it("un id que no esta deja todo igual", () => {
    const antes = [cobro(1)];
    expect(aplicarCambioCobro(antes, { tipo: "pagado", id: 9, pagadoEn: new Date(), canal: "zelle", referencia: "" })).toEqual(antes);
  });
});

describe("aplicarCambioPendiente", () => {
  it("marcar hecho no toca lo demas", () => {
    const r = aplicarCambioPendiente([pend(1), pend(2)], { tipo: "marcar", id: 1, hecho: true });
    expect(r.map((p) => p.hecho)).toEqual([true, false]);
  });
  it("desmarcar borra el avisado, igual que el servidor", () => {
    const r = aplicarCambioPendiente([pend(1, { hecho: true, avisado: true })], { tipo: "marcar", id: 1, hecho: false });
    expect(r[0]).toMatchObject({ hecho: false, avisado: false });
  });
  it("visible fija el valor que se pidio: aplicarlo dos veces (el rebase de useOptimistic) da lo mismo", () => {
    const una = aplicarCambioPendiente([pend(1)], { tipo: "visible", id: 1, visible: false });
    expect(una[0].visibleCliente).toBe(false);
    expect(aplicarCambioPendiente(una, { tipo: "visible", id: 1, visible: false })[0].visibleCliente).toBe(false);
    expect(aplicarCambioPendiente([pend(1, { visibleCliente: false })], { tipo: "visible", id: 1, visible: true })[0].visibleCliente).toBe(true);
  });
  it("mover intercambia con el vecino", () => {
    const lista = [pend(1), pend(2), pend(3)];
    expect(aplicarCambioPendiente(lista, { tipo: "mover", id: 2, direccion: "arriba" }).map((p) => p.id)).toEqual([2, 1, 3]);
    expect(aplicarCambioPendiente(lista, { tipo: "mover", id: 2, direccion: "abajo" }).map((p) => p.id)).toEqual([1, 3, 2]);
  });
  it("mover en el borde devuelve la misma lista", () => {
    const lista = [pend(1), pend(2)];
    expect(aplicarCambioPendiente(lista, { tipo: "mover", id: 1, direccion: "arriba" })).toBe(lista);
    expect(aplicarCambioPendiente(lista, { tipo: "mover", id: 2, direccion: "abajo" })).toBe(lista);
    expect(aplicarCambioPendiente(lista, { tipo: "mover", id: 9, direccion: "abajo" })).toBe(lista);
  });
});

describe("aplicarDecision", () => {
  const fila = (id: number, estado: string, decision = "pendiente") => ({ id, estado, decision, nombre: `f${id}` });
  const lote = () => ({ lote: "abc", total: 3, pendientes: 3, aprobables: 2, filas: [fila(1, "nuevo"), fila(2, "repetido"), fila(3, "nuevo")] });
  it("aprobar una nueva baja por decidir y aprobables, y conserva lo demas del lote", () => {
    const r = aplicarDecision(lote(), { id: 1, decision: "aprobado" });
    expect(r).toMatchObject({ lote: "abc", total: 3, pendientes: 2, aprobables: 1 });
    expect(r.filas[0]).toMatchObject({ id: 1, decision: "aprobado", nombre: "f1" });
    expect(r.filas[1].decision).toBe("pendiente");
  });
  it("descartar una nueva tambien baja aprobables", () => {
    expect(aplicarDecision(lote(), { id: 3, decision: "descartado" })).toMatchObject({ pendientes: 2, aprobables: 1 });
  });
  it("decidir una repetida solo baja por decidir", () => {
    expect(aplicarDecision(lote(), { id: 2, decision: "completado" })).toMatchObject({ pendientes: 2, aprobables: 2 });
  });
  it("una fila ya decidida o que no esta en la pagina no cambia nada", () => {
    const l = { ...lote(), filas: [fila(1, "nuevo", "aprobado")] };
    expect(aplicarDecision(l, { id: 1, decision: "descartado" })).toBe(l);
    expect(aplicarDecision(l, { id: 99, decision: "descartado" })).toBe(l);
  });
  it("aplicada dos veces (el rebase de useOptimistic sobre una base que ya trae la decision) descuenta una sola", () => {
    const una = aplicarDecision(lote(), { id: 1, decision: "aprobado" });
    expect(aplicarDecision(una, { id: 1, decision: "aprobado" })).toBe(una);
  });
  it("los contadores no bajan de cero", () => {
    const l = { ...lote(), pendientes: 0, aprobables: 0 };
    expect(aplicarDecision(l, { id: 1, decision: "aprobado" })).toMatchObject({ pendientes: 0, aprobables: 0 });
  });
});
