import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, crearProspectoDePrueba } from "./ayuda-db";
import { registrarEnlace, type EnlaceFila } from "@/lib/rastro";
import { parsearLinea } from "@/lib/rastro-contrato";
import { leerLogs, importarArchivados, visitasDeLinea } from "@/lib/rastro-lector";

const L = (ip: string, fecha: string, req: string, estado: number, ref: string, ua: string) => `${ip} - - [${fecha}] "${req}" ${estado} 1234 "${ref}" "${ua}"`;
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.3 Mobile/15E148 Safari/604.1";
const WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36";
const WHATSAPP = "WhatsApp/2.23.20.0";
const ROBOT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36";
const HOST = "demo-ejemplo.neracosu.com";
const PANEL = "prospectos.neracosu.com";
const ahoraMes = () => { const d = new Date(); return `${d.toLocaleString("en-US", { month: "short" })}-${d.getFullYear()}`; };
const texto = (ls: string[]) => ls.join("\n") + "\n";

// 7 lineas: 3 cuentan (vista 200, vista 304 por index.html, reenvio 206 de WhatsApp)
const SIETE = [
  L("203.0.113.5", "06/Nov/2026:10:00:00 -0400", "GET /factura/ HTTP/2.0", 200, "https://l.instagram.com/", IPHONE),
  L("203.0.113.5", "06/Nov/2026:10:01:00 -0400", "GET /factura/index.html HTTP/2.0", 304, "-", IPHONE),
  L("198.51.100.9", "06/Nov/2026:10:02:00 -0400", "GET /factura/ HTTP/1.1", 206, "-", WHATSAPP),
  L("203.0.113.5", "06/Nov/2026:10:03:00 -0400", "GET /demo/factura.css HTTP/2.0", 200, "https://demo-ejemplo.neracosu.com/factura/", IPHONE),
  L("198.51.100.20", "06/Nov/2026:10:04:00 -0400", "GET /factura/ HTTP/1.1", 200, "-", ROBOT),
  L("203.0.113.5", "06/Nov/2026:10:05:00 -0400", "GET /factura HTTP/2.0", 301, "-", IPHONE),
  L("203.0.113.5", "06/Nov/2026:10:06:00 -0400", "GET /otra/ HTTP/2.0", 200, "-", IPHONE),
];

describe("visitasDeLinea (pura)", () => {
  const enlaces = [{ id: 7, prefijo: "/factura/" }] as EnlaceFila[];
  const de = (linea: string) => visitasDeLinea(parsearLinea(linea)!, enlaces, linea);

  it("vista con origen externo y aparato; origen propio queda vacio", () => {
    const v = de(SIETE[0])!;
    expect(v).toMatchObject({ enlaceId: 7, fuente: "log", tipo: "vista", ruta: "/factura/", origen: "l.instagram.com", geoPendiente: true, detalle: "", segundos: null, scroll: null, ip: "203.0.113.5" });
    expect(v.aparato).toContain("iPhone");
    expect(v.huella).toMatch(/^[0-9a-f]{16}$/);
    expect(de(L("203.0.113.5", "06/Nov/2026:10:00:00 -0400", "GET /factura/ HTTP/2.0", 200, "https://www.neracosu.com/para/", WIN))!.origen).toBe("");
  });

  it("pdf, POST, 404 y assets", () => {
    expect(de(L("203.0.113.5", "06/Nov/2026:10:00:00 -0400", "GET /factura/cotizacion.pdf?x=1 HTTP/2.0", 200, "-", WIN))).toMatchObject({ tipo: "pdf", ruta: "/factura/cotizacion.pdf" });
    expect(de(L("203.0.113.5", "06/Nov/2026:10:00:00 -0400", "POST /factura/ HTTP/2.0", 200, "-", WIN))).toBeNull();
    expect(de(L("203.0.113.5", "06/Nov/2026:10:00:00 -0400", "GET /factura/ HTTP/2.0", 404, "-", WIN))).toBeNull();
    expect(de(L("203.0.113.5", "06/Nov/2026:10:00:00 -0400", "GET /factura/app.js HTTP/2.0", 200, "-", WIN))).toBeNull();
  });
});

