// scripts/verificar-flujo-ux-c.mts — recorrido real a 390 px de la fase C de la pasada de UX: esqueleto al navegar
// (y NO al cambiar de pestana dentro de un proyecto), validacion en linea pegada al campo, service worker que solo
// existe en produccion y muestra «Sin conexion» sin tocar el portal, y la propuesta de hoteles de estadia servida.
// Corre contra `next start` del clon (build previo con NODE_ENV=production): en `next dev` no hay service worker.
// Siembra con la marca (PRUEBA), entra con un dueno temporal y al terminar borra lo suyo. SOLO base de tests.
// Uso (desde el clon, con su next start en 3014):
//   PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 DATABASE_URL="$TEST_DATABASE_URL" BASE_URL=http://127.0.0.1:3014 npx tsx scripts/verificar-flujo-ux-c.mts
import bcrypt from "bcryptjs";
import { chromium, type Page } from "playwright";
import { prisma } from "../src/lib/db";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3014";
if (!(process.env.DATABASE_URL ?? "").includes("prospectos_test")) { console.error("ALTO: DATABASE_URL no es la base de tests."); process.exit(2); }
if (/neracosu\.com|:3013(\/|$)/.test(BASE)) { console.error("ALTO: BASE_URL apunta a produccion. Usa el servidor del clon."); process.exit(2); }

const sello = Date.now();
const marca = `(PRUEBA) ${sello}`;
const PIN_PANEL = "417263";
const RETENCION_MS = 1500;
const codigoDe = (semilla: string) => (semilla + "x".repeat(22)).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 22);
const errores: string[] = [];
const pasos: string[] = [];
const revisar = (ok: boolean, que: string) => { (ok ? pasos : errores).push(que); };
const creado = { prospectos: [] as number[], clienteId: 0, duenoId: 0, nichoId: 0, nichoPropio: false, nichoEstadiaPropio: false, nichoEstadiaId: 0 };
async function cuantoTarda(fn: () => Promise<unknown>): Promise<number> { const t = Date.now(); await fn(); return Date.now() - t; }
async function entrar(pg: Page) {
  await pg.goto(`${BASE}/entrar`);
  for (const d of PIN_PANEL) await pg.getByRole("button", { name: d, exact: true }).click();
  await pg.waitForURL(/\/hoy$/);
  await pg.waitForLoadState("networkidle");
}

