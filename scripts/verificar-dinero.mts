// scripts/verificar-dinero.mts — recorrido real de la fase 3 del panel CRM: /cobros (cifras, filtros, marcar pagado
// desde la tabla), la tabla de /proyectos, la ficha de proyecto a dos columnas con los formularios detras de un
// boton, y las barras de /web. Siembra con la marca (PRUEBA), entra con un dueno y un prospectador temporales y
// al terminar borra lo suyo. SOLO contra el servidor de desarrollo del clon con la base de tests.
// Uso (desde el repo, con el clon en 3021):
//   DATABASE_URL="$TEST_DATABASE_URL" BASE_URL=http://127.0.0.1:3021 npx tsx scripts/verificar-dinero.mts [capturas/dinero]
import { mkdirSync } from "node:fs";
import bcrypt from "bcryptjs";
import { chromium, type Browser, type Page } from "playwright";
import { prisma } from "../src/lib/db";
import { generarCodigo } from "../src/lib/codigo";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3021";
const SALIDA = process.argv[2] ?? "capturas/dinero";
if (!(process.env.DATABASE_URL ?? "").includes("prospectos_test")) { console.error("ALTO: DATABASE_URL no es la base de tests."); process.exit(2); }
if (/neracosu\.com|:3013(\/|$)/.test(BASE)) { console.error("ALTO: BASE_URL apunta a produccion."); process.exit(2); }
mkdirSync(SALIDA, { recursive: true });

