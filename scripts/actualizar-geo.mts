// scripts/actualizar-geo.mts -- baja la base de ciudades DB-IP Lite (mensual) para geolocalizar las visitas del rastro.
// Uso: node_modules/.bin/tsx scripts/actualizar-geo.mts [--destino RUTA]
//   Destino por defecto: RASTRO_MMDB o ~/.config/prospectos/geo/dbip-city-lite.mmdb. Pesa unos 130 MB: correrlo a mano o 1 vez al mes.
//   Baja el .gz del mes actual (UTC; si da 404, el anterior), lo descomprime a <destino>.nuevo, exige > 50 MB y que 8.8.8.8
//   resuelva a un pais, y solo entonces rota: el anterior pasa a <destino>.anterior y el nuevo ocupa el nombre final.
// IP Geolocation by DB-IP (https://db-ip.com), CC BY 4.0.
import { existsSync, mkdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { abrirGeo } from "../src/lib/rastro-geo";

const arg = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const destino = arg("--destino") ?? process.env.RASTRO_MMDB ?? path.join(process.env.HOME ?? "/home/neracosu", ".config/prospectos/geo/dbip-city-lite.mmdb");
const nuevo = `${destino}.nuevo`;

const ahora = new Date();
const mes = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const candidatos = [mes(ahora), mes(new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() - 1, 1)))];

try {
  let gz: Buffer | null = null;
  let usado = "";
  for (const m of candidatos) {
    const r = await fetch(`https://download.db-ip.com/free/dbip-city-lite-${m}.mmdb.gz`);
    if (r.status === 404) continue;
    if (!r.ok) throw new Error(`HTTP ${r.status} al bajar ${m}`);
    gz = Buffer.from(await r.arrayBuffer());
    usado = m;
    break;
  }
  if (!gz) throw new Error(`no hay archivo para ${candidatos.join(" ni ")}`);
  mkdirSync(path.dirname(destino), { recursive: true });
  writeFileSync(nuevo, gunzipSync(gz));
  const mb = statSync(nuevo).size / 1_048_576;
  if (mb <= 50) throw new Error(`el archivo pesa ${mb.toFixed(1)} MB (se esperaba mas de 50)`);
  const lugar = abrirGeo(nuevo)?.("8.8.8.8");
  if (!lugar?.pais) throw new Error("el archivo nuevo no resuelve 8.8.8.8 a un pais");
  if (existsSync(destino)) renameSync(destino, `${destino}.anterior`);
  renameSync(nuevo, destino);
  console.log(`[geo] ${usado}: ${mb.toFixed(0)} MB, 8.8.8.8 -> ${lugar.pais}. Listo en ${destino}`);
} catch (err) {
  console.error(`[geo] fallo: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
