// scripts/verificar-flujo.mts — recorrido real en el navegador, viewport 390x844.
// Uso: set -a; . ~/.config/prospectos/env; set +a
//      BASE_URL=https://prospectos.neracosu.com npx tsx scripts/verificar-flujo.mts <<< "PIN"
import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { prisma } from "../src/lib/db";
import { claveProspecto } from "../src/lib/clave-prospecto";
import { generarCodigo } from "../src/lib/codigo";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3013";
const pin = readFileSync(0, "utf8").trim();
mkdirSync("capturas", { recursive: true });
const errores: string[] = [];

const nicho = await prisma.nicho.findUniqueOrThrow({ where: { slug: "hoteles" } });
const nombre = `Hotel de Prueba (PRUEBA) ${Date.now()}`;
const prueba = await prisma.prospecto.create({ data: {
  nichoId: nicho.id, nombre, ciudad: "Caracas", whatsapp: "584120000000", fuentes: [], origen: "manual",
  codigo: generarCodigo(), clave: claveProspecto(nombre, "Caracas"), ordenCola: -1, // -1: primero en la cola
} });

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const pg = await ctx.newPage();
pg.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
// El paso 7 navega a proposito a un codigo invalido y espera un 404: Chromium
// registra esa misma navegacion como "Failed to load resource" en consola.
// Sin este filtro el propio chequeo del 404 esperado se reporta como fallo.
let esperando404 = false;
pg.on("console", (m) => {
  if (m.type() !== "error") return;
  if (esperando404 && /404/.test(m.text())) return;
  errores.push(`console: ${m.text()}`);
});

try {
  // 1. Entrar
  await pg.goto(`${BASE}/entrar`);
  for (const d of pin) await pg.getByRole("button", { name: d, exact: true }).click();
  await pg.waitForURL(/\/hoy$/);
  await pg.screenshot({ path: "capturas/01-hoy.png", fullPage: true });

  // 2. La tarjeta de prueba esta primera; tocar WhatsApp abre otra pestana; al volver pregunta
  const tarjeta = pg.locator("article", { hasText: nombre }).first();
  const [popup] = await Promise.all([ctx.waitForEvent("page"), tarjeta.getByRole("link", { name: /WhatsApp/ }).click()]);
  await popup.close();
  await tarjeta.getByText("¿Se envió?").waitFor();
  await pg.screenshot({ path: "capturas/02-se-envio.png" });
  await tarjeta.getByRole("button", { name: "Sí" }).click();
  await tarjeta.waitFor({ state: "detached" });

  // 3. Ficha: quedo en enviado con seguimiento
  await pg.goto(`${BASE}/prospectos/${prueba.id}`);
  await pg.getByText("Enviado").first().waitFor();
  await pg.screenshot({ path: "capturas/03-ficha.png", fullPage: true });

  // 4. Propuesta publica sin sesion deja "abierto"; con sesion no
  const anon = await b.newContext({ viewport: { width: 390, height: 844 } });
  const pa = await anon.newPage();
  const r = await pa.goto(`${BASE}/p/${prueba.codigo}`);
  if (r?.status() !== 200) errores.push(`propuesta: ${r?.status()}`);
  await pa.getByText(nombre.slice(0, 20)).first().waitFor();
  await pa.screenshot({ path: "capturas/04-propuesta.png" });

  // 4b. El PDF se descarga anonimo (primera corrida de Chromium bajo PM2)
  const pdf = await pa.request.get(`${BASE}/p/${prueba.codigo}/pdf`);
  const cuerpoPdf = await pdf.body().catch(() => Buffer.from(""));
  if (pdf.status() !== 200) errores.push(`pdf: status ${pdf.status()} — ${cuerpoPdf.toString("utf8").slice(0, 300)}`);
  const tipoPdf = pdf.headers()["content-type"] ?? "";
  if (!tipoPdf.includes("application/pdf")) errores.push(`pdf: content-type ${tipoPdf}`);
  if (cuerpoPdf.length <= 50_000) errores.push(`pdf: cuerpo de ${cuerpoPdf.length} bytes, esperaba mas de 50000`);

  await anon.close();
  const abiertos = await prisma.evento.count({ where: { prospectoId: prueba.id, tipo: "abierto" } });
  if (abiertos !== 1) errores.push(`eventos abierto: ${abiertos}, esperaba 1`);
  await pg.goto(`${BASE}/p/${prueba.codigo}`);
  if ((await prisma.evento.count({ where: { prospectoId: prueba.id, tipo: "abierto" } })) !== 1) errores.push("con sesion tambien registro abierto");

  // 5. Seguimiento: forzar fecha de hoy y ver la tarjeta en Hoy
  await prisma.prospecto.update({ where: { id: prueba.id }, data: { proximoSeguimiento: "2000-01-01" } });
  await pg.goto(`${BASE}/hoy`);
  await pg.locator("article", { hasText: nombre }).getByText("abrió la propuesta").waitFor();
  await pg.screenshot({ path: "capturas/05-seguimiento.png", fullPage: true });

  // 6. Prospectos y Ajustes cargan
  await pg.goto(`${BASE}/prospectos?q=PRUEBA`); await pg.getByText(nombre).waitFor(); await pg.screenshot({ path: "capturas/06-prospectos.png" });
  await pg.goto(`${BASE}/ajustes`); await pg.getByText("Usuarios").waitFor(); await pg.screenshot({ path: "capturas/07-ajustes.png", fullPage: true });

  // 7. Codigo invalido: 404
  esperando404 = true;
  const r404 = await pg.goto(`${BASE}/p/no-existe`);
  if (r404?.status() !== 404) errores.push(`codigo invalido dio ${r404?.status()}`);
} catch (e) {
  errores.push(`excepcion: ${(e as Error).message}`);
  await pg.screenshot({ path: "capturas/error.png", fullPage: true }).catch(() => {});
} finally {
  await b.close();
  // Limpieza: el prospecto de prueba se descarta con motivo (nada se borra), salvo que se
  // prefiera borrarlo del todo por ser de prueba: aqui SI se borra, es basura de verificacion.
  await prisma.evento.deleteMany({ where: { prospectoId: prueba.id } });
  await prisma.prospecto.delete({ where: { id: prueba.id } });
  await prisma.$disconnect();
}
console.log(errores.length ? `FALLO:\n- ${errores.join("\n- ")}` : "PASS: recorrido completo sin errores");
process.exit(errores.length ? 1 : 0);
