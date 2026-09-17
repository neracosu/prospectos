// src/lib/plantilla-importar.ts -- plantilla Excel/CSV para que Neri (o quien sea)
// mande la lista en el formato que el panel entiende, y lectura de un .xlsx a TSV
// para reutilizar parsearTabla (una sola gramatica de importacion, no dos).
import ExcelJS from "exceljs";
import { COLUMNAS } from "@/lib/tabla-contrato";

const HOJA_DATOS = "Prospectos";
const HOJA_AYUDA = "Cómo llenar";

const EJEMPLO: Record<(typeof COLUMNAS)[number], string> = {
  nicho: "hoteles",
  nombre: "Hotel Ejemplo",
  ciudad: "Caracas",
  estado: "Distrito Capital",
  tipo: "hotel urbano",
  tamano: "20 hab.",
  telefono: "0212 555 12 34",
  whatsapp: "0412 555 12 34",
  email: "reservas@hotelejemplo.com",
  web: "https://hotelejemplo.com",
  instagram: "@hotelejemplo",
  facebook: "",
  tiktok: "",
  nota: "Solo lo que el negocio publica",
  fuente: "https://hotelejemplo.com/contacto",
};

const AYUDA: Record<(typeof COLUMNAS)[number], string> = {
  nicho: "hoteles o farmacias (como está en Ajustes)",
  nombre: "Obligatorio",
  ciudad: "Obligatorio",
  estado: "Estado de Venezuela",
  tipo: "Tipo de negocio, libre",
  tamano: "Ej. 20 hab.",
  telefono: "Fijo o celular, como lo publica el negocio",
  whatsapp: "Celular 0412/0414/0416/0424/0426/0422",
  email: "Correo publicado",
  web: "https://...",
  instagram: "@usuario o URL",
  facebook: "usuario o URL",
  tiktok: "@usuario o URL",
  nota: "Nota interna (nunca sale del panel)",
  fuente: "URL donde el negocio publica estos datos",
};

// Excel en Windows guarda el CSV en la codificacion del sistema (windows-1252) si
// no se le dice otra cosa, y ahi los acentos llegan rotos. El aviso va en la hoja
// de ayuda; leerlo igual cuando no hace caso es trabajo de decodificarTexto.
export const AVISO_CSV = "Si guardas como CSV, elige UTF-8";

export function generarPlantillaCsv(): string {
  return COLUMNAS.join(";") + "\n" + COLUMNAS.map((c) => EJEMPLO[c]).join(";") + "\n";
}

export async function generarPlantillaXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Panel de prospección NERACOSU";
  const hoja = wb.addWorksheet(HOJA_DATOS);
  hoja.addRow([...COLUMNAS]);
  hoja.addRow(COLUMNAS.map((c) => EJEMPLO[c]));
  hoja.getRow(1).font = { bold: true };
  for (const col of hoja.columns ?? []) col.width = 22;
  const ayuda = wb.addWorksheet(HOJA_AYUDA);
  ayuda.addRow(["Columna", "Qué va"]);
  ayuda.getRow(1).font = { bold: true };
  for (const c of COLUMNAS) ayuda.addRow([c, AYUDA[c]]);
  ayuda.addRow(["", ""]);
  ayuda.addRow(["CSV", AVISO_CSV]);
  ayuda.getColumn(1).width = 14;
  ayuda.getColumn(2).width = 60;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// Toda celda se devuelve como TEXTO: un telefono guardado como numero no puede
// salir en notacion cientifica ni perder el cero de adelante, y una fecha no puede
// salir como "Mon Sep 16 2026 ...". Lo que no se entiende queda vacio.
function celdaComoTexto(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return Number.isInteger(v) ? v.toFixed(0) : String(v);
  if (typeof v === "boolean") return v ? "sí" : "no";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    // Celda con enlace: {text, hyperlink}. Texto con formato: {richText:[{text}]}.
    // Formula: {formula, result}. Error: {error}.
    if (typeof o.text === "string") return o.text;
    if (Array.isArray(o.richText)) return o.richText.map((t) => celdaComoTexto((t as { text?: unknown }).text)).join("");
    if ("result" in o) return celdaComoTexto(o.result);
    if ("error" in o) return "";
  }
  return String(v);
}

// Primera hoja a TSV para reutilizar parsearTabla. Se indexa por numero de columna,
// asi que las celdas vacias del medio no corren las de la derecha.
export async function leerXlsx(buf: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  // Si el archivo trae la hoja de la plantilla, esa es la buena: alguien pudo
  // agregar una hoja adelante (un resumen, una portada) sin querer romper nada.
  const hoja = wb.getWorksheet(HOJA_DATOS) ?? wb.worksheets[0];
  if (!hoja) return "";
  const anchos = Math.max(hoja.columnCount, 1);
  const lineas: string[] = [];
  hoja.eachRow((fila) => {
    const celdas: string[] = [];
    for (let i = 1; i <= anchos; i++) celdas.push(celdaComoTexto(fila.getCell(i).value));
    // El TSV es una fila por linea: un salto o un tabulador dentro de una celda
    // partiria la fila en dos.
    lineas.push(celdas.map((c) => c.replace(/[\t\r\n]+/g, " ").trim()).join("\t"));
  });
  return lineas.join("\n") + "\n";
}

// Un .csv o .txt puede venir en UTF-8 (lo normal) o en windows-1252 (lo que deja
// Excel en Windows si no se elige otra cosa). Se prueba UTF-8 estricto y, si el
// buffer no es UTF-8 valido, se lee como windows-1252 en vez de llenar el archivo
// de caracteres de reemplazo.
export function decodificarTexto(buf: Buffer): string {
  let texto: string;
  try {
    texto = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    texto = new TextDecoder("windows-1252").decode(buf);
  }
  return texto.replace(/^\uFEFF/, "");
}
