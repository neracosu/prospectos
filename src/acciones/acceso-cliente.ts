"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { exigirRol } from "@/lib/sesion";
import { darAcceso, regenerarPin, desactivarAcceso } from "@/lib/acceso-cliente";
import { enlacePortal, mensajeEnlacePortal, mensajePinPortal } from "@/lib/portal-contrato";
import { enlaceWhatsappCobro } from "@/lib/mensajes-cobro";
import { fallo, exito, type Resultado } from "@/acciones/resultado";

// exigirRol("dueno") va FUERA del try/catch. Solo el dueno da, regenera o apaga el acceso de un cliente.
// El PIN en claro existe solo en la respuesta: no se guarda ni se escribe en el log.
const ERROR = "No se pudo completar. Intenta de nuevo.";
const Id = z.number().int().positive();

export type AccesoEnviado = { enlace: string; mensajeEnlace: string; hrefEnlace: string | null; pin: string | null; mensajePin: string | null; hrefPin: string | null };

async function armar(clienteId: number, pin: string | null): Promise<AccesoEnviado | null> {
  const c = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { nombre: true, contactoNombre: true, whatsapp: true, codigo: true } });
  if (!c) return null;
  const enlace = enlacePortal(process.env.PROSPECTOS_URL_PUBLICA ?? "", c.codigo);
  const mensajeEnlace = mensajeEnlacePortal(c.contactoNombre || c.nombre, enlace);
  const mensajePin = pin ? mensajePinPortal(pin) : null;
  return { enlace, mensajeEnlace, hrefEnlace: enlaceWhatsappCobro(c.whatsapp, mensajeEnlace), pin, mensajePin, hrefPin: mensajePin ? enlaceWhatsappCobro(c.whatsapp, mensajePin) : null };
}

export async function enviarAcceso(clienteId: number): Promise<Resultado<AccesoEnviado>> {
  const u = await exigirRol("dueno");
  const e = Id.safeParse(clienteId);
  if (!e.success) return fallo(ERROR);
  try {
    const { pin } = await darAcceso(e.data);
    const datos = await armar(e.data, pin);
    if (!datos) return fallo("Ese cliente no existe.");
    await prisma.evento.create({ data: { clienteId: e.data, usuarioId: u.id, tipo: "aviso_cliente", canal: datos.hrefEnlace ? "whatsapp" : "", texto: "acceso al portal" } });
    revalidatePath(`/clientes/${e.data}`);
    return exito(datos);
  } catch (err) {
    if (err instanceof Error && err.message === "CLIENTE_NO_EXISTE") return fallo("Ese cliente no existe.");
    console.error("enviarAcceso", e.data, err); return fallo(ERROR);
  }
}

export async function regenerarPinCliente(clienteId: number): Promise<Resultado<AccesoEnviado>> {
  await exigirRol("dueno");
  const e = Id.safeParse(clienteId);
  if (!e.success) return fallo(ERROR);
  try {
    const { pin } = await regenerarPin(e.data);
    const datos = await armar(e.data, pin);
    if (!datos) return fallo("Ese cliente no existe.");
    revalidatePath(`/clientes/${e.data}`);
    return exito(datos);
  } catch (err) {
    if (err instanceof Error && err.message === "CLIENTE_NO_EXISTE") return fallo("Ese cliente no existe.");
    console.error("regenerarPinCliente", e.data, err); return fallo(ERROR);
  }
}

export async function desactivarAccesoCliente(clienteId: number): Promise<Resultado> {
  await exigirRol("dueno");
  const e = Id.safeParse(clienteId);
  if (!e.success) return fallo(ERROR);
  try {
    await desactivarAcceso(e.data);
    revalidatePath(`/clientes/${e.data}`);
    return exito();
  } catch (err) { console.error("desactivarAccesoCliente", e.data, err); return fallo(ERROR); }
}
