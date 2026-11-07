import { vi } from "vitest";
vi.mock("@/lib/sesion-ligera", () => ({ tieneSesion: async () => false }));
vi.mock("@/lib/ip", () => ({ ipCliente: async () => "203.0.113.9" }));

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, crearProspectoDePrueba } from "./ayuda-db";
import { GET, HEAD } from "@/app/p/[codigo]/route";

const ctx = (codigo: string) => ({ params: Promise.resolve({ codigo }) });
const pedir = (codigo: string, ua: string, metodo = "GET") => new Request(`http://localhost:3013/p/${codigo}`, { method: metodo, headers: { "user-agent": ua } });
const TELEFONO = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";

describe.runIf(DB_HABILITADA)("GET /p/<codigo> y el rastro", () => {
  let nichoId = 0;
  beforeAll(async () => { await limpiarBase(); ({ nichoId } = await sembrarBasico()); });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("crea el enlace plantilla una sola vez y el HTML lleva su token", async () => {
    const p = await crearProspectoDePrueba(nichoId);
    const r1 = await GET(pedir(p.codigo, TELEFONO), ctx(p.codigo));
    const r2 = await GET(pedir(p.codigo, TELEFONO), ctx(p.codigo));
    expect(r1.status).toBe(200);
    const filas = await prisma.enlaceEnviado.findMany({ where: { prospectoId: p.id } });
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ host: "prospectos.neracosu.com", prefijo: `/p/${p.codigo}`, origen: "plantilla" });
    for (const html of [await r1.text(), await r2.text()]) {
      expect(html).toContain(`data-enlace="${filas[0].token}"`);
      expect(html).toMatch(/rastro\.js\?v=1" data-enlace="[^"]+" defer><\/script><\/body>/);
    }
  });

  it("un bot de vista previa tambien crea la fila; un HEAD no crea nada", async () => {
    const bot = await crearProspectoDePrueba(nichoId);
    await GET(pedir(bot.codigo, "WhatsApp/2.23.20.0"), ctx(bot.codigo));
    expect(await prisma.enlaceEnviado.count({ where: { prospectoId: bot.id } })).toBe(1);

    const cabeza = await crearProspectoDePrueba(nichoId);
    const r = await HEAD(pedir(cabeza.codigo, TELEFONO, "HEAD"), ctx(cabeza.codigo));
    expect(r.status).toBe(200);
    expect(await prisma.enlaceEnviado.count({ where: { prospectoId: cabeza.id } })).toBe(0);
  });
});
