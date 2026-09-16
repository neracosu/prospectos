"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { exigirRol } from "@/lib/sesion";
import { esFechaIso } from "@/lib/fecha-caracas";
import { esSemver, compararSemver, parsearChangelog, TIPOS_CAMBIO, ETIQUETA_CAMBIO } from "@/lib/semver-contrato";
import { enlaceWhatsappCobro } from "@/lib/mensajes-cobro";
import { fallo, exito, type Resultado } from "@/acciones/resultado";

// exigirRol("dueno") FUERA del try/catch. Una version avisada al cliente no se edita: se corrige con otra.
const ERROR = "No se pudo guardar. Intenta de nuevo.";
const VERSION_YA_AVISADA = "VERSION_YA_AVISADA";
const CambioZ = z.object({ tipo: z.enum(TIPOS_CAMBIO), texto: z.string().trim().min(2).max(300) });
const BaseZ = z.object({
  proyectoId: z.coerce.number().int().positive(),
  version: z.string().trim().refine(esSemver, "semver"),
  fecha: z.string().trim().refine(esFechaIso, "fecha"),
  cambios: z.string().optional(),
  markdown: z.string().optional(),
});

// Cambios: vienen como JSON (formulario) o como bloque de CHANGELOG.md pegado.
function cambiosDe(d: { cambios?: string; markdown?: string }): z.infer<typeof CambioZ>[] | null {
  if (d.cambios) {
    try { const r = z.array(CambioZ).min(1).safeParse(JSON.parse(d.cambios)); return r.success ? r.data : null; } catch { return null; }
  }
  const parseados = parsearChangelog(d.markdown ?? "");
  const r = z.array(CambioZ).min(1).safeParse(parseados);
  return r.success ? r.data : null;
}

const refrescar = (proyectoId: number) => { revalidatePath(`/proyectos/${proyectoId}`); revalidatePath("/proyectos"); };

export async function publicarVersion(formData: FormData): Promise<Resultado<{ id: number }>> {
  const u = await exigirRol("dueno");
  const e = BaseZ.safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("La versión va como MAYOR.MENOR.PARCHE (ej. 1.4.2) y la fecha en formato válido.");
  const cambios = cambiosDe(e.data);
  if (!cambios) return fallo("Agrega al menos un cambio (nuevo, mejora o arreglo).");
  const d = e.data;
  try {
    const actual = await prisma.version.findMany({ where: { proyectoId: d.proyectoId }, select: { version: true } });
    const mayor = actual.map((v) => v.version).sort(compararSemver).at(-1);
    if (mayor && compararSemver(d.version, mayor) <= 0) return fallo(`La versión debe ser mayor que la actual (${mayor}).`);
    // Version (con sus cambios) y evento van juntos: una version publicada nunca queda sin su rastro.
    const v = await prisma.$transaction(async (tx) => {
      const nueva = await tx.version.create({ data: { proyectoId: d.proyectoId, version: d.version, fecha: d.fecha, cambios: { create: cambios.map((c, i) => ({ ...c, orden: i })) } }, select: { id: true } });
      await tx.evento.create({ data: { proyectoId: d.proyectoId, usuarioId: u.id, tipo: "version_publicada", texto: d.version } });
      return nueva;
    });
    refrescar(d.proyectoId);
    return exito({ id: v.id });
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002") return fallo("Esa versión ya existe en este proyecto.");
    console.error("publicarVersion", err); return fallo(ERROR);
  }
}

export async function editarVersion(formData: FormData): Promise<Resultado> {
  await exigirRol("dueno");
  const e = BaseZ.extend({ id: z.coerce.number().int().positive() }).safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("La versión va como MAYOR.MENOR.PARCHE y la fecha en formato válido.");
  const cambios = cambiosDe(e.data);
  if (!cambios) return fallo("Agrega al menos un cambio.");
  const d = e.data;
  try {
    const v = await prisma.version.findUnique({ where: { id: d.id }, select: { avisadoEn: true, proyectoId: true } });
    if (!v || v.proyectoId !== d.proyectoId) return fallo("Esa versión no existe.");
    if (v.avisadoEn) return fallo("Esta versión ya se avisó al cliente: corrígela publicando otra.");
    await prisma.$transaction([
      prisma.cambio.deleteMany({ where: { versionId: d.id } }),
      prisma.version.update({ where: { id: d.id }, data: { version: d.version, fecha: d.fecha, cambios: { create: cambios.map((c, i) => ({ ...c, orden: i })) } } }),
    ]);
    refrescar(d.proyectoId);
    return exito();
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002") return fallo("Esa versión ya existe en este proyecto.");
    console.error("editarVersion", err); return fallo(ERROR);
  }
}

export async function marcarAvisada(versionId: number): Promise<Resultado<{ href: string | null }>> {
  const u = await exigirRol("dueno");
  const e = z.number().int().positive().safeParse(versionId);
  if (!e.success) return fallo(ERROR);
  try {
    const v = await prisma.version.findUnique({ where: { id: e.data }, include: { cambios: { orderBy: { orden: "asc" } }, proyecto: { include: { cliente: true } } } });
    if (!v) return fallo("Esa versión no existe.");
    // Update y evento van juntos: si el evento fallara, avisadoEn tampoco queda a medias
    // (una version marcada avisada sin su evento seria irrecuperable).
    await prisma.$transaction(async (tx) => {
      const r = await tx.version.updateMany({ where: { id: v.id, avisadoEn: null }, data: { avisadoEn: new Date() } });
      if (r.count === 0) throw new Error(VERSION_YA_AVISADA);
      await tx.evento.create({ data: { proyectoId: v.proyectoId, usuarioId: u.id, tipo: "aviso_cliente", texto: `versión ${v.version}` } });
    });
    const lineas = v.cambios.map((c) => `• ${ETIQUETA_CAMBIO[c.tipo as keyof typeof ETIQUETA_CAMBIO] ?? c.tipo}: ${c.texto}`).join("\n");
    const quien = v.proyecto.cliente.contactoNombre || v.proyecto.cliente.nombre;
    const mensaje = `Buenas, ${quien}. Publicamos la versión ${v.version} de ${v.proyecto.nombre}:\n${lineas}\nCualquier duda me escribe por aquí.`;
    const href = enlaceWhatsappCobro(v.proyecto.cliente.whatsapp, mensaje);
    refrescar(v.proyectoId);
    return exito({ href });
  } catch (err) {
    if (err instanceof Error && err.message === VERSION_YA_AVISADA) return fallo("Esta versión ya se avisó.");
    console.error("marcarAvisada", err); return fallo(ERROR);
  }
}
