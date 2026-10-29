import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, crearProspectoDePrueba } from "./ayuda-db";
import { investigarProspecto, leerFicha, guardarFicha, depurarYMarcar } from "@/lib/fichas";
import type { descargar } from "@/lib/red-segura";

const fx = (n: string) => readFileSync(path.join(import.meta.dirname, "fixtures", "webs", n), "utf8");
// descargar falso: nunca sale a internet; lo que no esta en el mapa "no abre"
const falsoCon = (mapa: Record<string, string>): typeof descargar => (async (url: string) =>
  url in mapa ? { ok: true, estado: 200, urlFinal: url, texto: mapa[url] } : { ok: false, motivo: "no abre" }) as typeof descargar;

describe.runIf(DB_HABILITADA)("fichas de negocio", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  let nichoRestaurantes = 0;
  beforeAll(async () => {
    await limpiarBase(); ids = await sembrarBasico();
    nichoRestaurantes = (await prisma.nicho.create({ data: { slug: "restaurantes-y-bares", nombre: "Restaurantes", mensajeInicial: "Hola, {nombre}", mensajeSeguimiento: "Hola, {nombre}", plantillaPropuesta: "restaurantes-y-bares" } })).id;
  });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("investiga con la web del fixture: ficha lista, gancho y fuentes, y evento ficha_generada", async () => {
    const p = await crearProspectoDePrueba(nichoRestaurantes, { nombre: "La Trattoria", email: "a@x.test", web: "https://ejemplo.test/" });
    const r = await investigarProspecto(p.id, { descargar: falsoCon({ "https://ejemplo.test/": fx("restaurante-carta-pdf.html") }), cruzar: () => null, pausaMs: 0 });
    expect(r.estado).toBe("lista"); expect(r.gancho).toContain("carta");
    const f = await leerFicha(p.id); expect(f?.fuentes).toContain("https://ejemplo.test/");
    expect(await prisma.evento.count({ where: { prospectoId: p.id, tipo: "ficha_generada" } })).toBe(1);
  });

  it("volver a investigar no pisa un gancho revisado por Neri", async () => {
    const p = await crearProspectoDePrueba(nichoRestaurantes, { nombre: "La Trattoria Dos", email: "b@x.test", web: "https://ejemplo.test/" });
    const deps = { descargar: falsoCon({ "https://ejemplo.test/": fx("restaurante-carta-pdf.html") }), cruzar: () => null, pausaMs: 0 };
    await investigarProspecto(p.id, deps);
    await guardarFicha(p.id, { gancho: "Gancho de Neri.", resumen: "Resumen de Neri." }, ids.usuarioId);
    await investigarProspecto(p.id, deps);
    const f = await leerFicha(p.id);
    expect(f?.gancho).toBe("Gancho de Neri."); expect(f?.resumen).toBe("Resumen de Neri."); expect(f?.estado).toBe("revisada");
    expect(f?.revisadaEn).not.toBeNull();
  });

  it("sin web ni redes queda sin_hallazgos con el resumen de la base", async () => {
    const p = await prisma.prospecto.update({ where: { id: (await crearProspectoDePrueba(nichoRestaurantes, { nombre: "Sin Nada", ciudad: "Valencia", email: "c@x.test" })).id }, data: { tipo: "pizzeria" } });
    const r = await investigarProspecto(p.id, { descargar: falsoCon({}), cruzar: () => null, pausaMs: 0 });
    expect(r.estado).toBe("sin_hallazgos"); expect(r.gancho).toBe("");
    const f = await leerFicha(p.id);
    expect(f?.resumen).toContain("pizzeria"); expect(f?.resumen).toContain("Valencia");
  });

  it("depurarYMarcar: la principal al automatico, la duplicada descartada con nota, gob.ve excluida", async () => {
    await prisma.fichaNegocio.deleteMany(); await prisma.evento.deleteMany(); await prisma.prospecto.deleteMany();
    const a = await crearProspectoDePrueba(nichoRestaurantes, { nombre: "Dup A", email: "Mismo@X.test", web: "https://a.test/", instagram: "@a" });
    const b = await crearProspectoDePrueba(nichoRestaurantes, { nombre: "Dup B", email: "mismo@x.test" });
    const g = await crearProspectoDePrueba(nichoRestaurantes, { nombre: "Alcaldia", email: "info@alcaldia.gob.ve" });
    const ensayo = await depurarYMarcar(false);
    expect(ensayo).toEqual({ cola: 1, duplicadas: 1, excluidas: { correo_estado: 1 } });
    expect(await prisma.fichaNegocio.count()).toBe(0);
    await depurarYMarcar(true);
    expect((await leerFicha(a.id))?.alAutomatico).toBe(true);
    expect(await leerFicha(g.id)).toBeNull();
    expect((await prisma.prospecto.findUniqueOrThrow({ where: { id: b.id } })).etapa).toBe("descartado");
    const nota = await prisma.evento.findFirstOrThrow({ where: { prospectoId: b.id, tipo: "nota" } });
    expect(nota.texto).toBe(`mismo correo que #${a.id}`);
  });
});


describe.runIf(DB_HABILITADA)("modelos de ficha y correo", () => {
  beforeAll(async () => { await limpiarBase(); });
  afterAll(async () => { await limpiarBase(); });
  it("una ficha por prospecto, hallazgos vacios por defecto, token unico por envio", async () => {
    const ids = await sembrarBasico();
    const p = await crearProspectoDePrueba(ids.nichoId, { nombre: "Bodegón Uno", email: "uno@x.test" });
    const f = await prisma.fichaNegocio.create({ data: { prospectoId: p.id } });
    expect(f.hallazgos).toEqual({});
    expect(f.estado).toBe("sin_hallazgos");
    expect(f.alAutomatico).toBe(false);
    await expect(prisma.fichaNegocio.create({ data: { prospectoId: p.id } })).rejects.toThrow();
    await prisma.envioCorreo.create({ data: { prospectoId: p.id, token: "a".repeat(22), tipo: "inicial", asunto: "x", para: "uno@x.test" } });
    await expect(prisma.envioCorreo.create({ data: { prospectoId: p.id, token: "a".repeat(22), tipo: "inicial", asunto: "x", para: "uno@x.test" } })).rejects.toThrow();
    await prisma.correoBloqueado.create({ data: { email: "uno@x.test", motivo: "no_quiere" } });
  });
});
