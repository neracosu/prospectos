// src/lib/acceso-cliente.ts — la cuenta del portal de un cliente: PIN, bloqueo por intentos y sesion (pieza 5).
// El acceso es POR CLIENTE, no por proyecto: un Usuario de rol "cliente" por Cliente.
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { hashPin, PIN_VALIDO } from "@/lib/usuarios";
import { crearTokenCliente, verificarTokenCliente } from "@/lib/auth";
import { bloqueado, registrarFallo, olvidarFallos } from "@/lib/rate-limit";
import { CODIGO_VALIDO } from "@/lib/codigo";
import { enlacePortal } from "@/lib/portal-contrato";

// 6 digitos uniformes con el crypto global. Se descarta la cola de 2^32 que sesgaria el modulo.
export function generarPinCliente(): string {
  const n = new Uint32Array(1);
  do { crypto.getRandomValues(n); } while (n[0] >= 4_294_000_000);
  return String(n[0] % 1_000_000).padStart(6, "0");
}

export type EstadoAcceso = { estado: "sin_acceso" | "activo" | "desactivado"; ultimoIngreso: Date | null; ingresos: number };

export async function estadoAcceso(clienteId: number): Promise<EstadoAcceso> {
  const u = await prisma.usuario.findUnique({ where: { clienteId }, select: { activo: true, rol: true } });
  if (!u || u.rol !== "cliente") return { estado: "sin_acceso", ultimoIngreso: null, ingresos: 0 };
  const [ultimo, ingresos] = await Promise.all([
    prisma.evento.findFirst({ where: { clienteId, tipo: "portal_abierto" }, orderBy: { creadoEn: "desc" }, select: { creadoEn: true } }),
    prisma.evento.count({ where: { clienteId, tipo: "portal_abierto" } }),
  ]);
  return { estado: u.activo ? "activo" : "desactivado", ultimoIngreso: ultimo?.creadoEn ?? null, ingresos };
}

function esConflictoUnico(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
}

// Crea la cuenta si no existe y devuelve el PIN en claro (la unica vez que existe). Si ya habia
// cuenta devuelve pin null: el PIN esta hasheado y no se recupera; para uno nuevo esta regenerarPin.
export async function darAcceso(clienteId: number): Promise<{ pin: string | null }> {
  const c = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { nombre: true, usuario: { select: { id: true } } } });
  if (!c) throw new Error("CLIENTE_NO_EXISTE");
  if (c.usuario) return { pin: null };
  const pin = generarPinCliente();
  try {
    await prisma.usuario.create({ data: { nombre: c.nombre, rol: "cliente", clienteId, pinHash: await hashPin(pin), metaDiaria: 0 } });
    return { pin };
  } catch (err) {
    if (esConflictoUnico(err)) return { pin: null }; // dos toques: gano el otro
    throw err;
  }
}

// PIN nuevo: el anterior deja de servir y las sesiones abiertas caen (sesionVersion). Tambien reactiva.
export async function regenerarPin(clienteId: number): Promise<{ pin: string }> {
  const c = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { nombre: true } });
  if (!c) throw new Error("CLIENTE_NO_EXISTE");
  const pin = generarPinCliente();
  const pinHash = await hashPin(pin);
  await prisma.usuario.upsert({
    where: { clienteId },
    update: { pinHash, activo: true, sesionVersion: { increment: 1 } },
    create: { nombre: c.nombre, rol: "cliente", clienteId, pinHash, metaDiaria: 0 },
  });
  return { pin };
}

// Nada se borra: la cuenta queda, apagada, y las sesiones abiertas caen.
export async function desactivarAcceso(clienteId: number): Promise<void> {
  await prisma.usuario.updateMany({ where: { clienteId, rol: "cliente" }, data: { activo: false, sesionVersion: { increment: 1 } } });
}

// Bloqueo de 5 fallos / 15 min por CUENTA y por IP. Un codigo que no existe, un acceso apagado y un
// PIN errado responden igual ("incorrecto"): desde afuera no se distingue si el codigo existe.
export async function intentarEntrada(d: { codigo: string; pin: string; ip: string }): Promise<{ ok: true; token: string } | { ok: false; motivo: "bloqueado" | "incorrecto" }> {
  const claveIp = `portal:ip:${d.ip}`;
  // Un codigo mal formado no es de ninguna cuenta: solo cuenta contra la IP, y jamas acuna una clave de cuenta
  // (el mapa de intentos es compartido con el panel y tiene tope: no se llena con basura elegida por quien ataca).
  if (!CODIGO_VALIDO.test(d.codigo)) {
    if (bloqueado(claveIp)) return { ok: false, motivo: "bloqueado" };
    registrarFallo(claveIp);
    return { ok: false, motivo: "incorrecto" };
  }
  const claveCuenta = `portal:c:${d.codigo}`;
  if (bloqueado(claveIp) || bloqueado(claveCuenta)) return { ok: false, motivo: "bloqueado" };
  const fallar = (): { ok: false; motivo: "incorrecto" } => { registrarFallo(claveIp); registrarFallo(claveCuenta); return { ok: false, motivo: "incorrecto" }; };
  if (!PIN_VALIDO.test(d.pin)) return fallar();
  const c = await prisma.cliente.findUnique({ where: { codigo: d.codigo }, select: { id: true, usuario: { select: { id: true, activo: true, rol: true, pinHash: true, sesionVersion: true } } } });
  const u = c?.usuario;
  if (!c || !u || !u.activo || u.rol !== "cliente") return fallar();
  if (!(await bcrypt.compare(d.pin, u.pinHash))) return fallar();
  olvidarFallos(claveIp); olvidarFallos(claveCuenta);
  // Para que Neri sepa si el cliente lo usa. No se registra que pestana abrio.
  await prisma.evento.create({ data: { clienteId: c.id, usuarioId: u.id, tipo: "portal_abierto" } });
  return { ok: true, token: await crearTokenCliente({ usuarioId: u.id, clienteId: c.id, v: u.sesionVersion }) };
}

export type SesionPortal = { usuarioId: number; clienteId: number; codigo: string; nombre: string };

// La cookie sola no alcanza: la cuenta tiene que seguir activa y con la misma version de sesion.
export async function sesionDesdeToken(token: string | undefined): Promise<SesionPortal | null> {
  const s = token ? await verificarTokenCliente(token) : null;
  if (!s) return null;
  const u = await prisma.usuario.findUnique({ where: { id: s.usuarioId }, select: { activo: true, rol: true, clienteId: true, sesionVersion: true, cliente: { select: { codigo: true, nombre: true } } } });
  if (!u || !u.activo || u.rol !== "cliente" || u.clienteId !== s.clienteId || u.sesionVersion !== s.v || !u.cliente) return null;
  return { usuarioId: s.usuarioId, clienteId: s.clienteId, codigo: u.cliente.codigo, nombre: u.cliente.nombre };
}

// El {enlace} de los mensajes: vacio si el cliente no puede entrar (no se manda un enlace que no abre).
export async function enlaceSiTieneAcceso(clienteId: number): Promise<string> {
  const c = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { codigo: true, usuario: { select: { activo: true, rol: true } } } });
  if (!c?.usuario || !c.usuario.activo || c.usuario.rol !== "cliente") return "";
  return enlacePortal(process.env.PROSPECTOS_URL_PUBLICA ?? "", c.codigo);
}
