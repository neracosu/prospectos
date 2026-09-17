import { vi } from "vitest";
const pdfFalso = vi.hoisted(() => ({ fallarProxima: false, llamadas: 0, ultimoHtml: "" }));
vi.mock("@/lib/pdf", async (original) => {
  const real = await original<typeof import("@/lib/pdf")>();
  return {
    ...real,
    conTurnoGlobal: <T,>(tarea: () => Promise<T>) => tarea(),
    imprimirPdf: async (html: string) => {
      pdfFalso.llamadas += 1;
      pdfFalso.ultimoHtml = html;
      if (pdfFalso.fallarProxima) { pdfFalso.fallarProxima = false; throw new Error("CHROMIUM_ROTO"); }
      await new Promise((r) => setTimeout(r, 150)); // lo bastante lento para que dos generaciones se pisen
      return Buffer.from("%PDF-1.4 falso");
    },
  };
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, sembrarCliente, sembrarProyecto } from "./ayuda-db";
import { guardarConfig, CLAVES } from "@/lib/configuracion";
import { hoyCaracas, fechaVisible } from "@/lib/fecha-caracas";
import { generarRecibo, generarNotaAnulacion, rutaDocumento } from "@/lib/recibos";

const ANIO = Number(hoyCaracas().slice(0, 4));
const EMISOR = JSON.stringify({ nombre: "Neri Colón", rif: "V-12345678-9", whatsapp: "584121234567", email: "neri@ejemplo.test" });
const ultimo = async () => (await prisma.correlativo.findUnique({ where: { serie_anio: { serie: "R", anio: ANIO } } }))?.ultimo ?? 0;

describe.runIf(DB_HABILITADA)("generarRecibo y generarNotaAnulacion", () => {
  let usuarioId: number;
  let proyectoId: number;
  const cobroPagado = (detalle: string) => prisma.cobro.create({ data: { proyectoId, concepto: "extra", detalle, monto: "350.00", vence: "2026-09-01", pagadoEn: new Date("2026-09-16T16:00:00Z"), canal: "zelle", referencia: "Z-1" } });

  beforeAll(async () => {
    await limpiarBase();
    rmSync(path.join(process.env.PROSPECTOS_DIR_ARCHIVOS!, "recibos"), { recursive: true, force: true });
    const ids = await sembrarBasico();
    usuarioId = ids.usuarioId;
    const c = await sembrarCliente({ nombre: "Hotel Recibos", whatsapp: "584129999999" });
    proyectoId = (await sembrarProyecto(c.id, ids.nichoId, { estado: "activo" })).id;
  });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("rutaDocumento arma <dir>/recibos/<anio>/<nombre>.pdf y rechaza nombres raros", () => {
    expect(rutaDocumento("R-2026-0001")).toBe(path.join(process.env.PROSPECTOS_DIR_ARCHIVOS!, "recibos", "2026", "R-2026-0001.pdf"));
    expect(rutaDocumento("R-2027-0042-A")).toBe(path.join(process.env.PROSPECTOS_DIR_ARCHIVOS!, "recibos", "2027", "R-2027-0042-A.pdf"));
    expect(() => rutaDocumento("../../etc/passwd")).toThrow("DOCUMENTO_INVALIDO");
  });

  it("sin datos del emisor no genera ni gasta numero", async () => {
    const c = await cobroPagado("Sin emisor");
    await expect(generarRecibo(c.id, usuarioId)).rejects.toThrow("EMISOR_INCOMPLETO");
    expect(await ultimo()).toBe(0);
    await guardarConfig(CLAVES.emisor, EMISOR);
  });

  it("un cobro pendiente o anulado no genera recibo", async () => {
    const pendiente = await prisma.cobro.create({ data: { proyectoId, concepto: "extra", detalle: "Pendiente", monto: "10.00", vence: "2026-12-01" } });
    const anulado = await prisma.cobro.create({ data: { proyectoId, concepto: "extra", detalle: "Anulado", monto: "10.00", vence: "2026-12-01", pagadoEn: new Date(), anuladoEn: new Date(), anuladoMotivo: "x" } });
    await expect(generarRecibo(pendiente.id, usuarioId)).rejects.toThrow("RECIBO_NO_APLICA");
    await expect(generarRecibo(anulado.id, usuarioId)).rejects.toThrow("RECIBO_NO_APLICA");
    await expect(generarRecibo(999_999, usuarioId)).rejects.toThrow("COBRO_NO_EXISTE");
    expect(await ultimo()).toBe(0);
  });

  it("genera el 0001, guarda el PDF en 600, marca el cobro y deja su evento; la segunda vez devuelve el mismo numero", async () => {
    const c = await cobroPagado("Primero");
    const r = await generarRecibo(c.id, usuarioId);
    expect(r).toEqual({ numero: `R-${ANIO}-0001`, nuevo: true, proyectoId });
    const ruta = rutaDocumento(r.numero);
    expect(readFileSync(ruta, "utf8")).toBe("%PDF-1.4 falso");
    expect(statSync(ruta).mode & 0o777).toBe(0o600);
    const html = pdfFalso.ultimoHtml;
    expect(html).toContain("<h1>Recibo de pago</h1>");
    expect(html).toContain(`<p class="numero">${r.numero}</p>`);
    expect(html).toContain(`Emitido el ${fechaVisible(hoyCaracas())}`);
    expect(html).toContain("<b>Neri Colón</b><br>RIF V-12345678-9<br>WhatsApp +58 412-1234567<br>neri@ejemplo.test");
    expect(html).toContain("Hotel Recibos<small>RIF J-12345678-9</small>");
    expect(html).toContain("$350,00");
    expect(html).toContain("PMS Hotel: Extra — Primero");
    expect(html).toContain("<dd>16/09/2026</dd>"); // fecha de PAGO (dia de Caracas), no la de emision
    expect(html).toContain("<dd>Zelle</dd>");
    expect(html).toContain("<dd>Z-1</dd>");
    expect(html).toContain('url("data:font/woff2;base64,'); // fuentes incrustadas, sin red
    expect(html).not.toContain('url("fuentes/');
    const d = await prisma.cobro.findUniqueOrThrow({ where: { id: c.id } });
    expect(d.reciboNumero).toBe(r.numero);
    expect(d.reciboGeneradoEn).not.toBeNull();
    expect(await prisma.evento.count({ where: { cobroId: c.id, tipo: "recibo_generado", usuarioId, texto: r.numero } })).toBe(1);

    const llamadas = pdfFalso.llamadas;
    expect(await generarRecibo(c.id, usuarioId)).toEqual({ numero: r.numero, nuevo: false, proyectoId });
    expect(pdfFalso.llamadas).toBe(llamadas); // un recibo emitido no se regenera
    expect(await ultimo()).toBe(1);
  });

  it("dos generaciones simultaneas dan dos numeros distintos", async () => {
    const [a, b] = await Promise.all([cobroPagado("Simultaneo A"), cobroPagado("Simultaneo B")]);
    const [ra, rb] = await Promise.all([generarRecibo(a.id, usuarioId), generarRecibo(b.id, usuarioId)]);
    expect(new Set([ra.numero, rb.numero])).toEqual(new Set([`R-${ANIO}-0002`, `R-${ANIO}-0003`]));
    expect(await ultimo()).toBe(3);
  }, 30_000);

  it("dos toques sobre el mismo cobro dan un solo recibo", async () => {
    const c = await cobroPagado("Doble toque");
    const [r1, r2] = await Promise.all([generarRecibo(c.id, usuarioId), generarRecibo(c.id, usuarioId)]);
    expect(r1.numero).toBe(`R-${ANIO}-0004`);
    expect(r2.numero).toBe(r1.numero);
    expect([r1.nuevo, r2.nuevo].filter(Boolean)).toHaveLength(1);
    expect(await ultimo()).toBe(4);
    expect(await prisma.evento.count({ where: { cobroId: c.id, tipo: "recibo_generado" } })).toBe(1);
  }, 30_000);

  it("si el PDF falla, el cobro sigue pagado y sin numero, y el correlativo no se gasta", async () => {
    const c = await cobroPagado("Falla");
    pdfFalso.fallarProxima = true;
    await expect(generarRecibo(c.id, usuarioId)).rejects.toThrow("CHROMIUM_ROTO");
    const d = await prisma.cobro.findUniqueOrThrow({ where: { id: c.id } });
    expect(d.reciboNumero).toBe("");
    expect(d.pagadoEn).not.toBeNull();
    expect(await ultimo()).toBe(4);
    expect((await generarRecibo(c.id, usuarioId)).numero).toBe(`R-${ANIO}-0005`); // el reintento toma el numero que quedo libre
  });

  it("la nota de anulacion es R-...-A, no borra el recibo y se genera una sola vez", async () => {
    const c = await cobroPagado("Para anular");
    const r = await generarRecibo(c.id, usuarioId);
    await expect(generarNotaAnulacion(c.id, usuarioId)).rejects.toThrow("NOTA_NO_APLICA"); // todavia no esta anulado
    await prisma.cobro.update({ where: { id: c.id }, data: { anuladoEn: new Date(), anuladoMotivo: "Pago duplicado" } });
    const n = await generarNotaAnulacion(c.id, usuarioId);
    expect(n).toEqual({ numero: `${r.numero}-A`, nueva: true, proyectoId });
    expect(existsSync(rutaDocumento(n.numero))).toBe(true);
    expect(existsSync(rutaDocumento(r.numero))).toBe(true);
    const htmlNota = pdfFalso.ultimoHtml;
    expect(htmlNota).toContain("<h1>Nota de anulación</h1>");
    expect(htmlNota).toContain(`<p class="numero">${r.numero}-A</p>`);
    expect(htmlNota).toContain("Pago duplicado");
    expect(htmlNota).toContain(`emitido el ${fechaVisible(hoyCaracas())}`);
    expect(htmlNota).not.toContain("Recibí de");
    expect((await prisma.cobro.findUniqueOrThrow({ where: { id: c.id } })).notaAnulacionEn).not.toBeNull();
    expect((await generarNotaAnulacion(c.id, usuarioId)).nueva).toBe(false);
    expect(await prisma.evento.count({ where: { cobroId: c.id, tipo: "nota_anulacion", texto: n.numero } })).toBe(1);
    expect(await ultimo()).toBe(6); // la nota no gasta correlativo
  });

  it("un cobro anulado que nunca tuvo recibo no lleva nota", async () => {
    const c = await prisma.cobro.create({ data: { proyectoId, concepto: "extra", detalle: "Anulado sin recibo", monto: "10.00", vence: "2026-12-01", anuladoEn: new Date(), anuladoMotivo: "x" } });
    await expect(generarNotaAnulacion(c.id, usuarioId)).rejects.toThrow("NOTA_NO_APLICA");
  });

  it("si anulan el cobro mientras se genera, no se emite recibo ni se gasta numero", async () => {
    const c = await cobroPagado("Anulado en pleno vuelo");
    const antes = await ultimo();
    const llamadasAntes = pdfFalso.llamadas;
    const p = generarRecibo(c.id, usuarioId);
    const resultado = expect(p).rejects.toThrow("RECIBO_NO_APLICA"); // se engancha ya, para que el rechazo no quede sin manejar
    await new Promise((r) => setTimeout(r, 60)); // el simulacro tarda 150 ms: aqui la transaccion ya leyo el cobro
    await prisma.cobro.update({ where: { id: c.id }, data: { anuladoEn: new Date(), anuladoMotivo: "x" } });
    await resultado;
    expect(await ultimo()).toBe(antes);
    expect((await prisma.cobro.findUniqueOrThrow({ where: { id: c.id } })).reciboNumero).toBe("");
    expect(await prisma.evento.count({ where: { cobroId: c.id, tipo: "recibo_generado" } })).toBe(0);
    // Chromium simulado si fue llamado: la anulacion llego DESPUES de que la transaccion leyera
    // el cobro (rama del r.count === 0), que es la rama que interesa ejercitar aqui.
    expect(pdfFalso.llamadas).toBe(llamadasAntes + 1);
  });
});
