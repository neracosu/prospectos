// scripts/generar-iconos.mts — arma los PNG del manifiesto a partir de
// public/icono.svg. Android no acepta un SVG para el icono de la pantalla de
// inicio, y los PNG son los unicos binarios del repo: por eso se generan aca y
// no se dibujan a mano.
//
// Uso: npx tsx scripts/generar-iconos.mts
//
// El dibujo se pinta al 80 % sobre el fondo del panel: los iconos van con
// `purpose: "any maskable"` y Android le recorta hasta un 10 % por lado.
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const FONDO = "#0f1412"; // --fondo de src/app/globals.css
const TAMANOS = [192, 512];
const svg = readFileSync(new URL("../public/icono.svg", import.meta.url), "utf8");
const fuente = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

const b = await chromium.launch();
for (const lado of TAMANOS) {
  const pg = await b.newPage({ viewport: { width: lado, height: lado }, deviceScaleFactor: 1 });
  await pg.setContent(
    `<!doctype html><html><body style="margin:0;width:${lado}px;height:${lado}px;background:${FONDO};display:flex;align-items:center;justify-content:center">` +
      `<img src="${fuente}" style="width:80%;height:80%" alt=""></body></html>`,
  );
  const png = await pg.screenshot({ type: "png" });
  const destino = new URL(`../public/icono-${lado}.png`, import.meta.url);
  writeFileSync(destino, png);
  console.log(`${destino.pathname}: ${png.length} bytes`);
  await pg.close();
}
await b.close();
