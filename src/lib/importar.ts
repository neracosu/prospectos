import { prisma } from "@/lib/db";
import { normalizarCelular, normalizarRed } from "@/lib/celular-contrato";
import { claveProspecto } from "@/lib/clave-prospecto";
import { generarCodigo } from "@/lib/codigo";

export type ProspectoEntrada = {
  nombre: string; ciudad: string; estado?: string; region?: string; tipo?: string; tamano?: string;
  telefono?: string; whatsapp?: string; email?: string; web?: string; instagram?: string; facebook?: string; tiktok?: string;
  nota?: string; fuentes?: string[];
};

export type HotelJson = {
  nombre: string; ciudad: string; estado?: string; tipo?: string; habitaciones?: number | null; telefono?: string; whatsapp?: string;
  email?: string; web?: string; instagram?: string; direccion?: string; fuentes?: string[]; notas?: string;
};

// Mismas regiones que ~/propuestas/hoteles/prospectos/armar.py
const REGIONES: [string, Set<string> | null][] = [
  ["Caracas y alrededores", new Set(["Distrito Capital", "Miranda", "La Guaira"])],
  ["Carabobo y Aragua", new Set(["Carabobo", "Aragua"])],
  ["Occidente, oriente y los Andes", null],
];
export function regionDe(estado: string): string {
  for (const [nombre, estados] of REGIONES) if (estados === null || estados.has(estado)) return nombre;
  return REGIONES[REGIONES.length - 1][0];
}

export function prospectoDesdeHotelJson(h: HotelJson): ProspectoEntrada {
  const nota = [h.notas?.trim(), h.direccion ? `Dirección: ${h.direccion.trim()}` : ""].filter(Boolean).join("\n");
  return {
    nombre: h.nombre.trim(), ciudad: h.ciudad.trim(), estado: h.estado ?? "", region: regionDe(h.estado ?? ""),
    tipo: h.tipo ?? "", tamano: h.habitaciones ? `${h.habitaciones} hab.` : "",
    telefono: h.telefono ?? "", whatsapp: normalizarCelular(h.whatsapp ?? "") || normalizarCelular(h.telefono ?? ""),
    email: h.email ?? "", web: h.web ?? "", instagram: normalizarRed(h.instagram ?? "", "instagram"), facebook: "", tiktok: "",
    nota, fuentes: h.fuentes ?? [],
  };
}

export async function importarProspectos(
  nichoId: number, lista: ProspectoEntrada[], opts: { origen: string; usuarioId?: number },
): Promise<{ nuevos: number; repetidos: number }> {
  const existentes = new Set((await prisma.prospecto.findMany({ where: { nichoId }, select: { clave: true } })).map((p) => p.clave));
  const ultimo = await prisma.prospecto.aggregate({ _max: { ordenCola: true } });
  let orden = (ultimo._max.ordenCola ?? 0) + 1;
  let nuevos = 0, repetidos = 0;
  for (const e of lista) {
    const clave = claveProspecto(e.nombre, e.ciudad);
    if (existentes.has(clave)) { repetidos++; continue; }
    existentes.add(clave);
    await prisma.prospecto.create({
      data: {
        nichoId, clave, codigo: generarCodigo(), ordenCola: orden++,
        nombre: e.nombre.trim(), ciudad: e.ciudad.trim(), estado: e.estado ?? "", region: e.region ?? regionDe(e.estado ?? ""),
        tipo: e.tipo ?? "", tamano: e.tamano ?? "", telefono: e.telefono ?? "",
        whatsapp: e.whatsapp ?? normalizarCelular(e.telefono ?? ""), email: e.email ?? "", web: e.web ?? "",
        instagram: normalizarRed(e.instagram ?? "", "instagram"), facebook: normalizarRed(e.facebook ?? "", "facebook"),
        tiktok: normalizarRed(e.tiktok ?? "", "tiktok"), nota: e.nota ?? "", fuentes: e.fuentes ?? [], origen: opts.origen,
        eventos: { create: { tipo: "importado", usuarioId: opts.usuarioId ?? null, texto: opts.origen } },
      },
    });
    nuevos++;
  }
  return { nuevos, repetidos };
}
