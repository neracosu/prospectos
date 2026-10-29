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

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico } from "./ayuda-db";
import { sesionFalsa } from "./ayuda-sesion";
import { guardarCorreos } from "@/acciones/ajustes";
import { leerCorreosPorDia, leerCorreosAutomatico } from "@/lib/configuracion";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const ERROR = "El tope va de 1 a 200 correos por día y el envío automático, encendido o apagado.";

describe.runIf(DB_HABILITADA)("ajustes de correos", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  beforeAll(async () => { await limpiarBase(); ids = await sembrarBasico(); });
  beforeEach(async () => { sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" }; await prisma.configuracion.deleteMany(); });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("guarda el tope y el interruptor", async () => {
    expect(await guardarCorreos(fd({ tope: "40", automatico: "off" }))).toEqual({ ok: true });
    expect(await leerCorreosPorDia()).toBe(40);
    expect(await leerCorreosAutomatico()).toBe(false);
    expect(await guardarCorreos(fd({ tope: "200", automatico: "on" }))).toEqual({ ok: true });
    expect(await leerCorreosPorDia()).toBe(200);
    expect(await leerCorreosAutomatico()).toBe(true);
    expect((await guardarCorreos(fd({ tope: "1", automatico: "on" }))).ok).toBe(true);
    expect(await leerCorreosPorDia()).toBe(1);
  });
  it("rechaza 0, 201, decimales y un interruptor raro sin tocar lo guardado", async () => {
    await guardarCorreos(fd({ tope: "30", automatico: "on" }));
    for (const malo of <Record<string, string>[]>[{ tope: "0", automatico: "on" }, { tope: "201", automatico: "on" }, { tope: "2.5", automatico: "on" }, { tope: "abc", automatico: "on" }, { tope: "10", automatico: "quiza" }, { tope: "10" }]) {
      expect(await guardarCorreos(fd(malo))).toEqual({ ok: false, mensaje: ERROR });
    }
    expect(await leerCorreosPorDia()).toBe(30);
    expect(await leerCorreosAutomatico()).toBe(true);
  });
  it("solo el dueno", async () => {
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
    await expect(guardarCorreos(fd({ tope: "10", automatico: "off" }))).rejects.toThrow("REDIRECT:/inicio");
    expect(await leerCorreosAutomatico()).toBe(true);
  });
});
