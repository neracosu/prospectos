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
import { crearLote, loteConDetalle, lotesRecientes, limpiarLotesViejos } from "@/lib/revision";
import { aprobarFila, completarExistente, descartarFila, corregirFila, aprobarNuevos } from "@/acciones/revision";
import { validarFila, COLUMNAS, type Columna } from "@/lib/tabla-contrato";

const fila = (o: Partial<Record<Columna, string>>) =>
  validarFila({
    ...(Object.fromEntries(COLUMNAS.map((c) => [c, ""])) as Record<Columna, string>),
    nicho: "hoteles", fuente: "https://f.test/", ...o,
  });
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe.runIf(DB_HABILITADA)("bandeja de revision", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  let lote: string;
  beforeAll(async () => {
    await limpiarBase(); ids = await sembrarBasico();
    await crearProspectoDePrueba(ids.nichoId, { nombre: "Hotel Existente", ciudad: "Caracas", whatsapp: "", email: "" });
  });
  beforeEach(() => { sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" }; });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("crearLote clasifica nuevo / repetido (base y mismo lote) / error", async () => {
    const r = await crearLote("importado", [
      fila({ nombre: "Hotel Nuevo", ciudad: "Caracas", whatsapp: "0412 111 11 11" }),
      fila({ nombre: "HOTEL EXISTENTE", ciudad: "caracas", email: "info@existente.com" }),
      fila({ nombre: "Sin Ciudad", ciudad: "" }),
      fila({ nombre: "Hotel Nuevo", ciudad: "Caracas" }), // repetido dentro del lote
      fila({ nicho: "raro", nombre: "Otro", ciudad: "Valencia" }),
    ], ids.prospectadorId);
    expect(r).toMatchObject({ nuevos: 1, repetidos: 2, errores: 2 });
    lote = r.lote;
    const d = (await loteConDetalle(lote))!;
    expect(d.filas.map((f) => f.estado)).toEqual(["nuevo", "repetido", "error", "repetido", "error"]);
    expect(d.filas[1].existente?.nombre).toBe("Hotel Existente");
    expect(d.filas[3].errores).toContain("Repetido en el mismo archivo");
    expect(d.filas[4].errores).toContain("Nicho desconocido");
    expect((await lotesRecientes())[0]).toMatchObject({ lote, pendientes: 5, total: 5 });
  });

  it("aprobarFila crea el prospecto con fuentes y evento; dos toques, uno", async () => {
    const d = (await loteConDetalle(lote))!;
    const [a, b] = await Promise.all([aprobarFila(d.filas[0].id), aprobarFila(d.filas[0].id)]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const p = await prisma.prospecto.findFirstOrThrow({ where: { nombre: "Hotel Nuevo" } });
    expect(p).toMatchObject({ origen: "importado", whatsapp: "584121111111", etapa: "por_contactar", fuentes: ["https://f.test/"] });
    expect((p.fuentesPorCampo as Record<string, string>).whatsapp).toBe("https://f.test/");
    expect(await prisma.evento.count({ where: { prospectoId: p.id, tipo: "importado", usuarioId: ids.prospectadorId } })).toBe(1);
    expect((await loteConDetalle(lote))!.filas[0].decision).toBe("aprobado");
    expect((await aprobarFila(d.filas[1].id)).ok).toBe(false); // repetido no se aprueba
  });

  it("completarExistente rellena solo huecos y suma la fuente", async () => {
    const d = (await loteConDetalle(lote))!;
    expect((await completarExistente(d.filas[1].id)).ok).toBe(true);
    const e = await prisma.prospecto.findFirstOrThrow({ where: { nombre: "Hotel Existente" } });
    expect(e.email).toBe("info@existente.com");
    expect(e.nombre).toBe("Hotel Existente"); // no se piso el nombre
    expect(e.fuentes).toContain("https://f.test/");
    expect(await prisma.evento.count({ where: { prospectoId: e.id, tipo: "nota" } })).toBe(1);
    expect((await completarExistente(d.filas[1].id)).ok).toBe(false); // ya decidido
  });

  it("corregirFila revalida y cambia el estado; descartar y aprobarNuevos", async () => {
    const d = (await loteConDetalle(lote))!;
    expect((await corregirFila(d.filas[2].id, fd({ ciudad: "Mérida" }))).ok).toBe(true);
    let d2 = (await loteConDetalle(lote))!;
    expect(d2.filas[2].estado).toBe("nuevo");
    expect((await descartarFila(d.filas[3].id)).ok).toBe(true);
    const r = await aprobarNuevos(lote);
    expect(r.ok && r.datos.aprobadas).toBe(1); // solo "Sin Ciudad" corregida
    d2 = (await loteConDetalle(lote))!;
    expect(d2.filas.map((f) => f.decision)).toEqual(["aprobado", "completado", "aprobado", "descartado", "pendiente"]);
  });

  it("limpiarLotesViejos no toca lo pendiente ni lo reciente", async () => {
    expect(await limpiarLotesViejos(30)).toBe(0);
    expect((await loteConDetalle(lote))!.filas).toHaveLength(5);
  });

  it("sin sesion nada se aprueba", async () => {
    sesionFalsa.actual = null;
    await expect(descartarFila(1)).rejects.toThrow("REDIRECT:/entrar");
  });
});
