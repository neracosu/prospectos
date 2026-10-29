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
vi.mock("@/lib/propuesta", async (orig) => {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const path = await import("node:path");
  const real = await orig<typeof import("@/lib/propuesta")>();
  return { ...real, generarPdf: async (codigo: string) => { const r = path.join(mkdtempSync(path.join(tmpdir(), "pdf-")), `${codigo}.pdf`); writeFileSync(r, "%PDF-1.4 falso"); return r; } };
});

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, crearProspectoDePrueba } from "./ayuda-db";
import { sesionFalsa } from "./ayuda-sesion";
import { guardarGancho, reinvestigar, bloquearCorreo, ponerAlAutomatico, enviarPropuestaCorreo } from "@/acciones/correos";
import { guardarConfig } from "@/lib/configuracion";
import { _transporteParaTests } from "@/lib/correo-envio";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe.runIf(DB_HABILITADA)("acciones de correo: la ficha", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  beforeAll(async () => { await limpiarBase(); ids = await sembrarBasico(); });
  beforeEach(() => { sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" }; });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("guardarGancho acepta 280 limpios y rechaza HTML, saltos y 281", async () => {
    const p = await crearProspectoDePrueba(ids.nichoId, {});
    const ok = await guardarGancho(p.id, fd({ gancho: "a".repeat(280), resumen: "Resumen" }));
    expect(ok.ok).toBe(true);
    const f = await prisma.fichaNegocio.findUniqueOrThrow({ where: { prospectoId: p.id } });
    expect(f.gancho).toHaveLength(280);
    expect(f.estado).toBe("revisada");
    expect(await prisma.evento.count({ where: { prospectoId: p.id, tipo: "ficha_revisada" } })).toBe(1);
    const MSG = "El gancho va en una sola línea, sin HTML, de hasta 280 caracteres.";
    for (const malo of ["a".repeat(281), "hola <b>x</b>", "dos\nlineas", "con > flecha"]) {
      expect(await guardarGancho(p.id, fd({ gancho: malo, resumen: "" }))).toEqual({ ok: false, mensaje: MSG });
    }
    expect((await prisma.fichaNegocio.findUniqueOrThrow({ where: { prospectoId: p.id } })).gancho).toHaveLength(280);
  });
  it("guardarGancho deja la ficha revisada y no la pisa una reinvestigacion", async () => {
    const p = await crearProspectoDePrueba(ids.nichoId, {});
    await guardarGancho(p.id, fd({ gancho: "Mi gancho a mano", resumen: "Mi resumen" }));
    const r = await reinvestigar(p.id);
    expect(r.ok).toBe(true);
    const f = await prisma.fichaNegocio.findUniqueOrThrow({ where: { prospectoId: p.id } });
    expect(f).toMatchObject({ gancho: "Mi gancho a mano", resumen: "Mi resumen", estado: "revisada" });
    if (r.ok) expect(r.datos.estado).toBe("revisada");
    // una por minuto por prospecto
    expect(await reinvestigar(p.id)).toEqual({ ok: false, mensaje: expect.stringContaining("minuto") });
  });
  it("bloquearCorreo normaliza y bloquea a todas las filas con esa direccion", async () => {
    const a = await crearProspectoDePrueba(ids.nichoId, { email: "Info@X.test" });
    const b = await crearProspectoDePrueba(ids.nichoId, { email: "info@x.test" });
    expect((await bloquearCorreo(a.id, "no_quiere")).ok).toBe(true);
    const filas = await prisma.correoBloqueado.findMany({ where: { email: { contains: "x.test" } } });
    expect(filas).toEqual([expect.objectContaining({ email: "info@x.test", motivo: "no_quiere" })]);
    expect((await bloquearCorreo(b.id, "rebote")).ok).toBe(true); // upsert, no duplica
    expect(await prisma.correoBloqueado.count({ where: { email: "info@x.test" } })).toBe(1);
    expect(await prisma.evento.count({ where: { prospectoId: a.id, tipo: "correo_bloqueado" } })).toBe(1);
  });
  it("bloquearCorreo falla sin correo y con motivo raro", async () => {
    const p = await crearProspectoDePrueba(ids.nichoId, { email: "" });
    expect((await bloquearCorreo(p.id, "no_quiere")).ok).toBe(false);
    const q = await crearProspectoDePrueba(ids.nichoId, { email: "q@x.test" });
    expect((await bloquearCorreo(q.id, "otro" as never)).ok).toBe(false);
  });
  it("ponerAlAutomatico marca y desmarca", async () => {
    const p = await crearProspectoDePrueba(ids.nichoId, {});
    expect((await ponerAlAutomatico(p.id, true)).ok).toBe(true);
    expect((await prisma.fichaNegocio.findUniqueOrThrow({ where: { prospectoId: p.id } })).alAutomatico).toBe(true);
    expect((await ponerAlAutomatico(p.id, false)).ok).toBe(true);
    expect((await prisma.fichaNegocio.findUniqueOrThrow({ where: { prospectoId: p.id } })).alAutomatico).toBe(false);
  });
  it("el prospectador no puede: fallo sin tocar la base", async () => {
    const p = await crearProspectoDePrueba(ids.nichoId, { email: "z@x.test" });
    sesionFalsa.actual = { id: ids.usuarioId, nombre: "Pro", rol: "prospectador" };
    await expect(guardarGancho(p.id, fd({ gancho: "x", resumen: "" }))).rejects.toThrow("REDIRECT");
    await expect(reinvestigar(p.id)).rejects.toThrow("REDIRECT");
    await expect(bloquearCorreo(p.id, "no_quiere")).rejects.toThrow("REDIRECT");
    await expect(ponerAlAutomatico(p.id, true)).rejects.toThrow("REDIRECT");
    expect(await prisma.fichaNegocio.count({ where: { prospectoId: p.id } })).toBe(0);
    expect(await prisma.correoBloqueado.count({ where: { email: "z@x.test" } })).toBe(0);
  });
});

