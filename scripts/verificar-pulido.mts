// scripts/verificar-pulido.mts — recorrido real de la fase 4 del panel CRM: busqueda global (Ctrl+K, boton de la
// lateral, «Buscar» en la hoja Mas; por rol) y arrastre de tarjetas en el tablero de leads. Siembra con la marca
// (PRUEBA), entra con un dueno y un prospectador temporales y al terminar borra lo suyo.
// SOLO contra el servidor de desarrollo del clon con la base de tests.
// Uso: DATABASE_URL="$TEST_DATABASE_URL" BASE_URL=http://127.0.0.1:3021 npx tsx scripts/verificar-pulido.mts [capturas/pulido]
import { mkdirSync } from "node:fs";
import bcrypt from "bcryptjs";
import { chromium, type Browser, type Page } from "playwright";
import { prisma } from "../src/lib/db";
import { generarCodigo } from "../src/lib/codigo";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3021";
const SALIDA = process.argv[2] ?? "capturas/pulido";
if (!(process.env.DATABASE_URL ?? "").includes("prospectos_test")) { console.error("ALTO: DATABASE_URL no es la base de tests."); process.exit(2); }
if (/neracosu\.com|:3013(\/|$)/.test(BASE)) { console.error("ALTO: BASE_URL apunta a produccion."); process.exit(2); }
mkdirSync(SALIDA, { recursive: true });

const sello = Date.now();
const marca = `(PRUEBA) ${sello}`;
const PIN_DUENO = "640917";
const PIN_PROSPECTADOR = "173046";
const codigoDe = (s: string) => (s + "x".repeat(22)).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 22);
const errores: string[] = []; const pasos: string[] = [];
const revisar = (ok: boolean, que: string) => { (ok ? pasos : errores).push(que); };
const creado = { prospectos: [] as number[], usuarios: [] as number[], clientes: [] as number[], proyectos: [] as number[], nichos: [] as number[] };

async function entrar(pg: Page, pin: string) {
  await pg.goto(`${BASE}/entrar`);
  for (const d of pin) await pg.getByRole("button", { name: d, exact: true }).click();
  await pg.waitForURL((u) => /\/inicio$/.test(u.pathname)); await pg.waitForLoadState("networkidle");
}
async function pagina(b: Browser, ancho: number, alto: number, movil: boolean) {
  const ctx = await b.newContext({ viewport: { width: ancho, height: alto }, isMobile: movil, hasTouch: movil, locale: "es-VE" });
  return { ctx, pg: await ctx.newPage() };
}
const DIALOGO = '[role="dialog"][aria-label="Buscar en el panel"]';
const titulos = async (pg: Page) => (await pg.locator(`${DIALOGO} .busqueda__item`).allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());

