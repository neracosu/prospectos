// scripts/verificar-flujo-recibos.mts — recorrido a 390 px: pagar, generar recibo, bajarlo, avisar, anular, bajar la nota.
// SOLO contra un servidor de desarrollo con la base de tests: generar un recibo gasta un correlativo real.
// Uso (desde el clon de prueba, con su next dev en 3014):
//   set -a; . ~/.config/prospectos/env; set +a
//   El servidor de desarrollo del clon se levanta con PROSPECTOS_DIR_ARCHIVOS apuntando a un directorio temporal (nunca ~/prospectos-archivos).
//   DATABASE_URL="$TEST_DATABASE_URL" BASE_URL=http://127.0.0.1:3014 npx tsx scripts/verificar-flujo-recibos.mts < archivo-con-el-pin
import { readFileSync, mkdirSync } from "node:fs";
import bcrypt from "bcryptjs";
import { chromium } from "playwright";
import { prisma } from "../src/lib/db";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3014";
if (!(process.env.DATABASE_URL ?? "").includes("prospectos_test")) { console.error("ALTO: DATABASE_URL no es la base de tests. Este recorrido genera recibos y gastaria correlativos reales."); process.exit(2); }
if (/neracosu\.com|:3013(\/|$)/.test(BASE)) { console.error("ALTO: BASE_URL apunta a produccion (el dominio publico o el puerto 3013). Usa el servidor de desarrollo del clon."); process.exit(2); }
const pin = readFileSync(0, "utf8").trim();
mkdirSync("capturas", { recursive: true });
const errores: string[] = [];
const marca = `(PRUEBA) ${Date.now()}`;
let usuarioCreado = 0, clienteId = 0;

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const pg = await ctx.newPage();
// Registrado DESPUES de crear pg y comparando contra ella: la pagina principal tambien nace en
// about:blank antes de goto(), y el manejador no debe cerrar esa. Solo cierra la emergente de WhatsApp.
ctx.on("page", (nueva) => { if (nueva !== pg && (nueva.url().includes("wa.me") || nueva.url() === "about:blank")) nueva.close().catch(() => {}); });
pg.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
pg.on("console", (m) => { if (m.type() === "error") errores.push(`console: ${m.text()}`); });
try {
  // Sembrado minimo en la base de tests
  if (!(await prisma.usuario.findFirst({ where: { rol: "dueno", activo: true } }))) usuarioCreado = (await prisma.usuario.create({ data: { nombre: marca, rol: "dueno", pinHash: await bcrypt.hash(pin, 10) } })).id;
  const nicho = (await prisma.nicho.findFirst()) ?? (await prisma.nicho.create({ data: { slug: "hoteles", nombre: "Hoteles", mensajeInicial: "{nombre} {enlace}", mensajeSeguimiento: "{nombre} {enlace}" } }));
  await prisma.configuracion.upsert({ where: { clave: "datos_emisor" }, update: {}, create: { clave: "datos_emisor", valor: JSON.stringify({ nombre: "Neri Colón", rif: "V-12345678-9", whatsapp: "584121234567", email: "neri@ejemplo.test" }) } });
  const cliente = await prisma.cliente.create({ data: { nombre: `Hotel ${marca}`, whatsapp: "584120000000", rif: "J-40123456-7", codigo: `prueba-${Date.now()}` } });
  clienteId = cliente.id;
  const proyecto = await prisma.proyecto.create({ data: { clienteId, nichoId: nicho.id, nombre: "PMS de prueba", pagoUnico: "0", mensualidad: "100.00", fechaInicio: "2026-09-01", estado: "activo" } });
  await prisma.cobro.create({ data: { proyectoId: proyecto.id, concepto: "extra", detalle: "Módulo de reportes", monto: "350.00", vence: "2026-09-10" } });

  await pg.goto(`${BASE}/entrar`);
  for (const d of pin) await pg.getByRole("button", { name: d, exact: true }).click();
  await pg.waitForURL(/\/hoy$/);

  // 1. Pagar
  await pg.goto(`${BASE}/proyectos/${proyecto.id}`);
  await pg.getByRole("button", { name: "Marcar pagado" }).click();
  await pg.getByLabel("Referencia").fill("Z-998877");
  await pg.getByRole("button", { name: "Confirmar" }).click();
  await pg.getByRole("button", { name: "Generar recibo" }).waitFor();
  await pg.screenshot({ path: "capturas/p4-01-pagado.png", fullPage: true });

  // 2. Generar: el boton avisa mientras trabaja y despues aparece el enlace
  await pg.getByRole("button", { name: "Generar recibo" }).click();
  await pg.getByRole("button", { name: "Generando recibo…" }).waitFor({ timeout: 5_000 }).catch(() => errores.push("el boton no dijo «Generando recibo…»"));
  await pg.screenshot({ path: "capturas/p4-02-generando.png", fullPage: true });
  const enlace = pg.getByRole("link", { name: /^Recibo R-\d{4}-\d{4,}$/ });
  await enlace.waitFor({ timeout: 90_000 });
  await pg.screenshot({ path: "capturas/p4-03-con-recibo.png", fullPage: true });
  const numero = ((await enlace.textContent()) ?? "").replace("Recibo ", "");

  // 3. Descargar con la sesion del navegador
  const pdf = await ctx.request.get(`${BASE}/recibos/${numero}.pdf`);
  if (pdf.status() !== 200) errores.push(`descarga del recibo: ${pdf.status()}`);
  if (pdf.headers()["content-type"] !== "application/pdf") errores.push("la descarga no es application/pdf");
  if ((await pdf.body()).length < 10_000) errores.push("el PDF pesa menos de 10 KB");
  const sinSesion = await (await b.newContext()).request.get(`${BASE}/recibos/${numero}.pdf`, { maxRedirects: 0 });
  if (sinSesion.status() !== 307) errores.push(`sin sesion deberia ser 307, fue ${sinSesion.status()}`);

  // 4. Avisar por WhatsApp
  await pg.getByRole("button", { name: "Enviar por WhatsApp" }).click();
  await pg.getByText("Adjunta el PDF del recibo desde el teléfono.").waitFor();
  await pg.screenshot({ path: "capturas/p4-04-avisado.png", fullPage: true });
  if ((await prisma.evento.count({ where: { proyectoId: proyecto.id, tipo: "aviso_cliente", texto: `recibo ${numero}` } })) !== 1) errores.push("no quedo el evento aviso_cliente");

  // 5. Anular: la confirmacion dice que pasa con el recibo
  await pg.getByRole("button", { name: "Anular", exact: true }).click();
  await pg.getByText(`se genera la nota ${numero}-A`).waitFor();
  // exact: true porque el proyecto activo tambien puede pasar a "cerrado" y esa tarjeta trae su
  // propio campo "Motivo (solo para cerrar)": sin exact, getByLabel("Motivo") ve los dos.
  await pg.getByLabel("Motivo", { exact: true }).fill("Recorrido de prueba");
  await pg.screenshot({ path: "capturas/p4-05-confirmar-anular.png", fullPage: true });
  await pg.getByRole("button", { name: "Anular cobro" }).click();
  await pg.getByRole("link", { name: "Nota de anulación" }).waitFor({ timeout: 90_000 });
  await pg.screenshot({ path: "capturas/p4-06-anulado.png", fullPage: true });
  const nota = await ctx.request.get(`${BASE}/recibos/${numero}-A.pdf`);
  if (nota.status() !== 200 || (await nota.body()).length < 10_000) errores.push("la nota de anulacion no se descarga bien");
  if ((await ctx.request.get(`${BASE}/recibos/${numero}.pdf`)).status() !== 200) errores.push("anular borro el PDF del recibo");

  // 6. Nada se sale de la pantalla a 390 px
  const ancho = await pg.evaluate(() => document.documentElement.scrollWidth);
  if (ancho > 390) errores.push(`hay scroll horizontal: ${ancho}px`);
} catch (e) {
  errores.push(`excepcion: ${(e as Error).message}`);
  await pg.screenshot({ path: "capturas/p4-error.png", fullPage: true }).catch(() => {});
} finally {
  await b.close();
  if (clienteId) {
    const pids = (await prisma.proyecto.findMany({ where: { clienteId }, select: { id: true } })).map((p) => p.id);
    await prisma.evento.deleteMany({ where: { proyectoId: { in: pids } } });
    await prisma.cobro.deleteMany({ where: { proyectoId: { in: pids } } });
    await prisma.proyecto.deleteMany({ where: { id: { in: pids } } });
    await prisma.cliente.delete({ where: { id: clienteId } });
  }
  if (usuarioCreado) await prisma.usuario.delete({ where: { id: usuarioCreado } });
  await prisma.$disconnect();
}
console.log(errores.length ? `FALLO:\n- ${errores.join("\n- ")}` : "PASS: recorrido de recibos sin errores");
process.exit(errores.length ? 1 : 0);
