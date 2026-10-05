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
import { DB_HABILITADA, limpiarBase, sembrarBasico } from "./ayuda-db";
import { sesionFalsa } from "./ayuda-sesion";
import { ciudadPorSlug } from "@/lib/overpass-contrato";
import { reglaDeNicho, type LugarOverture } from "@/lib/overture-contrato";
import { lugaresDeOverture, publicacionCargada, reemplazarLugares } from "@/lib/overture";
import { buscarOverture } from "@/acciones/buscar";
import { claveProspecto } from "@/lib/clave-prospecto";
import { generarCodigo } from "@/lib/codigo";

const caracas = ciudadPorSlug("caracas")!;
const PUB = "2026-09-23.1";
const lugar = (id: string, extra: Partial<LugarOverture> = {}): LugarOverture => ({
  id, nombre: `Arepera ${id}`, categoriaBase: "restaurant", categoriaFina: "venezuelan_restaurant",
  lat: 10.4806, lon: -66.9036, direccion: "", telefonos: "+584141234567", correos: "", webs: "",
  redes: `https://www.facebook.com/${id}`, confianza: 0.9, publicacion: PUB, ...extra,
});

describe.runIf(DB_HABILITADA)("directorio abierto: tabla", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  beforeAll(async () => { await limpiarBase(); ids = await sembrarBasico(); });
  beforeEach(async () => {
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
    await prisma.revision.deleteMany(); await prisma.lugarOverture.deleteMany();
  });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("sin cargar no hay publicacion; cargado, la dice", async () => {
    expect(await publicacionCargada()).toBeNull();
    expect(await reemplazarLugares([lugar("a"), lugar("b")])).toBe(2);
    expect(await publicacionCargada()).toBe(PUB);
  });

  it("reemplazar borra lo anterior y si falla a medias no cambia nada", async () => {
    await reemplazarLugares([lugar("a"), lugar("b")]);
    await reemplazarLugares([lugar("c", { publicacion: "2026-10-21.0" })]);
    expect((await prisma.lugarOverture.findMany()).map((l) => l.id)).toEqual(["c"]);
    // Dos filas con el mismo id revientan el createMany: la transaccion deja la tabla como estaba.
    await expect(reemplazarLugares([lugar("x"), lugar("x")])).rejects.toThrow();
    expect((await prisma.lugarOverture.findMany()).map((l) => l.id)).toEqual(["c"]);
  });

  it("trae solo la caja de la ciudad y las categorias de la regla", async () => {
    await reemplazarLugares([
      lugar("centro"),
      lugar("valencia", { lat: 10.162, lon: -68.0077 }),
      lugar("farmacia", { categoriaBase: "pharmacy_and_drug_store" }),
      lugar("emoji", { nombre: "Café 🌮 Ñandú" }),
    ]);
    const r = await lugaresDeOverture(reglaDeNicho("restaurantes-y-bares")!, caracas);
    expect(r.map((l) => l.id).sort()).toEqual(["centro", "emoji"]);
    expect(r.find((l) => l.id === "emoji")!.nombre).toBe("Café 🌮 Ñandú");
  });
});

