// Ficha de negocio: investiga un prospecto (su web, el directorio abierto y lo que ya hay en la base),
// guarda la ficha y depura el universo de prospectos con correo. La red pasa solo por red-segura.
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { descargar } from "./red-segura";
import { paisDeCiudad } from "./overpass-contrato";
import type { crearCruzador } from "./overture-cruce";
import {
  type EstadoFicha, type Hallazgos, type HallazgosWeb, type FilaUniverso, GANCHO_MAX,
  esWebRedSocial, estadoDeDescarga, MOTIVOS_CAIDA, enlacesInternos, analizarWeb, hallazgosDeBase,
  armarGancho, armarResumen, estadoDeFicha, depurarUniverso,
} from "./ficha-contrato";

export type Deps = {
  descargar?: typeof descargar;
  cruzar?: Awaited<ReturnType<typeof crearCruzador>>;
  ahora?: Date;
  usuarioId?: number;
  pausaMs?: number; // espera entre paginas internas del mismo sitio (1 s por defecto)
  reintentoMs?: number; // espera antes de reintentar una portada que no respondio (3 s por defecto)
};

export type FichaFila = {
  prospectoId: number; hallazgos: Hallazgos; fuentes: string[]; resumen: string; gancho: string;
  estado: EstadoFicha; alAutomatico: boolean; generadaEn: Date; revisadaEn: Date | null;
};

const OPCIONES = { timeoutMs: 10_000, plazoTotalMs: 12_000, maxBytes: 2 * 1024 * 1024 };
const esperar = (ms: number) => (ms > 0 ? new Promise<void>((f) => setTimeout(f, ms)) : Promise.resolve());

async function leerWeb(url: string, nombre: string, bajar: typeof descargar, pausaMs: number, reintentoMs: number): Promise<HallazgosWeb> {
  let portada = await bajar(url, OPCIONES);
  // Un fallo que no prueba que la web este caida (plazo, corte, certificado) se reintenta una vez.
  if (!portada.ok && !MOTIVOS_CAIDA.has(portada.motivo)) {
    await esperar(reintentoMs);
    portada = await bajar(url, OPCIONES);
  }
  const estado = estadoDeDescarga(portada.ok ? portada : { ok: false, motivo: portada.motivo }, url);
  if (!portada.ok) return analizarWeb("", url, nombre, estado);
  if (estado !== "viva") return analizarWeb(portada.texto, portada.urlFinal, nombre, estado);
  let html = portada.texto;
  const leidas = [portada.urlFinal];
  for (const enlace of enlacesInternos(portada.texto, portada.urlFinal)) {
    await esperar(pausaMs);
    const r = await bajar(enlace, OPCIONES);
    if (!r.ok) continue;
    html += `\n${r.texto}`;
    leidas.push(r.urlFinal);
  }
  const w = analizarWeb(html, portada.urlFinal, nombre, estado);
  return { ...w, paginasLeidas: leidas };
}

export async function investigarProspecto(id: number, deps: Deps = {}): Promise<{ estado: EstadoFicha; gancho: string; fuentes: string[] }> {
  const bajar = deps.descargar ?? descargar;
  const p = await prisma.prospecto.findUniqueOrThrow({ where: { id }, include: { nicho: { select: { slug: true, plantillaPropuesta: true } }, ficha: true } });
  const arquetipo = p.nicho.plantillaPropuesta ?? "";
  const hallazgos: Hallazgos = { base: hallazgosDeBase({ ...p, web: p.web, nombre: p.nombre }) };
  const fuentes: string[] = [];

  const web = p.web.trim();
  if (web) {
    const url = /^https?:\/\//i.test(web) ? web : `https://${web}`;
    if (esWebRedSocial(url)) hallazgos.web = analizarWeb("", url, p.nombre, "red_social");
    else {
      hallazgos.web = await leerWeb(url, p.nombre, bajar, deps.pausaMs ?? 1000, deps.reintentoMs ?? 3000);
      fuentes.push(...(hallazgos.web.estado === "viva" ? hallazgos.web.paginasLeidas : [url]));
    }
  }
  const lugar = deps.cruzar ? deps.cruzar(p.nombre, p.ciudad, p.nicho.slug) : null;
  if (lugar) {
    hallazgos.overture = { id: lugar.id, direccion: lugar.direccion, categoriaBase: lugar.categoriaBase, categoriaFina: lugar.categoriaFina };
    fuentes.push(`overture:${lugar.id}`);
  }

  const gancho = armarGancho(hallazgos, arquetipo);
  const resumen = armarResumen(hallazgos, arquetipo, p.ciudad);
  const estado = estadoDeFicha(hallazgos, gancho);
  const revisada = p.ficha?.estado === "revisada";
  const ahora = deps.ahora ?? new Date();
  const datos = {
    hallazgos: hallazgos as unknown as Prisma.InputJsonValue,
    fuentes: fuentes as unknown as Prisma.InputJsonValue,
    generadaEn: ahora,
  };
  await prisma.fichaNegocio.upsert({
    where: { prospectoId: id },
    create: { prospectoId: id, ...datos, resumen, gancho, estado },
    update: revisada ? datos : { ...datos, resumen, gancho, estado },
  });
  await prisma.evento.create({
    data: { prospectoId: id, usuarioId: deps.usuarioId ?? null, tipo: "ficha_generada", texto: resumen.slice(0, 2000) },
  });
  const f = revisada ? p.ficha! : { gancho, estado };
  return { estado: f.estado as EstadoFicha, gancho: f.gancho, fuentes };
}

