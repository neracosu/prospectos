import { describe, it, expect } from "vitest";
import {
  parsearLinea, clasificarUa, resumirAparato, visitanteDe, huellaDe, rutaPagina, esPdf, descomponerUrl, enlaceQueCoincide, PATRON_P, etiquetaScript,
  armarLineaTiempo, textoLugar, resumirEnlace, textoResumenEnlace, resumenTarjeta, haceCuanto, type VisitaFila,
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
