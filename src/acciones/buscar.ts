"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { exigirSesion } from "@/lib/sesion";
import { descargar } from "@/lib/red-segura";
import { buscarEnOverpass } from "@/lib/overpass";
import { parsearTabla, validarFila, type EntradaValidada } from "@/lib/tabla-contrato";
import { extraerContactos } from "@/lib/contactos-web-contrato";
import { esUrlMaps, extraerFichaMaps } from "@/lib/maps-contrato";
import { CIUDADES } from "@/lib/overpass-contrato";
import { leerXlsx } from "@/lib/plantilla-importar";
import { crearLote, listaDeTextos, mapaDeTextos, type Origen } from "@/lib/revision";
import { normalizarCelular } from "@/lib/celular-contrato";
import { fallo, exito, type Resultado } from "@/acciones/resultado";

// exigirSesion() va FUERA del try/catch (redirige lanzando). Buscar e importar lo
// hacen dueno y prospectador, asi que no hay exigirRol.
// Cada funcion exportada de aqui es un endpoint publico: nada de auxiliares
// exportados (regla de "use server").
//
// Nada entra a Prospecto desde aqui: todo cae en la bandeja de revision (crearLote)
// y cada fila lleva su fuente, la URL donde el negocio publica el dato.

const ERROR = "No se pudo completar. Intenta de nuevo.";
const MAX_ARCHIVO = 5 * 1024 * 1024;
const MAX_TEXTO = 2_000_000;
const EXTENSIONES = [".xlsx", ".csv", ".txt"];
// Tope de sugerencias por campo: una pagina con veinte mailto no puede llenar la
// ficha de ruido.
const MAX_SUGERENCIAS = 5;

type Resumen = { lote: string; nuevos: number; repetidos: number; errores: number };

function refrescar() {
  revalidatePath("/buscar");
}

async function loteDesdeEntradas(
  origen: Origen,
  entradas: EntradaValidada[],
  erroresPorFila: string[][],
  usuarioId: number
): Promise<Resumen> {
  const r = await crearLote(
    origen,
    entradas.map((entrada, i) => ({ entrada, errores: erroresPorFila[i] ?? [] })),
    usuarioId
  );
  refrescar();
  return r;
}

export async function buscarOverpass(formData: FormData): Promise<Resultado<Resumen & { desdeCache: boolean }>> {
  const u = await exigirSesion();
  const e = z
    .object({ nichoId: z.coerce.number().int().positive(), ciudad: z.string().regex(/^[a-z0-9-]{2,40}$/) })
    .safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("Elige nicho y ciudad.");
  try {
    const r = await buscarEnOverpass(e.data.nichoId, e.data.ciudad);
    if (!r.ok) return fallo(r.motivo);
    if (!r.entradas.length) return fallo("Overpass no devolvió negocios de ese nicho en esa ciudad.");
    const lote = await loteDesdeEntradas("overpass", r.entradas, [], u.id);
    return exito({ ...lote, desdeCache: r.desdeCache });
  } catch (err) {
    console.error("buscarOverpass", err);
    return fallo(ERROR);
  }
}

// La direccion de una ficha de Maps viene como "Av. Tal, Urbanizacion, Ciudad":
// se busca de atras para adelante la primera parte que se parezca a una de las
// ciudades que el panel conoce. Si no se deduce, la fila queda con error de ciudad
// y se corrige en la bandeja: nunca se inventa.
function ciudadDesdeDireccion(direccion: string): { ciudad: string; estado: string } {
  const partes = direccion
    .split(",")
    .map((s) => s.trim())
    .reverse();
  for (const p of partes) {
    if (p.length <= 3) continue;
    const primera = p.toLowerCase().split(" ")[0];
    const c = CIUDADES.find((x) => x.nombre.toLowerCase().startsWith(primera));
    if (c) return { ciudad: c.nombre, estado: c.estado };
  }
  if (/caracas/i.test(direccion)) return { ciudad: "Caracas", estado: "Distrito Capital" };
  return { ciudad: "", estado: "" };
}

