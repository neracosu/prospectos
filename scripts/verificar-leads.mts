// scripts/verificar-leads.mts — recorrido real de la fase 2 del panel CRM: /leads (chips en telefono, tablero en
// escritorio), «Mover a», /leads/nuevo, la ficha del lead, convertir una solicitud, Directorio y las redirecciones.
// Siembra con la marca (PRUEBA), entra con un dueno y un prospectador temporales y al terminar borra lo suyo.
// SOLO contra el servidor de desarrollo del clon con la base de tests.
// Uso (desde el repo, con el clon en 3021):
//   DATABASE_URL="$TEST_DATABASE_URL" BASE_URL=http://127.0.0.1:3021 npx tsx scripts/verificar-leads.mts [capturas/leads]
// Variables: SIN_FICHA=1 (hasta la tarea 5), SIN_DIRECTORIO=1 (hasta la tarea 6).
import { mkdirSync } from "node:fs";
import bcrypt from "bcryptjs";
import { chromium, type Browser, type Page } from "playwright";
import { prisma } from "../src/lib/db";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3021";
const SALIDA = process.argv[2] ?? "capturas/leads";
if (!(process.env.DATABASE_URL ?? "").includes("prospectos_test")) { console.error("ALTO: DATABASE_URL no es la base de tests."); process.exit(2); }
if (/neracosu\.com|:3013(\/|$)/.test(BASE)) { console.error("ALTO: BASE_URL apunta a produccion."); process.exit(2); }
mkdirSync(SALIDA, { recursive: true });

