import { describe, it, expect } from "vitest";
import { validar } from "@/lib/validacion-contrato";

describe("validar (reglas del navegador, copia de las del servidor)", () => {
  it("vacio: solo falta si es requerido", () => {
    expect(validar({ tipo: "texto", min: 2, max: 120 }, "", true)).toBe("Este dato hace falta.");
    expect(validar({ tipo: "texto", min: 2, max: 120 }, "   ", true)).toBe("Este dato hace falta.");
    expect(validar({ tipo: "texto", min: 2, max: 120 }, "", false)).toBe("");
    expect(validar({ tipo: "monto" }, "", false)).toBe("");
  });
  it("texto: minimo y maximo contando sin espacios de los bordes", () => {
    expect(validar({ tipo: "texto", min: 2, max: 5 }, " a ", true)).toBe("Mínimo 2 letras.");
    expect(validar({ tipo: "texto", min: 2, max: 5 }, "abcdef", true)).toBe("Máximo 5 letras.");
    expect(validar({ tipo: "texto", min: 2, max: 5 }, " ab ", true)).toBe("");
    expect(validar({ tipo: "texto", max: 5 }, "a", false)).toBe("");
  });
  it("monto: igual que MONTO_TEXTO (sin punto de miles, coma o punto decimal, dos decimales)", () => {
    for (const bien of ["150", "150,50", "150.5", "0", "12345678,99"]) expect(validar({ tipo: "monto" }, bien, true)).toBe("");
    for (const mal of ["1.500,00", "150,555", "-5", "abc", "123456789", "$150"]) expect(validar({ tipo: "monto" }, mal, true)).toBe("Escribe el monto sin punto de miles, por ejemplo 150 o 150,50.");
  });
  it("fecha: AAAA-MM-DD real", () => {
    expect(validar({ tipo: "fecha" }, "2026-09-17", true)).toBe("");
    expect(validar({ tipo: "fecha" }, "2026-02-30", true)).toBe("Escribe una fecha válida.");
    expect(validar({ tipo: "fecha" }, "17/09/2026", true)).toBe("Escribe una fecha válida.");
  });
  it("entero: dentro del rango, sin decimales", () => {
    expect(validar({ tipo: "entero", min: 1, max: 28 }, "5", true)).toBe("");
    expect(validar({ tipo: "entero", min: 1, max: 28 }, "29", true)).toBe("Tiene que ser un número entre 1 y 28.");
    expect(validar({ tipo: "entero", min: 1, max: 28 }, "5.5", true)).toBe("Tiene que ser un número entre 1 y 28.");
    expect(validar({ tipo: "entero", min: 2, max: 12 }, "0", true)).toBe("Tiene que ser un número entre 2 y 12.");
  });
  it("un correo es texto con tope, como en el servidor: dos direcciones o una sin punto pasan", () => {
    expect(validar({ tipo: "texto", max: 120 }, "reservas@hotel.com / ventas@hotel.com", false)).toBe("");
    expect(validar({ tipo: "texto", max: 120 }, "info@hotel", false)).toBe("");
    expect(validar({ tipo: "texto", max: 120 }, "x".repeat(121), false)).toBe("Máximo 120 letras.");
  });
});
