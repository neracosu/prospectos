import { describe, it, expect } from "vitest";
import { ordenarCola } from "@/lib/cola-contrato";

const base = { telefono: "", email: "", instagram: "", facebook: "", tiktok: "" };

describe("ordenarCola", () => {
  it("WhatsApp primero, luego telefono/email, luego redes, luego nada; dentro de cada grupo por ordenCola", () => {
    const lista = [
      { id: 1, ordenCola: 1, whatsapp: "", ...base, instagram: "https://i/x" },
      { id: 2, ordenCola: 2, whatsapp: "584120000000", ...base },
      { id: 3, ordenCola: 3, whatsapp: "", ...base },
      { id: 4, ordenCola: 4, whatsapp: "", ...base, email: "a@b.co" },
      { id: 5, ordenCola: 0, whatsapp: "584120000001", ...base },
    ];
    expect(ordenarCola(lista).map((p) => p.id)).toEqual([5, 2, 4, 1, 3]);
  });
  it("no muta la lista original", () => {
    const lista = [{ id: 1, ordenCola: 2, whatsapp: "", ...base }, { id: 2, ordenCola: 1, whatsapp: "5841", ...base }];
    ordenarCola(lista);
    expect(lista[0].id).toBe(1);
  });
});
