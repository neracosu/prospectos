import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ciudadPorSlug } from "@/lib/overpass-contrato";
import {
  REGLAS_NICHO, SIN_EQUIVALENCIA, reglaDeNicho, cajaDeCiudad, ciudadDeLugar, prospectosDesdeOverture,
  validarLugar, puedeReemplazar, fechaDePublicacion, tomarLote, TOPE_LOTE, type LugarOverture,
} from "@/lib/overture-contrato";

const caracas = ciudadPorSlug("caracas")!;
const lugar = (extra: Partial<LugarOverture> = {}): LugarOverture => ({
  id: "a1", nombre: "Arepera Central", categoriaBase: "restaurant", categoriaFina: "venezuelan_restaurant",
  lat: 10.4806, lon: -66.9036, direccion: "Av. Urdaneta", telefonos: "+584141234567", correos: "arepera@gmail.com",
  webs: "", redes: "https://www.facebook.com/106177705403485", confianza: 0.9, publicacion: "2026-09-23.1", pais: "VE", ...extra,
});
const uno = (extra: Partial<LugarOverture> = {}, nicho = "restaurantes-y-bares", soloContactables = true) =>
  prospectosDesdeOverture([lugar(extra)], caracas, nicho, { soloContactables });

describe("overture: de nicho a categorias", () => {
  it("cada nicho sembrado tiene regla o esta en la lista de sin equivalencia, nunca las dos", () => {
    const fuente = readFileSync(path.join(import.meta.dirname, "..", "scripts", "sembrar-nichos.mjs"), "utf8");
    const slugs = [...fuente.matchAll(/slug: "([a-z-]+)"/g)].map((m) => m[1]);
    expect(slugs.length).toBe(19);
    for (const s of slugs) expect([s, Boolean(REGLAS_NICHO[s]) !== SIN_EQUIVALENCIA.includes(s)]).toEqual([s, true]);
    expect(Object.keys(REGLAS_NICHO).filter((s) => !slugs.includes(s))).toEqual([]);
  });
  it("hoteles de paso y cosmeticos no tienen regla", () => {
    expect(reglaDeNicho("hoteles")).toBeUndefined();
    expect(reglaDeNicho("cosmeticos")).toBeUndefined();
    expect(reglaDeNicho("loquesea")).toBeUndefined();
  });
  it("una barberia es de peluquerias y no de spas; un spa al reves", () => {
    const barberia = { categoriaBase: "personal_or_beauty_service", categoriaFina: "barber" };
    const spa = { categoriaBase: "wellness_service", categoriaFina: "spa" };
    expect(uno(barberia, "peluquerias-y-barberias")).toHaveLength(1);
    expect(uno(barberia, "spas-y-estetica")).toHaveLength(0);
    expect(uno(spa, "spas-y-estetica")).toHaveLength(1);
    expect(uno(spa, "peluquerias-y-barberias")).toHaveLength(0);
  });
  it("una panaderia es de emprendimientos de comida y no de restaurantes; un motel no es de estadia", () => {
    const panaderia = { categoriaBase: "casual_eatery", categoriaFina: "bakery" };
    expect(uno(panaderia, "emprendimientos-comida")).toHaveLength(1);
    expect(uno(panaderia, "restaurantes-y-bares")).toHaveLength(0);
    expect(uno({ categoriaBase: "hotel", categoriaFina: "motel" }, "hoteles-estadia")).toHaveLength(0);
    expect(uno({ categoriaBase: "hotel", categoriaFina: "hotel" }, "hoteles-estadia")).toHaveLength(1);
  });
  it("un nicho sin regla no devuelve nada", () => {
    expect(uno({ categoriaBase: "hotel", categoriaFina: "motel" }, "hoteles")).toEqual([]);
  });
});

