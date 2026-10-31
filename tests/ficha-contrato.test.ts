import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  analizarWeb, armarGancho, armarResumen, estadoDeFicha, estadoDeDescarga, enlacesInternos, hallazgosDeBase,
  depurarUniverso, normalizarCorreo, esWebRedSocial, usuarioInstagramValido, GANCHO_MAX, WEB_NO_ABRE,
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
    expect(estadoDeDescarga({ ok: false, motivo: "No se pudo resolver el dominio" }, URL)).toBe("caida");
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

describe("correcciones de revision", () => {
  const webBase = analizarWeb("", URL, "Casa Sol", "viva");
  const conWa = (href: string, texto: string) =>
    analizarWeb(`<title>Casa Sol</title><a href="${href}">${texto}</a>`, URL, "Casa Sol", "viva");

  it("mantenimiento: solo por titulo/h1 o cuerpo casi vacio, con gancho propio", () => {
    const largo = "<p>" + "Ofrecemos un servicio de mantenimiento y pronto, próximamente, más. ".repeat(12) + "</p>";
    expect(estadoDeDescarga({ ok: true, estado: 200, texto: `<title>Casa Sol</title><body>${largo}</body>` }, URL)).toBe("viva");
    const t = "<html><head><title>Sitio en mantención</title></head><body>" + largo + "</body></html>";
    expect(estadoDeDescarga({ ok: true, estado: 200, texto: t }, URL)).toBe("en_mantenimiento");
    const w = analizarWeb(t, URL, "Casa Sol", "en_mantenimiento");
    const g = armarGancho({ web: w, base: vacia }, "hoteles");
    expect(g).toContain("está en mantenimiento");
    expect(g).not.toContain("hoy no abre");
  });

  it("WhatsApp: reserva, pedido y pedir informacion se distinguen", () => {
    const reserva = conWa("https://wa.me/58412?text=Quiero+reservar", "Reservas");
    const pedido = conWa("https://wa.me/58412?text=Hola", "Haga su pedido");
    const info = conWa("https://wa.me/58412", "Pedir información");
    expect(reserva).toMatchObject({ reservaPorWhatsApp: true, pedidoPorWhatsApp: false });
    expect(pedido).toMatchObject({ reservaPorWhatsApp: false, pedidoPorWhatsApp: true });
    expect(info).toMatchObject({ reservaPorWhatsApp: false, pedidoPorWhatsApp: false });
    expect(armarGancho({ web: reserva, base: vacia }, "restaurantes-y-bares")).toContain("reservas de mesa se piden por WhatsApp");
    expect(armarGancho({ web: pedido, base: vacia }, "restaurantes-y-bares")).toContain("pedidos se hacen por WhatsApp");
    expect(armarGancho({ web: info, base: vacia }, "restaurantes-y-bares")).toBe("");
    expect(armarGancho({ web: info, base: vacia }, "hoteles-estadia")).toBe("");
    expect(armarGancho({ web: pedido, base: vacia }, "hoteles-estadia")).toBe("");
  });

  it("estadoDeFicha: web sin_web sin Overture es sin_hallazgos", () => {
    const w = { ...webBase, estado: "sin_web" as const, titulo: "x" };
    expect(estadoDeFicha({ web: w, base: vacia }, "")).toBe("sin_hallazgos");
  });

  it("arquetipo desconocido: sin gancho", () => {
    const caida = analizarWeb("", URL, "Casa Sol", "caida");
    expect(armarGancho({ web: caida, base: { ...vacia, variasSedes: true } }, "otro-nicho")).toBe("");
    expect(armarGancho({ web: caida, base: vacia }, "")).toBe("");
  });

  it("correos genericos fuera, cada id con su motivo", () => {
    const f = (id: number, email: string): FilaUniverso => ({
      id, email, nombre: "N" + id, ciudad: "Caracas", etapa: "por_contactar", esLead: false, fuenteLead: "",
      web: "", whatsapp: "", instagram: "", facebook: "", telefono: "", nota: "",
    });
    const r = depurarUniverso([f(1, "noreply@x.test"), f(2, "a@example.com"), f(3, "No-Reply@y.test"), f(4, "ok@x.test")], () => "VE");
    expect(r.excluidas).toEqual([
      { id: 1, motivo: "correo_generico" }, { id: 2, motivo: "correo_generico" }, { id: 3, motivo: "correo_generico" },
    ]);
    expect(r.cola.map((x) => x.id)).toEqual([4]);
  });
});

