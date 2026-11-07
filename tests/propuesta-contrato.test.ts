import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderPropuesta, nombreSeguro, GANCHOS_SIN_PDF, webUsable } from "@/lib/propuesta-contrato";

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

  it("pone la fecha de la propuesta y una vigencia de 30 dias, escritas en largo", () => {
    const p = '<title>x</title><style></style><div class="documento"><p>Caracas, {{fecha}}. Vigente hasta el {{vigencia}}. {{fecha}}</p></div>';
    expect(renderPropuesta(p, "Bar Uno", "/p/x/pdf", { fecha: "2026-10-05" })).toContain("Caracas, 5 de octubre de 2026. Vigente hasta el 4 de noviembre de 2026. 5 de octubre de 2026");
    // cruza el fin de ano
    expect(renderPropuesta(p, "Bar Uno", "/p/x/pdf", { fecha: "2026-12-15" })).toContain("15 de diciembre de 2026. Vigente hasta el 14 de enero de 2027");
  });
  it("sin fecha, o con una fecha que no lo es, usa el dia de hoy en Caracas y no deja el token a la vista", () => {
    const p = '<title>x</title><style></style><div class="documento"><p>[{{fecha}}|{{vigencia}}]</p></div>';
    for (const extra of [{}, { fecha: "ayer" }, { fecha: "2026-13-40" }]) {
      const html = renderPropuesta(p, "Bar Uno", "/p/x/pdf", extra);
      expect(html).not.toContain("{{");
      expect(html).toMatch(/\[\d{1,2} de [a-z]+ de \d{4}\|\d{1,2} de [a-z]+ de \d{4}\]/);
    }
  });
  it("deja el bloque de la temporada promocional hasta el 31 de diciembre de 2026 y lo quita despues", () => {
    const p = '<title>x</title><style></style><div class="documento"><p>A<!--si:promo--> 40 % menos<!--fin:promo-->B</p></div>';
    for (const hoy of ["2026-10-05", "2026-12-31"]) expect([hoy, renderPropuesta(p, "Bar", "/p/x/pdf", { hoy }).includes("<p>A 40 % menos</p>".replace("</p>", "B</p>"))]).toEqual([hoy, true]);
    for (const hoy of ["2027-01-01", "2027-06-15"]) {
      const html = renderPropuesta(p, "Bar", "/p/x/pdf", { hoy });
      expect([hoy, html.includes("<p>AB</p>"), html.includes("promo")]).toEqual([hoy, true, false]);
    }
    // sin decirle el dia usa el de hoy en Caracas: nunca deja el marcador a la vista
    expect(renderPropuesta(p, "Bar", "/p/x/pdf")).not.toContain("<!--si:promo-->");
  });
  it("deja los bloques del pais del prospecto y quita los del otro; sin decirlo es Venezuela", () => {
    const p = '<title>x</title><style></style><div class="documento"><p>A<!--si:ve--> pago móvil<!--fin:ve--><!--si:co--> Wompi<!--fin:co-->B</p></div>';
    expect(renderPropuesta(p, "Bar", "/p/x/pdf")).toContain("<p>A pago móvilB</p>");
    expect(renderPropuesta(p, "Bar", "/p/x/pdf", { pais: "VE" })).toContain("<p>A pago móvilB</p>");
    const co = renderPropuesta(p, "Bar", "/p/x/pdf", { pais: "CO" });
    expect(co).toContain("<p>A WompiB</p>");
    expect(co).not.toContain("si:");
  });
  it("revienta si la plantilla no tiene los marcadores esperados", () => {
    expect(() => renderPropuesta("<html><body>sin nada util</body></html>", "X", "/p/x/pdf")).toThrow(
      "PLANTILLA_SIN_MARCADORES",
    );
  });
  it("con gancho deja el bloque si:gancho con el texto escapado; sin gancho lo quita entero", () => {
    const plantilla = `<title>x</title><style></style><div class="documento"><!--si:gancho--><p>{{gancho}}</p><!--fin:gancho--><p>resto</p><button class="boton" id="descargar-pdf" type="button">PDF</button></div>`;
    const con = renderPropuesta(plantilla, "Bar Uno", "/p/x/pdf", { gancho: "<b>x</b> & \"y\"" });
    expect(con).toContain("<p>&lt;b&gt;x&lt;/b&gt; &amp; &quot;y&quot;</p>");
    expect(con).not.toContain("{{gancho}}");
    expect(con).not.toContain("si:gancho");
    for (const extra of [{}, { gancho: "" }, { gancho: "   " }]) {
      const sin = renderPropuesta(plantilla, "Bar Uno", "/p/x/pdf", extra);
      expect(sin).not.toContain("<p></p>");
      expect(sin).not.toContain("{{gancho}}");
      expect(sin).toContain("<p>resto</p>");
    }
  });
  it("las doce plantillas llevan el bloque si:gancho una sola vez, y ninguna propone llamadas", () => {
    for (const f of ["hoteles", "hoteles-estadia", "restaurantes-y-bares", "reservas", "comercio-y-tienda", "farmacias", "comida-por-encargo", "tienda-por-instagram", "cobros-y-pagos", "cobros-y-pagos-co", "citas-y-servicios"]) {
      const h = readFileSync(path.join(import.meta.dirname, "..", "plantillas", `${f}.html`), "utf8");
      expect(h.match(/<!--si:gancho--><p>\{\{gancho\}\}<\/p><!--fin:gancho-->/g), f).toHaveLength(1);
    }
  });
  it("en el PDF las plantillas de GANCHOS_SIN_PDF no llevan gancho; en linea y hoteles si", () => {
    const pl = `<title>x</title><style></style><div class="documento"><!--si:gancho--><p>{{gancho}}</p><!--fin:gancho--><button class="boton" id="descargar-pdf" type="button">PDF</button></div>`;
    for (const s of GANCHOS_SIN_PDF) {
      expect(renderPropuesta(pl, "A", "#", { gancho: "Vi que X", paraPdf: true, plantilla: s })).not.toContain("Vi que X");
      expect(renderPropuesta(pl, "A", "#", { gancho: "Vi que X", plantilla: s })).toContain("Vi que X");
    }
    expect(renderPropuesta(pl, "A", "#", { gancho: "Vi que X", paraPdf: true, plantilla: "hoteles-estadia-co" })).not.toContain("Vi que X");
    expect(renderPropuesta(pl, "A", "#", { gancho: "Vi que X", paraPdf: true, plantilla: "cobros-y-pagos" })).toContain("Vi que X");
  });
  it("con gancho el parrafo generico de web (y de sin web) desaparece y el gancho ocupa su lugar; sin gancho queda como antes", () => {
    const pl = `<title>x</title><style></style><div class="documento"><!--si:web--><p>Ya tiene web.</p><!--fin:web--><!--si:sinweb--><p>Sin web.</p><!--fin:sinweb--><!--si:gancho--><p>{{gancho}}</p><!--fin:gancho--><button class="boton" id="descargar-pdf" type="button">PDF</button></div>`;
    const con = renderPropuesta(pl, "A", "#", { conWeb: true, gancho: "Vi que X" });
    expect(con).toContain("Vi que X");
    expect(con).not.toContain("Ya tiene web.");
    const sinW = renderPropuesta(pl, "A", "#", { conWeb: false, gancho: "Vi que X" });
    expect(sinW).toContain("Vi que X");
    expect(sinW).not.toContain("Sin web.");
    const sin = renderPropuesta(pl, "A", "#", { conWeb: true });
    expect(sin).toContain("Ya tiene web.");
    expect(sin).not.toContain("Vi que X");
    expect(renderPropuesta(pl, "A", "#", { conWeb: false })).toContain("Sin web.");
  });
  it("webUsable: una web caida o vendida cuenta como sin web", () => {
    expect(webUsable(true, "viva")).toBe(true);
    expect(webUsable(true, undefined)).toBe(true);
    expect(webUsable(true, "caida")).toBe(false);
    expect(webUsable(true, "vendida")).toBe(false);
    expect(webUsable(true, "desconocida")).toBe(true);
    expect(webUsable(false, "viva")).toBe(false);
  });

  it("inserta el script de rastro antes de </body> y no lo inserta si no viene", () => {
    const p = '<title>x</title><style></style><div class="documento"><button class="boton" id="descargar-pdf" type="button">PDF</button></div>';
    const tag = '<script src="https://prospectos.neracosu.com/rastro.js?v=1" data-enlace="t" defer></script>';
    expect(renderPropuesta(p, "Negocio", "/p/x/pdf", { scriptRastro: tag })).toMatch(/rastro\.js\?v=1" data-enlace="t" defer><\/script><\/body>/);
    expect(renderPropuesta(p, "Negocio", "/p/x/pdf")).not.toContain("rastro.js");
  });
});
