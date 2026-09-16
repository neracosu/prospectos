import { describe, it, expect } from "vitest";
import { esSemver, compararSemver, parsearChangelog } from "@/lib/semver-contrato";

describe("semver", () => {
  it("valida MAYOR.MENOR.PARCHE sin prefijos", () => {
    expect(esSemver("1.4.2")).toBe(true);
    expect(esSemver("0.0.1")).toBe(true);
    expect(esSemver("v1.4.2")).toBe(false);
    expect(esSemver("1.4")).toBe(false);
    expect(esSemver("01.4.2")).toBe(false);
  });
  it("compara numericamente", () => {
    expect(compararSemver("1.10.0", "1.9.9")).toBeGreaterThan(0);
    expect(compararSemver("1.4.2", "1.4.2")).toBe(0);
    expect(["1.10.0", "1.2.0", "1.9.9"].sort(compararSemver)).toEqual(["1.2.0", "1.9.9", "1.10.0"]);
  });
});

describe("parsearChangelog", () => {
  it("convierte un bloque de CHANGELOG.md en cambios", () => {
    const md = `## [1.4.2] - 2026-09-10
### Nuevo
- Reporte de ocupación por día
- Exportar a Excel
### Mejora
* Búsqueda más rápida en reservas
### Arreglo
- El cierre de caja no sumaba propinas

### Otra cosa
- se ignora
`;
    expect(parsearChangelog(md)).toEqual([
      { tipo: "nuevo", texto: "Reporte de ocupación por día" },
      { tipo: "nuevo", texto: "Exportar a Excel" },
      { tipo: "mejora", texto: "Búsqueda más rápida en reservas" },
      { tipo: "arreglo", texto: "El cierre de caja no sumaba propinas" },
    ]);
  });
  it("acepta encabezados en ingles y sin nivel fijo, y vinetas sin encabezado van como mejora", () => {
    expect(parsearChangelog("#### Added\n- a\n## Fixed\n- b\n")).toEqual([{ tipo: "nuevo", texto: "a" }, { tipo: "arreglo", texto: "b" }]);
    expect(parsearChangelog("- suelto")).toEqual([{ tipo: "mejora", texto: "suelto" }]);
    expect(parsearChangelog("")).toEqual([]);
  });
});
