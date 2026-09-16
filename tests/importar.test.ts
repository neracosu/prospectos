import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico } from "./ayuda-db";
import { prospectoDesdeHotelJson, regionDe, importarProspectos } from "@/lib/importar";

const yare = {
  nombre: "Hotel Yare", ciudad: "Caracas (Sabana Grande)", estado: "Distrito Capital", tipo: "hotel de paso/motel",
  habitaciones: 150, telefono: "0212.793.0708 / +58 412 3229005", whatsapp: "", email: "", web: "https://www.hotelyare.com.ve/",
  instagram: "hotelyare", direccion: "Av. Las Acacias", fuentes: ["https://www.hotelyare.com.ve/"], notas: "Solo adultos.",
};

describe("prospectoDesdeHotelJson", () => {
  it("mapea el JSON de armar.py al prospecto", () => {
    expect(prospectoDesdeHotelJson(yare)).toEqual({
      nombre: "Hotel Yare", ciudad: "Caracas (Sabana Grande)", estado: "Distrito Capital", region: "Caracas y alrededores",
      tipo: "hotel de paso/motel", tamano: "150 hab.", telefono: "0212.793.0708 / +58 412 3229005", whatsapp: "584123229005",
      email: "", web: "https://www.hotelyare.com.ve/", instagram: "https://www.instagram.com/hotelyare/", facebook: "", tiktok: "",
      nota: "Solo adultos.\nDirección: Av. Las Acacias", fuentes: ["https://www.hotelyare.com.ve/"],
    });
  });
  it("regionDe agrupa como la lista original", () => {
    expect(regionDe("Miranda")).toBe("Caracas y alrededores");
    expect(regionDe("Aragua")).toBe("Carabobo y Aragua");
    expect(regionDe("Zulia")).toBe("Occidente, oriente y los Andes");
  });
});

describe.runIf(DB_HABILITADA)("importarProspectos", () => {
  let nichoId: number;
  beforeAll(async () => { await limpiarBase(); nichoId = (await sembrarBasico()).nichoId; });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("inserta nuevos, salta repetidos y deja evento importado", async () => {
    const lista = [prospectoDesdeHotelJson(yare), { nombre: "Posada Sol", ciudad: "Valencia" }];
    const r1 = await importarProspectos(nichoId, lista, { origen: "importado" });
    expect(r1).toEqual({ nuevos: 2, repetidos: 0 });
    const r2 = await importarProspectos(nichoId, [{ nombre: "HOTEL YARÉ", ciudad: "caracas (sabana grande)" }], { origen: "importado" });
    expect(r2).toEqual({ nuevos: 0, repetidos: 1 });
    expect(await prisma.prospecto.count()).toBe(2);
    expect(await prisma.evento.count({ where: { tipo: "importado" } })).toBe(2);
    const p = await prisma.prospecto.findFirst({ where: { nombre: "Hotel Yare" } });
    expect(p?.codigo).toHaveLength(22);
    expect(p?.etapa).toBe("por_contactar");
  });
});
