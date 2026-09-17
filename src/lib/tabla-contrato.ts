import { normalizarCelular, normalizarRed } from "@/lib/celular-contrato";
import type { ProspectoEntrada } from "@/lib/importar";

export const COLUMNAS = ["nicho", "nombre", "ciudad", "estado", "tipo", "tamano", "telefono", "whatsapp", "email", "web", "instagram", "facebook", "tiktok", "nota", "fuente"] as const;
export type Columna = (typeof COLUMNAS)[number];
export const OBLIGATORIAS: Columna[] = ["nicho", "nombre", "ciudad"];
const MAX_FILAS = 5000;

function normalizarEncabezado(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
}
const ALIAS: Record<string, Columna> = { whatsapp: "whatsapp", celular: "whatsapp", telefono: "telefono", tel: "telefono", correo: "email", email: "email", mail: "email", pagina: "web", sitio: "web", web: "web", ig: "instagram", fb: "facebook", tamano: "tamano", habitaciones: "tamano", notas: "nota", nota: "nota", fuente: "fuente", fuentes: "fuente", url: "fuente" };

function detectarSeparador(linea: string): string {
  const c = { "\t": (linea.match(/\t/g) ?? []).length, ";": (linea.match(/;/g) ?? []).length, ",": (linea.match(/,/g) ?? []).length };
  return c["\t"] >= 1 ? "\t" : c[";"] >= c[","] ? ";" : ",";
}

// CSV simple: comillas dobles envuelven un campo y "" es una comilla literal.
function partir(linea: string, sep: string): string[] {
  const salida: string[] = []; let campo = ""; let dentro = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (dentro) { if (ch === '"' && linea[i + 1] === '"') { campo += '"'; i++; } else if (ch === '"') dentro = false; else campo += ch; }
    else if (ch === '"') dentro = true;
    else if (ch === sep) { salida.push(campo); campo = ""; }
    else campo += ch;
  }
  salida.push(campo);
  return salida.map((s) => s.trim());
}

export function parsearTabla(texto: string): { filas: Record<Columna, string>[]; desconocidas: string[]; error?: string } {
  const lineas = texto.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim() !== "");
  if (lineas.length < 2) return { filas: [], desconocidas: [], error: "Pega al menos la fila de encabezados y una fila de datos." };
  if (lineas.length - 1 > MAX_FILAS) return { filas: [], desconocidas: [], error: "Más de 5000 filas: pártelo." };
  const sep = detectarSeparador(lineas[0]);
  const encabezados = partir(lineas[0], sep);
  // Un separador colgante al final del encabezado (ej. "nombre;ciudad;nicho;") deja una
  // celda vacia que no es una columna desconocida: se descarta, no se reporta.
  while (encabezados.length && encabezados[encabezados.length - 1] === "") encabezados.pop();
  const mapa: (Columna | null)[] = []; const desconocidas: string[] = [];
  for (const e of encabezados) {
    const n = normalizarEncabezado(e);
    const col = (COLUMNAS as readonly string[]).includes(n) ? (n as Columna) : ALIAS[n] ?? null;
    mapa.push(col); if (!col) desconocidas.push(e);
  }
  const filas = lineas.slice(1).map((l) => {
    const vals = partir(l, sep); const fila = Object.fromEntries(COLUMNAS.map((c) => [c, ""])) as Record<Columna, string>;
    mapa.forEach((col, i) => { if (col && vals[i] !== undefined && fila[col] === "") fila[col] = vals[i]; });
    return fila;
  });
  return { filas, desconocidas };
}

export type EntradaValidada = ProspectoEntrada & { nicho: string; fuentesPorCampo: Record<string, string> };

export function validarFila(f: Record<Columna, string>): { entrada: EntradaValidada; errores: string[] } {
  const errores: string[] = [];
  if (!f.nicho.trim()) errores.push("Falta el nicho");
  if (!f.nombre.trim()) errores.push("Falta el nombre");
  if (!f.ciudad.trim()) errores.push("Falta la ciudad");
  const whatsapp = f.whatsapp.trim() ? normalizarCelular(f.whatsapp) : "";
  if (f.whatsapp.trim() && !whatsapp) errores.push("WhatsApp sin formato");
  const fuente = f.fuente.trim();
  const entrada: EntradaValidada = {
    nicho: f.nicho.trim().toLowerCase(), nombre: f.nombre.trim(), ciudad: f.ciudad.trim(), estado: f.estado.trim(), tipo: f.tipo.trim(), tamano: f.tamano.trim(),
    telefono: f.telefono.trim(), whatsapp: whatsapp || normalizarCelular(f.telefono) || "", email: f.email.trim(), web: f.web.trim(),
    instagram: normalizarRed(f.instagram, "instagram"), facebook: normalizarRed(f.facebook, "facebook"), tiktok: normalizarRed(f.tiktok, "tiktok"),
    nota: f.nota.trim(), fuentes: fuente ? [fuente] : [], fuentesPorCampo: {},
  };
  if (fuente) for (const c of ["nombre", "ciudad", "estado", "tipo", "tamano", "telefono", "whatsapp", "email", "web", "instagram", "facebook", "tiktok"] as const) if (entrada[c]) entrada.fuentesPorCampo[c] = fuente;
  return { entrada, errores };
}
