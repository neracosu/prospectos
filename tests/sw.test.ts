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
  return module.exports as { decidir: (metodo: string, url: string, modo: string, origen: string) => string; extraerRutas: (html: string) => string[]; podar: (cache: { keys: () => Promise<string[]>; delete: (k: string) => Promise<boolean> }, tope: number) => Promise<unknown>; CACHE: string; CACHE_FIJA: string; SIN_CONEXION: string };
}
const O = "https://prospectos.test";

describe("service worker: decidir", () => {
  const { decidir } = cargar();
  it("assets con hash de Next: cache primero; iconos y manifiesto (sin hash): red primero con respaldo", () => {
    expect(decidir("GET", `${O}/_next/static/chunks/255-37e0.js`, "no-cors", O)).toBe("estatico");
    expect(decidir("GET", `${O}/_next/static/media/fuente.woff2`, "cors", O)).toBe("estatico");
    expect(decidir("GET", `${O}/icono-192.png`, "no-cors", O)).toBe("respaldo");
    expect(decidir("GET", `${O}/manifest.webmanifest`, "cors", O)).toBe("respaldo");
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
    // La plantilla de importacion se baja con un <a href>: es una navegacion, y sin red cae en «Sin conexion». Aceptado.
    expect(decidir("GET", `${O}/buscar/plantilla?formato=xlsx`, "navigate", O)).toBe("navegacion");
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

describe("service worker: precache y poda", () => {
  const { extraerRutas, podar, CACHE, CACHE_FIJA } = cargar();
  it("extraerRutas saca el CSS, el JS y las fuentes precargadas de un HTML, sin repetir y sin lo que no es de Next", () => {
    const html = `<link rel="stylesheet" href="/_next/static/css/a.css"><link rel="preload" href="/_next/static/media/f.woff2" as="font"><script src="/_next/static/chunks/x.js"></script><script src="/_next/static/chunks/x.js"></script><img src="/icono.svg"><a href="/hoy">`;
    expect(extraerRutas(html)).toEqual(["/_next/static/css/a.css", "/_next/static/media/f.woff2", "/_next/static/chunks/x.js"]);
  });
  it("podar borra las mas viejas hasta el tope y no toca nada si cabe", async () => {
    const borradas: string[] = [];
    const cache = { keys: async () => ["a", "b", "c", "d", "e"], delete: async (k: string) => { borradas.push(k); return true; } };
    await podar(cache, 3);
    expect(borradas).toEqual(["a", "b"]);
    borradas.length = 0;
    await podar({ keys: async () => ["a", "b"], delete: cache.delete }, 3);
    expect(borradas).toEqual([]);
  });
  it("la pagina de sin conexion vive en su propia cache, que la poda no toca", () => {
    expect(CACHE_FIJA).not.toBe(CACHE);
    // Vigia textual: la rama de navegacion nunca guarda nada (el HTML del panel jamas se cachea), y la poda solo corre en la cache de assets.
    const navegacion = codigo.slice(codigo.indexOf('que === "navegacion"'));
    expect(navegacion).not.toMatch(/\.put\(/);
    expect(codigo.match(/podar\(c, TOPE\)/g)).toHaveLength(1);
    expect(codigo.indexOf("podar(c, TOPE)")).toBeGreaterThan(codigo.indexOf('que === "estatico"'));
    expect(codigo.indexOf("podar(c, TOPE)")).toBeLessThan(codigo.indexOf('que === "respaldo"'));
  });
});
