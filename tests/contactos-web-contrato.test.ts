import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { extraerContactos } from "@/lib/contactos-web-contrato";

const html = readFileSync(path.join(import.meta.dirname, "fixtures", "web-negocio.html"), "utf8");
describe("extraerContactos", () => {
  it("saca correos, celulares (wa.me y en texto) y redes, ignorando trampas", () => {
    const c = extraerContactos(html, "https://hotelx.com.ve/");
    expect(c.emails).toEqual(["reservas@hotelx.com.ve"]);
    expect(c.celulares).toEqual(["584121234567", "584145551234"]);
    expect(c.instagram).toEqual(["https://www.instagram.com/hotelx/"]);
    expect(c.facebook).toEqual(["https://www.facebook.com/hotelx"]);
    expect(c.tiktok).toEqual(["https://www.tiktok.com/@hotelx"]);
  });
  it("con HTML vacio devuelve listas vacias", () => {
    expect(extraerContactos("", "https://x/")).toEqual({ emails: [], celulares: [], instagram: [], facebook: [], tiktok: [] });
  });
});
