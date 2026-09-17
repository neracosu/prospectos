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
import { DB_HABILITADA, limpiarBase, sembrarBasico, sembrarCliente } from "./ayuda-db";
import { sesionFalsa } from "./ayuda-sesion";
import { _reiniciarIntentos } from "@/lib/rate-limit";
import { intentarEntrada } from "@/lib/acceso-cliente";
import { enviarAcceso, regenerarPinCliente, desactivarAccesoCliente } from "@/acciones/acceso-cliente";

describe.runIf(DB_HABILITADA)("acciones de acceso al portal", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  let conCel: Awaited<ReturnType<typeof sembrarCliente>>;
  let sinCel: Awaited<ReturnType<typeof sembrarCliente>>;
  beforeAll(async () => {
    await limpiarBase(); ids = await sembrarBasico();
    conCel = await sembrarCliente({ nombre: "Hotel Con Cel", whatsapp: "584129999999" });
    sinCel = await sembrarCliente({ nombre: "Hotel Sin Cel", whatsapp: "" });
  });
  beforeEach(() => { _reiniciarIntentos(); sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" }; });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("el prospectador no toca el acceso de los clientes", async () => {
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
    await expect(enviarAcceso(conCel.id)).rejects.toThrow("REDIRECT:/hoy");
    await expect(regenerarPinCliente(conCel.id)).rejects.toThrow("REDIRECT:/hoy");
    await expect(desactivarAccesoCliente(conCel.id)).rejects.toThrow("REDIRECT:/hoy");
  });

  it("la primera vez devuelve enlace y PIN en dos mensajes separados, y el PIN entra de verdad", async () => {
    const r = await enviarAcceso(conCel.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.datos.enlace).toMatch(new RegExp(`/c/${conCel.codigo}$`));
    expect(r.datos.pin).toMatch(/^\d{6}$/);
    expect(r.datos.hrefEnlace).toMatch(/^https:\/\/wa\.me\/584129999999\?text=/);
    expect(decodeURIComponent(r.datos.hrefEnlace!)).toContain(r.datos.enlace);
    expect(decodeURIComponent(r.datos.hrefEnlace!)).not.toContain(r.datos.pin!);
    expect(decodeURIComponent(r.datos.hrefPin!)).toContain(r.datos.pin!);
    expect(decodeURIComponent(r.datos.hrefPin!)).not.toContain("/c/");
    expect((await intentarEntrada({ codigo: conCel.codigo, pin: r.datos.pin!, ip: "8.8.8.8" })).ok).toBe(true);
    expect(await prisma.evento.count({ where: { clienteId: conCel.id, tipo: "aviso_cliente", texto: "acceso al portal" } })).toBe(1);
  });

  it("la segunda vez reenvia solo el enlace: el PIN no se puede recuperar", async () => {
    const r = await enviarAcceso(conCel.id);
    expect(r.ok && r.datos.pin).toBeNull();
    expect(r.ok && r.datos.hrefPin).toBeNull();
    expect(r.ok && r.datos.hrefEnlace).toMatch(/^https:\/\/wa\.me\//);
  });

  it("regenerar devuelve un PIN nuevo que entra; sin WhatsApp da los textos para copiar", async () => {
    const r = await regenerarPinCliente(sinCel.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.datos.pin).toMatch(/^\d{6}$/);
    expect(r.datos.hrefEnlace).toBeNull();
    expect(r.datos.hrefPin).toBeNull();
    expect(r.datos.mensajePin).toContain(r.datos.pin!);
    expect((await intentarEntrada({ codigo: sinCel.codigo, pin: r.datos.pin!, ip: "8.8.4.4" })).ok).toBe(true);
  });

  it("desactivar corta el acceso; un cliente que no existe falla con mensaje claro", async () => {
    const r = await regenerarPinCliente(conCel.id);
    if (!r.ok) throw new Error("debio regenerar");
    expect((await desactivarAccesoCliente(conCel.id)).ok).toBe(true);
    expect((await intentarEntrada({ codigo: conCel.codigo, pin: r.datos.pin!, ip: "8.8.1.1" })).ok).toBe(false);
    expect(await enviarAcceso(999_999)).toEqual({ ok: false, mensaje: "Ese cliente no existe." });
    expect((await enviarAcceso(-1)).ok).toBe(false);
  });
});
