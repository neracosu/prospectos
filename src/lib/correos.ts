// src/lib/correos.ts — correo por propuesta: alta del envio y rastreo por token (apertura, clic, descarga del PDF).
// Sin next/headers: la sesion llega como argumento (ver sesion-ligera.ts) para poder probarse.
import { prisma } from "@/lib/db";
import { generarCodigo, CODIGO_VALIDO } from "@/lib/codigo";
import { DEL_DIRECTORIO } from "@/lib/prospectos";
import { paisDeCiudad } from "@/lib/overpass-contrato";
import { hoyCaracas, sumarDias } from "@/lib/fecha-caracas";
import { normalizarCorreo, type EstadoFicha } from "@/lib/ficha-contrato";
import { leerFicha } from "@/lib/fichas";
import { leerPlantillaPara, generarPdf, hashDe, fechaDePropuesta } from "@/lib/propuesta";
import { renderPropuesta, webUsable } from "@/lib/propuesta-contrato";
import { armarCorreoPropuesta, type DatosCorreo } from "@/lib/correo-propuesta-contrato";
import { enviarCorreo } from "@/lib/correo-envio";
import { fallo, exito, type Resultado } from "@/acciones/resultado";

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

// Suma el contador siempre; la fecha y el evento solo la primera vez. La primera vez se decide con un
// updateMany condicionado a que el campo siga en null: bajo carrera (proxies de imagenes) gana una sola peticion.
async function contar(envio: { id: number; prospectoId: number }, campo: Campo): Promise<void> {
  const c = CAMPOS[campo];
  const { count } = await prisma.envioCorreo.updateMany({ where: { id: envio.id, [c.en]: null }, data: { [c.en]: new Date() } });
  await prisma.envioCorreo.update({ where: { id: envio.id }, data: { [c.cuenta]: { increment: 1 } } });
  if (count === 1) await prisma.evento.create({ data: { prospectoId: envio.prospectoId, tipo: c.evento } });
}

export async function registrarApertura(token: string, o: Opc = {}): Promise<void> {
  if (!TOKEN_VALIDO.test(token) || o.conSesion) return;
  const e = await prisma.envioCorreo.findUnique({ where: { token }, select: { id: true, prospectoId: true } });
  if (e) await contar({ id: e.id, prospectoId: e.prospectoId }, "abierto");
}

export async function registrarClic(token: string, o: Opc = {}): Promise<string | null> {
  if (!TOKEN_VALIDO.test(token)) return null;
  const e = await prisma.envioCorreo.findUnique({ where: { token }, select: { id: true, prospectoId: true, prospecto: { select: { codigo: true } } } });
  if (!e) return null;
  if (!o.conSesion) await contar({ id: e.id, prospectoId: e.prospectoId }, "clic");
  return e.prospecto.codigo;
}

export async function registrarPdf(token: string, codigo: string, o: Opc = {}): Promise<void> {
  if (!TOKEN_VALIDO.test(token) || o.conSesion) return;
  const e = await prisma.envioCorreo.findUnique({ where: { token }, select: { id: true, prospectoId: true, prospecto: { select: { codigo: true } } } });
  if (!e || e.prospecto.codigo !== codigo) return;
  await contar({ id: e.id, prospectoId: e.prospectoId }, "pdf");
}

// ---------------------------------------------------------------------------------------------------------------
// Envio a mano (29-oct-2026): cola, cifras, preparar y enviar. Solo directorio de Venezuela con correo y ficha.
// ---------------------------------------------------------------------------------------------------------------

const ORDEN_ARQUETIPO = ["comercio-y-tienda", "restaurantes-y-bares", "hoteles-estadia", "reservas", "hoteles", "cobros-y-pagos", "citas-y-servicios"];
const rangoArquetipo = (a: string) => { const i = ORDEN_ARQUETIPO.indexOf(a); return i < 0 ? ORDEN_ARQUETIPO.length : i; };
const ETAPAS_RESPUESTA = ["respondio", "reunion", "ganado"];

export type FilaCola = {
  prospectoId: number; codigo: string; nombre: string; ciudad: string; arquetipo: string; nichoNombre: string; email: string;
  estadoFicha: EstadoFicha; gancho: string; alAutomatico: boolean; nombreNoCoincide: boolean; bloqueado: string; etapa: string;
  envio: { id: number; tipo: string; enviadoEn: Date; abiertoEn: Date | null; clicEn: Date | null; pdfEn: Date | null; fallo: string } | null;
  tocaSeguimiento: boolean;
};
export type FiltroCola = { arquetipo?: string; estado?: "listas" | "enviadas" | "seguimiento" | "bloqueadas" | "fallidas" };

