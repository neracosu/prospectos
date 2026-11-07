import { describe, it, expect } from "vitest";
import {
  parsearLinea, clasificarUa, resumirAparato, visitanteDe, huellaDe, rutaPagina, esPdf, descomponerUrl, enlaceQueCoincide, PATRON_P, etiquetaScript,
  armarLineaTiempo, textoLugar, resumirEnlace, textoResumenEnlace, resumenTarjeta, haceCuanto, type VisitaFila, normalizarEventoJs,
  esIpDeMeta,
} from "@/lib/rastro-contrato";

const L = (ip: string, fecha: string, req: string, estado: number, ref: string, ua: string) => `${ip} - - [${fecha}] "${req}" ${estado} 1234 "${ref}" "${ua}"`;
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.3 Mobile/15E148 Safari/604.1";
const IPHONE_APP = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36";

describe("parsearLinea", () => {
  it("lee una linea combined y respeta el desfase horario", () => {
    const l = parsearLinea(L("203.0.113.5", "06/Nov/2026:09:08:32 -0800", "GET /factura/ HTTP/1.1", 200, "-", IPHONE))!;
    expect(l.ip).toBe("203.0.113.5"); expect(l.ruta).toBe("/factura/"); expect(l.estado).toBe(200); expect(l.referer).toBe("");
    expect(l.fecha.toISOString()).toBe("2026-11-06T17:08:32.000Z");
  });
  it("tolera comillas escapadas en el UA y devuelve null en una linea rota", () => {
    expect(parsearLinea(L("203.0.113.5", "06/Nov/2026:09:08:32 -0800", "GET / HTTP/1.1", 200, "-", 'Raro \\"X\\" Safari'))?.ua).toContain('"X"');
    expect(parsearLinea('203.0.113.5 - - [06/Nov/2026:09:08:32 -0800] "GET /fact')).toBeNull();
    expect(parsearLinea("")).toBeNull();
  });
});
describe("parsearLinea, casos de borde", () => {
  it("peticion sin ruta devuelve null", () => {
    expect(parsearLinea(L("203.0.113.5", "06/Nov/2026:09:08:32 -0800", "-", 408, "-", IPHONE))).toBeNull();
  });
  it("acepta IPv6 y peticion sin protocolo", () => {
    expect(parsearLinea(L("2001:db8::5", "06/Nov/2026:09:08:32 -0800", "GET /x HTTP/1.1", 200, "-", IPHONE))?.ip).toBe("2001:db8::5");
    expect(parsearLinea(L("203.0.113.5", "06/Nov/2026:09:08:32 -0800", "GET /x", 200, "-", IPHONE))?.ruta).toBe("/x");
  });
});
describe("clasificarUa, limites de palabra", () => {
  it("curly y previewer no son robot ni reenvio", () => {
    expect(clasificarUa(WIN + " Curly").clase).toBe("visita");
    expect(clasificarUa(WIN + " previewer").clase).toBe("visita");
    expect(clasificarUa("curl/7.81.0").clase).toBe("robot");
    expect(clasificarUa("Algo preview de enlaces")).toEqual({ clase: "reenvio", app: "otro" });
  });
});
describe("clasificarUa", () => {
  it("reenvio por app", () => {
    expect(clasificarUa("WhatsApp/2.23.20.0")).toEqual({ clase: "reenvio", app: "whatsapp" });
    expect(clasificarUa("facebookexternalhit/1.1")).toEqual({ clase: "reenvio", app: "facebook" });
    expect(clasificarUa("TelegramBot (like TwitterBot)")).toEqual({ clase: "reenvio", app: "telegram" });
  });
  it("instagram solo es reenvio con externalhit", () => {
    expect(clasificarUa("Mozilla/5.0 instagram externalhit/1.1")).toEqual({ clase: "reenvio", app: "instagram" });
    expect(clasificarUa(IPHONE + " Instagram 300.0")).toMatchObject({ clase: "visita", enApp: true });
  });
  it("robots y herramientas", () => {
    for (const ua of ["Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/151.0", "curl/7.81.0", "Mozilla/5.0 (compatible; Atalaya-monitor; favicon)", "Mozilla/5.0 AppleWebKit/537.36 (compatible; ClaudeBot/1.0)", ""]) expect(clasificarUa(ua).clase).toBe("robot");
  });
  it("visitas, con y sin app", () => {
    expect(clasificarUa(IPHONE)).toEqual({ clase: "visita", aparato: "iPhone · iOS 18.7 · Safari", enApp: false });
    expect(clasificarUa(IPHONE_APP)).toMatchObject({ clase: "visita", enApp: true });
    expect(resumirAparato(IPHONE_APP)).toBe("iPhone · iOS 18.7 · en una app");
    expect(resumirAparato(WIN)).toBe("Windows · Chrome 156");
  });
});
describe("visitante y huella", () => {
  it("son estables, de 16 hex, y cambian con el UA", () => {
    expect(visitanteDe("203.0.113.5", IPHONE)).toMatch(/^[0-9a-f]{16}$/);
    expect(visitanteDe("203.0.113.5", IPHONE)).toBe(visitanteDe("203.0.113.5", IPHONE));
    expect(visitanteDe("203.0.113.5", IPHONE)).not.toBe(visitanteDe("203.0.113.5", WIN));
    expect(huellaDe("a")).not.toBe(huellaDe("b"));
  });
});
describe("rutas y prefijos", () => {
  it("rutaPagina normaliza y descarta assets", () => {
    expect(rutaPagina("/demo/panel/index.html?x=1#y")).toBe("/demo/panel/");
    expect(rutaPagina("/factura")).toBe("/factura");
    expect(rutaPagina("/demo/panel.css")).toBeNull(); expect(rutaPagina("/favicon.ico")).toBeNull(); expect(rutaPagina("/assets/t.json")).toBeNull();
    expect(esPdf("/propuesta/x-1/Propuesta.pdf?e=abc")).toBe(true);
  });
  it("descomponerUrl y enlaceQueCoincide eligen el prefijo mas largo", () => {
    expect(descomponerUrl("https://demo-ejemplo.neracosu.com/demo/panel/index.html?x")).toEqual({ host: "demo-ejemplo.neracosu.com", prefijo: "/demo/panel/" });
    expect(descomponerUrl("https://neracosu.com/propuesta/x-1/")).toEqual({ host: "neracosu.com", prefijo: "/propuesta/x-1/" });
    expect(descomponerUrl("https://otro.com/a/")).toBeNull();
    const es = [{ prefijo: "/demo/" }, { prefijo: "/demo/panel/" }];
    expect(enlaceQueCoincide("/demo/panel/", es)).toBe(es[1]); expect(enlaceQueCoincide("/demo/factura/", es)).toBe(es[0]); expect(enlaceQueCoincide("/otra/", es)).toBeNull();
  });
  it("descomponerUrl: URL limpia sin barra final es su propia carpeta; con extension se recorta", () => {
    expect(descomponerUrl("https://neracosu.com/propuesta/x-1")).toEqual({ host: "neracosu.com", prefijo: "/propuesta/x-1/" });
    expect(descomponerUrl("https://neracosu.com/propuesta/x-1/")).toEqual({ host: "neracosu.com", prefijo: "/propuesta/x-1/" });
    expect(descomponerUrl("https://neracosu.com/propuesta/x-1/index.html")).toEqual({ host: "neracosu.com", prefijo: "/propuesta/x-1/" });
    expect(descomponerUrl("https://neracosu.com/factura")).toEqual({ host: "neracosu.com", prefijo: "/factura/" });
    expect(descomponerUrl("https://neracosu.com/propuesta/x-1/cotizacion.pdf")).toEqual({ host: "neracosu.com", prefijo: "/propuesta/x-1/" });
    expect(descomponerUrl("https://neracosu.com/hoja.pdf")).toEqual({ host: "neracosu.com", prefijo: "/" });
  });
  it("descomponerUrl: .html/.htm es la pagina misma (sin extension y con barra); index.html sigue siendo la carpeta", () => {
    expect(descomponerUrl("https://neracosu.com/propuesta/x-1.html")).toEqual({ host: "neracosu.com", prefijo: "/propuesta/x-1/" });
    expect(descomponerUrl("https://neracosu.com/propuesta/x-1.HTM")).toEqual({ host: "neracosu.com", prefijo: "/propuesta/x-1/" });
    expect(descomponerUrl("https://neracosu.com/propuesta/x-1/index.html")).toEqual({ host: "neracosu.com", prefijo: "/propuesta/x-1/" });
  });
  it("descomponerUrl: la raiz de un subdominio es de neracosu.com con prefijo /", () => {
    expect(descomponerUrl("https://sub.neracosu.com")).toEqual({ host: "sub.neracosu.com", prefijo: "/" });
    expect(descomponerUrl("https://neracosu.com/")).toEqual({ host: "neracosu.com", prefijo: "/" });
    expect(descomponerUrl("https://neracosu.com/index.html")).toEqual({ host: "neracosu.com", prefijo: "/" });
    expect(descomponerUrl("https://otro.com/")).toBeNull();
  });
  it("enlaceQueCoincide: la ruta sin barra final coincide con su carpeta, pero no con otra que empiece igual", () => {
    const es = [{ prefijo: "/factura/" }];
    expect(enlaceQueCoincide("/factura", es)).toBe(es[0]);
    expect(enlaceQueCoincide("/facturas", es)).toBeNull();
    expect(enlaceQueCoincide("/propuesta/", [{ prefijo: "/propuesta/x-1/" }])).toBeNull();
  });
  it("PATRON_P y etiquetaScript", () => {
    expect("/p/AAAAAAAAAAAAAAAAAAAAAA".match(PATRON_P)?.[1]).toBe("A".repeat(22));
    expect("/p/AAAAAAAAAAAAAAAAAAAAAA/pdf".match(PATRON_P)?.[2]).toBe("/pdf");
    expect(etiquetaScript("t".repeat(22))).toBe(`<script src="https://prospectos.neracosu.com/rastro.js?v=1" data-enlace="${"t".repeat(22)}" defer></script>`);
  });
});

