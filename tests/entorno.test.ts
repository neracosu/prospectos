import { describe, it, expect } from "vitest";
import os from "node:os";
import path from "node:path";

describe("entorno de tests", () => {
  it("los archivos de los tests van SIEMPRE a un directorio temporal, traiga lo que traiga el entorno", () => {
    // Los tests de recibos borran <dir>/recibos. El env de produccion define PROSPECTOS_DIR_ARCHIVOS: si se heredara,
    // la suite borraria los recibos reales, que no se regeneran nunca.
    const dir = path.resolve(process.env.PROSPECTOS_DIR_ARCHIVOS ?? "");
    expect(dir.startsWith(path.resolve(os.tmpdir()) + path.sep)).toBe(true);
    expect(dir).not.toContain("prospectos-archivos");
  });
});