const sello = Date.now();
const marca = `(PRUEBA) ${sello}`;
const PIN_DUENO = "736182";
const PIN_PROSPECTADOR = "291736";
const hoy = new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10);
const dia = (n: number) => { const d = new Date(`${hoy}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const errores: string[] = []; const pasos: string[] = [];
const revisar = (ok: boolean, que: string) => { (ok ? pasos : errores).push(que); };
const creado = { usuarios: [] as number[], clientes: [] as number[], proyectos: [] as number[], nichos: [] as number[] };

async function entrar(pg: Page, pin: string) {
  await pg.goto(`${BASE}/entrar`);
  for (const d of pin) await pg.getByRole("button", { name: d, exact: true }).click();
  await pg.waitForURL((u) => /\/inicio$/.test(u.pathname)); await pg.waitForLoadState("networkidle");
}
async function pagina(b: Browser, ancho: number, alto: number, movil: boolean) {
  const ctx = await b.newContext({ viewport: { width: ancho, height: alto }, isMobile: movil, hasTouch: movil, locale: "es-VE" });
  return { ctx, pg: await ctx.newPage() };
}
const visible = async (pg: Page, sel: string) => (await pg.locator(sel).count()) > 0 && await pg.locator(sel).first().isVisible();

const b = await chromium.launch();
try {
  // ---------- siembra ----------
  let nicho = await prisma.nicho.findFirst({ where: { slug: "comercio" } });
  if (!nicho) { nicho = await prisma.nicho.create({ data: { slug: "comercio", nombre: "Comercio", mensajeInicial: "Hola {nombre}", mensajeSeguimiento: "Hola de nuevo {nombre}" } }); creado.nichos.push(nicho.id); }
  const cliente = await prisma.cliente.create({ data: { nombre: `Tienda ${marca}`, contactoNombre: "Ana", whatsapp: "584120001122", codigo: generarCodigo() } });
  creado.clientes.push(cliente.id);
  const activo = await prisma.proyecto.create({ data: { clienteId: cliente.id, nichoId: nicho.id, nombre: `Tienda en línea ${marca}`, estado: "activo", pagoUnico: "1500.00", mensualidad: "100.00", fechaInicio: dia(-40), diaCobroMensual: 5 } });
  const cerrado = await prisma.proyecto.create({ data: { clienteId: cliente.id, nichoId: nicho.id, nombre: `Viejo ${marca}`, estado: "cerrado", pagoUnico: "500.00", mensualidad: "0.00", fechaInicio: dia(-400) } });
  creado.proyectos.push(activo.id, cerrado.id);
  const vencido = await prisma.cobro.create({ data: { proyectoId: activo.id, concepto: "cuota", detalle: "Cuota 1 de 2", monto: "750.00", vence: dia(-5) } });
  await prisma.cobro.create({ data: { proyectoId: activo.id, concepto: "cuota", detalle: "Cuota 2 de 2", monto: "750.00", vence: dia(20) } });
  await prisma.cobro.create({ data: { proyectoId: cerrado.id, concepto: "pago_unico", detalle: "Pago único", monto: "500.00", vence: dia(-300), pagadoEn: new Date(), canal: "zelle" } });
  await prisma.pendiente.create({ data: { proyectoId: activo.id, texto: `Hito ${marca}`, visibleCliente: true, orden: 1 } });
  const dueno = await prisma.usuario.create({ data: { nombre: `Dueño ${marca}`, rol: "dueno", pinHash: await bcrypt.hash(PIN_DUENO, 10), metaDiaria: 10 } });
  const prospectador = await prisma.usuario.create({ data: { nombre: `Prospectador ${marca}`, rol: "prospectador", pinHash: await bcrypt.hash(PIN_PROSPECTADOR, 10), metaDiaria: 5 } });
  creado.usuarios.push(dueno.id, prospectador.id);

  // ---------- escritorio ----------
  {
    const { ctx, pg } = await pagina(b, 1280, 800, false);
    await entrar(pg, PIN_DUENO);
    await pg.goto(`${BASE}/cobros`); await pg.waitForLoadState("networkidle");
    revisar((await pg.locator(".cifras-inicio--tres .cifra").count()) === 3, "1280: /cobros muestra tres cifras");
    revisar(await visible(pg, `tr.cobro-fila[data-id="${vencido.id}"]`), "1280: la tabla trae el cobro vencido sembrado");
    revisar((await pg.locator(`tr.cobro-fila[data-id="${vencido.id}"]`).innerText()).includes(`Tienda en línea ${marca}`), "1280: la fila dice de que proyecto es");
    revisar(await visible(pg, "nav.lateral a[href='/cobros'][aria-current=page]"), "1280: la lateral marca Cobros");
    await pg.screenshot({ path: `${SALIDA}/cobros-1280.png` });
    await pg.goto(`${BASE}/cobros?f=pagados`); await pg.waitForLoadState("networkidle");
    revisar((await pg.locator("tr.cobro-fila").count()) >= 1 && !(await pg.locator(`tr.cobro-fila[data-id="${vencido.id}"]`).count()) && (await pg.locator("tbody").innerText()).includes(`Viejo ${marca}`), "1280: ?f=pagados trae el pagado y no el vencido");
    await pg.goto(`${BASE}/cobros?f=vencidos`); await pg.waitForLoadState("networkidle");
    const fila = pg.locator(`tr.cobro-fila[data-id="${vencido.id}"]`);
    await fila.locator("button", { hasText: "Marcar pagado" }).click();
    await pg.locator(`tr.tabla__detalle select[name="canal"]`).selectOption("pago_movil");
    await pg.locator(`tr.tabla__detalle input[name="referencia"]`).fill("123456");
    await pg.locator(`tr.tabla__detalle button`, { hasText: "Confirmar" }).click();
    await pg.waitForTimeout(1500);
    const enBase = await prisma.cobro.findUniqueOrThrow({ where: { id: vencido.id } });
    revisar(enBase.pagadoEn !== null && enBase.canal === "pago_movil", "1280: «Marcar pagado» desde /cobros queda en la base");
    await pg.goto(`${BASE}/proyectos/${activo.id}?t=cobros`); await pg.waitForLoadState("networkidle");
    revisar((await pg.locator(".cobro--pagado").count()) >= 1 && (await pg.locator(".cobro--pagado").first().innerText()).includes("Cuota 1 de 2"), "1280: el proyecto ya muestra la cuota pagada sin recargar a mano");
    revisar(await visible(pg, ".ficha .ficha__historial") && (await pg.locator(".ficha__historial").innerText()).includes("Resumen") && (await pg.locator(".ficha__historial").innerText()).includes(`Tienda ${marca}`), "1280: la ficha tiene el resumen con el cliente a la derecha");
    revisar(!(await pg.locator("details.historial-plegado").first().isVisible()), "1280: el plegado del telefono no se ve en escritorio");
    await pg.screenshot({ path: `${SALIDA}/proyecto-1280.png` });
    await pg.goto(`${BASE}/proyectos/${activo.id}?t=pendientes`); await pg.waitForLoadState("networkidle");
    revisar(!(await pg.locator(".ficha__principal form").count()), "pendientes: sin formulario hasta tocar «Nuevo pendiente»");
    await pg.locator("button", { hasText: "Nuevo pendiente" }).click();
    revisar(await visible(pg, '.ficha__principal form input[name="texto"]'), "pendientes: el boton abre el formulario");
    await pg.goto(`${BASE}/proyectos/${activo.id}?t=horas`); await pg.waitForLoadState("networkidle");
    revisar(!(await pg.locator(".ficha__principal form").count()), "horas: sin formulario hasta tocar «Registrar horas»");
    await pg.locator("button", { hasText: "Registrar horas" }).click();
    revisar(await visible(pg, '.ficha__principal form input[name="horas"]'), "horas: el boton abre el formulario");
    await pg.fill('.ficha__principal form input[name="horas"]', "abc");
    await pg.fill('.ficha__principal form input[name="descripcion"]', "probando el error");
    await pg.locator('.ficha__principal form button[type=submit], .ficha__principal form button:not([type])').last().click();
    await pg.waitForSelector(".ficha__principal .error", { timeout: 10000 });
    revisar((await pg.inputValue('.ficha__principal form input[name="horas"]')) === "abc" && (await pg.inputValue('.ficha__principal form input[name="descripcion"]')) === "probando el error", "horas: tras un error del servidor el formulario conserva lo escrito");
    await pg.goto(`${BASE}/cobros?f=mes`); await pg.waitForLoadState("networkidle");
    const cifraMes = (await pg.locator(".cifras-inicio--tres .cifra").first().innerText()).replace(/\s+/g, " ");
    const montos = await pg.locator("tr.cobro-fila td[data-label=Monto]").allInnerTexts();
    const suma = montos.reduce((s, m) => s + Number(m.replace(/[^0-9,]/g, "").replace(",", ".")), 0);
    revisar(cifraMes.includes(suma.toLocaleString("es-VE", { minimumFractionDigits: 2 }).replace(/\u00a0/g, "")) || cifraMes.includes(`$${suma.toFixed(2).replace(".", ",")}`), `cobros: la cifra «por cobrar este mes» cuadra con la lista ?f=mes (${cifraMes} vs ${suma})`);
    await pg.goto(`${BASE}/proyectos`); await pg.waitForLoadState("networkidle");
    revisar(await visible(pg, "table.tabla--proyectos") && (await pg.locator(`tr[data-id="${activo.id}"]`).count()) === 1, "1280: /proyectos es una tabla con la fila del proyecto");
    revisar((await pg.locator(`tr[data-id="${activo.id}"] td[data-label="Próximo cobro"]`).innerText()).includes("/"), "1280: la fila trae la fecha del proximo cobro");
    revisar((await pg.locator(`tr[data-id="${cerrado.id}"] td[data-label="Próximo cobro"]`).innerText()).trim() === "—", "1280: sin cobros pendientes muestra «—»");
    await pg.screenshot({ path: `${SALIDA}/proyectos-1280.png` });
    await pg.locator(".pestanas a", { hasText: "Activo" }).first().click(); await pg.waitForURL(/estado=activo/); await pg.waitForLoadState("networkidle");
    revisar((await pg.locator(`tr[data-id="${activo.id}"]`).count()) === 1 && !(await pg.locator(`tr[data-id="${cerrado.id}"]`).count()), "1280: el chip ?estado=activo filtra");
    await pg.goto(`${BASE}/web`); await pg.waitForLoadState("networkidle");
    revisar(!(await pg.locator(".web-dias li").count()), "web: ya no hay lista de dias");
    revisar((await pg.locator(".web-dias-barras").count()) === 1 || (await pg.locator("text=Sin datos todavía").count()) >= 1, "web: personas por dia va en barras (o sin datos)");
    await pg.screenshot({ path: `${SALIDA}/web-1280.png`, fullPage: true });
    await ctx.close();
  }
  // ---------- telefono ----------
  {
    const { ctx, pg } = await pagina(b, 390, 844, true);
    await entrar(pg, PIN_DUENO);
    revisar((await pg.locator("nav.barra a").allInnerTexts()).join("|").includes("Cobros"), "390: la barra inferior lleva Cobros");
    await pg.goto(`${BASE}/cobros`); await pg.waitForLoadState("networkidle");
    const apilado = await pg.evaluate(() => { const td = document.querySelector("tr.cobro-fila td[data-label]"); return td ? getComputedStyle(td, "::before").content : "sin-td"; });
    revisar(apilado !== "none" && apilado !== "sin-td", `390: las filas se apilan con su etiqueta (${apilado})`);
    const ancho = await pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    revisar(ancho, "390: /cobros no se desplaza a lo ancho");
    await pg.screenshot({ path: `${SALIDA}/cobros-390.png`, fullPage: true });
    await pg.goto(`${BASE}/proyectos/${activo.id}`); await pg.waitForLoadState("networkidle");
    revisar((await pg.locator("details.historial-plegado:not([open])").count()) === 1 && !(await pg.locator(".ficha__historial").isVisible()), "390: resumen e historial plegados y sin columna derecha");
    await pg.screenshot({ path: `${SALIDA}/proyecto-390.png`, fullPage: true });
    await ctx.close();
  }
  // ---------- prospectador ----------
  {
    const { ctx, pg } = await pagina(b, 390, 844, true);
    await entrar(pg, PIN_PROSPECTADOR);
    await pg.goto(`${BASE}/cobros`); await pg.waitForLoadState("networkidle");
    revisar(/\/inicio$/.test(new URL(pg.url()).pathname), `prospectador: /cobros lo manda a /inicio (${pg.url()})`);
    revisar(!(await pg.locator("nav.barra a").allInnerTexts()).join("|").includes("Cobros"), "prospectador: su barra no lleva Cobros");
    await ctx.close();
  }
} catch (e) {
  errores.push(`excepcion: ${(e as Error).message}`);
} finally {
  await b.close();
  await prisma.evento.deleteMany({ where: { OR: [{ proyectoId: { in: creado.proyectos } }, { usuarioId: { in: creado.usuarios } }] } });
  await prisma.horas.deleteMany({ where: { proyectoId: { in: creado.proyectos } } }).catch(() => {});
  await prisma.pendiente.deleteMany({ where: { proyectoId: { in: creado.proyectos } } });
  await prisma.cobro.deleteMany({ where: { proyectoId: { in: creado.proyectos } } });
  await prisma.proyecto.deleteMany({ where: { id: { in: creado.proyectos } } });
  await prisma.cliente.deleteMany({ where: { id: { in: creado.clientes } } });
  await prisma.usuario.deleteMany({ where: { id: { in: creado.usuarios } } });
  for (const id of creado.nichos) await prisma.nicho.delete({ where: { id } }).catch(() => {});
  await prisma.$disconnect();
}
for (const p of pasos) console.log("ok  ", p);
for (const e of errores) console.log("FALLA", e);
console.log(`\n${pasos.length} bien, ${errores.length} mal`);
process.exit(errores.length ? 1 : 0);
