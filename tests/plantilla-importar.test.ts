import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { generarPlantillaXlsx, generarPlantillaCsv, leerXlsx } from "@/lib/plantilla-importar";
import { parsearTabla, COLUMNAS } from "@/lib/tabla-contrato";

describe("plantilla", () => {
  it("el CSV trae las columnas en orden y una fila de ejemplo", () => {
    const csv = generarPlantillaCsv();
    expect(csv.split("\n")[0]).toBe(COLUMNAS.join(";"));
    expect(parsearTabla(csv).filas[0].nombre).toBeTruthy();
  });

  it("el xlsx se genera y se vuelve a leer como TSV", async () => {
    const buf = await generarPlantillaXlsx();
    expect(buf.length).toBeGreaterThan(2000);
    const tsv = await leerXlsx(buf);
    const r = parsearTabla(tsv);
    expect(r.desconocidas).toEqual([]);
    expect(r.filas[0]).toMatchObject({ nicho: "hoteles" });
  });

  it("leerXlsx devuelve numeros y fechas como texto (un telefono no puede salir en notacion cientifica)", async () => {
    const wb = new ExcelJS.Workbook();
    const hoja = wb.addWorksheet("Hoja1");
    hoja.addRow(["nombre", "telefono", "nota"]);
    hoja.addRow(["Hotel Numérico", 4125551234, new Date(Date.UTC(2026, 8, 16, 12))]);
    const tsv = await leerXlsx(Buffer.from(await wb.xlsx.writeBuffer()));
    const celdas = tsv.trim().split("\n")[1].split("\t");
    expect(celdas[0]).toBe("Hotel Numérico");
    expect(celdas[1]).toBe("4125551234");
    // La fecha sale como aaaa-mm-dd (el dia puede correrse uno segun la zona del server).
    expect(celdas[2]).toMatch(/^2026-09-1[56]$/);
  });
});
