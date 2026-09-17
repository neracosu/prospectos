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
  it("convierte usuario o @usuario en la URL canonica", () => {
    expect(normalizarRed("@hotelyare", "instagram")).toBe("https://www.instagram.com/hotelyare/");
    expect(normalizarRed("hotelyare/", "instagram")).toBe("https://www.instagram.com/hotelyare/");
    expect(normalizarRed("hotelyare", "facebook")).toBe("https://www.facebook.com/hotelyare");
    expect(normalizarRed("@hotelyare", "tiktok")).toBe("https://www.tiktok.com/@hotelyare");
    expect(normalizarRed("", "tiktok")).toBe("");
  });
  it("reconoce el dominio de la red venga como venga (sin protocolo, sin www, con o sin barra final) y lo normaliza", () => {
    expect(normalizarRed("www.instagram.com/hotelx", "instagram")).toBe("https://www.instagram.com/hotelx/");
    expect(normalizarRed("instagram.com/hotelx/", "instagram")).toBe("https://www.instagram.com/hotelx/");
    expect(normalizarRed("https://www.instagram.com/hotelx", "instagram")).toBe("https://www.instagram.com/hotelx/");
    expect(normalizarRed("https://instagram.com/hotelyare", "instagram")).toBe("https://www.instagram.com/hotelyare/");
    expect(normalizarRed("facebook.com/hotelx", "facebook")).toBe("https://www.facebook.com/hotelx");
    expect(normalizarRed("www.facebook.com/hotelx/", "facebook")).toBe("https://www.facebook.com/hotelx");
    expect(normalizarRed("tiktok.com/@hotelx", "tiktok")).toBe("https://www.tiktok.com/@hotelx");
    expect(normalizarRed("https://www.tiktok.com/@hotelx/", "tiktok")).toBe("https://www.tiktok.com/@hotelx");
  });
  it("una URL con protocolo que no es de esta red NO normaliza", () => {
    // Guardarla tal cual la dejaba en la columna de Instagram, y despues cualquiera
    // la lee como si fuera el Instagram del negocio.
    expect(normalizarRed("https://hotelyare.com", "instagram")).toBe("");
    expect(normalizarRed("https://wa.me/584121234567", "facebook")).toBe("");
    expect(normalizarRed("https://instagram.com.ejemplo.test/hotelx", "instagram")).toBe("");
    expect(normalizarRed("https://", "instagram")).toBe("");
  });
  it("acepta los otros hosts de la misma red", () => {
    expect(normalizarRed("https://m.instagram.com/hotelx", "instagram")).toBe("https://www.instagram.com/hotelx/");
    expect(normalizarRed("https://fb.com/hotelx", "facebook")).toBe("https://www.facebook.com/hotelx");
    expect(normalizarRed("https://web.facebook.com/hotelx/", "facebook")).toBe("https://www.facebook.com/hotelx");
  });
  it("un enlace corto de TikTok se guarda tal cual: su codigo no es el usuario", () => {
    // "ZMabc123" es el codigo del enlace, no la cuenta: armar "@ZMabc123" seria
    // inventar un perfil que no existe.
    expect(normalizarRed("https://vm.tiktok.com/ZMabc123/", "tiktok")).toBe("https://vm.tiktok.com/ZMabc123/");
    expect(normalizarRed("https://vt.tiktok.com/ZSabc123", "tiktok")).toBe("https://vt.tiktok.com/ZSabc123");
  });
  it("sin protocolo distingue un dominio de un usuario", () => {
    // Un perfil compartido desde la app trae la query pegada: no es parte del usuario.
    expect(normalizarRed("instagram.com/usuario?igsh=abc", "instagram")).toBe("https://www.instagram.com/usuario/");
    expect(normalizarRed("https://www.instagram.com/usuario/?igsh=abc", "instagram")).toBe("https://www.instagram.com/usuario/");
    // Un dominio ajeno sin protocolo tampoco es un usuario de la red.
    expect(normalizarRed("mi-sitio.com/x", "instagram")).toBe("");
    // Pero un usuario con punto (son comunes en Instagram) sigue siendo un usuario.
    expect(normalizarRed("hotel.yare", "instagram")).toBe("https://www.instagram.com/hotel.yare/");
  });
});
