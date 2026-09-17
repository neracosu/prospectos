import { normalizarCelular, normalizarRed } from "@/lib/celular-contrato";
import { claveProspecto } from "@/lib/clave-prospecto";
import type { ProspectoEntrada } from "@/lib/importar";

export const COLUMNAS = ["nicho", "nombre", "ciudad", "estado", "tipo", "tamano", "telefono", "whatsapp", "email", "web", "instagram", "facebook", "tiktok", "nota", "fuente"] as const;
export type Columna = (typeof COLUMNAS)[number];
export const OBLIGATORIAS: Columna[] = ["nicho", "nombre", "ciudad"];
const MAX_FILAS = 5000;
// Topes de largo por campo, y la unica copia de los que se comparten con el
// formulario manual (`Nuevo`, en src/acciones/prospectos.ts, que los importa de
// aqui): nombre 120, ciudad 80 y estado 60. La razon de que sean esos y no el
// largo de la columna es que un prospecto no puede entrar por importacion con un
// largo que escrito a mano se rechaza.
// nombre y ciudad, ademas, son lo que alimenta a `clave`, que tambien es
// VARCHAR(191). Ojo que 120 + 1 del separador + 80 son 201: acortar los campos NO
// alcanza para que la clave quepa (y NFKD puede incluso expandir un caracter en
// varios), asi que lo que la protege es medir el par ya armado. Sin eso, un
// nombre de 120 con una ciudad de 80 llega a la base y MySQL responde P2000
// "value too long for column clave", que en la bandeja se ve como error generico.
// El resto de los textos del Prospecto son VARCHAR(191) (el largo por defecto de
// Prisma). `nota` es @db.Text, o sea 65535 BYTES, y en utf8mb4 el peor caso son 4
// bytes por caracter. `fuente` no va a un VARCHAR sino a un JSON: ahi el tope es
// el de una URL usable, porque las de Maps pasan de 191 con facilidad y 191 seria
// un falso error.
// validarFila es el unico paso por donde pasan los cuatro caminos de importacion:
// cortar aqui es lo que evita el "Data too long" al aprobar la fila.
export const TOPES = { nombre: 120, ciudad: 80, estado: 60, texto: 191, nota: 16000, fuente: 2000, clave: 191 } as const;
// Un solo texto para el largo del par: lo usan validarFila y el formulario manual.
export const ERROR_CLAVE_LARGA = `El nombre y la ciudad juntos no pueden pasar de ${TOPES.clave} caracteres`;
const LIMITES: [Columna, string, number][] = [
  ["nicho", "El nicho", TOPES.texto],
  ["nombre", "El nombre", TOPES.nombre],
  ["ciudad", "La ciudad", TOPES.ciudad],
  ["estado", "El estado", TOPES.estado],
  ["tipo", "El tipo", TOPES.texto],
  ["tamano", "El tamaño", TOPES.texto],
  ["telefono", "El teléfono", TOPES.texto],
  ["whatsapp", "El WhatsApp", TOPES.texto],
  ["email", "El correo", TOPES.texto],
  ["web", "La web", TOPES.texto],
  ["instagram", "El Instagram", TOPES.texto],
  ["facebook", "El Facebook", TOPES.texto],
  ["tiktok", "El TikTok", TOPES.texto],
  ["nota", "La nota", TOPES.nota],
  ["fuente", "La fuente", TOPES.fuente],
];

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
  // Una red que venia escrita y no se pudo entender se avisa, igual que el
  // WhatsApp: antes se perdia en silencio y la fila entraba "bien" sin el dato.
  for (const [columna, etiqueta] of [["instagram", "El Instagram"], ["facebook", "El Facebook"], ["tiktok", "El TikTok"]] as const) {
    if (f[columna].trim() && !entrada[columna]) errores.push(`${etiqueta} no se entiende`);
  }
  errores.push(...validarTopes(entrada));
  return { entrada, errores };
}

// Los topes de largo de una entrada ya armada. Vive aparte de validarFila porque
// las filas que NO vienen de una tabla (Overpass, una ficha de Maps) tienen que
// pasar por lo mismo: un nombre de 246 caracteres llega igual desde OpenStreetMap
// y, sin esto, la fila se ve bien en la bandeja y revienta con P2000 al aprobarla.
export function validarTopes(entrada: EntradaValidada): string[] {
  const errores: string[] = [];
  // Se mide el valor ya normalizado, que es el que va a la columna: normalizarRed
  // convierte "@usuario" en una URL y eso suma caracteres.
  for (const [campo, etiqueta, max] of LIMITES) {
    const valor =
      campo === "fuente"
        ? (entrada.fuentes ?? [])[0] ?? ""
        : String((entrada as unknown as Record<string, unknown>)[campo] ?? "");
    if (valor.length > max) errores.push(`${etiqueta} no puede pasar de ${max} caracteres`);
  }
  // El par, no cada campo: `clave` es VARCHAR(191) y se arma con los dos.
  if (claveProspecto(entrada.nombre, entrada.ciudad).length > TOPES.clave) errores.push(ERROR_CLAVE_LARGA);
  return errores;
}
