import { describe, it, expect } from "vitest";
import { puedePasarProyecto, porcentajeAvance, semaforo, ESTADOS_PROYECTO } from "@/lib/proyectos-contrato";

describe("estados de proyecto", () => {
  it("en_construccion -> entregado -> activo -> pausado <-> activo; cerrado desde cualquiera", () => {
    expect(puedePasarProyecto("en_construccion", "entregado")).toBe(true);
    expect(puedePasarProyecto("entregado", "activo")).toBe(true);
    expect(puedePasarProyecto("activo", "pausado")).toBe(true);
    expect(puedePasarProyecto("pausado", "activo")).toBe(true);
    expect(puedePasarProyecto("en_construccion", "activo")).toBe(true); // un cliente viejo entra directo como activo
    for (const e of ESTADOS_PROYECTO) expect(puedePasarProyecto(e, "cerrado")).toBe(e !== "cerrado");
    expect(puedePasarProyecto("cerrado", "activo")).toBe(false);
    expect(puedePasarProyecto("activo", "en_construccion")).toBe(false);
  });
});

describe("porcentajeAvance", () => {
  it("solo cuenta visibles; sin visibles es null", () => {
    expect(porcentajeAvance([])).toBeNull();
    expect(porcentajeAvance([{ hecho: true, visibleCliente: false }])).toBeNull();
    expect(porcentajeAvance([{ hecho: true, visibleCliente: true }, { hecho: false, visibleCliente: true }, { hecho: true, visibleCliente: false }])).toBe(50);
    expect(porcentajeAvance([{ hecho: true, visibleCliente: true }, { hecho: true, visibleCliente: true }, { hecho: false, visibleCliente: true }])).toBe(67);
  });
});

describe("semaforo", () => {
  it("rojo si hay vencido, amarillo si hay por vencer, verde si no", () => {
    expect(semaforo(["pagado", "vencido", "por_vencer"])).toBe("rojo");
    expect(semaforo(["pagado", "por_vencer"])).toBe("amarillo");
    expect(semaforo(["pagado", "pendiente", "anulado"])).toBe("verde");
    expect(semaforo([])).toBe("verde");
  });
});
