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
  it("no saca correos de un script; un mailto con ?subject sigue funcionando", () => {
    const html = `<html><body>
<script>var t = "tracker@analytics-vendor.com";</script>
<a href="mailto:reservas@hotelx.com.ve?subject=Consulta">Escribenos</a>
</body></html>`;
    expect(extraerContactos(html, "https://hotelx.com.ve/").emails).toEqual(["reservas@hotelx.com.ve"]);
  });
  it("las redes con parametros de consulta se limpian a la URL canonica", () => {
    const html = '<a href="https://www.instagram.com/hotelx/?hl=en">IG</a>';
    expect(extraerContactos(html, "https://hotelx.com.ve/").instagram).toEqual(["https://www.instagram.com/hotelx/"]);
  });
});
