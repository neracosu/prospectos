import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, crearProspectoDePrueba } from "./ayuda-db";

describe.runIf(DB_HABILITADA)("modelos de ficha y correo", () => {
  beforeAll(async () => { await limpiarBase(); });
  afterAll(async () => { await limpiarBase(); });
  it("una ficha por prospecto, hallazgos vacios por defecto, token unico por envio", async () => {
    const ids = await sembrarBasico();
    const p = await crearProspectoDePrueba(ids.nichoId, { nombre: "Bodegón Uno", email: "uno@x.test" });
    const f = await prisma.fichaNegocio.create({ data: { prospectoId: p.id } });
    expect(f.hallazgos).toEqual({});
    expect(f.estado).toBe("sin_hallazgos");
    expect(f.alAutomatico).toBe(false);
    await expect(prisma.fichaNegocio.create({ data: { prospectoId: p.id } })).rejects.toThrow();
    await prisma.envioCorreo.create({ data: { prospectoId: p.id, token: "a".repeat(22), tipo: "inicial", asunto: "x", para: "uno@x.test" } });
    await expect(prisma.envioCorreo.create({ data: { prospectoId: p.id, token: "a".repeat(22), tipo: "inicial", asunto: "x", para: "uno@x.test" } })).rejects.toThrow();
    await prisma.correoBloqueado.create({ data: { email: "uno@x.test", motivo: "no_quiere" } });
  });
});
