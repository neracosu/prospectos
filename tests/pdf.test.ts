import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DB_HABILITADA } from "./ayuda-db";
import { conTurnoGlobal, imprimirPdf, escribirAtomico, _generacionesParaTests } from "@/lib/pdf";

// Lanza Chromium de verdad: va con la suite real (npm run test:db), no con la pura.
describe.runIf(DB_HABILITADA)("pdf", () => {
  const dir = path.join(os.tmpdir(), `prospectos-pdf-test-${process.pid}`);

  it("imprimirPdf devuelve un PDF y cuenta la generacion", async () => {
    const antes = _generacionesParaTests();
    const bytes = await conTurnoGlobal(() => imprimirPdf('<!doctype html><html lang="es"><head><title>Hola</title></head><body><h1>Hola</h1></body></html>'));
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(_generacionesParaTests() - antes).toBe(1);
  }, 60_000);

  it("escribirAtomico crea el directorio, deja el archivo en 600, pisa el anterior y no deja temporales", async () => {
    rmSync(dir, { recursive: true, force: true });
    const salida = path.join(dir, "2026", "x.pdf");
    await escribirAtomico(salida, Buffer.from("uno"));
    await escribirAtomico(salida, Buffer.from("dos"));
    expect(readFileSync(salida, "utf8")).toBe("dos");
    expect(statSync(salida).mode & 0o777).toBe(0o600);
    expect(statSync(path.dirname(salida)).mode & 0o777).toBe(0o700);
    expect(readdirSync(path.dirname(salida))).toEqual(["x.pdf"]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("conTurnoGlobal corre las tareas de a una", async () => {
    let dentro = 0, maximo = 0;
    const tarea = () => conTurnoGlobal(async () => { dentro += 1; maximo = Math.max(maximo, dentro); await new Promise((r) => setTimeout(r, 30)); dentro -= 1; });
    await Promise.all([tarea(), tarea(), tarea()]);
    expect(maximo).toBe(1);
  });
});
