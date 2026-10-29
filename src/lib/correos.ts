// src/lib/correos.ts — correo por propuesta: alta del envio y rastreo por token (apertura, clic, descarga del PDF).
// Sin next/headers: la sesion llega como argumento (ver sesion-ligera.ts) para poder probarse.
import { prisma } from "@/lib/db";
import { generarCodigo, CODIGO_VALIDO } from "@/lib/codigo";
import { DEL_DIRECTORIO } from "@/lib/prospectos";
import { paisDeCiudad } from "@/lib/overpass-contrato";
import { hoyCaracas, sumarDias } from "@/lib/fecha-caracas";
import { normalizarCorreo, motivoDeCorreo, type EstadoFicha } from "@/lib/ficha-contrato";
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
  const conEnviado = new Set((await prisma.evento.findMany({ where: { tipo: "enviado", prospectoId: { in: ve.map((p) => p.id) } }, select: { prospectoId: true }, distinct: ["prospectoId"] })).map((e) => e.prospectoId));
  const filas = ve.map((p): FilaCola & { yaSeEnvio: boolean } => {
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
      yaSeEnvio: conEnviado.has(p.id),
      tocaSeguimiento: hayInicial && !haySeguimiento && sinTocar && p.etapa === "enviado" && !!p.proximoSeguimiento && p.proximoSeguimiento <= hoy,
    };
  });
  const conExito = new Set(ps.filter((p) => p.envios.some((e) => e.fallo === "")).map((p) => p.id));
  const sirve = (f: FilaCola & { yaSeEnvio?: boolean }): boolean => {
    const enviada = conExito.has(f.prospectoId);
    switch (filtro.estado) {
      case "listas": return !enviada && !f.bloqueado && !(f.envio && f.envio.fallo !== "") && f.etapa === "por_contactar" && !f.yaSeEnvio && !motivoDeCorreo(normalizarCorreo(f.email), f.ciudad, paisDeCiudad);
      case "enviadas": return enviada;
      case "seguimiento": return f.tocaSeguimiento;
      case "bloqueadas": return !!f.bloqueado;
      case "fallidas": return !!f.envio && f.envio.fallo !== "";
      default: return true;
    }
  };
  return filas.filter(sirve).map(({ yaSeEnvio: _ya, ...f }) => f).sort((a, b) =>
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

type Reserva = { reenviar?: boolean; tope?: number };

// Reserva el envio (fila con fallo "") dentro de una transaccion que serializa con un candado de fila: asi el segundo
// clic o el automatico encuentran la fila en curso y el tope diario no se pasa.
async function reservar(d: { prospectoId: number; tipo: "inicial" | "seguimiento"; asunto: string; para: string }, o: Reserva, hoy: string): Promise<{ token: string } | { error: string }> {
  await prisma.configuracion.upsert({ where: { clave: "candado_correos" }, update: {}, create: { clave: "candado_correos", valor: "" } });
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT clave FROM Configuracion WHERE clave = 'candado_correos' FOR UPDATE`;
    const propios = await tx.envioCorreo.findMany({ where: { prospectoId: d.prospectoId, fallo: "" }, select: { tipo: true } });
    if (d.tipo === "inicial" && !o.reenviar && propios.some((e) => e.tipo === "inicial")) return { error: "A este negocio ya se le envió la propuesta." };
    if (d.tipo === "seguimiento" && propios.some((e) => e.tipo === "seguimiento")) return { error: "A este negocio ya se le envió el seguimiento." };
    if (await tx.envioCorreo.count({ where: { para: d.para, fallo: "", prospectoId: { not: d.prospectoId } } })) return { error: "Ese correo ya recibió una propuesta de otro negocio." };
    if (o.tope !== undefined) {
      const desde = new Date(`${hoy}T04:00:00.000Z`);
      const n = await tx.envioCorreo.count({ where: { fallo: "", enviadoEn: { gte: desde, lt: new Date(desde.getTime() + 86_400_000) } } });
      if (n >= o.tope) return { error: `Hoy ya salieron ${n} de ${o.tope}. Suba el tope en Ajustes o espere a mañana.` };
    }
    const token = generarCodigo();
    await tx.envioCorreo.create({ data: { prospectoId: d.prospectoId, tipo: d.tipo, asunto: d.asunto.slice(0, 200), para: d.para.slice(0, 120), token } });
    return { token };
  });
}

const marcarFallo = (token: string, motivo: string) => prisma.envioCorreo.update({ where: { token }, data: { fallo: (motivo || "error").slice(0, 300) } });

export async function prepararEnvio(prospectoId: number, tipo: "inicial" | "seguimiento", opc: Reserva = {}): Promise<Preparado | { error: string }> {
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
  const fuenteEmail = String((p.fuentesPorCampo as Record<string, unknown> | null)?.email ?? "");
  const hostWeb = p.web ? hostDe(p.web) : "";
  // «su pagina» solo con web y una fuente del correo que apunte a ese mismo host; si no, directorio.
  const deSuWeb = !!hostWeb && !!fuenteEmail && hostDe(fuenteEmail) === hostWeb;
  const datos: DatosCorreo = {
    nombre: p.nombre, ciudad: p.ciudad, arquetipo, codigo: p.codigo, token: "", gancho,
    hojas: (plantilla.match(/<section class="hoja/g) ?? []).length, hoy, dondeCorreo: deSuWeb ? `su página ${hostWeb}` : "un directorio público", tipo,
    ...(tipo === "seguimiento" && p.envios[0] ? { enviadoAnteriorEn: hoyCaracas(p.envios[0].enviadoEn) } : {}),
  };
  // El asunto no depende del token: se arma con uno provisional para reservar la fila ANTES de generar el PDF.
  const reserva = await reservar({ prospectoId: p.id, tipo, asunto: armarCorreoPropuesta({ ...datos, token: "x".repeat(22) }).asunto, para }, opc, hoy);
  if ("error" in reserva) return reserva;
  const { token } = reserva;
  try {
    // Mismo camino que /p/<codigo>/pdf (mismo html, mismo hash): comparten cache.
    const html = renderPropuesta(plantilla, p.nombre, "#", { ciudad: p.ciudad, rubro: p.nicho.nombre.toLowerCase(), conWeb: webUsable(!!p.web, ficha?.hallazgos.web?.estado), fecha: await fechaDePropuesta(p.id), pais, gancho, paraPdf: true, plantilla: arquetipo });
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

export async function enviarA(prospectoId: number, tipo: "inicial" | "seguimiento", usuarioId: number | null, opciones: { reenviar?: boolean; tope?: number } = {}): Promise<Resultado<{ token: string }>> {
  const hoy = hoyCaracas();
  const p = await prisma.prospecto.findFirst({ where: { AND: [{ id: prospectoId }, DEL_DIRECTORIO] }, select: { id: true, email: true, ciudad: true, etapa: true } });
  if (!p) return fallo("Ese prospecto no existe.");
  if (paisDeCiudad(p.ciudad) !== "VE") return fallo("Solo se envía a negocios de Venezuela.");
  const email = normalizarCorreo(p.email);
  if (!email) return fallo("Este negocio no tiene correo.");
  if (motivoDeCorreo(email, p.ciudad, paisDeCiudad)) return fallo("Ese correo no sirve para escribirle (inválido, genérico o del Estado).");
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
  } else if (!hayInicial) {
    // Primer envio: solo a quien sigue por contactar y no recibio nunca un envio (de cualquier canal).
    if (p.etapa !== "por_contactar") return fallo("Este negocio ya no está por contactar.");
    if (await prisma.evento.count({ where: { prospectoId, tipo: "enviado" } })) return fallo("A este negocio ya se le envió la propuesta por otro canal.");
  }
  const prep = await prepararEnvio(prospectoId, real, { reenviar: opciones.reenviar, tope: opciones.tope });
  if ("error" in prep) return fallo(prep.error);
  const r = await enviarCorreo({ para: email, asunto: prep.correo.asunto, html: prep.correo.html, texto: prep.correo.texto, ...(prep.pdf ? { adjunto: { nombre: prep.pdf.nombre, ruta: prep.pdf.ruta } } : {}) });
  if (!r.ok) {
    await marcarFallo(prep.token, r.error);
    return fallo("No se pudo enviar el correo. Quedó anotado el motivo; puede reintentar.");
  }
  const dias = (await prisma.nicho.findFirst({ where: { prospectos: { some: { id: prospectoId } } }, select: { diasSeguimiento: true } }))?.diasSeguimiento ?? 3;
  await prisma.$transaction([
    prisma.evento.create({ data: { prospectoId, usuarioId, tipo: real === "inicial" ? "enviado" : "seguimiento", de: p.etapa, a: "enviado", canal: "email", texto: prep.correo.asunto.slice(0, 200) } }),
    // No baja de etapa a quien ya respondio. Un correo enviado no asciende a lead (eso pasa al marcar «Respondio»).
    prisma.prospecto.updateMany({ where: { id: prospectoId, etapa: { in: ["por_contactar", "enviado"] } }, data: { etapa: "enviado", proximoSeguimiento: sumarDias(hoy, dias) } }),
  ]);
  return exito({ token: prep.token });
}
