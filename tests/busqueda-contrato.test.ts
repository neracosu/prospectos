import { describe, it, expect } from "vitest";
import { normalizarConsulta, ordenarResultados, TOPE_RESULTADOS, type ResultadoBusqueda } from "@/lib/busqueda-contrato";

const r = (tipo: ResultadoBusqueda["tipo"], titulo: string, id = 1): ResultadoBusqueda => ({ tipo, id, titulo, sub: "", href: "/" });

describe("normalizarConsulta", () => {
  it("recorta, colapsa espacios y exige dos caracteres", () => {
    expect(normalizarConsulta("  hotel   alto ")).toBe("hotel alto");
    expect(normalizarConsulta(" a ")).toBe("");
    expect(normalizarConsulta("   ")).toBe("");
    expect(normalizarConsulta("x".repeat(100))).toHaveLength(80);
  });
});

describe("ordenarResultados", () => {
  it("los que empiezan por la consulta van primero, sin acentos ni mayusculas; luego por tipo y titulo; tope 20", () => {
    const lista = [r("directorio", "Panadería Alto Mar"), r("cliente", "Álto Mar C.A."), r("lead", "Hotel Alto Mar"), r("proyecto", "alto mar web"), r("lead", "Altos del Mar")];
    expect(ordenarResultados("alto", lista).map((x) => x.titulo)).toEqual(["Altos del Mar", "alto mar web", "Álto Mar C.A.", "Hotel Alto Mar", "Panadería Alto Mar"]);
    const muchos = Array.from({ length: 30 }, (_, i) => r("directorio", `Negocio ${i}`, i));
    expect(ordenarResultados("negocio", muchos)).toHaveLength(TOPE_RESULTADOS);
  });
});
