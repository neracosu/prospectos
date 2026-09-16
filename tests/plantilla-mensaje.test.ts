import { describe, it, expect } from "vitest";
import { rellenar } from "@/lib/plantilla-mensaje";

describe("rellenar", () => {
  it("sustituye {nombre} y {enlace} todas las veces", () => {
    expect(rellenar("Hola {nombre}. Mira {enlace}. Gracias, {nombre}.", { nombre: "Hotel Yare", enlace: "https://x/p/abc" }))
      .toBe("Hola Hotel Yare. Mira https://x/p/abc. Gracias, Hotel Yare.");
  });
  it("deja intacta una variable que no conoce", () => {
    expect(rellenar("Hola {nombre}, {monto}", { nombre: "A" })).toBe("Hola A, {monto}");
  });
  it("no interpreta llaves dentro del valor", () => {
    expect(rellenar("{nombre}", { nombre: "{enlace}" })).toBe("{enlace}");
  });
});
