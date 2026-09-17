import { describe, it, expect } from "vitest";
import {
  resumenHitos, textoFechaHito, versionesDelMasNuevo, textoCobro, separarCobros, avisoDeCobros, textoAviso,
  enlacePortal, mensajeEnlacePortal, mensajePinPortal, primerNombre, type CobroPortal,
} from "@/lib/portal-contrato";

const cobro = (extra: Partial<CobroPortal>): CobroPortal => ({ id: 1, proyectoId: 1, proyectoNombre: "PMS Hotel", texto: "Mensualidad de octubre 2026", monto: 100, vence: "2026-10-05", estado: "pendiente", pagadoEl: null, canal: "", reciboNumero: "", ...extra });

describe("hitos", () => {
  it("resume hechos, total y porcentaje; sin hitos el porcentaje es null (no es 0 %)", () => {
    expect(resumenHitos([{ hecho: true }, { hecho: true }, { hecho: false }, { hecho: false }])).toEqual({ hechos: 2, total: 4, porcentaje: 50 });
    expect(resumenHitos([{ hecho: true }, { hecho: false }, { hecho: false }])).toEqual({ hechos: 1, total: 3, porcentaje: 33 });
    expect(resumenHitos([])).toEqual({ hechos: 0, total: 0, porcentaje: null });
  });
  it("dice la fecha real y la estimada como las lee un cliente", () => {
    expect(textoFechaHito({ texto: "x", hecho: true, hechoEl: "2026-07-02", fechaEstimada: "2026-06-30" })).toBe("Cumplido el 02/07/2026 · estimado 30/06/2026");
    expect(textoFechaHito({ texto: "x", hecho: true, hechoEl: "2026-07-20", fechaEstimada: null })).toBe("Cumplido el 20/07/2026");
    expect(textoFechaHito({ texto: "x", hecho: true, hechoEl: null, fechaEstimada: null })).toBe("Cumplido");
    expect(textoFechaHito({ texto: "x", hecho: false, hechoEl: null, fechaEstimada: "2026-09-30" })).toBe("Estimado para el 30/09/2026");
    expect(textoFechaHito({ texto: "x", hecho: false, hechoEl: null, fechaEstimada: null })).toBe("Sin fecha todavía");
  });
});

describe("versiones", () => {
  it("van de la mas nueva a la mas vieja, por semver y no por texto", () => {
    const v = [{ version: "1.4.2" }, { version: "1.10.0" }, { version: "1.3.1" }];
    expect(versionesDelMasNuevo(v).map((x) => x.version)).toEqual(["1.10.0", "1.4.2", "1.3.1"]);
    expect(v.map((x) => x.version)).toEqual(["1.4.2", "1.10.0", "1.3.1"]); // no muta la entrada
  });
});

describe("cobros", () => {
  it("el texto del cobro es su detalle, o el nombre del concepto si no tiene", () => {
    expect(textoCobro({ concepto: "mensualidad", detalle: "Mensualidad de octubre 2026" })).toBe("Mensualidad de octubre 2026");
    expect(textoCobro({ concepto: "extra", detalle: " " })).toBe("Extra");
  });
  it("separa por pagar (vence mas viejo primero) de pagados (mas reciente primero) y nunca deja pasar un anulado", () => {
    const r = separarCobros([
      cobro({ id: 1, vence: "2026-10-05", estado: "pendiente" }),
      cobro({ id: 2, vence: "2026-09-05", estado: "vencido" }),
      cobro({ id: 3, estado: "pagado", pagadoEl: "2026-07-15" }),
      cobro({ id: 4, estado: "pagado", pagadoEl: "2026-08-04" }),
      cobro({ id: 5, estado: "anulado" }),
      cobro({ id: 6, vence: "2026-09-20", estado: "por_vencer" }),
    ]);
    expect(r.porPagar.map((c) => c.id)).toEqual([2, 6, 1]);
    expect(r.pagados.map((c) => c.id)).toEqual([4, 3]);
  });
  it("el aviso elige el vencido mas viejo; si no hay, el que vence antes; cuenta los demas; sin nada urgente es null", () => {
    const vencidoViejo = cobro({ id: 2, vence: "2026-08-05", estado: "vencido" });
    const a = avisoDeCobros([cobro({ id: 1, vence: "2026-09-05", estado: "vencido" }), vencidoViejo, cobro({ id: 3, vence: "2026-09-20", estado: "por_vencer" }), cobro({ id: 4, estado: "pendiente" })]);
    expect(a).toEqual({ gravedad: "vencido", cobro: vencidoViejo, otros: 2 });
    const b = avisoDeCobros([cobro({ id: 5, vence: "2026-09-22", estado: "por_vencer" }), cobro({ id: 6, vence: "2026-09-19", estado: "por_vencer" })]);
    expect(b?.gravedad).toBe("por_vencer");
    expect(b?.cobro.id).toBe(6);
    expect(b?.otros).toBe(1);
    expect(avisoDeCobros([cobro({ estado: "pendiente" }), cobro({ estado: "pagado", pagadoEl: "2026-08-04" })])).toBeNull();
  });
  it("el texto del aviso dice monto, que es, de que proyecto y la fecha", () => {
    expect(textoAviso({ gravedad: "vencido", cobro: cobro({ texto: "Mensualidad de septiembre 2026", vence: "2026-09-05", estado: "vencido" }), otros: 0 }))
      .toBe("Tienes un cobro vencido: $100,00 de Mensualidad de septiembre 2026 (PMS Hotel). Venció el 05/09/2026.");
    expect(textoAviso({ gravedad: "por_vencer", cobro: cobro({ vence: "2026-10-05", estado: "por_vencer" }), otros: 2 }))
      .toBe("Tienes un cobro por vencer: $100,00 de Mensualidad de octubre 2026 (PMS Hotel). Vence el 05/10/2026. Hay 2 más por revisar.");
    expect(textoAviso({ gravedad: "por_vencer", cobro: cobro({ vence: "2026-10-05", estado: "por_vencer" }), otros: 1 })).toContain("Hay 1 más por revisar.");
  });
});

describe("acceso", () => {
  it("arma el enlace sin barras dobles y los dos mensajes por separado", () => {
    expect(enlacePortal("https://prospectos.neracosu.com/", "abcDEF_123-abcDEF_123x")).toBe("https://prospectos.neracosu.com/c/abcDEF_123-abcDEF_123x");
    expect(() => enlacePortal("", "x")).toThrow("Falta PROSPECTOS_URL_PUBLICA");
    const m = mensajeEnlacePortal("Ana", "https://x.test/c/abc");
    expect(m).toContain("Ana");
    expect(m).toContain("https://x.test/c/abc");
    expect(m).not.toMatch(/\d{6}/); // el PIN nunca va en el mensaje del enlace
    expect(mensajePinPortal("042917")).toContain("042917");
    expect(mensajePinPortal("042917")).not.toContain("http"); // ni el enlace en el del PIN
  });
  it("primerNombre", () => {
    expect(primerNombre("Neri Colón")).toBe("Neri");
    expect(primerNombre("  ")).toBe("Neri");
  });
});
