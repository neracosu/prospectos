import { vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const pdfFalso = vi.hoisted(() => ({ ocupado: false }));
vi.mock("@/lib/propuesta", async (orig) => {
  const real = await orig<typeof import("@/lib/propuesta")>();
  return { ...real, generarPdf: async (codigo: string) => { if (pdfFalso.ocupado) throw new Error("PDF_OCUPADO"); const r = path.join(mkdtempSync(path.join(tmpdir(), "pdf-")), `${codigo}.pdf`); writeFileSync(r, "%PDF-1.4 falso"); return r; } };
});

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, crearProspectoDePrueba } from "./ayuda-db";
import { _transporteParaTests } from "@/lib/correo-envio";
import { prepararEnvio, enviarA, colaCorreo, cifrasCorreo, enviadosHoy } from "@/lib/correos";
import { hoyCaracas, sumarDias } from "@/lib/fecha-caracas";
import { seguimientosQueTocan } from "@/lib/prospectos";

type Enviado = Record<string, unknown>;

describe.runIf(DB_HABILITADA)("correos: preparar, enviar a mano, cola y cifras", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  let citasId = 0, comercioId = 0;
  const salidos: Enviado[] = [];
  let fallar = false;
  const hoy = hoyCaracas();

  beforeAll(async () => {
    await limpiarBase();
    ids = await sembrarBasico();
    const mk = (slug: string) => prisma.nicho.create({ data: { slug, nombre: slug, mensajeInicial: "x", mensajeSeguimiento: "y", plantillaPropuesta: slug, diasSeguimiento: 4 } });
    citasId = (await mk("citas-y-servicios")).id;
    comercioId = (await mk("comercio-y-tienda")).id;
  });
  beforeEach(async () => {
    await prisma.evento.deleteMany(); await prisma.envioCorreo.deleteMany(); await prisma.correoBloqueado.deleteMany(); await prisma.fichaNegocio.deleteMany();
    await prisma.prospecto.deleteMany();
    salidos.length = 0; fallar = false; pdfFalso.ocupado = false;
    _transporteParaTests({ sendMail: async (o) => { if (fallar) throw new Error("smtp caido"); salidos.push(o); return { messageId: "m1" }; } });
  });
  afterAll(async () => { _transporteParaTests(null); await limpiarBase(); await prisma.$disconnect(); });

  async function nuevo(extra: Parameters<typeof crearProspectoDePrueba>[1] = {}, nichoId = ids.nichoId, gancho = "Su web no tiene reservas en linea") {
    const p = await crearProspectoDePrueba(nichoId, { email: `n${Math.random().toString(36).slice(2, 8)}@ejemplo.test`, ...extra });
    await prisma.fichaNegocio.create({ data: { prospectoId: p.id, gancho, estado: "revisada" } });
    return p;
  }

  it("prepararEnvio crea el EnvioCorreo con token y arma el correo con el gancho de la ficha", async () => {
    const p = await nuevo({ web: "https://hotelx.test" });
    await prisma.prospecto.update({ where: { id: p.id }, data: { fuentesPorCampo: { email: "https://hotelx.test/contacto" } } });
    const r = await prepararEnvio(p.id, "inicial");
    if ("error" in r) throw new Error(r.error);
    const e = await prisma.envioCorreo.findUniqueOrThrow({ where: { token: r.token } });
    expect(e).toMatchObject({ prospectoId: p.id, tipo: "inicial", fallo: "en curso", para: p.email });
    expect(r.correo.html).toContain("Su web no tiene reservas en linea");
    expect(r.correo.html).toContain(r.token);
    expect(r.datos.dondeCorreo).toBe("su página hotelx.test");
    expect(r.datos.hojas).toBeGreaterThan(0);
    expect(r.pdf?.ruta).toMatch(/\.pdf$/);
    const q = await nuevo({});
    const r2 = await prepararEnvio(q.id, "inicial");
    if ("error" in r2) throw new Error(r2.error);
    expect(r2.datos.dondeCorreo).toBe("un directorio público");
  });

  it("enviarA con exito: evento enviado canal email, etapa enviado, seguimiento a +dias, sale de listas y entra en enviadas", async () => {
    const p = await nuevo();
    expect((await colaCorreo(hoy, { estado: "listas" })).map((f) => f.prospectoId)).toContain(p.id);
    const r = await enviarA(p.id, "inicial", ids.usuarioId);
    expect(r.ok).toBe(true);
    expect(salidos).toHaveLength(1);
    expect(salidos[0].to).toBe(p.email);
    const d = await prisma.prospecto.findUniqueOrThrow({ where: { id: p.id } });
    expect(d).toMatchObject({ etapa: "enviado", proximoSeguimiento: sumarDias(hoy, 3) });
    expect(await prisma.evento.count({ where: { prospectoId: p.id, tipo: "enviado", canal: "email" } })).toBe(1);
    expect((await colaCorreo(hoy, { estado: "listas" })).map((f) => f.prospectoId)).not.toContain(p.id);
    const env = await colaCorreo(hoy, { estado: "enviadas" });
    expect(env.map((f) => f.prospectoId)).toContain(p.id);
    expect(env[0].envio?.tipo).toBe("inicial");
    expect(await enviadosHoy(hoy)).toBe(1);
  });

  it("enviarA con fallo del transporte: fallo guardado, etapa intacta, aparece en fallidas y se puede reintentar", async () => {
    const p = await nuevo();
    fallar = true;
    const r = await enviarA(p.id, "inicial", ids.usuarioId);
    expect(r.ok).toBe(false);
    const e = await prisma.envioCorreo.findFirstOrThrow({ where: { prospectoId: p.id } });
    expect(e.fallo).toContain("smtp caido");
    expect((await prisma.prospecto.findUniqueOrThrow({ where: { id: p.id } })).etapa).toBe("por_contactar");
    expect(await prisma.evento.count({ where: { prospectoId: p.id, tipo: "enviado" } })).toBe(0);
    expect((await colaCorreo(hoy, { estado: "fallidas" })).map((f) => f.prospectoId)).toContain(p.id);
    expect(await enviadosHoy(hoy)).toBe(0);
    fallar = false;
    expect((await enviarA(p.id, "inicial", ids.usuarioId)).ok).toBe(true);
    expect((await colaCorreo(hoy, { estado: "fallidas" })).map((f) => f.prospectoId)).not.toContain(p.id);
    expect(await prisma.envioCorreo.count({ where: { prospectoId: p.id } })).toBe(2);
  });

  it("no manda a un correo bloqueado, a Colombia ni dos veces sin reenviar; con reenviar manda y deja dos envios", async () => {
    const b = await nuevo({ email: "Bloq@Ejemplo.test" });
    await prisma.correoBloqueado.create({ data: { email: "bloq@ejemplo.test", motivo: "no_quiere" } });
    expect((await enviarA(b.id, "inicial", null)).ok).toBe(false);
    expect((await colaCorreo(hoy, { estado: "bloqueadas" })).map((f) => f.prospectoId)).toContain(b.id);
    const co = await nuevo({ ciudad: "Bogota" });
    expect((await enviarA(co.id, "inicial", null)).ok).toBe(false);
    const p = await nuevo();
    expect((await enviarA(p.id, "inicial", null)).ok).toBe(true);
    const otra = await enviarA(p.id, "inicial", null);
    expect(otra.ok).toBe(false);
    expect(salidos).toHaveLength(1);
    expect((await enviarA(p.id, "inicial", null, { reenviar: true })).ok).toBe(true);
    expect(salidos).toHaveLength(2);
    expect(await prisma.envioCorreo.count({ where: { prospectoId: p.id } })).toBe(2);
  });

  it("rechaza si el nombre no coincide con su web; y manda el seguimiento una sola vez cuando toca", async () => {
    const n = await nuevo();
    await prisma.fichaNegocio.update({ where: { prospectoId: n.id }, data: { hallazgos: { web: { nombreCoincide: false } } } });
    expect((await colaCorreo(hoy))[0]?.nombreNoCoincide).toBe(true);
    expect((await enviarA(n.id, "inicial", null)).ok).toBe(false);
    const p = await nuevo();
    await enviarA(p.id, "inicial", null);
    expect((await enviarA(p.id, "inicial", null)).ok).toBe(false); // aun no toca
    await prisma.prospecto.update({ where: { id: p.id }, data: { proximoSeguimiento: hoy } });
    const seg = await colaCorreo(hoy, { estado: "seguimiento" });
    expect(seg.map((f) => f.prospectoId)).toEqual([p.id]);
    expect((await enviarA(p.id, "inicial", null)).ok).toBe(true);
    expect((await prisma.envioCorreo.findFirstOrThrow({ where: { prospectoId: p.id }, orderBy: { id: "desc" } })).tipo).toBe("seguimiento");
    expect(await prisma.evento.count({ where: { prospectoId: p.id, tipo: "seguimiento", canal: "email" } })).toBe(1);
    await prisma.prospecto.update({ where: { id: p.id }, data: { proximoSeguimiento: hoy } });
    expect((await enviarA(p.id, "inicial", null)).ok).toBe(false); // una sola vez
  });

  it("nombre que no coincide: a mano sale con la ficha revisada, no con borrador; el automatico nunca", async () => {
    const n = await nuevo();
    await prisma.fichaNegocio.update({ where: { prospectoId: n.id }, data: { hallazgos: { web: { nombreCoincide: false } }, estado: "borrador" } });
    expect((await enviarA(n.id, "inicial", null, { modo: "manual" })).ok).toBe(false);
    await prisma.fichaNegocio.update({ where: { prospectoId: n.id }, data: { estado: "revisada" } });
    expect((await enviarA(n.id, "inicial", null, { modo: "automatico" })).ok).toBe(false);
    expect(salidos).toHaveLength(0);
    expect((await enviarA(n.id, "inicial", ids.usuarioId, { modo: "manual" })).ok).toBe(true);
    expect(salidos).toHaveLength(1);
  });

  it("el seguimiento sale sin adjunto; el inicial con un PDF", async () => {
    const p = await nuevo();
    expect((await enviarA(p.id, "inicial", null)).ok).toBe(true);
    expect((salidos[0].attachments as unknown[] | undefined) ?? []).toHaveLength(1);
    await prisma.prospecto.update({ where: { id: p.id }, data: { proximoSeguimiento: hoy } });
    pdfFalso.ocupado = true; // si el seguimiento intentara generar el PDF, fallaria
    expect((await enviarA(p.id, "seguimiento", null)).ok).toBe(true);
    expect(salidos).toHaveLength(2);
    expect((salidos[1].attachments as unknown[] | undefined) ?? []).toHaveLength(0);
    const r = await prepararEnvio((await nuevo()).id, "seguimiento");
    if ("error" in r) throw new Error(r.error);
    expect(r.pdf).toBeNull();
  });

  it("PDF_OCUPADO: la fila queda con fallo y aparece en fallidas", async () => {
    const p = await nuevo();
    pdfFalso.ocupado = true;
    const r = await enviarA(p.id, "inicial", null);
    expect(r).toEqual({ ok: false, mensaje: "El servidor está ocupado generando otro PDF. Intente en unos segundos." });
    expect((await prisma.envioCorreo.findFirstOrThrow({ where: { prospectoId: p.id } })).fallo).toBe("pdf ocupado");
    expect((await colaCorreo(hoy, { estado: "fallidas" })).map((f) => f.prospectoId)).toContain(p.id);
    expect(salidos).toHaveLength(0);
  });

  it("dondeCorreo por el host de la fuente del correo", async () => {
    const donde = async (fuente: string, web = "https://hotelx.test") => {
      const p = await nuevo({ web });
      await prisma.prospecto.update({ where: { id: p.id }, data: { fuentesPorCampo: fuente ? { email: fuente } : {} } });
      const r = await prepararEnvio(p.id, "inicial");
      if ("error" in r) throw new Error(r.error);
      return r.datos.dondeCorreo;
    };
    expect(await donde("https://www.facebook.com/hotelx")).toBe("su página de Facebook");
    expect(await donde("https://m.facebook.com/hotelx", "")).toBe("su página de Facebook");
    expect(await donde("https://instagram.com/hotelx/")).toBe("su página de Instagram");
    expect(await donde("https://www.hotelx.test/contacto")).toBe("su página hotelx.test");
    expect(await donde("")).toBe("un directorio público");
    expect(await donde("https://www.openstreetmap.org/node/1")).toBe("un directorio público");
    expect(await donde("https://otro.test/lista")).toBe("un directorio público");
  });

  it("listas deja fuera la direccion que ya recibio un envio de otro prospecto, aunque ese no este en la cola", async () => {
    const a = await nuevo({ email: "comun@ejemplo.test" });
    const lead = await crearProspectoDePrueba(ids.nichoId, { email: "otra@ejemplo.test" });
    await prisma.envioCorreo.create({ data: { prospectoId: lead.id, tipo: "inicial", asunto: "x", para: "comun@ejemplo.test", token: "c".repeat(22), fallo: "" } });
    expect((await colaCorreo(hoy, { estado: "listas" })).map((f) => f.prospectoId)).not.toContain(a.id);
    const b = await nuevo({ email: "sola@ejemplo.test" });
    expect((await colaCorreo(hoy, { estado: "listas" })).map((f) => f.prospectoId)).toContain(b.id);
  });

  it("colaCorreo ordena: con gancho primero, luego comercio antes que citas", async () => {
    const citas = await nuevo({}, citasId);
    const comercio = await nuevo({}, comercioId);
    const sinGancho = await nuevo({}, comercioId, "");
    const sinCorreo = await nuevo({ email: "" }, comercioId);
    const orden = (await colaCorreo(hoy)).map((f) => f.prospectoId);
    expect(orden).toEqual([comercio.id, citas.id, sinGancho.id]);
    expect(orden).not.toContain(sinCorreo.id);
    expect(await colaCorreo(hoy, { arquetipo: "citas-y-servicios" })).toHaveLength(1);
  });

  it("listas deja fuera a los nichos sin plantilla (arquetipo vacio): ni la cola ni el automatico los toman", async () => {
    const sinPlantilla = await prisma.nicho.create({ data: { slug: `sin-plantilla-${Date.now()}`, nombre: "Sin plantilla", mensajeInicial: "x", mensajeSeguimiento: "y", plantillaPropuesta: "" } });
    const a = await nuevo({}, sinPlantilla.id);
    const b = await nuevo({}, comercioId);
    const listas = (await colaCorreo(hoy, { estado: "listas" })).map((f) => f.prospectoId);
    expect(listas).toContain(b.id);
    expect(listas).not.toContain(a.id);
    expect((await colaCorreo(hoy)).map((f) => f.prospectoId)).toContain(a.id); // sigue en «todas»
    await prisma.fichaNegocio.deleteMany({ where: { prospectoId: a.id } }); await prisma.prospecto.delete({ where: { id: a.id } }); await prisma.nicho.delete({ where: { id: sinPlantilla.id } });
  });

  it("cifrasCorreo cuenta enviados, abrieron, vieron, descargaron y respondieron (etapa respondio o posterior)", async () => {
    const a = await nuevo({}, comercioId), b = await nuevo({}, comercioId), c = await nuevo({}, citasId);
    for (const p of [a, b, c]) await enviarA(p.id, "inicial", null);
    await prisma.envioCorreo.updateMany({ where: { prospectoId: a.id }, data: { abiertoEn: new Date(), clicEn: new Date(), pdfEn: new Date() } });
    await prisma.envioCorreo.updateMany({ where: { prospectoId: b.id }, data: { abiertoEn: new Date() } });
    await prisma.prospecto.update({ where: { id: a.id }, data: { etapa: "respondio" } });
    const { total, porArquetipo } = await cifrasCorreo();
    expect(total).toEqual({ enviados: 3, abrieron: 2, vieron: 1, descargaron: 1, respondieron: 1 });
    expect(porArquetipo["comercio-y-tienda"]).toEqual({ enviados: 2, abrieron: 2, vieron: 1, descargaron: 1, respondieron: 1 });
    expect(porArquetipo["citas-y-servicios"]).toEqual({ enviados: 1, abrieron: 0, vieron: 0, descargaron: 0, respondieron: 0 });
  });

  it("un correo enviado no asciende a lead y el seguimiento sale de la cola de WhatsApp", async () => {
    const p = await nuevo();
    await prisma.prospecto.update({ where: { id: p.id }, data: { fuenteLead: "" } });
    expect((await enviarA(p.id, "inicial", null)).ok).toBe(true);
    const d = await prisma.prospecto.findUniqueOrThrow({ where: { id: p.id } });
    expect(d.esLead).toBe(false);
    expect(d.fuenteLead).toBe("");
    await prisma.prospecto.update({ where: { id: p.id }, data: { proximoSeguimiento: hoy } });
    expect((await seguimientosQueTocan(hoy)).map((x) => x.id)).not.toContain(p.id);
  });

  it("descartado, respondio, con envio previo por otro canal y correos del Estado o genericos no salen ni se mandan", async () => {
    const desc = await nuevo({ etapa: "descartado" });
    const resp = await nuevo({ etapa: "respondio" });
    const gob = await nuevo({ email: "alcaldia@ejemplo.gob.ve" });
    const noreply = await nuevo({ email: "noreply@ejemplo.test" });
    const previo = await nuevo({});
    await prisma.evento.create({ data: { prospectoId: previo.id, tipo: "enviado", canal: "whatsapp" } });
    const listas = (await colaCorreo(hoy, { estado: "listas" })).map((f) => f.prospectoId);
    for (const x of [desc, resp, gob, noreply, previo]) {
      expect(listas).not.toContain(x.id);
      expect((await enviarA(x.id, "inicial", null)).ok).toBe(false);
    }
    expect(salidos).toHaveLength(0);
  });

  it("modo pedido: el negocio pidio la propuesta por correo tras el WhatsApp; sale sin ficha, pasa a respondio y se puede repetir", async () => {
    const p = await crearProspectoDePrueba(ids.nichoId, { email: "info@hotelx.test", etapa: "enviado", esLead: true, fuenteLead: "directorio" });
    await prisma.evento.create({ data: { prospectoId: p.id, tipo: "enviado", canal: "whatsapp", de: "por_contactar", a: "enviado" } });
    expect((await enviarA(p.id, "inicial", null, { modo: "manual" })).ok).toBe(false);
    const r = await enviarA(p.id, "inicial", null, { modo: "pedido" });
    if (!r.ok) throw new Error(r.mensaje);
    expect(salidos).toHaveLength(1);
    expect(salidos[0]).toMatchObject({ to: "info@hotelx.test" });
    const q = await prisma.prospecto.findUniqueOrThrow({ where: { id: p.id } });
    expect(q.etapa).toBe("respondio");
    expect(await prisma.evento.count({ where: { prospectoId: p.id, tipo: "enviado", canal: "email" } })).toBe(1);
    expect(await prisma.evento.count({ where: { prospectoId: p.id, tipo: "etapa", a: "respondio" } })).toBe(1);
    const r2 = await enviarA(p.id, "inicial", null, { modo: "pedido" });
    if (!r2.ok) throw new Error(r2.mensaje);
    expect(salidos).toHaveLength(2);
    expect((await prisma.prospecto.findUniqueOrThrow({ where: { id: p.id } })).etapa).toBe("respondio");
  });

  it("dos filas con el mismo correo: la segunda se rechaza", async () => {
    const a = await nuevo({ email: "Dup@Ejemplo.test" });
    const b = await nuevo({ email: "dup@ejemplo.test" });
    expect((await enviarA(a.id, "inicial", null)).ok).toBe(true);
    expect((await enviarA(b.id, "inicial", null)).ok).toBe(false);
    expect(salidos).toHaveLength(1);
  });

  it("dos enviarA en paralelo al mismo prospecto mandan un solo correo; y el tope se respeta en paralelo", async () => {
    const p = await nuevo();
    const rs = await Promise.all([enviarA(p.id, "inicial", null), enviarA(p.id, "inicial", null)]);
    expect(rs.filter((r) => r.ok)).toHaveLength(1);
    expect(salidos).toHaveLength(1);
    expect(await prisma.envioCorreo.count({ where: { prospectoId: p.id, fallo: "" } })).toBe(1);
    const [x, y, z] = [await nuevo(), await nuevo(), await nuevo()];
    const r3 = await Promise.all([x, y, z].map((q) => enviarA(q.id, "inicial", null, { tope: 2 })));  // el primero ya conto 1
    expect(r3.filter((r) => r.ok)).toHaveLength(1);
  });

  it("dondeCorreo: web sin fuente del correo es directorio publico", async () => {
    const p = await nuevo({ web: "https://hotelx.test" });
    const r = await prepararEnvio(p.id, "inicial");
    if ("error" in r) throw new Error(r.error);
    expect(r.datos.dondeCorreo).toBe("un directorio público");
  });

  it("seguimientosQueTocan: 60 enviados por correo vencidos no tapan al de WhatsApp", async () => {
    const wa = await nuevo({ etapa: "enviado", proximoSeguimiento: sumarDias(hoy, -1) });
    await prisma.evento.create({ data: { prospectoId: wa.id, tipo: "enviado", canal: "whatsapp" } });
    for (let i = 0; i < 60; i++) {
      const c = await crearProspectoDePrueba(ids.nichoId, { etapa: "enviado", proximoSeguimiento: sumarDias(hoy, -10) });
      await prisma.evento.create({ data: { prospectoId: c.id, tipo: "enviado", canal: "email" } });
    }
    expect((await seguimientosQueTocan(hoy)).map((x) => x.id)).toEqual([wa.id]);
  });

  it("una reserva en curso de hace 11 minutos no bloquea ni cuenta en el tope y queda interrumpida", async () => {
    const p = await nuevo();
    const vieja = await prisma.envioCorreo.create({ data: { prospectoId: p.id, tipo: "inicial", asunto: "x", para: p.email, token: "v".repeat(22), fallo: "en curso", enviadoEn: new Date(Date.now() - 11 * 60_000) } });
    expect(await enviadosHoy(hoy)).toBe(0);
    expect((await colaCorreo(hoy, { estado: "fallidas" })).map((f) => f.prospectoId)).toContain(p.id);
    expect((await enviarA(p.id, "inicial", null, { tope: 1 })).ok).toBe(true);
    expect((await prisma.envioCorreo.findUniqueOrThrow({ where: { id: vieja.id } })).fallo).toBe("interrumpido");
    // una reserva fresca si bloquea y cuenta
    const q = await nuevo();
    await prisma.envioCorreo.create({ data: { prospectoId: q.id, tipo: "inicial", asunto: "x", para: q.email, token: "w".repeat(22), fallo: "en curso" } });
    expect((await enviarA(q.id, "inicial", null)).ok).toBe(false);
    expect(await enviadosHoy(hoy)).toBe(2);
  });
});
