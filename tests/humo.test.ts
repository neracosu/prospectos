import { describe, it, expect } from "vitest";
describe("entorno de tests", () => {
  it("carga el alias @ y las variables base", async () => {
    const m = await import("@/lib/fecha-caracas").catch(() => null);
    expect(m).toBeNull(); // todavia no existe: el test solo prueba que vitest arranca
    expect(process.env.SESION_SECRET).toBeTruthy();
  });
});