describe("ola final de la revision", () => {
  const base = (nota: string, tamano = "") => hallazgosDeBase({ tipo: "", tamano, nota, instagram: "", facebook: "", telefono: "", whatsapp: "" });

  it("variasSedes exige plural o numero >= 2", () => {
    expect(base("1 sede").variasSedes).toBe(false);
    expect(base("una sede en el centro").variasSedes).toBe(false);
    expect(base("comidas locales").variasSedes).toBe(false);
    expect(base("4 sedes").variasSedes).toBe(true);
    expect(base("varias sedes").variasSedes).toBe(true);
    expect(base("", "sucursales en Caracas").variasSedes).toBe(true);
    expect(base("12 locales").variasSedes).toBe(true);
  });

  it("hallazgosDeBase toma solo los campos de la base", () => {
    const p = { id: 7, email: "a@b.test", nicho: { slug: "x" }, ficha: { gancho: "viejo" }, tipo: "t", tamano: "", nota: "n",
      instagram: "@i", facebook: "", telefono: "1", whatsapp: "2" };
    expect(hallazgosDeBase(p)).toEqual({ tipo: "t", tamano: "", nota: "n", instagram: "@i", facebook: "", telefono: "1", whatsapp: "2", variasSedes: false });
  });

  it("estadoDeDescarga por motivo: DNS, conexion y 5xx caida; lo demas desconocida", () => {
    expect(estadoDeDescarga({ ok: false, motivo: "No se pudo resolver el dominio" }, URL)).toBe("caida");
    expect(estadoDeDescarga({ ok: false, motivo: "No se pudo conectar" }, URL)).toBe("caida");
    expect(estadoDeDescarga({ ok: true, estado: 502, texto: "" }, URL)).toBe("caida");
    for (const motivo of ["Tiempo de espera agotado", "La descarga se cortó", "Certificado inválido", "Demasiadas redirecciones", undefined]) {
      expect(estadoDeDescarga({ ok: false, motivo }, URL)).toBe("desconocida");
    }
  });

  it("web desconocida: sin gancho de web, ficha lista, conWeb intacto, resumen lo dice", () => {
    const w = analizarWeb("", URL, "Casa Sol", "desconocida");
    const h: Hallazgos = { web: w, base: vacia };
    expect(armarGancho(h, "hoteles-estadia")).toBe("");
    expect(estadoDeFicha(h, "")).toBe("lista");
    expect(WEB_NO_ABRE.has("desconocida")).toBe(false);
    expect(WEB_NO_ABRE.has("caida")).toBe(true);
    expect(armarResumen(h, "hoteles-estadia", "Caracas")).toContain("No se pudo leer la web; se mantiene como web existente.");
  });

  it("segunda frase de web caida y mantenimiento segun el arquetipo", () => {
    const caida = analizarWeb("", URL, "Casa Sol", "caida");
    const mant = analizarWeb("", URL, "Casa Sol", "en_mantenimiento");
    const pagina = "El sistema trae su propia página, en su dominio, lista para vender y cobrar.";
    for (const arq of ["hoteles", "hoteles-estadia", "reservas", "comercio-y-tienda"]) {
      expect(armarGancho({ web: caida, base: vacia }, arq)).toBe(`Vi que su dirección web hoy no abre. ${pagina}`);
      expect(armarGancho({ web: mant, base: vacia }, arq)).toBe(`Vi que su página está en mantenimiento. ${pagina}`);
    }
    for (const arq of ["restaurantes-y-bares", "citas-y-servicios", "cobros-y-pagos"]) {
      expect(armarGancho({ web: caida, base: vacia }, arq)).toBe("Vi que su dirección web hoy no abre. Lo que le propongo no depende de ella.");
      expect(armarGancho({ web: mant, base: vacia }, arq)).toBe("Vi que su página está en mantenimiento. Lo que le propongo no depende de ella.");
    }
  });

  it("farmacias: ganchos propios (web caida, Instagram, catalogo en PDF), nunca el de tienda de ropa", () => {
    const caida = analizarWeb("", URL, "Casa Sol", "caida");
    expect(armarGancho({ web: caida, base: vacia }, "farmacias")).toBe(
      "Vi que su dirección web hoy no abre. El sistema trae su propia página, en su dominio, con existencia y precio por sede y el récipe por foto, dentro de lo que permite la norma.");
    const solo = hallazgosDeBase({ tipo: "", tamano: "", nota: "", instagram: "@farmaciasol", facebook: "", telefono: "", whatsapp: "" });
    const ig = armarGancho({ base: solo }, "farmacias");
    expect(ig).toContain("Instagram (@farmaciasol)");
    expect(ig).toContain("récipe");
    expect(ig).not.toContain("vende y cobra sola");
    expect(ig.length).toBeLessThanOrEqual(280);
    const pdf = analizarWeb(`<html><body><a href="catalogo.pdf">Catálogo</a> Casa Sol</body></html>`, URL, "Casa Sol", "viva");
    if (pdf.menuEnPdf) expect(armarGancho({ web: pdf, base: vacia }, "farmacias")).toContain("récipe");
  });

  it("comida por encargo: Instagram y pedidos por WhatsApp hablan de pedido confirmado, no de inventario", () => {
    const solo = hallazgosDeBase({ tipo: "", tamano: "", nota: "", instagram: "@kome.koko", facebook: "", telefono: "", whatsapp: "" });
    const ig = armarGancho({ base: solo }, "comida-por-encargo");
    expect(ig).toContain("Instagram (@kome.koko)");
    expect(ig).toContain("fecha de entrega");
    expect(ig).not.toMatch(/inventario|vende y cobra sola/);
    expect(ig.length).toBeLessThanOrEqual(280);
    const w = analizarWeb(`<html><body>Cocadas KomeKoKo. Haz tu pedido por <a href="https://wa.me/584120000000">WhatsApp</a></body></html>`, URL, "Cocadas KomeKoKo", "viva");
    if (w.pedidoPorWhatsApp) expect(armarGancho({ web: w, base: vacia }, "comida-por-encargo")).toContain("pedido confirmado solo");
  });

  it("Instagram en citas: version honesta, sin pagina que cobra sola", () => {
    const solo = hallazgosDeBase({ tipo: "", tamano: "", nota: "", instagram: "@spa", facebook: "", telefono: "", whatsapp: "" });
    expect(armarGancho({ base: solo }, "citas-y-servicios")).toBe(
      "Vi que atienden por Instagram (@spa) y la cita se pide por mensaje. Eso es lo primero que el diagnóstico mira: cómo se aparta la hora y cómo se cobra.");
    expect(armarGancho({ base: solo }, "comercio-y-tienda")).toContain("página propia que vende y cobra sola");
  });

  it("VERBOS_RESERVA con limites de palabra; solicitar informacion no es reserva", () => {
    const wa = (texto: string) => analizarWeb(`<title>Casa Sol</title><a href="https://wa.me/58412">${texto}</a>`, URL, "Casa Sol", "viva").reservaPorWhatsApp;
    expect(wa("Solicitar información")).toBe(false);
    expect(wa("Solicitar presupuesto")).toBe(false);
    expect(wa("Capacitación")).toBe(false);
    expect(wa("Reservas por WhatsApp")).toBe(true);
    expect(wa("Pide tu cita")).toBe(true);
  });
});

