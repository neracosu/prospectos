import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, crearProspectoDePrueba } from "./ayuda-db";
import { registrarEnlace, insertarVisitas, cargarPropios, type VisitaNueva } from "@/lib/rastro";
import { abrirGeo, lugarDesdeRegistro, esIpPrivada, redDeIp, geolocalizarPendientes } from "@/lib/rastro-geo";

describe("rastro-geo: partes puras", () => {
  it("abrirGeo devuelve null sin archivo y lugarDesdeRegistro prefiere espanol", () => {
    expect(abrirGeo("/ruta/que/no/existe.mmdb")).toBeNull();
    expect(lugarDesdeRegistro({ country: { names: { en: "Venezuela", es: "Venezuela" } }, city: { names: { en: "Caracas" } } })).toEqual({ pais: "Venezuela", ciudad: "Caracas", red: "" });
    expect(lugarDesdeRegistro({ country: { names: { en: "Spain", es: "Espana" } } })).toEqual({ pais: "Espana", ciudad: "", red: "" });
    expect(lugarDesdeRegistro(null)).toEqual({ pais: "", ciudad: "", red: "" });
    expect(lugarDesdeRegistro({ country: { names: { en: "p".repeat(90) } }, city: { names: { en: "c".repeat(120) } } })).toMatchObject({ pais: "p".repeat(60), ciudad: "c".repeat(80) });
    expect(redDeIp("203.0.113.5")).toBe("");
  });

  it("esIpPrivada reconoce los rangos privados, locales y la desconocida", () => {
    for (const ip of ["10.1.2.3", "172.16.0.1", "172.31.255.1", "192.168.1.4", "127.0.0.1", "169.254.1.1", "::1", "fc00::1", "fd12::9", "fe80::1", "desconocida"]) expect(esIpPrivada(ip), ip).toBe(true);
    for (const ip of ["203.0.113.5", "198.51.100.7", "172.32.0.1", "172.15.0.1", "8.8.8.8", "2001:db8::1"]) expect(esIpPrivada(ip), ip).toBe(false);
  });
});

describe.runIf(DB_HABILITADA)("geolocalizarPendientes", () => {
  let enlaceId = 0;
  beforeEach(async () => {
    await limpiarBase();
    const { nichoId } = await sembrarBasico();
    const p = await crearProspectoDePrueba(nichoId);
    const r = await registrarEnlace({ prospectoId: p.id, url: "https://demo-ejemplo.neracosu.com/factura/", etiqueta: "Demo" });
    if (!r.ok) throw new Error(r.error);
    enlaceId = r.enlace.id;
  });
  const visita = (ip: string, i: number): VisitaNueva => ({
    enlaceId, fuente: "log", tipo: "vista", visitante: `v${i}`, ip, ua: "UA", aparato: "iPhone", pais: "", ciudad: "", red: "", geoPendiente: true,
    ruta: "/factura/", detalle: "", origen: "", segundos: null, scroll: null, ocurrioEn: new Date(), huella: `h${String(i).padStart(3, "0")}`.padEnd(16, "0"),
  });
  const insertar = async (ips: string[], base = 0) => insertarVisitas(ips.map((ip, i) => visita(ip, base + i)), await cargarPropios());

  it("sin resolver o con IP privada cierra la pendiente sin lugar; con resolver llena el lugar", async () => {
    await insertar(["203.0.113.5", "198.51.100.7", "192.168.1.4"]);
    expect(await geolocalizarPendientes(2000, null)).toEqual({ resueltas: 0, sinDato: 3 });
    const filas = await prisma.visitaEnlace.findMany();
    expect(filas).toHaveLength(3);
    for (const f of filas) expect(f).toMatchObject({ geoPendiente: false, pais: "", ciudad: "", red: "" });

    await insertar(["203.0.113.5", "203.0.113.5", "192.168.1.4"], 10);
    const resolver = vi.fn((_ip: string) => ({ pais: "Venezuela", ciudad: "Caracas", red: "" }));
    expect(await geolocalizarPendientes(2000, resolver)).toEqual({ resueltas: 2, sinDato: 1 });
    expect(resolver.mock.calls.map((c) => c[0])).toEqual(["203.0.113.5"]); // una vez por IP y nunca la privada
    const llenas = await prisma.visitaEnlace.findMany({ where: { pais: "Venezuela" } });
    expect(llenas).toHaveLength(2);
    expect(llenas.every((f) => f.ciudad === "Caracas" && !f.geoPendiente)).toBe(true);
    expect(await prisma.visitaEnlace.count({ where: { geoPendiente: true } })).toBe(0);
  });

  it("un resolver que no conoce la IP la deja cerrada y sin lugar", async () => {
    await insertar(["198.51.100.7"]);
    expect(await geolocalizarPendientes(2000, () => null)).toEqual({ resueltas: 0, sinDato: 1 });
    expect(await prisma.visitaEnlace.findFirst()).toMatchObject({ geoPendiente: false, pais: "" });
  });
});