export async function cargarMaps(formData: FormData): Promise<Resultado<{ lote: string } | { manual: true; url: string }>> {
  const u = await exigirSesion();
  const e = z
    .object({ nichoId: z.coerce.number().int().positive(), url: z.string().trim().min(10).max(2000) })
    .safeParse(Object.fromEntries(formData));
  if (!e.success || !esUrlMaps(e.data.url)) {
    return fallo("Pega un enlace de Google Maps (google.com/maps, maps.app.goo.gl…).");
  }
  try {
    const nicho = await prisma.nicho.findUnique({ where: { id: e.data.nichoId }, select: { slug: true } });
    if (!nicho) return fallo("Nicho desconocido.");
    // Una sola ficha, una sola descarga: los enlaces cortos se resuelven siguiendo
    // la redireccion dentro de descargar(). Nada de barrer Google.
    const r = await descargar(e.data.url, { timeoutMs: 10_000, maxBytes: 2 * 1024 * 1024 });
    if (!r.ok) return fallo(`No se pudo leer el enlace (${r.motivo}).`);
    const ficha = extraerFichaMaps(r.texto);
    // Sin ficha legible (Google cambio el HTML, o es un enlace que no es de un
    // negocio): se ofrece cargarlo a mano con el enlace ya puesto como fuente.
    if (!ficha) return exito({ manual: true, url: r.urlFinal });
    const { ciudad, estado } = ciudadDesdeDireccion(ficha.direccion);
    const fuente = r.urlFinal;
    const entrada: EntradaValidada = {
      nicho: nicho.slug,
      nombre: ficha.nombre,
      ciudad,
      estado,
      tipo: "",
      tamano: "",
      telefono: ficha.telefono,
      whatsapp: normalizarCelular(ficha.telefono),
      email: "",
      web: ficha.web,
      instagram: "",
      facebook: "",
      tiktok: "",
      nota: ficha.direccion ? `Dirección: ${ficha.direccion}` : "",
      fuentes: [fuente],
      fuentesPorCampo: {},
    };
    for (const k of ["nombre", "ciudad", "telefono", "whatsapp", "web"] as const) {
      if (entrada[k]) entrada.fuentesPorCampo[k] = fuente;
    }
    const errores = ciudad ? [] : ["Falta la ciudad"];
    const lote = await loteDesdeEntradas("maps", [entrada], [errores], u.id);
    return exito({ lote: lote.lote });
  } catch (err) {
    console.error("cargarMaps", err);
    return fallo(ERROR);
  }
}

// Un solo camino para el texto pegado y para el archivo: misma gramatica, mismas
// validaciones (validarFila) y mismo destino (la bandeja).
async function importarDesdeTexto(
  texto: string,
  usuarioId: number
): Promise<Resultado<Resumen & { desconocidas: string[] }>> {
  const t = parsearTabla(texto);
  if (t.error) return fallo(t.error);
  const validadas = t.filas.map(validarFila);
  const lote = await loteDesdeEntradas(
    "importado",
    validadas.map((v) => v.entrada),
    validadas.map((v) => v.errores),
    usuarioId
  );
  return exito({ ...lote, desconocidas: t.desconocidas });
}

export async function importarTexto(formData: FormData): Promise<Resultado<Resumen & { desconocidas: string[] }>> {
  const u = await exigirSesion();
  const e = z.object({ texto: z.string().max(MAX_TEXTO) }).safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("Pega la tabla con sus encabezados (hasta 2 MB de texto).");
  try {
    return await importarDesdeTexto(e.data.texto, u.id);
  } catch (err) {
    console.error("importarTexto", err);
    return fallo(ERROR);
  }
}

export async function importarArchivo(formData: FormData): Promise<Resultado<Resumen & { desconocidas: string[] }>> {
  const u = await exigirSesion();
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return fallo("Sube un archivo .xlsx, .csv o .txt.");
  const n = z.string().min(1).max(300).safeParse(archivo.name);
  if (!n.success || !EXTENSIONES.some((x) => n.data.toLowerCase().endsWith(x))) {
    return fallo("Solo se aceptan archivos .xlsx, .csv o .txt.");
  }
  if (archivo.size > MAX_ARCHIVO) return fallo("El archivo pesa más de 5 MB: pártelo.");
  try {
    const buf = Buffer.from(await archivo.arrayBuffer());
    // Un .xlsx es un zip (empieza con PK): se reconoce por el contenido y no solo
    // por el nombre, que a veces llega cambiado.
    const esXlsx = n.data.toLowerCase().endsWith(".xlsx") || buf.subarray(0, 2).toString("binary") === "PK";
    const texto = esXlsx ? await leerXlsx(buf) : buf.toString("utf8").replace(/^﻿/, "");
    return await importarDesdeTexto(texto, u.id);
  } catch (err) {
    console.error("importarArchivo", err);
    return fallo("No se pudo leer el archivo. ¿Es un .xlsx o .csv válido?");
  }
}

const CAMPOS_WEB = ["email", "whatsapp", "instagram", "facebook", "tiktok"] as const;
type CampoWeb = (typeof CAMPOS_WEB)[number];

