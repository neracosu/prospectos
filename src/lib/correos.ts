// src/lib/correos.ts — correo por propuesta: alta del envio y rastreo por token (apertura, clic, descarga del PDF).
// Sin next/headers: la sesion llega como argumento (ver sesion-ligera.ts) para poder probarse.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { generarCodigo, CODIGO_VALIDO } from "@/lib/codigo";
import { DEL_DIRECTORIO } from "@/lib/prospectos";
import { paisDeCiudad } from "@/lib/overpass-contrato";
import { hoyCaracas, sumarDias } from "@/lib/fecha-caracas";
import { normalizarCorreo, motivoDeCorreo, type EstadoFicha } from "@/lib/ficha-contrato";
import { leerFicha } from "@/lib/fichas";
import { leerPlantillaPara, generarPdf, hashDe, fechaDePropuesta } from "@/lib/propuesta";
import { renderPropuesta, webUsable } from "@/lib/propuesta-contrato";
import { armarCorreoPropuesta, ventanaDeEnvio, tamanoLote, type DatosCorreo } from "@/lib/correo-propuesta-contrato";
import { leerCorreosAutomatico, leerCorreosPorDia } from "@/lib/configuracion";
import { enviarCorreo } from "@/lib/correo-envio";
import { puedeEnviar, type ModoEnvio } from "@/lib/correos-contrato";
import { fallo, exito, type Resultado } from "@/acciones/resultado";

export const TOKEN_VALIDO = CODIGO_VALIDO;

// Una reserva (fila creada antes de generar el PDF y mandar) lleva fallo "en curso". Cuenta como envio bueno solo
// mientras tenga menos de 10 minutos: si el proceso muere a medias, pasa a "interrumpido" y se puede reintentar.
const EN_CURSO = "en curso";
const YA_RECIBIO = "Ese correo ya recibió una propuesta de otro negocio.";
const VIGENCIA_MS = 10 * 60_000;
const buenoPrisma = (): Prisma.EnvioCorreoWhereInput => ({ OR: [{ fallo: "" }, { fallo: EN_CURSO, enviadoEn: { gte: new Date(Date.now() - VIGENCIA_MS) } }] });
const esBueno = (e: { fallo: string; enviadoEn: Date }): boolean => e.fallo === "" || (e.fallo === EN_CURSO && e.enviadoEn.getTime() >= Date.now() - VIGENCIA_MS);

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

const ORDEN_ARQUETIPO = ["comercio-y-tienda", "tienda-por-instagram", "farmacias", "restaurantes-y-bares", "comida-por-encargo", "hoteles-estadia", "reservas", "hoteles", "cobros-y-pagos", "citas-y-servicios"];
const rangoArquetipo = (a: string) => { const i = ORDEN_ARQUETIPO.indexOf(a); return i < 0 ? ORDEN_ARQUETIPO.length : i; };
const ETAPAS_RESPUESTA = ["respondio", "reunion", "ganado"];