const t = (s: string) => new Date(`2026-11-06T${s}:00.000-04:00`);
const base = (x: Partial<VisitaFila>): VisitaFila => ({ id: 1, enlaceId: 1, etiqueta: "Demo · factura", fuente: "log", tipo: "vista", visitante: "v1", aparato: "iPhone · iOS 18 · Safari", pais: "Venezuela", ciudad: "Caracas", red: "", geoPendiente: false, ruta: "/factura/", detalle: "", origen: "", segundos: null, scroll: null, propia: false, ocurrioEn: t("13:08"), ...x });
describe("armarLineaTiempo", () => {
  it("funde log+js, pone duracion, cuenta vuelta y reenvio, numera visitantes", () => {
    const lt = armarLineaTiempo([
      base({ id: 1 }), base({ id: 2, fuente: "js", tipo: "inicio", origen: "instagram.com", ocurrioEn: t("13:08") }),
      base({ id: 3, fuente: "js", tipo: "fin", segundos: 130, scroll: 90, ocurrioEn: t("13:10") }),
      base({ id: 4, fuente: "js", tipo: "clic", detalle: "pdf", ocurrioEn: t("13:09") }),
      base({ id: 5, tipo: "reenvio", detalle: "whatsapp", ocurrioEn: t("13:11") }), base({ id: 6, tipo: "reenvio", detalle: "whatsapp", ocurrioEn: t("13:11") }),
      base({ id: 7, visitante: "v2", aparato: "iPhone · iOS 18.7 · Safari", red: "vpn", ocurrioEn: t("13:28") }),
      base({ id: 8, ocurrioEn: t("13:29") }),
      base({ id: 9, visitante: "neri", propia: true, ocurrioEn: t("11:45") }),
    ]);
    expect(lt.visitantes.map((v) => [v.numero, v.visitante])).toEqual([[1, "v1"], [2, "v2"]]);
    expect(lt.visitantes[1].lugar).toBe("desde una VPN");
    const f = lt.dias[0].filas; expect(lt.dias[0].dia).toBe("2026-11-06");
    expect(f.map((a) => a.clase)).toEqual(["vuelta", "apertura", "reenvio", "apertura"]);   // 13:29 v1, 13:28 v2, 13:11, 13:08
    const primera = f[3]; expect(primera.segundos).toBe(130); expect(primera.scroll).toBe(90); expect(primera.origen).toBe("instagram.com"); expect(primera.clics).toEqual(["pdf"]);
    expect(armarLineaTiempo([base({ id: 9, visitante: "neri", propia: true })], { conPropias: true }).dias[0].filas).toHaveLength(1);
  });
});
describe("resumenes", () => {
  it("enlace y tarjeta", () => {
    const vs = [base({ id: 1 }), base({ id: 2, tipo: "reenvio", detalle: "whatsapp", ocurrioEn: t("13:11") }), base({ id: 3, visitante: "v2", ocurrioEn: t("13:28") }), base({ id: 4, tipo: "pdf", ocurrioEn: t("13:30") }), base({ id: 5, propia: true, visitante: "n" })];
    expect(textoResumenEnlace(resumirEnlace(vs, 1))).toBe("2 visitantes · 2 aperturas · reenviado 1 vez · PDF bajado 1 vez");
    expect(textoResumenEnlace(resumirEnlace([], 1))).toBe("Sin abrir");
    const ahora = t("15:28");
    expect(resumenTarjeta({ etiqueta: "Propuesta", enviadoEn: t("12:00"), ultimaApertura: t("13:28"), visitantes: 3, reenvio: true }, ahora)).toBe("Vio la propuesta hace 2 h · la reenvió · 3 personas");
    expect(resumenTarjeta({ etiqueta: "Demo · factura", enviadoEn: new Date("2026-11-05T15:00:00-04:00"), ultimaApertura: null, visitantes: 0, reenvio: false }, ahora)).toBe("Sin abrir · enviada hace 1 d");
    expect(haceCuanto(t("15:23"), ahora)).toBe("hace 5 min");
  });
  it("textoLugar", () => {
    expect(textoLugar({ pais: "Venezuela", ciudad: "Caracas", red: "", geoPendiente: false })).toBe("Venezuela, Caracas");
    expect(textoLugar({ pais: "", ciudad: "", red: "", geoPendiente: true })).toBe("ubicación: en unos minutos");
    expect(textoLugar({ pais: "", ciudad: "", red: "", geoPendiente: false })).toBe("ubicación desconocida");
  });
});

