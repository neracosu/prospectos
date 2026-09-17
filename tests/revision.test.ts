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
import { claveProspecto } from "@/lib/clave-prospecto";

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
    const ev = await prisma.evento.findMany({ where: { prospectoId: p.id, tipo: "importado", usuarioId: ids.prospectadorId } });
    expect(ev).toHaveLength(1);
    expect(ev[0].texto).toBe(`importado · lote ${lote}`);
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
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.datos).toMatchObject({ aprobadas: 1, fallidas: 0, quedan: 0 }); // solo "Sin Ciudad" corregida
    d2 = (await loteConDetalle(lote))!;
    expect(d2.filas.map((f) => f.decision)).toEqual(["aprobado", "completado", "aprobado", "descartado", "pendiente"]);
  });

  it("limpiarLotesViejos no toca lo pendiente ni lo reciente", async () => {
    expect(await limpiarLotesViejos(30)).toBe(0);
    expect((await loteConDetalle(lote))!.filas).toHaveLength(5);
  });

  it("completarExistente no pisa lo que ya tiene dato: solo el hueco", async () => {
    const ex = await crearProspectoDePrueba(ids.nichoId, {
      nombre: "Hotel Con Datos", ciudad: "Caracas", telefono: "0212 111 1111", web: "https://viejo.test/", email: "",
    });
    const r = await crearLote("importado", [fila({
      nombre: "Hotel Con Datos", ciudad: "Caracas", telefono: "0212 999 9999",
      web: "https://nuevo.test/", email: "nuevo@condatos.test", fuente: "https://nuevo.test/f",
    })], ids.prospectadorId);
    const f = (await loteConDetalle(r.lote))!.filas[0];
    expect(f).toMatchObject({ estado: "repetido", existenteId: ex.id });
    expect((await completarExistente(f.id)).ok).toBe(true);
    const p = await prisma.prospecto.findUniqueOrThrow({ where: { id: ex.id } });
    expect(p.telefono).toBe("0212 111 1111");  // no se piso
    expect(p.web).toBe("https://viejo.test/"); // no se piso
    expect(p.email).toBe("nuevo@condatos.test"); // el unico hueco
    const fpc = p.fuentesPorCampo as Record<string, string>;
    expect(fpc.email).toBe("https://nuevo.test/f");
    expect(fpc.telefono).toBeUndefined(); // no se anota la fuente de lo que no se escribio
    expect((await prisma.evento.findFirstOrThrow({ where: { prospectoId: ex.id, tipo: "nota" } })).texto)
      .toBe("Completado desde importado: email");
  });

  it("dos filas de lotes distintos completan el mismo existente sin pisarse", async () => {
    const ex = await crearProspectoDePrueba(ids.nichoId, { nombre: "Hotel Candado", ciudad: "Caracas", telefono: "", email: "" });
    const a = await crearLote("importado", [fila({ nombre: "Hotel Candado", ciudad: "Caracas", email: "a@candado.test", fuente: "https://a.test/" })], ids.prospectadorId);
    const b = await crearLote("web", [fila({ nombre: "Hotel Candado", ciudad: "Caracas", telefono: "0212 555 0000", fuente: "https://b.test/" })], ids.prospectadorId);
    const fa = (await loteConDetalle(a.lote))!.filas[0];
    const fb = (await loteConDetalle(b.lote))!.filas[0];
    expect([fa.existenteId, fb.existenteId]).toEqual([ex.id, ex.id]);
    const [ra, rb] = await Promise.all([completarExistente(fa.id), completarExistente(fb.id)]);
    expect([ra.ok, rb.ok]).toEqual([true, true]);
    const p = await prisma.prospecto.findUniqueOrThrow({ where: { id: ex.id } });
    expect(p.email).toBe("a@candado.test");
    expect(p.telefono).toBe("0212 555 0000");
    // Ninguna de las dos escrituras se come la fuente de la otra.
    expect(p.fuentes).toEqual(expect.arrayContaining(["https://a.test/", "https://b.test/"]));
    const fpc = p.fuentesPorCampo as Record<string, string>;
    expect(fpc.email).toBe("https://a.test/");
    expect(fpc.telefono).toBe("https://b.test/");
  });

  it("si el prospecto se crea por otra vía, la fila pasa a repetido y no se duplica", async () => {
    const r = await crearLote("importado", [fila({ nombre: "Hotel Carrera", ciudad: "Caracas", email: "c@carrera.test" })], ids.prospectadorId);
    const f = (await loteConDetalle(r.lote))!.filas[0];
    expect(f.estado).toBe("nuevo");
    const otro = await crearProspectoDePrueba(ids.nichoId, { nombre: "Hotel Carrera", ciudad: "Caracas" });
    const res = await aprobarFila(f.id);
    expect(res.ok).toBe(false);
    expect(await prisma.revision.findUniqueOrThrow({ where: { id: f.id } }))
      .toMatchObject({ estado: "repetido", decision: "pendiente", existenteId: otro.id, decididoPor: null });
    expect(await prisma.prospecto.count({ where: { nombre: "Hotel Carrera" } })).toBe(1);
  });

  it("aprobarNuevos cuenta las fallidas, lo que queda y el primer error", async () => {
    const r = await crearLote("importado", [
      fila({ nombre: "Hotel Tanda Uno", ciudad: "Caracas" }),
      fila({ nombre: "Hotel Tanda Dos", ciudad: "Caracas" }),
    ], ids.prospectadorId);
    await crearProspectoDePrueba(ids.nichoId, { nombre: "Hotel Tanda Dos", ciudad: "Caracas" });
    const res = await aprobarNuevos(r.lote);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.datos).toMatchObject({ aprobadas: 1, fallidas: 1, quedan: 0 });
      expect(res.datos.primerError).toContain("repetido");
    }
    expect((await loteConDetalle(r.lote))!.filas.map((f) => f.estado)).toEqual(["nuevo", "repetido"]);
  });

  it("un texto más largo que su tope queda en error, al importar y al corregir", async () => {
    const r = await crearLote("importado", [fila({ nombre: "H".repeat(300), ciudad: "Caracas" })], ids.prospectadorId);
    expect(r.errores).toBe(1);
    const f = (await loteConDetalle(r.lote))!.filas[0];
    expect(f.estado).toBe("error");
    expect(f.errores).toContain("El nombre no puede pasar de 120 caracteres");
    // Corregida con un nombre normal, vuelve a ser nueva.
    expect((await corregirFila(f.id, fd({ nombre: "Hotel Largo" }))).ok).toBe(true);
    expect((await loteConDetalle(r.lote))!.filas[0].estado).toBe("nuevo");
    // Y al revés: corregir con un texto largo la devuelve a error.
    expect((await corregirFila(f.id, fd({ ciudad: "C".repeat(300) }))).ok).toBe(true);
    const f2 = (await loteConDetalle(r.lote))!.filas[0];
    expect(f2.estado).toBe("error");
    expect(f2.errores).toContain("La ciudad no puede pasar de 80 caracteres");
  });

  it("el tope exacto entra: nombre de 120 y ciudad de 70 se aprueban", async () => {
    // 120 + 1 del separador + 70 son los 191 justos de la columna `clave`.
    const nombre = "N".repeat(120); const ciudad = "C".repeat(70);
    const r = await crearLote("importado", [fila({ nombre, ciudad })], ids.prospectadorId);
    expect(r).toMatchObject({ nuevos: 1, errores: 0 });
    const f = (await loteConDetalle(r.lote))!.filas[0];
    expect(f.estado).toBe("nuevo");
    expect(await aprobarFila(f.id)).toMatchObject({ ok: true });
    // La clave entra completa en su columna: la base no la trunco.
    const p = await prisma.prospecto.findFirstOrThrow({ where: { nombre } });
    expect(p.clave).toBe(claveProspecto(nombre, ciudad));
    expect(p.clave).toHaveLength(191);
  });

  it("nombre de 120 con ciudad de 80 no cabe en la clave: queda en error y no llega a la base", async () => {
    // Cada campo cabe en su tope, pero juntos dan 201 y la columna `clave` es de
    // 191. Sin la guarda del par esto terminaba en un P2000 de MySQL.
    const nombre = "P".repeat(120); const ciudad = "Q".repeat(80);
    const r = await crearLote("importado", [fila({ nombre, ciudad })], ids.prospectadorId);
    expect(r).toMatchObject({ nuevos: 0, errores: 1 });
    const f = (await loteConDetalle(r.lote))!.filas[0];
    expect(f.errores).toContain("El nombre y la ciudad juntos no pueden pasar de 191 caracteres");
    expect(await aprobarFila(f.id)).toMatchObject({ ok: false });
    expect(await prisma.prospecto.count({ where: { nombre } })).toBe(0);
  });

  it("un archivo en un campo de texto cuenta como vacío", async () => {
    const r = await crearLote("importado", [fila({ nombre: "Hotel Archivo", ciudad: "Caracas" })], ids.prospectadorId);
    const f = (await loteConDetalle(r.lote))!.filas[0];
    const formulario = new FormData();
    formulario.set("nombre", new Blob(["qué es esto"], { type: "text/plain" }), "nombre.txt");
    expect((await corregirFila(f.id, formulario)).ok).toBe(true);
    const f2 = (await loteConDetalle(r.lote))!.filas[0];
    expect(f2.estado).toBe("error");
    expect(f2.errores).toContain("Falta el nombre");
    expect(f2.datos.nombre).toBe("");
  });

  it("lotesRecientes ordena del más nuevo al más viejo con sus pendientes", async () => {
    const a = await crearLote("importado", [
      fila({ nombre: "Hotel Orden Uno", ciudad: "Caracas" }),
      fila({ nombre: "Hotel Orden Dos", ciudad: "Caracas" }),
    ], ids.prospectadorId);
    // creadoEn es DATETIME(3): sin la pausa los dos lotes pueden caer en el mismo
    // milisegundo y el orden quedaria al azar.
    await new Promise((resolver) => setTimeout(resolver, 20));
    const b = await crearLote("maps", [fila({ nombre: "Hotel Orden Tres", ciudad: "Valencia" })], ids.prospectadorId);
    expect((await descartarFila((await loteConDetalle(a.lote))!.filas[0].id)).ok).toBe(true);
    const l = await lotesRecientes();
    expect(l.slice(0, 2).map((x) => x.lote)).toEqual([b.lote, a.lote]);
    expect(l[0]).toMatchObject({ origen: "maps", total: 1, pendientes: 1 });
    expect(l[1]).toMatchObject({ origen: "importado", total: 2, pendientes: 1 });
  });

  it("descartarFila distingue la fila que no existe de la ya decidida", async () => {
    const r = await crearLote("importado", [fila({ nombre: "Hotel Descarte", ciudad: "Caracas" })], ids.prospectadorId);
    const f = (await loteConDetalle(r.lote))!.filas[0];
    expect((await descartarFila(f.id)).ok).toBe(true);
    expect(await descartarFila(f.id)).toMatchObject({ ok: false, mensaje: "Esa fila ya se decidió." });
    expect(await descartarFila(f.id + 100000)).toMatchObject({ ok: false, mensaje: "Esa fila ya no existe." });
  });

  it("sin sesion nada se aprueba", async () => {
    sesionFalsa.actual = null;
    await expect(descartarFila(1)).rejects.toThrow("REDIRECT:/entrar");
  });
});
