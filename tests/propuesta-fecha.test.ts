import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, crearProspectoDePrueba } from "./ayuda-db";
import { fechaDePropuesta } from "@/lib/propuesta";
import { hoyCaracas } from "@/lib/fecha-caracas";

describe.runIf(DB_HABILITADA)("fecha de la propuesta", () => {
  let nichoId: number;
  beforeAll(async () => { await limpiarBase(); nichoId = (await sembrarBasico()).nichoId; });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("sin envio registrado es el dia de hoy en Caracas", async () => {
    const p = await crearProspectoDePrueba(nichoId);
    expect(await fechaDePropuesta(p.id)).toBe(hoyCaracas());
  });

  it("con envios es el dia de Caracas del PRIMERO: la vigencia no se corre al reenviar ni al abrirla despues", async () => {
    const p = await crearProspectoDePrueba(nichoId);
    // 02:30 UTC del 11 es todavia el 10 en Caracas
    await prisma.evento.create({ data: { prospectoId: p.id, tipo: "enviado", creadoEn: new Date("2026-09-11T02:30:00Z") } });
    await prisma.evento.create({ data: { prospectoId: p.id, tipo: "enviado", creadoEn: new Date("2026-09-20T15:00:00Z") } });
    await prisma.evento.create({ data: { prospectoId: p.id, tipo: "abierto", creadoEn: new Date("2026-09-01T15:00:00Z") } });
    expect(await fechaDePropuesta(p.id)).toBe("2026-09-10");
  });
});

import { leerPlantillaPara } from "@/lib/propuesta";

describe.runIf(DB_HABILITADA)("plantilla segun el pais", () => {
  it("cobros y pagos tiene plantilla propia para Colombia; los demas arquetipos usan la misma con sus bloques", async () => {
    const ve = (await leerPlantillaPara("cobros-y-pagos", "VE"))!;
    const co = (await leerPlantillaPara("cobros-y-pagos", "CO"))!;
    expect(ve).toContain("C2P");
    expect(co).toContain("Wompi");
    expect(co).not.toContain("C2P");
    expect(await leerPlantillaPara("hoteles", "CO")).toBe(await leerPlantillaPara("hoteles", "VE"));
    expect(await leerPlantillaPara("no-existe", "CO")).toBeNull();
  });
});
