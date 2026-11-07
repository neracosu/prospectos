// scripts/verificar-flujo-rastro.mts — recorrido real a 390 px del rastro de enlaces (6-nov): siembra un lead con un
// enlace y 6 visitas (2 visitantes que abren, 1 reenvio por WhatsApp, 1 visita propia y un «fin» con tiempo y bajada),
// entra con un dueno temporal, revisa el bloque «Lo que hicieron con lo enviado» en /leads/<id> (con y sin ?mias=1)
// y guarda una IP propia en /ajustes. Al terminar borra lo que creo y devuelve las IPs propias como estaban.
// SOLO contra el servidor de desarrollo del clon con la base de tests.
// Uso (desde el repo, con el clon en 3021):
//   DATABASE_URL="$TEST_DATABASE_URL" BASE_URL=http://127.0.0.1:3021 npx tsx scripts/verificar-flujo-rastro.mts [dir-capturas]
import bcrypt from "bcryptjs";
import { chromium, type Page } from "playwright";
import { prisma } from "../src/lib/db";
import { registrarEnlace, leerIpsPropias, guardarIpsPropias } from "../src/lib/rastro";
import { leerConfig, guardarConfig, CLAVES } from "../src/lib/configuracion";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3021";
if (!(process.env.DATABASE_URL ?? "").includes("prospectos_test")) { console.error("ALTO: DATABASE_URL no es la base de tests."); process.exit(2); }
if (/neracosu\.com|:3013(\/|$)/.test(BASE)) { console.error("ALTO: BASE_URL apunta a produccion. Usa el servidor de desarrollo del clon."); process.exit(2); }

const CAPTURAS = process.argv[2] ?? "";
const sello = Date.now();
const marca = `(PRUEBA rastro) ${sello}`;
const PIN_DUENO = "640317";
const IP_NUEVA = "203.0.113.77"; // rango de documentacion: no es de nadie
const RUTA = `/propuesta/prueba-rastro-${sello}/`;
const errores: string[] = [];
const pasos: string[] = [];
const revisar = (ok: boolean, que: string) => { (ok ? pasos : errores).push(que); };
const codigoDe = (s: string) => (s + "x".repeat(22)).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 22);
const hace = (min: number) => new Date(Date.now() - min * 60_000);

async function entrar(pg: Page, pin: string) {
  await pg.goto(`${BASE}/entrar`);
  for (const d of pin) await pg.getByRole("button", { name: d, exact: true }).click();
  await pg.waitForURL((u) => /\/inicio$/.test(u.pathname), { timeout: 30_000 }); await pg.waitForLoadState("networkidle");
}