export async function leerFicha(prospectoId: number): Promise<FichaFila | null> {
  const f = await prisma.fichaNegocio.findUnique({ where: { prospectoId } });
  if (!f) return null;
  return {
    prospectoId, hallazgos: f.hallazgos as unknown as Hallazgos,
    fuentes: Array.isArray(f.fuentes) ? (f.fuentes as unknown[]).filter((x): x is string => typeof x === "string") : [],
    resumen: f.resumen, gancho: f.gancho, estado: f.estado as EstadoFicha, alAutomatico: f.alAutomatico,
    generadaEn: f.generadaEn, revisadaEn: f.revisadaEn,
  };
}

export async function guardarFicha(prospectoId: number, datos: { gancho: string; resumen: string }, usuarioId: number): Promise<void> {
  const gancho = datos.gancho.replace(/\s+/g, " ").trim().slice(0, GANCHO_MAX);
  const cambios = { gancho, resumen: datos.resumen.trim(), estado: "revisada", revisadaEn: new Date() };
  await prisma.$transaction([
    prisma.fichaNegocio.upsert({ where: { prospectoId }, create: { prospectoId, ...cambios }, update: cambios }),
    prisma.evento.create({ data: { prospectoId, usuarioId, tipo: "ficha_revisada", texto: gancho.slice(0, 2000) } }),
  ]);
}

export async function marcarAlAutomatico(prospectoId: number, si: boolean): Promise<void> {
  await prisma.fichaNegocio.upsert({ where: { prospectoId }, create: { prospectoId, alAutomatico: si }, update: { alAutomatico: si } });
}

export async function depurarYMarcar(aplicar: boolean): Promise<{ cola: number; duplicadas: number; excluidas: Record<string, number> }> {
  const prospectos = await prisma.prospecto.findMany({ where: { email: { not: "" } }, orderBy: { id: "asc" } });
  const filas: FilaUniverso[] = prospectos.map((p) => ({
    id: p.id, email: p.email, nombre: p.nombre, ciudad: p.ciudad, etapa: p.etapa, esLead: p.esLead, fuenteLead: p.fuenteLead,
    web: p.web, whatsapp: p.whatsapp, instagram: p.instagram, facebook: p.facebook, telefono: p.telefono, nota: p.nota,
  }));
  const r = depurarUniverso(filas, paisDeCiudad);
  const excluidas: Record<string, number> = {};
  for (const e of r.excluidas) excluidas[e.motivo] = (excluidas[e.motivo] ?? 0) + 1;
  if (aplicar) {
    const yaMarcadas = new Set((await prisma.fichaNegocio.findMany({ where: { alAutomatico: true }, select: { prospectoId: true } })).map((x) => x.prospectoId));
    const descartadas = new Set(prospectos.filter((x) => x.etapa === "descartado").map((x) => x.id));
    for (const d of r.duplicadas) {
      if (descartadas.has(d.id)) continue;
      await prisma.$transaction([
        prisma.prospecto.update({ where: { id: d.id }, data: { etapa: "descartado" } }),
        prisma.evento.create({ data: { prospectoId: d.id, tipo: "nota", texto: `mismo correo que #${d.principalId}` } }),
      ]);
    }
    for (const f of r.cola) if (!yaMarcadas.has(f.id)) await marcarAlAutomatico(f.id, true);
  }
  return { cola: r.cola.length, duplicadas: r.duplicadas.length, excluidas };
}
