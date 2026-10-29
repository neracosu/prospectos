import { describe, it, expect } from "vitest";
import { seccionesPara, barraPara, estaActiva, RUTAS_VIEJAS } from "@/lib/navegacion-contrato";

describe("navegacion", () => {
  it("el dueno ve ocho secciones en este orden (Cobros desde la fase 3)", () => {
    expect(seccionesPara("dueno").map((s) => s.href)).toEqual(["/inicio", "/leads", "/solicitudes", "/cobros", "/proyectos", "/directorio", "/web", "/ajustes"]);
  });
  it("el prospectador ve cuatro y ninguna del dueno", () => {
    const h = seccionesPara("prospectador").map((s) => s.href);
    expect(h).toEqual(["/inicio", "/leads", "/directorio", "/ajustes/mi-pin"]);
    for (const x of ["/solicitudes", "/proyectos", "/web", "/ajustes"]) expect(h).not.toContain(x);
  });
  it("la barra del dueno son cuatro fijas (con Cobros) y Mas con Proyectos, Directorio, Web y Ajustes", () => {
    const b = barraPara("dueno");
    expect(b.fijas.map((s) => s.texto)).toEqual(["Inicio", "Leads", "Solicitudes", "Cobros"]);
    expect(b.mas.map((s) => s.href)).toEqual(["/proyectos", "/directorio", "/web", "/ajustes"]);
    expect(estaActiva("/cobros", "/cobros")).toBe(true);
    expect(estaActiva("/cobros", "/proyectos")).toBe(false);
    expect(barraPara("prospectador").mas).toEqual([]);
    expect(barraPara("prospectador").fijas.map((s) => s.href)).toEqual(["/inicio", "/leads", "/directorio", "/ajustes/mi-pin"]);
  });
  it("estaActiva: la coincidencia mas larga gana y /inicio es exacta", () => {
    expect(estaActiva("/leads/12", "/leads")).toBe(true);
    expect(estaActiva("/prospectos/12", "/directorio")).toBe(true); // la ficha de un directorio sigue en /prospectos/<id>
    expect(estaActiva("/ajustes/mi-pin", "/ajustes")).toBe(false);
    expect(estaActiva("/ajustes/mi-pin", "/ajustes/mi-pin")).toBe(true);
    expect(estaActiva("/ajustes", "/ajustes")).toBe(true);
    expect(estaActiva("/inicio", "/inicio")).toBe(true);
    expect(estaActiva("/iniciox", "/inicio")).toBe(false);
  });
  it("las rutas viejas llevan a las nuevas", () => { expect(RUTAS_VIEJAS["/hoy"]).toBe("/inicio"); expect(RUTAS_VIEJAS["/prospectos"]).toBe("/directorio?t=lista"); expect(RUTAS_VIEJAS["/buscar"]).toBe("/directorio?t=buscar"); });
});
