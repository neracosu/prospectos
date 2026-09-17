// scripts/capturas-panel.mts — capturas a 390 px de las pantallas del panel con datos de prueba realistas,
// para comparar antes y despues de un cambio visual (pasada de UX). Siembra lo suyo con la marca (PRUEBA),
// entra con un dueno temporal y al terminar borra todo lo que creo.
// SOLO contra el servidor de desarrollo del clon con la base de tests (mismas guardas que el recorrido del portal).
// Uso (desde el clon, con su next dev en 3014):
//   DATABASE_URL="$TEST_DATABASE_URL" BASE_URL=http://127.0.0.1:3014 npx tsx scripts/capturas-panel.mts capturas/ux-antes
import { mkdirSync } from "node:fs";
import bcrypt from "bcryptjs";
import { chromium } from "playwright";
import { prisma } from "../src/lib/db";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3014";
const SALIDA = process.argv[2] ?? "capturas/ux";
if (!(process.env.DATABASE_URL ?? "").includes("prospectos_test")) { console.error("ALTO: DATABASE_URL no es la base de tests."); process.exit(2); }
if (/neracosu\.com|:3013(\/|$)/.test(BASE)) { console.error("ALTO: BASE_URL apunta a produccion. Usa el servidor de desarrollo del clon."); process.exit(2); }

