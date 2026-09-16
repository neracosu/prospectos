import { describe, it, expect } from "vitest";
import { normalizarCelular, normalizarRed } from "@/lib/celular-contrato";

describe("normalizarCelular", () => {
  it.each([
    ["0412-322-9005", "584123229005"],
    ["+58 412 3229005", "584123229005"],
    ["(0414) 555.12.34", "584145551234"],
    ["58 424 1234567", "584241234567"],
    ["0212.793.0708 / +58 412 3229005", "584123229005"], // toma el primer celular, ignora el fijo
    ["0212-7930708", ""], // fijo: no es celular
    ["", ""],
    ["0499 1234567", ""], // prefijo que no existe
  ])("%s -> %s", (entrada, salida) => {
    expect(normalizarCelular(entrada)).toBe(salida);
  });
});

describe("normalizarRed", () => {
  it("convierte usuario en URL y respeta una URL completa", () => {
    expect(normalizarRed("@hotelyare", "instagram")).toBe("https://www.instagram.com/hotelyare/");
    expect(normalizarRed("hotelyare/", "instagram")).toBe("https://www.instagram.com/hotelyare/");
    expect(normalizarRed("https://instagram.com/hotelyare", "instagram")).toBe("https://instagram.com/hotelyare");
    expect(normalizarRed("hotelyare", "facebook")).toBe("https://www.facebook.com/hotelyare");
    expect(normalizarRed("@hotelyare", "tiktok")).toBe("https://www.tiktok.com/@hotelyare");
    expect(normalizarRed("", "tiktok")).toBe("");
  });
});
