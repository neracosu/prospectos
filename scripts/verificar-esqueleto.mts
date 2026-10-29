// scripts/verificar-esqueleto.mts — recorrido real del esqueleto del panel CRM (fase 1): barra lateral en escritorio
// (desde 1024 px), barra inferior con «Mas» en telefono, lo que ve cada rol, /inicio, /solicitudes, Ajustes en
// acordeon y las redirecciones. Siembra con la marca (PRUEBA), entra con un dueno y un prospectador temporales y
// al terminar borra lo suyo. SOLO contra el servidor de desarrollo del clon con la base de tests.
// Uso (desde el clon, con su next dev en 3021):
//   DATABASE_URL="$TEST_DATABASE_URL" BASE_URL=http://127.0.0.1:3021 npx tsx scripts/verificar-esqueleto.mts [capturas/esqueleto]
// Variables: SIN_INICIO=1 salta lo de /inicio (hasta la tarea 3); SIN_SOLICITUDES=1 (tarea 4); SIN_AJUSTES=1 (tarea 5);
// SIN_RUTAS=1 (tarea 6).
import { mkdirSync } from "node:fs";
import bcrypt from "bcryptjs";
import { chromium, type Browser, type Page } from "playwright";
import { prisma } from "../src/lib/db";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3021";
const SALIDA = process.argv[2] ?? "capturas/esqueleto";
if (!(process.env.DATABASE_URL ?? "").includes("prospectos_test")) { console.error("ALTO: DATABASE_URL no es la base de tests."); process.exit(2); }
if (/neracosu\.com|:3013(\/|$)/.test(BASE)) { console.error("ALTO: BASE_URL apunta a produccion. Usa el servidor de desarrollo del clon."); process.exit(2); }
mkdirSync(SALIDA, { recursive: true });

