// src/lib/usuarios.ts
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

const RONDAS = process.env.NODE_ENV === "test" ? 4 : 10;
export const PIN_LARGO = 6;
export const PIN_VALIDO = /^\d{6}$/;

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, RONDAS);
}

// Entrar es solo con PIN, sin usuario: el PIN identifica a la persona. Por eso
// tiene que ser unico entre cuentas activas (pinEnUso) y se compara contra
// todas: son pocas (Neri y quien lo ayude), bcrypt aguanta.
export async function buscarPorPin(pin: string): Promise<{ id: number; nombre: string; rol: "dueno" | "prospectador" } | null> {
  if (!PIN_VALIDO.test(pin)) return null;
  const usuarios = await prisma.usuario.findMany({ where: { activo: true, rol: { in: ["dueno", "prospectador"] } } });
  for (const u of usuarios) {
    if (await bcrypt.compare(pin, u.pinHash)) return { id: u.id, nombre: u.nombre, rol: u.rol as "dueno" | "prospectador" };
  }
  return null;
}

export async function pinEnUso(pin: string, salvoId?: number): Promise<boolean> {
  const usuarios = await prisma.usuario.findMany({ where: { activo: true, ...(salvoId ? { id: { not: salvoId } } : {}) } });
  for (const u of usuarios) if (await bcrypt.compare(pin, u.pinHash)) return true;
  return false;
}

export async function crearUsuario(d: { nombre: string; rol: "dueno" | "prospectador"; pin: string; metaDiaria?: number }) {
  if (!PIN_VALIDO.test(d.pin)) throw new Error("PIN_INVALIDO");
  if (await pinEnUso(d.pin)) throw new Error("PIN_REPETIDO");
  return prisma.usuario.create({
    data: { nombre: d.nombre.trim(), rol: d.rol, pinHash: await hashPin(d.pin), metaDiaria: d.metaDiaria ?? 10 },
    select: { id: true, nombre: true, rol: true, metaDiaria: true },
  });
}

export async function cambiarPin(id: number, pin: string): Promise<void> {
  if (!PIN_VALIDO.test(pin)) throw new Error("PIN_INVALIDO");
  if (await pinEnUso(pin, id)) throw new Error("PIN_REPETIDO");
  await prisma.usuario.update({ where: { id }, data: { pinHash: await hashPin(pin) } });
}

export async function listarUsuarios() {
  return prisma.usuario.findMany({
    where: { rol: { in: ["dueno", "prospectador"] } },
    select: { id: true, nombre: true, rol: true, activo: true, metaDiaria: true },
    orderBy: { id: "asc" },
  });
}

// Existe para que sesionActual() saque a quien fue desactivado aunque su
// cookie siga siendo valida.
export async function usuarioVigente(id: number): Promise<boolean> {
  const u = await prisma.usuario.findUnique({ where: { id }, select: { activo: true } });
  return !!u?.activo;
}
