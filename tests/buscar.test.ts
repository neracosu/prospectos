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
const red = { respuesta: async (url: string): Promise<{ ok: true; estado: number; urlFinal: string; texto: string } | { ok: false; motivo: string }> => ({ ok: false, motivo: "sin red en tests" }) };
vi.mock("@/lib/red-segura", () => ({ descargar: (url: string) => red.respuesta(url), esUrlPermitida: async (u: string) => ({ ok: true, url: new URL(u) }), USER_AGENT: "test" }));

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, crearProspectoDePrueba } from "./ayuda-db";
import { sesionFalsa } from "./ayuda-sesion";
import { buscarOverpass, cargarMaps, importarTexto, importarArchivo, leerWebDeProspecto, aplicarSugerencia } from "@/acciones/buscar";
import { generarPlantillaXlsx } from "@/lib/plantilla-importar";
import { loteConDetalle } from "@/lib/revision";

const fixture = (n: string) => readFileSync(path.join(import.meta.dirname, "fixtures", n), "utf8");
const fd = (o: Record<string, string | Blob>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe.runIf(DB_HABILITADA)("fuentes", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  beforeAll(async () => {
    await limpiarBase(); ids = await sembrarBasico();
    await prisma.nicho.update({ where: { id: ids.nichoId }, data: { etiquetaOsm: [["tourism", "hotel"]] } });
  });
  beforeEach(() => { sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" }; });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("buscarOverpass crea un lote desde la respuesta y la segunda vez sale de la cache", async () => {
    let llamadas = 0;
    red.respuesta = async () => { llamadas++; return { ok: true, estado: 200, urlFinal: "https://overpass-api.de/api/interpreter", texto: fixture("overpass.json") }; };
    const a = await buscarOverpass(fd({ nichoId: String(ids.nichoId), ciudad: "caracas" }));
    expect(a.ok).toBe(true);
    if (a.ok) { expect(a.datos.nuevos).toBe(2); expect(a.datos.desdeCache).toBe(false); }
    const b = await buscarOverpass(fd({ nichoId: String(ids.nichoId), ciudad: "caracas" }));
    expect(b.ok && b.datos.desdeCache).toBe(true);
    expect(llamadas).toBe(1);
    expect(await prisma.busquedaOsm.count()).toBe(1);
    const d = (await loteConDetalle((a as { datos: { lote: string } }).datos.lote))!;
    expect(d.origen).toBe("overpass");
    expect(d.filas[0].datos.fuentes?.[0]).toMatch(/openstreetmap\.org\/node\/1/);
  });

  // La cola de Overpass deja 5 s entre una consulta real y la siguiente: este caso
  // pide un turno nuevo, asi que espera esos 5 s a proposito (de ahi el plazo largo).
  it("buscarOverpass avisa cuando Overpass no responde y cuando la ciudad no existe", async () => {
    red.respuesta = async () => ({ ok: false, motivo: "Tiempo de espera agotado" });
    expect(await buscarOverpass(fd({ nichoId: String(ids.nichoId), ciudad: "valencia" }))).toEqual({ ok: false, mensaje: expect.stringContaining("Overpass") });
    expect((await buscarOverpass(fd({ nichoId: String(ids.nichoId), ciudad: "narnia" }))).ok).toBe(false);
  }, 20_000);

  // La politica de Overpass: una consulta a la vez en todo el proceso y 5 s entre
  // una y otra. Dos busquedas pedidas a la vez no pueden solaparse ni pegarse.
  it("la cola de Overpass no solapa dos consultas y deja 5 s entre una y otra", async () => {
    let dentro = 0; let maxDentro = 0; const arranques: number[] = [];
    red.respuesta = async () => {
      dentro++; maxDentro = Math.max(maxDentro, dentro); arranques.push(Date.now());
      await new Promise((r) => setTimeout(r, 20));
      dentro--;
      return { ok: true, estado: 200, urlFinal: "https://overpass-api.de/api/interpreter", texto: fixture("overpass.json") };
    };
    await Promise.all([
      buscarOverpass(fd({ nichoId: String(ids.nichoId), ciudad: "la-guaira" })),
      buscarOverpass(fd({ nichoId: String(ids.nichoId), ciudad: "los-teques" })),
    ]);
    expect(maxDentro).toBe(1);
    expect(arranques.length).toBe(2);
    expect(arranques[1] - arranques[0]).toBeGreaterThan(4500);
  }, 30_000);

  it("cargarMaps lee la ficha y arma un lote de una fila; sin og:title ofrece carga manual", async () => {
    red.respuesta = async (url) => ({ ok: true, estado: 200, urlFinal: "https://www.google.com/maps/place/Hotel+Yare/", texto: url.includes("fail") ? "<html></html>" : fixture("maps-ficha.html") });
    const r = await cargarMaps(fd({ nichoId: String(ids.nichoId), url: "https://maps.app.goo.gl/AbCdEf" }));
    expect(r.ok).toBe(true);
    if (r.ok && "lote" in r.datos) {
      const d = (await loteConDetalle(r.datos.lote))!;
      expect(d.origen).toBe("maps");
      expect(d.filas[0].datos).toMatchObject({ nombre: "Hotel Yare", web: "https://www.hotelyare.com.ve/", nicho: "hoteles" });
      expect(d.filas[0].datos.fuentes?.[0]).toBe("https://www.google.com/maps/place/Hotel+Yare/");
      expect(d.filas[0].datos.ciudad).toBe("Caracas"); // de og:description, ultima parte
    } else throw new Error("esperaba lote");
    const m = await cargarMaps(fd({ nichoId: String(ids.nichoId), url: "https://www.google.com/maps/place/fail" }));
    expect(m.ok && "manual" in m.datos && m.datos.manual).toBe(true);
    expect((await cargarMaps(fd({ nichoId: String(ids.nichoId), url: "https://www.google.com/search?q=x" }))).ok).toBe(false);
  });

  it("importarTexto e importarArchivo (xlsx) crean lotes y reportan columnas desconocidas", async () => {
    const t = await importarTexto(fd({ texto: "nombre\tciudad\tnicho\tcolor\nHotel Pegado\tCaracas\thoteles\tazul\n" }));
    expect(t.ok).toBe(true);
    if (t.ok) { expect(t.datos.nuevos).toBe(1); expect(t.datos.desconocidas).toEqual(["color"]); }
    const buf = await generarPlantillaXlsx();
    const archivo = new File([new Uint8Array(buf)], "plantilla.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = await importarArchivo(fd({ archivo }));
    expect(a.ok && a.datos.nuevos).toBe(1); // la fila de ejemplo
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
    expect((await aplicarSugerencia(p.id, "email", "reservas@hotelx.com.ve", "https://hotelx.com.ve/")).ok).toBe(true);
    expect((await aplicarSugerencia(p.id, "email", "otro@x.com", "https://hotelx.com.ve/")).ok).toBe(false); // ya no esta vacio
    const d = await prisma.prospecto.findUniqueOrThrow({ where: { id: p.id } });
    expect(d.email).toBe("reservas@hotelx.com.ve");
    expect((d.fuentesPorCampo as Record<string, string>).email).toBe("https://hotelx.com.ve/");
    expect(d.fuentes).toContain("https://hotelx.com.ve/");
    // El Evento de la lectura queda con quien la hizo.
    expect(await prisma.evento.count({ where: { prospectoId: p.id, tipo: "nota" } })).toBe(2);
    const sinWeb = await crearProspectoDePrueba(ids.nichoId, { nombre: "Sin Web" });
    expect((await leerWebDeProspecto(sinWeb.id)).ok).toBe(false);
  });
});