mkdirSync(SALIDA, { recursive: true });
const sello = Date.now();
const marca = `(PRUEBA) ${sello}`;
const PIN_PANEL = "739104";
const codigoDe = (semilla: string) => (semilla + "x".repeat(22)).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 22);
const hoy = new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10);
const dia = (n: number) => { const d = new Date(`${hoy}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const errores: string[] = [];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const mesEnLetras = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const creado = { prospectos: [] as number[], clientes: [] as number[], duenoId: 0, nichoId: 0, nichoPropio: false };

const b = await chromium.launch();
try {
  let nicho = await prisma.nicho.findFirst({ where: { slug: "hoteles" } });
  if (!nicho) { nicho = await prisma.nicho.create({ data: { slug: "hoteles", nombre: "Hoteles", mensajeInicial: "Buenas, equipo de {nombre}. Les comparto una propuesta: {enlace}", mensajeSeguimiento: "Hola de nuevo, {nombre}. ¿Pudieron ver la propuesta? {enlace}", diasSeguimiento: 3 } }); creado.nichoPropio = true; }
  creado.nichoId = nicho.id;
  const prospecto = (nombre: string, ciudad: string, extra: Record<string, unknown>) => prisma.prospecto.create({ data: {
    nichoId: nicho!.id, nombre: `${nombre} ${marca}`, ciudad, fuentes: ["https://ejemplo.test/"], codigo: codigoDe(`p${sello}${nombre}`),
    clave: `${nombre}|${ciudad}|${sello}`.toLowerCase().replace(/[^a-z0-9|]/g, ""), ...extra } });
  const cola = [
    await prospecto("Hotel Yare", "Caracas", { whatsapp: "584121112233", telefono: "02125551122", email: "reservas@yare.test", instagram: "hotelyare", tamano: "48 habitaciones", nota: "Responden rápido por WhatsApp en las mañanas.", ordenCola: 1 }),
    await prospecto("Posada El Morro", "Lechería", { telefono: "02815554433", email: "info@elmorro.test", ordenCola: 2 }),
    await prospecto("Hotel Gran Sabana Suites y Centro de Convenciones", "Puerto Ordaz", { instagram: "gransabanasuites", ordenCola: 3 }),
  ];
  const seguimiento = [
    await prospecto("Hotel Ávila Real", "Caracas", { whatsapp: "584143334455", etapa: "enviado", proximoSeguimiento: dia(-1) }),
    await prospecto("Hotel Costa Azul", "Valencia", { whatsapp: "584245556677", etapa: "enviado", proximoSeguimiento: hoy }),
  ];
  const otros = [
    await prospecto("Hotel Mirador", "Mérida", { whatsapp: "584167778899", etapa: "respondio" }),
    await prospecto("Hotel Bella Vista", "Maracay", { etapa: "descartado" }),
  ];
  creado.prospectos.push(...[...cola, ...seguimiento, ...otros].map((p) => p.id));
  const dueno = await prisma.usuario.create({ data: { nombre: `Dueño ${marca}`, rol: "dueno", pinHash: await bcrypt.hash(PIN_PANEL, 10), metaDiaria: 10 } });
  creado.duenoId = dueno.id;
  await prisma.evento.create({ data: { prospectoId: seguimiento[0].id, usuarioId: dueno.id, tipo: "enviado", canal: "whatsapp" } });
  await prisma.evento.create({ data: { prospectoId: seguimiento[1].id, usuarioId: dueno.id, tipo: "abierto" } });
  const cliente = await prisma.cliente.create({ data: { nombre: `Hotel Valle Arriba ${marca}`, contactoNombre: "Ana Pérez", whatsapp: "584129990000", rif: "J-40123456-7", email: "gerencia@vallearriba.test", codigo: codigoDe(`c${sello}`) } });
  creado.clientes.push(cliente.id);
  const pms = await prisma.proyecto.create({ data: { clienteId: cliente.id, nichoId: nicho.id, nombre: "PMS Hotel", pagoUnico: "2800.00", mensualidad: "100.00", horasCotizadas: "160", fechaInicio: dia(-90), estado: "activo", diaCobroMensual: 5 } });
  await prisma.proyecto.create({ data: { clienteId: cliente.id, nichoId: nicho.id, nombre: "Módulo de reservas en línea", pagoUnico: "900.00", mensualidad: "0", fechaInicio: dia(-10), estado: "en_construccion" } });
  await prisma.cobro.createMany({ data: [
    { proyectoId: pms.id, concepto: "cuota", detalle: "Cuota 3 de 3", monto: "933.34", vence: dia(-60), pagadoEn: new Date(Date.now() - 60 * 86400_000), canal: "pago_movil", referencia: "00123456" },
    { proyectoId: pms.id, concepto: "mensualidad", detalle: `Mensualidad de ${mesEnLetras(dia(-40))}`, mes: dia(-40).slice(0, 7), monto: "100.00", vence: dia(-12) },
    { proyectoId: pms.id, concepto: "mensualidad", detalle: `Mensualidad de ${mesEnLetras(hoy)}`, mes: hoy.slice(0, 7), monto: "100.00", vence: dia(4) },
    { proyectoId: pms.id, concepto: "extra", detalle: "Módulo de reportes de ocupación", monto: "150.50", vence: dia(20) },
  ] });
  await prisma.pendiente.createMany({ data: [
    { proyectoId: pms.id, texto: "Recepción y habitaciones", visibleCliente: true, hecho: true, hechoEn: new Date(), fechaEstimada: dia(-30), orden: 1 },
    { proyectoId: pms.id, texto: "Conexión con el punto de venta del restaurante", visibleCliente: true, hecho: false, fechaEstimada: dia(15), orden: 2 },
    { proyectoId: pms.id, texto: "Refactor del cierre de caja", visibleCliente: false, hecho: false, orden: 3 },
  ] });
  const v = await prisma.version.create({ data: { proyectoId: pms.id, version: "1.4.2", fecha: dia(-8) } });
  await prisma.cambio.createMany({ data: [{ versionId: v.id, tipo: "nuevo", texto: "Reporte semanal de ocupación.", orden: 0 }, { versionId: v.id, tipo: "arreglo", texto: "El cierre de caja ya no duplica los pagos en Zelle.", orden: 1 }] });
  await prisma.horas.create({ data: { proyectoId: pms.id, fecha: dia(-2), horas: "3.50", descripcion: "Reporte de ocupación", usuarioId: dueno.id } });

  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
  await pg.goto(`${BASE}/entrar`);
  await pg.screenshot({ path: `${SALIDA}/00-entrar.png` });
  for (const d of PIN_PANEL) await pg.getByRole("button", { name: d, exact: true }).click();
  await pg.waitForURL(/\/hoy$/);
  const pantallas: [string, string][] = [
    ["01-hoy", "/hoy"], ["02-prospectos", "/prospectos"], ["03-prospecto", `/prospectos/${cola[0].id}`], ["04-proyectos", "/proyectos"],
    ["05-proyecto-cobros", `/proyectos/${pms.id}?t=cobros`], ["06-proyecto-pendientes", `/proyectos/${pms.id}?t=pendientes`],
    ["07-proyecto-versiones", `/proyectos/${pms.id}?t=versiones`], ["08-proyecto-documentos", `/proyectos/${pms.id}?t=documentos`],
    ["09-cliente", `/clientes/${cliente.id}`], ["10-buscar", "/buscar"], ["11-ajustes", "/ajustes"], ["12-prospecto-nuevo", "/prospectos/nuevo"],
  ];
  for (const [nombre, ruta] of pantallas) {
    await pg.goto(`${BASE}${ruta}`, { waitUntil: "networkidle" });
    const ancho = await pg.evaluate(() => document.documentElement.scrollWidth);
    if (ancho > 390) errores.push(`scroll horizontal en ${ruta}: ${ancho}px`);
    // Primera pantalla (lo que se ve sin desplazar) y pagina completa.
    await pg.screenshot({ path: `${SALIDA}/${nombre}.png` });
    await pg.screenshot({ path: `${SALIDA}/${nombre}-completa.png`, fullPage: true });
  }
  // Las acciones secundarias detras de «···» (si la pantalla ya las tiene): Hoy y los cobros de un proyecto.
  for (const [nombre, ruta] of [["01b-hoy-mas-acciones", "/hoy"], ["05b-cobros-mas-acciones", `/proyectos/${pms.id}?t=cobros`], ["06b-pendientes-mas-acciones", `/proyectos/${pms.id}?t=pendientes`]] as const) {
    await pg.goto(`${BASE}${ruta}`, { waitUntil: "networkidle" });
    const mas = pg.locator("button.boton--mas");
    if (await mas.count()) { await mas.nth(ruta === "/hoy" ? 2 : 1).click(); await pg.screenshot({ path: `${SALIDA}/${nombre}.png`, fullPage: true }); }
  }
  // La pregunta «¿Se envio?» de la cola: se abre tocando el primer canal (el enlace externo no se sigue).
  await pg.goto(`${BASE}/hoy`, { waitUntil: "networkidle" });
  await ctx.route(/wa\.me|api\.whatsapp\.com/, (r) => r.abort());
  const tarjeta = pg.locator("article", { hasText: "Hotel Yare" }).first();
  await tarjeta.getByRole("link", { name: /WhatsApp/ }).first().click({ modifiers: [], noWaitAfter: true }).catch(() => {});
  await pg.bringToFront();
  await pg.waitForTimeout(400);
  await pg.screenshot({ path: `${SALIDA}/13-hoy-se-envio.png` });
} catch (e) {
  errores.push(`excepcion: ${(e as Error).message}`);
} finally {
  await b.close();
  for (const clienteId of creado.clientes) {
    const pids = (await prisma.proyecto.findMany({ where: { clienteId }, select: { id: true } })).map((p) => p.id);
    await prisma.evento.deleteMany({ where: { OR: [{ proyectoId: { in: pids } }, { clienteId }] } });
    await prisma.cambio.deleteMany({ where: { version: { proyectoId: { in: pids } } } });
    await prisma.version.deleteMany({ where: { proyectoId: { in: pids } } });
    await prisma.horas.deleteMany({ where: { proyectoId: { in: pids } } });
    await prisma.pendiente.deleteMany({ where: { proyectoId: { in: pids } } });
    await prisma.documento.deleteMany({ where: { proyectoId: { in: pids } } });
    await prisma.cobro.deleteMany({ where: { proyectoId: { in: pids } } });
    await prisma.proyecto.deleteMany({ where: { id: { in: pids } } });
    await prisma.cliente.delete({ where: { id: clienteId } });
  }
  await prisma.evento.deleteMany({ where: { prospectoId: { in: creado.prospectos } } });
  await prisma.prospecto.deleteMany({ where: { id: { in: creado.prospectos } } });
  if (creado.duenoId) { await prisma.evento.deleteMany({ where: { usuarioId: creado.duenoId } }); await prisma.usuario.delete({ where: { id: creado.duenoId } }).catch((e) => errores.push(`LIMPIEZA: quedo el dueno temporal ${creado.duenoId} en la base de tests: ${(e as Error).message}`)); }
  if (creado.nichoPropio) await prisma.nicho.delete({ where: { id: creado.nichoId } }).catch((e) => errores.push(`LIMPIEZA: quedo el nicho ${creado.nichoId}: ${(e as Error).message}`));
  await prisma.$disconnect();
}
console.log(errores.length ? `CON ERRORES:\n- ${errores.join("\n- ")}` : `LISTO: capturas en ${SALIDA}`);
process.exit(errores.length ? 1 : 0);
