#!/usr/bin/env node
// Convierte ~/.config/prospectos/env de DB_USER/DB_NAME/DB_PASS al formato de
// la app. Se corre UNA vez. Es idempotente: si ya hay DATABASE_URL no toca nada.
import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";

const RUTA = "/home/neracosu/.config/prospectos/env";
const texto = readFileSync(RUTA, "utf8");
if (/^DATABASE_URL=/m.test(texto)) {
  console.log("Ya esta convertido; no se toca.");
  process.exit(0);
}
const v = {};
for (const linea of texto.split("\n")) {
  const m = linea.match(/^([A-Z_]+)=(.*)$/);
  if (m) v[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, "$2");
}
for (const k of ["DB_USER", "DB_NAME", "DB_PASS"]) {
  if (!v[k]) { console.error(`Falta ${k} en ${RUTA}`); process.exit(1); }
}
// encodeURIComponent deja sin escapar ! ' ( ) *, y una contrasena de URL no
// puede llevarlos crudos: se codifican a mano los cinco.
const codificar = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
const pass = codificar(v.DB_PASS);
const url = (base) => `mysql://${v.DB_USER}:${pass}@localhost:3306/${base}`;
const salida = [
  "# Generado por scripts/convertir-env.mjs el " + new Date().toISOString().slice(0, 10),
  `DATABASE_URL=${url(v.DB_NAME)}`,
  "# Shadow: Prisma Migrate la necesita porque el usuario de cPanel no puede CREATE DATABASE.",
  `SHADOW_DATABASE_URL=${url(v.DB_NAME + "_shadow")}`,
  "# Base EXCLUSIVA de tests. El puente (tests/preparar-entorno.ts) aborta si la URL no dice prospectos_test.",
  `TEST_DATABASE_URL=${url(v.DB_NAME + "_test")}`,
  `SESION_SECRET=${randomBytes(32).toString("base64url")}`,
  "# Fija desde el primer build: sin ella cada build invalida las pestanas abiertas (ver spec, parte 3).",
  `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=${randomBytes(32).toString("base64")}`,
  "PORT=3013",
  "PROSPECTOS_DIR_ARCHIVOS=/home/neracosu/prospectos-archivos",
  "PROSPECTOS_URL_PUBLICA=https://prospectos.neracosu.com",
  "",
].join("\n");
writeFileSync(RUTA + ".bak-" + Date.now(), texto, { mode: 0o600 });
writeFileSync(RUTA, salida, { mode: 0o600 });
chmodSync(RUTA, 0o600);
console.log("Convertido. Respaldo del original junto al archivo.");
