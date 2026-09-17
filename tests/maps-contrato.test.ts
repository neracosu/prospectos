import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { esUrlMaps, extraerFichaMaps } from "@/lib/maps-contrato";

describe("maps", () => {
  it("reconoce las formas de URL de Maps", () => {
    for (const u of ["https://www.google.com/maps/place/Hotel+Yare/@10.5,-66.9,17z", "https://maps.google.com/?cid=123", "https://maps.app.goo.gl/AbCdEf", "https://goo.gl/maps/xyz"]) expect(esUrlMaps(u)).toBe(true);
    expect(esUrlMaps("https://www.google.com/search?q=hotel")).toBe(false);
    expect(esUrlMaps("javascript:alert(1)")).toBe(false);
  });
  it("no confunde un dominio parecido con el de Google (borde de host)", () => {
    expect(esUrlMaps("https://evilgoogle.com/maps/x")).toBe(false);
  });
  it("lee la ficha desde los meta y el HTML inicial; null si no hay og:title", () => {
    const html = readFileSync(path.join(import.meta.dirname, "fixtures", "maps-ficha.html"), "utf8");
    expect(extraerFichaMaps(html)).toEqual({ nombre: "Hotel Yare", direccion: "Av. Las Acacias, Sabana Grande, Caracas", telefono: "+58 212-7930708", web: "https://www.hotelyare.com.ve/" });
    expect(extraerFichaMaps("<html><title>x</title></html>")).toBeNull();
  });
  it("el web no cae en el CDN de fotos de Google ni en otros dominios propios", () => {
    const conFoto = `<html><head><meta property="og:title" content="Hotel Yare - Google Maps"></head><body><script>["https://lh3.googleusercontent.com/p/x=w400","https://www.hotelyare.com.ve/"]</script></body></html>`;
    expect(extraerFichaMaps(conFoto)?.web).toBe("https://www.hotelyare.com.ve/");
    const soloGoogle = `<html><head><meta property="og:title" content="Hotel Yare - Google Maps"></head><body><script>["https://lh3.googleusercontent.com/p/x","https://maps.gstatic.com/x","https://www.google.com/x"]</script></body></html>`;
    expect(extraerFichaMaps(soloGoogle)?.web).toBe("");
  });
});