const sello = Date.now();
const marca = `(PRUEBA) ${sello}`;
const PIN_DUENO = "604918";
const PIN_PROSPECTADOR = "271635";
const hoy = new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10);
const dia = (n: number) => { const d = new Date(`${hoy}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const codigoDe = (semilla: string) => (semilla + "x".repeat(22)).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 22);
const errores: string[] = [];
const pasos: string[] = [];
const revisar = (ok: boolean, que: string) => { (ok ? pasos : errores).push(que); };
const creado = { prospectos: [] as number[], clientes: [] as number[], usuarios: [] as number[], solicitudes: [] as number[], nichoId: 0, nichoPropio: false };

async function entrar(pg: Page, pin: string) {
  await pg.goto(`${BASE}/entrar`);
  for (const d of pin) await pg.getByRole("button", { name: d, exact: true }).click();
  await pg.waitForURL((u) => /\/(hoy|inicio)$/.test(u.pathname));
  await pg.waitForLoadState("networkidle");
}
async function pagina(b: Browser, ancho: number, alto: number, movil: boolean) {
  const ctx = await b.newContext({ viewport: { width: ancho, height: alto }, isMobile: movil, hasTouch: movil, locale: "es-VE" });
  return { ctx, pg: await ctx.newPage() };
}
const visible = async (pg: Page, sel: string) => (await pg.locator(sel).count()) > 0 && await pg.locator(sel).first().isVisible();

const b = await chromium.launch();
try {
  // ---------- siembra ----------
  let nicho = await prisma.nicho.findFirst({ where: { slug: "hoteles" } });
  if (!nicho) { nicho = await prisma.nicho.create({ data: { slug: "hoteles", nombre: "Hoteles", mensajeInicial: "Buenas, {nombre}: {enlace}", mensajeSeguimiento: "Hola {nombre}", etiquetaOsm: [["tourism", "hotel"]] } }); creado.nichoPropio = true; }
  creado.nichoId = nicho.id;
  const prospecto = (nombre: string, ciudad: string, extra: Record<string, unknown>) => prisma.prospecto.create({ data: {
    nichoId: nicho!.id, nombre: `${nombre} ${marca}`, ciudad, fuentes: ["https://ejemplo.test/"], codigo: codigoDe(`e${sello}${nombre}`),
    clave: `${nombre}|${ciudad}|${sello}`.toLowerCase().replace(/[^a-z0-9|]/g, ""), ...extra } });
  const seguimiento = await prospecto("Posada Faro", "Catia La Mar", { whatsapp: "584121112233", etapa: "enviado", proximoSeguimiento: dia(-1) });
  const cola = await prospecto("Hotel Cola", "Caracas", { whatsapp: "584129998877", ordenCola: 1 });
  creado.prospectos.push(seguimiento.id, cola.id);
  const dueno = await prisma.usuario.create({ data: { nombre: `Dueño ${marca}`, rol: "dueno", pinHash: await bcrypt.hash(PIN_DUENO, 10), metaDiaria: 10 } });
  const prospectador = await prisma.usuario.create({ data: { nombre: `Prospectador ${marca}`, rol: "prospectador", pinHash: await bcrypt.hash(PIN_PROSPECTADOR, 10), metaDiaria: 5 } });
  creado.usuarios.push(dueno.id, prospectador.id);
  const cliente = await prisma.cliente.create({ data: { nombre: `Tienda Alma ${marca}`, contactoNombre: "Ana", whatsapp: "584129990000", codigo: codigoDe(`c${sello}`) } });
  creado.clientes.push(cliente.id);
  const proyecto = await prisma.proyecto.create({ data: { clienteId: cliente.id, nichoId: nicho.id, nombre: `Tienda en línea ${marca}`, pagoUnico: "2500.00", mensualidad: "100.00", fechaInicio: dia(-30), estado: "activo" } });
  await prisma.cobro.create({ data: { proyectoId: proyecto.id, concepto: "mensualidad", detalle: "Mensualidad de prueba", monto: "100.00", vence: hoy, mes: hoy.slice(0, 7) } });
  await prisma.pendiente.create({ data: { proyectoId: proyecto.id, texto: `Entregar módulo ${marca}`, fechaEstimada: dia(3), visibleCliente: true } });
  if (!process.env.SIN_SOLICITUDES) {
    const s = await prisma.solicitudWeb.create({ data: { nombre: `Luis ${marca}`, whatsapp: "04141234567", tipo: "embudo", mensaje: "Hola Neri, usé /empezar.", respuestas: JSON.stringify({ rubro: "comercio", actual: "web", objetivo: "cobros", tamano: "1", sistema: "cobros" }), calificacion: "demo", origen: "tiktok" } });
    creado.solicitudes.push(s.id);
  }

  // ---------- escritorio: 1280 y 1024 ----------
  for (const ancho of [1280, 1024]) {
    const { ctx, pg } = await pagina(b, ancho, 800, false);
    if (ancho === 1280) {
      await pg.goto(`${BASE}/entrar`); await pg.waitForLoadState("networkidle");
      const m = await pg.locator("main").first().boundingBox();
      revisar(!!m && Math.abs((m.x + m.width / 2) - 640) < 8 && m.width <= 700, `1280: /entrar centrado sin barra lateral (x=${Math.round(m?.x ?? -1)}, ancho=${Math.round(m?.width ?? -1)})`);
      revisar(!(await visible(pg, "nav.lateral")), "1280: /entrar sin barra lateral");
    }
    await entrar(pg, PIN_DUENO);
    if (ancho === 1280) {
      await pg.goto(`${BASE}/prospectos/nuevo`); await pg.waitForLoadState("networkidle");
      const mb = await pg.locator("h1.titulo").first().evaluate((e) => getComputedStyle(e).marginBottom);
      revisar(mb === "12px", `1280: h1.titulo de una pagina vieja conserva su margen (${mb})`);
    }
    await pg.goto(`${BASE}/prospectos`); await pg.waitForLoadState("networkidle");
    revisar(await visible(pg, "nav.lateral"), `${ancho}: barra lateral visible`);
    revisar((await pg.locator("nav.lateral .lateral__item").count()) === 7, `${ancho}: lateral con 7 secciones (${await pg.locator("nav.lateral .lateral__item").count()})`);
    revisar(!(await visible(pg, "nav.barra")), `${ancho}: barra inferior oculta`);
    revisar(await visible(pg, ".cabecera-pagina h1"), `${ancho}: cabecera de pagina`);
    revisar(await visible(pg, "nav.lateral a[aria-current=page]"), `${ancho}: seccion activa marcada`);
    if (ancho === 1280 && !process.env.SIN_INICIO) {
      await pg.goto(`${BASE}/inicio`); await pg.waitForLoadState("networkidle");
      await pg.screenshot({ path: `${SALIDA}/inicio-1280.png`, fullPage: true });
      for (const ruta of ["prospectos", "solicitudes", "proyectos"]) {
        await pg.goto(`${BASE}/${ruta}`); await pg.waitForLoadState("networkidle");
        await pg.screenshot({ path: `${SALIDA}/${ruta}-1280.png`, fullPage: false });
      }
      await pg.goto(`${BASE}/ajustes?abrir=nicho-${nicho.id}`); await pg.waitForLoadState("networkidle");
      await pg.screenshot({ path: `${SALIDA}/ajustes-1280.png`, fullPage: false });
    }
    await ctx.close();
  }
  // ---------- 1023: ya es telefono ----------
  {
    const { ctx, pg } = await pagina(b, 1023, 800, false);
    await entrar(pg, PIN_DUENO);
    await pg.goto(`${BASE}/prospectos`); await pg.waitForLoadState("networkidle");
    revisar(!(await visible(pg, "nav.lateral")), "1023: barra lateral oculta");
    revisar(await visible(pg, "nav.barra"), "1023: barra inferior visible");
    revisar((await pg.locator("nav.barra a").count()) === 4, `1023: barra con 4 enlaces (${await pg.locator("nav.barra a").count()})`);
    revisar((await pg.locator("nav.barra button", { hasText: "Más" }).count()) === 1, "1023: boton Mas");
    await ctx.close();
  }
  // ---------- 390: hoja Mas, rol prospectador, inicio ----------
  {
    const { ctx, pg } = await pagina(b, 390, 844, true);
    await entrar(pg, PIN_DUENO);
    await pg.goto(`${BASE}/prospectos`); await pg.waitForLoadState("networkidle");
    const mas = pg.locator("nav.barra button", { hasText: "Más" });
    await mas.click();
    const hoja = pg.locator("[role=dialog]");
    revisar(await hoja.isVisible(), "390: Mas abre la hoja");
    revisar((await hoja.locator("a").count()) === 3, `390: hoja con 3 enlaces (${await hoja.locator("a").count()})`);
    revisar((await hoja.locator("a").allInnerTexts()).join("|") === "Buscar|Web|Ajustes", "390: hoja con Buscar, Web y Ajustes");
    await pg.keyboard.press("Escape");
    revisar((await pg.locator("[role=dialog]").count()) === 0, "390: Escape cierra la hoja");
    revisar(await pg.evaluate(() => document.activeElement?.textContent?.includes("Más") ?? false), "390: el foco vuelve a Mas");
    await mas.click(); await hoja.locator("a", { hasText: "Web" }).click();
    await pg.waitForURL(/\/web$/); await pg.waitForLoadState("networkidle");
    revisar((await pg.locator("[role=dialog]").count()) === 0, "390: al navegar la hoja se cierra");
    if (!process.env.SIN_INICIO) {
      await pg.goto(`${BASE}/inicio`); await pg.waitForLoadState("networkidle");
      revisar((await pg.locator(".cifras-inicio a").count()) === 4, `390: inicio con 4 cifras-enlace (${await pg.locator(".cifras-inicio a").count()})`);
      const filas = pg.locator(".hoy-lista .hoy-item");
      revisar((await filas.count()) >= 2, `390: lista Hoy con al menos 2 filas (${await filas.count()})`);
      const tipos = await filas.evaluateAll((xs) => xs.map((x) => x.getAttribute("data-tipo")));
      revisar(tipos[0] === "seguimiento" && tipos.includes("cobro"), `390: Hoy ordenada por fecha (vencido primero): ${tipos.join(",")}`);
      revisar((await filas.first().locator("a[href*='wa.me']").count()) === 1, "390: el seguimiento trae boton de WhatsApp");
      revisar((await pg.locator("details#cola:not([open])").count()) === 1, "390: el dueno tiene la cola de prospeccion plegada al final de Inicio");
      revisar((await pg.locator("details#cola .tarjeta").count()) === 0 || !(await pg.locator("details#cola .tarjeta").first().isVisible()), "390: la cola plegada no muestra tarjetas");
      await pg.locator("details#cola > summary").click();
      revisar((await pg.locator("details#cola").getByText(`Hotel Cola ${marca}`).count()) === 1, "390: al abrir la cola aparece el prospecto por contactar");
      await pg.screenshot({ path: `${SALIDA}/inicio-390.png`, fullPage: true });
    }
    if (!process.env.SIN_SOLICITUDES) {
      await pg.goto(`${BASE}/solicitudes`); await pg.waitForLoadState("networkidle");
      revisar((await pg.locator(`text=Luis ${marca}`).count()) === 1, "390: /solicitudes lista la solicitud sembrada");
      revisar((await pg.locator("text=Califica para demostración").count()) >= 1, "390: la solicitud del embudo muestra su calificacion");
      await pg.goto(`${BASE}/web`); await pg.waitForLoadState("networkidle");
      revisar((await pg.locator("#solicitudes").count()) === 0 && !(await pg.locator(`text=Luis ${marca}`).count()), "390: /web ya no lista solicitudes");
      revisar((await pg.locator(".cabecera-pagina a[href='/solicitudes']").count()) === 1, "390: /web enlaza a Solicitudes desde la cabecera");
    }
    if (!process.env.SIN_AJUSTES) {
      await pg.goto(`${BASE}/ajustes`); await pg.waitForLoadState("networkidle");
      revisar(await visible(pg, ".indice-ajustes"), "390: Ajustes con indice");
      revisar((await pg.locator("details.acordeon[open]").count()) === 0, "390: Ajustes con todos los acordeones cerrados");
      revisar((await pg.locator("textarea:visible").count()) === 0, "390: ningun textarea visible al abrir Ajustes");
      await pg.locator("details.acordeon#nichos > summary").click();
      revisar((await pg.locator("details.acordeon#nichos details").count()) >= 1, "390: Mensajes por nicho lista los nichos");
      revisar((await pg.locator("textarea:visible").count()) === 0, "390: abrir la seccion no abre ningun nicho");
      await pg.locator("details.acordeon#nichos details > summary").first().click();
      revisar((await pg.locator("textarea:visible").count()) === 2, `390: un nicho abierto muestra sus dos textarea (${await pg.locator("textarea:visible").count()})`);
      await pg.goto(`${BASE}/ajustes?abrir=nicho-${nicho.id}`); await pg.waitForLoadState("networkidle");
      revisar((await pg.locator(`details#nicho-${nicho.id}[open]`).count()) === 1 && (await pg.locator("details.acordeon#nichos[open]").count()) === 1, "390: ?abrir= deja ese nicho (y su seccion) abiertos");
      revisar((await pg.locator("textarea:visible").count()) === 2, "390: solo ese nicho visible");
      await pg.screenshot({ path: `${SALIDA}/ajustes-390.png`, fullPage: true });
      for (const ruta of ["prospectos", "solicitudes", "proyectos"]) {
        await pg.goto(`${BASE}/${ruta}`); await pg.waitForLoadState("networkidle");
        await pg.screenshot({ path: `${SALIDA}/${ruta}-390.png`, fullPage: false });
      }
    }
    if (!process.env.SIN_RUTAS) {
      const r1 = await pg.goto(`${BASE}/hoy`); await pg.waitForLoadState("networkidle");
      revisar(pg.url().endsWith("/inicio"), `rutas: /hoy lleva a /inicio (${pg.url()})`);
      revisar(!!r1, "rutas: /hoy responde");
      await pg.goto(`${BASE}/`); await pg.waitForLoadState("networkidle");
      revisar(pg.url().endsWith("/inicio"), `rutas: / lleva a /inicio (${pg.url()})`);
      const man = await (await pg.request.get(`${BASE}/manifest.webmanifest`)).json();
      revisar(man.start_url === "/inicio", `rutas: start_url del manifiesto es /inicio (${man.start_url})`);
    }
    await ctx.close();
  }
  // ---------- prospectador ----------
  {
    const { ctx, pg } = await pagina(b, 390, 844, true);
    await entrar(pg, PIN_PROSPECTADOR);
    await pg.goto(`${BASE}/prospectos`); await pg.waitForLoadState("networkidle");
    revisar((await pg.locator("nav.barra a").count()) === 4 && (await pg.locator("nav.barra button").count()) === 0, "prospectador: barra de 4 sin Mas");
    const hrefs = await pg.locator("nav.barra a").evaluateAll((xs) => xs.map((x) => x.getAttribute("href")));
    revisar(!hrefs.some((h) => ["/solicitudes", "/proyectos", "/web", "/ajustes"].includes(h ?? "")), `prospectador: sin secciones del dueno (${hrefs.join(",")})`);
    if (!process.env.SIN_INICIO) {
      await pg.goto(`${BASE}/inicio`); await pg.waitForLoadState("networkidle");
      revisar((await pg.locator("text=Por contactar").count()) >= 1, "prospectador: /inicio muestra su cola");
      await pg.screenshot({ path: `${SALIDA}/inicio-prospectador-390.png`, fullPage: true });
    }
    await ctx.close();
    const { ctx: ctx2, pg: pg2 } = await pagina(b, 1280, 800, false);
    await entrar(pg2, PIN_PROSPECTADOR);
    await pg2.goto(`${BASE}/prospectos`); await pg2.waitForLoadState("networkidle");
    revisar((await pg2.locator("nav.lateral .lateral__item").count()) === 4, `prospectador 1280: lateral de 4 (${await pg2.locator("nav.lateral .lateral__item").count()})`);
    await ctx2.close();
  }
} catch (e) {
  errores.push(`excepcion: ${(e as Error).message}`);
} finally {
  await b.close();
  // ---------- limpieza ----------
  await prisma.cobro.deleteMany({ where: { proyecto: { nombre: { contains: marca } } } });
  await prisma.pendiente.deleteMany({ where: { proyecto: { nombre: { contains: marca } } } });
  await prisma.evento.deleteMany({ where: { OR: [{ prospectoId: { in: creado.prospectos } }, { usuarioId: { in: creado.usuarios } }, { proyecto: { nombre: { contains: marca } } }] } });
  await prisma.proyecto.deleteMany({ where: { nombre: { contains: marca } } });
  await prisma.cliente.deleteMany({ where: { id: { in: creado.clientes } } });
  await prisma.prospecto.deleteMany({ where: { id: { in: creado.prospectos } } });
  await prisma.solicitudWeb.deleteMany({ where: { id: { in: creado.solicitudes } } });
  await prisma.usuario.deleteMany({ where: { id: { in: creado.usuarios } } });
  if (creado.nichoPropio) await prisma.nicho.delete({ where: { id: creado.nichoId } }).catch(() => {});
  await prisma.$disconnect();
}
for (const p of pasos) console.log("ok  ", p);
for (const e of errores) console.log("FALLA", e);
console.log(`\n${pasos.length} bien, ${errores.length} mal`);
process.exit(errores.length ? 1 : 0);
