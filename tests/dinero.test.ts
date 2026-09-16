import { describe, it, expect } from "vitest";
import { redondear2, formatoUSD, montoDesdeTexto } from "@/lib/dinero";

describe("dinero", () => {
  it("redondea a 2 decimales sin errores binarios", () => {
    expect(redondear2(1.005)).toBe(1.01);
    expect(redondear2(2800 / 3)).toBe(933.33);
  });
  it("formatea al estilo venezolano", () => {
    expect(formatoUSD(1500)).toBe("$1.500,00");
    expect(formatoUSD(0.5)).toBe("$0,50");
    expect(formatoUSD(1234567.891)).toBe("$1.234.567,89");
  });
  it("lee montos de texto con punto o coma", () => {
    expect(montoDesdeTexto("1500")).toBe(1500);
    expect(montoDesdeTexto("1500,50")).toBe(1500.5);
    expect(montoDesdeTexto("1.500")).toBe(1.5); // un punto es decimal, no miles
    expect(montoDesdeTexto("abc")).toBeNull();
    expect(montoDesdeTexto("-5")).toBeNull();
    expect(montoDesdeTexto("0")).toBe(0);
  });
});
