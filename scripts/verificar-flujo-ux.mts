// scripts/verificar-flujo-ux.mts — recorrido real a 390 px de la fase B de la pasada de UX: que cada toque se vea
// al instante (con la respuesta del servidor RETENIDA a proposito), que «Deshacer» deshaga de verdad en la base,
// que «¿Se envio?» sobreviva a una recarga, y que despues de una accion no haya un segundo viaje a la misma ruta.
// Siembra lo suyo con la marca (PRUEBA), entra con un dueno temporal y al terminar borra todo lo que creo.
// SOLO contra el servidor de desarrollo del clon con la base de tests (mismas guardas que capturas-panel.mts).
// Uso (desde el clon, con su next dev en 3014):
//   DATABASE_URL="$TEST_DATABASE_URL" BASE_URL=http://127.0.0.1:3014 npx tsx scripts/verificar-flujo-ux.mts
import bcrypt from "bcryptjs";
import { chromium, type Locator, type Page } from "playwright";
import { prisma } from "../src/lib/db";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3014";
if (!(process.env.DATABASE_URL ?? "").includes("prospectos_test")) { console.error("ALTO: DATABASE_URL no es la base de tests."); process.exit(2); }
if (/neracosu\.com|:3013(\/|$)/.test(BASE)) { console.error("ALTO: BASE_URL apunta a produccion. Usa el servidor de desarrollo del clon."); process.exit(2); }

