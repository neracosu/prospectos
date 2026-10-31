import { describe, expect, it } from "vitest";
import { armarCorreoPropuesta, asuntoPropuesta, enlacesDe, type DatosCorreo } from "@/lib/correo-propuesta-contrato";
import { cierreInicial, cierreSeguimiento } from "@/lib/mensajes-nicho-contrato";

const PROHIBIDO = /llamada|videollamada|reuni[oó]n|30 minutos/i;
const TOKEN = "t".repeat(22);
const d = (o: Partial<DatosCorreo> = {}): DatosCorreo => ({
  nombre: "La Trattoria", ciudad: "Valencia", arquetipo: "restaurantes-y-bares", codigo: "abc", token: TOKEN,
  gancho: "Vi que su carta está en Instagram.", hojas: 9, hoy: "2026-10-29", dondeCorreo: "su ficha de Google Maps", tipo: "inicial", ...o,
});

describe("correo de propuesta", () => {
  it("inicial: asunto, gancho escapado en su caja, enlaces con el token, enganche, pie con el porque, un solo pixel", () => {
    const c = armarCorreoPropuesta(d({ gancho: "Vi que <su> carta" }));
    expect(c.asunto).toBe("Propuesta para La Trattoria: comandas y caja sin cuaderno");
    expect(c.html).toContain("Vi que &lt;su&gt; carta");
    expect(c.html).toContain("#f1f4f2");
    expect(c.html).toContain(`/r/${TOKEN}`);
    expect(c.html).toContain(`/p/abc/pdf?e=${TOKEN}`);
    expect(c.html).toContain(`/api/correo/a/${TOKEN}.png`);
    expect(c.html).toContain(cierreInicial("restaurantes-y-bares"));
    expect(c.html).toContain("Comandas y caja sin cuaderno.");
    expect(c.html).toContain("Restaurantes y bares · Valencia");
    expect(c.html).toContain("su ficha de Google Maps");
    expect(c.texto).toContain("respóndame «no»");
    expect(c.texto).toContain("Vi que <su> carta");
    expect(c.previo).toBe("Le adjunto la propuesta en PDF y un diagnóstico gratis por escrito, sin compromiso.");
    expect((c.html.match(/<img/g) ?? []).length).toBe(1);
    expect(c.html).not.toMatch(/\{\{|\{[a-z]+\}/);
  });

  it("escapa nombre, ciudad y dondeCorreo; el texto de wa.me va codificado", () => {
    const c = armarCorreoPropuesta(d({ nombre: "A<b>&\"B", ciudad: "<i>", dondeCorreo: "<x>" }));
    expect(c.html).not.toMatch(/<b>&"B|<i>|<x>/);
    expect(enlacesDe(d({ nombre: "A&B" })).whatsapp).toBe(
      "https://wa.me/584222707095?text=" + encodeURIComponent("Hola Neri, leí la propuesta para A&B y quiero ver cómo quedaría con mi marca."));
  });

  it("sin gancho no hay caja; citas sin demostracion; despues del 31-dic sin temporada", () => {
    const sin = armarCorreoPropuesta(d({ gancho: "" }));
    expect(sin.html).not.toContain("#f1f4f2");
    expect(sin.html).toContain("Temporada:");
    const citas = armarCorreoPropuesta(d({ arquetipo: "citas-y-servicios" }));
    expect(citas.html).not.toMatch(/demostraci/i);
    const tarde = armarCorreoPropuesta(d({ hoy: "2027-01-05" }));
    expect(tarde.html).not.toContain("Temporada:");
    expect(tarde.texto).not.toContain("Temporada:");
  });

  it("seguimiento: asunto de reenvio, sin gancho ni temporada, con el enlace y el cierre de seguimiento", () => {
    const c = armarCorreoPropuesta(d({ tipo: "seguimiento", enviadoAnteriorEn: "2026-10-20" }));
    expect(c.asunto).toBe("Le reenvío la propuesta para La Trattoria");
    expect(c.html).toContain("Le escribí el 20 de octubre de 2026 con la propuesta para La Trattoria");
    expect(c.html).toContain(cierreSeguimiento("restaurantes-y-bares"));
    expect(c.html).toContain(`/r/${TOKEN}`);
    expect(c.html).not.toContain("#f1f4f2");
    expect(c.html).not.toContain("Temporada:");
    expect(c.previo).toBe("Le dejo otra vez la propuesta, por si se le pasó.");
    expect(c.texto).toContain("respóndame «no»");
    expect((c.html.match(/<img/g) ?? []).length).toBe(1);
  });

  it("en la vista previa «Ver la propuesta» va directo a /p/<codigo> (el token de la vista previa no existe y /r/ daria 404)", () => {
    const e = enlacesDe(d({ vistaPrevia: true }));
    expect(e.ver).toBe(`https://prospectos.neracosu.com/p/${d({}).codigo}`);
    expect(enlacesDe(d({})).ver).toBe(`https://prospectos.neracosu.com/r/${d({}).token}`);
    expect(armarCorreoPropuesta(d({ vistaPrevia: true })).html).not.toContain("/r/");
  });

  it("nada del prospecto rompe una cabecera", () => {
    expect(asuntoPropuesta(d({ nombre: "X\nBcc: y" }))).not.toMatch(/[\r\n]/);
  });

  it("ningun texto propone llamadas", () => {
    for (const tipo of ["inicial", "seguimiento"] as const) {
      for (const a of ["hoteles", "hoteles-estadia", "restaurantes-y-bares", "reservas", "comercio-y-tienda", "farmacias", "cobros-y-pagos", "citas-y-servicios"]) {
        const c = armarCorreoPropuesta(d({ tipo, arquetipo: a, enviadoAnteriorEn: "2026-10-20" }));
        expect(c.html + c.texto + c.previo + c.asunto, `${tipo} ${a}`).not.toMatch(PROHIBIDO);
      }
    }
  });
});