describe.runIf(DB_HABILITADA)("rastro-lector: access-logs a visitas", () => {
  let dirLogs = "";
  let dirArchivo = "";
  let p: Awaited<ReturnType<typeof crearProspectoDePrueba>>;
  const vivo = () => join(dirLogs, `${HOST}-ssl_log`);
  const o = () => ({ dirLogs, dirArchivo, hosts: [HOST] });

  beforeEach(async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    await limpiarBase();
    const { nichoId } = await sembrarBasico();
    p = await crearProspectoDePrueba(nichoId);
    const r = await registrarEnlace({ prospectoId: p.id, url: `https://${HOST}/factura/`, etiqueta: "Demo" });
    if (!r.ok) throw new Error(r.error);
    dirLogs = mkdtempSync(join(tmpdir(), "rastro-logs-"));
    dirArchivo = mkdtempSync(join(tmpdir(), "rastro-archivo-"));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(dirLogs, { recursive: true, force: true });
    rmSync(dirArchivo, { recursive: true, force: true });
  });

  it("primera pasada: guarda vistas, reenvios (206) y pdf; ignora assets, robots, 301 y otros prefijos", async () => {
    writeFileSync(vivo(), texto([...SIETE, L("203.0.113.5", "06/Nov/2026:10:07:00 -0400", "GET /factura/cotizacion.pdf HTTP/2.0", 200, "-", IPHONE)]));
    const r = await leerLogs(o());
    expect(r).toEqual({ lineas: 8, visitas: 4, archivosReleidos: [] });
    const vs = await prisma.visitaEnlace.findMany({ orderBy: { ocurrioEn: "asc" } });
    expect(vs.map((v) => v.tipo)).toEqual(["vista", "vista", "reenvio", "pdf"]);
    expect(vs[2].detalle).toBe("whatsapp");
    expect(vs[1].ruta).toBe("/factura/");
    expect(vs.every((v) => v.fuente === "log" && v.geoPendiente)).toBe(true);
    const lectura = await prisma.lecturaLog.findUnique({ where: { archivo: vivo() } });
    expect(Number(lectura!.posicion)).toBe(Buffer.byteLength(texto([...SIETE, L("203.0.113.5", "06/Nov/2026:10:07:00 -0400", "GET /factura/cotizacion.pdf HTTP/2.0", 200, "-", IPHONE)])));
  });

  it("segunda pasada lee solo lo nuevo; una linea a medio escribir espera a la proxima", async () => {
    writeFileSync(vivo(), texto(SIETE));
    await leerLogs(o());
    const nueva = L("203.0.113.6", "06/Nov/2026:11:00:00 -0400", "GET /factura/ HTTP/2.0", 200, "-", WIN);
    appendFileSync(vivo(), nueva + "\n");
    expect(await leerLogs(o())).toEqual({ lineas: 1, visitas: 1, archivosReleidos: [] });
    const media = L("203.0.113.7", "06/Nov/2026:11:01:00 -0400", "GET /factura/ HTTP/2.0", 200, "-", WIN);
    appendFileSync(vivo(), media.slice(0, 30));
    expect(await leerLogs(o())).toEqual({ lineas: 0, visitas: 0, archivosReleidos: [] });
    appendFileSync(vivo(), media.slice(30) + "\n");
    expect(await leerLogs(o())).toEqual({ lineas: 1, visitas: 1, archivosReleidos: [] });
    expect(await prisma.visitaEnlace.count()).toBe(5);
  });

  it("truncado con el mismo inode: relee el .gz del mes y el vivo desde cero sin duplicar", async () => {
    writeFileSync(vivo(), texto(SIETE));
    await leerLogs(o());
    const antesDeRotar = L("203.0.113.8", "06/Nov/2026:23:59:00 -0400", "GET /factura/ HTTP/2.0", 200, "-", WIN);
    writeFileSync(join(dirArchivo, `${HOST}-ssl_log-${ahoraMes()}.gz`), Buffer.concat([gzipSync(texto(SIETE)), gzipSync(antesDeRotar + "\n")]));
    writeFileSync(vivo(), texto([L("203.0.113.9", "07/Nov/2026:00:01:00 -0400", "GET /factura/ HTTP/2.0", 200, "-", IPHONE)]));
    const r = await leerLogs(o());
    expect(r.archivosReleidos).toEqual([vivo()]);
    expect(r.visitas).toBe(2);
    expect(await prisma.visitaEnlace.count()).toBe(3 + 1 + 1);
  });

  it("archivo HTTP sin ssl tambien se lee; sin archivos no falla", async () => {
    expect(await leerLogs(o())).toEqual({ lineas: 0, visitas: 0, archivosReleidos: [] });
    writeFileSync(join(dirLogs, HOST), texto([SIETE[0]]));
    expect((await leerLogs(o())).visitas).toBe(1);
  });

  it("una linea rota no tira la pasada", async () => {
    writeFileSync(vivo(), texto([SIETE[0], "basura \"sin forma", SIETE[2]]));
    const r = await leerLogs(o());
    expect(r.lineas).toBe(3);
    expect(r.visitas).toBe(2);
  });

  it("/p/<codigo> crea el enlace plantilla y /p/<codigo>/pdf cuenta como pdf", async () => {
    writeFileSync(join(dirLogs, `${PANEL}-ssl_log`), texto([
      L("203.0.113.5", "06/Nov/2026:10:00:00 -0400", `GET /p/${p.codigo} HTTP/2.0`, 200, "-", IPHONE),
      L("203.0.113.5", "06/Nov/2026:10:01:00 -0400", `GET /p/${p.codigo}/pdf HTTP/2.0`, 200, "-", IPHONE),
      L("203.0.113.5", "06/Nov/2026:10:02:00 -0400", `GET /p/${"x".repeat(22)} HTTP/2.0`, 200, "-", IPHONE),
    ]));
    const r = await leerLogs({ dirLogs, dirArchivo });
    expect(r.visitas).toBe(2);
    const enlace = await prisma.enlaceEnviado.findFirst({ where: { host: PANEL } });
    expect(enlace).toMatchObject({ prefijo: `/p/${p.codigo}`, origen: "plantilla", prospectoId: p.id });
    const vs = await prisma.visitaEnlace.findMany({ where: { enlaceId: enlace!.id }, orderBy: { ocurrioEn: "asc" } });
    expect(vs.map((v) => v.tipo)).toEqual(["vista", "pdf"]);
  });

  it("un robot en /p/<codigo> no crea el enlace plantilla", async () => {
    writeFileSync(join(dirLogs, `${PANEL}-ssl_log`), texto([L("198.51.100.20", "06/Nov/2026:10:00:00 -0400", `GET /p/${p.codigo} HTTP/2.0`, 200, "-", ROBOT)]));
    expect((await leerLogs({ dirLogs, dirArchivo })).visitas).toBe(0);
    expect(await prisma.enlaceEnviado.count({ where: { host: PANEL } })).toBe(0);
  });

  it("soloPrefijo + desdeCero: lee el vivo entero para un enlace y no mueve la posicion", async () => {
    const r2 = await registrarEnlace({ prospectoId: p.id, url: `https://${HOST}/otra/`, etiqueta: "Otra" });
    if (!r2.ok) throw new Error(r2.error);
    writeFileSync(vivo(), texto(SIETE));
    const r = await leerLogs({ dirLogs, dirArchivo, desdeCero: true, soloPrefijo: { host: HOST, prefijo: "/otra/" } });
    expect(r.visitas).toBe(1);
    expect(await prisma.lecturaLog.count()).toBe(0);
    expect((await leerLogs(o())).visitas).toBe(3);
  });

  it("importarArchivados recorre todos los .gz del host y respeta --desde", async () => {
    writeFileSync(join(dirArchivo, `${HOST}-ssl_log-Oct-2026.gz`), gzipSync(texto([
      L("203.0.113.5", "20/Oct/2026:10:00:00 -0400", "GET /factura/ HTTP/2.0", 200, "-", IPHONE),
      L("203.0.113.5", "30/Oct/2026:10:00:00 -0400", "GET /factura/ HTTP/2.0", 200, "-", IPHONE),
    ])));
    writeFileSync(join(dirArchivo, `${HOST}-Nov-2026.gz`), gzipSync(texto([L("203.0.113.6", "02/Nov/2026:10:00:00 -0400", "GET /factura/ HTTP/1.1", 200, "-", WIN)])));
    writeFileSync(join(dirArchivo, `otro-${HOST}-ssl_log-Nov-2026.gz`), gzipSync(texto([L("203.0.113.6", "03/Nov/2026:10:00:00 -0400", "GET /factura/ HTTP/1.1", 200, "-", WIN)])));
    const r = await importarArchivados({ host: HOST, prefijo: "/factura/", desde: new Date("2026-10-25T00:00:00Z"), dirArchivo });
    expect(r).toEqual({ lineas: 3, visitas: 2, archivosReleidos: [] });
    expect(await prisma.lecturaLog.count()).toBe(0);
    expect((await importarArchivados({ host: HOST, dirArchivo })).visitas).toBe(1);
  });

  it("dos lecturas a la vez: la segunda espera el candado y no duplica", async () => {
    writeFileSync(vivo(), texto(SIETE));
    const [a, b] = await Promise.all([leerLogs(o()), leerLogs(o())]);
    expect(a.lineas + b.lineas).toBe(7);
    expect(a.visitas + b.visitas).toBe(3);
    expect(await prisma.visitaEnlace.count()).toBe(3);
  });
});