export async function colaCorreo(hoy: string, filtro: FiltroCola = {}): Promise<FilaCola[]> {
  const ps = await prisma.prospecto.findMany({
    where: { AND: [DEL_DIRECTORIO, { email: { not: "" } }, { ficha: { isNot: null } }, ...(filtro.arquetipo ? [{ nicho: { plantillaPropuesta: filtro.arquetipo } }] : [])] },
    select: {
      id: true, codigo: true, nombre: true, ciudad: true, email: true, etapa: true, proximoSeguimiento: true,
      nicho: { select: { plantillaPropuesta: true, nombre: true } }, ficha: true,
      envios: { orderBy: { id: "asc" }, select: { id: true, tipo: true, enviadoEn: true, abiertoEn: true, clicEn: true, pdfEn: true, fallo: true } },
    },
  });
  const ve = ps.filter((p) => paisDeCiudad(p.ciudad) === "VE");
  const bloq = await prisma.correoBloqueado.findMany({ where: { email: { in: ve.map((p) => normalizarCorreo(p.email)) } }, select: { email: true, motivo: true } });
  const motivos = new Map(bloq.map((b) => [b.email, b.motivo]));
  const filas = ve.map((p): FilaCola => {
    const ficha = p.ficha!;
    const hallazgos = (ficha.hallazgos ?? {}) as { web?: { nombreCoincide?: boolean } };
    const ultimo = p.envios[p.envios.length - 1] ?? null;
    const buenos = p.envios.filter((e) => e.fallo === "");
    const hayInicial = buenos.some((e) => e.tipo === "inicial");
    const haySeguimiento = buenos.some((e) => e.tipo === "seguimiento");
    const sinTocar = !p.envios.some((e) => e.abiertoEn || e.clicEn || e.pdfEn);
    return {
      prospectoId: p.id, codigo: p.codigo, nombre: p.nombre, ciudad: p.ciudad, arquetipo: p.nicho.plantillaPropuesta, nichoNombre: p.nicho.nombre,
      email: p.email, estadoFicha: ficha.estado as EstadoFicha, gancho: ficha.gancho, alAutomatico: ficha.alAutomatico,
      nombreNoCoincide: hallazgos.web?.nombreCoincide === false, bloqueado: motivos.get(normalizarCorreo(p.email)) ?? "", etapa: p.etapa,
      envio: ultimo && { id: ultimo.id, tipo: ultimo.tipo, enviadoEn: ultimo.enviadoEn, abiertoEn: ultimo.abiertoEn, clicEn: ultimo.clicEn, pdfEn: ultimo.pdfEn, fallo: ultimo.fallo },
      tocaSeguimiento: hayInicial && !haySeguimiento && sinTocar && p.etapa === "enviado" && !!p.proximoSeguimiento && p.proximoSeguimiento <= hoy,
    };
  });
  const conExito = new Set(ps.filter((p) => p.envios.some((e) => e.fallo === "")).map((p) => p.id));
  const sirve = (f: FilaCola): boolean => {
    const enviada = conExito.has(f.prospectoId);
    switch (filtro.estado) {
      case "listas": return !enviada && !f.bloqueado && !(f.envio && f.envio.fallo !== "");
      case "enviadas": return enviada;
      case "seguimiento": return f.tocaSeguimiento;
      case "bloqueadas": return !!f.bloqueado;
      case "fallidas": return !!f.envio && f.envio.fallo !== "";
      default: return true;
    }
  };
  return filas.filter(sirve).sort((a, b) =>
    Number(!!b.gancho) - Number(!!a.gancho) || rangoArquetipo(a.arquetipo) - rangoArquetipo(b.arquetipo) || a.prospectoId - b.prospectoId);
}

export type Cifras = { enviados: number; abrieron: number; vieron: number; descargaron: number; respondieron: number };
const vacias = (): Cifras => ({ enviados: 0, abrieron: 0, vieron: 0, descargaron: 0, respondieron: 0 });

