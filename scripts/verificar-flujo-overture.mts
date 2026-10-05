// scripts/verificar-flujo-overture.mts — recorrido real a 390 px de «Buscar en el directorio abierto»: que los dos
// botones quepan, que el lote se cree con la fuente a la vista, que los selectores no se reinicien y que un nicho
// sin equivalencia lo diga. Siembra lo suyo, entra con un dueno temporal y al terminar borra lo que creo.
// SOLO contra el servidor de desarrollo del clon con la base de tests.
// Uso (desde el clon, con su next dev en 3014):
//   DATABASE_URL="$TEST_DATABASE_URL" BASE_URL=http://127.0.0.1:3014 npx tsx scripts/verificar-flujo-overture.mts
import bcrypt from "bcryptjs";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { prisma } from "../src/lib/db";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3014";
if (!(process.env.DATABASE_URL ?? "").includes("prospectos_test")) { console.error("ALTO: DATABASE_URL no es la base de tests."); process.exit(2); }
if (/neracosu\.com|:3013(\/|$)/.test(BASE)) { console.error("ALTO: BASE_URL apunta a produccion. Usa el servidor de desarrollo del clon."); process.exit(2); }

const sello = Date.now();
const marca = `(PRUEBA) ${sello}`;
const PIN_PANEL = "582931";
const errores: string[] = [];
const pasos: string[] = [];
const revisar = (ok: boolean, que: string) => { (ok ? pasos : errores).push(que); };
const creado = { duenoId: 0, nichos: [] as number[], lugares: [] as string[] };
const nichoDe = async (slug: string, nombre: string) => {
  const ya = await prisma.nicho.findFirst({ where: { slug } });
  if (ya) return ya;
  const n = await prisma.nicho.create({ data: { slug, nombre, mensajeInicial: "Hola {nombre}: {enlace}", mensajeSeguimiento: "Hola de nuevo {nombre}: {enlace}", plantillaPropuesta: slug, diasSeguimiento: 3 } });
  creado.nichos.push(n.id);
  return n;
};

