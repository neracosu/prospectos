import { vi } from "vitest";
vi.mock("@/lib/sesion", async () => {
  const { sesionFalsa } = await import("./ayuda-sesion");
  return {
    COOKIE_SESION: "pr_sesion", DIAS_SESION: 30,
    sesionActual: async () => sesionFalsa.actual,
    exigirSesion: async () => { if (!sesionFalsa.actual) throw new Error("REDIRECT:/entrar"); return sesionFalsa.actual; },
    exigirRol: async (rol: string) => { if (sesionFalsa.actual?.rol !== rol) throw new Error("REDIRECT:/inicio"); return sesionFalsa.actual; },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, crearProspectoDePrueba } from "./ayuda-db";
import { sesionFalsa } from "./ayuda-sesion";
import { agregarEnlace, quitarEnlace, actualizarRastro, marcarVisitanteMio, guardarIpsPropiasAccion, importarArchivadosAccion } from "@/acciones/rastro";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const L = (ip: string, fecha: string, req: string, ua: string) => `${ip} - - [${fecha}] "${req}" 200 1234 "-" "${ua}"`;
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.3 Mobile/15E148 Safari/604.1";
const HOST = "demo-ejemplo.neracosu.com";

describe.runIf(DB_HABILITADA)("acciones de rastro", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  let prospectoId = 0;
  let dirLogs = "", dirArchivo = "", archivoLog = "";
  beforeAll(async () => {
    dirLogs = mkdtempSync(join(tmpdir(), "rastro-logs-"));
    dirArchivo = mkdtempSync(join(tmpdir(), "rastro-arch-"));
    process.env.RASTRO_DIR_LOGS = dirLogs;
    process.env.RASTRO_DIR_ARCHIVO = dirArchivo;
    archivoLog = join(dirLogs, `${HOST}-ssl_log`);
    await limpiarBase(); ids = await sembrarBasico();
    prospectoId = (await crearProspectoDePrueba(ids.nichoId)).id;
  });
  beforeEach(() => { sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" }; });
  afterAll(async () => {
    delete process.env.RASTRO_DIR_LOGS; delete process.env.RASTRO_DIR_ARCHIVO;
    rmSync(dirLogs, { recursive: true, force: true }); rmSync(dirArchivo, { recursive: true, force: true });
    await limpiarBase(); await prisma.$disconnect();
  });

  it("agregarEnlace devuelve la etiqueta <script> con el token y lee el log del host de una vez", async () => {
    writeFileSync(archivoLog, [
      L("203.0.113.5", "06/Nov/2026:10:00:00 -0400", "GET /factura/ HTTP/2.0", IPHONE),
      L("198.51.100.9", "06/Nov/2026:10:02:00 -0400", "GET /factura/ HTTP/1.1", "WhatsApp/2.23.20.0"),
    ].join("\n") + "\n");
    const r = await agregarEnlace(prospectoId, fd({ url: `https://${HOST}/factura/`, etiqueta: "Demo factura", enviadoEn: "2026-11-01" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const enlace = await prisma.enlaceEnviado.findUniqueOrThrow({ where: { id: r.datos.id } });
    expect(r.datos.etiqueta).toBe("Demo factura");
    expect(r.datos.script).toContain(`data-enlace="${enlace.token}"`);
    expect(await prisma.visitaEnlace.count()).toBe(2);
    const otra = await agregarEnlace(prospectoId, fd({ url: `https://${HOST}/factura/`, etiqueta: "Repetido" }));
    expect(otra).toEqual({ ok: false, mensaje: "Ese enlace ya está registrado para este prospecto." });
  });

  it("agregarEnlace rechaza URL ajena y etiqueta corta con mensaje", async () => {
    const ajena = await agregarEnlace(prospectoId, fd({ url: "https://ejemplo.com/x/", etiqueta: "Ajena" }));
    expect(ajena).toEqual({ ok: false, mensaje: "El enlace debe ser de neracosu.com o de un subdominio." });
    const corta = await agregarEnlace(prospectoId, fd({ url: `https://${HOST}/otra/`, etiqueta: "x" }));
    expect(corta.ok).toBe(false);
    const http = await agregarEnlace(prospectoId, fd({ url: `http://${HOST}/otra/`, etiqueta: "Sin https" }));
    expect(http.ok).toBe(false);
  });

  it("quitarEnlace, marcarVisitanteMio y guardarIpsPropiasAccion exigen dueno", async () => {
    const enlace = await prisma.enlaceEnviado.findFirstOrThrow({ where: { prospectoId } });
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "Pro", rol: "prospectador" };
    expect((await quitarEnlace(enlace.id)).ok).toBe(false);
    expect((await marcarVisitanteMio(prospectoId, "0123456789abcdef")).ok).toBe(false);
    expect((await guardarIpsPropiasAccion(fd({ ips: "203.0.113.7" }))).ok).toBe(false);
    expect((await importarArchivadosAccion(enlace.id)).ok).toBe(false);
    expect((await prisma.enlaceEnviado.findUniqueOrThrow({ where: { id: enlace.id } })).activo).toBe(true);
    sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" };
    expect((await marcarVisitanteMio(prospectoId, "no-valido")).ok).toBe(false);
    const g = await guardarIpsPropiasAccion(fd({ ips: "203.0.113.7\n198.51.100.1, basura" }));
    expect(g.ok).toBe(true);
    expect((await importarArchivadosAccion(enlace.id)).ok).toBe(true);
  });

  it("actualizarRastro devuelve cuantas visitas nuevas entraron", async () => {
    appendFileSync(archivoLog, L("203.0.113.6", "06/Nov/2026:11:00:00 -0400", "GET /factura/ HTTP/2.0", IPHONE) + "\n");
    const r = await actualizarRastro(prospectoId);
    expect(r).toEqual({ ok: true, datos: { visitas: 1 } });
    expect(await prisma.visitaEnlace.count()).toBe(3);
  });

  it("quitarEnlace desactiva el enlace y uno inexistente da mensaje", async () => {
    const enlace = await prisma.enlaceEnviado.findFirstOrThrow({ where: { prospectoId } });
    expect((await quitarEnlace(enlace.id)).ok).toBe(true);
    expect((await prisma.enlaceEnviado.findUniqueOrThrow({ where: { id: enlace.id } })).activo).toBe(false);
    expect(await quitarEnlace(999999)).toEqual({ ok: false, mensaje: "Ese enlace no existe." });
  });
});
