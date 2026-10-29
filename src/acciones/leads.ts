// src/acciones/leads.ts — acciones de un lead (panel CRM, fase 2). No tocan la cola masiva (acciones/prospectos.ts):
// un lead se crea a mano o desde una solicitud, se mueve con las transiciones de leads-contrato.ts (sin borrar la
// fecha del siguiente paso) y lleva siguiente paso, valor estimado y enlace a su propuesta.
"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { exigirSesion, exigirRol } from "@/lib/sesion";
import { fallo, exito, type Resultado } from "@/acciones/resultado";
import { ETAPAS, type Etapa } from "@/lib/embudo-contrato";
import { FUENTES_LEAD, ETIQUETA_ETAPA_LEAD, puedePasarLead, claveLead, nichoDesdeRubro, fuenteDesdeSolicitud, type FuenteLead } from "@/lib/leads-contrato";
import { normalizarCelular, normalizarRed } from "@/lib/celular-contrato";
import { hoyCaracas, esFechaIso } from "@/lib/fecha-caracas";
import { generarCodigo } from "@/lib/codigo";
import { MONTO_TEXTO, montoDesdeTexto } from "@/lib/dinero";
import { TOPES } from "@/lib/tabla-contrato";
import { respuestasLegibles } from "@/lib/web-contrato";

const Id = z.number().int().positive();
const EtapaZ = z.enum(ETAPAS);
const FuenteZ = z.enum(FUENTES_LEAD);
const ERROR = "Ese lead no existe.";

function refrescar(id?: number) {
  revalidatePath("/leads"); revalidatePath("/inicio"); revalidatePath("/solicitudes"); revalidatePath("/directorio");
  if (id) { revalidatePath(`/leads/${id}`); revalidatePath(`/prospectos/${id}`); }
}

const NuevoLead = z.object({
  nombre: z.string().trim().min(2).max(TOPES.nombre),
  fuenteLead: FuenteZ,
  nichoId: z.coerce.number().int().positive(),
  ciudad: z.string().trim().max(TOPES.ciudad).default(""),
  whatsapp: z.string().trim().max(40).default(""),
  instagram: z.string().trim().max(200).default(""),
  correo: z.string().trim().max(120).default(""),
  proximoPaso: z.string().trim().max(160).default(""),
  proximoSeguimiento: z.string().trim().default("").refine((s) => s === "" || esFechaIso(s), "fecha"),
  valorEstimado: z.string().trim().default("").refine((s) => s === "" || MONTO_TEXTO.test(s), "monto"),
  propuestaUrl: z.string().trim().max(300).default(""),
  nota: z.string().trim().max(2000).default(""),
  // Alta a mano desde Maps («Cargarlo a mano»): telefono, web y la URL de donde salio el dato
  telefono: z.string().trim().max(80).default(""),
  web: z.string().trim().max(200).default(""),
  fuente: z.string().trim().max(300).default(""),
});

export async function crearLead(formData: FormData): Promise<Resultado<{ id: number }>> {
  const u = await exigirSesion();
  const e = NuevoLead.safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("Revisa el nombre, la fuente, el nicho, la fecha y el valor.");
  const d = e.data;
  const whatsapp = normalizarCelular(d.whatsapp);
  if (d.whatsapp && !whatsapp) return fallo("Ese WhatsApp no parece un celular de Venezuela o Colombia. Si es de otro país, ponlo en la nota y deja otro contacto.");
  const instagram = normalizarRed(d.instagram, "instagram");
  const correo = d.correo.toLowerCase();
  if (!whatsapp && !instagram && !correo && !d.telefono) return fallo("Deja al menos un contacto: WhatsApp, Instagram o correo.");
  const contacto = whatsapp || correo || instagram || d.telefono;
  // Cada dato con su fuente: si el alta trae de donde salio (Maps, una web), se guarda para cada contacto presente
  const fuente = /^https?:\/\//i.test(d.fuente) ? d.fuente : "";
  const fuentesPorCampo: Record<string, string> = {};
  if (fuente) for (const [k, v] of Object.entries({ whatsapp, instagram, email: correo, telefono: d.telefono, web: d.web })) if (v) fuentesPorCampo[k] = fuente;
  const clave = claveLead(d.nombre, d.ciudad, contacto);
  if (clave.length > TOPES.clave) return fallo("El nombre y la ciudad son muy largos.");
  try {
    const p = await prisma.prospecto.create({
      data: {
        nichoId: d.nichoId, nombre: d.nombre, ciudad: d.ciudad, whatsapp, instagram, email: correo, telefono: d.telefono, web: d.web, nota: d.nota,
        fuentes: fuente ? [fuente] : [], fuentesPorCampo, origen: "manual", esLead: true, fuenteLead: d.fuenteLead,
        valorEstimado: d.valorEstimado ? montoDesdeTexto(d.valorEstimado) : null,
        proximoPaso: d.proximoPaso, proximoSeguimiento: d.proximoSeguimiento || null, propuestaUrl: d.propuestaUrl,
        codigo: generarCodigo(), clave, ordenCola: 0,
      },
      select: { id: true },
    });
    await prisma.evento.create({ data: { prospectoId: p.id, usuarioId: u.id, tipo: "importado", texto: "lead manual" } });
    refrescar(p.id);
    return exito({ id: p.id });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return fallo("Ya tienes un lead con ese nombre y ese contacto.");
    console.error("crearLead", err);
    return fallo("No se pudo guardar. Intenta de nuevo.");
  }
}