describe("armarLineaTiempo: bordes de la fusion", () => {
  it("un fin sin apertura no lanza ni crea fila", () => {
    const lt = armarLineaTiempo([base({ fuente: "js", tipo: "fin", segundos: 5, scroll: 10 })]);
    expect(lt.dias).toEqual([]);
  });
  it("un clic despues de una vuelta va a la vuelta", () => {
    const f = armarLineaTiempo([
      base({ id: 1, ocurrioEn: t("13:00") }), base({ id: 2, ocurrioEn: t("13:30") }),
      base({ id: 3, fuente: "js", tipo: "clic", detalle: "pdf", ocurrioEn: t("13:31") }),
    ]).dias[0].filas;
    expect(f.map((a) => [a.clase, a.clics])).toEqual([["vuelta", ["pdf"]], ["apertura", []]]);
  });
  it("un inicio solo es una apertura", () => {
    const f = armarLineaTiempo([base({ fuente: "js", tipo: "inicio", origen: "instagram.com" })]).dias[0].filas;
    expect(f.map((a) => a.clase)).toEqual(["apertura"]);
    expect(f[0].origen).toBe("instagram.com");
  });
  it("un clic sin apertura es su propia fila", () => {
    const f = armarLineaTiempo([base({ fuente: "js", tipo: "clic", detalle: "whatsapp" })]).dias[0].filas;
    expect(f.map((a) => a.clase)).toEqual(["clic"]);
    expect(f[0].detalle).toBe("whatsapp");
  });
  it("cruzar la medianoche de Caracas da dos dias, el mas reciente primero", () => {
    const dias = armarLineaTiempo([
      base({ id: 1, ocurrioEn: new Date("2026-11-05T23:30:00.000-04:00") }),
      base({ id: 2, visitante: "v2", ocurrioEn: new Date("2026-11-06T00:30:00.000-04:00") }),
    ]).dias;
    expect(dias.map((d) => [d.dia, d.filas.length])).toEqual([["2026-11-06", 1], ["2026-11-05", 1]]);
  });
});
describe("haceCuanto y textos: limites", () => {
  const ahora = new Date("2026-11-20T12:00:00.000Z");
  const hace = (s: number) => haceCuanto(new Date(ahora.getTime() - s * 1000), ahora);
  it("fronteras", () => {
    expect(hace(59)).toBe("hace un momento");
    expect(hace(60)).toBe("hace 1 min");
    expect(hace(3599)).toBe("hace 59 min");
    expect(hace(3600)).toBe("hace 1 h");
    expect(hace(86400)).toBe("hace 1 d");
    expect(hace(7 * 86400)).toBe("hace 1 sem");
  });
  it("textoLugar con solo pais o con red", () => {
    expect(textoLugar({ pais: "Venezuela", ciudad: "", red: "", geoPendiente: false })).toBe("Venezuela");
    expect(textoLugar({ pais: "Venezuela", ciudad: "Caracas", red: "vpn", geoPendiente: false })).toBe("desde una VPN");
  });
  it("resumenTarjeta de demo y de una sola persona", () => {
    const s = resumenTarjeta({ etiqueta: "Demo · factura", enviadoEn: t("12:00"), ultimaApertura: t("13:28"), visitantes: 1, reenvio: false }, t("15:28"));
    expect(s).toBe("Vio la demo hace 2 h");
    expect(s).not.toContain("personas");
  });
});

