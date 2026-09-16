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
  it("cambia el boton del artefacto por un enlace que pide el PDF por fetch", () => {
    expect(html).toContain('<a class="boton" id="descargar-pdf" href="/p/abc/pdf">');
    expect(html).not.toMatch(/id="descargar-pdf"[^>]*download/);
    expect(html).toContain('id="aviso-descarga"');
    expect(html).toContain("fetch(");
    expect(html).not.toContain("pdf-datos");
  });
  it("no deja meter HTML por el nombre", () => {
    expect(nombreSeguro('Hotel <b>"X"</b> & Cía')).toBe("Hotel bX/b  Cía");
    expect(nombreSeguro("a".repeat(100))).toHaveLength(60);
  });
  it("revienta si la plantilla no tiene los marcadores esperados", () => {
    expect(() => renderPropuesta("<html><body>sin nada util</body></html>", "X", "/p/x/pdf")).toThrow(
      "PLANTILLA_SIN_MARCADORES",
    );
  });
});
