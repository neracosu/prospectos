import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, crearProspectoDePrueba } from "./ayuda-db";
import { visitanteDe, resumirAparato } from "@/lib/rastro-contrato";
import { leerConfig, CLAVES } from "@/lib/configuracion";
import {
  registrarEnlace, listarEnlaces, enlacesActivosPorHost, desactivarEnlace, obtenerOCrearEnlacePlantilla, insertarVisitas, esPropia,
  cargarPropios, anotarVisitanteSesion, marcarVisitantePropio, guardarIpsPropias, leerIpsPropias, visitasDe, resumenesParaTablero,
  registrarEventoJs, type EnlaceFila, type VisitaNueva,
} from "@/lib/rastro";

const UA_NERI = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36";
const UA_PROSPECTO = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.3 Mobile/15E148 Safari/604.1";

describe.runIf(DB_HABILITADA)("rastro: enlaces, visitas, propios y visitante de sesion", () => {
  let p: Awaited<ReturnType<typeof crearProspectoDePrueba>>;
  let nichoId = 0;

  beforeEach(async () => {
    await limpiarBase();
    nichoId = (await sembrarBasico()).nichoId;
    p = await crearProspectoDePrueba(nichoId);
  });

  const enlace = async (url = "https://demo-ejemplo.neracosu.com/factura/", etiqueta = "Demo", prospectoId = p.id, enviadoEn?: Date) => {
    const r = await registrarEnlace({ prospectoId, url, etiqueta, enviadoEn });
    if (!r.ok) throw new Error(r.error);
    return r.enlace;
  };
  const visita = (enlaceId: number, o: Partial<VisitaNueva> = {}): VisitaNueva => ({
    enlaceId, fuente: "log", tipo: "vista", visitante: "v1", ip: "203.0.113.5", ua: UA_PROSPECTO, aparato: "iPhone", pais: "", ciudad: "", red: "",
    geoPendiente: true, ruta: "/factura/", detalle: "", origen: "", segundos: null, scroll: null, ocurrioEn: new Date(), ...o,
  });

  it("registra un enlace desde la URL, rechaza repetidos y hosts ajenos", async () => {
    const r = await registrarEnlace({ prospectoId: p.id, url: "https://demo-ejemplo.neracosu.com/factura/index.html", etiqueta: "Demo · factura" });
    expect(r.ok && r.enlace).toMatchObject({ host: "demo-ejemplo.neracosu.com", prefijo: "/factura/", origen: "manual", activo: true });
    expect(r.ok && r.enlace.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(await registrarEnlace({ prospectoId: p.id, url: "https://demo-ejemplo.neracosu.com/factura/", etiqueta: "Otra" })).toEqual({ ok: false, error: "Ese enlace ya esta registrado" });
    expect((await registrarEnlace({ prospectoId: p.id, url: "https://otro.com/x", etiqueta: "X" })).ok).toBe(false);
    expect(await registrarEnlace({ prospectoId: p.id, url: "no es url", etiqueta: "X" })).toEqual({ ok: false, error: "URL no es de neracosu.com" });
  });

  it("registrarEnlace rechaza el host del panel: el /p/ se registra solo", async () => {
    expect(await registrarEnlace({ prospectoId: p.id, url: `https://prospectos.neracosu.com/p/${p.codigo}`, etiqueta: "Propuesta" })).toEqual({ ok: false, error: "El enlace /p/ se registra solo" });
    expect(await prisma.enlaceEnviado.count()).toBe(0);
  });

  it("recorta la etiqueta a 40, lista, agrupa activos por host y desactiva", async () => {
    const a = await enlace("https://demo-ejemplo.neracosu.com/factura/", "  " + "e".repeat(60) + "  ");
    expect(a.etiqueta).toBe("e".repeat(40));
    const b = await enlace("https://demo-ejemplo.neracosu.com/panel/", "Demo · panel");
    expect((await listarEnlaces(p.id)).map((e) => e.id).sort()).toEqual([a.id, b.id].sort());
    expect((await enlacesActivosPorHost()).get("demo-ejemplo.neracosu.com")?.length).toBe(2);
    await desactivarEnlace(a.id);
    expect((await enlacesActivosPorHost()).get("demo-ejemplo.neracosu.com")?.map((e) => e.id)).toEqual([b.id]);
    // desactivado sigue contando como repetido
    expect(await registrarEnlace({ prospectoId: p.id, url: "https://demo-ejemplo.neracosu.com/factura/", etiqueta: "X" })).toEqual({ ok: false, error: "Ese enlace ya esta registrado" });
  });

  it("obtenerOCrearEnlacePlantilla crea una sola fila por codigo con enviadoEn del evento enviado", async () => {
    await prisma.evento.create({ data: { prospectoId: p.id, tipo: "enviado", canal: "whatsapp", creadoEn: new Date("2026-11-01T14:00:00Z") } });
    await prisma.evento.create({ data: { prospectoId: p.id, tipo: "enviado", canal: "correo", creadoEn: new Date("2026-11-03T14:00:00Z") } });
    const a = (await obtenerOCrearEnlacePlantilla(p.codigo))!; const b = (await obtenerOCrearEnlacePlantilla(p.codigo))!;
    expect(a.id).toBe(b.id); expect(a.prefijo).toBe(`/p/${p.codigo}`); expect(a.origen).toBe("plantilla"); expect(a.enviadoEn.toISOString()).toBe("2026-11-01T14:00:00.000Z");
    expect(a).toMatchObject({ host: "prospectos.neracosu.com", etiqueta: "Propuesta", activo: true });
    expect(await obtenerOCrearEnlacePlantilla("x".repeat(22))).toBeNull();
    expect(await obtenerOCrearEnlacePlantilla("invalido")).toBeNull();
  });

  it("obtenerOCrearEnlacePlantilla en paralelo no duplica", async () => {
    const [a, b] = await Promise.all([obtenerOCrearEnlacePlantilla(p.codigo), obtenerOCrearEnlacePlantilla(p.codigo)]);
    expect(a!.id).toBe(b!.id);
    expect(await prisma.enlaceEnviado.count()).toBe(1);
  });

  it("esPropia: misma IP con otro UA no es propia (CGNAT); lista manual si lo es por IP", async () => {
    await anotarVisitanteSesion("198.51.100.7", UA_NERI);
    await guardarIpsPropias(["203.0.113.99"]);
    const pr = await cargarPropios();
    expect(esPropia("198.51.100.7", visitanteDe("198.51.100.7", UA_NERI), pr)).toBe(true);
    expect(esPropia("198.51.100.7", visitanteDe("198.51.100.7", UA_PROSPECTO), pr)).toBe(false);
    expect(esPropia("203.0.113.99", visitanteDe("203.0.113.99", UA_PROSPECTO), pr)).toBe(true);
  });

  it("cargarPropios olvida visitantes de sesion de hace mas de 30 dias, salvo los marcados a mano", async () => {
    const viejo = new Date("2026-09-01T12:00:00Z");
    await anotarVisitanteSesion("198.51.100.7", UA_NERI, viejo);
    await marcarVisitantePropio("abcdef0123456789");
    const pr = await cargarPropios(new Date("2026-11-06T12:00:00Z"));
    expect(pr.visitantes.has(visitanteDe("198.51.100.7", UA_NERI))).toBe(false);
    expect(pr.visitantes.has("abcdef0123456789")).toBe(true);
    expect((await cargarPropios(new Date("2026-09-15T12:00:00Z"))).visitantes.has(visitanteDe("198.51.100.7", UA_NERI))).toBe(true);
    // entrar al panel con un visitante marcado a mano no le quita la fecha permanente
    await marcarVisitantePropio(visitanteDe("198.51.100.8", UA_NERI));
    await anotarVisitanteSesion("198.51.100.8", UA_NERI);
    expect((await cargarPropios(new Date("2027-06-01T12:00:00Z"))).visitantes.has(visitanteDe("198.51.100.8", UA_NERI))).toBe(true);
  });

  it("anotarVisitanteSesion no escribe dos veces en una hora y tope de 60", async () => {
    const t0 = new Date("2026-11-06T12:00:00Z");
    await anotarVisitanteSesion("198.51.100.7", UA_NERI, t0);
    await anotarVisitanteSesion("198.51.100.7", UA_NERI, new Date(t0.getTime() + 30 * 60_000));
    let mapa = JSON.parse(await leerConfig(CLAVES.rastroVisitantesSesion)) as Record<string, string>;
    expect(mapa).toEqual({ [visitanteDe("198.51.100.7", UA_NERI)]: t0.toISOString() });
    // pasada la hora, se refresca
    const t1 = new Date(t0.getTime() + 2 * 3600_000);
    await anotarVisitanteSesion("198.51.100.7", UA_NERI, t1);
    mapa = JSON.parse(await leerConfig(CLAVES.rastroVisitantesSesion));
    expect(mapa[visitanteDe("198.51.100.7", UA_NERI)]).toBe(t1.toISOString());
    // 60 UAs nuevos mas tarde: la entrada de Neri es la mas vieja y sale
    for (let i = 0; i < 60; i++) await anotarVisitanteSesion("198.51.100.7", `UA-${i}`, new Date(t1.getTime() + (i + 1) * 60_000));
    mapa = JSON.parse(await leerConfig(CLAVES.rastroVisitantesSesion));
    expect(Object.keys(mapa)).toHaveLength(60);
    expect(mapa[visitanteDe("198.51.100.7", UA_NERI)]).toBeUndefined();
    expect(mapa[visitanteDe("198.51.100.7", "UA-0")]).toBeDefined();
    expect(mapa[visitanteDe("198.51.100.7", "UA-59")]).toBeDefined();
  });

  it("guardarIpsPropias filtra basura, quita repetidas y reclasifica visitas viejas", async () => {
    const e = await enlace();
    await insertarVisitas([visita(e.id, { ip: "203.0.113.99", huella: "a1" }), visita(e.id, { ip: "203.0.113.5", huella: "a2" })], { ips: new Set(), visitantes: new Set() });
    await guardarIpsPropias(["203.0.113.99", " 203.0.113.99 ", "2001:db8::1", "no-ip", "1.2.3", "<b>"]);
    expect(await leerIpsPropias()).toEqual(["203.0.113.99", "2001:db8::1"]);
    const filas = await prisma.visitaEnlace.findMany({ orderBy: { huella: "asc" } });
    expect(filas.map((f) => [f.ip, f.propia])).toEqual([["203.0.113.99", true], ["203.0.113.5", false]]);
  });

  it("insertarVisitas salta huellas repetidas y marca propias; marcarVisitantePropio reclasifica", async () => {
    const e = (await registrarEnlace({ prospectoId: p.id, url: "https://demo-ejemplo.neracosu.com/factura/", etiqueta: "Demo" })) as { ok: true; enlace: EnlaceFila };
    const v = (huella: string, visitante = "v1"): VisitaNueva => ({ enlaceId: e.enlace.id, fuente: "log", tipo: "vista", visitante, ip: "203.0.113.5", ua: UA_PROSPECTO, aparato: "iPhone", pais: "", ciudad: "", red: "", geoPendiente: true, ruta: "/factura/", detalle: "", origen: "", segundos: null, scroll: null, huella, ocurrioEn: new Date() });
    expect(await insertarVisitas([v("h1"), v("h1"), v("h2", "v2")], { ips: new Set(), visitantes: new Set() })).toBe(2);
    expect(await marcarVisitantePropio("v2")).toBe(1);
    expect((await visitasDe(p.id)).map((x) => [x.visitante, x.propia])).toEqual(expect.arrayContaining([["v1", false], ["v2", true]]));
    // otra corrida con la misma huella no inserta; una visita de visitante propio sale propia
    expect(await insertarVisitas([v("h1"), v("h3", "v2")], { ips: new Set(), visitantes: new Set(["v2"]) })).toBe(1);
    expect((await prisma.visitaEnlace.findUnique({ where: { huella: "h3" } }))?.propia).toBe(true);
  });

  it("insertarVisitas recorta campos largos para no romper el modo estricto", async () => {
    const e = await enlace();
    expect(await insertarVisitas([visita(e.id, { huella: "l1", ua: "u".repeat(500), origen: "o".repeat(300), ruta: "/" + "r".repeat(300), detalle: "d".repeat(80), aparato: "a".repeat(90), pais: "p".repeat(90), ciudad: "c".repeat(90) })], { ips: new Set(), visitantes: new Set() })).toBe(1);
    const f = (await prisma.visitaEnlace.findFirst())!;
    expect([f.ua.length, f.origen.length, f.ruta.length, f.detalle.length, f.aparato.length, f.pais.length, f.ciudad.length]).toEqual([300, 120, 200, 40, 60, 60, 80]);
  });

  it("visitasDe trae la etiqueta del enlace, mas reciente primero, con limite", async () => {
    const e = await enlace("https://demo-ejemplo.neracosu.com/factura/", "Demo · factura");
    await insertarVisitas([
      visita(e.id, { huella: "t1", ocurrioEn: new Date("2026-11-05T10:00:00Z") }),
      visita(e.id, { huella: "t2", ocurrioEn: new Date("2026-11-06T10:00:00Z"), fuente: "js", tipo: "inicio" }),
    ], { ips: new Set(), visitantes: new Set() });
    const vs = await visitasDe(p.id);
    expect(vs.map((x) => x.ocurrioEn.toISOString())).toEqual(["2026-11-06T10:00:00.000Z", "2026-11-05T10:00:00.000Z"]);
    expect(vs[0]).toMatchObject({ etiqueta: "Demo · factura", fuente: "js", tipo: "inicio", enlaceId: e.id });
    expect(vs[0]).not.toHaveProperty("ip");
    expect(await visitasDe(p.id, 1)).toHaveLength(1);
  });

  it("resumenesParaTablero devuelve una linea por prospecto sin contar propias", async () => {
    const ahora = new Date("2026-11-06T12:00:00Z");
    const viejo = await enlace("https://demo-ejemplo.neracosu.com/viejo/", "Propuesta", p.id, new Date("2026-10-01T12:00:00Z"));
    const e = await enlace("https://demo-ejemplo.neracosu.com/factura/", "Demo · factura", p.id, new Date("2026-11-04T12:00:00Z"));
    await insertarVisitas([
      visita(viejo.id, { huella: "r1", visitante: "v1", ocurrioEn: new Date("2026-11-06T09:00:00Z") }),
      visita(e.id, { huella: "r2", visitante: "neri", ip: "198.51.100.7", ocurrioEn: new Date("2026-11-06T11:30:00Z") }),
      visita(e.id, { huella: "r3", visitante: "v1", tipo: "reenvio", ocurrioEn: new Date("2026-11-06T11:50:00Z") }),
    ], { ips: new Set(), visitantes: new Set(["neri"]) });
    const otro = await crearProspectoDePrueba(nichoId);
    const nuevo = await crearProspectoDePrueba(nichoId);
    await enlace("https://demo-ejemplo.neracosu.com/panel/", "Propuesta", nuevo.id, new Date("2026-11-06T10:00:00Z"));
    const m = await resumenesParaTablero([p.id, otro.id, nuevo.id], ahora);
    // la demo nueva solo la abrio Neri: la tarjeta nombra la propuesta, que si abrio el prospecto
    expect(m.get(p.id)).toBe("Vio la propuesta hace 3 h · la reenvió");
    expect(m.has(otro.id)).toBe(false);
    expect(m.get(nuevo.id)).toBe("Sin abrir · enviada hace 2 h");
    expect((await resumenesParaTablero([], ahora)).size).toBe(0);
  });

  it("resumenesParaTablero cuenta personas distintas entre todos los enlaces", async () => {
    const ahora = new Date("2026-11-06T12:00:00Z");
    const a = await enlace("https://demo-ejemplo.neracosu.com/a/", "Demo · a", p.id, new Date("2026-11-01T12:00:00Z"));
    const b = await enlace("https://demo-ejemplo.neracosu.com/b/", "Demo · b", p.id, new Date("2026-11-02T12:00:00Z"));
    await insertarVisitas([
      visita(a.id, { huella: "s1", visitante: "v1", ocurrioEn: new Date("2026-11-06T11:00:00Z") }),
      visita(b.id, { huella: "s2", visitante: "v1", fuente: "js", tipo: "inicio", ocurrioEn: new Date("2026-11-06T11:10:00Z") }),
      visita(b.id, { huella: "s3", visitante: "v2", ocurrioEn: new Date("2026-11-06T11:20:00Z") }),
      visita(b.id, { huella: "s4", visitante: "v3", tipo: "pdf", ocurrioEn: new Date("2026-11-06T11:59:00Z") }),
    ], { ips: new Set(), visitantes: new Set() });
    expect((await resumenesParaTablero([p.id], ahora)).get(p.id)).toBe("Vio la demo hace 40 min · 2 personas");
  });

  it("resumenesParaTablero: el enlace abierto de ultimo gana la etiqueta; sin aperturas, el enviado mas reciente", async () => {
    const ahora = new Date("2026-11-06T12:00:00Z");
    const prop = await enlace("https://demo-ejemplo.neracosu.com/propuesta/", "Propuesta", p.id, new Date("2026-11-01T12:00:00Z"));
    const demo = await enlace("https://demo-ejemplo.neracosu.com/factura/", "Demo · factura", p.id, new Date("2026-11-03T12:00:00Z"));
    await insertarVisitas([
      visita(prop.id, { huella: "w1", visitante: "v1", ocurrioEn: new Date("2026-11-05T12:00:00Z") }),
      visita(demo.id, { huella: "w2", visitante: "v1", ocurrioEn: new Date("2026-11-06T11:00:00Z") }),
    ], { ips: new Set(), visitantes: new Set() });
    // otro prospecto: solo visitas propias y un reenvio propio -> sin abrir, nombra el enviado mas reciente
    const q = await crearProspectoDePrueba(nichoId);
    const q1 = await enlace("https://demo-ejemplo.neracosu.com/q1/", "Propuesta", q.id, new Date("2026-11-04T12:00:00Z"));
    await enlace("https://demo-ejemplo.neracosu.com/q2/", "Demo · q2", q.id, new Date("2026-11-05T12:00:00Z"));
    await insertarVisitas([visita(q1.id, { huella: "w3", visitante: "neri", ocurrioEn: new Date("2026-11-06T11:00:00Z") }),
      visita(q1.id, { huella: "w4", visitante: "neri", tipo: "reenvio", ocurrioEn: new Date("2026-11-06T11:00:00Z") })], { ips: new Set(), visitantes: new Set(["neri"]) });
    const m = await resumenesParaTablero([p.id, q.id], ahora);
    expect(m.get(p.id)).toBe("Vio la demo hace 1 h");
    expect(m.get(q.id)).toBe("Sin abrir · enviada hace 1 d");
  });

  it("registrarEventoJs guarda inicio/fin/clic y rechaza token desconocido", async () => {
    const e = await enlace();
    const base = { token: e.token, ruta: "/factura/", origen: "", segundos: null, scroll: null, detalle: "" };
    expect(await registrarEventoJs({ ...base, tipo: "inicio" }, "203.0.113.5", UA_PROSPECTO)).toBe(true);
    expect(await registrarEventoJs({ ...base, tipo: "fin", segundos: 95, scroll: 80 }, "203.0.113.5", UA_PROSPECTO)).toBe(true);
    expect(await registrarEventoJs({ ...base, tipo: "clic", detalle: "boton-whatsapp" }, "203.0.113.5", UA_PROSPECTO)).toBe(true);
    expect(await registrarEventoJs({ ...base, token: "Z".repeat(22), tipo: "inicio" }, "203.0.113.5", UA_PROSPECTO)).toBe(false);
    const filas = await prisma.visitaEnlace.findMany({ orderBy: { id: "asc" } });
    expect(filas.map((f) => f.tipo)).toEqual(["inicio", "fin", "clic"]);
    for (const f of filas) expect(f).toMatchObject({ enlaceId: e.id, fuente: "js", visitante: visitanteDe("203.0.113.5", UA_PROSPECTO), geoPendiente: true, propia: false, huella: null, aparato: resumirAparato(UA_PROSPECTO), ip: "203.0.113.5" });
    expect(filas[1]).toMatchObject({ segundos: 95, scroll: 80 });
    expect(filas[2].detalle).toBe("boton-whatsapp");
    // enlace desactivado: rechaza; IP propia: marca propia
    await guardarIpsPropias(["198.51.100.7"]);
    expect(await registrarEventoJs({ ...base, tipo: "inicio" }, "198.51.100.7", UA_NERI)).toBe(true);
    expect((await prisma.visitaEnlace.findFirst({ where: { ip: "198.51.100.7" } }))?.propia).toBe(true);
    await desactivarEnlace(e.id);
    expect(await registrarEventoJs({ ...base, tipo: "inicio" }, "203.0.113.5", UA_PROSPECTO)).toBe(false);
  });
});