export async function moverLead(prospectoId: number, a: Etapa, motivo = ""): Promise<Resultado> {
  const u = await exigirSesion();
  const e = z.object({ id: Id, a: EtapaZ, motivo: z.string().trim().max(300) }).safeParse({ id: prospectoId, a, motivo });
  if (!e.success) return fallo(ERROR);
  if (e.data.a === "descartado" && e.data.motivo.length < 2) return fallo("Escribe el motivo.");
  try {
    const p = await prisma.prospecto.findUnique({ where: { id: e.data.id }, select: { etapa: true, esLead: true, fuenteLead: true } });
    if (!p) return fallo(ERROR);
    if (!p.esLead) return fallo("Este prospecto no es un lead: se mueve desde la cola del Directorio.");
    if (u.rol !== "dueno" && p.fuenteLead !== "directorio") return fallo("Ese lead no es del directorio.");
    const de = p.etapa as Etapa;
    if (!puedePasarLead(de, e.data.a)) return fallo(`Un lead no pasa de «${ETIQUETA_ETAPA_LEAD[de]}» a «${ETIQUETA_ETAPA_LEAD[e.data.a]}».`);
    // Condicionado a la etapa leida: dos toques no mueven dos veces. No toca proximoSeguimiento ni proximoPaso.
    const r = await prisma.prospecto.updateMany({ where: { id: e.data.id, etapa: de }, data: { etapa: e.data.a } });
    if (r.count === 0) return fallo("Alguien más acaba de cambiar este lead. Recarga.");
    if (e.data.a === "enviado") {
      await prisma.evento.create({ data: { prospectoId: e.data.id, usuarioId: u.id, tipo: "enviado", de, a: "enviado", canal: "", texto: "propuesta enviada desde la ficha" } });
    } else {
      await prisma.evento.create({ data: { prospectoId: e.data.id, usuarioId: u.id, tipo: "etapa", de, a: e.data.a, texto: e.data.motivo } });
    }
    refrescar(e.data.id);
    return exito();
  } catch (err) { console.error("moverLead", err); return fallo("No se pudo guardar. Intenta de nuevo."); }
}

export async function guardarSiguientePaso(prospectoId: number, texto: string, fecha: string): Promise<Resultado> {
  const u = await exigirSesion();
  const e = z.object({ id: Id, texto: z.string().trim().max(160), fecha: z.string().trim() }).safeParse({ id: prospectoId, texto, fecha });
  if (!e.success) return fallo("Revisa el texto (hasta 160 letras).");
  if (e.data.fecha !== "" && !esFechaIso(e.data.fecha)) return fallo("Revisa la fecha.");
  try {
    // El prospectador solo toca leads del directorio
    const r = await prisma.prospecto.updateMany({ where: { id: e.data.id, esLead: true, ...(u.rol !== "dueno" ? { fuenteLead: "directorio" } : {}) }, data: { proximoPaso: e.data.texto, proximoSeguimiento: e.data.fecha || null } });
    if (r.count === 0) return fallo(ERROR);
    await prisma.evento.create({ data: { prospectoId: e.data.id, usuarioId: u.id, tipo: "nota", texto: `Siguiente paso: ${e.data.texto || "(sin texto)"}${e.data.fecha ? " · " + e.data.fecha : ""}` } });
    refrescar(e.data.id);
    return exito();
  } catch (err) { console.error("guardarSiguientePaso", err); return fallo("No se pudo guardar. Intenta de nuevo."); }
}

