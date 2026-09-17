import { describe, it, expect } from "vitest";
import { AVISO_POR_DEFECTO, VARIABLE_OBLIGATORIA, RENGLON_PORTAL_COBRO, quienRecibe, mensajeAvisoHito, mensajeAvisoVersion, mensajeAvisoCobro } from "@/lib/avisos-contrato";

const base = { cliente: "Ana", proyecto: "PMS Hotel" };

describe("avisos al cliente", () => {
  it("los textos de fabrica llevan su variable obligatoria y el enlace en su propio renglon", () => {
    for (const tipo of ["hito", "version", "cobro"] as const) {
      expect(AVISO_POR_DEFECTO[tipo]).toContain(VARIABLE_OBLIGATORIA[tipo]);
      const conEnlace = AVISO_POR_DEFECTO[tipo].split("\n").filter((l) => l.includes("{enlace}"));
      expect(conEnlace).toHaveLength(1);
      expect(AVISO_POR_DEFECTO[tipo]).not.toMatch(/factura/i);
    }
    expect(RENGLON_PORTAL_COBRO).toContain("{enlace}");
    expect(RENGLON_PORTAL_COBRO).not.toContain("\n");
  });
  it("quienRecibe prefiere el contacto y cae al nombre del negocio", () => {
    expect(quienRecibe({ nombre: "Hotel X", contactoNombre: "Ana" })).toBe("Ana");
    expect(quienRecibe({ nombre: "Hotel X", contactoNombre: "" })).toBe("Hotel X");
  });
  it("hito: con y sin acceso al portal", () => {
    expect(mensajeAvisoHito(AVISO_POR_DEFECTO.hito, { ...base, enlace: "https://x.test/c/abc", hito: "Recepción y habitaciones" }))
      .toBe("Buenas, Ana. Ya quedó listo en PMS Hotel: Recepción y habitaciones.\nPuede ver el avance en su portal: https://x.test/c/abc\nCualquier duda me escribe por aquí.");
    expect(mensajeAvisoHito(AVISO_POR_DEFECTO.hito, { ...base, enlace: "", hito: "Recepción y habitaciones" }))
      .toBe("Buenas, Ana. Ya quedó listo en PMS Hotel: Recepción y habitaciones.\nCualquier duda me escribe por aquí.");
  });
  it("version: lista los cambios con su etiqueta, uno por renglon", () => {
    const cambios = [{ tipo: "nuevo", texto: "Reporte semanal" }, { tipo: "arreglo", texto: "Cierre de caja" }, { tipo: "raro", texto: "Otro" }];
    expect(mensajeAvisoVersion(AVISO_POR_DEFECTO.version, { ...base, enlace: "", version: "1.10.0", cambios }))
      .toBe("Buenas, Ana. Publicamos la versión 1.10.0 de PMS Hotel:\n• Nuevo: Reporte semanal\n• Arreglo: Cierre de caja\n• raro: Otro\nCualquier duda me escribe por aquí.");
  });
  it("cobro: concepto con su detalle, monto y fecha como se escriben en Venezuela", () => {
    expect(mensajeAvisoCobro(AVISO_POR_DEFECTO.cobro, { ...base, enlace: "https://x.test/c/abc", concepto: "extra", detalle: "Módulo de reportes", monto: 150.5, vence: "2026-10-05" }))
      .toBe("Buenas, Ana. Registré un cobro de PMS Hotel: Extra (Módulo de reportes) por $150,50, que vence el 05/10/2026.\nPuede verlo en su portal: https://x.test/c/abc\nCualquier duda me escribe por aquí.");
  });
});
