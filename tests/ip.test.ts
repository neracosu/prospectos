import { describe, it, expect } from "vitest";
import { ipDesdeCabeceras } from "@/lib/ip";

describe("ipDesdeCabeceras", () => {
  it("toma el ultimo salto de X-Forwarded-For (el que anexa Apache)", () => {
    expect(ipDesdeCabeceras("1.2.3.4, 10.0.0.9", null)).toBe("10.0.0.9");
  });
  it("recorta espacios", () => {
    expect(ipDesdeCabeceras("  5.6.7.8 ", null)).toBe("5.6.7.8");
  });
  it("usa X-Real-IP si no hay X-Forwarded-For", () => {
    expect(ipDesdeCabeceras(null, "9.9.9.9")).toBe("9.9.9.9");
  });
  it("cae a 'desconocida' sin ninguna cabecera", () => {
    expect(ipDesdeCabeceras(null, null)).toBe("desconocida");
  });
});
