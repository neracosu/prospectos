import { vi } from "vitest";
vi.mock("@/lib/sesion", async () => {
  const { sesionFalsa } = await import("./ayuda-sesion");
  return {
    COOKIE_SESION: "pr_sesion", DIAS_SESION: 30,
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
import { guardarMensajesCobro, guardarDatosEmisor, guardarTarifa } from "@/acciones/ajustes";
import { leerConfig, leerEmisor, leerTarifaHora, CLAVES } from "@/lib/configuracion";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe.runIf(DB_HABILITADA)("ajustes de cobros", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  beforeAll(async () => { await limpiarBase(); ids = await sembrarBasico(); });
  beforeEach(() => { sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" }; });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("solo el dueno", async () => {
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
    await expect(guardarTarifa(fd({ tarifa: "20" }))).rejects.toThrow("REDIRECT:/hoy");
  });
  it("mensajes exigen {monto} y {vence}", async () => {
    expect((await guardarMensajesCobro(fd({ recordatorio: "Hola {cliente}, paga {monto}", vencido: "Venció {vence}" }))).ok).toBe(false);
    expect((await guardarMensajesCobro(fd({ recordatorio: "Hola {cliente}: {monto} vence {vence}", vencido: "Venció el {vence}: {monto}" }))).ok).toBe(true);
    expect(await leerConfig(CLAVES.mensajeVencido)).toBe("Venció el {vence}: {monto}");
  });
  it("emisor normaliza y tarifa valida rango", async () => {
    expect((await guardarDatosEmisor(fd({ nombre: "Neri Colón", rif: "v-12345678-9", whatsapp: "0412 322 9005", email: "neracosu@gmail.com" }))).ok).toBe(true);
    expect(await leerEmisor()).toEqual({ nombre: "Neri Colón", rif: "V-12345678-9", whatsapp: "584123229005", email: "neracosu@gmail.com" });
    expect((await guardarTarifa(fd({ tarifa: "0" }))).ok).toBe(false);
    expect((await guardarTarifa(fd({ tarifa: "22.5" }))).ok).toBe(true);
    expect(await leerTarifaHora()).toBe(22.5);
  });
});
