"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { exigirSesion } from "@/lib/sesion";
import { generarCodigo } from "@/lib/codigo";
import { claveProspecto } from "@/lib/clave-prospecto";
import { regionDe } from "@/lib/importar";
import { validarFila, COLUMNAS, type Columna } from "@/lib/tabla-contrato";
import { clasificar, leerDatos, listaDeTextos, mapaDeTextos, TOPE_APROBACION } from "@/lib/revision";
import { fallo, exito, type Resultado } from "@/acciones/resultado";

// exigirSesion() va FUERA del try/catch (redirige lanzando). Dueno y prospectador
// deciden en la bandeja. Nada se borra: descartar es una decision.
// Cada funcion exportada de aqui es un endpoint publico: nada de auxiliares exportados.

const ERROR = "No se pudo guardar. Intenta de nuevo.";
const DATOS_MALOS = "Esa fila tiene datos inválidos: descártala.";
const YA_DECIDIDA = "Esa fila ya se decidió.";
const Id = z.number().int().positive();
const Lote = z.string().min(8).max(64);
// Campos que se pueden rellenar en un existente. nombre y ciudad nunca: son la clave.
const CAMPOS_CONTACTO = ["telefono", "whatsapp", "email", "web", "instagram", "facebook", "tiktok", "estado", "tipo", "tamano", "nota"] as const;

function refrescar() {
  revalidatePath("/buscar");
  revalidatePath("/hoy");
  revalidatePath("/prospectos");
}

export async function aprobarFila(id: number): Promise<Resultado> {
  const u = await exigirSesion();
  const e = Id.safeParse(id);
  if (!e.success) return fallo(ERROR);
  // Se guardan fuera del try para que el camino P2002 no tenga que releerlos.
  let contexto: { nichoId: number; clave: string } | null = null;
  try {
    const r = await prisma.revision.findUnique({ where: { id: e.data } });
    if (!r) return fallo("Esa fila ya no existe.");
    if (r.estado !== "nuevo") return fallo("Solo se aprueban filas nuevas; las repetidas se completan o se descartan.");
    const d = leerDatos(r.datos);
    if (!d) return fallo(DATOS_MALOS);
    const nicho = await prisma.nicho.findUnique({ where: { slug: d.nicho }, select: { id: true } });
    if (!nicho) return fallo("Nicho desconocido.");
    contexto = { nichoId: nicho.id, clave: claveProspecto(d.nombre, d.ciudad) };
    const max = await prisma.prospecto.aggregate({ _max: { ordenCola: true } });
    await prisma.$transaction(async (tx) => {
      // El updateMany condicionado va PRIMERO: dos toques crean un solo prospecto.
      const tomada = await tx.revision.updateMany({
        where: { id: r.id, decision: "pendiente" },
        data: { decision: "aprobado", decididoPor: u.id, decididoEn: new Date() },
      });
      if (tomada.count === 0) throw new Error("YA_DECIDIDA");
      await tx.prospecto.create({
        data: {
          nichoId: nicho.id, nombre: d.nombre, ciudad: d.ciudad, estado: d.estado ?? "", region: regionDe(d.estado ?? ""),
          tipo: d.tipo ?? "", tamano: d.tamano ?? "", telefono: d.telefono ?? "", whatsapp: d.whatsapp ?? "",
          email: d.email ?? "", web: d.web ?? "", instagram: d.instagram ?? "", facebook: d.facebook ?? "",
          tiktok: d.tiktok ?? "", nota: d.nota ?? "", fuentes: listaDeTextos(d.fuentes),
          fuentesPorCampo: mapaDeTextos(d.fuentesPorCampo) as Prisma.InputJsonValue,
          origen: r.origen, codigo: generarCodigo(), clave: contexto!.clave, ordenCola: (max._max.ordenCola ?? 0) + 1,
          eventos: { create: { tipo: "importado", usuarioId: u.id, texto: `${r.origen} · lote ${r.lote}` } },
        },
        select: { id: true },
      });
    });
    refrescar();
    return exito();
  } catch (err) {
    if (err instanceof Error && err.message === "YA_DECIDIDA") return fallo(YA_DECIDIDA);
    if (typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002") {
      // Alguien lo creo entre la clasificacion y la aprobacion. La transaccion ya
      // deshizo la decision: la fila vuelve a la bandeja como repetido, con su
      // existente, para que se complete o se descarte.
      const existente = contexto
        ? await prisma.prospecto.findUnique({
            where: { nichoId_clave: { nichoId: contexto.nichoId, clave: contexto.clave } }, select: { id: true },
          }).catch(() => null)
        : null;
      // Sin existente el P2002 no es el de la clave (el `codigo`, por ejemplo):
      // no se inventa una explicacion.
      if (!existente) { console.error("aprobarFila", err); return fallo(ERROR); }
      try {
        await prisma.revision.update({
          where: { id: e.data },
          data: { estado: "repetido", existenteId: existente.id, decision: "pendiente", decididoPor: null, decididoEn: null },
        });
      } catch (err2) {
        // Si no se pudo marcar, no se anuncia un cambio que no ocurrio.
        console.error("aprobarFila/marcar-repetido", err2);
        return fallo(ERROR);
      }
      refrescar();
      return fallo("Ese prospecto ya existe: la fila pasó a «repetido».");
    }
    console.error("aprobarFila", err);
    return fallo(ERROR);
  }
}