describe("overture: de coordenadas a ciudad", () => {
  it("la caja encierra el circulo de la ciudad", () => {
    const c = cajaDeCiudad(caracas);
    expect(c.latMin).toBeLessThan(caracas.lat); expect(c.latMax).toBeGreaterThan(caracas.lat);
    expect(c.lonMin).toBeLessThan(caracas.lon); expect(c.lonMax).toBeGreaterThan(caracas.lon);
    // 18 km son 0,162 grados de latitud
    expect(c.latMax - caracas.lat).toBeGreaterThan(0.16); expect(c.latMax - caracas.lat).toBeLessThan(0.165);
  });
  it("en el solape gana el centro mas cercano", () => {
    // Cubierto por Valencia (15 km) y por Guacara (7 km); Guacara queda a menos de 4 km.
    expect(ciudadDeLugar(10.215, -67.91)?.slug).toBe("guacara");
    // El centro de La Guaira esta dentro del radio de Caracas.
    expect(ciudadDeLugar(10.6031, -66.9354)?.slug).toBe("la-guaira");
    expect(ciudadDeLugar(10.4806, -66.9036)?.slug).toBe("caracas");
  });
  it("lejos de toda ciudad no pertenece a ninguna", () => {
    expect(ciudadDeLugar(6.0, -66.0)).toBeUndefined();
  });
  it("un lugar del solape solo sale al buscar su ciudad", () => {
    const l = lugar({ lat: 10.215, lon: -67.91 });
    const op = { soloContactables: true };
    expect(prospectosDesdeOverture([l], ciudadPorSlug("guacara")!, "restaurantes-y-bares", op)).toHaveLength(1);
    expect(prospectosDesdeOverture([l], ciudadPorSlug("valencia")!, "restaurantes-y-bares", op)).toHaveLength(0);
  });
});

describe("overture: de lugar a prospecto", () => {
  it("arma la entrada con la ciudad elegida y la pagina de Facebook como fuente de cada dato", () => {
    const [e] = uno();
    expect(e).toMatchObject({
      nicho: "restaurantes-y-bares", nombre: "Arepera Central", ciudad: "Caracas", estado: "Distrito Capital",
      tipo: "venezuelan_restaurant", telefono: "+584141234567", whatsapp: "584141234567", email: "arepera@gmail.com",
      facebook: "https://www.facebook.com/106177705403485", nota: "Dirección: Av. Urdaneta",
      fuentes: ["https://www.facebook.com/106177705403485"],
    });
    expect(e.fuentesPorCampo).toEqual({
      nombre: e.fuentes![0], ciudad: e.fuentes![0], tipo: e.fuentes![0], telefono: e.fuentes![0],
      whatsapp: e.fuentes![0], email: e.fuentes![0], facebook: e.fuentes![0],
    });
  });
  it("un telefono fijo no va a WhatsApp; el movil se busca entre todos", () => {
    expect(uno({ telefonos: "+582127930708" })[0]).toMatchObject({ telefono: "+582127930708", whatsapp: "" });
    expect(uno({ telefonos: "+582127930708\n+584241112233" })[0]).toMatchObject({ telefono: "+582127930708", whatsapp: "584241112233" });
  });
  it("descarta el correo de intermediario, el mal formado y el de mas de 120; toma el siguiente bueno", () => {
    expect(uno({ correos: "reservas@explore.partners" })[0].email).toBe("");
    expect(uno({ correos: "reservas@explore.partners\nno-es-correo\nHotel@Gmail.com" })[0].email).toBe("hotel@gmail.com");
    expect(uno({ correos: `${"a".repeat(120)}@gmail.com` })[0].email).toBe("");
  });
  it("sin Facebook usa la web como fuente; sin Facebook ni web no entra", () => {
    const [e] = uno({ redes: "", webs: "https://areperacentral.com.ve/" });
    expect(e.fuentes).toEqual(["https://areperacentral.com.ve/"]);
    expect(e.web).toBe("https://areperacentral.com.ve/");
    expect(uno({ redes: "", webs: "" })).toEqual([]);
    expect(uno({ redes: "https://twitter.com/arepera", webs: "" })).toEqual([]);
  });
  it("un telefono escrito en las redes no se vuelve un Facebook inventado ni sirve de fuente", () => {
    // Overture trae 41 valores asi en `socials`: sin esto el lugar entraba con una pagina que no existe como fuente.
    expect(uno({ redes: "+58 414-7589235", webs: "" })).toEqual([]);
    const [e] = uno({ redes: "+58 414-7589235\ncarstoyotave", webs: "https://cars.com.ve/" });
    expect(e).toMatchObject({ facebook: "", instagram: "", fuentes: ["https://cars.com.ve/"] });
  });
  it("solo va a WhatsApp un movil venezolano exacto: ni un numero de otro pais ni uno con digitos de mas", () => {
    for (const malo of ["+14165551234", "+58241600850006", "+5842465395222", "+582124141234567"]) {
      expect([malo, uno({ telefonos: malo })[0].whatsapp]).toEqual([malo, ""]);
    }
    for (const bueno of ["+584141234567", "+58 414-123.45.67", "0414 1234567", "584141234567", "(0414) 123-4567"]) {
      expect([bueno, uno({ telefonos: bueno })[0].whatsapp]).toEqual([bueno, "584141234567"]);
    }
  });
  it("una web de mas de 191 caracteres o sin http no se toma", () => {
    expect(uno({ webs: `https://x.com/${"a".repeat(200)}\nhttps://corta.com/` })[0].web).toBe("https://corta.com/");
    expect(uno({ webs: "areperacentral.com.ve" })[0].web).toBe("");
  });
  it("la casilla quita lo que no tiene telefono ni correo; sin la casilla entra", () => {
    const mudo = { telefonos: "", correos: "" };
    expect(uno(mudo)).toEqual([]);
    expect(uno(mudo, "restaurantes-y-bares", false)).toHaveLength(1);
    expect(uno({ telefonos: "", correos: "a@b.co" })).toHaveLength(1);
  });
  it("saca el Instagram de las redes y ordena por confianza", () => {
    expect(uno({ redes: "https://www.facebook.com/arepera\nhttps://www.instagram.com/arepera/" })[0].instagram).toBe("https://www.instagram.com/arepera/");
    const r = prospectosDesdeOverture(
      [lugar({ id: "b", nombre: "Baja", confianza: 0.71 }), lugar({ id: "a", nombre: "Alta", confianza: 0.99 })],
      caracas, "restaurantes-y-bares", { soloContactables: true });
    expect(r.map((e) => e.nombre)).toEqual(["Alta", "Baja"]);
  });
});

