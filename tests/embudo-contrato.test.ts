import { describe, it, expect } from "vitest";
import { puedePasar, esEtapa, ETAPAS } from "@/lib/embudo-contrato";

describe("embudo", () => {
  it("sigue el orden por_contactar -> enviado -> respondio -> reunion -> ganado", () => {
    expect(puedePasar("por_contactar", "enviado")).toBe(true);
    expect(puedePasar("enviado", "respondio")).toBe(true);
    expect(puedePasar("respondio", "reunion")).toBe(true);
    expect(puedePasar("respondio", "ganado")).toBe(true); // se puede cerrar sin reunion
    expect(puedePasar("reunion", "ganado")).toBe(true);
  });
  it("no retrocede, salvo reactivar un descartado", () => {
    expect(puedePasar("enviado", "por_contactar")).toBe(false);
    expect(puedePasar("ganado", "enviado")).toBe(false);
    expect(puedePasar("descartado", "por_contactar")).toBe(true);
  });
  it("se puede descartar desde cualquier etapa menos ganado", () => {
    for (const e of ETAPAS) {
      expect(puedePasar(e, "descartado")).toBe(e !== "ganado" && e !== "descartado");
    }
  });
  it("esEtapa filtra texto arbitrario", () => {
    expect(esEtapa("enviado")).toBe(true);
    expect(esEtapa("Enviado")).toBe(false);
  });
});
