"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { exigirSesion, exigirRol } from "@/lib/sesion";
import { crearUsuario, cambiarPin, PIN_VALIDO } from "@/lib/usuarios";
import { fallo, exito, type Resultado } from "@/acciones/resultado";
import { guardarConfig, CLAVES } from "@/lib/configuracion";
import { normalizarCelular } from "@/lib/celular-contrato";

// exigirSesion()/exigirRol() van FUERA del try/catch (redirigen lanzando).
// Cada funcion exportada de aqui es un endpoint publico: nada de auxiliares exportados.

const ERROR = "No se pudo guardar. Intenta de nuevo.";
const MENSAJE_PIN: Record<string, string> = { PIN_REPETIDO: "Ese PIN ya lo usa otra cuenta.", PIN_INVALIDO: "El PIN son 6 números." };

function mensajePin(err: unknown): string | null {
  const clave = err instanceof Error ? err.message : "";
  return clave in MENSAJE_PIN ? MENSAJE_PIN[clave] : null;
}

const NichoZ = z.object({
  id: z.coerce.number().int().positive(),
  mensajeInicial: z.string().trim().min(10).max(2000),
  mensajeSeguimiento: z.string().trim().min(10).max(2000),
  diasSeguimiento: z.coerce.number().int().min(1).max(30),
});

export async function guardarNicho(formData: FormData): Promise<Resultado> {
  await exigirRol("dueno");
  const e = NichoZ.safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("Revisa el mensaje inicial (entre 10 y 2000 caracteres) y los días de seguimiento (de 1 a 30).");
  try {
    const { id, ...data } = e.data;
    // {enlace} solo hace falta si el nicho tiene plantilla de propuesta: sin
    // ella el enlace no sirve nada (ver src/lib/prospectos.ts, aTarjeta).
    const nicho = await prisma.nicho.findUnique({ where: { id }, select: { plantillaPropuesta: true } });
    if (!nicho) return fallo(ERROR);
    if (nicho.plantillaPropuesta !== "" && !data.mensajeInicial.includes("{enlace}")) {
      return fallo("Revisa: el mensaje inicial lleva {enlace}.");
    }
    await prisma.nicho.update({ where: { id }, data });
    revalidatePath("/ajustes");
    revalidatePath("/hoy");
    return exito();
  } catch (err) {
    console.error("guardarNicho", err);
    return fallo(ERROR);
  }
}

const UsuarioZ = z.object({
  id: z.coerce.number().int().positive().optional(),
  nombre: z.string().trim().min(2).max(60),
  rol: z.enum(["dueno", "prospectador"]),
  metaDiaria: z.coerce.number().int().min(0).max(200),
  pin: z.string().optional(),
  activo: z.string().optional(), // checkbox: "on" o ausente/vacio
});

export async function guardarUsuario(formData: FormData): Promise<Resultado> {
  const yo = await exigirRol("dueno");
  const e = UsuarioZ.safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("Revisa nombre, rol y meta.");
  const d = e.data;
  try {
    if (!d.id) {
      if (!d.pin || !PIN_VALIDO.test(d.pin)) return fallo(MENSAJE_PIN.PIN_INVALIDO);
      await crearUsuario({ nombre: d.nombre, rol: d.rol, pin: d.pin, metaDiaria: d.metaDiaria });
    } else {
      const activo = d.activo === "on";
      // Un dueno no puede desactivarse ni quitarse el rol de dueno a si mismo:
      // dejaria el panel sin nadie que pueda entrar a Ajustes.
      if (d.id === yo.id && (!activo || d.rol !== "dueno")) return fallo("No puedes desactivarte ni quitarte el rol de dueño.");
      // Reactivar una cuenta desactivada no exige revisar pinEnUso aqui: la
      // unicidad del PIN ya es global (activa o no, ver src/lib/usuarios.ts),
      // asi que el PIN que ya tenia sigue siendo unico sin volver a chequearlo.
      await prisma.usuario.update({ where: { id: d.id }, data: { nombre: d.nombre, rol: d.rol, metaDiaria: d.metaDiaria, activo } });
    }
    revalidatePath("/ajustes");
    revalidatePath("/hoy");
    return exito();
  } catch (err) {
    const m = mensajePin(err);
    if (m) return fallo(m);
    console.error("guardarUsuario", err);
    return fallo(ERROR);
  }
}