const b = await chromium.launch();
try {
  // ---------- siembra ----------
  let nicho = await prisma.nicho.findFirst({ where: { slug: "comercio" } });
  if (!nicho) { nicho = await prisma.nicho.create({ data: { slug: "comercio", nombre: "Comercio", mensajeInicial: "Hola {nombre}", mensajeSeguimiento: "Hola de nuevo {nombre}" } }); creado.nichos.push(nicho.id); }
  const lead = (nombre: string, extra: Record<string, unknown>) => prisma.prospecto.create({ data: {
    nichoId: nicho!.id, nombre: `${sello} ${nombre} (PRUEBA)`, ciudad: "", fuentes: [], codigo: codigoDe(`p${sello}${nombre}`),
    clave: `${nombre}||${sello}${Math.random()}`.toLowerCase().replace(/[^a-z0-9|]/g, ""), origen: "manual", esLead: true, ...extra } });
  const alma = await lead("Alma boutique", { fuenteLead: "web", etapa: "por_contactar", whatsapp: "584120000001" });
  const cola = await lead("Hotel Cola", { fuenteLead: "directorio", etapa: "enviado", whatsapp: "584120000002" });
  const directorio = await prisma.prospecto.create({ data: { nichoId: nicho.id, nombre: `${sello} Tienda Directorio (PRUEBA)`, ciudad: "Caracas", fuentes: [], codigo: codigoDe(`d${sello}`), clave: `tiendadirectorio|caracas|${sello}`, origen: "importado", esLead: false, etapa: "por_contactar", whatsapp: "584120001111", ordenCola: 1 } });
  creado.prospectos.push(alma.id, cola.id, directorio.id);
  const cliente = await prisma.cliente.create({ data: { nombre: `${sello} Alma C.A. (PRUEBA)`, contactoNombre: "Ana", whatsapp: "584120001122", codigo: generarCodigo() } });
  creado.clientes.push(cliente.id);
  const proyecto = await prisma.proyecto.create({ data: { clienteId: cliente.id, nichoId: nicho.id, nombre: `${sello} Alma tienda (PRUEBA)`, estado: "activo", pagoUnico: "1000.00", mensualidad: "50.00", fechaInicio: "2026-10-01" } });
  creado.proyectos.push(proyecto.id);
  const dueno = await prisma.usuario.create({ data: { nombre: `Dueño ${marca}`, rol: "dueno", pinHash: await bcrypt.hash(PIN_DUENO, 10), metaDiaria: 10 } });
  const prospectador = await prisma.usuario.create({ data: { nombre: `Prospectador ${marca}`, rol: "prospectador", pinHash: await bcrypt.hash(PIN_PROSPECTADOR, 10), metaDiaria: 5 } });
  creado.usuarios.push(dueno.id, prospectador.id);

  // ---------- escritorio, dueno ----------
  {
    const { ctx, pg } = await pagina(b, 1280, 800, false);
    await entrar(pg, PIN_DUENO);
    await pg.goto(`${BASE}/leads/nuevo`); await pg.waitForLoadState("networkidle");
    await pg.fill('input[name="nombre"]', "x");
    await pg.keyboard.press("Control+k");
    revisar(await pg.locator(DIALOGO).isVisible(), "1280: Ctrl+K abre el dialogo de busqueda");
    await pg.keyboard.type(`${sello} alma`);
    await pg.waitForFunction((sel) => document.querySelectorAll(`${sel} .busqueda__item`).length >= 3, DIALOGO, { timeout: 10000 });
    const t = await titulos(pg);
    revisar(t.length === 3 && t[0].startsWith("Lead") && t[1].startsWith("Proyecto") && t[2].startsWith("Cliente"), `1280: «alma» trae lead, proyecto y cliente en ese orden (${t.join(" | ")})`);
    await pg.screenshot({ path: `${SALIDA}/busqueda-1280.png` });
    await pg.keyboard.press("ArrowDown");
    await pg.keyboard.press("Enter");
    await pg.waitForURL(new RegExp(`/proyectos/${proyecto.id}$`), { timeout: 10000 });
    revisar(true, "1280: flecha abajo + Enter abre el segundo resultado (el proyecto)");
    await pg.goto(`${BASE}/leads/nuevo`); await pg.waitForLoadState("networkidle");
    await pg.fill('input[name="nombre"]', "x");
    await pg.locator(".lateral__buscar").click();
    revisar(await pg.locator(DIALOGO).isVisible(), "1280: el boton de la lateral abre el dialogo");
    await pg.keyboard.type("zz");
    await pg.keyboard.press("Escape");
    await pg.waitForTimeout(200);
    revisar(!(await pg.locator(DIALOGO).count()), "1280: Escape cierra el dialogo");
    revisar(await pg.evaluate(() => document.activeElement?.classList.contains("lateral__buscar") ?? false), "1280: al cerrar, el foco vuelve al boton que lo abrio");
    await pg.focus('input[name="nombre"]');
    await pg.keyboard.press("Control+k");
    await pg.keyboard.type("zz");
    await pg.keyboard.press("Escape");
    await pg.waitForTimeout(200);
    const foco = await pg.evaluate(() => ({ name: (document.activeElement as HTMLInputElement)?.name, value: (document.activeElement as HTMLInputElement)?.value }));
    revisar(foco.name === "nombre" && foco.value === "x", `1280: abierto con Ctrl+K desde un campo, el foco vuelve a ese campo y conserva lo escrito (${foco.name}=${foco.value})`);
    // arrastre
    await pg.goto(`${BASE}/leads?q=${encodeURIComponent(String(sello))}`); await pg.waitForLoadState("networkidle");
    const tarjeta = pg.locator(`.lead[data-id="${alma.id}"]`);
    revisar((await tarjeta.getAttribute("draggable")) === "true", "1280: la tarjeta es arrastrable");
    await tarjeta.dragTo(pg.locator('.tablero__columna[data-etapa="enviado"] .tablero__lista'));
    await pg.waitForFunction((id) => !!document.querySelector(`.tablero__columna[data-etapa="enviado"] .lead[data-id="${id}"]`), alma.id, { timeout: 10000 }).catch(() => {});
    const enBase = await prisma.prospecto.findUniqueOrThrow({ where: { id: alma.id } });
    revisar(enBase.etapa === "enviado", `1280: arrastrar Nuevo → Propuesta enviada mueve el lead en la base (${enBase.etapa})`);
    revisar((await pg.locator(`.tablero__columna[data-etapa="enviado"] .lead[data-id="${alma.id}"]`).count()) === 1, "1280: la tarjeta aparece en la columna nueva");
    const colaTarjeta = pg.locator(`.lead[data-id="${cola.id}"]`);
    await colaTarjeta.dragTo(pg.locator('.tablero__columna[data-etapa="por_contactar"] .tablero__lista'));
    await pg.waitForTimeout(1500);
    const colaBase = await prisma.prospecto.findUniqueOrThrow({ where: { id: cola.id } });
    revisar(colaBase.etapa === "enviado" && (await pg.locator(`.tablero__columna[data-etapa="enviado"] .lead[data-id="${cola.id}"]`).count()) === 1, "1280: soltar en una columna no permitida (enviado → Nuevo) no mueve nada");
    await pg.screenshot({ path: `${SALIDA}/tablero-1280.png` });
    await ctx.close();
  }
  // ---------- telefono, dueno ----------
  {
    const { ctx, pg } = await pagina(b, 390, 844, true);
    await entrar(pg, PIN_DUENO);
    await pg.locator("nav.barra button", { hasText: "Más" }).click();
    await pg.locator(".hoja button", { hasText: "Buscar" }).click();
    revisar(await pg.locator(DIALOGO).isVisible(), "390: «Más» → «Buscar» abre el dialogo");
    await pg.locator(`${DIALOGO} input`).fill(`${sello} tienda`);
    await pg.waitForFunction((sel) => document.querySelectorAll(`${sel} .busqueda__item`).length >= 1, DIALOGO, { timeout: 10000 });
    const t = await titulos(pg);
    revisar(t.length === 1 && t[0].startsWith("Directorio"), `390: «tienda» trae el directorio (${t.join(" | ")})`);
    await pg.screenshot({ path: `${SALIDA}/busqueda-390.png` });
    await ctx.close();
  }
  // ---------- prospectador ----------
  {
    const { ctx, pg } = await pagina(b, 390, 844, true);
    await entrar(pg, PIN_PROSPECTADOR);
    revisar(!(await pg.locator("nav.barra button", { hasText: "Más" }).count()), "prospectador: su barra no tiene «Más»");
    await pg.keyboard.press("Control+k");
    revisar(await pg.locator(DIALOGO).isVisible(), "prospectador: Ctrl+K abre el dialogo");
    await pg.locator(`${DIALOGO} input`).fill(`${sello} alma`);
    await pg.waitForTimeout(1200);
    revisar((await pg.locator(`${DIALOGO} .busqueda__item`).count()) === 0, "prospectador: «alma» (lead de la web, cliente y proyecto) no trae nada");
    await pg.locator(`${DIALOGO} input`).fill(`${sello} hotel`);
    await pg.waitForFunction((sel) => document.querySelectorAll(`${sel} .busqueda__item`).length >= 1, DIALOGO, { timeout: 10000 });
    const t = await titulos(pg);
    revisar(t.length === 1 && t[0].startsWith("Lead") && t[0].includes("Hotel Cola"), `prospectador: «hotel» trae su lead del directorio (${t.join(" | ")})`);
    await ctx.close();
  }
} catch (e) {
  errores.push(`excepcion: ${(e as Error).message}`);
} finally {
  await b.close();
  await prisma.evento.deleteMany({ where: { OR: [{ prospectoId: { in: creado.prospectos } }, { proyectoId: { in: creado.proyectos } }, { usuarioId: { in: creado.usuarios } }] } });
  await prisma.cobro.deleteMany({ where: { proyectoId: { in: creado.proyectos } } });
  await prisma.proyecto.deleteMany({ where: { id: { in: creado.proyectos } } });
  await prisma.cliente.deleteMany({ where: { id: { in: creado.clientes } } });
  await prisma.prospecto.deleteMany({ where: { id: { in: creado.prospectos } } });
  await prisma.usuario.deleteMany({ where: { id: { in: creado.usuarios } } });
  for (const id of creado.nichos) await prisma.nicho.delete({ where: { id } }).catch(() => {});
  await prisma.$disconnect();
}
for (const p of pasos) console.log("ok  ", p);
for (const e of errores) console.log("FALLA", e);
console.log(`\n${pasos.length} bien, ${errores.length} mal`);
process.exit(errores.length ? 1 : 0);
