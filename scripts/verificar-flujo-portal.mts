// scripts/verificar-flujo-portal.mts — recorrido del portal del cliente a 390 px: PIN errado, PIN bueno, dos
// proyectos, pestanas, bajar un recibo, aislamiento entre clientes, salir.
// SOLO contra el servidor de desarrollo del clon con la base de tests. El script y el servidor tienen que
// compartir PROSPECTOS_DIR_ARCHIVOS (un directorio temporal): aqui se deja el PDF de prueba que la ruta sirve.
// Uso (desde el clon, con su next dev en 3014 levantado con ese mismo directorio):
//   DATABASE_URL="$TEST_DATABASE_URL" PROSPECTOS_DIR_ARCHIVOS=<temporal> BASE_URL=http://127.0.0.1:3014 npx tsx scripts/verificar-flujo-portal.mts
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { chromium } from "playwright";
import { prisma } from "../src/lib/db";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3014";
const DIR = process.env.PROSPECTOS_DIR_ARCHIVOS ?? "";
if (!(process.env.DATABASE_URL ?? "").includes("prospectos_test")) { console.error("ALTO: DATABASE_URL no es la base de tests."); process.exit(2); }
if (/neracosu\.com|:3013(\/|$)/.test(BASE)) { console.error("ALTO: BASE_URL apunta a produccion. Usa el servidor de desarrollo del clon."); process.exit(2); }
if (!DIR || path.resolve(DIR) === "/home/neracosu/prospectos-archivos") { console.error("ALTO: PROSPECTOS_DIR_ARCHIVOS tiene que ser un directorio temporal, el mismo del servidor de desarrollo."); process.exit(2); }