export async function leerWebDeProspecto(
  prospectoId: number
): Promise<Resultado<{ sugerencias: { campo: CampoWeb; valor: string; fuente: string }[] }>> {
  const u = await exigirSesion();
  const e = z.number().int().positive().safeParse(prospectoId);
  if (!e.success) return fallo(ERROR);
  try {
    const p = await prisma.prospecto.findUnique({
      where: { id: e.data },
      select: { web: true, email: true, whatsapp: true, instagram: true, facebook: true, tiktok: true },
    });
    if (!p) return fallo("Ese prospecto no existe.");
    if (!p.web) return fallo("Este prospecto no tiene web cargada.");
    const url = /^https?:\/\//i.test(p.web) ? p.web : `https://${p.web}`;
    const r = await descargar(url, { timeoutMs: 10_000, maxBytes: 2 * 1024 * 1024 });
    if (!r.ok) return fallo(`No se pudo leer la web (${r.motivo}).`);
    const c = extraerContactos(r.texto, r.urlFinal);
    const sugerencias: { campo: CampoWeb; valor: string; fuente: string }[] = [];
    // Solo lo que el negocio publica en su propia web, y solo para los campos que
    // estan vacios: una sugerencia nunca compite con un dato ya cargado.
    const agregar = (campo: CampoWeb, valores: string[]) => {
      if (p[campo]) return;
      for (const v of valores.slice(0, MAX_SUGERENCIAS)) sugerencias.push({ campo, valor: v, fuente: r.urlFinal });
    };
    agregar("email", c.emails);
    agregar("whatsapp", c.celulares);
    agregar("instagram", c.instagram);
    agregar("facebook", c.facebook);
    agregar("tiktok", c.tiktok);
    await prisma.evento.create({
      data: { prospectoId: e.data, usuarioId: u.id, tipo: "nota", texto: `Leí la web: ${sugerencias.length} sugerencia(s)` },
    });
    return exito({ sugerencias });
  } catch (err) {
    console.error("leerWebDeProspecto", err);
    return fallo(ERROR);
  }
}

export async function aplicarSugerencia(
  prospectoId: number,
  campo: string,
  valor: string,
  fuente: string
): Promise<Resultado> {
  const u = await exigirSesion();
  const e = z
    .object({
      id: z.number().int().positive(),
      campo: z.enum(CAMPOS_WEB),
      valor: z.string().trim().min(3).max(191),
      fuente: z.string().trim().min(10).max(2000).refine((s) => /^https?:\/\//i.test(s), "La fuente tiene que ser una URL"),
    })
    .safeParse({ id: prospectoId, campo, valor, fuente });
  if (!e.success) return fallo("Sugerencia inválida.");
  const d = e.data;
  const v = d.campo === "whatsapp" ? normalizarCelular(d.valor) : d.valor;
  if (!v) return fallo("Ese celular no tiene formato venezolano.");
  try {
    const p = await prisma.prospecto.findUnique({
      where: { id: d.id },
      select: { fuentes: true, fuentesPorCampo: true },
    });
    if (!p) return fallo("Ese prospecto no existe.");
    const fuentes = [...new Set([...listaDeTextos(p.fuentes), d.fuente])];
    const fuentesPorCampo = { ...mapaDeTextos(p.fuentesPorCampo), [d.campo]: d.fuente };
    const where: Prisma.ProspectoWhereInput = { id: d.id, [d.campo]: "" };
    const data: Prisma.ProspectoUpdateManyMutationInput = {
      [d.campo]: v,
      fuentes: fuentes as unknown as Prisma.InputJsonValue,
      fuentesPorCampo: fuentesPorCampo as unknown as Prisma.InputJsonValue,
    };
    // El updateMany condicionado a que el campo siga vacio es lo que evita pisar un
    // dato que alguien cargo entre la lectura y el toque. La fuente se escribe en la
    // MISMA transaccion que el Evento: un dato sin fuente no existe.
    const escritas = await prisma.$transaction(async (tx) => {
      const t = await tx.prospecto.updateMany({ where, data });
      if (t.count === 1) {
        await tx.evento.create({
          data: { prospectoId: d.id, usuarioId: u.id, tipo: "nota", texto: `${d.campo} desde la web: ${v}` },
        });
      }
      return t.count;
    });
    if (escritas === 0) return fallo("Ese campo ya tiene un dato: no se pisa.");
    revalidatePath("/prospectos");
    revalidatePath(`/prospectos/${d.id}`);
    return exito();
  } catch (err) {
    console.error("aplicarSugerencia", err);
    return fallo(ERROR);
  }
}
