import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, crearProspectoDePrueba } from "./ayuda-db";
import { colaDelDia, seguimientosQueTocan, resumenHoy, buscarProspectos, fichaProspecto, resumenProspectos } from "@/lib/prospectos";
import { hoyCaracas } from "@/lib/fecha-caracas";

describe.runIf(DB_HABILITADA)("consultas de prospectos", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  beforeAll(async () => {
    await limpiarBase();
    ids = await sembrarBasico();
    await crearProspectoDePrueba(ids.nichoId, { nombre: "Solo IG", instagram: "https://www.instagram.com/x/", ordenCola: 1 });
    await crearProspectoDePrueba(ids.nichoId, { nombre: "Con WA", whatsapp: "584120000000", ordenCola: 2 });
    const enviadoViejo = await crearProspectoDePrueba(ids.nichoId, { nombre: "Enviado viejo", whatsapp: "584120000001", etapa: "enviado", proximoSeguimiento: "2026-09-10" });
    await crearProspectoDePrueba(ids.nichoId, { nombre: "Enviado futuro", whatsapp: "584120000002", etapa: "enviado", proximoSeguimiento: "2026-09-20" });
    const abierto = await crearProspectoDePrueba(ids.nichoId, { nombre: "Abierto", whatsapp: "584120000003", etapa: "enviado", proximoSeguimiento: "2026-09-16" });
    // etapa "ganado": no debe alterar los conteos de por_contactar/enviado ni la cola de abajo.
    await crearProspectoDePrueba(ids.nichoId, { nombre: "Con Web", etapa: "ganado", web: "https://ejemplo.test/" });
    // Historial de "Abierto": fechas fijas y lejanas de la ventana de resumenHoy de
    // abajo, para que este par no se cuente sin querer ahi. Evento mas viejo primero
    // para que "enviado" quede mas nuevo, sin depender del orden de insercion.
    await prisma.evento.create({ data: { prospectoId: abierto.id, tipo: "abierto", creadoEn: new Date("2020-01-01T00:00:00-04:00") } });
    await prisma.evento.create({ data: { prospectoId: abierto.id, tipo: "enviado", canal: "whatsapp", usuarioId: ids.usuarioId, creadoEn: new Date("2020-01-01T00:01:00-04:00") } });
    // Ventana de resumenHoy: dos envios dentro de los limites del 16-sep y uno ya en el 17.
    await prisma.evento.create({ data: { prospectoId: enviadoViejo.id, tipo: "enviado", canal: "whatsapp", usuarioId: ids.usuarioId, creadoEn: new Date("2026-09-16T00:00:00-04:00") } });
    await prisma.evento.create({ data: { prospectoId: enviadoViejo.id, tipo: "enviado", canal: "whatsapp", usuarioId: ids.usuarioId, creadoEn: new Date("2026-09-16T23:59:59-04:00") } });
    await prisma.evento.create({ data: { prospectoId: enviadoViejo.id, tipo: "enviado", canal: "whatsapp", usuarioId: ids.usuarioId, creadoEn: new Date("2026-09-17T00:00:01-04:00") } });
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
    const r16 = await resumenHoy("2026-09-16");
    expect(r16.embudo.por_contactar).toBe(2);
    expect(r16.embudo.enviado).toBe(3);
    const neri16 = r16.porUsuario.find((u) => u.id === ids.usuarioId)!;
    expect(neri16.meta).toBe(10);
    expect(neri16.enviados).toBe(2); // los dos eventos dentro de los limites del 16
    const r17 = await resumenHoy("2026-09-17");
    const neri17 = r17.porUsuario.find((u) => u.id === ids.usuarioId)!;
    expect(neri17.enviados).toBe(1); // el evento que ya cayo en el 17
  });
  it("resumenProspectos cuenta el total y reparte por etapa, nicho y ciudad con los mismos filtros de la lista", async () => {
    const r = await resumenProspectos({});
    expect(r.total).toBeGreaterThanOrEqual(3);
    expect(r.porEtapa.find((e) => e.etapa === "por_contactar")?.n).toBe(2);
    expect(r.porNicho.length).toBeGreaterThanOrEqual(1);
    expect(r.porNicho.reduce((s, x) => s + x.n, 0)).toBe(r.total);
    expect(r.porCiudad.reduce((s, x) => s + x.n, 0)).toBe(r.total);
    // Con un filtro, los repartos son del subconjunto.
    const f = await resumenProspectos({ etapa: "por_contactar" });
    expect(f.total).toBe(2);
    expect(f.porCiudad.reduce((s, x) => s + x.n, 0)).toBe(2);
    // Filtro por ciudad exacta.
    const ciudad = r.porCiudad[0].ciudad;
    expect((await resumenProspectos({ ciudad })).total).toBe(r.porCiudad[0].n);
    expect((await buscarProspectos({ ciudad })).every((p) => p.ciudad === ciudad)).toBe(true);
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
  it("la ficha trae la web del prospecto", async () => {
    const p = await prisma.prospecto.findFirstOrThrow({ where: { nombre: "Con Web" } });
    const f = await fichaProspecto(p.id);
    expect(f?.web).toBe("https://ejemplo.test/");
  });
  it("un nicho sin plantilla de propuesta no ofrece enlace ni {enlace} en el mensaje", async () => {
    // etapa "ganado": no altera los conteos ni la cola de los tests de arriba.
    const sinPlantilla = await prisma.nicho.create({
      data: {
        slug: "farmacias-sin-plantilla", nombre: "Farmacias", plantillaPropuesta: "",
        mensajeInicial: "Buenas, {nombre}. Cuando quiera le mando la propuesta.",
        mensajeSeguimiento: "Hola de nuevo, {nombre}.", diasSeguimiento: 3,
      },
    });
    const p = await crearProspectoDePrueba(sinPlantilla.id, { nombre: "Farmacia Sin Plantilla", etapa: "ganado" });
    const f = await fichaProspecto(p.id);
    expect(f?.tienePropuesta).toBe(false);
    expect(f?.mensaje).not.toContain("/p/");
  });

  it("la cola del dia no sirve prospectos sin ningun contacto (solo nombre y ciudad)", async () => {
    const mudo = await prisma.prospecto.create({ data: { nichoId: ids.nichoId, nombre: "Sin Contacto", ciudad: "Caracas", fuentes: [], codigo: "m".repeat(22), clave: "sincontacto|caracas", origen: "overpass", etapa: "por_contactar", ordenCola: 0 } });
    const soloWeb = await prisma.prospecto.create({ data: { nichoId: ids.nichoId, nombre: "Solo Web", ciudad: "Caracas", fuentes: [], codigo: "w".repeat(22), clave: "soloweb|caracas", origen: "overpass", etapa: "por_contactar", ordenCola: 0, web: "https://soloweb.test/" } });
    const ids2 = (await colaDelDia(50)).map((p) => p.id);
    expect(ids2).not.toContain(mudo.id);
    expect(ids2).not.toContain(soloWeb.id); // una web sola no es un canal para escribir
    await prisma.prospecto.deleteMany({ where: { id: { in: [mudo.id, soloWeb.id] } } });
  });

  it("la cola del dia y los seguimientos del directorio no traen leads (fase 2)", async () => {
    const hoy = hoyCaracas();
    const leadNuevo = await prisma.prospecto.create({ data: { nichoId: ids.nichoId, nombre: "Lead Nuevo", ciudad: "", whatsapp: "584129990001", fuentes: [], codigo: "n".repeat(22), clave: "leadnuevo||584129990001", origen: "manual", esLead: true, fuenteLead: "web", etapa: "por_contactar", ordenCola: 0 } });
    const leadEnviado = await prisma.prospecto.create({ data: { nichoId: ids.nichoId, nombre: "Lead Enviado", ciudad: "", whatsapp: "584129990002", fuentes: [], codigo: "e".repeat(22), clave: "leadenviado||584129990002", origen: "manual", esLead: true, fuenteLead: "referido", etapa: "enviado", proximoSeguimiento: hoy } });
    const ascendido = await prisma.prospecto.create({ data: { nichoId: ids.nichoId, nombre: "Ascendido", ciudad: "Caracas", whatsapp: "584129990003", fuentes: [], codigo: "a".repeat(22), clave: "ascendido|caracas", origen: "importado", esLead: true, fuenteLead: "directorio", etapa: "enviado", proximoSeguimiento: hoy } });
    expect((await colaDelDia(50)).map((p) => p.id)).not.toContain(leadNuevo.id);
    const seg = (await seguimientosQueTocan(hoy)).map((p) => p.id);
    expect(seg).not.toContain(leadEnviado.id);
    expect(seg).toContain(ascendido.id);
    const todos = (await seguimientosQueTocan(hoy, "todos")).map((p) => p.id);
    expect(todos).toContain(leadEnviado.id);
    expect((await resumenHoy(hoy)).embudo.enviado).toBe((await prisma.prospecto.count({ where: { etapa: "enviado", OR: [{ esLead: false }, { fuenteLead: "directorio" }] } })));
  });
});

