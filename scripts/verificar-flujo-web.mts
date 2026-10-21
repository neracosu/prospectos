// scripts/verificar-flujo-web.mts — recorrido real a 390 px de la medicion de neracosu.com (21-oct): manda visitas y
// una solicitud por las rutas publicas como lo haria la web, entra con un dueno temporal, revisa la tarjeta de Hoy y
// la pantalla /web, marca la solicitud como atendida y comprueba la base. Al terminar borra todo lo que creo.
// SOLO contra el servidor de desarrollo del clon con la base de tests. Vacia EventoWeb y SolicitudWeb de esa base.
// Uso (desde el clon, con su next dev en un puerto libre):
//   DATABASE_URL="$TEST_DATABASE_URL" BASE_URL=http://127.0.0.1:3021 npx tsx scripts/verificar-flujo-web.mts [dir-capturas]
import bcrypt from "bcryptjs";
import { chromium } from "playwright";
import { prisma } from "../src/lib/db";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3021";
if (!(process.env.DATABASE_URL ?? "").includes("prospectos_test")) { console.error("ALTO: DATABASE_URL no es la base de tests."); process.exit(2); }
if (/neracosu\.com|:3013(\/|$)/.test(BASE)) { console.error("ALTO: BASE_URL apunta a produccion. Usa el servidor de desarrollo del clon."); process.exit(2); }

const CAPTURAS = process.argv[2] ?? "";
const PIN_PANEL = "582931";
const UA = "Mozilla/5.0 (Linux; Android 13; SM-G780G) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36";
const errores: string[] = [];
const pasos: string[] = [];
const revisar = (ok: boolean, que: string) => { (ok ? pasos : errores).push(que); };
let ip = 0;
const enviar = (ruta: string, cuerpo: unknown, origen = "https://neracosu.com") => fetch(`${BASE}${ruta}`, {
  method: "POST", body: JSON.stringify(cuerpo),
  headers: { "content-type": "text/plain;charset=UTF-8", origin: origen, "user-agent": UA, "x-forwarded-for": `10.77.0.${++ip}` },
});

