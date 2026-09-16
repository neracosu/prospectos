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
import { DB_HABILITADA, limpiarBase, sembrarBasico, sembrarCliente, sembrarProyecto } from "./ayuda-db";
import { sesionFalsa } from "./ayuda-sesion";
import { publicarVersion, editarVersion, marcarAvisada } from "@/acciones/versiones";
import { fichaProyecto } from "@/lib/proyectos";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe.runIf(DB_HABILITADA)("versiones", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  let proyectoId: number;
  beforeAll(async () => {
    await limpiarBase(); ids = await sembrarBasico();
    const c = await sembrarCliente({ nombre: "Hotel Versiones", whatsapp: "584127777777" });
    proyectoId = (await sembrarProyecto(c.id, ids.nichoId, { estado: "activo" })).id;
  });
  beforeEach(() => { sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" }; });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("publica desde markdown, exige semver creciente y unico", async () => {
    const md = "### Nuevo\n- Reporte de ocupación\n### Arreglo\n- Cierre de caja";
    expect((await publicarVersion(fd({ proyectoId: String(proyectoId), version: "v1.0.0", fecha: "2026-09-10", markdown: md }))).ok).toBe(false);
    expect((await publicarVersion(fd({ proyectoId: String(proyectoId), version: "1.0.0", fecha: "2026-09-10", markdown: "" }))).ok).toBe(false); // sin cambios
    const r = await publicarVersion(fd({ proyectoId: String(proyectoId), version: "1.0.0", fecha: "2026-09-10", markdown: md }));
    expect(r.ok).toBe(true);
    expect(await prisma.evento.count({ where: { proyectoId, tipo: "version_publicada" } })).toBe(1); // version y evento van juntos (misma transaccion)
    expect((await publicarVersion(fd({ proyectoId: String(proyectoId), version: "1.0.0", fecha: "2026-09-11", markdown: md }))).ok).toBe(false); // repetida
    expect((await publicarVersion(fd({ proyectoId: String(proyectoId), version: "0.9.0", fecha: "2026-09-11", markdown: md }))).ok).toBe(false); // menor
    const f = (await fichaProyecto(proyectoId, "2026-09-16"))!;
    expect(f.versionActual).toBe("1.0.0");
    expect(f.versiones[0].cambios.map((c) => [c.tipo, c.texto])).toEqual([["nuevo", "Reporte de ocupación"], ["arreglo", "Cierre de caja"]]);
    expect(await prisma.evento.count({ where: { proyectoId, tipo: "version_publicada" } })).toBe(1);
  });

  it("publica desde JSON de cambios y ordena numericamente", async () => {
    const r = await publicarVersion(fd({ proyectoId: String(proyectoId), version: "1.10.0", fecha: "2026-09-12", cambios: JSON.stringify([{ tipo: "mejora", texto: "Búsqueda más rápida" }]) }));
    expect(r.ok).toBe(true);
    await publicarVersion(fd({ proyectoId: String(proyectoId), version: "1.10.1", fecha: "2026-09-13", cambios: JSON.stringify([{ tipo: "arreglo", texto: "Tilde" }]) }));
    const f = (await fichaProyecto(proyectoId, "2026-09-16"))!;
    expect(f.versiones.map((v) => v.version)).toEqual(["1.10.1", "1.10.0", "1.0.0"]);
    expect((await publicarVersion(fd({ proyectoId: String(proyectoId), version: "2.0.0", fecha: "2026-09-13", cambios: JSON.stringify([{ tipo: "raro", texto: "x" }]) }))).ok).toBe(false);
  });

  it("editar solo antes de avisar; avisar fija avisadoEn y devuelve el enlace", async () => {
    const v = await prisma.version.findFirstOrThrow({ where: { proyectoId, version: "1.10.1" } });
    expect((await editarVersion(fd({ id: String(v.id), proyectoId: String(proyectoId), version: "1.10.1", fecha: "2026-09-14", cambios: JSON.stringify([{ tipo: "arreglo", texto: "Tilde en reportes" }]) }))).ok).toBe(true);
    const a = await marcarAvisada(v.id);
    expect(a.ok).toBe(true);
    if (a.ok) { expect(a.datos.href).toMatch(/^https:\/\/wa\.me\/584127777777\?text=/); expect(decodeURIComponent(a.datos.href!)).toContain("1.10.1"); }
    expect(await prisma.evento.count({ where: { proyectoId, tipo: "aviso_cliente" } })).toBe(1); // update y evento van juntos (misma transaccion)
    const otra = await marcarAvisada(v.id);
    expect(otra.ok).toBe(false);
    if (!otra.ok) expect(otra.mensaje).toBe("Esta versión ya se avisó."); // ya avisada, sin duplicar el evento
    expect(await prisma.evento.count({ where: { proyectoId, tipo: "aviso_cliente" } })).toBe(1);
    expect((await editarVersion(fd({ id: String(v.id), proyectoId: String(proyectoId), version: "1.10.1", fecha: "2026-09-14", cambios: JSON.stringify([{ tipo: "arreglo", texto: "otra" }]) }))).ok).toBe(false);
    const d = await prisma.version.findUniqueOrThrow({ where: { id: v.id }, include: { cambios: true } });
    expect(d.avisadoEn).not.toBeNull();
    expect(d.cambios[0].texto).toBe("Tilde en reportes");
  });
});