describe("normalizarEventoJs", () => {
  const T = "A".repeat(22);
  it("acepta un evento valido y normaliza ruta, origen, segundos y scroll", () => {
    expect(normalizarEventoJs({ token: T, tipo: "fin", ruta: "/factura/index.html?x=1#y", origen: "https://l.instagram.com/", segundos: 42.6, scroll: 130, detalle: "" }))
      .toEqual({ token: T, tipo: "fin", ruta: "/factura/", origen: "https://l.instagram.com/", segundos: 43, scroll: 100, detalle: "" });
    expect(normalizarEventoJs({ token: T, tipo: "clic", ruta: "/x/", origen: "o".repeat(300), segundos: -5, scroll: "mucho", detalle: "boton-whatsapp" }))
      .toEqual({ token: T, tipo: "clic", ruta: "/x/", origen: "o".repeat(120), segundos: 0, scroll: null, detalle: "boton-whatsapp" });
    expect(normalizarEventoJs({ token: T, tipo: "inicio", ruta: "/", segundos: 999999 })?.segundos).toBe(86400);
  });
  it("rechaza token, tipo, ruta o detalle invalidos", () => {
    expect(normalizarEventoJs(null)).toBeNull();
    expect(normalizarEventoJs("x")).toBeNull();
    expect(normalizarEventoJs({ token: "corto", tipo: "inicio", ruta: "/" })).toBeNull();
    expect(normalizarEventoJs({ token: T, tipo: "vista", ruta: "/" })).toBeNull();
    expect(normalizarEventoJs({ token: T, tipo: "inicio", ruta: "/app.js" })).toBeNull();
    expect(normalizarEventoJs({ token: T, tipo: "inicio", ruta: "sin-barra" })).toBeNull();
    expect(normalizarEventoJs({ token: T, tipo: "clic", ruta: "/", detalle: "Con Mayuscula" })).toBeNull();
    expect(normalizarEventoJs({ token: T, tipo: "clic", ruta: "/" })).toBeNull();
    expect(normalizarEventoJs({ token: T, tipo: "inicio", ruta: "/", detalle: "<script>" })?.detalle).toBe("");
  });
});

