// scripts/verificar-correos.mts — recorrido real de la pantalla /correos (propuesta por correo, 29-oct-2026): la cola
// en orden, chips, vista previa con el gancho editado dentro del iframe, envio (simulado) y paso a «enviadas» con su
// hito, pixel y /r/<token> que suman hitos, envio directo desde la tabla, bloqueo, pausa y reanudacion del automatico
// (en /correos y en Ajustes), el telefono a 390 sin desborde y el prospectador fuera. Siembra con la marca (PRUEBA)
// DENTRO del try y al terminar borra lo suyo. SOLO contra el clon con la base de tests y PROSPECTOS_CORREO_SIMULADO=1.
// Uso (con el clon en 3021):
//   DATABASE_URL="$TEST_DATABASE_URL" BASE_URL=http://127.0.0.1:3021 npx tsx scripts/verificar-correos.mts [carpeta-capturas]
// Los PIN de las cuentas temporales salen de PIN_DUENO_PRUEBA / PIN_PROSPECTADOR_PRUEBA (o al azar).
import { mkdirSync } from "node:fs";
import bcrypt from "bcryptjs";
import { chromium, type Browser, type Page } from "playwright";
import { prisma } from "../src/lib/db";
import { generarCodigo } from "../src/lib/codigo";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3021";
const SALIDA = process.argv[2] ?? "capturas/correos";
if (!(process.env.DATABASE_URL ?? "").includes("prospectos_test")) { console.error("ALTO: DATABASE_URL no es la base de tests."); process.exit(2); }
if (/neracosu\.com|:3013(\/|$)/.test(BASE)) { console.error("ALTO: BASE_URL apunta a produccion."); process.exit(2); }
mkdirSync(SALIDA, { recursive: true });

const sello = Date.now();
const marca = `(PRUEBA) ${sello}`;
const pinAlAzar = () => String(100000 + Math.floor(Math.random() * 900000));
const PIN_DUENO = process.env.PIN_DUENO_PRUEBA ?? pinAlAzar();
let PIN_PROSPECTADOR = process.env.PIN_PROSPECTADOR_PRUEBA ?? pinAlAzar();
while (PIN_PROSPECTADOR === PIN_DUENO) PIN_PROSPECTADOR = pinAlAzar();
const errores: string[] = []; const pasos: string[] = [];
const revisar = (ok: boolean, que: string) => { (ok ? pasos : errores).push(que); };
const creado = { usuarios: [] as number[], prospectos: [] as number[], nichos: [] as number[], emails: [] as string[] };
const CLAVES_CONFIG = ["correos_por_dia", "correos_automatico"];
let configAntes: { clave: string; valor: string }[] = [];

async function entrar(pg: Page, pin: string) {
  await pg.goto(`${BASE}/entrar`);
  for (const d of pin) await pg.getByRole("button", { name: d, exact: true }).click();
  await pg.waitForURL((u) => /\/inicio$/.test(u.pathname)); await pg.waitForLoadState("networkidle");
}
async function pagina(b: Browser, ancho: number, alto: number, movil: boolean) {
  const ctx = await b.newContext({ viewport: { width: ancho, height: alto }, isMobile: movil, hasTouch: movil, locale: "es-VE" });
  return { ctx, pg: await ctx.newPage() };
}
const ir = async (pg: Page, ruta: string) => { await pg.goto(`${BASE}${ruta}`); await pg.waitForLoadState("networkidle"); };
const idsEnTabla = async (pg: Page, mios: number[]) =>
  (await pg.locator("tr.cola-correos__fila").evaluateAll((trs) => trs.map((t) => Number((t as HTMLElement).dataset.id)))).filter((id) => mios.includes(id));
const sinDesborde = (pg: Page) => pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const esperar = async (fn: () => Promise<boolean>, ms = 15000) => { const fin = Date.now() + ms; while (Date.now() < fin) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 250)); } return false; };

