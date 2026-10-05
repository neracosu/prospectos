import { vi } from "vitest";
vi.mock("@/lib/sesion", async () => {
  const { sesionFalsa } = await import("./ayuda-sesion");
  return {
    COOKIE_SESION: "pr_sesion",
    DIAS_SESION: 30,
    sesionActual: async () => sesionFalsa.actual,
    exigirSesion: async () => { if (!sesionFalsa.actual) throw new Error("REDIRECT:/entrar"); return sesionFalsa.actual; },
    exigirRol: async (rol: string) => { if (sesionFalsa.actual?.rol !== rol) throw new Error("REDIRECT:/hoy"); return sesionFalsa.actual; },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico } from "./ayuda-db";
import { sesionFalsa } from "./ayuda-sesion";
import { ciudadPorSlug } from "@/lib/overpass-contrato";
import { reglaDeNicho, type LugarOverture } from "@/lib/overture-contrato";
import { lugaresDeOverture, publicacionCargada, reemplazarLugares } from "@/lib/overture";

const caracas = ciudadPorSlug("caracas")!;
const PUB = "2026-09-23.1";
const lugar = (id: string, extra: Partial<LugarOverture> = {}): LugarOverture => ({
  id, nombre: `Arepera ${id}`, categoriaBase: "restaurant", categoriaFina: "venezuelan_restaurant",
  lat: 10.4806, lon: -66.9036, direccion: "", telefonos: "+584141234567", correos: "", webs: "",
  redes: `https://www.facebook.com/${id}`, confianza: 0.9, publicacion: PUB, ...extra,
});

describe.runIf(DB_HABILITADA)("directorio abierto: tabla", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  beforeAll(async () => { await limpiarBase(); ids = await sembrarBasico(); });
  beforeEach(async () => {
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
    await prisma.revision.deleteMany(); await prisma.lugarOverture.deleteMany();
  });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("sin cargar no hay publicacion; cargado, la dice", async () => {
    expect(await publicacionCargada()).toBeNull();
    expect(await reemplazarLugares([lugar("a"), lugar("b")])).toBe(2);
    expect(await publicacionCargada()).toBe(PUB);
  });

  it("reemplazar borra lo anterior y si falla a medias no cambia nada", async () => {
    await reemplazarLugares([lugar("a"), lugar("b")]);
    await reemplazarLugares([lugar("c", { publicacion: "2026-10-21.0" })]);
    expect((await prisma.lugarOverture.findMany()).map((l) => l.id)).toEqual(["c"]);
    // Dos filas con el mismo id revientan el createMany: la transaccion deja la tabla como estaba.
    await expect(reemplazarLugares([lugar("x"), lugar("x")])).rejects.toThrow();
    expect((await prisma.lugarOverture.findMany()).map((l) => l.id)).toEqual(["c"]);
  });

  it("trae solo la caja de la ciudad y las categorias de la regla", async () => {
    await reemplazarLugares([
      lugar("centro"),
      lugar("valencia", { lat: 10.162, lon: -68.0077 }),
      lugar("farmacia", { categoriaBase: "pharmacy_and_drug_store" }),
      lugar("emoji", { nombre: "Café 🌮 Ñandú" }),
    ]);
    const r = await lugaresDeOverture(reglaDeNicho("restaurantes-y-bares")!, caracas);
    expect(r.map((l) => l.id).sort()).toEqual(["centro", "emoji"]);
    expect(r.find((l) => l.id === "emoji")!.nombre).toBe("Café 🌮 Ñandú");
  });
});
