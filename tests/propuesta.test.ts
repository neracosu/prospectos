import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, crearProspectoDePrueba } from "./ayuda-db";
import { generarPdf, hashDe, leerPlantilla, _generacionesParaTests } from "@/lib/propuesta";
import { renderPropuesta } from "@/lib/propuesta-contrato";

describe.runIf(DB_HABILITADA)("propuesta", () => {
  let nichoId: number;
  beforeAll(async () => {
    await limpiarBase();
    ({ nichoId } = await sembrarBasico());
  });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("leerPlantilla rechaza slugs raros y encuentra hoteles", async () => {
    expect(await leerPlantilla("../etc/passwd")).toBeNull();
    expect(await leerPlantilla("hoteles")).toContain("data-hotel");
  });

  it("generarPdf produce un A4 real, no regenera con el mismo html y cambia de archivo si el html cambia", async () => {
    const p = await crearProspectoDePrueba(nichoId, { nombre: "Hotel PDF" });
    const plantilla = readFileSync("plantillas/hoteles.html", "utf8");
    const html = renderPropuesta(plantilla, "Hotel PDF", "#");
    const ruta = await generarPdf(p.codigo, html, hashDe(html));
    expect(statSync(ruta).size).toBeGreaterThan(50_000);
    const antes = statSync(ruta).mtimeMs;
    await generarPdf(p.codigo, html, hashDe(html));
    expect(statSync(ruta).mtimeMs).toBe(antes); // no regenero

    const htmlOtro = renderPropuesta(plantilla, "Otro Hotel", "#");
    const rutaOtro = await generarPdf(p.codigo, htmlOtro, hashDe(htmlOtro));
    expect(rutaOtro).not.toBe(ruta); // el nombre cambio el html, entonces cambia la clave de cache
    expect(statSync(rutaOtro).size).toBeGreaterThan(50_000);
  }, 60_000);

  it("generarPdf concurrente para el mismo html no duplica el trabajo de Chromium", async () => {
    const p = await crearProspectoDePrueba(nichoId, { nombre: "Hotel Concurrente" });
    const plantilla = readFileSync("plantillas/hoteles.html", "utf8");
    const html = renderPropuesta(plantilla, "Hotel Concurrente", "#");
    const antes = _generacionesParaTests();
    const [r1, r2, r3] = await Promise.all([
      generarPdf(p.codigo, html, hashDe(html)),
      generarPdf(p.codigo, html, hashDe(html)),
      generarPdf(p.codigo, html, hashDe(html)),
    ]);
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
    expect(statSync(r1).size).toBeGreaterThan(50_000);
    expect(_generacionesParaTests() - antes).toBe(1); // un solo Chromium para las 3 llamadas
  }, 60_000);
});