mkdirSync("capturas/overture", { recursive: true });
const b = await chromium.launch();
try {
  if (await prisma.lugarOverture.count()) throw new Error("la tabla LugarOverture de la base de tests no esta vacia; limpiala antes de correr esto");
  const restaurantes = await nichoDe("restaurantes-y-bares", "Restaurantes y bares");
  const hoteles = await nichoDe("hoteles", "Hoteles");
  const base = { categoriaBase: "restaurant", categoriaFina: "venezuelan_restaurant", lat: 10.2469, lon: -67.5958, direccion: "Av. Bolívar", correos: "", webs: "", confianza: 0.9, publicacion: "2026-09-23.1" };
  const lugares = [
    { ...base, id: `prueba-${sello}-1`, nombre: `Arepera Uno ${marca}`, telefonos: "+584141234567", redes: `https://www.facebook.com/prueba${sello}a` },
    { ...base, id: `prueba-${sello}-2`, nombre: `Arepera Dos ${marca}`, telefonos: "", correos: "dos@gmail.com", redes: `https://www.facebook.com/prueba${sello}b` },
    { ...base, id: `prueba-${sello}-3`, nombre: `Arepera Muda ${marca}`, telefonos: "", redes: `https://www.facebook.com/prueba${sello}c` },
  ];
  await prisma.lugarOverture.createMany({ data: lugares });
  creado.lugares = lugares.map((l) => l.id);
  const dueno = await prisma.usuario.create({ data: { nombre: `Dueño ${marca}`, rol: "dueno", pinHash: await bcrypt.hash(PIN_PANEL, 10), metaDiaria: 10 } });
  creado.duenoId = dueno.id;

  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
  await pg.goto(`${BASE}/entrar`);
  for (const d of PIN_PANEL) await pg.getByRole("button", { name: d, exact: true }).click();
  await pg.waitForURL(/\/hoy$/);

  await pg.goto(`${BASE}/buscar?t=osm`);
  const nicho = pg.locator('select[name="nichoId"]');
  const ciudad = pg.locator('select[name="ciudad"]');
  const osm = pg.getByRole("button", { name: "Buscar en OpenStreetMap" });
  const directorio = pg.getByRole("button", { name: "Buscar en el directorio abierto" });
  await directorio.waitFor();
  revisar(await osm.isVisible(), "el boton de OpenStreetMap sigue ahi");
  const casilla = pg.getByRole("checkbox", { name: "Solo con teléfono o correo" });
  revisar(await casilla.isChecked(), "la casilla viene marcada");
  for (const boton of [osm, directorio]) {
    const caja = (await boton.boundingBox())!;
    revisar(caja.x >= 0 && caja.x + caja.width <= 390 && caja.height >= 44, `«${await boton.innerText()}» cabe y mide al menos 44 px de alto`);
  }
  await pg.screenshot({ path: "capturas/overture/01-formulario.png", fullPage: true });

  // Un nicho sin equivalencia: el boton se apaga y dice por que.
  await nicho.selectOption(String(hoteles.id));
  revisar(await directorio.isDisabled(), "con Hoteles (de paso) el boton del directorio se apaga");
  revisar((await pg.getByText("Este nicho no está en el directorio.").count()) === 1, "y dice por que");
  revisar(await osm.isEnabled(), "el de OpenStreetMap sigue activo");
  await pg.screenshot({ path: "capturas/overture/02-nicho-sin-directorio.png", fullPage: true });

  // La busqueda: con la casilla, dos de los tres.
  await nicho.selectOption(String(restaurantes.id));
  // Con un nicho que si esta, el renglon deja de dar el motivo y dice de cuando es el dato.
  revisar((await pg.getByText("Directorio del 23/09/2026").count()) === 1, "dice de cuando es el directorio");
  await ciudad.selectOption("maracay");
  await directorio.click();
  const resumen = pg.locator("section.tarjeta").filter({ hasText: "Se consultó" });
  await resumen.waitFor({ timeout: 10_000 });
  revisar((await resumen.innerText()).includes("Restaurantes y bares · Maracay · Directorio abierto"), "el resumen dice nicho, ciudad y fuente");
  revisar((await resumen.innerText()).includes("2 fichas encontradas"), "con la casilla entran las dos que tienen telefono o correo");
  revisar((await nicho.inputValue()) === String(restaurantes.id) && (await ciudad.inputValue()) === "maracay", "los selectores no se reinician");
  await pg.screenshot({ path: "capturas/overture/03-resumen.png", fullPage: true });
  const ancho = await pg.evaluate(() => document.documentElement.scrollWidth);
  revisar(ancho <= 390, `sin scroll horizontal a 390 px (${ancho}px)`);

  // En la bandeja el lote se llama «Directorio abierto».
  await resumen.getByRole("link", { name: "Revisar en la bandeja" }).click();
  await pg.waitForURL(/t=bandeja&lote=/);
  revisar((await pg.getByText("Directorio abierto").count()) >= 1, "la bandeja nombra el origen «Directorio abierto»");
  revisar((await pg.getByText(`Arepera Uno ${marca}`).count()) >= 1, "y trae la ficha");
  await pg.screenshot({ path: "capturas/overture/04-bandeja.png", fullPage: true });

  // De vuelta: recuerda donde iba. Sin la casilla entra la tercera (las otras dos ya estan pendientes).
  await pg.goto(`${BASE}/buscar?t=osm`);
  await directorio.waitFor();
  await pg.waitForFunction((v) => (document.querySelector('select[name="ciudad"]') as HTMLSelectElement | null)?.value === v, "maracay");
  revisar((await nicho.inputValue()) === String(restaurantes.id), "al volver de la bandeja recuerda el nicho");
  await casilla.uncheck();
  await directorio.click();
  await resumen.waitFor({ timeout: 10_000 });
  const texto = await resumen.innerText();
  revisar(/Nuevas\s*1/.test(texto) && /Ya estaban\s*2/.test(texto), "sin la casilla entra la que no tiene contacto y las otras dos ya estaban");
} catch (e) {
  errores.push(`excepcion: ${(e as Error).message}`);
} finally {
  await b.close();
  if (creado.duenoId) await prisma.revision.deleteMany({ where: { usuarioId: creado.duenoId } });
  await prisma.lugarOverture.deleteMany({ where: { id: { in: creado.lugares } } });
  if (creado.duenoId) await prisma.usuario.delete({ where: { id: creado.duenoId } }).catch((e) => errores.push(`LIMPIEZA: quedo el dueno temporal ${creado.duenoId}: ${(e as Error).message}`));
  for (const id of creado.nichos) await prisma.nicho.delete({ where: { id } }).catch((e) => errores.push(`LIMPIEZA: quedo el nicho ${id}: ${(e as Error).message}`));
  await prisma.$disconnect();
}
for (const p of pasos) console.log(`  ok  ${p}`);
console.log(errores.length ? `FALLA:\n- ${errores.join("\n- ")}` : `PASA: ${pasos.length} comprobaciones del directorio abierto`);
process.exit(errores.length ? 1 : 0);
