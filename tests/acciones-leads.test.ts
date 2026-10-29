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
import { DB_HABILITADA, limpiarBase, sembrarBasico, crearProspectoDePrueba } from "./ayuda-db";
import { sesionFalsa } from "./ayuda-sesion";
import { crearLead, moverLead, guardarSiguientePaso, guardarDatosLead, convertirSolicitud } from "@/acciones/leads";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe.runIf(DB_HABILITADA)("acciones de leads", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  let otroId = 0, comercioId = 0;
  beforeAll(async () => {
    await limpiarBase(); ids = await sembrarBasico();
    otroId = (await prisma.nicho.create({ data: { slug: "otro", nombre: "Otro", mensajeInicial: "Hola, {nombre}.", mensajeSeguimiento: "Hola de nuevo, {nombre}." } })).id;
    comercioId = (await prisma.nicho.create({ data: { slug: "comercio", nombre: "Comercio", mensajeInicial: "Hola, {nombre}: {enlace}", mensajeSeguimiento: "Hola, {nombre}.", plantillaPropuesta: "comercio-y-tienda" } })).id;
  });
  beforeEach(() => { sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" }; });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("crearLead sin ciudad funciona, nace lead manual con su fuente y su clave con contacto", async () => {
    const r = await crearLead(fd({ nombre: "Boutique Alma", fuenteLead: "instagram", nichoId: String(comercioId), whatsapp: "0412-123 4567", proximoPaso: "mandar propuesta", proximoSeguimiento: "2026-10-30", valorEstimado: "2100", propuestaUrl: "https://ejemplo.test/demo", nota: "Vende por Instagram" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = await prisma.prospecto.findUniqueOrThrow({ where: { id: r.datos.id } });
    expect(p).toMatchObject({ esLead: true, fuenteLead: "instagram", origen: "manual", ciudad: "", whatsapp: "584121234567", proximoPaso: "mandar propuesta", proximoSeguimiento: "2026-10-30", propuestaUrl: "https://ejemplo.test/demo", etapa: "por_contactar" });
    expect(Number(p.valorEstimado)).toBe(2100);
    expect(p.clave).toBe("boutiquealma||584121234567");
  });
  it("mismo nombre con distinto WhatsApp conviven; con el mismo contacto es duplicado", async () => {
    const a = await crearLead(fd({ nombre: "Ana", fuenteLead: "whatsapp", nichoId: String(otroId), whatsapp: "04140000001" }));
    const b = await crearLead(fd({ nombre: "Ana", fuenteLead: "whatsapp", nichoId: String(otroId), whatsapp: "04140000002" }));
    const c = await crearLead(fd({ nombre: "Ana", fuenteLead: "whatsapp", nichoId: String(otroId), whatsapp: "0414 000 0002" }));
    expect(a.ok && b.ok).toBe(true);
    expect(c).toEqual({ ok: false, mensaje: expect.stringContaining("Ya tienes un lead") });
  });
  it("crearLead exige al menos un contacto y una fuente valida", async () => {
    expect((await crearLead(fd({ nombre: "Sin contacto", fuenteLead: "web", nichoId: String(otroId) }))).ok).toBe(false);
    expect((await crearLead(fd({ nombre: "Fuente rara", fuenteLead: "paloma", nichoId: String(otroId), whatsapp: "04140000009" }))).ok).toBe(false);
  });
  it("moverLead sigue las transiciones de lead y no borra la fecha; a enviado deja evento enviado", async () => {
    const r = await crearLead(fd({ nombre: "Posada Faro", fuenteLead: "referido", nichoId: String(otroId), whatsapp: "04141112233", proximoSeguimiento: "2026-11-02" }));
    if (!r.ok) throw new Error(r.mensaje);
    const id = r.datos.id;
    expect((await moverLead(id, "reunion")).ok).toBe(true);
    expect((await prisma.prospecto.findUniqueOrThrow({ where: { id } })).proximoSeguimiento).toBe("2026-11-02");
    expect((await moverLead(id, "por_contactar")).ok).toBe(false);
    expect((await moverLead(id, "respondio")).ok).toBe(true);
    expect((await moverLead(id, "enviado")).ok).toBe(true);
    expect(await prisma.evento.count({ where: { prospectoId: id, tipo: "enviado" } })).toBe(1);
    expect((await moverLead(id, "descartado", "")).ok).toBe(false);
    expect((await moverLead(id, "descartado", "no le interesó")).ok).toBe(true);
  });
  it("moverLead no toca un directorio", async () => {
    const d = await crearProspectoDePrueba(ids.nichoId, { whatsapp: "584120000077" });
    expect(await moverLead(d.id, "respondio")).toEqual({ ok: false, mensaje: expect.stringContaining("lead") });
  });
  it("guardarSiguientePaso y guardarDatosLead validan y guardan", async () => {
    const r = await crearLead(fd({ nombre: "Taller Sol", fuenteLead: "otro", nichoId: String(otroId), correo: "sol@taller.test" }));
    if (!r.ok) throw new Error(r.mensaje);
    expect((await guardarSiguientePaso(r.datos.id, "esperar su cifra", "2026-11-05")).ok).toBe(true);
    expect((await guardarSiguientePaso(r.datos.id, "x".repeat(200), "")).ok).toBe(false);
    expect((await guardarSiguientePaso(r.datos.id, "ok", "mañana")).ok).toBe(false);
    expect((await guardarDatosLead(r.datos.id, { valorEstimado: "4600", propuestaUrl: "https://ejemplo.test/p", fuenteLead: "whatsapp", nichoId: comercioId })).ok).toBe(true);
    const p = await prisma.prospecto.findUniqueOrThrow({ where: { id: r.datos.id } });
    expect(p).toMatchObject({ proximoPaso: "esperar su cifra", proximoSeguimiento: "2026-11-05", propuestaUrl: "https://ejemplo.test/p", fuenteLead: "whatsapp", nichoId: comercioId });
    expect(Number(p.valorEstimado)).toBe(4600);
  });
  it("convertirSolicitud crea el lead con fuente embudo y nicho del rubro, deja la solicitud atendida y enlazada; doble toque crea uno", async () => {
    const s = await prisma.solicitudWeb.create({ data: { nombre: "Luis", whatsapp: "04141234567", tipo: "embudo", mensaje: "Hola Neri, usé /empezar.", respuestas: JSON.stringify({ rubro: "comercio", actual: "web", objetivo: "cobros", tamano: "1", sistema: "cobros" }), calificacion: "demo", origen: "tiktok" } });
    const [a, b] = await Promise.all([convertirSolicitud(s.id), convertirSolicitud(s.id)]);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.datos.id).toBe(b.datos.id);
    expect(await prisma.prospecto.count({ where: { origen: "solicitud" } })).toBe(1);
    const p = await prisma.prospecto.findUniqueOrThrow({ where: { id: a.datos.id } });
    expect(p).toMatchObject({ esLead: true, fuenteLead: "embudo", nichoId: comercioId, whatsapp: "584141234567", proximoPaso: "escribirle" });
    expect(p.nota).toMatch(/usé \/empezar/); expect(p.nota).toMatch(/Rubro: comercio/);
    const sol = await prisma.solicitudWeb.findUniqueOrThrow({ where: { id: s.id } });
    expect(sol.prospectoId).toBe(p.id); expect(sol.atendidaEn).not.toBeNull();
    const otra = await convertirSolicitud(s.id);
    expect(otra.ok && otra.datos.id === p.id).toBe(true);
  });
  it("convertirSolicitud solo el dueno", async () => {
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
    await expect(convertirSolicitud(1)).rejects.toThrow("REDIRECT:/inicio");
  });
  it("un WhatsApp que no es celular de Venezuela o Colombia se avisa en vez de perderse", async () => {
    const r = await crearLead(fd({ nombre: "Tienda Miami", fuenteLead: "web", nichoId: String(otroId), whatsapp: "+1 305 555 1234" }));
    expect(r).toEqual({ ok: false, mensaje: expect.stringContaining("WhatsApp") });
    const s = await prisma.solicitudWeb.create({ data: { nombre: "Ana Madrid", whatsapp: "+34 600 111 222", tipo: "Software a Medida", mensaje: "Quiero una tienda" } });
    const c = await convertirSolicitud(s.id);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    const p = await prisma.prospecto.findUniqueOrThrow({ where: { id: c.datos.id } });
    expect(p.whatsapp).toBe(""); expect(p.telefono).toBe("+34 600 111 222"); expect(p.nota).toMatch(/\+34 600 111 222/);
  });
  it("el prospectador solo mueve y edita leads del directorio", async () => {
    const web = await crearLead(fd({ nombre: "Lead Web", fuenteLead: "web", nichoId: String(otroId), whatsapp: "04140000031" }));
    const dir = await crearLead(fd({ nombre: "Lead Dir", fuenteLead: "whatsapp", nichoId: String(otroId), whatsapp: "04140000032" }));
    if (!web.ok || !dir.ok) throw new Error("siembra");
    await prisma.prospecto.update({ where: { id: dir.datos.id }, data: { fuenteLead: "directorio" } });
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
    expect((await moverLead(web.datos.id, "respondio")).ok).toBe(false);
    expect((await guardarSiguientePaso(web.datos.id, "x", "")).ok).toBe(false);
    expect((await moverLead(dir.datos.id, "respondio")).ok).toBe(true);
    expect((await guardarSiguientePaso(dir.datos.id, "llamar no: escribirle", "")).ok).toBe(true);
  });
  it("crearLead guarda la fuente del dato cuando viene (alta a mano desde Maps)", async () => {
    const r = await crearLead(fd({ nombre: "Panadería Maps", fuenteLead: "otro", nichoId: String(otroId), whatsapp: "04140000033", fuente: "https://maps.app.goo.gl/abc" }));
    if (!r.ok) throw new Error(r.mensaje);
    const p = await prisma.prospecto.findUniqueOrThrow({ where: { id: r.datos.id } });
    expect(p.fuentes).toEqual(["https://maps.app.goo.gl/abc"]);
    expect(p.fuentesPorCampo).toMatchObject({ whatsapp: "https://maps.app.goo.gl/abc" });
  });
});