export async function cifrasCorreo(): Promise<{ total: Cifras; porArquetipo: Record<string, Cifras> }> {
  const ps = await prisma.prospecto.findMany({
    where: { envios: { some: { fallo: "" } } },
    select: { etapa: true, nicho: { select: { plantillaPropuesta: true } }, envios: { where: { fallo: "" }, select: { abiertoEn: true, clicEn: true, pdfEn: true } } },
  });
  const total = vacias(); const porArquetipo: Record<string, Cifras> = {};
  for (const p of ps) {
    const c = (porArquetipo[p.nicho.plantillaPropuesta] ??= vacias());
    const sumar = (k: keyof Cifras) => { total[k]++; c[k]++; };
    sumar("enviados");
    if (p.envios.some((e) => e.abiertoEn)) sumar("abrieron");
    if (p.envios.some((e) => e.clicEn)) sumar("vieron");
    if (p.envios.some((e) => e.pdfEn)) sumar("descargaron");
    if (ETAPAS_RESPUESTA.includes(p.etapa)) sumar("respondieron");
  }
  return { total, porArquetipo };
}

// Envios sin fallo cuyo enviadoEn cae en el dia de Caracas (UTC-4 fijo). Un envio recien creado y aun sin resolver
// cuenta: asi dos clics seguidos no se saltan el tope.
export async function enviadosHoy(hoy: string): Promise<number> {
  const desde = new Date(`${hoy}T04:00:00.000Z`);
  return prisma.envioCorreo.count({ where: { fallo: "", enviadoEn: { gte: desde, lt: new Date(desde.getTime() + 86_400_000) } } });
}

function hostDe(url: string): string {
  try { return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, ""); } catch { return ""; }
}

type Preparado = { datos: DatosCorreo; correo: ReturnType<typeof armarCorreoPropuesta>; pdf: { ruta: string; nombre: string } | null; token: string };

