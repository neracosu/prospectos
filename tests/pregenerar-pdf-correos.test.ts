import { vi } from "vitest";
const pdf = vi.hoisted(() => ({ llamadas: [] as { codigo: string; html: string }[] }));
vi.mock("@/lib/propuesta", async (orig) => {
  const real = await orig<typeof import("@/lib/propuesta")>();
  return {
    ...real,
    rutaPdf: (codigo: string, hash: string) => `/tmp/no-existe-pregenerar/${codigo}-${hash}.pdf`,
    generarPdf: async (codigo: string, html: string) => { pdf.llamadas.push({ codigo, html }); return "/tmp/falso.pdf"; },
  };
});

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, crearProspectoDePrueba } from "./ayuda-db";
import { pregenerar } from "../scripts/pregenerar-pdf-correos.mjs";

describe.runIf(DB_HABILITADA)("pregenerar-pdf-correos", () => {
  let nichoId = 0;
  beforeAll(async () => {
    await limpiarBase();
    const ids = await sembrarBasico();
    nichoId = (await prisma.nicho.create({ data: { slug: "citas-y-servicios", nombre: "citas", mensajeInicial: "x", mensajeSeguimiento: "y", plantillaPropuesta: "citas-y-servicios", diasSeguimiento: 4 } })).id;
    void ids;
  });
  beforeEach(async () => {
    pdf.llamadas.length = 0;
    await prisma.evento.deleteMany(); await prisma.envioCorreo.deleteMany(); await prisma.fichaNegocio.deleteMany(); await prisma.prospecto.deleteMany();
    for (let i = 0; i < 2; i++) {
      const p = await crearProspectoDePrueba(nichoId, { email: `p${i}${Math.random().toString(36).slice(2, 7)}@ejemplo.test` });
      await prisma.fichaNegocio.create({ data: { prospectoId: p.id, gancho: "Su web no tiene reservas en linea", estado: "revisada" } });
    }
  });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("sin aplicar solo cuenta: no llama a generarPdf", async () => {
    const r = await pregenerar({ aplicar: false });
    expect(r).toMatchObject({ faltan: 2, existian: 0 });
    expect(pdf.llamadas).toHaveLength(0);
  });
  it("con aplicar genera dos PDF con el gancho en el html", async () => {
    const r = await pregenerar({ aplicar: true });
    expect(r).toMatchObject({ faltan: 2, generados: 2, fallidos: 0 });
    expect(pdf.llamadas).toHaveLength(2);
    for (const l of pdf.llamadas) expect(l.html).toContain("Su web no tiene reservas en linea");
  });
});
