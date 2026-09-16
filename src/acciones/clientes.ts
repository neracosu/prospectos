// src/acciones/clientes.ts
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { exigirRol } from "@/lib/sesion";
import { normalizarCelular, normalizarRed } from "@/lib/celular-contrato";
import { generarCodigo } from "@/lib/codigo";
import { fallo, exito, type Resultado } from "@/acciones/resultado";

// exigirRol("dueno") va FUERA del try/catch. Solo el dueno ve clientes.
const ERROR = "No se pudo guardar. Intenta de nuevo.";
const ClienteZ = z.object({
  id: z.coerce.number().int().positive().optional(),
  nombre: z.string().trim().min(2).max(120),
  contactoNombre: z.string().trim().max(80).default(""),
  whatsapp: z.string().trim().max(40).default(""),
  email: z.string().trim().max(120).default(""),
  rif: z.string().trim().max(20).default(""),
  instagram: z.string().trim().max(200).default(""),
  facebook: z.string().trim().max(200).default(""),
  tiktok: z.string().trim().max(200).default(""),
});
function datosDe(d: z.infer<typeof ClienteZ>) {
  return { nombre: d.nombre, contactoNombre: d.contactoNombre, whatsapp: normalizarCelular(d.whatsapp), email: d.email, rif: d.rif.toUpperCase(),
    instagram: normalizarRed(d.instagram, "instagram"), facebook: normalizarRed(d.facebook, "facebook"), tiktok: normalizarRed(d.tiktok, "tiktok") };
}

export async function crearCliente(formData: FormData): Promise<Resultado<{ id: number }>> {
  await exigirRol("dueno");
  const e = ClienteZ.safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("Revisa el nombre del cliente.");
  try {
    const c = await prisma.cliente.create({ data: { ...datosDe(e.data), codigo: generarCodigo() }, select: { id: true } });
    revalidatePath("/clientes");
    return exito({ id: c.id });
  } catch (err) { console.error("crearCliente", err); return fallo(ERROR); }
}

export async function editarCliente(formData: FormData): Promise<Resultado> {
  await exigirRol("dueno");
  const e = ClienteZ.safeParse(Object.fromEntries(formData));
  if (!e.success || !e.data.id) return fallo("Revisa el nombre del cliente.");
  try {
    await prisma.cliente.update({ where: { id: e.data.id }, data: datosDe(e.data) });
    revalidatePath("/clientes"); revalidatePath(`/clientes/${e.data.id}`); revalidatePath("/proyectos");
    return exito();
  } catch (err) { console.error("editarCliente", err); return fallo(ERROR); }
}
