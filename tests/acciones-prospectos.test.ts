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
import { DB_HABILITADA, limpiarBase, sembrarBasico, crearProspectoDePrueba } from "./ayuda-db";
import { sesionFalsa } from "./ayuda-sesion";
import { marcarEnviado, saltar, marcarRespondio, escribirDeNuevo, descartar, cambiarEtapa, guardarNota, editarSeguimiento, crearProspecto } from "@/acciones/prospectos";
import { hoyCaracas, sumarDias } from "@/lib/fecha-caracas";

describe.runIf(DB_HABILITADA)("acciones de prospectos", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  beforeAll(async () => { await limpiarBase(); ids = await sembrarBasico(); });
  beforeEach(() => { sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" }; });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("sin sesion no hace nada", async () => {
    sesionFalsa.actual = null;
    const p = await crearProspectoDePrueba(ids.nichoId, { whatsapp: "584120000000" });
    await expect(marcarEnviado(p.id, "whatsapp")).rejects.toThrow("REDIRECT:/entrar");
    expect((await prisma.prospecto.findUniqueOrThrow({ where: { id: p.id } })).etapa).toBe("por_contactar");
  });

  it("marcarEnviado pasa a enviado, fija el seguimiento y registra el canal; dos toques cuentan uno", async () => {
    const p = await crearProspectoDePrueba(ids.nichoId, { whatsapp: "584120000001" });
    const [a, b] = await Promise.all([marcarEnviado(p.id, "whatsapp"), marcarEnviado(p.id, "whatsapp")]);
    expect([a.ok, b.ok].filter(Boolean).length).toBe(1);
    const d = await prisma.prospecto.findUniqueOrThrow({ where: { id: p.id } });
    expect(d.etapa).toBe("enviado");
    expect(d.proximoSeguimiento).toBe(sumarDias(hoyCaracas(), 3));
    const ev = await prisma.evento.findMany({ where: { prospectoId: p.id, tipo: "enviado" } });
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ canal: "whatsapp", usuarioId: ids.usuarioId, de: "por_contactar", a: "enviado" });
  });

  it("marcarEnviado rechaza un canal desconocido", async () => {
    const p = await crearProspectoDePrueba(ids.nichoId, { whatsapp: "584120000002" });
    expect(await marcarEnviado(p.id, "paloma" as any)).toEqual({ ok: false, mensaje: expect.stringContaining("canal") });
  });

  it("saltar manda al final de la cola y deja evento", async () => {
    const p = await crearProspectoDePrueba(ids.nichoId, { ordenCola: 1 });
    await crearProspectoDePrueba(ids.nichoId, { ordenCola: 50 });
    expect((await saltar(p.id)).ok).toBe(true);
    expect((await prisma.prospecto.findUniqueOrThrow({ where: { id: p.id } })).ordenCola).toBe(51);
    expect(await prisma.evento.count({ where: { prospectoId: p.id, tipo: "saltado" } })).toBe(1);
  });

  it("escribirDeNuevo corre el seguimiento y registra el evento sin cambiar la etapa", async () => {
    const p = await crearProspectoDePrueba(ids.nichoId, { whatsapp: "584120000003", etapa: "enviado", proximoSeguimiento: "2026-09-01" });
    expect((await escribirDeNuevo(p.id, "whatsapp")).ok).toBe(true);
    const d = await prisma.prospecto.findUniqueOrThrow({ where: { id: p.id } });
    expect(d.etapa).toBe("enviado");
    expect(d.proximoSeguimiento).toBe(sumarDias(hoyCaracas(), 3));
    expect(await prisma.evento.count({ where: { prospectoId: p.id, tipo: "seguimiento" } })).toBe(1);
  });

  it("marcarRespondio limpia el seguimiento; descartar exige motivo; cambiarEtapa respeta el embudo", async () => {
    const p = await crearProspectoDePrueba(ids.nichoId, { etapa: "enviado", proximoSeguimiento: "2026-09-01" });
    expect((await marcarRespondio(p.id)).ok).toBe(true);
    let d = await prisma.prospecto.findUniqueOrThrow({ where: { id: p.id } });
    expect(d).toMatchObject({ etapa: "respondio", proximoSeguimiento: null });
    expect((await descartar(p.id, "  ")).ok).toBe(false);
    expect((await cambiarEtapa(p.id, "por_contactar")).ok).toBe(false); // no retrocede
    expect((await cambiarEtapa(p.id, "ganado")).ok).toBe(true);
    expect((await descartar(p.id, "ya es cliente")).ok).toBe(false); // ganado no se descarta
    d = await prisma.prospecto.findUniqueOrThrow({ where: { id: p.id } });
    expect(d.etapa).toBe("ganado");
  });

  it("descartar guarda el motivo y reactivar vuelve a por_contactar", async () => {
    const p = await crearProspectoDePrueba(ids.nichoId);
    expect((await descartar(p.id, "cerró")).ok).toBe(true);
    const ev = await prisma.evento.findFirstOrThrow({ where: { prospectoId: p.id, tipo: "etapa", a: "descartado" } });
    expect(ev.texto).toBe("cerró");
    expect((await cambiarEtapa(p.id, "por_contactar")).ok).toBe(true);
  });

  it("guardarNota y editarSeguimiento validan", async () => {
    const p = await crearProspectoDePrueba(ids.nichoId, { etapa: "enviado" });
    expect((await guardarNota(p.id, "solo cobra en efectivo")).ok).toBe(true);
    expect((await editarSeguimiento(p.id, "2026-02-30")).ok).toBe(false);
    expect((await editarSeguimiento(p.id, "2026-10-01")).ok).toBe(true);
    expect((await editarSeguimiento(p.id, "")).ok).toBe(true);
    const d = await prisma.prospecto.findUniqueOrThrow({ where: { id: p.id } });
    expect(d.nota).toBe("solo cobra en efectivo");
    expect(d.proximoSeguimiento).toBeNull();
  });

  it("crearProspecto normaliza y no duplica", async () => {
    const fd = new FormData();
    fd.set("nichoId", String(ids.nichoId)); fd.set("nombre", "Posada Nueva"); fd.set("ciudad", "Mérida");
    fd.set("telefono", "0414 123 45 67"); fd.set("instagram", "@posadanueva"); fd.set("fuente", "https://posadanueva.com/contacto");
    const r = await crearProspecto(fd);
    expect(r.ok).toBe(true);
    const d = await prisma.prospecto.findFirstOrThrow({ where: { nombre: "Posada Nueva" } });
    expect(d).toMatchObject({ whatsapp: "584141234567", instagram: "https://www.instagram.com/posadanueva/", origen: "manual", fuentes: ["https://posadanueva.com/contacto"] });
    expect((await crearProspecto(fd)).ok).toBe(false);
  });
});