const Datos = z.object({
  fuenteLead: FuenteZ.optional(),
  valorEstimado: z.string().trim().refine((s) => s === "" || MONTO_TEXTO.test(s), "monto").optional(),
  propuestaUrl: z.string().trim().max(300).optional(),
  nichoId: z.number().int().positive().optional(),
});
export async function guardarDatosLead(prospectoId: number, datos: { fuenteLead?: FuenteLead; valorEstimado?: string; propuestaUrl?: string; nichoId?: number }): Promise<Resultado> {
  await exigirRol("dueno");
  const e = z.object({ id: Id, datos: Datos }).safeParse({ id: prospectoId, datos });
  if (!e.success) return fallo("Revisa el valor, la fuente o el nicho.");
  const d = e.data.datos;
  try {
    if (d.nichoId !== undefined && !(await prisma.nicho.findUnique({ where: { id: d.nichoId }, select: { id: true } }))) return fallo("Ese nicho no existe.");
    const r = await prisma.prospecto.updateMany({ where: { id: e.data.id, esLead: true }, data: {
      ...(d.fuenteLead !== undefined ? { fuenteLead: d.fuenteLead } : {}),
      ...(d.valorEstimado !== undefined ? { valorEstimado: d.valorEstimado ? montoDesdeTexto(d.valorEstimado) : null } : {}),
      ...(d.propuestaUrl !== undefined ? { propuestaUrl: d.propuestaUrl } : {}),
      ...(d.nichoId !== undefined ? { nichoId: d.nichoId } : {}),
    } });
    if (r.count === 0) return fallo(ERROR);
    refrescar(e.data.id);
    return exito();
  } catch (err) { console.error("guardarDatosLead", err); return fallo("No se pudo guardar. Intenta de nuevo."); }
}

// Una solicitud de la web o del embudo se vuelve lead con un toque. Con la fila bloqueada: dos toques crean uno.
export async function convertirSolicitud(solicitudId: number): Promise<Resultado<{ id: number }>> {
  const u = await exigirRol("dueno");
  const e = Id.safeParse(solicitudId);
  if (!e.success) return fallo("Esa solicitud no existe.");
  try {
    const id = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM SolicitudWeb WHERE id = ${e.data} FOR UPDATE`;
      const s = await tx.solicitudWeb.findUnique({ where: { id: e.data } });
      if (!s) return null;
      if (s.prospectoId) return s.prospectoId;
      let respuestas: Record<string, string> = {};
      try { respuestas = s.respuestas ? JSON.parse(s.respuestas) : {}; } catch { respuestas = {}; }
      const slug = nichoDesdeRubro(String(respuestas.rubro ?? ""));
      const nicho = (await tx.nicho.findUnique({ where: { slug }, select: { id: true } })) ?? (await tx.nicho.findUnique({ where: { slug: "otro" }, select: { id: true } }));
      if (!nicho) throw new Error("falta el nicho otro: correr scripts/sembrar-nichos.mjs");
      const whatsapp = normalizarCelular(s.whatsapp);
      // Un numero que no es celular VE/CO (fijo, extranjero) no se pierde: va como telefono y en la nota
      const telefono = s.whatsapp && !whatsapp ? s.whatsapp.trim().slice(0, 80) : "";
      const correo = s.correo.toLowerCase();
      const legibles = respuestasLegibles(s.respuestas).map((r) => `${r.clave}: ${r.valor}`).join("\n");
      const nota = [s.mensaje, telefono ? `\nTeléfono tal como lo escribió: ${telefono}` : "", legibles ? "\nRespuestas del embudo:\n" + legibles : ""].join("\n").trim().slice(0, 16000);
      const clave = claveLead(s.nombre.slice(0, TOPES.nombre), "", whatsapp || correo || telefono);
      const datos = {
        nichoId: nicho.id, nombre: s.nombre.slice(0, TOPES.nombre), ciudad: "", whatsapp, telefono, email: correo, nota,
        fuentes: [] as string[], fuentesPorCampo: {}, origen: "solicitud", esLead: true, fuenteLead: fuenteDesdeSolicitud(s),
        proximoPaso: "escribirle", proximoSeguimiento: hoyCaracas(), codigo: generarCodigo(), clave, ordenCola: 0,
      };
      let prospectoId: number;
      try {
        prospectoId = (await tx.prospecto.create({ data: datos, select: { id: true } })).id;
        await tx.evento.create({ data: { prospectoId, usuarioId: u.id, tipo: "importado", texto: `solicitud ${s.id} (${s.tipo})` } });
      } catch (err) {
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
        const existente = await tx.prospecto.findUnique({ where: { nichoId_clave: { nichoId: nicho.id, clave } }, select: { id: true } });
        if (!existente) throw err;
        prospectoId = existente.id;
      }
      await tx.solicitudWeb.update({ where: { id: s.id }, data: { prospectoId, atendidaEn: s.atendidaEn ?? new Date() } });
      return prospectoId;
    });
    if (!id) return fallo("Esa solicitud no existe.");
    refrescar(id);
    revalidatePath("/web");
    return exito({ id });
  } catch (err) { console.error("convertirSolicitud", err); return fallo("No se pudo convertir. Intenta de nuevo."); }
}