describe("overture: carga", () => {
  const crudo = (extra: Record<string, unknown> = {}) => ({
    id: "08f2a", nombre: "Arepera Central", categoriaBase: "restaurant", categoriaFina: "venezuelan_restaurant",
    lat: 10.48, lon: -66.9, direccion: "Av. Urdaneta", telefonos: ["+584141234567", "+582127930708"],
    correos: ["a@gmail.com"], webs: [], redes: ["https://www.facebook.com/1"], confianza: 0.9, ...extra,
  });
  it("convierte un renglon valido y une las listas con un valor por renglon", () => {
    expect(validarLugar(crudo(), "2026-09-23.1")).toEqual({
      id: "08f2a", nombre: "Arepera Central", categoriaBase: "restaurant", categoriaFina: "venezuelan_restaurant",
      lat: 10.48, lon: -66.9, direccion: "Av. Urdaneta", telefonos: "+584141234567\n+582127930708",
      correos: "a@gmail.com", webs: "", redes: "https://www.facebook.com/1", confianza: 0.9, publicacion: "2026-09-23.1", pais: "VE",
    });
  });
  it("rechaza lo que no tiene id, nombre, categoria o coordenadas dentro de Venezuela", () => {
    for (const malo of [null, "texto", 7, crudo({ id: "" }), crudo({ nombre: "  " }), crudo({ categoriaBase: null }),
      crudo({ lat: "10" }), crudo({ lat: 40.4, lon: -3.7 }), crudo({ lon: Number.NaN }), crudo({ confianza: "alta" })]) {
      expect(validarLugar(malo, "2026-09-23.1")).toBeNull();
    }
  });
  it("limpia saltos de linea del nombre, recorta a los anchos de la tabla y deja 5 valores por lista", () => {
    const l = validarLugar(crudo({
      nombre: `Arepera\nCentral ${"x".repeat(300)}`, direccion: "d".repeat(300), categoriaFina: null,
      telefonos: ["1", "2", "3", "4", "5", "6", 7, " "],
    }), "2026-09-23.1")!;
    expect(l.nombre.startsWith("Arepera Central x")).toBe(true);
    expect(l.nombre).toHaveLength(191);
    expect(l.direccion).toHaveLength(191);
    expect(l.categoriaFina).toBe("");
    expect(l.telefonos).toBe("1\n2\n3\n4\n5");
  });
  it("solo reemplaza si lo nuevo es al menos la mitad de lo que hay", () => {
    expect(puedeReemplazar(0, 1)).toBe(true);
    expect(puedeReemplazar(0, 0)).toBe(false);
    expect(puedeReemplazar(20000, 10000)).toBe(true);
    expect(puedeReemplazar(20000, 9999)).toBe(false);
  });
  it("escribe la fecha de la publicacion como en Venezuela", () => {
    expect(fechaDePublicacion("2026-09-23.1")).toBe("23/09/2026");
    expect(fechaDePublicacion("rara")).toBe("rara");
  });
});

