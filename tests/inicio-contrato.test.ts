import { describe, it, expect } from "vitest";
import { armarHoy, estadoDe } from "@/lib/inicio-contrato";

describe("lista Hoy de Inicio", () => {
  it("mezcla y ordena por fecha; a igual fecha, cobro antes que seguimiento antes que hito", () => {
    const r = armarHoy({ hoy: "2026-10-29",
      seguimientos: [{ id: 1, nombre: "Posada", ciudad: "Catia", proximoSeguimiento: "2026-10-29" }],
      cobros: [{ id: 9, proyectoId: 2, proyectoNombre: "Tienda", concepto: "mensualidad", monto: 100, vence: "2026-10-29" }],
      hitos: [{ id: 5, proyectoId: 2, proyectoNombre: "Tienda", texto: "Entregar", fechaEstimada: "2026-10-28" }] });
    expect(r.map((x) => x.tipo)).toEqual(["hito", "cobro", "seguimiento"]);
    expect(r[0].estado).toBe("vencido"); expect(r[1].estado).toBe("hoy");
    expect(r[1].href).toBe("/proyectos/2?t=cobros"); expect(r[2].href).toBe("/prospectos/1");
    expect(r[1].titulo).toMatch(/100/);
  });
  it("fechas raras se omiten sin reventar", () => {
    const r = armarHoy({ hoy: "2026-10-29", seguimientos: [{ id: 1, nombre: "A", ciudad: "", proximoSeguimiento: null }], cobros: [{ id: 1, proyectoId: 1, proyectoNombre: "P", concepto: "cuota", monto: 1, vence: "mañana" }], hitos: [{ id: 1, proyectoId: 1, proyectoNombre: "P", texto: "x", fechaEstimada: "" }] });
    expect(r).toEqual([]);
  });
  it("estadoDe", () => {
    expect(estadoDe("2026-10-28", "2026-10-29")).toBe("vencido");
    expect(estadoDe("2026-10-29", "2026-10-29")).toBe("hoy");
    expect(estadoDe("2026-11-02", "2026-10-29")).toBe("proximo");
  });
  it("el seguimiento con WhatsApp y mensaje trae el enlace listo para escribir", () => {
    const r = armarHoy({ hoy: "2026-10-29", seguimientos: [{ id: 1, nombre: "Posada", ciudad: "Catia", proximoSeguimiento: "2026-10-29", whatsapp: "584121112233", mensaje: "Hola Posada, ¿pudo ver la propuesta?" }], cobros: [], hitos: [] });
    expect(r[0].enlaceWhatsApp).toBe("https://wa.me/584121112233?text=" + encodeURIComponent("Hola Posada, ¿pudo ver la propuesta?"));
    const sin = armarHoy({ hoy: "2026-10-29", seguimientos: [{ id: 1, nombre: "A", ciudad: "", proximoSeguimiento: "2026-10-29" }], cobros: [], hitos: [] });
    expect(sin[0].enlaceWhatsApp).toBeUndefined();
  });
});