export async function completarExistente(id: number): Promise<Resultado> {
  const u = await exigirSesion();
  const e = Id.safeParse(id);
  if (!e.success) return fallo(ERROR);
  try {
    const r = await prisma.revision.findUnique({ where: { id: e.data } });
    if (!r) return fallo("Esa fila ya no existe.");
    if (r.estado !== "repetido" || !r.existenteId) return fallo("Esa fila no tiene un existente que completar.");
    const d = leerDatos(r.datos);
    if (!d) return fallo(DATOS_MALOS);
    const existenteId = r.existenteId;
    await prisma.$transaction(async (tx) => {
      const tomada = await tx.revision.updateMany({
        where: { id: r.id, decision: "pendiente" },
        data: { decision: "completado", decididoPor: u.id, decididoEn: new Date() },
      });
      if (tomada.count === 0) throw new Error("YA_DECIDIDA");
      // Candado por fila: LEER el existente y ESCRIBIRLO van en el mismo tramo
      // bloqueado. Sin el candado, dos filas de lotes distintos que completan el
      // mismo prospecto leen las dos el mismo estado y la segunda escritura pisa
      // las fuentes de la primera (con "solo huecos" no basta: el hueco sigue
      // viendose vacio hasta que la otra transaccion cierra).
      await tx.$executeRaw`SELECT id FROM Prospecto WHERE id = ${existenteId} FOR UPDATE`;
      const ex = await tx.prospecto.findUnique({ where: { id: existenteId } });
      if (!ex) throw new Error("SIN_EXISTENTE");
      // Solo huecos: nunca se pisa un dato que ya esta.
      const data: Partial<Record<(typeof CAMPOS_CONTACTO)[number], string>> = {};
      const fpc = mapaDeTextos(ex.fuentesPorCampo);
      const llenados: string[] = [];
      for (const c of CAMPOS_CONTACTO) {
        const nuevo = (d[c] ?? "").toString().trim();
        const viejo = (ex[c] ?? "").toString().trim();
        if (nuevo && !viejo) {
          data[c] = nuevo;
          const fuente = mapaDeTextos(d.fuentesPorCampo)[c];
          if (fuente) fpc[c] = fuente;
          llenados.push(c);
        }
      }
      const fuentes = [...new Set([...listaDeTextos(ex.fuentes), ...listaDeTextos(d.fuentes)])];
      await tx.prospecto.update({
        where: { id: ex.id },
        data: { ...data, fuentes, fuentesPorCampo: fpc as Prisma.InputJsonValue },
      });
      await tx.evento.create({
        data: {
          prospectoId: ex.id, usuarioId: u.id, tipo: "nota",
          texto: `Completado desde ${r.origen}: ${llenados.join(", ") || "sin campos nuevos"}`,
        },
      });
    });
    refrescar();
    return exito();
  } catch (err) {
    if (err instanceof Error && err.message === "YA_DECIDIDA") return fallo(YA_DECIDIDA);
    if (err instanceof Error && err.message === "SIN_EXISTENTE") return fallo("El prospecto existente ya no está.");
    console.error("completarExistente", err);
    return fallo(ERROR);
  }
}

