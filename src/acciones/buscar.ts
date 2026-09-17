"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { exigirSesion } from "@/lib/sesion";
import { descargar } from "@/lib/red-segura";
import { buscarEnOverpass } from "@/lib/overpass";
import { parsearTabla, validarFila, validarTopes, TOPES, type EntradaValidada } from "@/lib/tabla-contrato";
import { extraerContactos } from "@/lib/contactos-web-contrato";
import { esUrlMaps, extraerFichaMaps } from "@/lib/maps-contrato";
import { ciudadPorNombre } from "@/lib/overpass-contrato";
import { leerXlsx, decodificarTexto } from "@/lib/plantilla-importar";
import { crearLote, listaDeTextos, mapaDeTextos, type Origen } from "@/lib/revision";
import { normalizarCelular, normalizarRed } from "@/lib/celular-contrato";
import { fallo, exito, type Resultado } from "@/acciones/resultado";

// exigirSesion() va FUERA del try/catch (redirige lanzando). Buscar e importar lo
// hacen dueno y prospectador, asi que no hay exigirRol.
// Cada funcion exportada de aqui es un endpoint publico: nada de auxiliares
// exportados (regla de "use server").
//
// Nada entra a Prospecto desde aqui: todo cae en la bandeja de revision (crearLote)
// y cada fila lleva su fuente, la URL donde el negocio publica el dato. Las cuatro
// fuentes pasan por las MISMAS validaciones de largo (validarTopes): una fila que
// no se puede guardar tiene que verse como error en la bandeja, no reventar al
// aprobarla.

const ERROR = "No se pudo completar. Intenta de nuevo.";
const MAX_ARCHIVO = 5 * 1024 * 1024;
const MAX_TEXTO = 2_000_000;
const EXTENSIONES = [".xlsx", ".csv", ".txt"];
// Tope de sugerencias por campo: una pagina con veinte mailto no puede llenar la
// ficha de ruido.
const MAX_SUGERENCIAS = 5;
// Tipo propio del Evento que deja leerWebDeProspecto. Sirve para el freno (no
// releer la misma web cada segundo) y para saber a que URL final se llego. Es un
// tipo y no un texto a proposito: el `texto` de una nota lo escribe el usuario
// desde la ficha (guardarNota), asi que cualquier candado que dependiera de como
// empieza ese texto se abre escribiendolo a mano. `tipo` no se puede escribir
// desde ningun formulario.
const TIPO_LECTURA = "lectura_web";
const FRENO_LECTURA_MS = 60_000;
// Fuente que se le pone a lo importado cuando la fila no trae ninguna: no es una
// URL, es la verdad (entro a mano desde un archivo) y se ve asi en la ficha.
const FUENTE_IMPORTADO = "importado";
const CORREO = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const MAX_EMAIL = 120; // el mismo tope que el alta manual (src/acciones/prospectos.ts)

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

export async function buscarOverpass(
  formData: FormData
): Promise<Resultado<Resumen & { desdeCache: boolean; antiguedadDias: number; consultadoEn: Date }>> {
  const u = await exigirSesion();
  const e = z
    .object({ nichoId: z.coerce.number().int().positive(), ciudad: z.string().regex(/^[a-z0-9-]{2,40}$/) })
    .safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("Elige nicho y ciudad.");
  try {
    const r = await buscarEnOverpass(e.data.nichoId, e.data.ciudad);
    if (!r.ok) return fallo(r.motivo);
    if (!r.entradas.length) return fallo("Overpass no devolvió negocios de ese nicho en esa ciudad.");
    // Un nombre de 246 caracteres existe en OpenStreetMap: la fila entra a la
    // bandeja marcada como error, con el mismo texto que una fila importada.
    const lote = await loteDesdeEntradas("overpass", r.entradas, r.entradas.map(validarTopes), u.id);
    return exito({ ...lote, desdeCache: r.desdeCache, antiguedadDias: r.antiguedadDias, consultadoEn: r.consultadoEn });
  } catch (err) {
    console.error("buscarOverpass", err);
    return fallo(ERROR);
  }
}

