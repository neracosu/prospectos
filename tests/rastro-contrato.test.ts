import { describe, it, expect } from "vitest";
import {
  parsearLinea, clasificarUa, resumirAparato, visitanteDe, huellaDe, rutaPagina, esPdf, descomponerUrl, enlaceQueCoincide, PATRON_P, etiquetaScript,
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
