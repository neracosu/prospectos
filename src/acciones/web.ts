// src/acciones/web.ts
"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { exigirRol } from "@/lib/sesion";
import { fallo, exito, type Resultado } from "@/acciones/resultado";

// Atender una solicitud de la web es una marca reversible: no borra nada.
export async function marcarSolicitud(id: number, atendida: boolean): Promise<Resultado> {
  await exigirRol("dueno");
  if (!Number.isInteger(id) || id <= 0) return fallo("Esa solicitud no existe.");
  try {
    const r = await prisma.solicitudWeb.updateMany({ where: { id }, data: { atendidaEn: atendida ? new Date() : null } });
    if (r.count === 0) return fallo("Esa solicitud no existe.");
    revalidatePath("/web"); revalidatePath("/hoy");
    return exito();
  } catch (err) { console.error("marcarSolicitud", err); return fallo("No se pudo guardar. Intenta de nuevo."); }
}
