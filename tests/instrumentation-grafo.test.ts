import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.join(import.meta.dirname, "..", "src");

function resolver(desde: string, espec: string): string | null {
  const base = espec.startsWith("@/") ? path.join(SRC, espec.slice(2)) : espec.startsWith(".") ? path.resolve(path.dirname(desde), espec) : null;
  if (!base) return null; // paquete de npm
  for (const c of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) if (existsSync(c)) return c;
  return null;
}

// Imports estaticos (y re-exportaciones) y dinamicos de un archivo. Los `import type` se borran al compilar: no cuentan.
function importsDe(archivo: string): string[] {
  const codigo = readFileSync(archivo, "utf8");
  const salida: string[] = [];
  for (const m of codigo.matchAll(/^\s*(?:import|export)\s+(?!type\s)[^;]*?from\s+["']([^"']+)["']/gm)) salida.push(m[1]);
  for (const m of codigo.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) salida.push(m[1]);
  for (const m of codigo.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) salida.push(m[1]);
  return salida;
}

describe("grafo de src/instrumentation.ts", () => {
  it("ningun archivo de la cadena importa node: (Next la compila tambien para edge y deja todas las rutas en 500)", () => {
    const vistos = new Set<string>();
    const culpables: string[] = [];
    const cola = [path.join(SRC, "instrumentation.ts")];
    while (cola.length) {
      const archivo = cola.pop()!;
      if (vistos.has(archivo)) continue;
      vistos.add(archivo);
      for (const espec of importsDe(archivo)) {
        if (espec.startsWith("node:")) culpables.push(`${path.relative(SRC, archivo)} -> ${espec}`);
        const destino = resolver(archivo, espec);
        if (destino) cola.push(destino);
      }
    }
    expect(culpables).toEqual([]);
    const nombres = [...vistos].map((v) => path.relative(SRC, v));
    for (const prohibido of ["lib/pdf.ts", "lib/recibos.ts", "lib/propuesta.ts"]) expect(nombres).not.toContain(prohibido);
    expect(nombres).toContain("lib/mensualidades.ts"); // si esto falla, el test dejo de seguir la cadena
  });
});
