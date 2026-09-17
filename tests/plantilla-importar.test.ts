import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { generarPlantillaXlsx, generarPlantillaCsv, leerXlsx, decodificarTexto, AVISO_CSV } from "@/lib/plantilla-importar";
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
  it("la hoja de ayuda avisa de guardar el CSV en UTF-8", async () => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await generarPlantillaXlsx()) as unknown as ArrayBuffer);
    const ayuda = wb.getWorksheet("Cómo llenar")!;
    const textos: string[] = [];
    ayuda.eachRow((f) => textos.push(String(f.getCell(2).value ?? "")));
    expect(textos).toContain(AVISO_CSV);
  });

  it("leerXlsx prefiere la hoja Prospectos aunque no sea la primera", async () => {
    const wb = new ExcelJS.Workbook();
    const portada = wb.addWorksheet("Portada");
    portada.addRow(["Lista de hoteles", "preparada por alguien"]);
    const datos = wb.addWorksheet("Prospectos");
    datos.addRow(["nombre", "ciudad", "nicho"]);
    datos.addRow(["Hotel Segunda Hoja", "Caracas", "hoteles"]);
    const tsv = await leerXlsx(Buffer.from(await wb.xlsx.writeBuffer()));
    expect(parsearTabla(tsv).filas[0]).toMatchObject({ nombre: "Hotel Segunda Hoja", ciudad: "Caracas" });
  });

  it("decodificarTexto lee UTF-8 y cae a windows-1252 cuando el archivo no es UTF-8", () => {
    const utf8 = Buffer.from("nombre;ciudad\nPosada Añil;Mérida\n", "utf8");
    expect(decodificarTexto(utf8)).toContain("Posada Añil");
    // Lo mismo guardado por Excel en Windows (windows-1252): sin el respaldo se
    // leeria "Posada A?il" lleno de caracteres de reemplazo.
    const cp1252 = Buffer.from([...Buffer.from("nombre;ciudad\nPosada A", "latin1"), 0xf1, ...Buffer.from("il;M", "latin1"), 0xe9, ...Buffer.from("rida\n", "latin1")]);
    expect(decodificarTexto(cp1252)).toContain("Posada Añil");
    expect(decodificarTexto(cp1252)).toContain("Mérida");
  });
});