// La direccion de una ficha de Maps viene como "Av. Tal, Urbanizacion, Ciudad": se
// busca de atras para adelante el primer trozo que sea EXACTAMENTE una de las
// ciudades que el panel conoce (o uno de sus alias). Si ninguno coincide, la fila
// entra con "Falta la ciudad" y se corrige en la bandeja: nunca se inventa. La
// comparacion por parecido (startsWith) mandaba "La Urbina" a "La Guaira".
function ciudadDesdeDireccion(direccion: string): { ciudad: string; estado: string } {
  const partes = direccion
    .split(",")
    .map((s) => s.trim())
    .reverse();
  for (const p of partes) {
    const c = ciudadPorNombre(p);
    if (c) return { ciudad: c.nombre, estado: c.estado };
  }
  return { ciudad: "", estado: "" };
}

export async function cargarMaps(formData: FormData): Promise<Resultado<{ lote: string } | { manual: true; url: string }>> {
  const u = await exigirSesion();
  const e = z
    .object({ nichoId: z.coerce.number().int().positive(), url: z.string().trim().min(10).max(TOPES.fuente) })
    .safeParse(Object.fromEntries(formData));
  if (!e.success || !esUrlMaps(e.data.url)) {
    return fallo("Pega un enlace de Google Maps (google.com/maps, maps.app.goo.gl…).");
  }
  try {
    const nicho = await prisma.nicho.findUnique({ where: { id: e.data.nichoId }, select: { slug: true } });
    if (!nicho) return fallo("Nicho desconocido.");
    // Una sola ficha, una sola descarga: los enlaces cortos se resuelven siguiendo
    // la redireccion dentro de descargar(). Nada de barrer Google.
    const r = await descargar(e.data.url, { timeoutMs: 10_000, plazoTotalMs: 10_000, maxBytes: 2 * 1024 * 1024 });
    if (!r.ok) return fallo(`No se pudo leer el enlace (${r.motivo}).`);
    // Un acortador puede llevar a cualquier lado: lo que se lee tiene que seguir
    // siendo Google Maps, o el HTML de un tercero se trata como si fuera una ficha.
    if (!esUrlMaps(r.urlFinal)) return fallo("Ese enlace no lleva a Google Maps.");
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
    const errores = [...(ciudad ? [] : ["Falta la ciudad"]), ...validarTopes(entrada)];
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
  for (const v of validadas) {
    // Ninguna fila entra sin fuente: si el archivo no la trae, la fuente es que
    // alguien la importo. Asi la ficha nunca muestra un dato sin decir de donde
    // salio. fuentesPorCampo no se toca: no se sabe de donde sale cada campo.
    if (!v.entrada.fuentes?.length) v.entrada.fuentes = [FUENTE_IMPORTADO];
  }
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
    const texto = esXlsx ? await leerXlsx(buf) : decodificarTexto(buf);
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
    // Freno: la web de un negocio no cambia en un minuto, y cada lectura es una
    // visita a un servidor ajeno. Dos toques seguidos al boton no son dos visitas.
    const reciente = await prisma.evento.findFirst({
      where: {
        prospectoId: e.data,
        tipo: TIPO_LECTURA,
        creadoEn: { gt: new Date(Date.now() - FRENO_LECTURA_MS) },
      },
      select: { id: true },
    });
    if (reciente) return fallo("Ya leíste esa web hace menos de un minuto.");
    const url = /^https?:\/\//i.test(p.web) ? p.web : `https://${p.web}`;
    const r = await descargar(url, { timeoutMs: 10_000, plazoTotalMs: 10_000, maxBytes: 2 * 1024 * 1024 });
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
    // La URL final queda escrita en el Evento: es la que aplicarSugerencia acepta
    // como fuente ademas de la web cargada (la web puede redirigir a otro dominio).
    await prisma.evento.create({
      data: {
        prospectoId: e.data,
        usuarioId: u.id,
        tipo: TIPO_LECTURA,
        texto: `${r.urlFinal} · ${sugerencias.length} sugerencia(s)`,
      },
    });
    return exito({ sugerencias });
  } catch (err) {
    console.error("leerWebDeProspecto", err);
    return fallo(ERROR);
  }
}

