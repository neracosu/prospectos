import { vi } from "vitest";
vi.mock("@/lib/sesion", async () => {
  const { sesionFalsa } = await import("./ayuda-sesion");
  return {
    COOKIE_SESION: "pr_sesion",
    DIAS_SESION: 30,
    sesionActual: async () => sesionFalsa.actual,
    exigirSesion: async () => { if (!sesionFalsa.actual) throw new Error("REDIRECT:/entrar"); return sesionFalsa.actual; },
    exigirRol: async (rol: string) => { if (sesionFalsa.actual?.rol !== rol) throw new Error("REDIRECT:/hoy"); return sesionFalsa.actual; },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// La red se simula: el modulo red-segura se reemplaza por una funcion controlada por
// cada test. Ningun test de esta suite sale a internet.
type RespuestaFalsa = { ok: true; estado: number; urlFinal: string; texto: string } | { ok: false; motivo: string };
const red = { respuesta: async (url: string): Promise<RespuestaFalsa> => ({ ok: false, motivo: "sin red en tests" }) };
vi.mock("@/lib/red-segura", () => ({ descargar: (url: string) => red.respuesta(url), esUrlPermitida: async (u: string) => ({ ok: true, url: new URL(u) }), USER_AGENT: "test" }));

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, crearProspectoDePrueba } from "./ayuda-db";
import { sesionFalsa } from "./ayuda-sesion";
import { buscarOverpass, cargarMaps, importarTexto, importarArchivo, leerWebDeProspecto, aplicarSugerencia } from "@/acciones/buscar";
import { aprobarFila } from "@/acciones/revision";
import { generarPlantillaXlsx } from "@/lib/plantilla-importar";
import { ESPERA_MS } from "@/lib/overpass";
import { loteConDetalle } from "@/lib/revision";
import { GET as descargarPlantilla } from "@/app/(panel)/buscar/plantilla/route";

// La espera entre consultas de Overpass se acorta SOLO en las pruebas (donde la red
// esta simulada): con los 5 s de verdad este archivo tardaria un minuto. El valor de
// produccion se afirma aparte, en el caso de la cola.
process.env.PROSPECTOS_OVERPASS_ESPERA_MS = "60";

const fixture = (n: string) => readFileSync(path.join(import.meta.dirname, "fixtures", n), "utf8");
const fd = (o: Record<string, string | Blob>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const URL_MAPS = "https://www.google.com/maps/place/Hotel+Yare/";
// Una ficha de Maps de mentira, con la direccion que pida el caso.
const fichaMaps = (direccion: string, nombre = "Hotel Yare") =>
  `<!doctype html><html><head><meta property="og:title" content="${nombre} - Google Maps">` +
  `<meta property="og:description" content="${direccion}"></head><body><script>` +
  `window.APP = ["+58 212-7930708", "https://www.hotelyare.com.ve/"];</script></body></html>`;
const respuestaOsm = (elementos: unknown[], extra: Record<string, unknown> = {}) =>
  JSON.stringify({ version: 0.6, generator: "Overpass API", ...extra, elements: elementos });
const nodoOsm = (id: number, tags: Record<string, string>) => ({ type: "node", id, lat: 10.5, lon: -66.9, tags: { tourism: "hotel", ...tags } });

describe.runIf(DB_HABILITADA)("fuentes", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  const HOTELES = [["tourism", "hotel"]];
  beforeAll(async () => {
    await limpiarBase(); ids = await sembrarBasico();
    await prisma.nicho.update({ where: { id: ids.nichoId }, data: { etiquetaOsm: HOTELES } });
  });
  beforeEach(() => { sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" }; });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("buscarOverpass crea un lote desde la respuesta y la segunda vez sale de la cache", async () => {
    let llamadas = 0;
    red.respuesta = async () => { llamadas++; return { ok: true, estado: 200, urlFinal: "https://overpass-api.de/api/interpreter", texto: fixture("overpass.json") }; };
    const a = await buscarOverpass(fd({ nichoId: String(ids.nichoId), ciudad: "caracas" }));
    expect(a.ok).toBe(true);
    if (a.ok) { expect(a.datos.nuevos).toBe(2); expect(a.datos.desdeCache).toBe(false); expect(a.datos.antiguedadDias).toBe(0); }
    const b = await buscarOverpass(fd({ nichoId: String(ids.nichoId), ciudad: "caracas" }));
    expect(b.ok && b.datos.desdeCache).toBe(true);
    expect(llamadas).toBe(1);
    expect(await prisma.busquedaOsm.count()).toBe(1);
    const d = (await loteConDetalle((a as { datos: { lote: string } }).datos.lote))!;
    expect(d.origen).toBe("overpass");
    expect(d.filas[0].datos.fuentes?.[0]).toMatch(/openstreetmap\.org\/node\/1/);
  });

  it("no se guarda en la caché una respuesta con error, una con aviso de Overpass ni una vacía", async () => {
    // Dos llamadas seguidas al mismo par: si la respuesta se hubiera cacheado, la
    // segunda no consultaria. Se espera 2 en los tres casos.
    const consultas = async (ciudad: string, da: () => RespuestaFalsa) => {
      let n = 0;
      red.respuesta = async () => { n++; return da(); };
      await buscarOverpass(fd({ nichoId: String(ids.nichoId), ciudad }));
      await buscarOverpass(fd({ nichoId: String(ids.nichoId), ciudad }));
      return n;
    };
    expect(await consultas("valencia", () => ({ ok: true, estado: 500, urlFinal: "x", texto: respuestaOsm([], { remark: "runtime error: Query timed out" }) }))).toBe(2);
    // 200 CON resultados pero con remark: Overpass avisa que la corto por tiempo, asi
    // que lo que vino esta incompleto y no puede quedarse una semana.
    expect(await consultas("cumana", () => ({ ok: true, estado: 200, urlFinal: "x", texto: respuestaOsm([nodoOsm(11, { name: "Hotel Parcial" })], { remark: "runtime error: Query ran out of memory" }) }))).toBe(2);
    expect(await consultas("san-cristobal", () => ({ ok: true, estado: 200, urlFinal: "x", texto: respuestaOsm([]) }))).toBe(2);
    expect(await prisma.busquedaOsm.count({ where: { area: { in: ["valencia", "cumana", "san-cristobal"] } } })).toBe(0);
  });

  it("si cambian las etiquetas del nicho, la cache guardada ya no vale", async () => {
    let llamadas = 0;
    red.respuesta = async () => { llamadas++; return { ok: true, estado: 200, urlFinal: "x", texto: fixture("overpass.json") }; };
    // caracas quedo cacheada en el primer caso, con las etiquetas de hoteles.
    expect((await buscarOverpass(fd({ nichoId: String(ids.nichoId), ciudad: "caracas" }))).ok).toBe(true);
    expect(llamadas).toBe(0);
    await prisma.nicho.update({ where: { id: ids.nichoId }, data: { etiquetaOsm: [["tourism", "motel"]] } });
    const r = await buscarOverpass(fd({ nichoId: String(ids.nichoId), ciudad: "caracas" }));
    expect(r.ok && r.datos.desdeCache).toBe(false);
    expect(llamadas).toBe(1);
    await prisma.nicho.update({ where: { id: ids.nichoId }, data: { etiquetaOsm: HOTELES } });
  });

  it("con Overpass caído devuelve la cache vieja y dice de cuántos días es", async () => {
    red.respuesta = async () => ({ ok: true, estado: 200, urlFinal: "x", texto: fixture("overpass.json") });
    expect((await buscarOverpass(fd({ nichoId: String(ids.nichoId), ciudad: "maracay" }))).ok).toBe(true);
    await prisma.busquedaOsm.updateMany({
      where: { area: "maracay" },
      data: { consultadoEn: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) },
    });
    red.respuesta = async () => ({ ok: false, motivo: "Tiempo de espera agotado" });
    const r = await buscarOverpass(fd({ nichoId: String(ids.nichoId), ciudad: "maracay" }));
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.datos.desdeCache).toBe(true); expect(r.datos.antiguedadDias).toBe(40); }
  });

  it("buscarOverpass avisa cuando Overpass no responde y cuando la ciudad no existe", async () => {
    red.respuesta = async () => ({ ok: false, motivo: "Tiempo de espera agotado" });
    expect(await buscarOverpass(fd({ nichoId: String(ids.nichoId), ciudad: "cumana" }))).toEqual({ ok: false, mensaje: expect.stringContaining("Overpass") });
    expect(await buscarOverpass(fd({ nichoId: String(ids.nichoId), ciudad: "narnia" }))).toEqual({ ok: false, mensaje: "Ciudad desconocida." });
  });

  it("un nombre de OpenStreetMap más largo que el tope entra como fila con error", async () => {
    const largo = "Hotel " + "a".repeat(240);
    red.respuesta = async () => ({ ok: true, estado: 200, urlFinal: "x", texto: respuestaOsm([nodoOsm(9, { name: largo })]) });
    const r = await buscarOverpass(fd({ nichoId: String(ids.nichoId), ciudad: "merida" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.datos.errores).toBe(1);
    const d = (await loteConDetalle(r.datos.lote))!;
    expect(d.filas[0].estado).toBe("error");
    expect(d.filas[0].errores).toContain("El nombre no puede pasar de 120 caracteres");
  });

  it("si descargar lanza, la consulta falla pero la cola no se queda trancada", async () => {
    red.respuesta = async () => { throw new Error("boom"); };
    expect((await buscarOverpass(fd({ nichoId: String(ids.nichoId), ciudad: "porlamar" }))).ok).toBe(false);
    red.respuesta = async () => ({ ok: true, estado: 200, urlFinal: "x", texto: fixture("overpass.json") });
    expect((await buscarOverpass(fd({ nichoId: String(ids.nichoId), ciudad: "porlamar" }))).ok).toBe(true);
  });

  // La politica de Overpass: una consulta a la vez en todo el proceso y 5 s entre una
  // y otra (en las pruebas, los ms de PROSPECTOS_OVERPASS_ESPERA_MS).
  it("la cola no solapa dos consultas y deja la espera entre una y otra", async () => {
    expect(ESPERA_MS).toBe(5000); // el valor de produccion, que las pruebas no cambian
    let dentro = 0; let maxDentro = 0; const arranques: number[] = [];
    red.respuesta = async () => {
      dentro++; maxDentro = Math.max(maxDentro, dentro); arranques.push(Date.now());
      await new Promise((r) => setTimeout(r, 20));
      dentro--;
      return { ok: true, estado: 200, urlFinal: "x", texto: fixture("overpass.json") };
    };
    await Promise.all([
      buscarOverpass(fd({ nichoId: String(ids.nichoId), ciudad: "la-guaira" })),
      buscarOverpass(fd({ nichoId: String(ids.nichoId), ciudad: "los-teques" })),
    ]);
    expect(maxDentro).toBe(1);
    expect(arranques.length).toBe(2);
    expect(arranques[1] - arranques[0]).toBeGreaterThanOrEqual(50);
  });

  it("tres búsquedas del mismo par a la vez hacen UNA sola consulta", async () => {
    let llamadas = 0;
    red.respuesta = async () => { llamadas++; return { ok: true, estado: 200, urlFinal: "x", texto: fixture("overpass.json") }; };
    const rs = await Promise.all([
      buscarOverpass(fd({ nichoId: String(ids.nichoId), ciudad: "maracaibo" })),
      buscarOverpass(fd({ nichoId: String(ids.nichoId), ciudad: "maracaibo" })),
      buscarOverpass(fd({ nichoId: String(ids.nichoId), ciudad: "maracaibo" })),
    ]);
    expect(rs.every((r) => r.ok)).toBe(true);
    expect(llamadas).toBe(1);
  });

  it("cargarMaps lee la ficha y arma un lote de una fila; sin og:title ofrece carga manual", async () => {
    red.respuesta = async (url) => ({ ok: true, estado: 200, urlFinal: URL_MAPS, texto: url.includes("fail") ? "<html></html>" : fichaMaps("Av. Las Acacias, Sabana Grande, Caracas") });
    const r = await cargarMaps(fd({ nichoId: String(ids.nichoId), url: "https://maps.app.goo.gl/AbCdEf" }));
    expect(r.ok).toBe(true);
    if (r.ok && "lote" in r.datos) {
      const d = (await loteConDetalle(r.datos.lote))!;
      expect(d.origen).toBe("maps");
      expect(d.filas[0].datos).toMatchObject({ nombre: "Hotel Yare", web: "https://www.hotelyare.com.ve/", nicho: "hoteles" });
      expect(d.filas[0].datos.fuentes?.[0]).toBe(URL_MAPS);
      expect(d.filas[0].datos.ciudad).toBe("Caracas"); // de og:description, ultima parte
    } else throw new Error("esperaba lote");
    const m = await cargarMaps(fd({ nichoId: String(ids.nichoId), url: "https://www.google.com/maps/place/fail" }));
    expect(m.ok && "manual" in m.datos && m.datos.manual).toBe(true);
    expect((await cargarMaps(fd({ nichoId: String(ids.nichoId), url: "https://www.google.com/search?q=x" }))).ok).toBe(false);
  });

  it("cargarMaps no lee el HTML si el enlace corto termina fuera de Google Maps", async () => {
    red.respuesta = async () => ({ ok: true, estado: 200, urlFinal: "https://sitio-cualquiera.test/pagina", texto: fichaMaps("Av. Tal, Caracas") });
    expect(await cargarMaps(fd({ nichoId: String(ids.nichoId), url: "https://maps.app.goo.gl/ZzZzZz" }))).toEqual({ ok: false, mensaje: "Ese enlace no lleva a Google Maps." });
  });

  it("la ciudad de Maps se saca por coincidencia exacta, no por parecido", async () => {
    const ciudadDe = async (direccion: string, nombre: string) => {
      red.respuesta = async () => ({ ok: true, estado: 200, urlFinal: URL_MAPS + encodeURIComponent(nombre), texto: fichaMaps(direccion, nombre) });
      const r = await cargarMaps(fd({ nichoId: String(ids.nichoId), url: "https://www.google.com/maps/place/x" }));
      if (!r.ok || !("lote" in r.datos)) throw new Error("esperaba lote");
      const d = (await loteConDetalle(r.datos.lote))!;
      return d.filas[0];
    };
    const urbina = await ciudadDe("Calle 3, La Urbina, Miranda", "Hotel Urbina");
    expect(urbina.datos.ciudad).toBe("");
    expect(urbina.errores).toContain("Falta la ciudad");
    expect((await ciudadDe("Av. 5 de Julio, Puerto La Cruz, Anzoátegui", "Hotel Cruz")).datos).toMatchObject({ ciudad: "Barcelona – Puerto La Cruz", estado: "Anzoátegui" });
    expect((await ciudadDe("Av. Bolívar, Valencia, Carabobo", "Hotel Carabobo")).datos).toMatchObject({ ciudad: "Valencia", estado: "Carabobo" });
  });

  it("importarTexto e importarArchivo (xlsx y csv) crean lotes y reportan columnas desconocidas", async () => {
    const t = await importarTexto(fd({ texto: "nombre\tciudad\tnicho\tcolor\nHotel Pegado\tCaracas\thoteles\tazul\n" }));
    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.datos.nuevos).toBe(1);
    expect(t.datos.desconocidas).toEqual(["color"]);
    // Sin columna fuente, la fila entra igual pero con la fuente "importado": ningun
    // dato llega a la ficha sin decir de donde salio.
    const d = (await loteConDetalle(t.datos.lote))!;
    expect(d.filas[0].datos.fuentes).toEqual(["importado"]);
    expect((await aprobarFila(d.filas[0].id)).ok).toBe(true);
    const p = await prisma.prospecto.findFirstOrThrow({ where: { nombre: "Hotel Pegado" } });
    expect(p.fuentes).toEqual(["importado"]);

    const buf = await generarPlantillaXlsx();
    const archivo = new File([new Uint8Array(buf)], "plantilla.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = await importarArchivo(fd({ archivo }));
    expect(a.ok && a.datos.nuevos).toBe(1); // la fila de ejemplo
    // Un .csv con punto y coma (lo que deja Excel en espanol) entra igual.
    const csv = new File([new TextEncoder().encode("nombre;ciudad;nicho;fuente\nHotel CSV;Caracas;hoteles;https://hotelcsv.test/\n")], "lista.csv", { type: "text/csv" });
    const c = await importarArchivo(fd({ archivo: csv }));
    expect(c.ok && c.datos.nuevos).toBe(1);
    expect((await importarTexto(fd({ texto: "" }))).ok).toBe(false);
    // Una extension que no es de tabla no se lee, aunque adentro venga texto.
    const malo = new File([new TextEncoder().encode("nombre;ciudad;nicho\nX;Caracas;hoteles\n")], "lista.pdf", { type: "application/pdf" });
    expect((await importarArchivo(fd({ archivo: malo }))).ok).toBe(false);
  });

  it("leerWebDeProspecto sugiere solo campos vacios y aplicarSugerencia no pisa", async () => {
    const p = await crearProspectoDePrueba(ids.nichoId, { nombre: "Hotel Web", whatsapp: "584129999999", email: "", instagram: "", web: "https://hotelx.com.ve/" });
    red.respuesta = async () => ({ ok: true, estado: 200, urlFinal: "https://hotelx.com.ve/", texto: fixture("web-negocio.html") });
    const r = await leerWebDeProspecto(p.id);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.datos.sugerencias.map((s) => s.campo)).toEqual(expect.arrayContaining(["email", "instagram"]));
      expect(r.datos.sugerencias.some((s) => s.campo === "whatsapp")).toBe(false); // ya lo tenia
      expect(r.datos.sugerencias[0].fuente).toBe("https://hotelx.com.ve/");
    }
    // Freno: la misma web no se vuelve a leer en el mismo minuto.
    expect(await leerWebDeProspecto(p.id)).toEqual({ ok: false, mensaje: expect.stringContaining("menos de un minuto") });
    expect((await aplicarSugerencia(p.id, "email", "reservas@hotelx.com.ve", "https://hotelx.com.ve/")).ok).toBe(true);
    expect((await aplicarSugerencia(p.id, "email", "otro@x.com", "https://hotelx.com.ve/")).ok).toBe(false); // ya no esta vacio
    const d = await prisma.prospecto.findUniqueOrThrow({ where: { id: p.id } });
    expect(d.email).toBe("reservas@hotelx.com.ve");
    expect((d.fuentesPorCampo as Record<string, string>).email).toBe("https://hotelx.com.ve/");
    expect(d.fuentes).toContain("https://hotelx.com.ve/");
    const sinWeb = await crearProspectoDePrueba(ids.nichoId, { nombre: "Sin Web" });
    expect((await leerWebDeProspecto(sinWeb.id)).ok).toBe(false);
  });

  it("aplicarSugerencia valida cada campo y exige que la fuente sea la web del prospecto", async () => {
    const p = await crearProspectoDePrueba(ids.nichoId, { nombre: "Hotel Validado", whatsapp: "", instagram: "", email: "", web: "https://hotelx.com.ve/" });
    const fuente = "https://hotelx.com.ve/contacto";
    expect(await aplicarSugerencia(p.id, "email", "no-es-un-correo", fuente)).toEqual({ ok: false, mensaje: expect.stringContaining("correo") });
    expect(await aplicarSugerencia(p.id, "instagram", "no es una red", fuente)).toEqual({ ok: false, mensaje: expect.stringContaining("Instagram") });
    expect(await aplicarSugerencia(p.id, "email", "reservas@hotelx.com.ve", "https://otro-dominio.test/")).toEqual({ ok: false, mensaje: "La fuente tiene que ser la web del prospecto." });
    expect((await aplicarSugerencia(p.id, "instagram", "@hotelx", fuente)).ok).toBe(true);
    expect((await aplicarSugerencia(p.id, "whatsapp", "0414-555.12.34", fuente)).ok).toBe(true);
    const d = await prisma.prospecto.findUniqueOrThrow({ where: { id: p.id } });
    expect(d.instagram).toBe("https://www.instagram.com/hotelx/"); // URL canonica, no "@hotelx"
    expect(d.whatsapp).toBe("584145551234");
  });

  it("dos sugerencias a la vez no se borran las fuentes entre ellas", async () => {
    const p = await crearProspectoDePrueba(ids.nichoId, { nombre: "Hotel Concurrente", email: "", instagram: "", web: "https://hotelx.com.ve/" });
    const [a, b] = await Promise.all([
      aplicarSugerencia(p.id, "email", "hola@hotelx.com.ve", "https://hotelx.com.ve/"),
      aplicarSugerencia(p.id, "instagram", "@hotelconcurrente", "https://hotelx.com.ve/contacto"),
    ]);
    expect([a.ok, b.ok]).toEqual([true, true]);
    const d = await prisma.prospecto.findUniqueOrThrow({ where: { id: p.id } });
    expect(d.email).toBe("hola@hotelx.com.ve");
    expect(d.instagram).toBe("https://www.instagram.com/hotelconcurrente/");
    const fpc = d.fuentesPorCampo as Record<string, string>;
    expect(fpc.email).toBe("https://hotelx.com.ve/");
    expect(fpc.instagram).toBe("https://hotelx.com.ve/contacto");
    expect(d.fuentes).toEqual(expect.arrayContaining(["https://hotelx.com.ve/", "https://hotelx.com.ve/contacto"]));
  });
});

