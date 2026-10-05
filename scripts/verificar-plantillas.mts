// scripts/verificar-plantillas.mts — renderiza cada plantilla de propuesta con un prospecto de ejemplo y avisa si
// alguna hoja A4 se desborda (lo que pdf.cjs hace con la de hoteles), sin escribir nada.
// Uso: npx tsx scripts/verificar-plantillas.mts [slug ...]
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { renderPropuesta } from "../src/lib/propuesta-contrato";

const DIR = path.join(process.cwd(), "plantillas");
const pedidas = process.argv.slice(2);
const slugs = (pedidas.length ? pedidas : readdirSync(DIR).filter((f) => f.endsWith(".html") && f !== "recibo.html").map((f) => f.replace(/\.html$/, "")));
const b = await chromium.launch();
const pg = await b.newPage();
let fallas = 0;
for (const slug of slugs) {
  const plantilla = readFileSync(path.join(DIR, `${slug}.html`), "utf8");
  for (const conWeb of [true, false]) {
    const html = renderPropuesta(plantilla, "Restaurante El Ejemplo Largo de Nombre C.A.", "#", { ciudad: "Valencia", rubro: "restaurantes y bares", conWeb, fecha: "2026-11-20", hoy: "2026-11-20" });
    await pg.setContent(html, { waitUntil: "networkidle" });
    await pg.evaluate(async () => { await (document as Document & { fonts: FontFaceSet }).fonts.ready; });
    await pg.emulateMedia({ media: "print" });
    const sobras = await pg.$$eval(".hoja", (hs) => hs.map((h, i) => [i + 1, h.scrollHeight - h.clientHeight] as const).filter(([, s]) => s > 0));
    const tokens = (html.match(/\{\{[a-z]+\}\}/g) ?? []).length + (html.match(/<!--(si|fin):/g) ?? []).length;
    const hojas = await pg.$$eval(".hoja", (hs) => hs.length);
    const estado = sobras.length || tokens ? "FALLA" : "ok";
    if (estado === "FALLA") fallas++;
    console.log(`${estado.padEnd(6)} ${slug.padEnd(24)} web=${conWeb ? "si" : "no"} hojas ${hojas}${sobras.length ? `  desbordadas (hoja, px): ${JSON.stringify(sobras)}` : ""}${tokens ? `  tokens sin rellenar: ${tokens}` : ""}`);
  }
}
await b.close();
process.exit(fallas ? 1 : 0);
