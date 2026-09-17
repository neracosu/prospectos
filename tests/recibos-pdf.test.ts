import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, sembrarCliente, sembrarProyecto } from "./ayuda-db";
import { guardarConfig, CLAVES } from "@/lib/configuracion";
import { generarRecibo, generarNotaAnulacion, rutaDocumento } from "@/lib/recibos";

const paginas = (ruta: string) => (readFileSync(ruta).toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;

describe.runIf(DB_HABILITADA)("recibo real con Chromium", () => {
  let usuarioId: number;
  let cobroId: number;
  beforeAll(async () => {
    await limpiarBase();
    rmSync(path.join(process.env.PROSPECTOS_DIR_ARCHIVOS!, "recibos"), { recursive: true, force: true });
    const ids = await sembrarBasico();
    usuarioId = ids.usuarioId;
    await guardarConfig(CLAVES.emisor, JSON.stringify({ nombre: "Neri Colón", rif: "V-12345678-9", whatsapp: "584121234567", email: "neri@ejemplo.test" }));
    const c = await sembrarCliente({ nombre: "Inversiones Hotel Parque Central, C.A." });
    const p = await sembrarProyecto(c.id, ids.nichoId, { estado: "activo" });
    await prisma.version.create({ data: { proyectoId: p.id, version: "1.4.0", fecha: "2026-10-02" } });
    await prisma.version.create({ data: { proyectoId: p.id, version: "1.4.2", fecha: "2026-10-28" } });
    cobroId = (await prisma.cobro.create({ data: { proyectoId: p.id, concepto: "mensualidad", detalle: "Mensualidad de octubre 2026", mes: "2026-10", monto: "100.00", vence: "2026-10-05", pagadoEn: new Date("2026-10-04T16:00:00Z"), canal: "pago_movil", referencia: "0102-4481927733" } })).id;
  });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("el PDF existe, es un PDF, pesa mas de 10 KB, cabe en una hoja y queda en 600", async () => {
    const r = await generarRecibo(cobroId, usuarioId);
    const ruta = rutaDocumento(r.numero);
    expect(readFileSync(ruta).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(statSync(ruta).size).toBeGreaterThan(10_000);
    expect(statSync(ruta).mode & 0o777).toBe(0o600);
    expect(paginas(ruta)).toBe(1);
  }, 90_000);

  it("la nota de anulacion tambien es un PDF real de una hoja", async () => {
    await prisma.cobro.update({ where: { id: cobroId }, data: { anuladoEn: new Date(), anuladoMotivo: "El pago se registró dos veces por error." } });
    const n = await generarNotaAnulacion(cobroId, usuarioId);
    const ruta = rutaDocumento(n.numero);
    expect(n.numero.endsWith("-A")).toBe(true);
    expect(statSync(ruta).size).toBeGreaterThan(10_000);
    expect(paginas(ruta)).toBe(1);
  }, 90_000);
});