describe("la plantilla se baja por su ruta", () => {
  beforeEach(() => { sesionFalsa.actual = { id: 1, nombre: "Neri", rol: "dueno" }; });

  it("sin sesión manda a /entrar", async () => {
    sesionFalsa.actual = null;
    const r = await descargarPlantilla(new Request("http://panel.test/buscar/plantilla"));
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("/entrar");
  });

  it("el xlsx baja como adjunto y el csv empieza con BOM", async () => {
    const x = await descargarPlantilla(new Request("http://panel.test/buscar/plantilla?formato=xlsx"));
    expect(x.status).toBe(200);
    expect(x.headers.get("content-type")).toContain("spreadsheetml.sheet");
    expect(x.headers.get("content-disposition")).toBe('attachment; filename="plantilla-prospectos.xlsx"');
    expect((await x.arrayBuffer()).byteLength).toBeGreaterThan(2000);
    const c = await descargarPlantilla(new Request("http://panel.test/buscar/plantilla?formato=csv"));
    expect(c.headers.get("content-type")).toContain("text/csv");
    expect(c.headers.get("content-disposition")).toBe('attachment; filename="plantilla-prospectos.csv"');
    // .text() se come el BOM al decodificar: hay que mirar los bytes.
    const bytes = new Uint8Array(await c.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });
});