const sello = Date.now();
const marca = `(PRUEBA) ${sello}`;
const PIN_DUENO = "815206";
const PIN_PROSPECTADOR = "392714";
const hoy = new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10);
const dia = (n: number) => { const d = new Date(`${hoy}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const codigoDe = (s: string) => (s + "x".repeat(22)).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 22);
const errores: string[] = []; const pasos: string[] = [];
const revisar = (ok: boolean, que: string) => { (ok ? pasos : errores).push(que); };
const creado = { prospectos: [] as number[], usuarios: [] as number[], solicitudes: [] as number[], nichos: [] as number[] };

async function entrar(pg: Page, pin: string) {
  await pg.goto(`${BASE}/entrar`);
  for (const d of pin) await pg.getByRole("button", { name: d, exact: true }).click();
  await pg.waitForURL((u) => /\/inicio$/.test(u.pathname)); await pg.waitForLoadState("networkidle");
}
async function pagina(b: Browser, ancho: number, alto: number, movil: boolean) {
  const ctx = await b.newContext({ viewport: { width: ancho, height: alto }, isMobile: movil, hasTouch: movil, locale: "es-VE" });
  return { ctx, pg: await ctx.newPage() };
}
const visible = async (pg: Page, sel: string) => (await pg.locator(sel).count()) > 0 && await pg.locator(sel).first().isVisible();

const b = await chromium.launch();
try {
  // ---------- siembra ----------
  const nichoDe = async (slug: string, nombre: string, plantilla = "") => {
    let n = await prisma.nicho.findFirst({ where: { slug } });
    if (!n) { n = await prisma.nicho.create({ data: { slug, nombre, mensajeInicial: "Hola, {nombre}: {enlace}", mensajeSeguimiento: "Hola de nuevo, {nombre}", plantillaPropuesta: plantilla } }); creado.nichos.push(n.id); }
    return n;
  };
  const comercio = await nichoDe("comercio", "Comercio", "comercio-y-tienda");
  await nichoDe("otro", "Otro");
  const lead = (nombre: string, extra: Record<string, unknown>) => prisma.prospecto.create({ data: {
    nichoId: comercio.id, nombre: `${nombre} ${marca}`, ciudad: "", fuentes: [], codigo: codigoDe(`l${sello}${nombre}`),
    clave: `${nombre}||${sello}${Math.random()}`.toLowerCase().replace(/[^a-z0-9|]/g, ""), origen: "manual", esLead: true, ...extra } });
  const conversando: number[] = [];
  for (let i = 0; i < 30; i++) conversando.push((await lead(`Lead ${String(i).padStart(2, "0")}`, { fuenteLead: "web", etapa: "respondio", valorEstimado: "100", proximoSeguimiento: dia(i - 3), whatsapp: `5841200${String(i).padStart(5, "0")}` })).id);
  const nuevo = await lead("Posada Faro", { fuenteLead: "referido", etapa: "por_contactar", valorEstimado: "5100", proximoPaso: "enviar propuesta", proximoSeguimiento: dia(1), whatsapp: "584121112233" });
  const deDirectorio = await lead("Hotel Cola", { fuenteLead: "directorio", etapa: "enviado", proximoSeguimiento: dia(-1), whatsapp: "584129998877" });
  creado.prospectos.push(...conversando, nuevo.id, deDirectorio.id);
  const directorio = await prisma.prospecto.create({ data: { nichoId: comercio.id, nombre: `Tienda Directorio ${marca}`, ciudad: "Caracas", fuentes: [], codigo: codigoDe(`d${sello}`), clave: `tiendadirectorio|caracas|${sello}`, origen: "importado", esLead: false, etapa: "por_contactar", whatsapp: "584120001111", ordenCola: 1 } });
  creado.prospectos.push(directorio.id);
  const dueno = await prisma.usuario.create({ data: { nombre: `Dueño ${marca}`, rol: "dueno", pinHash: await bcrypt.hash(PIN_DUENO, 10), metaDiaria: 10 } });
  const prospectador = await prisma.usuario.create({ data: { nombre: `Prospectador ${marca}`, rol: "prospectador", pinHash: await bcrypt.hash(PIN_PROSPECTADOR, 10), metaDiaria: 5 } });
  creado.usuarios.push(dueno.id, prospectador.id);
  const solicitud = await prisma.solicitudWeb.create({ data: { nombre: `Luis ${marca}`, whatsapp: "04141234567", tipo: "embudo", mensaje: "Hola Neri, usé /empezar.", respuestas: JSON.stringify({ rubro: "comercio", actual: "web", objetivo: "cobros", tamano: "1", sistema: "cobros" }), calificacion: "demo", origen: "tiktok" } });
  creado.solicitudes.push(solicitud.id);

  // ---------- escritorio: tablero ----------
  {
    const { ctx, pg } = await pagina(b, 1280, 800, false);
    await entrar(pg, PIN_DUENO);
    await pg.goto(`${BASE}/leads?q=${encodeURIComponent(String(sello))}`); await pg.waitForLoadState("networkidle");
    revisar((await pg.locator(".tablero__columna:visible").count()) === 5, `1280: cinco columnas visibles (${await pg.locator(".tablero__columna:visible").count()})`);
    const conv = pg.locator('.tablero__columna[data-etapa="respondio"]');
    revisar((await conv.locator(".lead").count()) === 30, `1280: Conversando con 30 leads (${await conv.locator(".lead").count()})`);
    const scroll = await conv.locator(".tablero__lista").evaluate((e) => ({ sh: e.scrollHeight, ch: e.clientHeight, pagina: document.documentElement.scrollHeight <= innerHeight + 2 }));
    revisar(scroll.sh > scroll.ch, `1280: la columna llena se desplaza por dentro (${scroll.sh} > ${scroll.ch})`);
    revisar(scroll.pagina, "1280: la pagina no se desplaza por el tablero");
    revisar((await pg.locator('.tablero__columna[data-etapa="reunion"] .tablero__vacio').count()) === 1, "1280: la columna vacia dice «Nada aquí.»");
    revisar((await conv.locator(".tablero__titulo").innerText()).includes("$3.000,00") || (await conv.locator(".tablero__titulo").innerText()).includes("$3,000.00"), `1280: total de valor por columna (${(await conv.locator(".tablero__titulo").innerText()).replace(/\n/g, " ")})`);
    revisar((await conv.locator(".lead").first().innerText()).includes("Lead 00"), "1280: dentro de la columna, el mas vencido primero");
    await pg.screenshot({ path: `${SALIDA}/leads-1280.png` });
    // Mover a
    const tarjeta = pg.locator(`.lead[data-id="${nuevo.id}"]`);
    await tarjeta.locator("button", { hasText: "Mover a" }).click();
    await tarjeta.locator("button", { hasText: "Ganado" }).click();
    await pg.waitForTimeout(1200);
    revisar((await pg.locator(`.tablero__columna[data-etapa="ganado"] .lead[data-id="${nuevo.id}"]`).count()) === 1, "1280: «Mover a → Ganado» lleva la tarjeta a Ganado");
    revisar((await prisma.prospecto.findUniqueOrThrow({ where: { id: nuevo.id } })).proximoSeguimiento === dia(1), "1280: mover no borra la fecha del siguiente paso");
    revisar(await visible(pg, "nav.lateral a[href='/leads'][aria-current=page]"), "1280: la lateral marca Leads");
    await ctx.close();
  }
  // ---------- telefono: chips, una columna, nuevo lead ----------
  {
    const { ctx, pg } = await pagina(b, 390, 844, true);
    await entrar(pg, PIN_DUENO);
    await pg.goto(`${BASE}/leads?q=${encodeURIComponent(String(sello))}`); await pg.waitForLoadState("networkidle");
    revisar((await pg.locator(".tablero__columna:visible").count()) === 1, `390: una sola columna visible (${await pg.locator(".tablero__columna:visible").count()})`);
    revisar(await visible(pg, ".tablero-chips"), "390: chips de etapa");
    await pg.locator(".tablero-chips a", { hasText: "Ganado" }).click(); await pg.waitForURL(/etapa=ganado/); await pg.waitForLoadState("networkidle");
    revisar((await pg.locator('.tablero__columna[data-etapa="ganado"]:visible').count()) === 1, "390: el chip cambia de columna");
    revisar(await visible(pg, "nav.barra a[href='/leads'][aria-current=page]"), "390: la barra marca Leads");
    await pg.screenshot({ path: `${SALIDA}/leads-390.png`, fullPage: true });
    await pg.goto(`${BASE}/leads/nuevo`); await pg.waitForLoadState("networkidle");
    await pg.fill('input[name="nombre"]', `Arepera Nueva ${marca}`);
    await pg.selectOption('select[name="fuenteLead"]', "instagram");
    await pg.fill('input[name="instagram"]', "@arepera.nueva");
    await pg.fill('input[name="proximoPaso"]', "mandar propuesta");
    await pg.fill('input[name="valorEstimado"]', "2400");
    await pg.locator("button[type=submit]").click();
    await pg.waitForURL(/\/leads\/\d+$/, { timeout: 15000 });
    const idNuevo = Number(pg.url().split("/").pop());
    creado.prospectos.push(idNuevo);
    const n = await prisma.prospecto.findUniqueOrThrow({ where: { id: idNuevo } });
    revisar(n.esLead && n.fuenteLead === "instagram" && n.ciudad === "" && Number(n.valorEstimado) === 2400, "390: /leads/nuevo crea un lead sin ciudad y abre su ficha");
    if (!process.env.SIN_FICHA) {
      await pg.waitForLoadState("networkidle");
      revisar(await visible(pg, ".siguiente-paso"), "390: la ficha muestra «Siguiente paso»");
      await pg.fill(".siguiente-paso input[name=texto]", "armar demo");
      await pg.fill(".siguiente-paso input[name=fecha]", dia(2));
      await pg.locator(".siguiente-paso button[type=submit]").click(); await pg.waitForTimeout(1000);
      await pg.reload(); await pg.waitForLoadState("networkidle");
      revisar((await pg.locator(".siguiente-paso input[name=texto]").inputValue()) === "armar demo", "390: el siguiente paso persiste tras recargar");
      await pg.locator(".siguiente-paso button", { hasText: "Mover a" }).click();
      await pg.locator(".siguiente-paso button", { hasText: "Conversando" }).click(); await pg.waitForTimeout(1000);
      revisar((await pg.locator(".cabecera-pagina").innerText()).includes("Conversando"), "390: mover desde la ficha cambia la cabecera");
      revisar((await pg.locator("details.historial-plegado:not([open])").count()) === 1, "390: el historial va plegado en el telefono");
      await pg.goto(`${BASE}/prospectos/${idNuevo}`); await pg.waitForLoadState("networkidle");
      revisar(pg.url().endsWith(`/leads/${idNuevo}`), `ficha: /prospectos/<lead> redirige a /leads/<id> (${pg.url()})`);
      await pg.goto(`${BASE}/prospectos/${directorio.id}`); await pg.waitForLoadState("networkidle");
      revisar((await pg.locator("text=Enviar propuesta").count()) >= 1 && pg.url().endsWith(`/prospectos/${directorio.id}`), "ficha: un directorio sigue en /prospectos/<id> con «Enviar propuesta»");
      await pg.screenshot({ path: `${SALIDA}/lead-390.png`, fullPage: true });
    }
    if (!process.env.SIN_DIRECTORIO) {
      await pg.goto(`${BASE}/solicitudes`); await pg.waitForLoadState("networkidle");
      const tarjeta = pg.locator("article", { hasText: `Luis ${marca}` });
      await tarjeta.locator("button", { hasText: "Convertir en lead" }).click();
      await pg.waitForURL(/\/leads\/\d+$/, { timeout: 15000 });
      const idSol = Number(pg.url().split("/").pop()); creado.prospectos.push(idSol);
      const s2 = await prisma.solicitudWeb.findUniqueOrThrow({ where: { id: solicitud.id } });
      revisar(s2.prospectoId === idSol && !!s2.atendidaEn, "solicitudes: «Convertir en lead» crea el lead y deja la solicitud atendida y enlazada");
      await pg.goto(`${BASE}/solicitudes?t=todas`); await pg.waitForLoadState("networkidle");
      revisar((await pg.locator("article", { hasText: `Luis ${marca}` }).locator(`a[href="/leads/${idSol}"]`).count()) === 1, "solicitudes: la tarjeta convertida enlaza al lead");
      await pg.goto(`${BASE}/directorio`); await pg.waitForLoadState("networkidle");
      revisar((await pg.locator(".pestanas a").count()) >= 5, `directorio: pestanas (${await pg.locator(".pestanas a").count()})`);
      await pg.goto(`${BASE}/directorio?t=cola`); await pg.waitForLoadState("networkidle");
      revisar((await pg.locator("text=Por contactar").count()) >= 1, "directorio: la cola del dia vive en ?t=cola");
      await pg.goto(`${BASE}/directorio?t=lista&q=${encodeURIComponent(String(sello))}`); await pg.waitForLoadState("networkidle");
      revisar((await pg.locator(`text=Tienda Directorio ${marca}`).count()) === 1 && (await pg.locator(`text=Posada Faro ${marca}`).count()) === 0, "directorio: la lista trae el directorio y no los leads");
      await pg.goto(`${BASE}/prospectos?etapa=enviado`); await pg.waitForLoadState("networkidle");
      revisar(pg.url().includes("/directorio?t=lista") && pg.url().includes("etapa=enviado"), `rutas: /prospectos → /directorio?t=lista con su consulta (${pg.url()})`);
      await pg.goto(`${BASE}/buscar?url=https://maps.app.goo.gl/x`); await pg.waitForLoadState("networkidle");
      revisar(pg.url().includes("/directorio") && pg.url().includes("t=maps") && pg.url().includes("url="), `rutas: /buscar?url= → /directorio?t=maps (${pg.url()})`);
      const man = await (await pg.request.get(`${BASE}/manifest.webmanifest`)).json();
      revisar(man.share_target?.action === "/directorio", `rutas: share_target a /directorio (${man.share_target?.action})`);
      await pg.goto(`${BASE}/inicio`); await pg.waitForLoadState("networkidle");
      revisar(!(await pg.locator(`.hoy-lista:has-text("Hotel Cola ${marca}")`).count()), "inicio: un lead de directorio en Propuesta enviada no entra en el Hoy del dueno");
    }
    await ctx.close();
  }
  // ---------- prospectador ----------
  {
    const { ctx, pg } = await pagina(b, 390, 844, true);
    await entrar(pg, PIN_PROSPECTADOR);
    await pg.goto(`${BASE}/leads?q=${encodeURIComponent(String(sello))}`); await pg.waitForLoadState("networkidle");
    const nombres = await pg.locator(".lead__nombre").allInnerTexts();
    revisar(nombres.length === 1 && nombres[0].startsWith("Hotel Cola"), `prospectador: solo ve los leads que salieron del directorio (${nombres.length})`);
    revisar((await pg.locator("nav.barra a").allInnerTexts()).join("|").includes("Directorio"), "prospectador: la barra lleva Directorio");
    await ctx.close();
  }
} catch (e) {
  errores.push(`excepcion: ${(e as Error).message}`);
} finally {
  await b.close();
  await prisma.evento.deleteMany({ where: { OR: [{ prospectoId: { in: creado.prospectos } }, { usuarioId: { in: creado.usuarios } }] } });
  await prisma.evento.deleteMany({ where: { prospecto: { nombre: { contains: marca } } } });
  await prisma.solicitudWeb.deleteMany({ where: { id: { in: creado.solicitudes } } });
  await prisma.prospecto.deleteMany({ where: { OR: [{ id: { in: creado.prospectos } }, { nombre: { contains: marca } }] } });
  await prisma.usuario.deleteMany({ where: { id: { in: creado.usuarios } } });
  for (const id of creado.nichos) await prisma.nicho.delete({ where: { id } }).catch(() => {});
  await prisma.$disconnect();
}
for (const p of pasos) console.log("ok  ", p);
for (const e of errores) console.log("FALLA", e);
console.log(`\n${pasos.length} bien, ${errores.length} mal`);
process.exit(errores.length ? 1 : 0);
