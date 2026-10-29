import { vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
vi.mock("@/lib/propuesta", async (orig) => {
  const real = await orig<typeof import("@/lib/propuesta")>();
  return { ...real, generarPdf: async (codigo: string) => { const r = path.join(mkdtempSync(path.join(tmpdir(), "pdf-")), `${codigo}.pdf`); writeFileSync(r, "%PDF-1.4 falso"); return r; } };
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
    salidos.length = 0; fallar = false;
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
