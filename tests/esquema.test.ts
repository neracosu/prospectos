import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, crearProspectoDePrueba, sembrarCliente, sembrarProyecto } from "./ayuda-db";

describe.runIf(DB_HABILITADA)("esquema", () => {
  beforeAll(limpiarBase);
  // Cada test siembra su propio nicho "hoteles" (slug fijo): limpiar entre tests
  // evita el choque de unicidad cuando hay mas de un test en este archivo.
  beforeEach(limpiarBase);
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("no deja dos prospectos con la misma clave en el mismo nicho", async () => {
    const { nichoId } = await sembrarBasico();
    await crearProspectoDePrueba(nichoId, { nombre: "Hotel Yare", ciudad: "Caracas" });
    await expect(crearProspectoDePrueba(nichoId, { nombre: "Hotel Yare", ciudad: "Caracas" })).rejects.toThrow(/Unique/);
  });

  it("una mensualidad es unica por proyecto y mes; un cliente por prospecto", async () => {
    const { nichoId } = await sembrarBasico();
    const c = await sembrarCliente();
    const p = await sembrarProyecto(c.id, nichoId);
    await prisma.cobro.create({ data: { proyectoId: p.id, concepto: "mensualidad", monto: "100.00", vence: "2026-10-05", mes: "2026-10" } });
    await expect(prisma.cobro.create({ data: { proyectoId: p.id, concepto: "mensualidad", monto: "100.00", vence: "2026-10-05", mes: "2026-10" } })).rejects.toThrow(/Unique/);
    const pr = await crearProspectoDePrueba(nichoId);
    await sembrarCliente({ prospectoId: pr.id });
    await expect(sembrarCliente({ prospectoId: pr.id })).rejects.toThrow(/Unique/);
    // Un evento de proyecto no necesita prospecto
    await prisma.evento.create({ data: { proyectoId: p.id, tipo: "proyecto_creado" } });
  });
});
