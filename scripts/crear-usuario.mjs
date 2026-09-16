#!/usr/bin/env node
// Crea el primer usuario (o uno mas). El PIN se lee por stdin para que no
// quede en `ps` ni en el historial. Uso:
//   set -a; . ~/.config/prospectos/env; set +a
//   node scripts/crear-usuario.mjs "Neri" dueno   <<< "123456"
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";

const [nombre, rol = "dueno"] = process.argv.slice(2);
if (!nombre || !["dueno", "prospectador"].includes(rol)) {
  console.error('Uso: node scripts/crear-usuario.mjs "Nombre" dueno|prospectador  (PIN por stdin)');
  process.exit(1);
}
const pin = readFileSync(0, "utf8").trim();
if (!/^\d{6}$/.test(pin)) { console.error("El PIN son 6 digitos."); process.exit(1); }
const prisma = new PrismaClient();
for (const u of await prisma.usuario.findMany()) {
  if (await bcrypt.compare(pin, u.pinHash)) { console.error("Ese PIN ya lo usa otra cuenta."); process.exit(1); }
}
const u = await prisma.usuario.create({ data: { nombre, rol, pinHash: await bcrypt.hash(pin, 10) } });
console.log(`Creado: #${u.id} ${u.nombre} (${u.rol})`);
await prisma.$disconnect();
