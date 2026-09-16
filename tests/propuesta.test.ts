import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, crearProspectoDePrueba } from "./ayuda-db";
import { generarPdf, hashDe, leerPlantilla } from "@/lib/propuesta";
import { renderPropuesta } from "@/lib/propuesta-contrato";

describe.runIf(DB_HABILITADA)("propuesta", () => {
  beforeAll(limpiarBase);
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("leerPlantilla rechaza slugs raros y encuentra hoteles", async () => {
    expect(await leerPlantilla("../etc/passwd")).toBeNull();
    expect(await leerPlantilla("hoteles")).toContain("data-hotel");
  });

  it("generarPdf produce un A4 real y cachea", async () => {
    const { nichoId } = await sembrarBasico();
    const p = await crearProspectoDePrueba(nichoId, { nombre: "Hotel PDF" });
    const plantilla = readFileSync("plantillas/hoteles.html", "utf8");
    const ruta = await generarPdf(p.codigo, renderPropuesta(plantilla, "Hotel PDF", "#"), hashDe(plantilla));
    expect(statSync(ruta).size).toBeGreaterThan(50_000);
    const antes = statSync(ruta).mtimeMs;
    await generarPdf(p.codigo, "<html>otro</html>", hashDe(plantilla));
    expect(statSync(ruta).mtimeMs).toBe(antes); // no regenero
  }, 60_000);
});
