import { vi } from "vitest";
vi.mock("@/lib/sesion", async () => {
  const { sesionFalsa } = await import("./ayuda-sesion");
  return {
    COOKIE_SESION: "pr_sesion", DIAS_SESION: 30,
    sesionActual: async () => sesionFalsa.actual,
    exigirSesion: async () => { if (!sesionFalsa.actual) throw new Error("REDIRECT:/entrar"); return sesionFalsa.actual; },
    exigirRol: async (rol: string) => { if (sesionFalsa.actual?.rol !== rol) throw new Error("REDIRECT:/inicio"); return sesionFalsa.actual; },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, crearProspectoDePrueba, sembrarCliente, sembrarProyecto } from "./ayuda-db";
import { sesionFalsa } from "./ayuda-sesion";
import { buscarGlobal } from "@/acciones/busqueda";

// Busqueda global (fase 4): el dueno encuentra leads, directorio, clientes y proyectos; el prospectador solo el
// directorio y los leads que salieron de el.
describe.runIf(DB_HABILITADA)("buscarGlobal", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  beforeAll(async () => {
    await limpiarBase();
    ids = await sembrarBasico();
    await crearProspectoDePrueba(ids.nichoId, { nombre: "Boutique Alma", esLead: true, fuenteLead: "web", etapa: "respondio", whatsapp: "584120000001" });
    await crearProspectoDePrueba(ids.nichoId, { nombre: "Hotel Cola", esLead: true, fuenteLead: "directorio", etapa: "enviado", whatsapp: "584120000002" });
    await crearProspectoDePrueba(ids.nichoId, { nombre: "Tienda Directorio", ciudad: "Caracas", whatsapp: "584120000003" });
    const c = await sembrarCliente({ nombre: "Alma C.A." });
    await sembrarProyecto(c.id, ids.nichoId, { nombre: "Alma tienda" });
  });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("el dueno ve proyecto y cliente (empiezan por la consulta) antes que el lead que solo la contiene; una letra no busca", async () => {
    sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" };
    const r = await buscarGlobal("alma");
    expect(r.ok && r.datos.map((x) => x.tipo)).toEqual(["proyecto", "cliente", "lead"]);
    expect(r.ok && r.datos[2].href).toMatch(/^\/leads\/\d+$/);
    const corta = await buscarGlobal("a");
    expect(corta.ok && corta.datos).toEqual([]);
  });
  it("el prospectador no ve leads de la web, clientes ni proyectos; si el directorio y sus leads", async () => {
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "P", rol: "prospectador" };
    expect((await buscarGlobal("alma")).ok && (await buscarGlobal("alma") as { ok: true; datos: unknown[] }).datos).toEqual([]);
    const hotel = await buscarGlobal("hotel");
    expect(hotel.ok && hotel.datos.map((x) => [x.tipo, x.titulo])).toEqual([["lead", "Hotel Cola"]]);
    const tienda = await buscarGlobal("tienda");
    expect(tienda.ok && tienda.datos.map((x) => x.tipo)).toEqual(["directorio"]);
  });
});
