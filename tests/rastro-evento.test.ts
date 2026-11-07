import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, crearProspectoDePrueba } from "./ayuda-db";
import { _reiniciarIntentos } from "@/lib/rate-limit";
import { registrarEnlace } from "@/lib/rastro";
import { POST, OPTIONS } from "@/app/api/rastro/evento/route";

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.3 Mobile/15E148 Safari/604.1";

function peticion(body: unknown, o: { origin?: string; ua?: string; ip?: string } = {}) {
  return new Request("http://127.0.0.1:3013/api/rastro/evento", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "text/plain;charset=UTF-8", origin: o.origin ?? "https://neracosu.com", "user-agent": o.ua ?? UA, "x-forwarded-for": o.ip ?? "203.0.113.5" },
  });
}

describe("public/rastro.js", () => {
  const js = readFileSync("public/rastro.js", "utf8");
  it("cabe en 4 KB y trae la ruta y la marca de 'soy yo'", () => {
    expect(Buffer.byteLength(js)).toBeLessThanOrEqual(4096);
    expect(js).toContain("/api/rastro/evento");
    expect(js).toContain("nc_soyyo");
  });
});

describe.runIf(DB_HABILITADA)("POST /api/rastro/evento", () => {
  let token = "";
  beforeEach(async () => {
    _reiniciarIntentos();
    await limpiarBase();
    const { nichoId } = await sembrarBasico();
    const p = await crearProspectoDePrueba(nichoId);
    const r = await registrarEnlace({ prospectoId: p.id, url: "https://demo-ejemplo.neracosu.com/factura/", etiqueta: "Demo" });
    if (!r.ok) throw new Error(r.error);
    token = r.enlace.token;
  });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("guarda inicio, fin y clic con el visitante de IP+UA", async () => {
    for (const b of [
      { token, tipo: "inicio", ruta: "/factura/", origen: "facebook" },
      { token, tipo: "fin", ruta: "/factura/", segundos: 42, scroll: 80 },
      { token, tipo: "clic", ruta: "/factura/", detalle: "whatsapp" },
    ]) {
      const r = await POST(peticion(b));
      expect(r.status).toBe(204);
    }
    const filas = await prisma.visitaEnlace.findMany({ orderBy: { id: "asc" } });
    expect(filas.map((f) => f.tipo)).toEqual(["inicio", "fin", "clic"]);
    expect(filas.every((f) => f.fuente === "js" && f.geoPendiente)).toBe(true);
    expect(new Set(filas.map((f) => f.visitante)).size).toBe(1);
    expect(filas[1]).toMatchObject({ segundos: 42, scroll: 80 });
    expect(filas[2].detalle).toBe("whatsapp");
  });

  it("403 con Origin ajeno, 204 sin guardar con robot, 400 invalido o de 3 KB, 404 con token desconocido", async () => {
    const b = { token, tipo: "inicio", ruta: "/factura/" };
    expect((await POST(peticion(b, { origin: "https://otro.com" }))).status).toBe(403);
    expect((await POST(peticion(b, { ua: "Mozilla/5.0 (compatible; Googlebot/2.1)" }))).status).toBe(204);
    expect(await prisma.visitaEnlace.count()).toBe(0);
    expect((await POST(peticion("{no es json"))).status).toBe(400);
    expect((await POST(peticion({ ...b, origen: "x".repeat(3000) }))).status).toBe(400);
    expect((await POST(peticion({ ...b, token: "A".repeat(22) }))).status).toBe(404);
    expect(await prisma.visitaEnlace.count()).toBe(0);
  });

  it("acepta subdominios https de neracosu.com y responde el preflight", async () => {
    const o = "https://demo-ejemplo.neracosu.com";
    const r = await POST(peticion({ token, tipo: "inicio", ruta: "/factura/" }, { origin: o }));
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-origin")).toBe(o);
    const pre = await OPTIONS(new Request("http://127.0.0.1:3013/api/rastro/evento", { method: "OPTIONS", headers: { origin: o } }));
    expect(pre.status).toBe(204);
    expect(pre.headers.get("access-control-allow-origin")).toBe(o);
    for (const malo of ["https://neracosu.com.evil.io", "http://neracosu.com"]) {
      expect((await POST(peticion({ token, tipo: "inicio", ruta: "/factura/" }, { origin: malo }))).status).toBe(403);
    }
  });

  it("429 al pasar 120 eventos en un minuto desde la misma IP", async () => {
    const b = { token, tipo: "inicio", ruta: "/factura/" };
    for (let i = 0; i < 120; i++) expect((await POST(peticion(b, { ip: "198.51.100.7" }))).status).toBe(204);
    expect((await POST(peticion(b, { ip: "198.51.100.7" }))).status).toBe(429);
  });
});