describe("esIpDeMeta", () => {
  it("reconoce los rangos de Meta en IPv4 e IPv6", () => {
    expect(esIpDeMeta("173.252.95.5")).toBe(true);
    expect(esIpDeMeta("57.141.16.113")).toBe(true);
    expect(esIpDeMeta("2a03:2880:f12f::1")).toBe(true);
    expect(esIpDeMeta("2A03:2880:F12F::1")).toBe(true);
    expect(esIpDeMeta("31.13.31.255")).toBe(true);
    expect(esIpDeMeta("31.13.32.0")).toBe(false);
  });
  it("lo demas no es de Meta", () => {
    for (const ip of ["203.0.113.5", "198.51.100.7", "2001:db8::5", "2a03:2881::1", "", "desconocida", "999.1.1.1", "57.141"]) expect(esIpDeMeta(ip)).toBe(false);
  });
});

describe("armarLineaTiempo: el envio propio", () => {
  const reenvio = (x: Partial<VisitaFila>) => base({ tipo: "reenvio", detalle: "facebook", visitante: "app-facebook", aparato: "", ...x });
  it("un reenvio anterior a la primera apertura es el envio; uno posterior sigue siendo reenvio", () => {
    const vs = [reenvio({ id: 1, ocurrioEn: t("13:31") }), base({ id: 2, ocurrioEn: t("13:40") }), reenvio({ id: 3, ocurrioEn: t("14:00") })];
    const lt = armarLineaTiempo(vs);
    expect(lt.dias[0].filas.map((f) => f.clase)).toEqual(["reenvio", "apertura", "envio"]);
    expect(lt.visitantes.map((v) => v.visitante)).toEqual(["v1", "app-facebook"]);
    expect(resumirEnlace(vs, 1)).toEqual({ visitantes: 1, aperturas: 1, reenvios: 1, pdfs: 0 });
  });
  it("sin ninguna apertura del enlace, el reenvio es el envio y no crea visitante", () => {
    const vs = [reenvio({ id: 1, ocurrioEn: t("13:31") })];
    const lt = armarLineaTiempo(vs);
    expect(lt.dias[0].filas.map((f) => f.clase)).toEqual(["envio"]);
    expect(lt.visitantes).toEqual([]);
    expect(textoResumenEnlace(resumirEnlace(vs, 1))).toBe("Sin abrir");
  });
  it("la rafaga de envio se funde en una fila", () => {
    const vs = [reenvio({ id: 1, ocurrioEn: t("13:31") }), reenvio({ id: 2, ocurrioEn: t("13:31") }), reenvio({ id: 3, ocurrioEn: t("13:32") })];
    expect(armarLineaTiempo(vs).dias[0].filas.map((f) => f.clase)).toEqual(["envio"]);
  });
  it("la primera apertura es por enlace y no cuenta las propias, ni con conPropias", () => {
    const vs = [
      base({ id: 1, visitante: "neri", propia: true, ocurrioEn: t("13:00") }),
      base({ id: 2, enlaceId: 2, ocurrioEn: t("13:10") }),
      reenvio({ id: 3, ocurrioEn: t("13:31") }),
    ];
    for (const conPropias of [false, true]) {
      const filas = armarLineaTiempo(vs, { conPropias }).dias[0].filas;
      expect(filas.find((f) => f.enlaceId === 1 && f.ocurrioEn.getTime() === t("13:31").getTime())?.clase).toBe("envio");
    }
  });
  it("un reenvio propio no se vuelve envio", () => {
    const f = armarLineaTiempo([reenvio({ id: 1, propia: true })], { conPropias: true }).dias[0].filas;
    expect(f.map((a) => a.clase)).toEqual(["reenvio"]);
  });
});

