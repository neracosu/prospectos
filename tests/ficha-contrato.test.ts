import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  analizarWeb, armarGancho, armarResumen, estadoDeFicha, estadoDeDescarga, enlacesInternos, hallazgosDeBase,
  depurarUniverso, normalizarCorreo, esWebRedSocial, GANCHO_MAX,
  type Hallazgos, type HallazgosBase, type FilaUniverso,
} from "@/lib/ficha-contrato";

const fx = (n: string) => readFileSync(path.join(import.meta.dirname, "fixtures/webs", n), "utf8");
const vacia: HallazgosBase = hallazgosDeBase({ tipo: "", tamano: "", nota: "", instagram: "", facebook: "", telefono: "", whatsapp: "" });
const URL = "https://ejemplo.test/";

describe("analizarWeb y armarGancho", () => {
  it("restaurante con carta en PDF y pedidos por WhatsApp", () => {
    const w = analizarWeb(fx("restaurante-carta-pdf.html"), URL, "La Trattoria", "viva");
    expect(w).toMatchObject({ menuEnPdf: true, reservaPorWhatsApp: true, nombreCoincide: true });
    const g = armarGancho({ web: w, base: vacia }, "restaurantes-y-bares");
    expect(g).toContain("carta está en PDF");
    expect(g.length).toBeLessThanOrEqual(GANCHO_MAX);
    expect(g).not.toMatch(/llamada|reuni|\n/i);
  });

  it("tienda Shopify que cobra a mano", () => {
    const w = analizarWeb(fx("tienda-shopify-cobra-a-mano.html"), URL, "Moda Aurora", "viva");
    expect(w).toMatchObject({ plataforma: "shopify", tieneTiendaEnLinea: true, cobraEnLinea: false });
    expect(w.metodosPago).toEqual(expect.arrayContaining(["pago móvil", "zelle"]));
    expect(armarGancho({ web: w, base: vacia }, "comercio-y-tienda")).toContain("ya venden en línea");
    expect(armarGancho({ web: w, base: vacia }, "restaurantes-y-bares")).toBe("");
  });

  it("hotel con reservas por WhatsApp: gancho en estadia y reservas, nunca en hoteles de paso ni demostracion en citas", () => {
    const w = analizarWeb(fx("hotel-reserva-whatsapp.html"), URL, "Posada Brisa Marina", "viva");
    const h: Hallazgos = { web: w, base: vacia };
    expect(armarGancho(h, "hoteles-estadia")).toContain("reservas se piden por WhatsApp");
    expect(armarGancho(h, "reservas")).toContain("reservas se piden por WhatsApp");
    expect(armarGancho(h, "hoteles")).toBe("");
    expect(armarGancho(h, "citas-y-servicios")).toContain("se confirma a mano");
    expect(armarGancho(h, "citas-y-servicios")).not.toMatch(/demostraci/);
  });

  it("dominio en venta y Wix sin dominio son web caida/vendida: gancho «hoy no abre» para todos", () => {
    const venta = estadoDeDescarga({ ok: true, estado: 200, texto: fx("dominio-en-venta.html") }, URL);
    const wix = estadoDeDescarga({ ok: true, estado: 200, texto: fx("wix-sin-dominio.html") }, URL);
    expect(venta).toBe("vendida");
    expect(wix).toBe("caida");
    for (const [html, estado] of [[fx("dominio-en-venta.html"), venta], [fx("wix-sin-dominio.html"), wix]] as const) {
      const w = analizarWeb(html, URL, "Hotel Paraiso", estado);
      for (const arq of ["hoteles", "hoteles-estadia", "cobros-y-pagos"]) {
        expect(armarGancho({ web: w, base: vacia }, arq)).toContain("hoy no abre");
      }
    }
  });

  it("estadoDeDescarga cubre caidas, mantenimiento y redes", () => {
    expect(estadoDeDescarga({ ok: false }, URL)).toBe("caida");
    expect(estadoDeDescarga({ ok: true, estado: 503, texto: "x" }, URL)).toBe("caida");
    expect(estadoDeDescarga({ ok: true, estado: 200, texto: "Sitio en mantenimiento" }, URL)).toBe("en_mantenimiento");
    expect(estadoDeDescarga({ ok: true, estado: 200, texto: "<h1>Hola</h1>" }, URL)).toBe("viva");
    expect(estadoDeDescarga({ ok: true, estado: 200, texto: "x" }, "https://www.instagram.com/foo")).toBe("red_social");
    expect(esWebRedSocial("https://linktr.ee/foo")).toBe(true);
    expect(esWebRedSocial("https://foo.com")).toBe(false);
  });

  it("nombre que no coincide: sin gancho y ficha en borrador", () => {
    const w = analizarWeb(fx("consultorio-wordpress.html"), URL, "Chino", "viva");
    expect(w.plataforma).toBe("wordpress");
    expect(w.nombreCoincide).toBe(false);
    const h: Hallazgos = { web: { ...w, reservaPorWhatsApp: true }, base: vacia };
    expect(armarGancho(h, "citas-y-servicios")).toBe("");
    expect(estadoDeFicha(h, "")).toBe("borrador");
  });

  it("binario o HTML vacio no revienta y queda sin hallazgos", () => {
    for (const html of [fx("binario.bin"), ""]) {
      const w = analizarWeb(html, URL, "Hotel Sol", "viva");
      expect(w).toMatchObject({ menuEnPdf: false, reservaPorWhatsApp: false, tieneTiendaEnLinea: false, plataforma: "" });
      const h: Hallazgos = { web: w, base: vacia };
      expect(armarGancho(h, "hoteles-estadia")).toBe("");
      expect(estadoDeFicha(h, "")).toBe("sin_hallazgos");
    }
  });

  it("varias sedes y solo Instagram", () => {
    const base = hallazgosDeBase({ tipo: "", tamano: "3 sucursales", nota: "", instagram: "https://instagram.com/lacasa/", facebook: "", telefono: "", whatsapp: "" });
    expect(base.variasSedes).toBe(true);
    expect(armarGancho({ base }, "restaurantes-y-bares")).toContain("varias sedes");
    expect(armarGancho({ base }, "hoteles")).toBe("");
    const solo = hallazgosDeBase({ tipo: "", tamano: "", nota: "", instagram: "@lacasa", facebook: "", telefono: "", whatsapp: "" });
    expect(armarGancho({ base: solo }, "comercio-y-tienda")).toContain("Instagram (@lacasa)");
    expect(armarGancho({ base: solo }, "hoteles")).toBe("");
  });

  it("un gancho de mas de GANCHO_MAX sale vacio", () => {
    const base = { ...vacia, instagram: "@" + "a".repeat(400) };
    expect(armarGancho({ base }, "comercio-y-tienda")).toBe("");
  });

  it("resumen: 2 a 4 lineas con hechos", () => {
    const w = analizarWeb(fx("restaurante-carta-pdf.html"), URL, "La Trattoria", "viva");
    const r = armarResumen({ web: w, base: vacia }, "restaurantes-y-bares", "Valencia");
    const lineas = r.split("\n");
    expect(lineas.length).toBeGreaterThanOrEqual(2);
    expect(lineas.length).toBeLessThanOrEqual(4);
    expect(r).toContain("Valencia");
    expect(r).toContain("PDF");
  });
});

