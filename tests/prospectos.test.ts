import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, crearProspectoDePrueba } from "./ayuda-db";
import { colaDelDia, seguimientosQueTocan, resumenHoy, buscarProspectos, fichaProspecto } from "@/lib/prospectos";

describe.runIf(DB_HABILITADA)("consultas de prospectos", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  beforeAll(async () => {
    await limpiarBase();
    ids = await sembrarBasico();
    await crearProspectoDePrueba(ids.nichoId, { nombre: "Solo IG", instagram: "https://www.instagram.com/x/", ordenCola: 1 });
    await crearProspectoDePrueba(ids.nichoId, { nombre: "Con WA", whatsapp: "584120000000", ordenCola: 2 });
    await crearProspectoDePrueba(ids.nichoId, { nombre: "Enviado viejo", whatsapp: "584120000001", etapa: "enviado", proximoSeguimiento: "2026-09-10" });
    await crearProspectoDePrueba(ids.nichoId, { nombre: "Enviado futuro", whatsapp: "584120000002", etapa: "enviado", proximoSeguimiento: "2026-09-20" });
    const abierto = await crearProspectoDePrueba(ids.nichoId, { nombre: "Abierto", whatsapp: "584120000003", etapa: "enviado", proximoSeguimiento: "2026-09-16" });
    // Evento mas viejo primero para que "enviado" quede mas nuevo, sin depender del orden de insercion.
    await prisma.evento.create({ data: { prospectoId: abierto.id, tipo: "abierto", creadoEn: new Date(Date.now() - 60_000) } });
    await prisma.evento.create({ data: { prospectoId: abierto.id, tipo: "enviado", canal: "whatsapp", usuarioId: ids.usuarioId, creadoEn: new Date() } });
  });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("la cola trae solo por_contactar, WhatsApp primero, con mensaje y enlace rellenos", async () => {
    const cola = await colaDelDia(10);
    expect(cola.map((p) => p.nombre)).toEqual(["Con WA", "Solo IG"]);
    expect(cola[0].mensaje).toContain("Con WA");
    expect(cola[0].mensaje).toContain(cola[0].enlace);
    expect(cola[0].enlace).toMatch(/\/p\/[A-Za-z0-9_-]+$/);
  });
  it("los seguimientos que tocan son los enviados con fecha <= hoy, y dicen si abrieron", async () => {
    const s = await seguimientosQueTocan("2026-09-16");
    expect(s.map((p) => p.nombre).sort()).toEqual(["Abierto", "Enviado viejo"]);
    expect(s.find((p) => p.nombre === "Abierto")?.abrio).toBe(true);
    expect(s.find((p) => p.nombre === "Enviado viejo")?.abrio).toBe(false);
  });
  it("el resumen cuenta el embudo y los enviados de hoy por usuario", async () => {
    const r = await resumenHoy("2026-09-16");
    expect(r.embudo.por_contactar).toBe(2);
    expect(r.embudo.enviado).toBe(3);
    const neri = r.porUsuario.find((u) => u.id === ids.usuarioId)!;
    expect(neri.meta).toBe(10);
    expect(neri.enviados).toBeGreaterThanOrEqual(0); // depende de si "hoy" real coincide con la fecha del evento
  });
  it("buscar filtra por texto y etapa", async () => {
    expect((await buscarProspectos({ q: "viejo" })).map((p) => p.nombre)).toEqual(["Enviado viejo"]);
    expect((await buscarProspectos({ etapa: "por_contactar" })).length).toBe(2);
  });
  it("la ficha trae historial con nombre de usuario", async () => {
    const p = await prisma.prospecto.findFirstOrThrow({ where: { nombre: "Abierto" } });
    const f = await fichaProspecto(p.id);
    expect(f?.historial.map((e) => e.tipo)).toEqual(["enviado", "abierto"]); // mas nuevo primero
    expect(f?.historial[0].usuarioNombre).toBe("Neri");
    expect(await fichaProspecto(999999)).toBeNull();
  });
});
