// src/lib/propuesta.ts
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const DIR_PLANTILLAS = path.join(process.cwd(), "plantillas");
const dirArchivos = () => process.env.PROSPECTOS_DIR_ARCHIVOS ?? "/home/neracosu/prospectos-archivos";

export async function leerPlantilla(slug: string): Promise<string | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  try { return await readFile(path.join(DIR_PLANTILLAS, `${slug}.html`), "utf8"); } catch { return null; }
}

export function rutaPdf(codigo: string, hashPlantilla: string): string {
  return path.join(dirArchivos(), "propuestas", `${codigo}-${hashPlantilla}.pdf`);
}

export function hashDe(texto: string): string {
  return createHash("sha256").update(texto).digest("hex").slice(0, 12);
}

// Genera el PDF con Playwright (mismo criterio que ~/propuestas/hoteles/pdf.cjs) y lo
// guarda fuera del docroot. Si ya existe para esta plantilla, no regenera.
export async function generarPdf(codigo: string, html: string, hashPlantilla: string): Promise<string> {
  const salida = rutaPdf(codigo, hashPlantilla);
  try { await stat(salida); return salida; } catch { /* no existe: generar */ }
  await mkdir(path.dirname(salida), { recursive: true, mode: 0o700 });
  const { chromium } = await import("playwright");
  const b = await chromium.launch();
  try {
    const p = await b.newPage();
    try {
      await p.setContent(html, { waitUntil: "networkidle", timeout: 30_000 });
    } catch {
      // Si Google Fonts no responde (red bloqueada), seguir con "load" y
      // esperar solo las fuentes en vez de la quietud total de la red.
      await p.setContent(html, { waitUntil: "load", timeout: 30_000 });
    }
    await p.evaluate(async () => { await (document as any).fonts.ready; });
    await p.emulateMedia({ media: "print" });
    const pdf = await p.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    await writeFile(salida, pdf, { mode: 0o600 });
  } finally {
    await b.close();
  }
  return salida;
}
