import { describe, it, expect } from "vitest";
import { ESTADOS_COLA, esEstadoCola, porcentaje, recortar, hitosDe, fechaCorta, proximoLote, yaEnviado, puedeEnviar } from "@/lib/correos-contrato";

// 2026-10-29 es jueves. Caracas = UTC-4.
const caracas = (iso: string) => new Date(`${iso}-04:00`);

describe("correos-contrato (pantalla /correos)", () => {
  it("estados de la cola en el orden de los chips", () => {
    expect([...ESTADOS_COLA]).toEqual(["listas", "enviadas", "seguimiento", "fallidas", "bloqueadas"]);
    expect(esEstadoCola("enviadas")).toBe(true);
    expect(esEstadoCola("todas")).toBe(false);
  });
  it("porcentaje sobre enviados, sin dividir por cero", () => {
    expect(porcentaje(1, 3)).toBe("33 %");
    expect(porcentaje(0, 0)).toBe("—");
    expect(porcentaje(2, 2)).toBe("100 %");
  });
  it("recortar a 90 con puntos suspensivos", () => {
    expect(recortar("corto")).toBe("corto");
    const r = recortar("a".repeat(100));
    expect(r).toHaveLength(90);
    expect(r.endsWith("…")).toBe(true);
    expect(recortar("a".repeat(90))).toHaveLength(90);
  });
  it("fecha corta en hora de Caracas", () => {
    expect(fechaCorta(new Date("2026-10-30T02:00:00Z"))).toBe("29/10");
  });
  it("hitos: enviado, abrio, vio y PDF con fecha; fallo y en curso en palabras", () => {
    const e = { id: 1, tipo: "inicial", enviadoEn: caracas("2026-10-29T10:00:00"), abiertoEn: caracas("2026-10-29T11:00:00"), clicEn: null, pdfEn: caracas("2026-10-30T09:00:00"), fallo: "" };
    expect(hitosDe(e)).toEqual(["Enviado 29/10", "Abrió 29/10", "PDF 30/10"]);
    expect(hitosDe({ ...e, tipo: "seguimiento", abiertoEn: null, pdfEn: null })).toEqual(["Seguimiento 29/10"]);
    expect(hitosDe({ ...e, fallo: "smtp caido" })).toEqual(["Falló 29/10: smtp caido"]);
    expect(hitosDe({ ...e, fallo: "en curso" })).toEqual(["Enviando…"]);
    expect(hitosDe({ ...e, fallo: "interrumpido" })).toEqual(["Falló 29/10: interrumpido (puede haber salido)"]);
    expect(hitosDe(null)).toEqual([]);
    expect(yaEnviado(e)).toBe(true);
    expect(yaEnviado({ ...e, fallo: "interrumpido" })).toBe(false);
    expect(yaEnviado(null)).toBe(false);
  });
  it("proximo lote: pausado, en la ventana, antes de abrir, al cierre del viernes y con el tope cumplido", () => {
    const base = { activo: true, delDia: 3, tope: 25 };
    expect(proximoLote(caracas("2026-10-29T10:20:00"), { ...base, activo: false })).toBe("Pausado: no sale nada solo.");
    expect(proximoLote(caracas("2026-10-29T10:20:00"), base)).toBe("Próximo lote hoy a las 11:00, hasta 4 correos.");
    expect(proximoLote(caracas("2026-10-29T07:00:00"), base)).toBe("Próximo lote hoy a las 9:00, hasta 4 correos.");
    expect(proximoLote(caracas("2026-10-29T16:30:00"), base)).toBe("Próximo lote mañana a las 9:00, hasta 4 correos.");
    expect(proximoLote(caracas("2026-10-30T16:30:00"), base)).toBe("Próximo lote el lunes a las 9:00, hasta 4 correos.");
    expect(proximoLote(caracas("2026-10-31T12:00:00"), base)).toBe("Próximo lote el lunes a las 9:00, hasta 4 correos.");
    expect(proximoLote(caracas("2026-10-29T10:20:00"), { ...base, delDia: 25 })).toBe("El tope de hoy ya se cumplió. Próximo lote mañana a las 9:00, hasta 4 correos.");
  });
  it("puedeEnviar: manual admite el nombre que no coincide solo con la ficha revisada; automatico nunca; bloqueado nunca", () => {
    const f = { bloqueado: "", nombreNoCoincide: false, estadoFicha: "lista" as const, arquetipo: "hoteles" };
    expect(puedeEnviar(f, "manual")).toBe(true);
    expect(puedeEnviar(f, "automatico")).toBe(true);
    const nc = { ...f, nombreNoCoincide: true };
    expect(puedeEnviar(nc, "manual")).toBe(false);
    expect(puedeEnviar({ ...nc, estadoFicha: "revisada" }, "manual")).toBe(true);
    expect(puedeEnviar({ ...nc, estadoFicha: "revisada" }, "automatico")).toBe(false);
    expect(puedeEnviar({ ...f, estadoFicha: "revisada", bloqueado: "rebote" }, "manual")).toBe(false);
    expect(puedeEnviar({ ...f, arquetipo: "" }, "manual")).toBe(false);
  });
});
