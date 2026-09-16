import { describe, it, expect } from "vitest";
import { claveProspecto } from "@/lib/clave-prospecto";
import { generarCodigo } from "@/lib/codigo";

describe("claveProspecto", () => {
  it("ignora mayusculas, acentos, puntuacion y espacios, como armar.py", () => {
    expect(claveProspecto("Hotel Yare", "Caracas (Sabana Grande)")).toBe("hotelyare|caracassabanagrande");
    expect(claveProspecto("HOTEL YARÉ ", " caracas (sabana grande)")).toBe("hotelyare|caracassabanagrande");
  });
});

describe("generarCodigo", () => {
  it("da 22 caracteres base64url distintos cada vez", () => {
    const a = generarCodigo(), b = generarCodigo();
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(a).not.toBe(b);
  });
});