describe("estadoDeFicha: borrador solo con nombre que no coincide", () => {
  const ov = { id: "o1", direccion: "x", categoriaBase: "a", categoriaFina: "b" };
  const wb = analizarWeb("", URL, "Casa Sol", "red_social");
  it("Overture sin web es lista", () => {
    expect(estadoDeFicha({ overture: ov, base: vacia }, "")).toBe("lista");
  });
  it("red_social con nombre ok es lista", () => {
    expect(estadoDeFicha({ web: { ...wb, nombreCoincide: true }, base: vacia }, "")).toBe("lista");
  });
  it("viva con nombre que no coincide es borrador", () => {
    const w = { ...analizarWeb(fx("consultorio-wordpress.html"), URL, "Chino", "viva"), nombreCoincide: false };
    expect(estadoDeFicha({ web: w, base: vacia }, "")).toBe("borrador");
  });
  it("nada es sin_hallazgos", () => {
    expect(estadoDeFicha({ base: vacia }, "")).toBe("sin_hallazgos");
  });
});

describe("usuarioInstagramValido", () => {
  it("toma el usuario de web si el campo trae ruta reservada", () => {
    expect(usuarioInstagramValido("https://www.instagram.com/popular/", "https://www.instagram.com/viverocafejardin/", "Vivero Café Jardín")).toBe("viverocafejardin");
  });
  it("cuenta ajena da vacio", () => {
    expect(usuarioInstagramValido("https://instagram.com/bcodevenezuela/", "", "Restaurant Xin Du CA")).toBe("");
  });
  it("nombre aplastado con puntos", () => {
    expect(usuarioInstagramValido("https://instagram.com/kome.koko/", "", "KomeKoKo Cocadas")).toBe("kome.koko");
  });
  it("palabra compartida", () => {
    expect(usuarioInstagramValido("https://instagram.com/hotelwladimir/", "", "Hotel Wladimir")).toBe("hotelwladimir");
  });
  it("whatsapp reservado y web no instagram da vacio", () => {
    expect(usuarioInstagramValido("https://instagram.com/whatsapp/", "https://wa.me/584141234567", "Clínica Los Colorados")).toBe("");
  });
  it("sin usuario valido no hay gancho de Instagram", () => {
    const base = hallazgosDeBase({ tipo: "", tamano: "", nota: "", instagram: "https://instagram.com/popular/", facebook: "", telefono: "", whatsapp: "", web: "", nombre: "Clinica Sol" });
    expect(armarGancho({ base }, "citas-y-servicios")).toBe("");
    expect(armarGancho({ base }, "citas-y-servicios")).not.toContain("popular");
  });
});

describe("esWebRedSocial: twitter, x, telegram, beacons", () => {
  it("las reconoce", () => {
    for (const u of ["https://twitter.com/foo", "https://x.com/foo", "https://www.x.com/foo", "https://t.me/foo", "https://beacons.ai/foo"]) expect(esWebRedSocial(u)).toBe(true);
    expect(esWebRedSocial("https://box.com/foo")).toBe(false);
  });
});
