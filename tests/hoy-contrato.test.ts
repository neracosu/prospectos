import { describe, it, expect } from "vitest";
import { aplicarAjuste, porcentajeDelDia, firmaCifras, sumarAjustes, invertir, AJUSTE_ENVIO, AJUSTE_RESPONDIO, AJUSTE_DESCARTE_ENVIADO, type CifrasHoy } from "@/lib/hoy-contrato";

const base: CifrasHoy = { enviados: 1, meta: 10, por_contactar: 3, enviado: 2, respondio: 1, reunion: 0 };

describe("cifras de Hoy con ajuste optimista", () => {
  it("un envio sube el dia y mueve uno de por contactar a enviados", () => {
    expect(aplicarAjuste(base, AJUSTE_ENVIO)).toEqual({ enviados: 2, meta: 10, por_contactar: 2, enviado: 3, respondio: 1, reunion: 0 });
  });
  it("respondio mueve uno de enviados a respondieron y no toca el dia", () => {
    expect(aplicarAjuste(base, AJUSTE_RESPONDIO)).toEqual({ ...base, enviado: 1, respondio: 2 });
  });
  it("descartar un enviado solo baja enviados", () => {
    expect(aplicarAjuste(base, AJUSTE_DESCARTE_ENVIADO)).toEqual({ ...base, enviado: 1 });
  });
  it("nunca deja una cifra negativa", () => {
    const vacio: CifrasHoy = { ...base, por_contactar: 0, enviado: 0 };
    expect(aplicarAjuste(vacio, { por_contactar: -1, enviado: -2 })).toEqual(vacio);
  });
  it("un ajuste y su inverso se anulan", () => {
    expect(aplicarAjuste(base, sumarAjustes(AJUSTE_ENVIO, invertir(AJUSTE_ENVIO)))).toEqual(base);
  });
  it("sumarAjustes acumula dos envios seguidos", () => {
    expect(aplicarAjuste(base, sumarAjustes(AJUSTE_ENVIO, AJUSTE_ENVIO)).enviados).toBe(3);
  });
  it("el ajuste vacio no cambia nada", () => {
    expect(aplicarAjuste(base, {})).toEqual(base);
  });
});

describe("porcentajeDelDia", () => {
  it("redondea y no pasa de 100", () => {
    expect(porcentajeDelDia({ enviados: 1, meta: 3 })).toBe(33);
    expect(porcentajeDelDia({ enviados: 12, meta: 10 })).toBe(100);
  });
  it("sin meta es 0, no una division entre cero", () => {
    expect(porcentajeDelDia({ enviados: 4, meta: 0 })).toBe(0);
  });
});

describe("firmaCifras", () => {
  it("es igual para cifras iguales y cambia con cualquiera de ellas", () => {
    expect(firmaCifras(base)).toBe(firmaCifras({ ...base }));
    for (const k of ["enviados", "meta", "por_contactar", "enviado", "respondio", "reunion"] as const) {
      expect(firmaCifras({ ...base, [k]: base[k] + 1 })).not.toBe(firmaCifras(base));
    }
  });
});