export async function cambiarMiPin(formData: FormData): Promise<Resultado> {
  const yo = await exigirSesion();
  const e = z.object({ actual: z.string(), nuevo: z.string().regex(PIN_VALIDO) }).safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo(MENSAJE_PIN.PIN_INVALIDO);
  try {
    const u = await prisma.usuario.findUniqueOrThrow({ where: { id: yo.id } });
    if (!(await bcrypt.compare(e.data.actual, u.pinHash))) return fallo("El PIN actual no es correcto.");
    await cambiarPin(yo.id, e.data.nuevo);
    return exito();
  } catch (err) {
    const m = mensajePin(err);
    if (m) return fallo(m);
    console.error("cambiarMiPin", err);
    return fallo(ERROR);
  }
}

export async function restablecerPin(usuarioId: number, pinNuevo: string): Promise<Resultado> {
  await exigirRol("dueno");
  const e = z.object({ id: z.number().int().positive(), pin: z.string().regex(PIN_VALIDO) }).safeParse({ id: usuarioId, pin: pinNuevo });
  if (!e.success) return fallo(MENSAJE_PIN.PIN_INVALIDO);
  try {
    await cambiarPin(e.data.id, e.data.pin);
    return exito();
  } catch (err) {
    const m = mensajePin(err);
    if (m) return fallo(m);
    console.error("restablecerPin", err);
    return fallo(ERROR);
  }
}

const MensajesZ = z.object({
  recordatorio: z.string().trim().min(10).max(1000).refine((s) => s.includes("{monto}") && s.includes("{vence}"), "variables"),
  vencido: z.string().trim().min(10).max(1000).refine((s) => s.includes("{monto}") && s.includes("{vence}"), "variables"),
});
export async function guardarMensajesCobro(formData: FormData): Promise<Resultado> {
  await exigirRol("dueno");
  const e = MensajesZ.safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("Los dos mensajes llevan {monto} y {vence} (y entre 10 y 1000 caracteres).");
  try {
    await guardarConfig(CLAVES.mensajeRecordatorio, e.data.recordatorio);
    await guardarConfig(CLAVES.mensajeVencido, e.data.vencido);
    revalidatePath("/ajustes");
    return exito();
  } catch (err) { console.error("guardarMensajesCobro", err); return fallo(ERROR); }
}

const EmisorZ = z.object({ nombre: z.string().trim().min(2).max(80), rif: z.string().trim().max(20).default(""), whatsapp: z.string().trim().max(40).default(""), email: z.string().trim().max(120).default("") });
export async function guardarDatosEmisor(formData: FormData): Promise<Resultado> {
  await exigirRol("dueno");
  const e = EmisorZ.safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("Revisa el nombre (2 a 80 letras).");
  try {
    await guardarConfig(CLAVES.emisor, JSON.stringify({ nombre: e.data.nombre, rif: e.data.rif.toUpperCase(), whatsapp: normalizarCelular(e.data.whatsapp), email: e.data.email }));
    revalidatePath("/ajustes");
    return exito();
  } catch (err) { console.error("guardarDatosEmisor", err); return fallo(ERROR); }
}

export async function guardarTarifa(formData: FormData): Promise<Resultado> {
  await exigirRol("dueno");
  const e = z.object({ tarifa: z.coerce.number().min(1).max(500) }).safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("La tarifa va entre 1 y 500 dólares por hora.");
  try {
    await guardarConfig(CLAVES.tarifaHora, String(e.data.tarifa));
    revalidatePath("/ajustes");
    return exito();
  } catch (err) { console.error("guardarTarifa", err); return fallo(ERROR); }
}