describe.runIf(DB_HABILITADA)("directorio abierto: buscarOverture", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  let restaurantes: number;
  const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
  const buscar = (extra: Record<string, string> = {}) =>
    buscarOverture(fd({ nichoId: String(restaurantes), ciudad: "caracas", soloContactables: "on", ...extra }));
  const filasDe = (lote: string) => prisma.revision.findMany({ where: { lote }, orderBy: { fila: "asc" } });

  beforeAll(async () => {
    await limpiarBase(); ids = await sembrarBasico();
    restaurantes = (await prisma.nicho.create({ data: {
      slug: "restaurantes-y-bares", nombre: "Restaurantes y bares", mensajeInicial: "Hola {nombre}: {enlace}",
      mensajeSeguimiento: "Hola de nuevo {nombre}: {enlace}", plantillaPropuesta: "restaurantes-y-bares", diasSeguimiento: 3,
    } })).id;
  });
  beforeEach(async () => {
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
    await prisma.revision.deleteMany(); await prisma.prospecto.deleteMany(); await prisma.lugarOverture.deleteMany();
  });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("sin sesion no pasa", async () => {
    sesionFalsa.actual = null;
    await expect(buscar()).rejects.toThrow("REDIRECT:/entrar");
  });

  it("dice por que no hay nada: datos invalidos, nicho sin equivalencia, tabla vacia, combinacion sin fichas", async () => {
    expect(await buscar({ ciudad: "Caracas; DROP" })).toEqual({ ok: false, mensaje: "Elige nicho y ciudad." });
    expect(await buscar({ ciudad: "atlantida" })).toEqual({ ok: false, mensaje: "Elige nicho y ciudad." });
    expect(await buscar({ nichoId: "999999" })).toEqual({ ok: false, mensaje: "Elige nicho y ciudad." });
    expect(await buscar({ nichoId: String(ids.nichoId) })).toEqual({ ok: false, mensaje: "Este nicho no está en el directorio." });
    expect(await buscar()).toEqual({ ok: false, mensaje: "El directorio no está cargado todavía." });
    await reemplazarLugares([lugar("farmacia", { categoriaBase: "pharmacy_and_drug_store" })]);
    expect(await buscar()).toEqual({ ok: false, mensaje: "El directorio no tiene negocios de ese nicho en esa ciudad." });
    expect(await prisma.revision.count()).toBe(0);
  });

  it("crea un lote con origen overture, la publicacion y la fuente de cada dato", async () => {
    await reemplazarLugares([lugar("uno"), lugar("dos"), lugar("lejos", { lat: 10.162, lon: -68.0077 })]);
    const r = await buscar();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.datos).toMatchObject({ nuevos: 2, repetidos: 0, errores: 0, publicacion: PUB });
    const filas = await filasDe(r.datos.lote);
    expect(filas.map((f) => f.origen)).toEqual(["overture", "overture"]);
    expect(filas[0].usuarioId).toBe(ids.prospectadorId);
    const datos = filas[0].datos as { whatsapp: string; fuentes: string[]; fuentesPorCampo: Record<string, string> };
    expect(datos.whatsapp).toBe("584141234567");
    expect(datos.fuentesPorCampo.whatsapp).toBe(datos.fuentes[0]);
    expect(datos.fuentes[0]).toMatch(/^https:\/\/www\.facebook\.com\//);
  });

  it("la casilla sin marcar deja entrar lo que no tiene telefono ni correo", async () => {
    await reemplazarLugares([lugar("mudo", { telefonos: "", correos: "" }), lugar("habla")]);
    const con = await buscar();
    expect(con.ok && con.datos.nuevos).toBe(1);
    await prisma.revision.deleteMany();
    const f = fd({ nichoId: String(restaurantes), ciudad: "caracas" });
    const sin = await buscarOverture(f);
    expect(sin.ok && sin.datos.nuevos).toBe(2);
  });

  it("un prospecto que ya existe sin telefono queda como repetido por decidir; uno que ya lo tiene todo nace descartado", async () => {
    const existente = (nombre: string, extra: Record<string, string>) => prisma.prospecto.create({ data: {
      nichoId: restaurantes, nombre, ciudad: "Caracas", fuentes: ["https://ejemplo.test/"], codigo: generarCodigo(),
      clave: claveProspecto(nombre, "Caracas"), ...extra } });
    const falta = await existente("Arepera falta", {});
    // "Completa" es completa en TODO lo que la bandeja cuenta como aporte (CAMPOS_CONTACTO incluye estado y tipo).
    await existente("Arepera completa", { telefono: "+584141234567", whatsapp: "584141234567", facebook: "https://www.facebook.com/completa", estado: "Distrito Capital", tipo: "arepera" });
    await reemplazarLugares([lugar("falta"), lugar("completa")]);
    const r = await buscar();
    expect(r.ok && r.datos).toMatchObject({ nuevos: 0, repetidos: 2 });
    const filas = await filasDe((r as { datos: { lote: string } }).datos.lote);
    const porNombre = (n: string) => filas.find((f) => (f.datos as { nombre: string }).nombre === n)!;
    expect(porNombre("Arepera falta")).toMatchObject({ estado: "repetido", decision: "pendiente", existenteId: falta.id });
    expect(porNombre("Arepera completa")).toMatchObject({ estado: "repetido", decision: "descartado" });
  });

  it("el mismo negocio dos veces en el directorio da una fila nueva y una repetida", async () => {
    await reemplazarLugares([lugar("x1", { nombre: "Arepera Doble" }), lugar("x2", { nombre: "Arepera Doble" })]);
    const r = await buscar();
    expect(r.ok && r.datos).toMatchObject({ nuevos: 1, repetidos: 1 });
  });

  it("buscar dos veces lo mismo no deja nada nuevo que aprobar en el segundo lote", async () => {
    await reemplazarLugares([lugar("uno"), lugar("dos")]);
    const a = await buscar();
    const b = await buscar();
    expect(a.ok && a.datos.nuevos).toBe(2);
    expect(b.ok && b.datos).toMatchObject({ nuevos: 0, repetidos: 2 });
    const filas = await filasDe((b as { datos: { lote: string } }).datos.lote);
    expect(filas.every((f) => f.decision === "descartado")).toBe(true);
  });

  it("un nombre de mas de 120 caracteres entra marcado como error, no revienta", async () => {
    await reemplazarLugares([lugar("largo", { nombre: "A".repeat(150) })]);
    const r = await buscar();
    expect(r.ok && r.datos).toMatchObject({ nuevos: 0, errores: 1 });
  });
});
