import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { cierreInicial, cierreSeguimiento, pasarAlEnganche, PREGUNTA_POR_ARQUETIPO } from "@/lib/mensajes-nicho-contrato";
import { mensajeDeProspecto } from "@/lib/plantilla-mensaje";
import { fraseDePromo } from "@/lib/propuesta-contrato";
import { MENSAJE_CO_INICIAL, MENSAJE_CO_INICIAL_CON_PROPUESTA, MENSAJE_CO_SEGUIMIENTO, MENSAJE_CO_SEGUIMIENTO_CON_PROPUESTA } from "@/lib/colombia-contrato";

// Desde el 29-oct-2026 el primer mensaje no pide una reunion: pide dos lineas sobre como opera el negocio y ofrece el
// diagnostico gratis por escrito y, segun el caso, la demostracion con su marca. Nunca una llamada (regla de Neri).
const PROHIBIDO = /30 minutos|llamada|videollamada|reuni[oó]n/i;

const VIEJO_INICIAL = "Buenas, equipo de {nombre}. Soy Neri Colón, desarrollador de sistemas. Para tiendas con inventario tengo un sistema propio de ventas. Preparé una propuesta de 9 páginas para {nombre}: {enlace} {promo} ¿Le parece si en 30 minutos se lo muestro funcionando?";
const VIEJO_SEGUIMIENTO = "Buenas de nuevo, equipo de {nombre}. Le escribí hace unos días con una propuesta para la tienda: {enlace} Si prefiere, se lo muestro funcionando en una llamada de 30 minutos. Quedo atento.";

describe("cierre de los mensajes por nicho (enganche: diagnostico gratis + demostracion con su marca)", () => {
  it("cada arquetipo con propuesta tiene su pregunta calificadora", () => {
    for (const a of ["hoteles", "hoteles-estadia", "restaurantes-y-bares", "reservas", "comercio-y-tienda", "cobros-y-pagos", "citas-y-servicios"]) {
      expect(PREGUNTA_POR_ARQUETIPO[a], a).toBeTruthy();
    }
  });
  it("el cierre inicial pide dos lineas, ofrece el diagnostico gratis y no propone llamadas", () => {
    for (const a of Object.keys(PREGUNTA_POR_ARQUETIPO)) {
      const c = cierreInicial(a);
      expect(c).toContain("dos líneas");
      expect(c).toContain("diagnóstico gratis por escrito");
      expect(c).not.toMatch(PROHIBIDO);
      expect(cierreSeguimiento(a)).not.toMatch(PROHIBIDO);
    }
  });
  it("en citas no se promete demostracion (la agenda no esta construida): se dice que esta hecho y que falta", () => {
    expect(cierreInicial("citas-y-servicios")).not.toContain("demostración");
    expect(cierreInicial("citas-y-servicios")).toContain("qué falta");
    expect(cierreInicial("comercio-y-tienda")).toContain("demostración con su marca");
    expect(cierreInicial("comercio-y-tienda")).toContain("cuando el caso lo permite");
  });
  it("pasarAlEnganche cambia solo la pregunta final del mensaje viejo y deja el resto como estaba", () => {
    const ini = pasarAlEnganche(VIEJO_INICIAL, "comercio-y-tienda", "inicial");
    expect(ini.startsWith("Buenas, equipo de {nombre}. Soy Neri Colón, desarrollador de sistemas. Para tiendas con inventario tengo un sistema propio de ventas. Preparé una propuesta de 9 páginas para {nombre}: {enlace} {promo} ")).toBe(true);
    expect(ini).not.toMatch(PROHIBIDO);
    expect(ini).toContain("cómo lleva hoy el inventario");
    const seg = pasarAlEnganche(VIEJO_SEGUIMIENTO, "comercio-y-tienda", "seguimiento");
    expect(seg.startsWith("Buenas de nuevo, equipo de {nombre}. Le escribí hace unos días con una propuesta para la tienda: {enlace} ")).toBe(true);
    expect(seg.endsWith("Quedo atento.")).toBe(true);
    expect(seg).not.toMatch(PROHIBIDO);
  });
  it("es idempotente y respeta un mensaje que Neri ya haya editado sin la pregunta vieja", () => {
    const una = pasarAlEnganche(VIEJO_INICIAL, "reservas", "inicial");
    expect(pasarAlEnganche(una, "reservas", "inicial")).toBe(una);
    const editado = "Hola {nombre}, le mando la propuesta: {enlace} {promo} Cuando quiera la vemos.";
    expect(pasarAlEnganche(editado, "reservas", "inicial")).toBe(editado);
  });
  it("el mensaje armado no deja variables ni dobles espacios, con y sin temporada", () => {
    const base = pasarAlEnganche(VIEJO_INICIAL, "comercio-y-tienda", "inicial");
    for (const hoy of ["2026-11-01", "2027-01-15"]) {
      const m = mensajeDeProspecto(base, { nombre: "Bodegón La Esquina", enlace: "https://p.test/x", promo: fraseDePromo(hoy) });
      expect(m).not.toMatch(/\{[a-z]+\}/);
      expect(m).not.toContain("  ");
      expect(m).toContain("antes de pagar nada");
    }
  });
});

describe("la semilla de nichos y los mensajes de Colombia ya traen el enganche", () => {
  const semilla = readFileSync("scripts/sembrar-nichos.mjs", "utf8");
  const mensajes = [...semilla.matchAll(/mensaje(Inicial|Seguimiento): "(.*)",\n/g)].map((m) => ({ tipo: m[1], texto: m[2] }));
  it("hay 20 nichos con sus dos mensajes y ninguno propone una llamada", () => {
    expect(mensajes.length).toBe(40);
    for (const m of mensajes) expect(m.texto, m.texto.slice(0, 60)).not.toMatch(PROHIBIDO);
  });
  it("los iniciales con propuesta ofrecen el diagnostico gratis y llevan {enlace} y {promo}", () => {
    const conPropuesta = mensajes.filter((m) => m.tipo === "Inicial" && m.texto.includes("{enlace}"));
    expect(conPropuesta.length).toBe(19);
    for (const m of conPropuesta) {
      expect(m.texto).toContain("{promo}");
      expect(m.texto).toContain("diagnóstico gratis por escrito");
    }
  });
  it("los de Colombia tambien", () => {
    for (const m of [MENSAJE_CO_INICIAL, MENSAJE_CO_SEGUIMIENTO, MENSAJE_CO_INICIAL_CON_PROPUESTA, MENSAJE_CO_SEGUIMIENTO_CON_PROPUESTA]) {
      expect(m).not.toMatch(PROHIBIDO);
      expect(m).toContain("diagnóstico gratis");
    }
  });
});
