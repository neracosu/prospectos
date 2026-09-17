import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Toda pagina o ruta bajo src/app/c/ exige la sesion del cliente. Las dos excepciones son la entrada (pide el
// PIN, no puede exigir sesion) y salir (solo borra la cookie). Una ruta nueva sin guarda hace fallar este test.
const RAIZ = path.join(process.cwd(), "src", "app", "c");
const SIN_GUARDA = ["[codigo]/page.tsx", "[codigo]/salir/route.ts"];

describe("guardas del portal", () => {
  const archivos = readdirSync(RAIZ, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /^(page\.tsx|route\.ts)$/.test(e.name))
    .map((e) => path.relative(RAIZ, path.join(e.parentPath, e.name)).split(path.sep).join("/"));

  it("encuentra las pantallas del portal (si esto da cero, el test dejo de mirar)", () => {
    expect(archivos).toContain("[codigo]/inicio/page.tsx");
    expect(archivos).toContain("documentos/[id]/route.ts");
    for (const excepcion of SIN_GUARDA) expect(archivos).toContain(excepcion);
  });

  it.each(archivos.filter((a) => !SIN_GUARDA.includes(a)))("%s exige la sesion del cliente", (archivo) => {
    expect(readFileSync(path.join(RAIZ, archivo), "utf8")).toMatch(/\b(exigirCliente|sesionCliente)\(/);
  });
});
