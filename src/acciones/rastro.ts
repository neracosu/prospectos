// src/acciones/rastro.ts — acciones del rastro de enlaces enviados a un prospecto (ficha, /ajustes).
"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { exigirSesion } from "@/lib/sesion";
import { fallo, exito, type Resultado } from "@/acciones/resultado";
import { registrarEnlace, listarEnlaces, desactivarEnlace, marcarVisitantePropio, guardarIpsPropias } from "@/lib/rastro";
import { leerLogs, importarArchivados } from "@/lib/rastro-lector";
import { esFechaIso } from "@/lib/fecha-caracas";
import { etiquetaScript } from "@/lib/rastro-contrato";

const HOST_PANEL = "prospectos.neracosu.com";
const SOLO_DUENO = "Solo el dueño puede hacer esto.";

const NuevoEnlace = z.object({
  url: z.string().trim().url().max(300).startsWith("https://"),
  etiqueta: z.string().trim().min(2).max(40),
  enviadoEn: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
});
const Visitante = z.string().regex(/^[0-9a-f]{16}$/);

const MENSAJES: Record<string, string> = {
  "URL no es de neracosu.com": "El enlace debe ser de neracosu.com o de un subdominio.",
  "Ese enlace ya esta registrado": "Ese enlace ya está registrado para este prospecto.",
};

function refrescar(id: number) {
  revalidatePath("/leads"); revalidatePath(`/leads/${id}`); revalidatePath(`/prospectos/${id}`);
}

// Dueno sin redirigir: el resultado ok:false se muestra en la propia pantalla
async function comoDueno() {
  const u = await exigirSesion();
  return u.rol === "dueno" ? u : null;
}

// El prospectador solo toca prospectos del directorio (como acciones/leads.ts); el dueno, todos
async function puedeTocar(u: { rol: string }, prospectoId: number): Promise<boolean> {
  const p = await prisma.prospecto.findUnique({ where: { id: prospectoId }, select: { id: true, fuenteLead: true } });
  if (!p) return false;
  return u.rol === "dueno" || p.fuenteLead === "directorio";
}

export async function agregarEnlace(prospectoId: number, formData: FormData): Promise<Resultado<{ id: number; etiqueta: string; script: string }>> {
  const u = await exigirSesion();
  if (!(await puedeTocar(u, prospectoId))) return fallo("Ese prospecto no existe.");
  const e = NuevoEnlace.safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("Revisa el enlace (https://, de neracosu.com), la etiqueta (2 a 40 letras) y la fecha.");
  const { url, etiqueta, enviadoEn } = e.data;
  const fecha = enviadoEn ? new Date(`${enviadoEn}T12:00:00-04:00`) : undefined;
  if (enviadoEn && (!esFechaIso(enviadoEn) || !fecha || Number.isNaN(fecha.getTime()))) return fallo("La fecha de envío no es válida.");
  const r = await registrarEnlace({ prospectoId, url, etiqueta, enviadoEn: fecha });
  if (!r.ok) return fallo(MENSAJES[r.error] ?? r.error);
  const { enlace } = r;
  try {
    await leerLogs({ hosts: [enlace.host], desdeCero: true, soloPrefijo: { host: enlace.host, prefijo: enlace.prefijo }, silencioso: true });
  } catch (err) {
    console.error("rastro: no se pudo leer el log al agregar el enlace", err);
  }
  refrescar(prospectoId);
  return exito({ id: enlace.id, etiqueta: enlace.etiqueta, script: etiquetaScript(enlace.token, process.env.PROSPECTOS_URL_PUBLICA ?? "https://prospectos.neracosu.com") });
}

export async function quitarEnlace(id: number): Promise<Resultado> {
  if (!(await comoDueno())) return fallo(SOLO_DUENO);
  const enlace = await prisma.enlaceEnviado.findUnique({ where: { id }, select: { prospectoId: true } });
  if (!enlace) return fallo("Ese enlace no existe.");
  await desactivarEnlace(id);
  refrescar(enlace.prospectoId);
  return exito();
}

export async function actualizarRastro(prospectoId: number): Promise<Resultado<{ visitas: number }>> {
  const u = await exigirSesion();
  if (!(await puedeTocar(u, prospectoId))) return fallo("Ese prospecto no existe.");
  try {
    const hosts = [...new Set([...(await listarEnlaces(prospectoId)).filter((x) => x.activo).map((x) => x.host), HOST_PANEL])];
    const { visitas } = await leerLogs({ hosts, silencioso: true });
    refrescar(prospectoId);
    return exito({ visitas });
  } catch (err) {
    console.error("rastro: fallo al actualizar", err);
    return fallo("No se pudo leer el registro del servidor.");
  }
}

export async function marcarVisitanteMio(prospectoId: number, visitante: string): Promise<Resultado<{ reclasificadas: number }>> {
  if (!(await comoDueno())) return fallo(SOLO_DUENO);
  const v = Visitante.safeParse(visitante);
  if (!v.success) return fallo("Visitante no válido.");
  const reclasificadas = await marcarVisitantePropio(v.data);
  refrescar(prospectoId);
  return exito({ reclasificadas });
}

export async function guardarIpsPropiasAccion(formData: FormData): Promise<Resultado> {
  if (!(await comoDueno())) return fallo(SOLO_DUENO);
  const crudo = String(formData.get("ips") ?? "");
  const lista = crudo.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
  await guardarIpsPropias(lista);
  revalidatePath("/ajustes");
  return exito();
}

export async function importarArchivadosAccion(enlaceId: number): Promise<Resultado<{ visitas: number }>> {
  if (!(await comoDueno())) return fallo(SOLO_DUENO);
  const enlace = await prisma.enlaceEnviado.findUnique({ where: { id: enlaceId }, select: { prospectoId: true, host: true, prefijo: true } });
  if (!enlace) return fallo("Ese enlace no existe.");
  try {
    const { visitas } = await importarArchivados({ host: enlace.host, prefijo: enlace.prefijo });
    refrescar(enlace.prospectoId);
    return exito({ visitas });
  } catch (err) {
    console.error("rastro: fallo al importar archivados", err);
    return fallo("No se pudo leer el archivo de registros.");
  }
}