describe("overture: Colombia", () => {
  const bogota = ciudadPorSlug("bogota")!;
  const enBogota = (extra: Partial<LugarOverture> = {}) =>
    prospectosDesdeOverture([lugar({ lat: 4.711, lon: -74.0721, pais: "CO", telefonos: "+573145594975", ...extra })], bogota, "restaurantes-y-bares", { soloContactables: true });
  it("un lugar de Bogota entra con su ciudad, su departamento y el movil colombiano como WhatsApp", () => {
    expect(enBogota()[0]).toMatchObject({ ciudad: "Bogotá", estado: "Bogotá D.C.", telefono: "+573145594975", whatsapp: "573145594975" });
  });
  it("en Colombia un fijo o un numero con digitos de mas no va a WhatsApp, y el movil sin prefijo si", () => {
    expect(enBogota({ telefonos: "+576012345678" })[0].whatsapp).toBe("");
    expect(enBogota({ telefonos: "+5731455949755" })[0].whatsapp).toBe("");
    expect(enBogota({ telefonos: "314 559 4975" })[0].whatsapp).toBe("573145594975");
  });
  it("un lugar marcado de otro pais no entra aunque caiga en el radio de la ciudad", () => {
    expect(enBogota({ pais: "VE" })).toEqual([]);
  });
  it("la carga valida las coordenadas contra el pais que se esta cargando", () => {
    const crudo = { id: "c1", nombre: "Arepas Bogotá", categoriaBase: "restaurant", categoriaFina: "", lat: 4.711, lon: -74.0721, direccion: "", telefonos: [], correos: [], webs: [], redes: [], confianza: 0.9 };
    expect(validarLugar(crudo, "2026-09-23.1", "CO")).toMatchObject({ id: "c1", pais: "CO" });
    expect(validarLugar(crudo, "2026-09-23.1")).toBeNull(); // sin decir pais es Venezuela, y Bogota no esta en Venezuela
    expect(validarLugar({ ...crudo, lat: 10.48, lon: -66.9 }, "2026-09-23.1", "CO")).toMatchObject({ pais: "CO" }); // Caracas cae en la caja ancha de Colombia: la consulta por pais es la que filtra
    expect(validarLugar({ ...crudo, lat: 40.4, lon: -3.7 }, "2026-09-23.1", "CO")).toBeNull();
  });
});

describe("overture: tope por busqueda", () => {
  const muchas = (n: number) => prospectosDesdeOverture(
    Array.from({ length: n }, (_, i) => lugar({ id: `l${i}`, nombre: `Arepera ${i}`, confianza: 1 - i / 10000 })),
    caracas, "restaurantes-y-bares", { soloContactables: true });
  it("un lote lleva como mucho el tope, las de mayor confianza, y dice cuantas quedan", () => {
    expect(TOPE_LOTE).toBe(300);
    const r = tomarLote(muchas(750), new Set());
    expect(r.lote).toHaveLength(300);
    expect(r.lote[0].nombre).toBe("Arepera 0");
    expect(r.lote[299].nombre).toBe("Arepera 299");
    expect(r.quedan).toBe(450);
  });
  it("lo que ya paso por la bandeja no vuelve: la siguiente busqueda trae las siguientes", () => {
    const todas = muchas(750);
    const vistas = new Set(todas.slice(0, 300).map((e) => `${e.nombre}|${e.ciudad}`.toLowerCase().replace(/[^a-z0-9|]/g, "")));
    const r = tomarLote(todas, vistas);
    expect(r.lote[0].nombre).toBe("Arepera 300");
    expect(r.lote).toHaveLength(300);
    expect(r.quedan).toBe(150);
    expect(tomarLote(todas.slice(0, 5), vistas)).toEqual({ lote: [], quedan: 0 });
  });
});
