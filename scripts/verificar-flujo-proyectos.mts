// scripts/verificar-flujo-proyectos.mts — contra el dominio, con un cliente y proyecto de prueba que se borran al final.
// Uso: set -a; . ~/.config/prospectos/env; set +a; BASE_URL=https://prospectos.neracosu.com npx tsx scripts/verificar-flujo-proyectos.mts < archivo-con-el-pin
import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { prisma } from "../src/lib/db";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3013";
const pin = readFileSync(0, "utf8").trim();
mkdirSync("capturas", { recursive: true });
const errores: string[] = [];
const marca = `(PRUEBA) ${Date.now()}`;

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const pg = await ctx.newPage();
pg.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
pg.on("console", (m) => { if (m.type() === "error") errores.push(`console: ${m.text()}`); });
let clienteId = 0;
try {
  await pg.goto(`${BASE}/entrar`);
  for (const d of pin) await pg.getByRole("button", { name: d, exact: true }).click();
  await pg.waitForURL(/\/hoy$/);

  // 1. Crear cliente
  await pg.goto(`${BASE}/clientes/nuevo`);
  await pg.getByLabel("Nombre del negocio").fill(`Hotel ${marca}`);
  await pg.getByLabel("WhatsApp").fill("0412 000 00 00");
  await pg.getByRole("button", { name: "Guardar" }).click();
  await pg.waitForURL(/\/clientes\/\d+$/);
  clienteId = Number(pg.url().split("/").pop());
  await pg.screenshot({ path: "capturas/p3-01-cliente.png", fullPage: true });

  // 2. Crear proyecto en 3 cuotas
  await pg.goto(`${BASE}/proyectos/nuevo`);
  await pg.getByLabel("Cliente").selectOption({ label: `Hotel ${marca}` });
  await pg.getByLabel("Nombre del proyecto").fill("PMS de prueba");
  await pg.getByLabel("Pago único (USD)").fill("2800");
  await pg.getByLabel("Mensualidad (USD)").fill("100");
  await pg.getByLabel("Horas cotizadas").fill("160");
  await pg.getByLabel("Forma de pago del pago único").selectOption("cuotas");
  await pg.getByRole("button", { name: "Crear proyecto" }).click();
  await pg.waitForURL(/\/proyectos\/\d+$/);
  const proyectoId = Number(pg.url().split("/").pop());
  await pg.screenshot({ path: "capturas/p3-02-proyecto-cobros.png", fullPage: true });
  if ((await prisma.cobro.count({ where: { proyectoId } })) !== 3) errores.push("no se generaron 3 cuotas");

  // 3. Marcar la primera cuota pagada (Server Action por el dominio)
  await pg.getByRole("button", { name: "Marcar pagado" }).first().click();
  await pg.getByRole("button", { name: "Confirmar" }).click();
  await pg.getByText("Pagado").first().waitFor();
  await pg.screenshot({ path: "capturas/p3-03-pagado.png", fullPage: true });

  // 4. Publicar version pegando markdown
  await pg.goto(`${BASE}/proyectos/${proyectoId}?t=versiones`);
  await pg.getByRole("button", { name: "Publicar versión" }).click();
  await pg.getByLabel("Versión").fill("1.0.0");
  await pg.getByLabel("Pega el bloque del CHANGELOG.md").fill("### Nuevo\n- Reporte de ocupación\n### Arreglo\n- Cierre de caja");
  await pg.getByRole("button", { name: "Publicar" }).click();
  await pg.getByText("Versión actual: 1.0.0").waitFor();
  await pg.screenshot({ path: "capturas/p3-04-versiones.png", fullPage: true });

  // 5. Pendientes, horas, lista con cifras del mes
  await pg.goto(`${BASE}/proyectos/${proyectoId}?t=pendientes`);
  await pg.getByLabel("Nuevo pendiente").fill("Módulo de reservas");
  await pg.getByRole("button", { name: "Agregar" }).click();
  await pg.getByText("Módulo de reservas").waitFor();
  await pg.goto(`${BASE}/proyectos/${proyectoId}?t=horas`);
  await pg.getByLabel("Horas (pasos de 0,25)").fill("2.5");
  await pg.getByLabel("Qué hiciste").fill("Reservas");
  await pg.getByRole("button", { name: "Registrar" }).click();
  await pg.getByText("2.5 h", { exact: true }).waitFor();
  await pg.screenshot({ path: "capturas/p3-05-horas.png", fullPage: true });
  await pg.goto(`${BASE}/proyectos`);
  await pg.getByText("cobrado este mes").waitFor();
  await pg.screenshot({ path: "capturas/p3-06-lista.png", fullPage: true });
} catch (e) {
  errores.push(`excepcion: ${(e as Error).message}`);
  await pg.screenshot({ path: "capturas/p3-error.png", fullPage: true }).catch(() => {});
} finally {
  await b.close();
  // Limpieza total del cliente de prueba y todo lo que cuelga de el (es basura de verificacion).
  if (clienteId) {
    const proyectos = await prisma.proyecto.findMany({ where: { clienteId }, select: { id: true } });
    const pids = proyectos.map((p) => p.id);
    await prisma.evento.deleteMany({ where: { proyectoId: { in: pids } } });
    await prisma.cambio.deleteMany({ where: { version: { proyectoId: { in: pids } } } });
    await prisma.version.deleteMany({ where: { proyectoId: { in: pids } } });
    await prisma.horas.deleteMany({ where: { proyectoId: { in: pids } } });
    await prisma.pendiente.deleteMany({ where: { proyectoId: { in: pids } } });
    await prisma.cobro.deleteMany({ where: { proyectoId: { in: pids } } });
    await prisma.proyecto.deleteMany({ where: { id: { in: pids } } });
    await prisma.cliente.delete({ where: { id: clienteId } });
  }
  await prisma.$disconnect();
}
console.log(errores.length ? `FALLO:\n- ${errores.join("\n- ")}` : "PASS: recorrido de proyectos sin errores");
process.exit(errores.length ? 1 : 0);
