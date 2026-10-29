import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico } from "./ayuda-db";
import { listarLeads } from "@/lib/leads";

const hoy = "2026-10-30";
describe.runIf(DB_HABILITADA)("consultas de leads", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  beforeAll(async () => {
    await limpiarBase(); ids = await sembrarBasico();
    const lead = (n: string, extra: Record<string, unknown>) => prisma.prospecto.create({ data: { nichoId: ids.nichoId, nombre: n, ciudad: "", fuentes: [], codigo: (n.replace(/\W/g, "") + "x".repeat(22)).slice(0, 22), clave: n.toLowerCase() + "||" + String(extra.whatsapp ?? ""), origen: "manual", esLead: true, ...extra } });
    await lead("Alma web", { fuenteLead: "web", etapa: "respondio", valorEstimado: "2100", proximoSeguimiento: "2026-10-29", whatsapp: "584120000001" });
    await lead("Faro ref", { fuenteLead: "referido", etapa: "por_contactar", valorEstimado: "5100", proximoSeguimiento: null, whatsapp: "584120000002" });
    await lead("Moto wa", { fuenteLead: "whatsapp", etapa: "respondio", valorEstimado: "4600", proximoSeguimiento: "2026-11-02", whatsapp: "584120000003" });
    await lead("Dir asc", { fuenteLead: "directorio", etapa: "enviado", proximoSeguimiento: "2026-10-30", whatsapp: "584120000004" });
    await lead("Perdido", { fuenteLead: "web", etapa: "descartado", whatsapp: "584120000005" });
    await prisma.prospecto.create({ data: { nichoId: ids.nichoId, nombre: "Solo directorio", ciudad: "Caracas", fuentes: [], codigo: "d".repeat(22), clave: "solodirectorio|caracas", origen: "importado", esLead: false, etapa: "por_contactar" } });
  });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("el dueno ve cinco columnas con sus leads, el valor por columna y el orden por fecha (nulos al final)", async () => {
    const r = await listarLeads({ rol: "dueno" }, hoy);
    expect(r.columnas.map((c) => c.etapa)).toEqual(["por_contactar", "enviado", "respondio", "reunion", "ganado"]);
    const conv = r.columnas.find((c) => c.etapa === "respondio")!;
    expect(conv.leads.map((l) => l.nombre)).toEqual(["Alma web", "Moto wa"]);
    expect(conv.valor).toBe(6700);
    expect(conv.leads[0].estadoPaso).toBe("vencido"); expect(conv.leads[1].estadoPaso).toBe("proximo");
    expect(r.columnas.find((c) => c.etapa === "por_contactar")!.leads.map((l) => l.nombre)).toEqual(["Faro ref"]);
    expect(r.columnas.find((c) => c.etapa === "enviado")!.leads.map((l) => l.nombre)).toEqual(["Dir asc"]);
    expect(r.descartados).toBe(1);
    expect(r.columnas.flatMap((c) => c.leads).map((l) => l.nombre)).not.toContain("Solo directorio");
  });
  it("el prospectador solo ve los que salieron del directorio", async () => {
    const r = await listarLeads({ rol: "prospectador" }, hoy);
    expect(r.columnas.flatMap((c) => c.leads).map((l) => l.nombre)).toEqual(["Dir asc"]);
  });
  it("filtra por fuente y por texto", async () => {
    expect((await listarLeads({ rol: "dueno", fuente: "web" }, hoy)).columnas.flatMap((c) => c.leads).map((l) => l.nombre)).toEqual(["Alma web"]);
    expect((await listarLeads({ rol: "dueno", q: "moto" }, hoy)).columnas.flatMap((c) => c.leads).map((l) => l.nombre)).toEqual(["Moto wa"]);
  });
  it("el prospectador no alcanza otras fuentes aunque las pida por la URL", async () => {
    expect((await listarLeads({ rol: "prospectador", fuente: "web" }, hoy)).columnas.flatMap((c) => c.leads).map((l) => l.nombre)).toEqual([]);
  });
});