export async function descartarFila(id: number): Promise<Resultado> {
  const u = await exigirSesion();
  const e = Id.safeParse(id);
  if (!e.success) return fallo(ERROR);
  try {
    // Descartar es una decision, no un delete: la fila queda con su historia.
    const r = await prisma.revision.updateMany({
      where: { id: e.data, decision: "pendiente" },
      data: { decision: "descartado", decididoPor: u.id, decididoEn: new Date() },
    });
    if (r.count === 0) {
      const existe = await prisma.revision.findUnique({ where: { id: e.data }, select: { id: true } });
      return fallo(existe ? YA_DECIDIDA : "Esa fila ya no existe.");
    }
    refrescar();
    return exito();
  } catch (err) {
    console.error("descartarFila", err);
    return fallo(ERROR);
  }
}

export async function corregirFila(id: number, formData: FormData): Promise<Resultado> {
  await exigirSesion();
  const e = Id.safeParse(id);
  if (!e.success) return fallo(ERROR);
  try {
    const r = await prisma.revision.findUnique({ where: { id: e.data } });
    if (!r) return fallo("Esa fila ya no existe.");
    if (r.decision !== "pendiente") return fallo(YA_DECIDIDA);
    const d = leerDatos(r.datos);
    if (!d) return fallo(DATOS_MALOS);
    const anteriores = d as unknown as Record<string, unknown>;
    // Lo que no venga en el formulario se queda como estaba. `fuente` es la
    // primera de `fuentes`: COLUMNAS la trae en singular.
    const fila = Object.fromEntries(COLUMNAS.map((c) => {
      const enviado = formData.get(c);
      const anterior = c === "fuente" ? listaDeTextos(d.fuentes)[0] ?? "" : anteriores[c];
      // Un File en un campo de texto no se convierte en "[object File]": cuenta
      // como vacio, y entonces validarFila dira que falta lo que sea obligatorio.
      if (enviado !== null) return [c, typeof enviado === "string" ? enviado : ""];
      return [c, typeof anterior === "string" ? anterior : ""];
    })) as Record<Columna, string>;
    const { entrada, errores } = validarFila(fila);
    const c = await clasificar(entrada, errores, new Set());
    await prisma.revision.update({
      where: { id: r.id },
      data: {
        datos: entrada as unknown as Prisma.InputJsonValue,
        estado: c.estado, errores: c.errores, existenteId: c.existenteId,
      },
    });
    refrescar();
    return exito();
  } catch (err) {
    console.error("corregirFila", err);
    return fallo(ERROR);
  }
}

export async function aprobarNuevos(
  lote: string,
): Promise<Resultado<{ aprobadas: number; fallidas: number; quedan: number; primerError?: string }>> {
  await exigirSesion();
  const e = Lote.safeParse(lote);
  if (!e.success) return fallo(ERROR);
  try {
    const filas = await prisma.revision.findMany({
      where: { lote: e.data, estado: "nuevo", decision: "pendiente" },
      orderBy: { fila: "asc" }, select: { id: true }, take: TOPE_APROBACION,
    });
    // Una por una y por la misma puerta: aprobarFila es la unica que crea
    // prospectos. Con tope, porque cada fila es una transaccion: un lote de 5000
    // se aprueba en varias pasadas y la UI sabe cuantas quedan.
    let aprobadas = 0; let fallidas = 0; let primerError: string | undefined;
    for (const f of filas) {
      const r = await aprobarFila(f.id);
      if (r.ok) aprobadas++;
      else { fallidas++; if (!primerError) primerError = r.mensaje; }
    }
    // Se recuenta: las que fallaron por P2002 ya no son "nuevo", las demas si.
    const quedan = await prisma.revision.count({ where: { lote: e.data, estado: "nuevo", decision: "pendiente" } });
    return exito({ aprobadas, fallidas, quedan, ...(primerError ? { primerError } : {}) });
  } catch (err) {
    console.error("aprobarNuevos", err);
    return fallo(ERROR);
  }
}