let duenoId = 0, prospectoId = 0, nichoCreado = 0, enlaceId = 0;
const ipsAntes = await leerIpsPropias();
const sesionesAntes = await leerConfig(CLAVES.rastroVisitantesSesion);
const b = await chromium.launch();
try {
  // ---------- siembra (dentro del try: si falla, el finally limpia) ----------
  duenoId = (await prisma.usuario.create({ data: { nombre: `Dueño ${marca}`, rol: "dueno", pinHash: await bcrypt.hash(PIN_DUENO, 10), metaDiaria: 10 } })).id;
  let nicho = await prisma.nicho.findFirst({ where: { slug: "otro" } });
  if (!nicho) { nicho = await prisma.nicho.create({ data: { slug: "otro", nombre: "Otro", mensajeInicial: "Hola, {nombre}", mensajeSeguimiento: "Hola de nuevo, {nombre}", plantillaPropuesta: "" } }); nichoCreado = nicho.id; }
  prospectoId = (await prisma.prospecto.create({ data: {
    nichoId: nicho.id, nombre: `Tienda Rastro ${marca}`, ciudad: "", fuentes: [], codigo: codigoDe(`r${sello}`),
    clave: `tiendarastro||${sello}`, origen: "manual", esLead: true, fuenteLead: "whatsapp", etapa: "enviado", whatsapp: "584120007788",
  } })).id;
  const r = await registrarEnlace({ prospectoId, url: `https://neracosu.com${RUTA}`, etiqueta: "Propuesta", enviadoEn: hace(120) });
  if (!r.ok) throw new Error(`registrarEnlace: ${r.error}`);
  enlaceId = r.enlace.id;

  // A abre y vuelve (con su «fin»), B abre, C es la vista previa de WhatsApp (reenvio), D es Neri (propia).
  const A = "a1a1a1a1a1a1a1a1", B = "b2b2b2b2b2b2b2b2", C = "c3c3c3c3c3c3c3c3", D = "d4d4d4d4d4d4d4d4";
  const fila = (visitante: string, ip: string, tipo: string, min: number, extra: Record<string, unknown> = {}) => ({
    enlaceId, fuente: "log", tipo, visitante, ip, ua: "Mozilla/5.0 (PRUEBA)", aparato: "Android · Chrome", pais: "Venezuela", ciudad: "Caracas",
    ruta: RUTA, ocurrioEn: hace(min), ...extra,
  });
  await prisma.visitaEnlace.createMany({ data: [
    fila(A, "198.51.100.11", "vista", 60),
    fila(B, "198.51.100.12", "vista", 30, { aparato: "iPhone · iOS 18", ciudad: "Valencia" }),
    fila(C, "198.51.100.13", "reenvio", 25, { aparato: "", ua: "WhatsApp/2.23", detalle: "whatsapp", pais: "", ciudad: "" }),
    fila(A, "198.51.100.11", "vista", 20),
    fila(A, "198.51.100.11", "fin", 19, { fuente: "js", segundos: 130, scroll: 90 }),
    fila(D, "198.51.100.14", "vista", 10, { aparato: "Linux · Firefox", propia: true }),
  ] });
  revisar((await prisma.visitaEnlace.count({ where: { enlaceId } })) === 6, "siembra: 6 visitas");

  // ---------- ficha del lead a 390 px ----------
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "es-VE" });
  const pg = await ctx.newPage();
  const consola: string[] = [];
  pg.on("console", (m) => { if (m.type() === "error") consola.push(m.text()); });
  await entrar(pg, PIN_DUENO);

  await pg.goto(`${BASE}/leads/${prospectoId}`); await pg.waitForLoadState("networkidle");
  const bloque = pg.locator("section.rastro");
  revisar(await bloque.isVisible(), "ficha: bloque «Lo que hicieron con lo enviado»");
  const texto = await bloque.innerText();
  revisar(texto.includes("Lo que hicieron con lo enviado"), "ficha: título del bloque");
  revisar(texto.includes("2 visitantes · 3 aperturas · reenviado 1 vez"), "ficha: resumen «2 visitantes · 3 aperturas · reenviado 1 vez»");
  const filas = bloque.locator(".rastro__fila");
  revisar((await filas.count()) === 4, `ficha: 4 filas sin la propia (${await filas.count()})`);
  revisar((await bloque.locator(".rastro__fila--reenvio", { hasText: "Reenvió" }).count()) === 1, "ficha: una fila «Reenvió … por WhatsApp» resaltada");
  revisar(/Reenvió\s+Propuesta\s+por WhatsApp/.test(texto), "ficha: texto del reenvío");
  revisar(texto.includes("2 min 10 s · bajó hasta el 90 %"), "ficha: la vuelta trae el tiempo y la bajada");
  revisar(!texto.includes("Linux · Firefox") && !/Visitante \d+ · mío/.test(texto), "ficha: ninguna fila de la visita propia");
  revisar(!/198\.51\.100\./.test(await pg.locator("main").innerText()), "ficha: la IP no se muestra");
  revisar(texto.includes("Ubicación aproximada por IP · DB-IP"), "ficha: pie de DB-IP");
  revisar(await bloque.getByRole("button", { name: "Copiar etiqueta para la página" }).isVisible(), "ficha: botón de copiar la etiqueta");
  const ancho = await pg.evaluate(() => document.documentElement.scrollWidth);
  revisar(ancho <= 390, `ficha: sin desborde horizontal a 390 px (${ancho}px)`);
  if (CAPTURAS) await pg.screenshot({ path: `${CAPTURAS}/rastro-ficha.png`, fullPage: true });

  await pg.goto(`${BASE}/leads/${prospectoId}?mias=1`); await pg.waitForLoadState("networkidle");
  const conMias = await bloque.innerText();
  revisar((await filas.count()) === 5, `con ?mias=1: aparece la fila propia (${await filas.count()} filas)`);
  revisar(conMias.includes("Linux · Firefox") && /Visitante \d+ · mío/.test(conMias), "con ?mias=1: la propia va marcada «mío»");
  revisar(await bloque.getByRole("link", { name: "Ocultar las mías" }).isVisible(), "con ?mias=1: enlace «Ocultar las mías»");
  const ancho2 = await pg.evaluate(() => document.documentElement.scrollWidth);
  revisar(ancho2 <= 390, `con ?mias=1: sin desborde horizontal (${ancho2}px)`);

  // ---------- ajustes: IPs propias ----------
  await pg.goto(`${BASE}/ajustes?abrir=rastro`); await pg.waitForLoadState("networkidle");
  revisar((await pg.locator("main").innerText()).includes("Rastro de enlaces"), "ajustes: sección «Rastro de enlaces»");
  const caja = pg.locator('#rastro textarea[name="ips"]');
  await caja.fill([...ipsAntes, IP_NUEVA].join("\n"));
  await pg.locator("#rastro").getByRole("button", { name: "Guardar" }).click();
  await pg.getByText("IPs guardadas").waitFor({ timeout: 10_000 });
  revisar((await leerIpsPropias()).includes(IP_NUEVA), "ajustes: la IP queda guardada");
  const ancho3 = await pg.evaluate(() => document.documentElement.scrollWidth);
  revisar(ancho3 <= 390, `ajustes: sin desborde horizontal (${ancho3}px)`);
  if (CAPTURAS) await pg.screenshot({ path: `${CAPTURAS}/rastro-ajustes.png`, fullPage: true });

  revisar(consola.length === 0, `consola sin errores${consola.length ? ": " + consola.join(" | ").slice(0, 300) : ""}`);
} catch (e) {
  errores.push(`excepcion: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await b.close();
  if (enlaceId) await prisma.visitaEnlace.deleteMany({ where: { enlaceId } });
  if (prospectoId) {
    await prisma.enlaceEnviado.deleteMany({ where: { prospectoId } });
    await prisma.evento.deleteMany({ where: { prospectoId } });
    await prisma.prospecto.delete({ where: { id: prospectoId } }).catch(() => {});
  }
  if (duenoId) {
    await prisma.evento.deleteMany({ where: { usuarioId: duenoId } });
    await prisma.usuario.delete({ where: { id: duenoId } }).catch(() => {});
  }
  if (nichoCreado) await prisma.nicho.delete({ where: { id: nichoCreado } }).catch(() => {});
  await guardarIpsPropias(ipsAntes).catch(() => {});
  await guardarConfig(CLAVES.rastroVisitantesSesion, sesionesAntes).catch(() => {});
  await prisma.$disconnect();
}
for (const p of pasos) console.log(`  ✓ ${p}`);
for (const e of errores) console.log(`  ✗ ${e}`);
console.log(errores.length ? `\n${errores.length} fallas` : `\nTodo bien (${pasos.length} comprobaciones)`);
process.exit(errores.length ? 1 : 0);