// Host sin "www.", solo para http(s). Vacio si no es una URL usable.
function hostDe(url: string): string {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

// Cada campo se guarda como lo guardaria el alta manual: el correo con formato de
// correo, el celular normalizado a 58XXXXXXXXXX y las redes como URL canonica. Un
// valor que no se entiende no se guarda "por si acaso": se rechaza.
function valorParaCampo(campo: CampoWeb, valor: string): string {
  if (campo === "whatsapp") return normalizarCelular(valor);
  if (campo === "email") return CORREO.test(valor) && valor.length <= MAX_EMAIL ? valor.toLowerCase() : "";
  const url = normalizarRed(valor, campo);
  if (!url) return "";
  try {
    const u = new URL(url);
    const usuario = decodeURIComponent(u.pathname).replace(/^\/+|\/+$/g, "").replace(/^@/, "");
    // Un usuario de red es una sola pieza sin espacios: "no es una red" entraria
    // como https://www.instagram.com/no%20es%20una%20red/ si no se mira.
    return /^[A-Za-z0-9_.]{1,60}$/.test(usuario) ? url : "";
  } catch {
    return "";
  }
}

const MAL_CAMPO: Record<CampoWeb, string> = {
  email: "Ese correo no tiene formato de correo.",
  whatsapp: "Ese celular no tiene formato venezolano.",
  instagram: "Ese usuario de Instagram no se entiende.",
  facebook: "Ese usuario de Facebook no se entiende.",
  tiktok: "Ese usuario de TikTok no se entiende.",
};
const FUENTE_AJENA = "La fuente tiene que ser la web del prospecto.";

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
      valor: z.string().trim().min(3).max(TOPES.texto),
      fuente: z.string().trim().min(10).max(TOPES.fuente),
    })
    .safeParse({ id: prospectoId, campo, valor, fuente });
  if (!e.success) return fallo("Sugerencia inválida.");
  const d = e.data;
  const v = valorParaCampo(d.campo, d.valor);
  if (!v) return fallo(MAL_CAMPO[d.campo]);
  const hostFuente = hostDe(d.fuente);
  if (!hostFuente || !/^https?:\/\//i.test(d.fuente)) return fallo(FUENTE_AJENA);
  try {
    // Leer y escribir van en el mismo tramo bloqueado (candado por fila, igual que
    // completarExistente): sin el, dos sugerencias a la vez leen las mismas fuentes
    // y la segunda escritura borra la fuente que puso la primera.
    const hecho = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM Prospecto WHERE id = ${d.id} FOR UPDATE`;
      const p = await tx.prospecto.findUnique({
        where: { id: d.id },
        select: { web: true, fuentes: true, fuentesPorCampo: true },
      });
      if (!p) throw new Error("SIN_PROSPECTO");
      // La fuente tiene que ser la web del negocio: la que esta cargada o la URL
      // final a la que llego la lectura (una web puede redirigir a otro dominio).
      const hosts = new Set<string>();
      if (p.web) hosts.add(hostDe(p.web));
      const lectura = await tx.evento.findFirst({
        where: { prospectoId: d.id, tipo: TIPO_LECTURA },
        orderBy: { id: "desc" },
        select: { texto: true },
      });
      const m = lectura?.texto.match(/^(https?:\/\/\S+)/);
      if (m) hosts.add(hostDe(m[1]));
      hosts.delete("");
      if (!hosts.has(hostFuente)) throw new Error("FUENTE_AJENA");
      const fuentes = [...new Set([...listaDeTextos(p.fuentes), d.fuente])];
      const fuentesPorCampo = { ...mapaDeTextos(p.fuentesPorCampo), [d.campo]: d.fuente };
      const where: Prisma.ProspectoWhereInput = { id: d.id, [d.campo]: "" };
      const data: Prisma.ProspectoUpdateManyMutationInput = {
        [d.campo]: v,
        fuentes: fuentes as unknown as Prisma.InputJsonValue,
        fuentesPorCampo: fuentesPorCampo as unknown as Prisma.InputJsonValue,
      };
      // El updateMany condicionado a que el campo siga vacio es lo que evita pisar
      // un dato que ya estaba. La fuente se escribe en la MISMA transaccion que el
      // Evento: un dato sin fuente no existe.
      const t = await tx.prospecto.updateMany({ where, data });
      if (t.count === 1) {
        await tx.evento.create({
          data: { prospectoId: d.id, usuarioId: u.id, tipo: "nota", texto: `${d.campo} desde la web: ${v}` },
        });
      }
      return t.count;
    });
    if (hecho === 0) return fallo("Ese campo ya tiene un dato: no se pisa.");
    revalidatePath("/prospectos");
    revalidatePath(`/prospectos/${d.id}`);
    return exito();
  } catch (err) {
    if (err instanceof Error && err.message === "SIN_PROSPECTO") return fallo("Ese prospecto no existe.");
    if (err instanceof Error && err.message === "FUENTE_AJENA") return fallo(FUENTE_AJENA);
    console.error("aplicarSugerencia", err);
    return fallo(ERROR);
  }
}