export async function prepararEnvio(prospectoId: number, tipo: "inicial" | "seguimiento"): Promise<Preparado | { error: string }> {
  const p = await prisma.prospecto.findUnique({
    where: { id: prospectoId },
    select: { id: true, nombre: true, ciudad: true, web: true, email: true, codigo: true, fuentesPorCampo: true, nicho: { select: { plantillaPropuesta: true, nombre: true } },
      envios: { where: { fallo: "", tipo: "inicial" }, orderBy: { id: "asc" }, take: 1, select: { enviadoEn: true } } },
  });
  if (!p) return { error: "Ese prospecto no existe." };
  const arquetipo = p.nicho.plantillaPropuesta;
  const pais = paisDeCiudad(p.ciudad);
  const plantilla = arquetipo ? await leerPlantillaPara(arquetipo, pais) : null;
  if (!plantilla) return { error: "Este negocio no tiene propuesta armada." };
  const para = normalizarCorreo(p.email);
  if (!para) return { error: "Este negocio no tiene correo." };
  const ficha = await leerFicha(p.id);
  const gancho = ficha?.gancho ?? "";
  const hoy = hoyCaracas();
  // Mismo camino que /p/<codigo>/pdf (mismo html, mismo hash): comparten cache.
  const html = renderPropuesta(plantilla, p.nombre, "#", { ciudad: p.ciudad, rubro: p.nicho.nombre.toLowerCase(), conWeb: webUsable(!!p.web, ficha?.hallazgos.web?.estado), fecha: await fechaDePropuesta(p.id), pais, gancho, paraPdf: true, plantilla: arquetipo });
  let pdf: Preparado["pdf"] = null;
  try {
    const ruta = await generarPdf(p.codigo, html, hashDe(html));
    pdf = { ruta, nombre: `Propuesta-NERACOSU-${p.nombre.replace(/[^A-Za-z0-9 _-]/g, "").trim().slice(0, 60) || "Propuesta"}.pdf` };
  } catch (err) {
    return { error: err instanceof Error && err.message === "PDF_OCUPADO" ? "El servidor está ocupado generando otro PDF. Intente en unos segundos." : "No se pudo generar el PDF. Intente de nuevo." };
  }
  const fuenteEmail = String((p.fuentesPorCampo as Record<string, unknown> | null)?.email ?? "");
  const hostWeb = p.web ? hostDe(p.web) : "";
  const deSuWeb = !!hostWeb && (!fuenteEmail || hostDe(fuenteEmail) === hostWeb);
  const dondeCorreo = deSuWeb ? `su página ${hostWeb}` : "un directorio público";
  const datos: DatosCorreo = {
    nombre: p.nombre, ciudad: p.ciudad, arquetipo, codigo: p.codigo, token: "", gancho,
    hojas: (plantilla.match(/<section class="hoja/g) ?? []).length, hoy, dondeCorreo, tipo,
    ...(tipo === "seguimiento" && p.envios[0] ? { enviadoAnteriorEn: hoyCaracas(p.envios[0].enviadoEn) } : {}),
  };
  // El asunto no lleva el token: se arma primero con uno provisional para crear la fila y luego con el real.
  const provisional = armarCorreoPropuesta({ ...datos, token: "x".repeat(22) });
  const { token } = await crearEnvio({ prospectoId: p.id, tipo, asunto: provisional.asunto, para });
  const final = { ...datos, token };
  return { datos: final, correo: armarCorreoPropuesta(final), pdf, token };
}

export async function enviarA(prospectoId: number, tipo: "inicial" | "seguimiento", usuarioId: number | null, opciones: { reenviar?: boolean } = {}): Promise<Resultado<{ token: string }>> {
  const hoy = hoyCaracas();
  const p = await prisma.prospecto.findFirst({ where: { AND: [{ id: prospectoId }, DEL_DIRECTORIO] }, select: { id: true, email: true, ciudad: true, etapa: true } });
  if (!p) return fallo("Ese prospecto no existe.");
  if (paisDeCiudad(p.ciudad) !== "VE") return fallo("Solo se envía a negocios de Venezuela.");
  const email = normalizarCorreo(p.email);
  if (!email) return fallo("Este negocio no tiene correo.");
  if (await prisma.correoBloqueado.findUnique({ where: { email } })) return fallo("Ese correo está bloqueado.");
  const [fila] = (await colaCorreo(hoy)).filter((f) => f.prospectoId === prospectoId);
  if (!fila) return fallo("Este negocio todavía no tiene ficha.");
  if (fila.nombreNoCoincide) return fallo("El nombre no coincide con su página web: revise la ficha antes de enviar.");
  const envios = await prisma.envioCorreo.findMany({ where: { prospectoId, fallo: "" }, select: { tipo: true } });
  const hayInicial = envios.some((e) => e.tipo === "inicial");
  let real: "inicial" | "seguimiento" = "inicial";
  if (hayInicial && !opciones.reenviar) {
    if (!fila.tocaSeguimiento) return fallo("A este negocio ya se le envió la propuesta.");
    real = "seguimiento";
  } else if (!hayInicial && tipo === "seguimiento") {
    return fallo("Todavía no se le ha enviado la propuesta inicial.");
  }
  const prep = await prepararEnvio(prospectoId, real);
  if ("error" in prep) return fallo(prep.error);
  const r = await enviarCorreo({ para: email, asunto: prep.correo.asunto, html: prep.correo.html, texto: prep.correo.texto, ...(prep.pdf ? { adjunto: { nombre: prep.pdf.nombre, ruta: prep.pdf.ruta } } : {}) });
  if (!r.ok) {
    await prisma.envioCorreo.update({ where: { token: prep.token }, data: { fallo: (r.error || "error").slice(0, 300) } });
    return fallo("No se pudo enviar el correo. Quedó anotado el motivo; puede reintentar.");
  }
  const dias = (await prisma.nicho.findFirst({ where: { prospectos: { some: { id: prospectoId } } }, select: { diasSeguimiento: true } }))?.diasSeguimiento ?? 3;
  await prisma.$transaction([
    prisma.evento.create({ data: { prospectoId, usuarioId, tipo: real === "inicial" ? "enviado" : "seguimiento", de: p.etapa, a: "enviado", canal: "email", texto: prep.correo.asunto.slice(0, 200) } }),
    // No baja de etapa a quien ya respondio: solo mueve a por_contactar y enviado.
    prisma.prospecto.updateMany({ where: { id: prospectoId, etapa: { in: ["por_contactar", "enviado"] } }, data: { etapa: "enviado", esLead: true, proximoSeguimiento: sumarDias(hoy, dias) } }),
    prisma.prospecto.updateMany({ where: { id: prospectoId, fuenteLead: "" }, data: { fuenteLead: "directorio" } }),
  ]);
  return exito({ token: prep.token });
}
