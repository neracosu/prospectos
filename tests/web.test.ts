import { vi } from "vitest";
vi.mock("@/lib/sesion", async () => {
  const { sesionFalsa } = await import("./ayuda-sesion");
  return {
    COOKIE_SESION: "pr_sesion", DIAS_SESION: 30,
    sesionActual: async () => sesionFalsa.actual,
    exigirSesion: async () => { if (!sesionFalsa.actual) throw new Error("REDIRECT:/entrar"); return sesionFalsa.actual; },
    exigirRol: async (rol: string) => { if (sesionFalsa.actual?.rol !== rol) throw new Error("REDIRECT:/inicio"); return sesionFalsa.actual; },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const correos: { asunto: string; texto: string; responderA?: string }[] = [];
vi.mock("@/lib/correo", () => ({ avisarSolicitud: async (d: { nombre: string; correo: string }) => { correos.push({ asunto: d.nombre, texto: JSON.stringify(d), responderA: d.correo }); return true; } }));

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico } from "./ayuda-db";
import { sesionFalsa } from "./ayuda-sesion";
import { _reiniciarIntentos } from "@/lib/rate-limit";
import { POST as postEvento, OPTIONS as optionsEvento } from "@/app/api/web/evento/route";
import { POST as postSolicitud } from "@/app/api/web/solicitud/route";
import { resumenWeb, listarSolicitudes, solicitudesSinAtender } from "@/lib/web";
import { marcarSolicitud } from "@/acciones/web";

const UA = "Mozilla/5.0 (Linux; Android 13; SM-G780G) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";
let ipN = 0;
function peticion(url: string, cuerpo: unknown, cab: Record<string, string> = {}) {
  ipN++;
  return new Request(`http://127.0.0.1:3013${url}`, {
    method: "POST",
    body: typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo),
    headers: { "content-type": "text/plain;charset=UTF-8", origin: "https://neracosu.com", "user-agent": UA, "x-forwarded-for": `10.1.0.${ipN % 250}`, ...cab },
  });
}
const vista = { s: "sesion12345", t: "vista", r: "/para/hoteles.html?fbclid=1", o: "lm.facebook.com", m: true };
const solicitud = { nombre: "Ana Pérez", email: "ana@hotel.com", phone: "", type: "Software a Medida", budget: "", message: "Quiero un sistema para mi hotel", pagina: "/", sesion: "sesion12345", sitio: "" };

describe.runIf(DB_HABILITADA)("medicion de la web", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  beforeAll(async () => { await limpiarBase(); ids = await sembrarBasico(); });
  beforeEach(async () => {
    _reiniciarIntentos(); correos.length = 0;
    await prisma.eventoWeb.deleteMany(); await prisma.solicitudWeb.deleteMany();
    sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" };
  });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("guarda una vista que viene de neracosu.com, sin la consulta de la URL", async () => {
    const r = await postEvento(peticion("/api/web/evento", vista));
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-origin")).toBe("https://neracosu.com");
    const filas = await prisma.eventoWeb.findMany();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ sesion: "sesion12345", tipo: "vista", ruta: "/para/hoteles.html", origen: "lm.facebook.com", movil: true });
  });

  it("no guarda nada de otro origen, de un robot ni un cuerpo roto", async () => {
    expect((await postEvento(peticion("/api/web/evento", vista, { origin: "https://otro.com" }))).status).toBe(403);
    expect((await postEvento(peticion("/api/web/evento", vista, { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" }))).status).toBe(204);
    expect((await postEvento(peticion("/api/web/evento", "{no es json"))).status).toBe(400);
    expect((await postEvento(peticion("/api/web/evento", { ...vista, t: "compra" }))).status).toBe(400);
    expect(await prisma.eventoWeb.count()).toBe(0);
  });

  it("corta a la misma IP despues de 120 eventos por minuto", async () => {
    const cab = { "x-forwarded-for": "10.9.9.9" };
    for (let i = 0; i < 120; i++) await postEvento(peticion("/api/web/evento", { s: "sesion12345", t: "seccion", r: "/", d: "faq" }, cab));
    expect((await postEvento(peticion("/api/web/evento", vista, cab))).status).toBe(429);
  });

  it("responde la consulta previa del navegador solo a neracosu.com", async () => {
    const ok = await optionsEvento(new Request("http://x/api/web/evento", { method: "OPTIONS", headers: { origin: "https://www.neracosu.com" } }));
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-origin")).toBe("https://www.neracosu.com");
    const no = await optionsEvento(new Request("http://x/api/web/evento", { method: "OPTIONS", headers: { origin: "https://otro.com" } }));
    expect(no.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("guarda la solicitud y avisa por correo", async () => {
    const r = await postSolicitud(peticion("/api/web/solicitud", solicitud));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    const filas = await listarSolicitudes();
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ nombre: "Ana Pérez", correo: "ana@hotel.com", tipo: "Software a Medida", atendidaEn: null });
    expect(correos).toHaveLength(1);
    expect(correos[0].responderA).toBe("ana@hotel.com");
    expect(await solicitudesSinAtender()).toBe(1);
  });

  it("explica el error sin guardar; el campo trampa finge exito y no guarda", async () => {
    const mala = await postSolicitud(peticion("/api/web/solicitud", { ...solicitud, email: "", phone: "" }));
    expect(mala.status).toBe(400);
    expect((await mala.json()).mensaje).toMatch(/correo o su WhatsApp/);
    const robot = await postSolicitud(peticion("/api/web/solicitud", { ...solicitud, sitio: "spam" }));
    expect(robot.status).toBe(200);
    expect(await prisma.solicitudWeb.count()).toBe(0);
    expect(correos).toHaveLength(0);
  });

  it("no acepta solicitudes de otro origen ni mas de 5 en 15 minutos desde la misma IP", async () => {
    expect((await postSolicitud(peticion("/api/web/solicitud", solicitud, { origin: "https://otro.com" }))).status).toBe(403);
    const cab = { "x-forwarded-for": "10.8.8.8" };
    for (let i = 0; i < 5; i++) expect((await postSolicitud(peticion("/api/web/solicitud", solicitud, cab))).status).toBe(200);
    expect((await postSolicitud(peticion("/api/web/solicitud", solicitud, cab))).status).toBe(429);
  });

  it("el resumen sale de lo guardado y cuenta las solicitudes del periodo", async () => {
    await postEvento(peticion("/api/web/evento", { s: "aaaa11112222", t: "vista", r: "/", o: "" }));
    await postEvento(peticion("/api/web/evento", { s: "aaaa11112222", t: "clic", r: "/", d: "whatsapp" }));
    await postEvento(peticion("/api/web/evento", { s: "bbbb11112222", t: "vista", r: "/", o: "www.google.com" }));
    await postSolicitud(peticion("/api/web/solicitud", solicitud));
    const r = await resumenWeb(7);
    expect(r.personas).toBe(2);
    expect(r.embudo.at(-1)?.personas).toBe(1);
    expect(r.clics).toEqual([{ destino: "WhatsApp", personas: 1 }]);
  });

  it("solo el dueno marca una solicitud como atendida, y se puede desmarcar", async () => {
    await postSolicitud(peticion("/api/web/solicitud", solicitud));
    const [s] = await listarSolicitudes();
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
    await expect(marcarSolicitud(s.id, true)).rejects.toThrow("REDIRECT:/inicio");
    sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" };
    expect((await marcarSolicitud(s.id, true)).ok).toBe(true);
    expect(await solicitudesSinAtender()).toBe(0);
    expect((await marcarSolicitud(s.id, false)).ok).toBe(true);
    expect(await solicitudesSinAtender()).toBe(1);
    expect((await marcarSolicitud(999999, true)).ok).toBe(false);
  });

  it("guarda una solicitud de embudo con sus campos y la lista con ellos", async () => {
    const r = await postSolicitud(peticion("/api/web/solicitud", { nombre: "Luis", phone: "04141234567", type: "embudo", message: "", respuestas: { rubro: "comercio", actual: "web", objetivo: "cobros", tamano: "1", sistema: "cobros" }, calificacion: "demo", origen: "tiktok", sesion: "sesion12345", sitio: "" }));
    expect(r.status).toBe(200);
    const fila = (await listarSolicitudes()).find((s) => s.nombre === "Luis");
    expect(fila).toMatchObject({ tipo: "embudo", calificacion: "demo", origen: "tiktok" });
    expect(JSON.parse(fila!.respuestas)).toMatchObject({ rubro: "comercio" });
  });
  it("un evento paso se guarda y entra al resumen de /empezar", async () => {
    await postEvento(peticion("/api/web/evento", { s: "sesion77777", t: "vista", r: "/empezar", o: "tiktok", m: true }));
    await postEvento(peticion("/api/web/evento", { s: "sesion77777", t: "paso", r: "/empezar", d: "p1" }));
    const r = await resumenWeb(7);
    expect(r.empezar.personas).toBeGreaterThanOrEqual(1);
    expect(r.empezar.pasos.find((p) => p.id === "p1")!.personas).toBeGreaterThanOrEqual(1);
  });
});
