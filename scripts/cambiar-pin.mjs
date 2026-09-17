#!/usr/bin/env node
// Cambia el PIN de una cuenta existente. El PIN se lee por stdin para que no
// quede en `ps` ni en el historial. Uso:
//   set -a; . ~/.config/prospectos/env; set +a
//   node scripts/cambiar-pin.mjs 3   <<< "123456"
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";

const [idTexto] = process.argv.slice(2);
const id = Number(idTexto);
if (!idTexto || !Number.isInteger(id) || id <= 0) {
  console.error("Uso: node scripts/cambiar-pin.mjs <id>  (PIN por stdin)");
  process.exit(1);
}
const pin = readFileSync(0, "utf8").trim();
if (!/^\d{6}$/.test(pin)) { console.error("El PIN son 6 digitos."); process.exit(1); }

const prisma = new PrismaClient();
const cuenta = await prisma.usuario.findUnique({ where: { id } });
if (!cuenta) { console.error(`No existe la cuenta #${id}.`); await prisma.$disconnect(); process.exit(1); }

// La unicidad se exige contra TODAS las cuentas, activas o no, salvo la propia.
for (const u of await prisma.usuario.findMany({ where: { id: { not: id }, rol: { in: ["dueno", "prospectador"] } } })) {
  if (await bcrypt.compare(pin, u.pinHash)) {
    console.error(`Ese PIN ya lo usa otra cuenta (#${u.id} ${u.nombre}).`);
    await prisma.$disconnect();
    process.exit(1);
  }
}

const u = await prisma.usuario.update({ where: { id }, data: { pinHash: await bcrypt.hash(pin, 10) } });
console.log(`PIN cambiado para #${u.id} ${u.nombre}`);
await prisma.$disconnect();