describe("enlacesInternos", () => {
  it("devuelve hasta 3 del mismo host por palabras clave", () => {
    const html = `<a href="/contacto">Hola</a><a href="https://otro.test/menu">Menu</a><a href="/carta">x</a>
      <a href="https://ejemplo.test/reservas">y</a><a href="/contacto">dup</a><a href="/nosotros">Nosotros</a>
      <a href="/tienda">z</a><a href="https://otro.test/contacto">fuera</a>`;
    expect(enlacesInternos(html, "https://ejemplo.test/")).toEqual([
      "https://ejemplo.test/contacto", "https://ejemplo.test/carta", "https://ejemplo.test/reservas",
    ]);
  });
});

describe("depurarUniverso", () => {
  const f = (id: number, o: Partial<FilaUniverso>): FilaUniverso => ({
    id, email: `x${id}@x.test`, nombre: "N" + id, ciudad: "Caracas", etapa: "por_contactar", esLead: false, fuenteLead: "",
    web: "", whatsapp: "", instagram: "", facebook: "", telefono: "", nota: "", ...o,
  });
  it("gob.ve fuera, Colombia fuera, leads de la web fuera, una por correo normalizado, principal la mas completa", () => {
    const r = depurarUniverso([
      f(1, { email: "info@venetur.gob.ve" }),
      f(2, { email: "info@x.test", web: "a.test", nota: "algo" }),
      f(3, { email: "Info@X.test " }),
      f(4, { ciudad: "Bogotá" }),
      f(5, { esLead: true, fuenteLead: "web" }),
      f(6, { etapa: "enviado" }),
      f(7, {}),
    ], (c) => (c === "Bogotá" ? "CO" : "VE"));
    expect(r.excluidas.map((e) => e.motivo)).toEqual(expect.arrayContaining(["correo_estado", "colombia", "lead_propio", "etapa"]));
    expect(r.duplicadas).toEqual([{ id: 3, principalId: 2 }]);
    expect(r.cola.map((x) => x.id)).toEqual([2, 7]);
    expect(normalizarCorreo(" Info@X.test ")).toBe("info@x.test");
  });
  it("empate: gana el menor id", () => {
    const r = depurarUniverso([f(9, { email: "a@x.test" }), f(8, { email: "A@x.test" })], () => "VE");
    expect(r.duplicadas).toEqual([{ id: 9, principalId: 8 }]);
  });
});