describe("armarLineaTiempo: vistas de los rastreadores de Meta (14b)", () => {
  const t2 = (s: string) => new Date(`2026-11-06T${s}.000-04:00`);
  const rafaga = [0, 1, 2].map((i) => base({ id: 100 + i, tipo: "reenvio", detalle: "facebook", visitante: "app-facebook", aparato: "", ocurrioEn: t2(`13:31:0${i}`) }));
  const aws = (i: number, hora: string) => base({ id: 200 + i, visitante: `aws${i}`, aparato: "Android · Chrome 141", ocurrioEn: t2(hora) });
  it("vistas Android sin js junto a la rafaga de facebook son parte del envio", () => {
    const vs = [...rafaga, aws(1, "13:31:10"), aws(2, "13:31:40"), aws(3, "13:32:20")];
    const lt = armarLineaTiempo(vs);
    expect(lt.visitantes).toEqual([]);
    expect(lt.dias[0].filas.every((f) => f.clase === "envio")).toBe(true);
    expect(resumirEnlace(vs, 1)).toEqual({ visitantes: 0, aperturas: 0, reenvios: 0, pdfs: 0 });
  });
  it("la misma vista con un inicio js 5 s despues es una apertura real", () => {
    const vs = [...rafaga, aws(1, "13:31:10"), base({ id: 300, visitante: "aws1", fuente: "js", tipo: "inicio", ocurrioEn: t2("13:31:15") })];
    const lt = armarLineaTiempo(vs);
    expect(lt.visitantes.map((v) => v.visitante)).toEqual(["aws1"]);
    expect(lt.dias[0].filas.map((f) => f.clase)).toEqual(["apertura", "envio"]);
  });
  it("una vista previa propia no absorbe la vista de otro", () => {
    const propias = rafaga.map((r) => ({ ...r, propia: true }));
    expect(resumirEnlace([...propias, aws(1, "13:31:10")], 1)).toEqual({ visitantes: 1, aperturas: 1, reenvios: 0, pdfs: 0 });
  });
  it("una vista 10 min despues de la rafaga es una apertura real", () => {
    const vs = [...rafaga, aws(1, "13:41:00")];
    expect(resumirEnlace(vs, 1)).toEqual({ visitantes: 1, aperturas: 1, reenvios: 0, pdfs: 0 });
  });
  it("la vista absorbida no cuenta como primera apertura", () => {
    const vs = [...rafaga, aws(1, "13:31:10"), base({ id: 400, visitante: "v9", ocurrioEn: t2("13:50:00") }), base({ id: 401, tipo: "reenvio", detalle: "facebook", visitante: "app-facebook", aparato: "", ocurrioEn: t2("13:40:00") })];
    // el reenvio de las 13:40 es anterior a la primera apertura real (13:50): tambien es envio
    expect(resumirEnlace(vs, 1)).toEqual({ visitantes: 1, aperturas: 1, reenvios: 0, pdfs: 0 });
  });
});
