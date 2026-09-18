import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// public/sw.js es un script clasico de service worker: se carga con new Function y un `self` falso,
// y se prueba solo su decision de ruteo (lo unico con logica). Lo que cachea y lo que no es la regla
// de seguridad de la fase C: nunca HTML, nunca RSC, nunca el portal ni los recibos.
const codigo = readFileSync(path.join(process.cwd(), "public", "sw.js"), "utf8");
function cargar() {
  const module: { exports: Record<string, unknown> } = { exports: {} };
  const self = { addEventListener: () => {}, location: { origin: "https://prospectos.test" } };
  new Function("module", "self", codigo)(module, self);
  return module.exports as { decidir: (metodo: string, url: string, modo: string, origen: string) => string; CACHE: string; SIN_CONEXION: string };
}
const O = "https://prospectos.test";

describe("service worker: decidir", () => {
  const { decidir } = cargar();
  it("assets con hash de Next, iconos y manifiesto: cache primero", () => {
    expect(decidir("GET", `${O}/_next/static/chunks/255-37e0.js`, "no-cors", O)).toBe("estatico");
    expect(decidir("GET", `${O}/_next/static/media/fuente.woff2`, "cors", O)).toBe("estatico");
    expect(decidir("GET", `${O}/icono-192.png`, "no-cors", O)).toBe("estatico");
    expect(decidir("GET", `${O}/manifest.webmanifest`, "cors", O)).toBe("estatico");
  });
  it("una navegacion del panel: red, y si falla la pagina de sin conexion", () => {
    expect(decidir("GET", `${O}/hoy`, "navigate", O)).toBe("navegacion");
    expect(decidir("GET", `${O}/proyectos/3?t=cobros`, "navigate", O)).toBe("navegacion");
  });
  it("el portal, las propuestas, los recibos, los documentos y la api NUNCA pasan por el service worker", () => {
    for (const ruta of ["/c/abc", "/c/abc/inicio", "/c/documentos/9", "/p/xyz", "/p/xyz/pdf", "/recibos/R-2026-0001.pdf", "/proyectos/3/documentos", "/api/lo-que-sea", "/sin-conexion", "/entrar", "/salir"]) {
      expect(decidir("GET", `${O}${ruta}`, "navigate", O), ruta).toBe("ignorar");
    }
  });
  it("RSC, datos y todo lo que no es navegacion ni asset: se ignora (red normal)", () => {
    expect(decidir("GET", `${O}/hoy?_rsc=abc`, "cors", O)).toBe("ignorar");
    expect(decidir("GET", `${O}/buscar/plantilla?formato=xlsx`, "cors", O)).toBe("ignorar");
    expect(decidir("GET", `${O}/_next/image?url=x`, "no-cors", O)).toBe("ignorar");
  });
  it("nada que no sea GET ni del mismo origen", () => {
    expect(decidir("POST", `${O}/hoy`, "navigate", O)).toBe("ignorar");
    expect(decidir("POST", `${O}/_next/static/x.js`, "cors", O)).toBe("ignorar");
    expect(decidir("GET", "https://otro.test/_next/static/x.js", "no-cors", O)).toBe("ignorar");
    expect(decidir("GET", "https://wa.me/58412", "navigate", O)).toBe("ignorar");
  });
  it("una URL rota no tumba el service worker", () => {
    expect(decidir("GET", "no es una url", "navigate", O)).toBe("ignorar");
  });
});
