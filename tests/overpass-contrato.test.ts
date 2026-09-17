import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CIUDADES, ciudadPorSlug, armarConsultaOverpass, prospectosDesdeOverpass } from "@/lib/overpass-contrato";

describe("overpass", () => {
  it("arma la consulta con around y todas las etiquetas del nicho", () => {
    const q = armarConsultaOverpass([["tourism", "hotel"], ["tourism", "motel"]], ciudadPorSlug("caracas")!);
    expect(q).toContain('[out:json][timeout:60]');
    expect(q).toContain('nwr["tourism"="hotel"](around:');
    expect(q).toContain('nwr["tourism"="motel"](around:');
    expect(q).toContain("out center tags;");
  });
  it("las ciudades tienen slug unico y coordenadas en Venezuela", () => {
    expect(new Set(CIUDADES.map((c) => c.slug)).size).toBe(CIUDADES.length);
    for (const c of CIUDADES) { expect(c.lat).toBeGreaterThan(0); expect(c.lat).toBeLessThan(13); expect(c.lon).toBeLessThan(-59); expect(c.lon).toBeGreaterThan(-74); }
  });
  it("mapea elementos a prospectos con fuente OSM por campo; ignora los sin nombre", () => {
    const json = JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures", "overpass.json"), "utf8"));
    const lista = prospectosDesdeOverpass(json, ciudadPorSlug("caracas")!, "hoteles");
    expect(lista).toHaveLength(2);
    expect(lista[0]).toMatchObject({ nicho: "hoteles", ciudad: "Caracas", estado: "Distrito Capital", whatsapp: "584121234567", web: "https://hotel-a.com", instagram: "https://www.instagram.com/hotela/" });
    expect(lista[0].fuentes).toEqual(["https://www.openstreetmap.org/node/1"]);
    expect(lista[0].fuentesPorCampo.telefono).toBe("https://www.openstreetmap.org/node/1");
    expect(lista[0].nota).toContain("Dirección:");
    expect(lista[1].fuentes).toEqual(["https://www.openstreetmap.org/way/2"]);
  });
});
