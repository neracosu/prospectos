import { describe, it, expect } from "vitest";
import {
  origenPermitido, esBot, normalizarEvento, normalizarSolicitud, rutaLimpia, clasificarOrigen, resumirWeb, respuestasLegibles, alturaBarra, rellenarDias,
  type EventoParaResumen,
} from "@/lib/web-contrato";

describe("origenPermitido", () => {
  it("acepta solo neracosu.com por https", () => {
    expect(origenPermitido("https://neracosu.com")).toBe("https://neracosu.com");
    expect(origenPermitido("https://www.neracosu.com")).toBe("https://www.neracosu.com");
    expect(origenPermitido("http://neracosu.com")).toBeNull();
    expect(origenPermitido("https://neracosu.com.evil.io")).toBeNull();
    expect(origenPermitido(null)).toBeNull();
  });
});

describe("esBot", () => {
  it("reconoce robots y navegadores sin cabeza", () => {
    expect(esBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(esBot("Mozilla/5.0 HeadlessChrome/120")).toBe(true);
    expect(esBot("facebookexternalhit/1.1")).toBe(true);
    expect(esBot("")).toBe(true);
    expect(esBot(null)).toBe(true);
  });
  it("deja pasar un telefono normal", () => {
    expect(esBot("Mozilla/5.0 (Linux; Android 13; SM-G780G) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36")).toBe(false);
  });
});

describe("rutaLimpia", () => {
  it("quita consulta y ancla y exige barra inicial", () => {
    expect(rutaLimpia("/para/hoteles.html?fbclid=xyz#precios")).toBe("/para/hoteles.html");
    expect(rutaLimpia("para/x")).toBeNull();
    expect(rutaLimpia(42)).toBeNull();
    expect(rutaLimpia("/" + "a".repeat(400))!.length).toBe(191);
  });
});

describe("normalizarEvento", () => {
  const base = { s: "abc123def456", t: "vista", r: "/", o: "www.google.com", m: true };
  it("acepta una vista y guarda el dominio de origen", () => {
    expect(normalizarEvento(base)).toEqual({ sesion: "abc123def456", tipo: "vista", ruta: "/", detalle: "", origen: "www.google.com", movil: true });
  });
  it("rechaza sesion mal formada, tipo desconocido o ruta invalida", () => {
    expect(normalizarEvento({ ...base, s: "x" })).toBeNull();
    expect(normalizarEvento({ ...base, s: "abc123def456'; drop" })).toBeNull();
    expect(normalizarEvento({ ...base, t: "compra" })).toBeNull();
    expect(normalizarEvento({ ...base, r: "http://otro" })).toBeNull();
    expect(normalizarEvento(null)).toBeNull();
    expect(normalizarEvento("hola")).toBeNull();
  });
  it("un clic solo vale con un destino conocido; una seccion solo con un id conocido", () => {
    expect(normalizarEvento({ ...base, t: "clic", d: "whatsapp" })?.detalle).toBe("whatsapp");
    expect(normalizarEvento({ ...base, t: "clic", d: "cualquiera" })).toBeNull();
    expect(normalizarEvento({ ...base, t: "seccion", d: "contacto" })?.detalle).toBe("contacto");
    expect(normalizarEvento({ ...base, t: "seccion", d: "<script>" })).toBeNull();
  });
  it("el origen solo se guarda en la vista y se recorta", () => {
    expect(normalizarEvento({ ...base, t: "clic", d: "para" })?.origen).toBe("");
    expect(normalizarEvento({ ...base, o: "x".repeat(300) })?.origen.length).toBe(120);
    expect(normalizarEvento({ ...base, o: "a b<c>" })?.origen).toBe("abc");
  });
});

describe("normalizarSolicitud", () => {
  const ok = { nombre: "Ana Pérez", email: "ana@hotel.com", phone: "+58 412 1234567", type: "Software a Medida", budget: "No estoy seguro", message: "Necesito un sistema para mi hotel", pagina: "/" };
  it("acepta una solicitud completa y limpia espacios", () => {
    const r = normalizarSolicitud({ ...ok, nombre: "  Ana Pérez  " });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.datos).toMatchObject({ nombre: "Ana Pérez", correo: "ana@hotel.com", whatsapp: "+58 412 1234567", tipo: "Software a Medida", pagina: "/" });
  });
  it("basta con correo o con WhatsApp, pero uno de los dos", () => {
    expect(normalizarSolicitud({ ...ok, email: "" }).ok).toBe(true);
    expect(normalizarSolicitud({ ...ok, phone: "" }).ok).toBe(true);
    const r = normalizarSolicitud({ ...ok, email: "", phone: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensaje).toMatch(/correo o su WhatsApp/);
  });
  it("rechaza correo mal escrito, nombre o mensaje vacios", () => {
    expect(normalizarSolicitud({ ...ok, email: "ana@" }).ok).toBe(false);
    expect(normalizarSolicitud({ ...ok, nombre: " " }).ok).toBe(false);
    expect(normalizarSolicitud({ ...ok, message: "" }).ok).toBe(false);
    expect(normalizarSolicitud({ ...ok, type: "" }).ok).toBe(false);
  });
  it("el campo trampa lleno se marca como robot", () => {
    const r = normalizarSolicitud({ ...ok, sitio: "http://spam" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.robot).toBe(true);
  });
  it("un correo con salto de linea no pasa (seria inyeccion de cabeceras)", () => {
    expect(normalizarSolicitud({ ...ok, email: "a@b.com\nBcc: x@y.com" }).ok).toBe(false);
  });
});

describe("clasificarOrigen", () => {
  it("agrupa dominios en nombres que se entienden", () => {
    expect(clasificarOrigen("www.google.com")).toBe("Google");
    expect(clasificarOrigen("www.google.com.hk")).toBe("Google");
    expect(clasificarOrigen("lm.facebook.com")).toBe("Facebook");
    expect(clasificarOrigen("fb")).toBe("Facebook");
    expect(clasificarOrigen("l.instagram.com")).toBe("Instagram");
    expect(clasificarOrigen("ig")).toBe("Instagram");
    expect(clasificarOrigen("")).toBe("Directo o desde una app");
    expect(clasificarOrigen("papelcebolla.app")).toBe("papelcebolla.app");
  });
});

describe("resumirWeb", () => {
  const t = (iso: string) => new Date(iso);
  const ev = (sesion: string, tipo: string, ruta: string, detalle = "", origen = "", movil = false, cuando = "2026-10-20T15:00:00Z"): EventoParaResumen =>
    ({ sesion, tipo, ruta, detalle, origen, movil, creadoEn: t(cuando) });
  const eventos = [
    ev("a", "vista", "/", "", "lm.facebook.com", true),
    ev("a", "seccion", "/", "industrias"),
    ev("a", "seccion", "/", "contacto"),
    ev("a", "clic", "/", "whatsapp"),
    ev("b", "vista", "/", "", ""),
    ev("c", "vista", "/atalaya/", "", "lm.facebook.com", false, "2026-10-21T02:00:00Z"), // 20-oct en Caracas
    ev("d", "vista", "/", "", "www.google.com", true, "2026-10-21T15:00:00Z"),
    ev("d", "seccion", "/", "industrias", "", false, "2026-10-21T15:01:00Z"),
    ev("d", "vista", "/para/hoteles.html", "", "", false, "2026-10-21T15:02:00Z"),
    ev("d", "vista", "/calculadora.html", "", "", false, "2026-10-21T15:03:00Z"),
    ev("d", "vista", "/calculadora.html", "", "", false, "2026-10-21T15:04:00Z"),
  ];
  const r = resumirWeb(eventos, 1);

  it("cuenta personas, telefonos y vistas", () => {
    expect(r.personas).toBe(4);
    expect(r.moviles).toBe(2);
    expect(r.vistas).toBe(7);
  });
  it("cuenta como «se fue sin hacer nada» a quien vio una pagina y no toco nada", () => {
    expect(r.seFueron).toBe(2); // b y c
  });
  it("el origen sale de la primera vista de cada persona", () => {
    expect(r.origenes).toEqual([{ nombre: "Facebook", personas: 2 }, { nombre: "Directo o desde una app", personas: 1 }, { nombre: "Google", personas: 1 }]);
  });
  it("paginas por personas, no por recargas", () => {
    expect(r.paginas[0]).toEqual({ ruta: "/", personas: 3 });
    expect(r.paginas.find((p) => p.ruta === "/calculadora.html")?.personas).toBe(1);
  });
  it("el embudo va de la entrada a la solicitud", () => {
    expect(r.embudo.map((p) => p.personas)).toEqual([4, 1, 1, 1, 1]);
  });
  it("la home dice hasta donde bajan, sobre quienes la vieron", () => {
    expect(r.home.personas).toBe(3);
    expect(r.home.secciones.find((s) => s.id === "industrias")?.personas).toBe(2);
    expect(r.home.secciones.find((s) => s.id === "contacto")?.personas).toBe(1);
    expect(r.home.secciones.find((s) => s.id === "faq")?.personas).toBe(0);
  });
  it("las personas por dia van con el dia de Caracas", () => {
    expect(r.porDia).toEqual([{ dia: "2026-10-20", personas: 3 }, { dia: "2026-10-21", personas: 1 }]);
  });
  it("sin eventos no divide entre cero", () => {
    const v = resumirWeb([], 0);
    expect(v.personas).toBe(0);
    expect(v.home.secciones.every((s) => s.personas === 0)).toBe(true);
  });
});

describe("embudo /empezar", () => {
  it("normalizarEvento acepta paso con un detalle conocido y descarta p9", () => {
    expect(normalizarEvento({ s: "sesion12345", t: "paso", r: "/empezar.html", d: "p1" })).toMatchObject({ tipo: "paso", detalle: "p1" });
    expect(normalizarEvento({ s: "sesion12345", t: "paso", r: "/empezar.html", d: "p9" })).toBeNull();
  });
  it("una solicitud de embudo guarda respuestas, calificacion y origen", () => {
    const r = normalizarSolicitud({ nombre: "Ana", phone: "04121234567", type: "embudo", message: "", respuestas: { rubro: "hoteles", actual: "manual", objetivo: "cobros", tamano: "1", sistema: "hoteles", extra: "x" }, calificacion: "demo", origen: "TikTok" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(JSON.parse(r.datos.respuestas)).toEqual({ rubro: "hoteles", actual: "manual", objetivo: "cobros", tamano: "1", sistema: "hoteles" });
      expect(r.datos.calificacion).toBe("demo");
      expect(r.datos.origen).toBe("tiktok");
      expect(r.datos.mensaje.length).toBeGreaterThanOrEqual(5);
    }
  });
  it("sin campos nuevos (la home de hoy) sigue pasando con cadenas vacias", () => {
    const r = normalizarSolicitud({ nombre: "Ana Pérez", email: "ana@hotel.com", type: "Software a Medida", message: "Necesito un sistema" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.datos).toMatchObject({ respuestas: "", calificacion: "", origen: "" });
  });
  it("respuestas raras no rompen: se recortan y una calificacion desconocida queda vacia", () => {
    const r = normalizarSolicitud({ nombre: "Ana", phone: "04121234567", type: "embudo", respuestas: { rubro: "x".repeat(500), tamano: 7 }, calificacion: "vip" });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.datos.respuestas.length).toBeLessThanOrEqual(400); expect(r.datos.calificacion).toBe(""); }
  });
  it("un valor que no es primitivo (objeto con toString, arreglo) no revienta: se ignora", () => {
    const r = normalizarSolicitud({ nombre: "Ana", phone: "04121234567", type: "embudo", respuestas: { rubro: { toString: 1 }, actual: ["a"], objetivo: "cobros", tamano: 1, sistema: true } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(JSON.parse(r.datos.respuestas)).toEqual({ objetivo: "cobros", tamano: "1", sistema: "true" });
  });
  it("respuestasLegibles traduce y tolera JSON roto", () => {
    expect(respuestasLegibles('{"rubro":"hoteles","tamano":"1"}')).toEqual([{ clave: "Rubro", valor: "hoteles" }, { clave: "Tamaño", valor: "1" }]);
    expect(respuestasLegibles("{no es json")).toEqual([]);
    expect(respuestasLegibles("")).toEqual([]);
  });
  it("resumirWeb arma el embudo de /empezar por paso y por origen", () => {
    const t = new Date("2026-10-28T12:00:00Z");
    const ev = (sesion: string, tipo: string, detalle = "", origen = "", ruta = "/empezar.html"): EventoParaResumen => ({ sesion, tipo, ruta, detalle, origen, movil: true, creadoEn: t });
    const r = resumirWeb([
      ev("aaaaaaaa", "vista", "", "tiktok"), ev("aaaaaaaa", "paso", "p1"), ev("aaaaaaaa", "paso", "p4"), ev("aaaaaaaa", "paso", "enviado"),
      ev("bbbbbbbb", "vista", "", "tiktok", "/empezar"), ev("bbbbbbbb", "paso", "p1"),
      ev("cccccccc", "vista", "", "", "/"),
    ], 1);
    expect(r.empezar.personas).toBe(2);
    expect(r.empezar.pasos.find((p) => p.id === "p1")?.personas).toBe(2);
    expect(r.empezar.pasos.find((p) => p.id === "enviado")?.personas).toBe(1);
    expect(r.empezar.origenes).toEqual([{ nombre: "TikTok", personas: 2, enviaron: 1 }]);
  });
});

describe("alturaBarra (personas por dia en barras, fase 3)", () => {
  it("es el porcentaje entero respecto al maximo y 0 cuando no hay maximo", () => {
    expect(alturaBarra(5, 10)).toBe(50);
    expect(alturaBarra(3, 0)).toBe(0);
    expect(alturaBarra(7, 7)).toBe(100);
    expect(alturaBarra(1, 3)).toBe(33);
  });
});

describe("rellenarDias (los dias sin visitas tambien se dibujan)", () => {
  it("devuelve un dia por cada fecha del rango, con 0 donde no hubo nadie, en orden", () => {
    const r = rellenarDias([{ dia: "2026-10-03", personas: 2 }, { dia: "2026-10-01", personas: 5 }], "2026-10-01", "2026-10-04");
    expect(r).toEqual([{ dia: "2026-10-01", personas: 5 }, { dia: "2026-10-02", personas: 0 }, { dia: "2026-10-03", personas: 2 }, { dia: "2026-10-04", personas: 0 }]);
  });
  it("un rango de un dia devuelve un dia", () => expect(rellenarDias([], "2026-10-04", "2026-10-04")).toEqual([{ dia: "2026-10-04", personas: 0 }]));
});
