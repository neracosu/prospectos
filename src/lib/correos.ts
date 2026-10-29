// src/lib/correos.ts — correo por propuesta: alta del envio y rastreo por token (apertura, clic, descarga del PDF).
// Sin next/headers: la sesion llega como argumento (ver sesion-ligera.ts) para poder probarse.
import { prisma } from "@/lib/db";
import { generarCodigo, CODIGO_VALIDO } from "@/lib/codigo";

export const TOKEN_VALIDO = CODIGO_VALIDO;

export async function crearEnvio(d: { prospectoId: number; tipo: "inicial" | "seguimiento"; asunto: string; para: string }): Promise<{ id: number; token: string }> {
  const token = generarCodigo();
  const e = await prisma.envioCorreo.create({ data: { prospectoId: d.prospectoId, tipo: d.tipo, asunto: d.asunto.slice(0, 200), para: d.para.slice(0, 120), token }, select: { id: true } });
  return { id: e.id, token };
}

type Opc = { conSesion?: boolean };
type Campo = "abierto" | "clic" | "pdf";
const CAMPOS = {
  abierto: { en: "abiertoEn", cuenta: "aperturas", evento: "correo_abierto" },
  clic: { en: "clicEn", cuenta: "clics", evento: "correo_clic" },
  pdf: { en: "pdfEn", cuenta: "pdfs", evento: "pdf_descargado" },
} as const;

// Suma el contador siempre; la fecha y el evento solo la primera vez.
async function contar(envio: { id: number; prospectoId: number; primera: boolean }, campo: Campo): Promise<void> {
  const c = CAMPOS[campo];
  const data = { [c.cuenta]: { increment: 1 }, ...(envio.primera ? { [c.en]: new Date() } : {}) };
  await prisma.envioCorreo.update({ where: { id: envio.id }, data });
  if (envio.primera) await prisma.evento.create({ data: { prospectoId: envio.prospectoId, tipo: c.evento } });
}

export async function registrarApertura(token: string, o: Opc = {}): Promise<void> {
  if (!TOKEN_VALIDO.test(token) || o.conSesion) return;
  const e = await prisma.envioCorreo.findUnique({ where: { token }, select: { id: true, prospectoId: true, abiertoEn: true } });
  if (e) await contar({ id: e.id, prospectoId: e.prospectoId, primera: !e.abiertoEn }, "abierto");
}

export async function registrarClic(token: string, o: Opc = {}): Promise<string | null> {
  if (!TOKEN_VALIDO.test(token)) return null;
  const e = await prisma.envioCorreo.findUnique({ where: { token }, select: { id: true, prospectoId: true, clicEn: true, prospecto: { select: { codigo: true } } } });
  if (!e) return null;
  if (!o.conSesion) await contar({ id: e.id, prospectoId: e.prospectoId, primera: !e.clicEn }, "clic");
  return e.prospecto.codigo;
}

export async function registrarPdf(token: string, codigo: string, o: Opc = {}): Promise<void> {
  if (!TOKEN_VALIDO.test(token) || o.conSesion) return;
  const e = await prisma.envioCorreo.findUnique({ where: { token }, select: { id: true, prospectoId: true, pdfEn: true, prospecto: { select: { codigo: true } } } });
  if (!e || e.prospecto.codigo !== codigo) return;
  await contar({ id: e.id, prospectoId: e.prospectoId, primera: !e.pdfEn }, "pdf");
}
