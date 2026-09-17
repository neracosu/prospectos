// scripts/verificar-flujo-buscar.mts — recorrido real de /buscar (pieza 2) en el navegador, 390x844.
// Pega tres filas, revisa la bandeja, corrige una, aprueba las nuevas y descarta la repetida.
// Uso: set -a; . ~/.config/prospectos/env; set +a
//      BASE_URL=https://prospectos.neracosu.com npx tsx scripts/verificar-flujo-buscar.mts <<< "PIN"
//
// Nada de lo que crea queda: los prospectos "(PRUEBA)" se borran con sus eventos y las filas
// Revision del lote tambien (son basura de verificacion, no historia). Si el nicho "hoteles" o
// "Hotel Yare" no estan en la base contra la que corre, los crea al empezar y SOLO entonces los
// borra al final: asi el recorrido no depende de ningun estado previo salvo el usuario para entrar.
import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { prisma } from "../src/lib/db";
import { claveProspecto } from "../src/lib/clave-prospecto";
import { generarCodigo } from "../src/lib/codigo";

const BASE = process.env.BASE_URL ?? "https://prospectos.neracosu.com";
const pin = readFileSync(0, "utf8").trim();
mkdirSync("capturas", { recursive: true });
const errores: string[] = [];
const avisos: string[] = [];
// Marca unica: identifica las dos filas nuevas, los dos prospectos que salgan de
// aprobarlas y, por su JSON, el lote entero a la hora de limpiar.
const marca = `(PRUEBA) ${Date.now()}`;
const NOMBRE_NUEVO = `Hotel ${marca}`;
const NOMBRE_SIN_CIUDAD = `Sin Ciudad ${marca}`;
// El repetido tiene que ser uno que YA exista: mismo nombre y misma ciudad que el
// cargado en produccion, porque la clave de duplicado se arma con los dos.
const YARE = { nombre: "Hotel Yare", ciudad: "Caracas (Sabana Grande)" };
const CAPTURA = (paso: string) => `capturas/buscar-${paso}.png`;

// --- Preparacion: nicho y repetido ---------------------------------------
let nicho = await prisma.nicho.findUnique({ where: { slug: "hoteles" } });
let nichoCreado = false;
if (!nicho) {
  nicho = await prisma.nicho.create({
    data: {
      slug: "hoteles", nombre: "Hoteles", plantillaPropuesta: "hoteles", diasSeguimiento: 3,
      mensajeInicial: "Buenas, equipo de {nombre}. Propuesta: {enlace}",
      mensajeSeguimiento: "Hola de nuevo, {nombre}. ¿Pudiste verla? {enlace}",
    },
  });
  nichoCreado = true;
  avisos.push('el nicho "hoteles" no estaba: se creó para el recorrido y se borró al terminar');
}
const claveYare = claveProspecto(YARE.nombre, YARE.ciudad);
let yare = await prisma.prospecto.findUnique({ where: { nichoId_clave: { nichoId: nicho.id, clave: claveYare } } });
let yareCreado = false;
if (!yare) {
  yare = await prisma.prospecto.create({
    data: {
      nichoId: nicho.id, nombre: YARE.nombre, ciudad: YARE.ciudad, estado: "Distrito Capital",
      telefono: "02127930708", web: "https://www.hotelyare.com.ve/",
      fuentes: ["https://www.hotelyare.com.ve/"], origen: "manual",
      codigo: generarCodigo(), clave: claveYare,
    },
  });
  yareCreado = true;
  avisos.push(`"${YARE.nombre}" no estaba en esta base: se creó para probar el repetido y se borró al terminar`);
}
// Prospecto no tiene updatedAt: para saber que descartar la fila repetida no lo
// toco se compara la fila COMPLETA (y cuantos eventos tenia) antes y despues.
const yareAntes = JSON.stringify(await prisma.prospecto.findUniqueOrThrow({ where: { id: yare.id } }));
const eventosYareAntes = await prisma.evento.count({ where: { prospectoId: yare.id } });

const TABLA = [
  "nombre\tciudad\tnicho\twhatsapp",
  `${NOMBRE_NUEVO}\tCaracas\thoteles\t0412 000 00 00`,
  `${YARE.nombre}\t${YARE.ciudad}\thoteles\t`,
  `${NOMBRE_SIN_CIUDAD}\t\thoteles\t`,
].join("\n");

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const pg = await ctx.newPage();
pg.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
pg.on("console", (m) => { if (m.type() === "error") errores.push(`console: ${m.text()}`); });

