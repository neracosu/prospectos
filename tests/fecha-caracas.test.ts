import { describe, it, expect } from "vitest";
import { hoyCaracas, sumarDias, tocaHoy, esFechaIso } from "@/lib/fecha-caracas";

describe("hoyCaracas", () => {
  it("a las 02:00 UTC todavia es el dia anterior en Caracas (UTC-4)", () => {
    expect(hoyCaracas(new Date("2026-09-17T02:00:00Z"))).toBe("2026-09-16");
  });
  it("a las 04:00 UTC ya es el dia siguiente en Caracas", () => {
    expect(hoyCaracas(new Date("2026-09-17T04:00:00Z"))).toBe("2026-09-17");
  });
  it("no depende de la zona del servidor", () => {
    expect(hoyCaracas(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12-31");
    expect(hoyCaracas(new Date("2027-01-01T03:59:59Z"))).toBe("2026-12-31");
  });
});

describe("sumarDias", () => {
  it("cruza fin de mes y de anio", () => {
    expect(sumarDias("2026-09-29", 3)).toBe("2026-10-02");
    expect(sumarDias("2026-12-30", 3)).toBe("2027-01-02");
  });
  it("acepta negativos", () => {
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("tocaHoy", () => {
  it("toca si la fecha es hoy o ya paso", () => {
    expect(tocaHoy("2026-09-16", "2026-09-16")).toBe(true);
    expect(tocaHoy("2026-09-10", "2026-09-16")).toBe(true);
    expect(tocaHoy("2026-09-17", "2026-09-16")).toBe(false);
    expect(tocaHoy(null, "2026-09-16")).toBe(false);
  });
});

describe("esFechaIso", () => {
  it("valida el formato y el calendario", () => {
    expect(esFechaIso("2026-02-28")).toBe(true);
    expect(esFechaIso("2026-02-30")).toBe(false);
    expect(esFechaIso("16/09/2026")).toBe(false);
  });
});