const sello = Date.now();
const marca = `(PRUEBA) ${sello}`;
const PIN_PANEL = "582930";
// Lo que se retiene cada Server Action. Lo optimista tiene que verse MUCHO antes de esto.
const RETENCION_MS = 2000;
const INSTANTE_MS = 700;
const codigoDe = (semilla: string) => (semilla + "x".repeat(22)).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 22);
const hoy = new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10);
const dia = (n: number) => { const d = new Date(`${hoy}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const errores: string[] = [];
const pasos: string[] = [];
const creado = { prospectos: [] as number[], clienteId: 0, duenoId: 0, nichoId: 0, nichoPropio: false };
const revisar = (ok: boolean, que: string) => { (ok ? pasos : errores).push(que); };

// Cuanto tarda en cumplirse algo que deberia ser inmediato.
async function cuantoTarda(fn: () => Promise<unknown>): Promise<number> {
  const t = Date.now();
  await fn();
  return Date.now() - t;
}
const ordenDe = async (pg: Page, nombres: string[]) => {
  const titulos = await pg.locator("article.tarjeta b").allInnerTexts();
  return nombres.map((n) => titulos.findIndex((t) => t.includes(n)));
};

const b = await chromium.launch();
try {
  let nicho = await prisma.nicho.findFirst({ where: { slug: "hoteles" } });
  if (!nicho) { nicho = await prisma.nicho.create({ data: { slug: "hoteles", nombre: "Hoteles", mensajeInicial: "Buenas, equipo de {nombre}. Les comparto una propuesta: {enlace}", mensajeSeguimiento: "Hola de nuevo, {nombre}. ¿Pudieron ver la propuesta? {enlace}", diasSeguimiento: 3 } }); creado.nichoPropio = true; }
  creado.nichoId = nicho.id;
  const prospecto = (nombre: string, ciudad: string, extra: Record<string, unknown>) => prisma.prospecto.create({ data: {
    nichoId: nicho!.id, nombre: `${nombre} ${marca}`, ciudad, fuentes: ["https://ejemplo.test/"], codigo: codigoDe(`u${sello}${nombre}`),
    clave: `${nombre}|${ciudad}|${sello}`.toLowerCase().replace(/[^a-z0-9|]/g, ""), ...extra } });
  // La cola de Hoy ensena 10: si la base de tests trae otros por contactar delante, los de aca no se verian.
  const delante = await prisma.prospecto.count({ where: { etapa: "por_contactar", ordenCola: { lte: 3 } } });
  if (delante > 5) throw new Error(`la base de tests tiene ${delante} prospectos por contactar con ordenCola <= 3; limpiala antes de correr esto`);
  const yare = await prospecto("Hotel Yare", "Caracas", { whatsapp: "584121112233", ordenCola: 1 });
  const morro = await prospecto("Posada El Morro", "Lechería", { whatsapp: "584141112233", ordenCola: 2 });
  const sabana = await prospecto("Hotel Gran Sabana", "Puerto Ordaz", { whatsapp: "584161112233", ordenCola: 3 });
  creado.prospectos.push(yare.id, morro.id, sabana.id);
  const dueno = await prisma.usuario.create({ data: { nombre: `Dueño ${marca}`, rol: "dueno", pinHash: await bcrypt.hash(PIN_PANEL, 10), metaDiaria: 10 } });
  creado.duenoId = dueno.id;
  const cliente = await prisma.cliente.create({ data: { nombre: `Hotel Valle Arriba ${marca}`, contactoNombre: "Ana Pérez", whatsapp: "584129990000", codigo: codigoDe(`k${sello}`) } });
  creado.clienteId = cliente.id;
  const pms = await prisma.proyecto.create({ data: { clienteId: cliente.id, nichoId: nicho.id, nombre: "PMS Hotel", pagoUnico: "2800.00", mensualidad: "100.00", horasCotizadas: "160", fechaInicio: dia(-90), estado: "activo", diaCobroMensual: 5 } });
  const cobro = await prisma.cobro.create({ data: { proyectoId: pms.id, concepto: "extra", detalle: "Reportes de ocupación", monto: "150.50", vence: dia(-3) } });
  const pend = await prisma.pendiente.create({ data: { proyectoId: pms.id, texto: "Conexión con el punto de venta", visibleCliente: true, hecho: false, orden: 1 } });

  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.route(/wa\.me|api\.whatsapp\.com/, (r) => r.abort());
  // Se retiene cada Server Action: si la pantalla cambia antes de que llegue la respuesta, el cambio es optimista.
  let retener = 0;
  const origen = new URL(BASE).origin;
  await ctx.route((url) => url.origin === origen, async (route) => {
    const rq = route.request();
    if (retener && rq.method() === "POST" && rq.headers()["next-action"]) await new Promise((r) => setTimeout(r, retener));
    await route.continue();
  });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
  // El doble viaje que se quito: un GET de RSC a la MISMA ruta justo despues de una accion.
  let ultimaAccion = 0;
  const dobles: string[] = [];
  pg.on("request", (rq) => {
    const url = new URL(rq.url());
    if (rq.method() === "POST" && rq.headers()["next-action"]) ultimaAccion = Date.now();
    else if (rq.method() === "GET" && url.searchParams.has("_rsc") && url.pathname === new URL(pg.url()).pathname && Date.now() - ultimaAccion < 3000 + retener) dobles.push(url.pathname);
  });
  const flotante = pg.locator(".flotante");

  await pg.goto(`${BASE}/entrar`);
  for (const d of PIN_PANEL) await pg.getByRole("button", { name: d, exact: true }).click();
  await pg.waitForURL(/\/hoy$/);
  await pg.waitForLoadState("networkidle");

  // 1. «¿Se envio?» sobrevive a una recarga y vuelve resaltada.
  const tarjetaYare = (): Locator => pg.locator("article", { hasText: `Hotel Yare ${marca}` });
  await tarjetaYare().getByRole("link", { name: /WhatsApp/ }).first().click({ noWaitAfter: true }).catch(() => {});
  for (const otra of ctx.pages()) if (otra !== pg) await otra.close().catch(() => {});
  await pg.bringToFront();
  await tarjetaYare().getByText("¿Se envió?").waitFor({ timeout: 5000 });
  await pg.reload({ waitUntil: "networkidle" });
  revisar(await tarjetaYare().locator(".pregunta--resaltada").getByText("¿Se envió?").isVisible().catch(() => false), "tras recargar, la tarjeta vuelve a preguntar «¿Se envió?» y resaltada");

  // 2. «Si»: con el servidor retenido, la tarjeta se va y el numero del dia sube al instante.
  const numero = async () => Number(await pg.locator(".dia__numero").innerText());
  const antes = await numero();
  retener = RETENCION_MS;
  await tarjetaYare().getByRole("button", { name: "Sí" }).click();
  const tSi = await cuantoTarda(() => tarjetaYare().waitFor({ state: "detached", timeout: RETENCION_MS - 200 })).catch(() => -1);
  revisar(tSi >= 0 && tSi < INSTANTE_MS, `la tarjeta enviada desaparece al instante (${tSi} ms, con el servidor retenido ${RETENCION_MS} ms)`);
  revisar((await numero()) === antes + 1, `el numero del dia sube al instante (${antes} -> ${antes + 1})`);
  await flotante.getByText(`Enviado a Hotel Yare ${marca}`).waitFor({ timeout: RETENCION_MS + 8000 });
  revisar((await numero()) === antes + 1, "con la respuesta del servidor el numero sigue en su sitio (no se cuenta dos veces)");
  revisar((await prisma.prospecto.findUniqueOrThrow({ where: { id: yare.id } })).etapa === "enviado", "el envio quedo guardado en la base");
  revisar((await tarjetaYare().count()) === 0, "la tarjeta enviada no reaparece");

  // 3. «Saltar» y «Deshacer»: vuelve a su lugar, delante de la que venia despues.
  const nombres = [`Posada El Morro ${marca}`, `Hotel Gran Sabana ${marca}`];
  await pg.locator("article", { hasText: nombres[0] }).getByRole("button", { name: "Saltar" }).click();
  const tSaltar = await cuantoTarda(() => pg.locator("article", { hasText: nombres[0] }).waitFor({ state: "detached", timeout: RETENCION_MS - 200 })).catch(() => -1);
  revisar(tSaltar >= 0 && tSaltar < INSTANTE_MS, `la tarjeta saltada se va al instante (${tSaltar} ms)`);
  await flotante.getByText(`Saltaste a ${nombres[0]}`).waitFor({ timeout: RETENCION_MS + 8000 });
  const ordenSaltado = (await prisma.prospecto.findUniqueOrThrow({ where: { id: morro.id } })).ordenCola;
  revisar(ordenSaltado > 3, `el salto quedo guardado (ordenCola ${ordenSaltado})`);
  retener = 0;
  await flotante.getByRole("button", { name: "Deshacer" }).click();
  await flotante.getByText("Volvió a su lugar en la cola").waitFor({ timeout: 10000 });
  revisar((await prisma.prospecto.findUniqueOrThrow({ where: { id: morro.id } })).ordenCola === 2, "Deshacer repuso el orden en la base");
  await pg.locator("article", { hasText: nombres[0] }).waitFor({ timeout: 5000 });
  const [iMorro, iSabana] = await ordenDe(pg, nombres);
  revisar(iMorro >= 0 && iMorro < iSabana, `la tarjeta volvio delante de la siguiente (posiciones ${iMorro} y ${iSabana})`);

  // 4. Cobros: pagado al instante, sin recibo mientras es provisional; «Deshacer» lo deja por cobrar.
  await pg.goto(`${BASE}/proyectos/${pms.id}?t=cobros`, { waitUntil: "networkidle" });
  const fila = pg.locator(".cobro", { hasText: "Reportes de ocupación" });
  await fila.getByRole("button", { name: "Marcar pagado" }).click();
  retener = RETENCION_MS;
  await fila.getByRole("button", { name: "Confirmar" }).click();
  const tPago = await cuantoTarda(() => fila.locator(".etiqueta--pagado").waitFor({ timeout: RETENCION_MS - 200 })).catch(() => -1);
  revisar(tPago >= 0 && tPago < INSTANTE_MS, `el cobro pasa a «Pagado» al instante (${tPago} ms)`);
  revisar(await fila.evaluate((e) => e.classList.contains("cobro--provisional")).catch(() => false), "mientras el servidor no confirma, la fila es provisional (sin recibo)");
  await flotante.getByText("Pagado $150,50").waitFor({ timeout: RETENCION_MS + 8000 });
  revisar((await prisma.cobro.findUniqueOrThrow({ where: { id: cobro.id } })).pagadoEn !== null, "el pago quedo guardado en la base");
  revisar(!(await fila.evaluate((e) => e.classList.contains("cobro--provisional"))), "confirmado por el servidor, la fila deja de ser provisional");
  retener = 0;
  await flotante.getByRole("button", { name: "Deshacer" }).click();
  await flotante.getByText("Pago deshecho").waitFor({ timeout: 10000 });
  revisar((await prisma.cobro.findUniqueOrThrow({ where: { id: cobro.id } })).pagadoEn === null, "Deshacer dejo el cobro sin pagar en la base");
  await fila.getByRole("button", { name: "Marcar pagado" }).waitFor({ timeout: 5000 });
  revisar(true, "la fila vuelve a ofrecer «Marcar pagado»");

  // 5. Pendientes: la casilla y el avance al instante; «Deshacer» la desmarca.
  await pg.goto(`${BASE}/proyectos/${pms.id}?t=pendientes`, { waitUntil: "networkidle" });
  const casilla = pg.getByRole("checkbox", { name: "Conexión con el punto de venta" });
  retener = RETENCION_MS;
  await casilla.click();
  const tHecho = await cuantoTarda(() => pg.getByText("Avance visible: 100 %").waitFor({ timeout: RETENCION_MS - 200 })).catch(() => -1);
  revisar(tHecho >= 0 && tHecho < INSTANTE_MS, `la casilla y el avance cambian al instante (${tHecho} ms)`);
  await flotante.getByText("Hecho: Conexión con el punto de venta").waitFor({ timeout: RETENCION_MS + 8000 });
  revisar((await prisma.pendiente.findUniqueOrThrow({ where: { id: pend.id } })).hecho, "el pendiente quedo hecho en la base");
  retener = 0;
  await flotante.getByRole("button", { name: "Deshacer" }).click();
  await flotante.getByText("Volvió a pendiente").waitFor({ timeout: 10000 });
  revisar(!(await prisma.pendiente.findUniqueOrThrow({ where: { id: pend.id } })).hecho, "Deshacer lo dejo sin hacer en la base");
  revisar(!(await casilla.isChecked()), "la casilla vuelve a estar desmarcada");

  // 6. La linea flotante se va sola y no tapa la barra.
  await flotante.waitFor({ state: "detached", timeout: 8000 }).then(() => revisar(true, "la linea flotante se va sola"), () => revisar(false, "la linea flotante no se fue sola en 8 s"));
  const ancho = await pg.evaluate(() => document.documentElement.scrollWidth);
  revisar(ancho <= 390, `sin scroll horizontal a 390 px (${ancho}px)`);
  revisar(dobles.length === 0, `sin segundo viaje a la misma ruta despues de una accion${dobles.length ? ` (hubo ${dobles.length}: ${[...new Set(dobles)].join(", ")})` : ""}`);
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
  await prisma.evento.deleteMany({ where: { prospectoId: { in: creado.prospectos } } });
  await prisma.prospecto.deleteMany({ where: { id: { in: creado.prospectos } } });
  if (creado.duenoId) { await prisma.evento.deleteMany({ where: { usuarioId: creado.duenoId } }); await prisma.usuario.delete({ where: { id: creado.duenoId } }).catch((e) => errores.push(`LIMPIEZA: quedo el dueno temporal ${creado.duenoId}: ${(e as Error).message}`)); }
  if (creado.nichoPropio) await prisma.nicho.delete({ where: { id: creado.nichoId } }).catch((e) => errores.push(`LIMPIEZA: quedo el nicho ${creado.nichoId}: ${(e as Error).message}`));
  await prisma.$disconnect();
}
for (const p of pasos) console.log(`  ok  ${p}`);
console.log(errores.length ? `FALLA:\n- ${errores.join("\n- ")}` : `PASA: ${pasos.length} comprobaciones de la fase B`);
process.exit(errores.length ? 1 : 0);
