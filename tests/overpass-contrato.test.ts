import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CIUDADES, ciudadPorSlug, ciudadPorNombre, paisDeCiudad, armarConsultaOverpass, prospectosDesdeOverpass } from "@/lib/overpass-contrato";

describe("overpass", () => {
  it("arma la consulta con around y todas las etiquetas del nicho", () => {
    const q = armarConsultaOverpass([["tourism", "hotel"], ["tourism", "motel"]], ciudadPorSlug("caracas")!);
    expect(q).toContain('[out:json][timeout:60]');
    expect(q).toContain('nwr["tourism"="hotel"](around:');
    expect(q).toContain('nwr["tourism"="motel"](around:');
    expect(q).toContain("out center tags;");
  });
  it("las ciudades tienen slug y nombre unicos y coordenadas dentro de su pais", () => {
    expect(new Set(CIUDADES.map((c) => c.slug)).size).toBe(CIUDADES.length);
    expect(new Set(CIUDADES.map((c) => c.nombre)).size).toBe(CIUDADES.length);
    const caja = { VE: [0, 13, -74, -59], CO: [-4.5, 13.5, -79.5, -66.5] } as const;
    for (const c of CIUDADES) {
      const [latMin, latMax, lonMin, lonMax] = caja[c.pais];
      expect([c.slug, c.lat > latMin && c.lat < latMax && c.lon > lonMin && c.lon < lonMax]).toEqual([c.slug, true]);
    }
  });
  it("Colombia arranca con siete ciudades y las venezolanas siguen siendo veintidos", () => {
    expect(CIUDADES.filter((c) => c.pais === "CO").map((c) => c.slug).sort())
      .toEqual(["barranquilla", "bogota", "cali", "cartagena", "cucuta", "medellin", "santa-marta"]);
    expect(CIUDADES.filter((c) => c.pais === "VE")).toHaveLength(22);
    expect(ciudadPorSlug("cali")).toMatchObject({ nombre: "Cali", estado: "Valle del Cauca", pais: "CO" });
    expect(ciudadPorNombre("Cartagena de Indias")?.slug).toBe("cartagena");
    expect(ciudadPorNombre("Bogotá, D.C.")?.slug).toBe("bogota");
  });
  it("el pais de un prospecto sale de su ciudad; lo que no es una ciudad colombiana del panel es Venezuela", () => {
    expect(paisDeCiudad("Cali")).toBe("CO");
    expect(paisDeCiudad("Cúcuta")).toBe("CO");
    expect(paisDeCiudad("Caracas")).toBe("VE");
    expect(paisDeCiudad("San Cristóbal")).toBe("VE");
    expect(paisDeCiudad("En línea")).toBe("VE");
    expect(paisDeCiudad("")).toBe("VE");
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