// Cada fila es un <article>; el nombre alcanza para dar con el suyo.
const tarjeta = (nombre: string) => pg.locator("article", { hasText: nombre }).first();
const etiquetaDe = async (nombre: string) => (await tarjeta(nombre).locator(".etiqueta").first().innerText()).trim();
// Los textos exactos son los de src/componentes/Bandeja.tsx (ESTADO), no los del plan.
const debeDecir = async (nombre: string, esperado: string) => {
  const visto = await etiquetaDe(nombre);
  if (visto !== esperado) errores.push(`«${nombre}» dice «${visto}», esperaba «${esperado}»`);
};

let lote = "";
try {
  // 1. Entrar
  await pg.goto(`${BASE}/entrar`);
  for (const d of pin) await pg.getByRole("button", { name: d, exact: true }).click();
  await pg.waitForURL(/\/hoy$/);

  // 2. Pegar las tres filas
  await pg.goto(`${BASE}/buscar?t=importar`);
  await pg.getByText("O pegar filas desde Excel").waitFor();
  await pg.screenshot({ path: CAPTURA("01-importar"), fullPage: true });
  await pg.locator('textarea[name="texto"]').fill(TABLA);
  await pg.getByRole("button", { name: "Revisar las filas" }).click();

  // 3. El resumen: una nueva, una que ya estaba y una con problema
  await pg.getByText("3 fichas encontradas").waitFor({ timeout: 30_000 });
  for (const t of ["Nuevas", "Ya estaban", "Con problemas"]) {
    if (!(await pg.getByText(t, { exact: true }).count())) errores.push(`el resumen no dice «${t}»`);
  }
  await pg.screenshot({ path: CAPTURA("02-resumen"), fullPage: true });

  // 4. A la bandeja
  await pg.getByRole("link", { name: "Revisar en la bandeja" }).click();
  await pg.waitForURL(/t=bandeja&lote=/);
  lote = new URL(pg.url()).searchParams.get("lote") ?? "";
  if (!lote) errores.push("la bandeja abrió sin lote en la URL");
  await tarjeta(NOMBRE_NUEVO).waitFor();
  await pg.screenshot({ path: CAPTURA("03-bandeja"), fullPage: true });

  // 5. Las tres etiquetas
  await debeDecir(NOMBRE_NUEVO, "Nuevo");
  await debeDecir(YARE.nombre, "Ya existe");
  await debeDecir(NOMBRE_SIN_CIUDAD, "Con problema");
  const filaRepetida = await prisma.revision.findFirst({ where: { lote, fila: 2 } });
  if (filaRepetida?.existenteId !== yare.id) {
    errores.push(`la fila repetida apunta a ${filaRepetida?.existenteId}, esperaba ${yare.id} (Hotel Yare)`);
  }

  // 6. Corregir la de error: le falta la ciudad
  const conProblema = tarjeta(NOMBRE_SIN_CIUDAD);
  await conProblema.getByRole("button", { name: "Corregir" }).click();
  await conProblema.locator('input[name="ciudad"]').fill("Mérida");
  await pg.screenshot({ path: CAPTURA("04-corregir"), fullPage: true });
  await conProblema.getByRole("button", { name: "Guardar y revisar" }).click();
  await tarjeta(NOMBRE_SIN_CIUDAD).locator(".etiqueta--nuevo").waitFor({ timeout: 30_000 });
  await pg.screenshot({ path: CAPTURA("05-corregida"), fullPage: true });

  // 7. Aprobar las dos nuevas de un tiron
  const aprobar = pg.getByRole("button", { name: "Aprobar las 2 nuevas" });
  await aprobar.waitFor({ timeout: 30_000 });
  await aprobar.click();
  for (const n of [NOMBRE_NUEVO, NOMBRE_SIN_CIUDAD]) {
    await tarjeta(n).locator(".etiqueta--aprobado").waitFor({ timeout: 60_000 });
  }
  await pg.screenshot({ path: CAPTURA("06-aprobadas"), fullPage: true });

  // 8. En la base: dos prospectos importados, cada uno con su evento
  const creados = await prisma.prospecto.findMany({
    where: { nombre: { contains: marca } }, include: { eventos: true }, orderBy: { id: "asc" },
  });
  if (creados.length !== 2) errores.push(`prospectos (PRUEBA) creados: ${creados.length}, esperaba 2`);
  for (const p of creados) {
    if (p.origen !== "importado") errores.push(`«${p.nombre}» quedó con origen «${p.origen}», esperaba «importado»`);
    const ev = p.eventos.filter((e) => e.tipo === "importado");
    if (ev.length !== 1) errores.push(`«${p.nombre}» tiene ${ev.length} eventos «importado», esperaba 1`);
    else if (!ev[0].texto.includes(lote)) errores.push(`el evento de «${p.nombre}» no nombra el lote: ${ev[0].texto}`);
  }
  const corregido = creados.find((p) => p.nombre === NOMBRE_SIN_CIUDAD);
  if (corregido?.ciudad !== "Mérida") errores.push(`la fila corregida entró con ciudad «${corregido?.ciudad}», esperaba «Mérida»`);

  // 9. Descartar la repetida: el prospecto que ya existia no se toca
  const repetida = tarjeta(YARE.nombre);
  await repetida.getByRole("button", { name: "Descartar" }).click();
  await tarjeta(YARE.nombre).locator(".etiqueta--descartado").waitFor({ timeout: 30_000 });
  await pg.screenshot({ path: CAPTURA("07-descartada"), fullPage: true });
  const yareDespues = JSON.stringify(await prisma.prospecto.findUniqueOrThrow({ where: { id: yare.id } }));
  if (yareDespues !== yareAntes) errores.push(`${YARE.nombre} cambió al descartar la fila:\n  antes:  ${yareAntes}\n  después: ${yareDespues}`);
  const eventosYareDespues = await prisma.evento.count({ where: { prospectoId: yare.id } });
  if (eventosYareDespues !== eventosYareAntes) {
    errores.push(`${YARE.nombre} pasó de ${eventosYareAntes} a ${eventosYareDespues} eventos: descartar no debe escribirle nada`);
  }

  // 10. La plantilla de Excel se descarga (misma sesion del navegador)
  const xlsx = await pg.request.get(`${BASE}/buscar/plantilla?formato=xlsx`);
  if (xlsx.status() !== 200) errores.push(`plantilla xlsx: status ${xlsx.status()}`);
  const tipo = xlsx.headers()["content-type"] ?? "";
  if (!tipo.includes("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")) {
    errores.push(`plantilla xlsx: content-type ${tipo}`);
  }
  const cuerpo = await xlsx.body().catch(() => Buffer.from(""));
  if (cuerpo.subarray(0, 2).toString("binary") !== "PK") errores.push("plantilla xlsx: el cuerpo no es un zip (.xlsx)");
} catch (e) {
  errores.push(`excepcion: ${(e as Error).message}`);
  await pg.screenshot({ path: CAPTURA("error"), fullPage: true }).catch(() => {});
} finally {
  await b.close();
  // --- Limpieza -----------------------------------------------------------
  // Va en finally y aguanta un recorrido a medias: el lote se busca por el nombre
  // unico ademas de por la URL, porque si algo revento antes de abrir la bandeja
  // las filas Revision ya estaban creadas.
  try {
    const lotes = new Set<string>(lote ? [lote] : []);
    const hallados = await prisma.$queryRaw<{ lote: string }[]>`
      SELECT DISTINCT lote FROM Revision WHERE JSON_UNQUOTE(JSON_EXTRACT(datos, '$.nombre')) LIKE ${`%${marca}%`}`;
    for (const h of hallados) lotes.add(h.lote);
    const prueba = await prisma.prospecto.findMany({ where: { nombre: { contains: marca } }, select: { id: true } });
    const ids = prueba.map((p) => p.id);
    if (yareCreado) ids.push(yare.id);
    // Las filas Revision apuntan a Prospecto: primero ellas, despues los eventos y el prospecto.
    if (lotes.size) await prisma.revision.deleteMany({ where: { lote: { in: [...lotes] } } });
    if (ids.length) {
      await prisma.revision.deleteMany({ where: { existenteId: { in: ids } } });
      await prisma.evento.deleteMany({ where: { prospectoId: { in: ids } } });
      await prisma.prospecto.deleteMany({ where: { id: { in: ids } } });
    }
    if (nichoCreado) await prisma.nicho.deleteMany({ where: { id: nicho.id } });
  } catch (e) {
    errores.push(`limpieza: ${(e as Error).message}`);
  }
  await prisma.$disconnect();
}
for (const a of avisos) console.log(`Aviso: ${a}`);
console.log(errores.length ? `FALLO:\n- ${errores.join("\n- ")}` : "PASS: recorrido de /buscar sin errores");
process.exit(errores.length ? 1 : 0);
