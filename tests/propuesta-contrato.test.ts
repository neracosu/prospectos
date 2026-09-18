import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderPropuesta, nombreSeguro } from "@/lib/propuesta-contrato";

const plantilla = readFileSync(path.join(import.meta.dirname, "..", "plantillas", "hoteles.html"), "utf8");

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
  it("rellena {{nombre}}, {{ciudad}} y {{rubro}} escapados, y los bloques si:web / si:sinweb segun tenga web", () => {
    const plantilla = `<title>x</title><style></style><div class="documento"><p>{{nombre}} en {{ciudad}}, {{rubro}}.</p><!--si:web--><p>Ya tiene web.</p><!--fin:web--><!--si:sinweb--><p>Sin web.</p><!--fin:sinweb--><button class="boton" id="descargar-pdf" type="button">PDF</button></div>`;
    const con = renderPropuesta(plantilla, "Bar Uno", "/p/x/pdf", { ciudad: "Valencia & Co", rubro: "restaurantes y bares", conWeb: true });
    expect(con).toContain("Bar Uno en Valencia &amp; Co, restaurantes y bares.");
    expect(con).toContain("Ya tiene web.");
    expect(con).not.toContain("Sin web.");
    expect(con).not.toContain("{{");
    const sin = renderPropuesta(plantilla, "Bar Uno", "/p/x/pdf", { ciudad: "", rubro: "", conWeb: false });
    expect(sin).toContain("Sin web.");
    expect(sin).not.toContain("Ya tiene web.");
    // Sin extra (las plantillas viejas de hoteles): los bloques de web se quitan y los tokens quedan vacios.
    const viejo = renderPropuesta(plantilla, "Bar Uno", "/p/x/pdf");
    expect(viejo).not.toContain("Ya tiene web.");
    expect(viejo).toContain("Bar Uno en su ciudad, su negocio.");
  });

  it("revienta si la plantilla no tiene los marcadores esperados", () => {
    expect(() => renderPropuesta("<html><body>sin nada util</body></html>", "X", "/p/x/pdf")).toThrow(
      "PLANTILLA_SIN_MARCADORES",
    );
  });
});