const b = await chromium.launch();
try {
  let nicho = await prisma.nicho.findFirst({ where: { slug: "hoteles" } });
  if (!nicho) { nicho = await prisma.nicho.create({ data: { slug: "hoteles", nombre: "Hoteles", mensajeInicial: "Buenas, {nombre}: {enlace}", mensajeSeguimiento: "Hola de nuevo, {nombre}: {enlace}", diasSeguimiento: 3, plantillaPropuesta: "hoteles" } }); creado.nichoPropio = true; }
  creado.nichoId = nicho.id;
  let estadia = await prisma.nicho.findFirst({ where: { slug: "hoteles-estadia" } });
  if (!estadia) { estadia = await prisma.nicho.create({ data: { slug: "hoteles-estadia", nombre: "Hoteles de estadía", mensajeInicial: "Buenas, {nombre}: {enlace}", mensajeSeguimiento: "Hola de nuevo, {nombre}: {enlace}", diasSeguimiento: 3, plantillaPropuesta: "hoteles-estadia" } }); creado.nichoEstadiaPropio = true; }
  creado.nichoEstadiaId = estadia.id;
  const posada = await prisma.prospecto.create({ data: { nichoId: estadia.id, nombre: `Posada Los Frailes ${marca}`, ciudad: "Mérida", tipo: "posada urbana", fuentes: ["https://ejemplo.test/"], codigo: codigoDe(`e${sello}`), clave: `posadalosfrailes|merida|${sello}`, ordenCola: 5 } });
  creado.prospectos.push(posada.id);
  const dueno = await prisma.usuario.create({ data: { nombre: `Dueño ${marca}`, rol: "dueno", pinHash: await bcrypt.hash(PIN_PANEL, 10), metaDiaria: 10 } });
  creado.duenoId = dueno.id;
  const cliente = await prisma.cliente.create({ data: { nombre: `Hotel Valle Arriba ${marca}`, contactoNombre: "Ana Pérez", whatsapp: "584129990000", codigo: codigoDe(`k${sello}`) } });
  creado.clienteId = cliente.id;
  const pms = await prisma.proyecto.create({ data: { clienteId: cliente.id, nichoId: nicho.id, nombre: "PMS Hotel", pagoUnico: "2800.00", mensualidad: "100.00", horasCotizadas: "160", fechaInicio: "2026-06-01", estado: "activo", diaCobroMensual: 5 } });
  await prisma.cobro.create({ data: { proyectoId: pms.id, concepto: "extra", detalle: "Reportes de ocupación", monto: "150.50", vence: "2026-10-01" } });
  await prisma.pendiente.create({ data: { proyectoId: pms.id, texto: "Conexión con el punto de venta", visibleCliente: true, hecho: false, orden: 1 } });

  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
  // Retencion selectiva: solo las respuestas cuya ruta coincida con `retenida`. `caida` corta la red (como sin senal)
  // para las rutas que coincidan: context.setOffline no alcanza a las peticiones que hace el service worker, y por
  // eso este script se corre con PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 (asi el route tambien las ve).
  let retenida: RegExp | null = null;
  let caida: RegExp | null = null;
  await ctx.route((url) => url.origin === new URL(BASE).origin, async (route) => {
    const u = new URL(route.request().url());
    if (caida && caida.test(u.pathname + u.search)) return route.abort("internetdisconnected");
    if (retenida && retenida.test(u.pathname + u.search)) await new Promise((r) => setTimeout(r, RETENCION_MS));
    await route.continue();
  });
  await entrar(pg);

  // 1. Esqueleto al navegar entre secciones, con la respuesta retenida.
  retenida = /^\/prospectos(\?|$)/;
  await pg.getByRole("link", { name: "Prospectos" }).click();
  const tEsq = await cuantoTarda(() => pg.locator(".esqueleto").waitFor({ timeout: RETENCION_MS - 200 })).catch(() => -1);
  revisar(tEsq >= 0 && tEsq < 500, `al tocar «Prospectos» aparece el esqueleto antes de que responda el servidor (${tEsq} ms)`);
  await pg.waitForURL(/\/prospectos$/);
  await pg.locator(".esqueleto").waitFor({ state: "detached", timeout: RETENCION_MS + 8000 });
  revisar(true, "y se va cuando llega la pantalla");
  retenida = null;

  // 2. Cambiar de pestana dentro de un proyecto no muestra esqueleto: lo viejo sigue a la vista.
  await pg.goto(`${BASE}/proyectos/${pms.id}?t=cobros`, { waitUntil: "networkidle" });
  retenida = /t=pendientes/;
  await pg.getByRole("link", { name: "Pendientes" }).click();
  await pg.waitForTimeout(400);
  const esqEnPestana = await pg.locator(".esqueleto").count();
  const cobrosSiguen = await pg.getByRole("button", { name: "Marcar pagado" }).count();
  revisar(esqEnPestana === 0 && cobrosSiguen > 0, `cambiar de pestaña conserva la pestaña vieja mientras llega la nueva (esqueletos: ${esqEnPestana}, cobros a la vista: ${cobrosSiguen})`);
  await pg.getByText("Conexión con el punto de venta").waitFor({ timeout: RETENCION_MS + 8000 });
  retenida = null;

  // 3. Validacion en linea en el alta de prospecto.
  await pg.goto(`${BASE}/prospectos/nuevo`, { waitUntil: "networkidle" });
  const nombre = pg.locator("input[name=nombre]");
  await nombre.fill("A");
  await nombre.press("Tab");
  revisar(await pg.getByText("Mínimo 2 letras.").isVisible().catch(() => false), "al salir de «nombre» con una letra, el mensaje sale pegado al campo");
  await nombre.fill(`Hotel Prueba ${marca}`);
  await pg.waitForTimeout(100);
  revisar((await pg.getByText("Mínimo 2 letras.").count()) === 0, "al corregir, el mensaje se va mientras se escribe");
  await pg.getByRole("button", { name: "Guardar" }).click();
  await pg.waitForTimeout(300);
  const enfocado = await pg.evaluate(() => (document.activeElement as HTMLInputElement | null)?.name ?? "");
  revisar(enfocado === "ciudad", `al enviar con ciudad vacía, el foco cae en ciudad (cayó en «${enfocado}»)`);
  revisar(await pg.locator("label", { hasText: "Ciudad" }).getByText("Este dato hace falta.").isVisible().catch(() => false), "y el mensaje «Este dato hace falta.» queda en ese campo");
  revisar(pg.url().endsWith("/prospectos/nuevo"), "el formulario no se envió al servidor");
  await pg.locator("input[name=ciudad]").fill("Caracas");
  await pg.waitForTimeout(100);
  revisar((await pg.getByText("Este dato hace falta.").count()) === 0, "al escribir la ciudad, el mensaje se va");

  // 4. Service worker: existe, se sirve sin cache, y sin red muestra «Sin conexion» solo en el panel.
  const sw = await pg.request.get(`${BASE}/sw.js`);
  revisar(sw.status() === 200 && /no-cache/.test(sw.headers()["cache-control"] ?? ""), `/sw.js responde 200 con Cache-Control no-cache (${sw.headers()["cache-control"]})`);
  await pg.goto(`${BASE}/hoy`, { waitUntil: "networkidle" });
  const activo = await pg.evaluate(() => Promise.race([navigator.serviceWorker.ready.then((r) => !!r.active), new Promise<boolean>((r) => setTimeout(() => r(false), 8000))]));
  revisar(activo, "en el panel el service worker queda activo");
  // Que /sin-conexion ya este en cache (se precachea al instalar).
  const enCache = await pg.evaluate(async () => { const c = await caches.open("pr-estaticos-v1"); return !!(await c.match("/sin-conexion")); });
  revisar(enCache, "la página de sin conexión quedó en la caché al instalar");
  const ancho = await pg.evaluate(() => document.documentElement.scrollWidth);
  revisar(ancho <= 390, `sin scroll horizontal a 390 px (${ancho}px)`);
  caida = /^\/(prospectos|c\/)/;
  await pg.goto(`${BASE}/prospectos`).catch(() => {});
  const sinConexion = await pg.getByRole("heading", { name: "Sin conexión" }).isVisible().catch(() => false);
  revisar(sinConexion, `sin red, una navegación del panel muestra «Sin conexión» (quedó en ${pg.url()})`);
  if (sinConexion) revisar(errores.every((e) => !e.startsWith("pageerror")), "y la página de sin conexión carga sus propios archivos desde la caché");
  let portalCayoEnSinConexion = false;
  await pg.goto(`${BASE}/c/abcdefghijklmnopqrstuv`).then(async () => { portalCayoEnSinConexion = await pg.getByRole("heading", { name: "Sin conexión" }).isVisible().catch(() => false); }).catch(() => {});
  revisar(!portalCayoEnSinConexion, "sin red, el portal del cliente NO cae en la página del panel (el service worker lo ignora)");
  caida = null;

  // 5. Un contexto limpio que abre el portal no registra ningun service worker.
  const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const pg2 = await ctx2.newPage();
  await pg2.goto(`${BASE}/c/abcdefghijklmnopqrstuv`, { waitUntil: "networkidle" });
  await pg2.waitForTimeout(500);
  const registros = await pg2.evaluate(() => navigator.serviceWorker.getRegistrations().then((r) => r.length));
  revisar(registros === 0, `el portal del cliente no registra service worker (registros: ${registros})`);
  await ctx2.close();

  // 6. La propuesta de hoteles de estadia se sirve por el enlace publico del prospecto.
  const prop = await pg.request.get(`${BASE}/p/${posada.codigo}`);
  const cuerpo = await prop.text();
  revisar(prop.status() === 200 && cuerpo.includes("hoteles y posadas de estadía") && cuerpo.includes(`Posada Los Frailes ${marca}`), `la propuesta de estadía se sirve personalizada (${prop.status()})`);
  revisar(!cuerpo.includes("$2.800") || cuerpo.includes("neracosu.com/para/hoteles.html"), "la propuesta de estadía no trae tabla de precios propia");

} catch (e) {
  errores.push(`excepcion: ${(e as Error).message}`);
} finally {
  await b.close();
  if (creado.clienteId) {
    const pids = (await prisma.proyecto.findMany({ where: { clienteId: creado.clienteId }, select: { id: true } })).map((p) => p.id);
    await prisma.evento.deleteMany({ where: { OR: [{ proyectoId: { in: pids } }, { clienteId: creado.clienteId }] } });
    await prisma.pendiente.deleteMany({ where: { proyectoId: { in: pids } } });
    await prisma.cobro.deleteMany({ where: { proyectoId: { in: pids } } });
    await prisma.proyecto.deleteMany({ where: { id: { in: pids } } });
    await prisma.cliente.delete({ where: { id: creado.clienteId } }).catch((e) => errores.push(`LIMPIEZA: quedo el cliente ${creado.clienteId}: ${(e as Error).message}`));
  }
  // Un alta que hubiera llegado a guardarse (no deberia) tambien se limpia por la marca.
  const sobrantes = await prisma.prospecto.findMany({ where: { nombre: { contains: marca } }, select: { id: true } });
  const ids = [...new Set([...creado.prospectos, ...sobrantes.map((p) => p.id)])];
  await prisma.evento.deleteMany({ where: { prospectoId: { in: ids } } });
  await prisma.prospecto.deleteMany({ where: { id: { in: ids } } });
  if (creado.duenoId) { await prisma.evento.deleteMany({ where: { usuarioId: creado.duenoId } }); await prisma.usuario.delete({ where: { id: creado.duenoId } }).catch((e) => errores.push(`LIMPIEZA: quedo el dueno temporal ${creado.duenoId}: ${(e as Error).message}`)); }
  if (creado.nichoEstadiaPropio) await prisma.nicho.delete({ where: { id: creado.nichoEstadiaId } }).catch(() => {});
  if (creado.nichoPropio) await prisma.nicho.delete({ where: { id: creado.nichoId } }).catch(() => {});
  await prisma.$disconnect();
}
for (const p of pasos) console.log(`  ok  ${p}`);
console.log(errores.length ? `FALLA:\n- ${errores.join("\n- ")}` : `PASA: ${pasos.length} comprobaciones de la fase C`);
process.exit(errores.length ? 1 : 0);
