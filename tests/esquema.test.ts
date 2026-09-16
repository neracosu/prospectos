import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, crearProspectoDePrueba } from "./ayuda-db";

describe.runIf(DB_HABILITADA)("esquema", () => {
  beforeAll(limpiarBase);
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("no deja dos prospectos con la misma clave en el mismo nicho", async () => {
    const { nichoId } = await sembrarBasico();
    await crearProspectoDePrueba(nichoId, { nombre: "Hotel Yare", ciudad: "Caracas" });
    await expect(crearProspectoDePrueba(nichoId, { nombre: "Hotel Yare", ciudad: "Caracas" })).rejects.toThrow(/Unique/);
  });
});
