// Sin base: aca solo vive la decision de cuando parar de aprobar en bloque.
import { describe, it, expect } from "vitest";
import {
  siguientePasada,
  APROBACION_INICIAL,
  etiquetaOrigen,
  POR_PAGINA,
  type EstadoAprobacion,
} from "@/lib/revision-contrato";

describe("siguientePasada", () => {
  it("sigue mientras la pasada apruebe algo y queden filas", () => {
    const r = siguientePasada(APROBACION_INICIAL, { aprobadas: 500, fallidas: 0, quedan: 120 });
    expect(r.seguir).toBe(true);
    expect(r.estado).toMatchObject({ aprobadas: 500, fallidas: 0, quedan: 120, pasadas: 1 });
  });

  it("para cuando no queda nada", () => {
    const r = siguientePasada(APROBACION_INICIAL, { aprobadas: 3, fallidas: 0, quedan: 0 });
    expect(r.seguir).toBe(false);
    expect(r.estado.aprobadas).toBe(3);
  });

  // El caso que importa: un lote con una fila de datos ilegibles. La primera
  // pasada aprueba la buena y falla la mala; la segunda no aprueba ninguna y
  // ahi se corta. Sin este corte la pantalla gira sin fin.
  it("con una fila ilegible: dos pasadas, fallidas de la ultima, y para", () => {
    let estado: EstadoAprobacion = APROBACION_INICIAL;
    let vueltas = 0;

    const primera = siguientePasada(estado, { aprobadas: 1, fallidas: 1, quedan: 1, primerError: "Datos inválidos" });
    estado = primera.estado;
    vueltas++;
    expect(primera.seguir).toBe(true);

    const segunda = siguientePasada(estado, { aprobadas: 0, fallidas: 1, quedan: 1, primerError: "Datos inválidos" });
    estado = segunda.estado;
    vueltas++;

    expect(segunda.seguir).toBe(false);
    expect(vueltas).toBe(2);
    expect(estado.pasadas).toBe(2);
    expect(estado.fallidas).toBe(1); // de la ultima pasada, no la suma
    expect(estado.aprobadas).toBe(1); // acumuladas
    expect(estado.quedan).toBe(1);
    expect(estado.primerError).toBe("Datos inválidos");
  });

  it("se queda con el primer error, no con el ultimo", () => {
    const a = siguientePasada(APROBACION_INICIAL, { aprobadas: 1, fallidas: 1, quedan: 2, primerError: "primero" });
    const b = siguientePasada(a.estado, { aprobadas: 0, fallidas: 2, quedan: 2, primerError: "segundo" });
    expect(b.estado.primerError).toBe("primero");
    expect(b.seguir).toBe(false);
  });
});

describe("etiquetas y topes", () => {
  it("traduce el origen y deja pasar lo desconocido", () => {
    expect(etiquetaOrigen("overpass")).toBe("Mapa (OSM)");
    expect(etiquetaOrigen("importado")).toBe("Importado");
    expect(etiquetaOrigen("overture")).toBe("Directorio abierto");
    expect(etiquetaOrigen("loquesea")).toBe("loquesea");
  });

  it("la pagina de la bandeja no es tan grande como para trabar un telefono", () => {
    expect(POR_PAGINA).toBeLessThanOrEqual(50);
  });
});

describe("repetidos sin valor", async () => {
  const { aportaAlgo, esRepetidoSinValor, REPETIDO_EN_ARCHIVO } = await import("@/lib/revision-contrato");
  it("aportaAlgo: solo cuenta un dato que el existente no tiene", () => {
    expect(aportaAlgo({ telefono: "1", email: "" }, { telefono: "2", email: "" })).toBe(false); // el mismo campo lleno no pisa nada
    expect(aportaAlgo({ telefono: "1", email: "" }, { email: "a@b.c" })).toBe(true);
    expect(aportaAlgo({ telefono: "1" }, { email: "   " })).toBe(false); // espacios no son un dato
    expect(aportaAlgo({}, {})).toBe(false);
  });
  it("esRepetidoSinValor: el del mismo archivo siempre; el «ya existe» solo si no aporta", () => {
    expect(esRepetidoSinValor([REPETIDO_EN_ARCHIVO], null, { web: "https://x.test" })).toBe(true);
    expect(esRepetidoSinValor([], { telefono: "1" }, { telefono: "1" })).toBe(true);
    expect(esRepetidoSinValor([], { telefono: "1" }, { nota: "Dirección: calle 2" })).toBe(false);
    expect(esRepetidoSinValor([], null, {})).toBe(false); // sin existente ni marca no es repetido: no se toca
  });
});
