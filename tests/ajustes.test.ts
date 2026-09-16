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
import { DB_HABILITADA, limpiarBase, sembrarBasico, PIN_DUENO, PIN_PROSPECTADOR } from "./ayuda-db";
import { sesionFalsa } from "./ayuda-sesion";
import { guardarNicho, guardarUsuario, cambiarMiPin, restablecerPin } from "@/acciones/ajustes";
import { buscarPorPin } from "@/lib/usuarios";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe.runIf(DB_HABILITADA)("ajustes", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  beforeAll(async () => { await limpiarBase(); ids = await sembrarBasico(); });
  beforeEach(() => { sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" }; });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("el prospectador no puede tocar nichos ni usuarios", async () => {
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
    await expect(guardarNicho(fd({ id: String(ids.nichoId), mensajeInicial: "x", mensajeSeguimiento: "y", diasSeguimiento: "2" }))).rejects.toThrow("REDIRECT:/hoy");
    await expect(guardarUsuario(fd({ nombre: "Z", rol: "prospectador", pin: "111111", metaDiaria: "3" }))).rejects.toThrow("REDIRECT:/hoy");
  });
  it("guardarNicho exige {enlace} en el mensaje inicial y dias entre 1 y 30", async () => {
    expect((await guardarNicho(fd({ id: String(ids.nichoId), mensajeInicial: "sin enlace {nombre}", mensajeSeguimiento: "y {enlace}", diasSeguimiento: "3" }))).ok).toBe(false);
    expect((await guardarNicho(fd({ id: String(ids.nichoId), mensajeInicial: "a {enlace}", mensajeSeguimiento: "b {enlace}", diasSeguimiento: "45" }))).ok).toBe(false);
    expect((await guardarNicho(fd({ id: String(ids.nichoId), mensajeInicial: "Hola {nombre}: {enlace}", mensajeSeguimiento: "De nuevo {enlace}", diasSeguimiento: "5" }))).ok).toBe(true);
    expect((await prisma.nicho.findUniqueOrThrow({ where: { id: ids.nichoId } })).diasSeguimiento).toBe(5);
  });
  it("guardarUsuario crea, edita y desactiva sin borrar", async () => {
    const r = await guardarUsuario(fd({ nombre: "Pedro", rol: "prospectador", pin: "222222", metaDiaria: "4" }));
    expect(r.ok).toBe(true);
    const pedro = (await buscarPorPin("222222"))!;
    expect(pedro.nombre).toBe("Pedro");
    expect((await guardarUsuario(fd({ id: String(pedro.id), nombre: "Pedro P.", rol: "prospectador", metaDiaria: "6", activo: "" }))).ok).toBe(true);
    expect(await buscarPorPin("222222")).toBeNull(); // desactivado
    expect(await prisma.usuario.count()).toBe(3);
  });
  it("un PIN repetido se rechaza con mensaje claro", async () => {
    const r = await guardarUsuario(fd({ nombre: "Otra", rol: "prospectador", pin: PIN_DUENO, metaDiaria: "1" }));
    expect(r).toEqual({ ok: false, mensaje: expect.stringContaining("otra cuenta") });
  });
  it("cambiarMiPin pide el actual; restablecerPin es del dueno", async () => {
    expect((await cambiarMiPin(fd({ actual: "000000", nuevo: "333333" }))).ok).toBe(false);
    expect((await cambiarMiPin(fd({ actual: PIN_DUENO, nuevo: "333333" }))).ok).toBe(true);
    expect((await buscarPorPin("333333"))?.id).toBe(ids.usuarioId);
    expect((await restablecerPin(ids.prospectadorId, "444444")).ok).toBe(true);
    expect((await buscarPorPin("444444"))?.id).toBe(ids.prospectadorId);
    expect(await buscarPorPin(PIN_PROSPECTADOR)).toBeNull();
  });
});