const b = await chromium.launch();
try {
  // ---------- siembra (dentro del try: si algo falla, el finally limpia) ----------
  configAntes = await prisma.configuracion.findMany({ where: { clave: { in: CLAVES_CONFIG } }, select: { clave: true, valor: true } });
  await prisma.configuracion.deleteMany({ where: { clave: { in: CLAVES_CONFIG } } }); // defectos: 25 por dia, automatico apagado
  await prisma.configuracion.upsert({ where: { clave: "correos_automatico" }, update: { valor: "on" }, create: { clave: "correos_automatico", valor: "on" } }); // el recorrido parte con el automatico encendido
  const nichoDe = async (arquetipo: string, nombre: string) => {
    const n = await prisma.nicho.findFirst({ where: { plantillaPropuesta: arquetipo } });
    if (n) return n;
    const nuevo = await prisma.nicho.create({ data: { slug: `${arquetipo}-${sello}`, nombre, mensajeInicial: "Hola {nombre} {enlace}", mensajeSeguimiento: "Hola de nuevo {nombre} {enlace}", plantillaPropuesta: arquetipo } });
    creado.nichos.push(nuevo.id); return nuevo;
  };
  const comercio = await nichoDe("comercio-y-tienda", "Comercio");
  const hoteles = await nichoDe("hoteles", "Hoteles");
  const sembrar = async (letra: string, nichoId: number, gancho: string) => {
    const nombre = `${letra === "B" ? "Hotel" : "Tienda"} ${letra} ${marca}`;
    const email = `${letra.toLowerCase()}-${sello}@ejemplo.test`;
    const p = await prisma.prospecto.create({ data: { nichoId, nombre, ciudad: "Caracas", email, fuentes: ["https://ejemplo.test/"], codigo: generarCodigo(), clave: `${nombre}|caracas`.toLowerCase().replace(/[^a-z0-9|]/g, "") } });
    creado.prospectos.push(p.id); creado.emails.push(email);
    await prisma.fichaNegocio.create({ data: { prospectoId: p.id, gancho, resumen: `Resumen ${letra} ${marca}`, estado: gancho ? "revisada" : "lista" } });
    return p;
  };
  const A = await sembrar("A", comercio.id, "Vende por Instagram y cobra el pago movil a mano");
  const B = await sembrar("B", hoteles.id, "Reserva por WhatsApp y no tiene motor de reservas");
  const C = await sembrar("C", comercio.id, "");
  const mios = [A.id, B.id, C.id];
  const dueno = await prisma.usuario.create({ data: { nombre: `Dueño ${marca}`, rol: "dueno", pinHash: await bcrypt.hash(PIN_DUENO, 10), metaDiaria: 10 } });
  const prospectador = await prisma.usuario.create({ data: { nombre: `Prospectador ${marca}`, rol: "prospectador", pinHash: await bcrypt.hash(PIN_PROSPECTADOR, 10), metaDiaria: 5 } });
  creado.usuarios.push(dueno.id, prospectador.id);

  // ---------- escritorio ----------
  {
    const { ctx, pg } = await pagina(b, 1280, 800, false);
    await entrar(pg, PIN_DUENO);
    revisar(await pg.locator("nav.lateral a[href='/correos']").isVisible(), "1280: la barra lateral lleva Correos");
    await ir(pg, "/correos");
    revisar(await pg.locator("nav.lateral a[href='/correos'][aria-current=page]").count() === 1, "1280: la lateral marca Correos como activa");
    const orden = await idsEnTabla(pg, mios);
    revisar(JSON.stringify(orden) === JSON.stringify([A.id, B.id, C.id]), `1280: /correos lista las 3 filas en orden, con gancho primero (${orden.join(",")})`);
    const cifra = await pg.locator(".cabecera-pagina__cifra").innerText();
    revisar(/\d+ listas? · 0\/25 hoy/.test(cifra), `1280: la cabecera dice listas y 0/25 hoy («${cifra}»)`);
    revisar(await pg.locator(".correos-cifras .cifra").count() === 5 && (await pg.locator("text=La apertura es aproximada").count()) === 1, "1280: cinco cifras y la nota de la apertura aproximada");
    revisar((await pg.locator("nav[aria-label='Estado de los correos'] a").allInnerTexts()).join("|") === "Listas|Enviadas|Seguimiento|Fallidas|Bloqueadas", "1280: chips de estado en orden");
    revisar((await pg.locator(`tr[data-id="${A.id}"] td[data-label=Gancho]`).innerText()).includes("Vende por Instagram") && (await pg.locator(`tr[data-id="${C.id}"] td[data-label=Gancho]`).innerText()).includes("Sin gancho"), "1280: la fila muestra el gancho (o «Sin gancho»)");
    await pg.screenshot({ path: `${SALIDA}/correos-1280.png`, fullPage: true });

    await pg.locator("nav[aria-label='Plantilla'] a", { hasText: "Hoteles de alta rotación" }).click();
    await pg.waitForURL(/arquetipo=hoteles/); await pg.waitForLoadState("networkidle");
    revisar(JSON.stringify(await idsEnTabla(pg, mios)) === JSON.stringify([B.id]), "1280: el chip de plantilla filtra (solo el hotel)");
    await ir(pg, "/correos");

    // Vista previa: abre, foco adentro, gancho en el iframe
    const verA = pg.locator(`tr[data-id="${A.id}"] button`, { hasText: "Ver" });
    await verA.click();
    const dialogo = pg.getByRole("dialog");
    await dialogo.locator("iframe[title='Vista previa del correo']").waitFor({ timeout: 20000 });
    revisar(await dialogo.isVisible(), "1280: «Ver» abre la vista previa como diálogo");
    revisar(await pg.evaluate(() => !!document.activeElement?.closest("[role=dialog]")), "1280: el foco entra al diálogo");
    const caja = await dialogo.boundingBox();
    revisar(!!caja && caja.x > 400 && caja.width >= 600 && caja.width <= 760, `1280: es una hoja lateral a la derecha (x=${caja?.x}, ancho=${caja?.width})`);
    const srcdoc = () => dialogo.locator("iframe").getAttribute("srcdoc").then((s) => s ?? "");
    revisar((await srcdoc()).includes("Vende por Instagram") && (await dialogo.locator(".previa__asunto").innerText()).includes(`Tienda A ${marca}`), "1280: el iframe trae el gancho y el asunto lleva el nombre");
    revisar(await dialogo.locator("iframe").getAttribute("sandbox") === "", "1280: el iframe va con sandbox sin permisos");
    revisar((await dialogo.locator("a", { hasText: "PDF" }).getAttribute("href")) === `/p/${A.codigo}/pdf`, "1280: enlace al PDF de la propuesta");
    // gancho malo: la regla en linea lo frena
    const campo = dialogo.locator("textarea[name=gancho]");
    await campo.fill("Con <b>html</b>");
    await dialogo.locator("button", { hasText: "Guardar gancho" }).click();
    revisar(await dialogo.locator("text=Va en una sola línea").isVisible(), "1280: la regla en línea frena «<» y «>»");
    const nuevoGancho = `Gancho editado ${sello}`;
    await campo.fill(nuevoGancho);
    await dialogo.locator("button", { hasText: "Guardar gancho" }).click();
    revisar(await esperar(async () => (await srcdoc()).includes(nuevoGancho)), "1280: el gancho editado se ve en el iframe");
    const fichaA = await prisma.fichaNegocio.findUniqueOrThrow({ where: { prospectoId: A.id } });
    revisar(fichaA.gancho === nuevoGancho && fichaA.resumen === `Resumen A ${marca}`, "1280: el gancho queda en la base y el resumen no se pierde");
    await pg.screenshot({ path: `${SALIDA}/vista-previa-1280.png` });
    await pg.keyboard.press("Escape");
    revisar(await esperar(async () => (await pg.getByRole("dialog").count()) === 0, 3000), "1280: Escape cierra la vista previa");
    revisar(await esperar(async () => pg.evaluate((id) => !!document.activeElement?.closest(`tr[data-id="${id}"]`) && document.activeElement?.textContent === "Ver", A.id), 2000), "1280: el foco vuelve a «Ver»");

    // Enviar desde la vista previa
    await verA.click();
    await dialogo.locator("iframe").waitFor({ timeout: 20000 });
    await dialogo.locator("button", { hasText: /^Enviar$/ }).click();
    revisar(await esperar(async () => (await pg.locator(".flotante__texto", { hasText: `Correo enviado a Tienda A ${marca}` }).count()) === 1, 60000), "1280: «Enviar» avisa «Correo enviado»");
    const envioA = await prisma.envioCorreo.findFirst({ where: { prospectoId: A.id, fallo: "" } });
    revisar(!!envioA, "1280: el envío queda en la base sin fallo (simulado)");
    revisar(await esperar(async () => !(await idsEnTabla(pg, mios)).includes(A.id)), "1280: la fila sale de «listas» sin recargar");
    await ir(pg, "/correos?estado=enviadas");
    const hitosA = () => pg.locator(`tr[data-id="${A.id}"] td[data-label=Hitos]`).innerText();
    revisar((await hitosA()).includes("Enviado"), `1280: en «enviadas» con el hito «Enviado» (${await hitosA()})`);

    // Pixel y enlace: sin sesion (fetch del script), cuentan
    if (envioA) {
      const px = await fetch(`${BASE}/api/correo/a/${envioA.token}.png`);
      revisar(px.status === 200 && (px.headers.get("content-type") ?? "").includes("image/png"), "pixel: responde 200 con un PNG");
      const r = await fetch(`${BASE}/r/${envioA.token}`, { redirect: "manual" });
      revisar(r.status === 302 && (r.headers.get("location") ?? "").includes(`/p/${A.codigo}?e=${envioA.token}`), `/r/<token>: 302 a la propuesta (${r.status})`);
      await ir(pg, "/correos?estado=enviadas");
      revisar((await hitosA()).includes("Abrió") && (await hitosA()).includes("Vio"), `1280: aparecen los hitos «Abrió» y «Vio» (${await hitosA()})`);
      revisar((await pg.locator(".correos-cifras .cifra").nth(1).innerText()).includes("%"), "1280: las cifras muestran el % sobre enviados");
      // Reenviar pide confirmacion
      await pg.locator(`tr[data-id="${A.id}"] button`, { hasText: "Ver" }).click();
      await dialogo.locator("iframe").waitFor({ timeout: 20000 });
      await dialogo.locator("button", { hasText: "Reenviar" }).click();
      revisar(await dialogo.locator("text=Ya se le envió el").isVisible() && await dialogo.locator("text=¿Enviar otra vez?").isVisible(), "1280: «Reenviar» pide confirmación con la fecha");
      await dialogo.locator("button", { hasText: /^No$/ }).click();
      await dialogo.locator("button", { hasText: "Cerrar" }).click();
      revisar(await prisma.envioCorreo.count({ where: { prospectoId: A.id } }) === 1, "1280: decir «No» no reenvía");
    }

    // Enviar directo desde la tabla
    await ir(pg, "/correos");
    await pg.locator(`tr[data-id="${B.id}"] button`, { hasText: /^Enviar$/ }).click();
    revisar(await esperar(async () => !(await idsEnTabla(pg, mios)).includes(B.id), 60000), "1280: «Enviar» directo saca la fila de «listas»");
    revisar(await prisma.envioCorreo.count({ where: { prospectoId: B.id, fallo: "" } }) === 1, "1280: el envío directo queda en la base");
    revisar(await esperar(async () => /· 2\/25 hoy/.test(await pg.locator(".cabecera-pagina__cifra").innerText())), "1280: la cabecera cuenta 2/25 hoy");

    // Pausar y reanudar en /correos
    await pg.locator(".correos-automatico button", { hasText: "Pausar" }).click();
    revisar(await esperar(async () => (await pg.locator(".correos-automatico").innerText()).includes("en pausa")), "1280: «Pausar» deja el automático en pausa");
    revisar((await prisma.configuracion.findUnique({ where: { clave: "correos_automatico" } }))?.valor === "off", "1280: la pausa queda en la base");
    await pg.locator(".correos-automatico button", { hasText: "Reanudar" }).click();
    revisar(await esperar(async () => (await pg.locator(".correos-automatico").innerText()).includes("encendido")), "1280: «Reanudar» lo enciende otra vez");

    // Pausar y reanudar en Ajustes
    await ir(pg, "/ajustes?abrir=correos");
    const form = pg.locator("#correos form");
    revisar(await form.isVisible(), "ajustes: la sección «Correos» está y abre");
    await form.locator("select[name=automatico]").selectOption("off");
    await form.locator("button", { hasText: "Guardar" }).click();
    revisar(await esperar(async () => (await prisma.configuracion.findUnique({ where: { clave: "correos_automatico" } }))?.valor === "off"), "ajustes: pausar desde Ajustes queda en la base");
    await pg.waitForLoadState("networkidle"); await pg.waitForTimeout(1500); // el formulario se remonta con los valores nuevos (key): esperar antes de tocarlo
    await pg.locator("#correos form select[name=automatico]").selectOption("on");
    await pg.locator("#correos form input[name=tope]").fill("30");
    await pg.locator("#correos form button", { hasText: "Guardar" }).click();
    revisar(await esperar(async () => (await prisma.configuracion.findUnique({ where: { clave: "correos_automatico" } }))?.valor === "on" && (await prisma.configuracion.findUnique({ where: { clave: "correos_por_dia" } }))?.valor === "30"), "ajustes: reanudar y subir el tope a 30");
    await pg.screenshot({ path: `${SALIDA}/ajustes-correos-1280.png`, fullPage: true });
    await ir(pg, "/correos");
    revisar((await pg.locator(".cabecera-pagina__cifra").innerText()).includes("/30 hoy"), "1280: /correos ya usa el tope nuevo");
    await ctx.close();
  }

  // ---------- telefono ----------
  {
    const { ctx, pg } = await pagina(b, 390, 844, true);
    await entrar(pg, PIN_DUENO);
    await pg.locator("nav.barra button.barra__mas").click();
    revisar(await pg.getByRole("dialog", { name: "Más secciones" }).locator("a[href='/correos']").isVisible(), "390: «Más» lleva Correos");
    await pg.keyboard.press("Escape");
    await ir(pg, "/correos");
    revisar(JSON.stringify(await idsEnTabla(pg, mios)) === JSON.stringify([C.id]), "390: queda la fila sin gancho");
    const apilado = await pg.evaluate(() => { const td = document.querySelector("tr.cola-correos__fila td[data-label]"); return td ? getComputedStyle(td, "::before").content : "sin-td"; });
    revisar(apilado !== "none" && apilado !== "sin-td", `390: las filas se apilan con su etiqueta (${apilado})`);
    revisar(await sinDesborde(pg), "390: /correos no se desplaza a lo ancho");
    await pg.screenshot({ path: `${SALIDA}/correos-390.png`, fullPage: true });
    await ir(pg, "/correos?estado=enviadas");
    revisar(await sinDesborde(pg), "390: «enviadas» con hitos no se desplaza a lo ancho");
    await pg.screenshot({ path: `${SALIDA}/correos-enviadas-390.png`, fullPage: true });
    await ir(pg, "/correos");
    await pg.locator(`tr[data-id="${C.id}"] button`, { hasText: "Ver" }).click();
    const dialogo = pg.getByRole("dialog");
    await dialogo.locator("iframe").waitFor({ timeout: 20000 });
    const caja = await dialogo.boundingBox();
    revisar(!!caja && caja.x === 0 && Math.round(caja.width) === 390, `390: la vista previa ocupa la pantalla (${caja?.x}, ${caja?.width})`);
    revisar(await dialogo.evaluate((d) => d.scrollWidth <= d.clientWidth + 1), "390: la vista previa no se desplaza a lo ancho");
    await pg.screenshot({ path: `${SALIDA}/vista-previa-390.png` });
    await dialogo.locator("button", { hasText: "No quiere correo" }).click();
    revisar(await esperar(async () => (await pg.getByRole("dialog").count()) === 0 && !(await idsEnTabla(pg, mios)).includes(C.id)), "390: «No quiere correo» cierra y saca la fila");
    await ir(pg, "/correos?estado=bloqueadas");
    revisar((await idsEnTabla(pg, mios)).includes(C.id) && !(await pg.locator(`tr[data-id="${C.id}"] button`, { hasText: /^Enviar$/ }).count()), "390: aparece en «bloqueadas» sin botón Enviar");
    await ctx.close();
  }

  // ---------- prospectador ----------
  {
    const { ctx, pg } = await pagina(b, 390, 844, true);
    await entrar(pg, PIN_PROSPECTADOR);
    const resp = await pg.goto(`${BASE}/correos`); await pg.waitForLoadState("networkidle");
    revisar(/\/inicio$/.test(new URL(pg.url()).pathname) || resp?.status() === 404, `prospectador: /correos no se le abre (${pg.url()})`);
    revisar(!(await pg.locator("nav.barra a").allInnerTexts()).join("|").includes("Correos") && !(await pg.locator("nav.barra button.barra__mas").count()), "prospectador: su barra no lleva Correos");
    await ctx.close();
  }
} catch (e) {
  errores.push(`excepcion: ${(e as Error).message}`);
} finally {
  await b.close();
  await prisma.envioCorreo.deleteMany({ where: { prospectoId: { in: creado.prospectos } } });
  await prisma.evento.deleteMany({ where: { OR: [{ prospectoId: { in: creado.prospectos } }, { usuarioId: { in: creado.usuarios } }] } });
  await prisma.fichaNegocio.deleteMany({ where: { prospectoId: { in: creado.prospectos } } });
  await prisma.correoBloqueado.deleteMany({ where: { email: { in: creado.emails } } });
  await prisma.prospecto.deleteMany({ where: { id: { in: creado.prospectos } } });
  await prisma.usuario.deleteMany({ where: { id: { in: creado.usuarios } } });
  for (const id of creado.nichos) await prisma.nicho.delete({ where: { id } }).catch(() => {});
  await prisma.configuracion.deleteMany({ where: { clave: { in: CLAVES_CONFIG } } });
  for (const c of configAntes) await prisma.configuracion.create({ data: c });
  await prisma.$disconnect();
}
for (const p of pasos) console.log("ok  ", p);
for (const e of errores) console.log("FALLA", e);
console.log(`\n${pasos.length}/${pasos.length + errores.length} ok`);
process.exit(errores.length ? 1 : 0);
