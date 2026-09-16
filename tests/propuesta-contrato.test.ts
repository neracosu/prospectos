import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { renderPropuesta, nombreSeguro } from "@/lib/propuesta-contrato";

const plantilla = readFileSync("plantillas/hoteles.html", "utf8");

describe("renderPropuesta", () => {
  const html = renderPropuesta(plantilla, "Hotel Yare", "/p/abc/pdf");
  it("inyecta el nombre en data-nombre del documento y noindex", () => {
    expect(html).toContain('<div class="documento" data-nombre="Hotel Yare">');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).toMatch(/^<!doctype html>/i);
  });
  it("cambia el boton del artefacto por un enlace al PDF", () => {
    expect(html).not.toContain('id="descargar-pdf"');
    expect(html).toContain('href="/p/abc/pdf"');
    expect(html).not.toContain("pdf-datos");
  });
  it("no deja meter HTML por el nombre", () => {
    expect(nombreSeguro('Hotel <b>"X"</b> & Cía')).toBe("Hotel bX/b  Cía");
    expect(nombreSeguro("a".repeat(100))).toHaveLength(60);
  });
});