describe.runIf(DB_HABILITADA)("acciones de correo: enviar a mano", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  beforeAll(async () => { await limpiarBase(); ids = await sembrarBasico(); });
  beforeEach(async () => {
    sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" };
    await prisma.evento.deleteMany(); await prisma.envioCorreo.deleteMany(); await prisma.fichaNegocio.deleteMany(); await prisma.prospecto.deleteMany(); await prisma.configuracion.deleteMany();
    _transporteParaTests({ sendMail: async () => ({ messageId: "m" }) });
  });
  afterAll(async () => { _transporteParaTests(null); await limpiarBase(); await prisma.$disconnect(); });

  const listo = async () => {
    const p = await crearProspectoDePrueba(ids.nichoId, { email: `a${Math.random().toString(36).slice(2, 8)}@ejemplo.test` });
    await prisma.fichaNegocio.create({ data: { prospectoId: p.id, gancho: "Un gancho", estado: "revisada" } });
    return p;
  };

  it("enviarPropuestaCorreo respeta el tope diario y el rol", async () => {
    await guardarConfig("correos_por_dia", "2");
    const [a, b, c] = [await listo(), await listo(), await listo()];
    const r1 = await enviarPropuestaCorreo(a.id);
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.datos.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect((await enviarPropuestaCorreo(b.id)).ok).toBe(true);
    expect(await enviarPropuestaCorreo(c.id)).toEqual({ ok: false, mensaje: "Hoy ya salieron 2 de 2. Suba el tope en Ajustes o espere a mañana." });
    expect(await prisma.envioCorreo.count({ where: { prospectoId: c.id } })).toBe(0);
    expect(await enviarPropuestaCorreo(-1)).toEqual({ ok: false, mensaje: "Ese prospecto no existe." });
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
    await expect(enviarPropuestaCorreo(c.id)).rejects.toThrow("REDIRECT");
  });
});