mkdirSync("capturas", { recursive: true });
const errores: string[] = [];
const marca = `(PRUEBA) ${Date.now()}`;
const PIN = "482915";
const codigoDe = (semilla: string) => (semilla + "x".repeat(22)).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 22);
const ids: { clientes: number[] } = { clientes: [] };

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const pg = await ctx.newPage();
pg.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
pg.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errores.push(`console: ${m.text()}`); });
const sinScroll = async (donde: string) => { const ancho = await pg.evaluate(() => document.documentElement.scrollWidth); if (ancho > 390) errores.push(`scroll horizontal en ${donde}: ${ancho}px`); };
try {
  const nicho = (await prisma.nicho.findFirst()) ?? (await prisma.nicho.create({ data: { slug: "hoteles", nombre: "Hoteles", mensajeInicial: "{nombre} {enlace}", mensajeSeguimiento: "{nombre} {enlace}" } }));
  await prisma.configuracion.upsert({ where: { clave: "datos_emisor" }, update: {}, create: { clave: "datos_emisor", valor: JSON.stringify({ nombre: "Neri Colón", rif: "V-12345678-9", whatsapp: "584121234567", email: "neri@ejemplo.test" }) } });
  const a = await prisma.cliente.create({ data: { nombre: `Hotel ${marca}`, whatsapp: "584120000000", codigo: codigoDe(`a${Date.now()}`) } });
  const otro = await prisma.cliente.create({ data: { nombre: `Farmacia ${marca}`, codigo: codigoDe(`b${Date.now()}`) } });
  ids.clientes.push(a.id, otro.id);
  await prisma.usuario.create({ data: { nombre: a.nombre, rol: "cliente", clienteId: a.id, pinHash: await bcrypt.hash(PIN, 10), metaDiaria: 0 } });
  const pms = await prisma.proyecto.create({ data: { clienteId: a.id, nichoId: nicho.id, nombre: "PMS Hotel", pagoUnico: "2800.00", mensualidad: "100.00", fechaInicio: "2026-06-01", estado: "activo", diaCobroMensual: 5 } });
  await prisma.proyecto.create({ data: { clienteId: a.id, nichoId: nicho.id, nombre: "Módulo de reservas en línea", pagoUnico: "900.00", mensualidad: "0", fechaInicio: "2026-09-01", estado: "en_construccion" } });
  const ajeno = await prisma.proyecto.create({ data: { clienteId: otro.id, nichoId: nicho.id, nombre: "Inventario ajeno", pagoUnico: "500.00", mensualidad: "0", fechaInicio: "2026-09-01", estado: "activo" } });
  await prisma.pendiente.createMany({ data: [
    { proyectoId: pms.id, texto: "Recepción y habitaciones", visibleCliente: true, hecho: true, hechoEn: new Date("2026-07-02T16:00:00Z"), fechaEstimada: "2026-06-30", orden: 1 },
    { proyectoId: pms.id, texto: "Conexión con el punto de venta del restaurante", visibleCliente: true, hecho: false, orden: 2 },
    { proyectoId: pms.id, texto: "INTERNO no debe verse", visibleCliente: false, hecho: false, orden: 3 },
  ] });
  const v = await prisma.version.create({ data: { proyectoId: pms.id, version: "1.4.2", fecha: "2026-08-28" } });
  await prisma.cambio.create({ data: { versionId: v.id, tipo: "arreglo", texto: "El cierre de caja ya no duplica los pagos en Zelle.", orden: 1 } });
  const numero = `R-2026-9${String(Date.now()).slice(-3)}`;
  await prisma.cobro.createMany({ data: [
    { proyectoId: pms.id, concepto: "mensualidad", detalle: "Mensualidad de septiembre 2026", mes: "2026-09", monto: "100.00", vence: "2026-09-05" },
    { proyectoId: pms.id, concepto: "cuota", detalle: "Cuota 3 de 3", monto: "933.34", vence: "2026-07-15", pagadoEn: new Date("2026-07-15T16:00:00Z"), canal: "pago_movil", reciboNumero: numero, reciboGeneradoEn: new Date() },
  ] });
  mkdirSync(path.join(DIR, "recibos", "2026"), { recursive: true });
  writeFileSync(path.join(DIR, "recibos", "2026", `${numero}.pdf`), "%PDF-1.4 recibo de prueba del recorrido");

  // 1. PIN errado y despues el bueno
  await pg.goto(`${BASE}/c/${a.codigo}`);
  await pg.getByText("Escribe tu PIN de 6 números para ver tus proyectos.").waitFor();
  await pg.screenshot({ path: "capturas/p5-01-pin.png", fullPage: true });
  await sinScroll("PIN");
  for (const d of "000000") await pg.getByRole("button", { name: d, exact: true }).click();
  await pg.getByText("PIN incorrecto.").waitFor();
  await pg.waitForTimeout(500); // el teclado limpia el PIN 300 ms despues de enviar: teclear antes lo borraria a medias
  for (const d of PIN) await pg.getByRole("button", { name: d, exact: true }).click();
  await pg.waitForURL(/\/inicio$/);

  // 2. Inicio: dos proyectos y el aviso del vencido
  await pg.getByRole("heading", { name: "PMS Hotel" }).waitFor();
  await pg.getByRole("heading", { name: "Módulo de reservas en línea" }).waitFor();
  await pg.getByText("Tienes un cobro vencido").waitFor();
  await pg.screenshot({ path: "capturas/p5-02-inicio.png", fullPage: true });
  await sinScroll("inicio");

  // 3. Del aviso a los cobros; bajar el recibo con la sesion del cliente
  await pg.getByRole("link", { name: "Ver cobros" }).click();
  await pg.getByRole("heading", { name: "Por pagar" }).waitFor();
  await pg.getByRole("link", { name: `Descargar recibo ${numero}` }).waitFor();
  await pg.screenshot({ path: "capturas/p5-03-cobros.png", fullPage: true });
  await sinScroll("cobros");
  const pdf = await ctx.request.get(`${BASE}/recibos/${numero}.pdf`);
  if (pdf.status() !== 200 || pdf.headers()["content-type"] !== "application/pdf") errores.push(`recibo del cliente: ${pdf.status()}`);

  // 4. Avance y versiones; lo interno no aparece
  await pg.getByRole("link", { name: "Avance" }).click();
  await pg.getByText("1 de 2 hitos cumplidos").waitFor();
  if (await pg.getByText("INTERNO").count()) errores.push("se ve un pendiente interno");
  await pg.screenshot({ path: "capturas/p5-04-avance.png", fullPage: true });
  await pg.getByRole("link", { name: "Versiones" }).click();
  await pg.getByText("El cierre de caja ya no duplica los pagos en Zelle.").waitFor();
  await pg.screenshot({ path: "capturas/p5-05-versiones.png", fullPage: true });
  await sinScroll("versiones");
  await pg.getByRole("link", { name: "Contacto" }).click();
  await pg.getByRole("link", { name: /por WhatsApp/ }).waitFor();
  await pg.screenshot({ path: "capturas/p5-06-contacto.png", fullPage: true });

  // 5. Aislamiento: el proyecto de otro cliente y el panel no existen para esta sesion
  const ajenoRes = await ctx.request.get(`${BASE}/c/${a.codigo}/proyecto/${ajeno.id}`);
  if (ajenoRes.status() !== 404) errores.push(`proyecto ajeno deberia ser 404, fue ${ajenoRes.status()}`);
  const panel = await ctx.request.get(`${BASE}/proyectos`, { maxRedirects: 0 });
  if (panel.status() !== 307) errores.push(`el panel con sesion de cliente deberia redirigir a /entrar, fue ${panel.status()}`);
  const portalAjeno = await ctx.request.get(`${BASE}/c/${otro.codigo}/inicio`, { maxRedirects: 0 });
  if (portalAjeno.status() !== 307) errores.push(`el portal de otro cliente deberia volver a su PIN, fue ${portalAjeno.status()}`);
  if ((await prisma.evento.count({ where: { clienteId: a.id, tipo: "portal_abierto" } })) !== 1) errores.push("no quedo un (y solo un) evento portal_abierto");

  // 6. Salir vuelve al PIN y la sesion ya no sirve
  await pg.getByRole("link", { name: "Salir" }).click();
  await pg.getByText("Escribe tu PIN de 6 números para ver tus proyectos.").waitFor();
  const tras = await ctx.request.get(`${BASE}/c/${a.codigo}/inicio`, { maxRedirects: 0 });
  if (tras.status() !== 307) errores.push("despues de salir la sesion sigue abierta");

  // 7. Acceso desactivado: misma URL, sin teclado
  await prisma.usuario.updateMany({ where: { clienteId: a.id }, data: { activo: false } });
  await pg.goto(`${BASE}/c/${a.codigo}`);
  await pg.getByRole("heading", { name: "Acceso desactivado" }).waitFor();
  await pg.screenshot({ path: "capturas/p5-07-desactivado.png", fullPage: true });
} catch (e) {
  errores.push(`excepcion: ${(e as Error).message}`);
  await pg.screenshot({ path: "capturas/p5-error.png", fullPage: true }).catch(() => {});
} finally {
  await b.close();
  for (const clienteId of ids.clientes) {
    const pids = (await prisma.proyecto.findMany({ where: { clienteId }, select: { id: true } })).map((p) => p.id);
    await prisma.evento.deleteMany({ where: { OR: [{ proyectoId: { in: pids } }, { clienteId }] } });
    await prisma.cambio.deleteMany({ where: { version: { proyectoId: { in: pids } } } });
    await prisma.version.deleteMany({ where: { proyectoId: { in: pids } } });
    await prisma.pendiente.deleteMany({ where: { proyectoId: { in: pids } } });
    await prisma.cobro.deleteMany({ where: { proyectoId: { in: pids } } });
    await prisma.proyecto.deleteMany({ where: { id: { in: pids } } });
    await prisma.usuario.deleteMany({ where: { clienteId } });
    await prisma.cliente.delete({ where: { id: clienteId } });
  }
  await prisma.$disconnect();
}
console.log(errores.length ? `FALLO:\n- ${errores.join("\n- ")}` : "PASS: recorrido del portal sin errores");
process.exit(errores.length ? 1 : 0);
