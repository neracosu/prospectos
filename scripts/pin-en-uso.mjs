#!/usr/bin/env node
// Revisa si un PIN ya esta en uso, en cualquier cuenta (activa o no), sin
// cambiar nada. El PIN se lee por stdin para que no quede en `ps` ni en el
// historial. Uso:
//   set -a; . ~/.config/prospectos/env; set +a
//   node scripts/pin-en-uso.mjs   <<< "123456"
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";

const pin = readFileSync(0, "utf8").trim();
if (!/^\d{6}$/.test(pin)) { console.error("El PIN son 6 digitos."); process.exit(1); }

const prisma = new PrismaClient();
for (const u of await prisma.usuario.findMany()) {
  if (await bcrypt.compare(pin, u.pinHash)) {
    console.log(`EN USO por #${u.id} ${u.nombre}`);
    await prisma.$disconnect();
    process.exit(1);
  }
}
console.log("libre");
await prisma.$disconnect();