export type FilaCola = {
  prospectoId: number; codigo: string; nombre: string; ciudad: string; arquetipo: string; nichoNombre: string; email: string;
  estadoFicha: EstadoFicha; gancho: string; resumen: string; alAutomatico: boolean; nombreNoCoincide: boolean; bloqueado: string; etapa: string;
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
  // Direcciones que ya recibieron un envio bueno, de cualquier prospecto (tambien de los que no estan en esta cola).
  const correosVe = [...new Set(ve.map((p) => normalizarCorreo(p.email)))];
  const yaRecibidas = new Map<string, Set<number>>();
  for (const e of await prisma.envioCorreo.findMany({ where: { para: { in: correosVe }, ...buenoPrisma() }, select: { para: true, prospectoId: true } })) {
    yaRecibidas.set(e.para, (yaRecibidas.get(e.para) ?? new Set()).add(e.prospectoId));
  }
  const deOtro = (f: FilaCola) => [...(yaRecibidas.get(normalizarCorreo(f.email)) ?? [])].some((id) => id !== f.prospectoId);
  const filas = ve.map((p): FilaCola => {
    const ficha = p.ficha!;
    const hallazgos = (ficha.hallazgos ?? {}) as { web?: { nombreCoincide?: boolean } };
    const ultimo = p.envios[p.envios.length - 1] ?? null;
    const buenos = p.envios.filter(esBueno);
    const hayInicial = buenos.some((e) => e.tipo === "inicial");
    const haySeguimiento = buenos.some((e) => e.tipo === "seguimiento");
    const sinTocar = !p.envios.some((e) => e.abiertoEn || e.clicEn || e.pdfEn);
    return {
      prospectoId: p.id, codigo: p.codigo, nombre: p.nombre, ciudad: p.ciudad, arquetipo: p.nicho.plantillaPropuesta, nichoNombre: p.nicho.nombre,
      email: p.email, estadoFicha: ficha.estado as EstadoFicha, gancho: ficha.gancho, resumen: ficha.resumen, alAutomatico: ficha.alAutomatico,
      nombreNoCoincide: hallazgos.web?.nombreCoincide === false, bloqueado: motivos.get(normalizarCorreo(p.email)) ?? "", etapa: p.etapa,
      envio: ultimo && { id: ultimo.id, tipo: ultimo.tipo, enviadoEn: ultimo.enviadoEn, abiertoEn: ultimo.abiertoEn, clicEn: ultimo.clicEn, pdfEn: ultimo.pdfEn, fallo: ultimo.fallo },
      tocaSeguimiento: hayInicial && !haySeguimiento && sinTocar && p.etapa === "enviado" && !!p.proximoSeguimiento && p.proximoSeguimiento <= hoy,
    };
  });
  const conExito = new Set(ps.filter((p) => p.envios.some(esBueno)).map((p) => p.id));
  const sirve = (f: FilaCola): boolean => {
    const enviada = conExito.has(f.prospectoId);
    switch (filtro.estado) {
      // Sin plantilla no hay propuesta que mandar: fuera de «listas» (y por tanto del automatico). Desde el 31-oct-2026 un
      // negocio al que ya se le escribio por WhatsApp SI entra (Neri: mas canales, mas probabilidad); lo que lo saca es haber
      // recibido ya el correo, haber respondido o estar descartado.
      case "listas": return f.arquetipo !== "" && !enviada && !f.bloqueado && !(f.envio && !esBueno(f.envio)) && (f.etapa === "por_contactar" || f.etapa === "enviado") && !deOtro(f) && !motivoDeCorreo(normalizarCorreo(f.email), f.ciudad, paisDeCiudad);
      case "enviadas": return enviada;
      case "seguimiento": return f.tocaSeguimiento;
      case "bloqueadas": return !!f.bloqueado;
      case "fallidas": return !!f.envio && !esBueno(f.envio);
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
    where: { envios: { some: buenoPrisma() } },
    select: { etapa: true, nicho: { select: { plantillaPropuesta: true } }, envios: { where: buenoPrisma(), select: { abiertoEn: true, clicEn: true, pdfEn: true } } },
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
  return prisma.envioCorreo.count({ where: { ...buenoPrisma(), enviadoEn: { gte: desde, lt: new Date(desde.getTime() + 86_400_000) } } });
}

function hostDe(url: string): string {
  try { return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, ""); } catch { return ""; }
}

const esDe = (host: string, dominio: string) => host === dominio || host.endsWith(`.${dominio}`);

// De donde salio el correo, para el pie («Le escribo porque … publica este correo en …»). Solo se dice «su pagina»
// cuando la fuente es su Facebook, su Instagram o su propia web; cualquier otra cosa es un directorio.
export function dondeCorreo(fuenteEmail: string, web: string): string {
  const host = fuenteEmail ? hostDe(fuenteEmail) : "";
  if (!host) return "un directorio público";
  if (esDe(host, "facebook.com")) return "su página de Facebook";
  if (esDe(host, "instagram.com")) return "su página de Instagram";
  const hostWeb = web ? hostDe(web) : "";
  if (hostWeb && host === hostWeb) return `su página ${hostWeb}`;
  return "un directorio público";
}

type Preparado = { datos: DatosCorreo; correo: ReturnType<typeof armarCorreoPropuesta>; pdf: { ruta: string; nombre: string } | null; token: string };

type Reserva = { reenviar?: boolean; tope?: number };

// Reserva el envio (fila con fallo "en curso") dentro de una transaccion que serializa con un candado de fila: asi el segundo
// clic o el automatico encuentran la fila en curso y el tope diario no se pasa.
async function reservar(d: { prospectoId: number; tipo: "inicial" | "seguimiento"; asunto: string; para: string }, o: Reserva, hoy: string): Promise<{ token: string } | { error: string }> {
  // La fila la siembra la migracion 20261031100000; esto es solo respaldo (una base sin ella). INSERT IGNORE no choca
  // con otro envio que la cree a la vez (el upsert de Prisma daba P2002 en esa carrera).
  await prisma.$executeRaw`INSERT IGNORE INTO Configuracion (clave, valor) VALUES ('candado_correos', '1')`;
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT clave FROM Configuracion WHERE clave = 'candado_correos' FOR UPDATE`;
    await tx.envioCorreo.updateMany({ where: { fallo: EN_CURSO, enviadoEn: { lt: new Date(Date.now() - VIGENCIA_MS) } }, data: { fallo: "interrumpido" } });
    const propios = await tx.envioCorreo.findMany({ where: { prospectoId: d.prospectoId, ...buenoPrisma() }, select: { tipo: true } });
    if (d.tipo === "inicial" && !o.reenviar && propios.some((e) => e.tipo === "inicial")) return { error: "A este negocio ya se le envió la propuesta." };
    if (d.tipo === "seguimiento" && propios.some((e) => e.tipo === "seguimiento")) return { error: "A este negocio ya se le envió el seguimiento." };
    if (await tx.envioCorreo.count({ where: { para: d.para, ...buenoPrisma(), prospectoId: { not: d.prospectoId } } })) return { error: YA_RECIBIO };
    if (o.tope !== undefined) {
      const desde = new Date(`${hoy}T04:00:00.000Z`);
      const n = await tx.envioCorreo.count({ where: { ...buenoPrisma(), enviadoEn: { gte: desde, lt: new Date(desde.getTime() + 86_400_000) } } });
      if (n >= o.tope) return { error: `Hoy ya salieron ${n} de ${o.tope}. Suba el tope en Ajustes o espere a mañana.` };
    }
    const token = generarCodigo();
    await tx.envioCorreo.create({ data: { prospectoId: d.prospectoId, tipo: d.tipo, asunto: d.asunto.slice(0, 200), para: d.para.slice(0, 120), token, fallo: EN_CURSO } });
    return { token };
  });
}

const marcarFallo = (token: string, motivo: string) => prisma.envioCorreo.update({ where: { token }, data: { fallo: (motivo || "error").slice(0, 300) } });

// Lo que comparten el envio y la vista previa: el prospecto, su plantilla, su ficha y los DatosCorreo sin token.
const sinCorreo = (error: string): { error: string } => ({ error });
async function cargarCorreo(prospectoId: number, tipo: "inicial" | "seguimiento") {
  const p = await prisma.prospecto.findUnique({
    where: { id: prospectoId },
    select: { id: true, nombre: true, ciudad: true, web: true, email: true, codigo: true, fuentesPorCampo: true, nicho: { select: { plantillaPropuesta: true, nombre: true } },
      envios: { where: { ...buenoPrisma(), tipo: "inicial" }, orderBy: { id: "asc" }, take: 1, select: { enviadoEn: true } } },
  });
  if (!p) return sinCorreo("Ese prospecto no existe.");
  const arquetipo = p.nicho.plantillaPropuesta;
  const pais = paisDeCiudad(p.ciudad);
  const plantilla = arquetipo ? await leerPlantillaPara(arquetipo, pais) : null;
  if (!plantilla) return sinCorreo("Este negocio no tiene propuesta armada.");
  const para = normalizarCorreo(p.email);
  if (!para) return sinCorreo("Este negocio no tiene correo.");
  const ficha = await leerFicha(p.id);
  const gancho = ficha?.gancho ?? "";
  const hoy = hoyCaracas();
  const fuenteEmail = String((p.fuentesPorCampo as Record<string, unknown> | null)?.email ?? "");
  const datos: DatosCorreo = {
    nombre: p.nombre, ciudad: p.ciudad, arquetipo, codigo: p.codigo, token: "", gancho,
    hojas: (plantilla.match(/<section class="hoja/g) ?? []).length, hoy, dondeCorreo: dondeCorreo(fuenteEmail, p.web), tipo,
    ...(tipo === "seguimiento" && p.envios[0] ? { enviadoAnteriorEn: hoyCaracas(p.envios[0].enviadoEn) } : {}),
  };
  return { p, arquetipo, pais, plantilla, para, ficha, gancho, hoy, datos };
}

// Los datos del correo con el token dado, sin reservar nada (la vista previa usa un token que no existe).
export async function datosCorreoDe(prospectoId: number, tipo: "inicial" | "seguimiento", token: string): Promise<DatosCorreo | { error: string }> {
  const c = await cargarCorreo(prospectoId, tipo);
  return "error" in c ? c : { ...c.datos, token };
}

// El html del PDF de la propuesta (con el gancho de la ficha): lo comparten el envio y el pregenerado.
async function htmlPdfDeCarga(c: Exclude<Awaited<ReturnType<typeof cargarCorreo>>, { error: string }>): Promise<string> {
  const { p, arquetipo, pais, plantilla, ficha, gancho } = c;
  return renderPropuesta(plantilla, p.nombre, "#", { ciudad: p.ciudad, rubro: p.nicho.nombre.toLowerCase(), conWeb: webUsable(!!p.web, ficha?.hallazgos.web?.estado), fecha: await fechaDePropuesta(p.id), pais, gancho, paraPdf: true, plantilla: arquetipo });
}
export async function htmlDelPdf(prospectoId: number): Promise<{ codigo: string; html: string; hash: string } | { error: string }> {
  const c = await cargarCorreo(prospectoId, "inicial");
  if ("error" in c) return c;
  const html = await htmlPdfDeCarga(c);
  return { codigo: c.p.codigo, html, hash: hashDe(html) };
}

export async function prepararEnvio(prospectoId: number, tipo: "inicial" | "seguimiento", opc: Reserva = {}): Promise<Preparado | { error: string }> {
  const c = await cargarCorreo(prospectoId, tipo);
  if ("error" in c) return c;
  const { p, arquetipo, pais, plantilla, para, ficha, gancho, hoy, datos } = c;
  // El asunto no depende del token: se arma con uno provisional para reservar la fila ANTES de generar el PDF.
  const reserva = await reservar({ prospectoId: p.id, tipo, asunto: armarCorreoPropuesta({ ...datos, token: "x".repeat(22) }).asunto, para }, opc, hoy);
  if ("error" in reserva) return reserva;
  const { token } = reserva;
  // El seguimiento es corto y va sin adjunto (spec §4): solo el enlace.
  if (tipo === "seguimiento") {
    const final = { ...datos, token };
    return { datos: final, correo: armarCorreoPropuesta(final), pdf: null, token };
  }
  try {
    // Mismo camino que /p/<codigo>/pdf (mismo html, mismo hash): comparten cache.
    const html = await htmlPdfDeCarga(c);
    const ruta = await generarPdf(p.codigo, html, hashDe(html));
    const pdf = { ruta, nombre: `Propuesta-NERACOSU-${p.nombre.replace(/[^A-Za-z0-9 _-]/g, "").trim().slice(0, 60) || "Propuesta"}.pdf` };
    const final = { ...datos, token };
    return { datos: final, correo: armarCorreoPropuesta(final), pdf, token };
  } catch (err) {
    const ocupado = err instanceof Error && err.message === "PDF_OCUPADO";
    await marcarFallo(token, ocupado ? "pdf ocupado" : "pdf: " + (err instanceof Error ? err.message : String(err)));
    return { error: ocupado ? "El servidor está ocupado generando otro PDF. Intente en unos segundos." : "No se pudo generar el PDF. Intente de nuevo." };
  }
}

// modo: "manual" desde el boton de Neri, "automatico" desde el cron (por defecto, lo mas estricto).
export async function enviarA(prospectoId: number, tipo: "inicial" | "seguimiento", usuarioId: number | null, opciones: { reenviar?: boolean; tope?: number; modo?: ModoEnvio } = {}): Promise<Resultado<{ token: string }>> {
  const hoy = hoyCaracas();
  // "pedido": el negocio lo pidio (un lead tambien); se salta la cola, la ficha, el filtro de correos genericos y la
  // etapa (aunque ya haya respondido). Lo demas (pais, bloqueado, misma direccion ya servida) sigue igual.
  const pedido = opciones.modo === "pedido";
  const p = await prisma.prospecto.findFirst({ where: pedido ? { id: prospectoId } : { AND: [{ id: prospectoId }, DEL_DIRECTORIO] }, select: { id: true, email: true, ciudad: true, etapa: true, esLead: true, fuenteLead: true } });
  if (!p) return fallo("Ese prospecto no existe.");
  if (paisDeCiudad(p.ciudad) !== "VE") return fallo("Solo se envía a negocios de Venezuela.");
  const email = normalizarCorreo(p.email);
  if (!email) return fallo("Este negocio no tiene correo.");
  if (!pedido && motivoDeCorreo(email, p.ciudad, paisDeCiudad)) return fallo("Ese correo no sirve para escribirle (inválido, genérico o del Estado).");
  if (await prisma.correoBloqueado.findUnique({ where: { email } })) return fallo("Ese correo está bloqueado.");
  const [fila] = (await colaCorreo(hoy)).filter((f) => f.prospectoId === prospectoId);
  if (!fila && !pedido) return fallo("Este negocio todavía no tiene ficha.");
  if (fila && !puedeEnviar(fila, opciones.modo ?? "automatico")) {
    return fallo(fila.nombreNoCoincide ? "El nombre de la web no coincide: revise la ficha antes de enviar." : "Este negocio no tiene propuesta armada.");
  }
  const envios = await prisma.envioCorreo.findMany({ where: { prospectoId, ...buenoPrisma() }, select: { tipo: true } });
  const hayInicial = envios.some((e) => e.tipo === "inicial");
  let real: "inicial" | "seguimiento" = "inicial";
  if (pedido) {
    // Siempre la propuesta completa con el PDF; si ya habia salido una, va como reenvio.
  } else if (hayInicial && !opciones.reenviar) {
    if (!fila?.tocaSeguimiento) return fallo("A este negocio ya se le envió la propuesta.");
    real = "seguimiento";
  } else if (!hayInicial && tipo === "seguimiento") {
    return fallo("Todavía no se le ha enviado la propuesta inicial.");
  } else if (!hayInicial) {
    // Primer envio por correo: a quien sigue por contactar o ya recibio el WhatsApp (mas canales, mas probabilidad);
    // no a quien ya respondio, ni a quien esta descartado o mas adelante.
    if (p.etapa !== "por_contactar" && p.etapa !== "enviado") return fallo("Este negocio ya respondió o no está por contactar.");
  }
  const prep = await prepararEnvio(prospectoId, real, { reenviar: opciones.reenviar || (pedido && hayInicial), tope: opciones.tope });
  if ("error" in prep) return fallo(prep.error);
  const r = await enviarCorreo({ para: email, asunto: prep.correo.asunto, html: prep.correo.html, texto: prep.correo.texto, ...(prep.pdf ? { adjunto: { nombre: prep.pdf.nombre, ruta: prep.pdf.ruta } } : {}) });
  if (!r.ok) {
    await marcarFallo(prep.token, r.error);
    return fallo("No se pudo enviar el correo. Quedó anotado el motivo; puede reintentar.");
  }
  const dias = (await prisma.nicho.findFirst({ where: { prospectos: { some: { id: prospectoId } } }, select: { diasSeguimiento: true } }))?.diasSeguimiento ?? 3;
  // Quien pide la propuesta por correo ya respondio: pasa a «respondio» (y a lead) si estaba antes de eso.
  const pasaARespondio = pedido && (p.etapa === "por_contactar" || p.etapa === "enviado");
  await prisma.$transaction([
    prisma.envioCorreo.update({ where: { token: prep.token }, data: { fallo: "" } }),
    prisma.evento.create({ data: { prospectoId, usuarioId, tipo: real === "inicial" ? "enviado" : "seguimiento", de: p.etapa, a: pasaARespondio ? "respondio" : "enviado", canal: "email", texto: (pedido ? "La pidió el negocio · " : "") + prep.correo.asunto.slice(0, 170) } }),
    ...(pasaARespondio
      ? [prisma.evento.create({ data: { prospectoId, usuarioId, tipo: "etapa", de: p.etapa, a: "respondio", texto: "Pidió la propuesta por correo" } }),
         prisma.prospecto.updateMany({ where: { id: prospectoId }, data: { etapa: "respondio", esLead: true, fuenteLead: p.fuenteLead || "directorio", proximoSeguimiento: sumarDias(hoy, dias) } })]
      // No baja de etapa a quien ya respondio. Un correo enviado no asciende a lead (eso pasa al marcar «Respondio»).
      : [prisma.prospecto.updateMany({ where: { id: prospectoId, etapa: { in: ["por_contactar", "enviado"] } }, data: { etapa: "enviado", proximoSeguimiento: sumarDias(hoy, dias) } })]),
  ]);
  return exito({ token: prep.token });
}

export type ResultadoAutomatico = { enviados: number; delDia: number; tope: number; motivo: "apagado" | "fuera_de_horario" | "tope" | "sin_cola" | "fallos" | "ok" };

// Una pasada del cron: manda un lote chico de la cola "listas" que Neri dejo al automatico. El tope se aplica dentro del
// candado de enviarA, asi que ni dos pasadas solapadas ni un clic a mano lo pasan.
export async function enviarAutomatico(ahora: Date = new Date()): Promise<ResultadoAutomatico> {
  const hoy = hoyCaracas(ahora);
  const hora = new Intl.DateTimeFormat("es-VE", { timeZone: "America/Caracas", hour: "2-digit", minute: "2-digit", hour12: false }).format(ahora);
  const [activo, tope] = await Promise.all([leerCorreosAutomatico(), leerCorreosPorDia()]);
  let enviados = 0;
  let delDia = await enviadosHoy(hoy);
  let motivo: ResultadoAutomatico["motivo"] = "ok";
  if (!activo) motivo = "apagado";
  else if (!ventanaDeEnvio(ahora)) motivo = "fuera_de_horario";
  else if (delDia >= tope) motivo = "tope";
  else {
    const cola = (await colaCorreo(hoy, { estado: "listas" })).filter((f) => f.alAutomatico && puedeEnviar(f, "automatico") && (f.estadoFicha === "lista" || f.estadoFicha === "revisada"));
    if (cola.length === 0) motivo = "sin_cola";
    const lote = tamanoLote(tope);
    let intentos = 0, seguidos = 0;
    for (const f of cola) {
      if (intentos >= lote) break;
      if (await enviadosHoy(hoy) >= tope) { motivo = "tope"; break; }
      intentos++;
      let r: Awaited<ReturnType<typeof enviarA>>;
      try { r = await enviarA(f.prospectoId, "inicial", null, { tope, modo: "automatico" }); }
      catch (e) { console.error("[correos]", f.prospectoId, e); r = { ok: false, mensaje: "excepcion" }; }
      if (r.ok) { enviados++; seguidos = 0; continue; }
      // Otro negocio ya recibio esa direccion (la cola se armo antes): no se mando nada, no es un fallo.
      if (r.mensaje === YA_RECIBIO) { intentos--; continue; }
      if (r.mensaje.startsWith("Hoy ya salieron")) { motivo = "tope"; break; }
      if (++seguidos >= 2) { motivo = "fallos"; break; }
    }
    delDia = await enviadosHoy(hoy);
  }
  console.log(`[correos] ${hoy} ${hora}: ${enviados} enviados, ${delDia} del dia, tope ${tope} (${motivo})`);
  return { enviados, delDia, tope, motivo };
}
