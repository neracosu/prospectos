import { vi } from "vitest";
vi.mock("@/lib/sesion", async () => {
  const { sesionFalsa } = await import("./ayuda-sesion");
  return { COOKIE_SESION: "pr_sesion", DIAS_SESION: 30, sesionActual: async () => sesionFalsa.actual };
});

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, sembrarCliente, sembrarProyecto } from "./ayuda-db";
import { sesionFalsa } from "./ayuda-sesion";
import { rutaDocumento } from "@/lib/recibos";
import { GET } from "@/app/recibos/[archivo]/route";

const pedir = (archivo: string) => GET(new Request(`http://prueba.test/recibos/${archivo}`), { params: Promise.resolve({ archivo }) });
function guardar(nombre: string, contenido: string) { const r = rutaDocumento(nombre); mkdirSync(path.dirname(r), { recursive: true }); writeFileSync(r, contenido); }

describe.runIf(DB_HABILITADA)("GET /recibos/[archivo]", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  beforeAll(async () => {
    await limpiarBase();
    rmSync(path.join(process.env.PROSPECTOS_DIR_ARCHIVOS!, "recibos"), { recursive: true, force: true });
    ids = await sembrarBasico();
    const c = await sembrarCliente();
    const p = await sembrarProyecto(c.id, ids.nichoId);
    const base = { proyectoId: p.id, concepto: "extra", monto: "10.00", vence: "2026-09-01", pagadoEn: new Date(), reciboGeneradoEn: new Date() };
    await prisma.cobro.create({ data: { ...base, detalle: "Con archivo", reciboNumero: "R-2026-0001" } });
    await prisma.cobro.create({ data: { ...base, detalle: "Sin archivo", reciboNumero: "R-2026-0002" } });
    await prisma.cobro.create({ data: { ...base, detalle: "Anulado con nota", reciboNumero: "R-2026-0003", anuladoEn: new Date(), anuladoMotivo: "x", notaAnulacionEn: new Date() } });
    guardar("R-2026-0001", "%PDF-uno");
    guardar("R-2026-0003", "%PDF-tres");
    guardar("R-2026-0003-A", "%PDF-nota");
    guardar("R-2026-0001-A", "%PDF-huerfano"); // archivo suelto: la base no sabe de esa nota
  });
  beforeEach(() => { sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" }; });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("sin sesion manda a /entrar; el prospectador recibe 403", async () => {
    sesionFalsa.actual = null;
    const sin = await pedir("R-2026-0001.pdf");
    expect(sin.status).toBe(307);
    expect(sin.headers.get("location")).toBe("/entrar");
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
    expect((await pedir("R-2026-0001.pdf")).status).toBe(403);
  });

  it("el dueno descarga el recibo y la nota, sin cache", async () => {
    const r = await pedir("R-2026-0001.pdf");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("content-disposition")).toBe('inline; filename="R-2026-0001.pdf"');
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(await r.text()).toBe("%PDF-uno");
    const n = await pedir("R-2026-0003-A.pdf");
    expect(n.status).toBe(200);
    expect(await n.text()).toBe("%PDF-nota");
  });

  it("404 para nombres raros, numeros que no existen, archivos que faltan y notas que la base no conoce", async () => {
    for (const archivo of ["..%2F..%2Fetc%2Fpasswd", "R-2026-1.pdf", "R-2026-0001", "R-2026-0001.pdf.txt", "R-2026-9999.pdf", "R-2026-0002.pdf", "R-2026-0001-A.pdf"]) {
      expect((await pedir(archivo)).status, archivo).toBe(404);
    }
  });
});
