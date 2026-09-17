"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirRol } from "@/lib/sesion";
import { quitarDocumento } from "@/lib/documentos";
import { fallo, exito, type Resultado } from "@/acciones/resultado";

// exigirRol("dueno") va FUERA del try/catch. Quitar no borra: el cliente deja de verlo y el archivo queda en disco.
export async function quitarDocumentoDeProyecto(id: number): Promise<Resultado> {
  const u = await exigirRol("dueno");
  const e = z.number().int().positive().safeParse(id);
  if (!e.success) return fallo("Ese documento no existe.");
  try {
    const r = await quitarDocumento(e.data, u.id);
    revalidatePath(`/proyectos/${r.proyectoId}`);
    return exito();
  } catch (err) {
    if (err instanceof Error && err.message === "DOCUMENTO_NO_EXISTE") return fallo("Ese documento no existe.");
    console.error("quitarDocumentoDeProyecto", err);
    return fallo("No se pudo quitar. Intenta de nuevo.");
  }
}