let duenoId = 0;
const b = await chromium.launch();
try {
  await prisma.eventoWeb.deleteMany();
  await prisma.solicitudWeb.deleteMany();
  duenoId = (await prisma.usuario.create({ data: { nombre: "Dueño (PRUEBA web)", rol: "dueno", pinHash: await bcrypt.hash(PIN_PANEL, 10), metaDiaria: 10 } })).id;

  // Seis visitas como las de octubre: casi todas se van de la home sin tocar nada.
  const visitas: [string, string, string[], string[]][] = [
    ["visita00001", "lm.facebook.com", ["/atalaya/"], []],
    ["visita00002", "", ["/"], ["industrias"]],
    ["visita00003", "", ["/"], []],
    ["visita00004", "www.google.com", ["/", "/para/hoteles.html", "/calculadora.html"], ["industrias", "productos"]],
    ["visita00005", "fb", ["/"], ["industrias", "productos", "portafolio", "sobre-mi", "faq", "blog", "contacto"]],
    ["visita00006", "papelcebolla", ["/blog/conciliacion-bancaria-venezuela.html"], []],
  ];
  for (const [s, o, rutas, secciones] of visitas) {
    for (const r of rutas) revisar((await enviar("/api/web/evento", { s, t: "vista", r, o, m: true })).status === 204, `vista ${s} ${r}`);
    for (const d of secciones) await enviar("/api/web/evento", { s, t: "seccion", r: "/", d });
  }
  await enviar("/api/web/evento", { s: "visita00005", t: "clic", r: "/", d: "whatsapp" });
  await enviar("/api/web/evento", { s: "visita00004", t: "clic", r: "/", d: "para" });
  revisar((await enviar("/api/web/evento", { s: "visita00009", t: "vista", r: "/" }, "https://otro.com")).status === 403, "otro origen: 403");
  const sol = await enviar("/api/web/solicitud", { nombre: "María Fernanda Rodríguez de los Ángeles", email: "maria.fernanda.rodriguez@posadalosangeles-margarita.com", phone: "+58 414 555 1234", type: "Sistema de Gestión por Industria", budget: "$2.000 — $5.000 USD", message: "Tenemos una posada de 18 habitaciones en Margarita y llevamos todo en cuaderno.\nQueremos reservas y cobros por pago móvil.", pagina: "/", sesion: "visita00005", sitio: "" });
  revisar(sol.status === 200, `solicitud aceptada (${sol.status})`);
  revisar(sol.headers.get("access-control-allow-origin") === "https://neracosu.com", "la respuesta trae CORS para neracosu.com");
  revisar((await prisma.eventoWeb.count()) > 0 && (await prisma.solicitudWeb.count()) === 1, "quedo en la base");

  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pg = await ctx.newPage();
  const consola: string[] = [];
  pg.on("console", (m) => { if (m.type() === "error") consola.push(m.text()); });
  await pg.goto(`${BASE}/entrar`);
  for (const d of PIN_PANEL) await pg.getByRole("button", { name: d, exact: true }).click();
  await pg.waitForURL(/\/hoy/, { timeout: 30_000 });

  const tarjeta = pg.getByRole("link", { name: /1 solicitud nueva desde la web/ });
  revisar(await tarjeta.isVisible(), "Hoy: tarjeta de solicitud nueva");
  revisar(/6 personas en 7 días/.test(await tarjeta.innerText()), "Hoy: cuenta 6 personas");
  if (CAPTURAS) await pg.screenshot({ path: `${CAPTURAS}/hoy.png` });
  await tarjeta.click();
  await pg.waitForURL(/\/web/);
  await pg.getByRole("heading", { name: /Solicitudes/ }).waitFor();
  const texto = await pg.locator("main").innerText();
  revisar(texto.includes("María Fernanda Rodríguez"), "Web: se ve la solicitud");
  revisar(/6\s*personas/.test(texto), "Web: 6 personas");
  revisar(/se fue sin tocar nada/.test(texto), "Web: cuadro de los que se fueron");
  revisar(await pg.getByRole("link", { name: "WhatsApp" }).first().getAttribute("href") === "https://wa.me/584145551234", "Web: enlace de WhatsApp limpio");
  const ancho = await pg.evaluate(() => document.documentElement.scrollWidth);
  revisar(ancho <= 390, `sin desborde horizontal (${ancho}px)`);
  if (CAPTURAS) await pg.screenshot({ path: `${CAPTURAS}/web.png`, fullPage: true });

  await pg.getByRole("button", { name: "Marcar atendida" }).click();
  await pg.getByRole("button", { name: "Atendida ✓" }).waitFor({ timeout: 10_000 });
  await pg.waitForTimeout(1500);
  revisar((await prisma.solicitudWeb.findFirst())?.atendidaEn instanceof Date, "atendida queda en la base");
  await pg.goto(`${BASE}/hoy`);
  revisar(!(await pg.getByText(/solicitud nueva/).count()), "Hoy: ya no avisa la solicitud atendida");
  for (const p of [30, 90]) {
    await pg.goto(`${BASE}/web?d=${p}`);
    revisar((await pg.getByRole("link", { name: `${p} días` }).getAttribute("aria-current")) === "page", `periodo de ${p} días`);
  }
  revisar(consola.length === 0, `consola sin errores${consola.length ? ": " + consola.join(" | ").slice(0, 300) : ""}`);
} catch (e) {
  errores.push(`excepcion: ${e instanceof Error ? e.message : String(e)}`);
} finally {
  await b.close();
  await prisma.eventoWeb.deleteMany();
  await prisma.solicitudWeb.deleteMany();
  if (duenoId) await prisma.usuario.delete({ where: { id: duenoId } }).catch(() => {});
  await prisma.$disconnect();
}
for (const p of pasos) console.log(`  ok  ${p}`);
for (const e of errores) console.log(`  MAL ${e}`);
console.log(errores.length ? `\n${errores.length} fallas` : `\nTodo bien (${pasos.length} comprobaciones)`);
process.exit(errores.length ? 1 : 0);
