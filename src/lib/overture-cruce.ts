// Cruce de un prospecto con la tabla LugarOverture (directorio abierto ya cargado): solo lectura.
// Llave exacta nombre|ciudad (con la regla del nicho si la hay) y, si no, llave laxa (sin la palabra
// generica del rubro) solo cuando en la ciudad hay UN solo lugar candidato. Sale de scripts/_cruzar.mts.
import { prisma } from "./db";
import { limpiar } from "./clave-prospecto";
import { ciudadDeLugar, reglaDeNicho, coincideNicho } from "./overture-contrato";

export type LugarCruzado = {
  id: string; direccion: string; categoriaBase: string; categoriaFina: string;
  telefonos: string; correos: string; webs: string; redes: string;
};

export const GENERICAS = ["hotel", "hotelboutique", "posada", "restaurante", "restaurant", "resto", "farmacia", "farmacias", "panaderia", "pasteleria", "clinica", "centromedico", "centroclinico", "consultorio", "odontologia", "licoreria", "bodegon", "veterinaria", "gimnasio", "gym", "cancha", "canchas", "complejodeportivo", "cafe", "bar", "pizzeria", "arepera", "tasca", "lunch", "lunchería", "optica", "spa", "barberia", "peluqueria"];
const GENERICAS_LIMPIAS = GENERICAS.map(limpiar).sort((a, b) => b.length - a.length);

// el nombre sin la palabra generica del rubro al principio, solo si lo que queda tiene 5+ caracteres
export function laxa(nombre: string): string {
  let n = limpiar(nombre);
  for (const g of GENERICAS_LIMPIAS) {
    if (n.startsWith(g) && n.length - g.length >= 5) { n = n.slice(g.length); break; }
  }
  return n;
}

type Fila = LugarCruzado & { nombre: string; lat: number; lon: number; confianza: number };

export async function crearCruzador(pais: "VE" | "CO" = "VE"): Promise<(nombre: string, ciudad: string, slug: string) => LugarCruzado | null> {
  const lugares = await prisma.lugarOverture.findMany({
    where: { pais },
    select: { id: true, nombre: true, lat: true, lon: true, direccion: true, categoriaBase: true, categoriaFina: true, telefonos: true, correos: true, webs: true, redes: true, confianza: true },
  });
  const porClave = new Map<string, Fila[]>();
  const porLaxa = new Map<string, Fila[]>();
  for (const l of lugares) {
    const c = ciudadDeLugar(l.lat, l.lon);
    if (!c) continue;
    const k = `${limpiar(l.nombre)}|${limpiar(c.nombre)}`;
    porClave.set(k, [...(porClave.get(k) ?? []), l]);
    const k2 = `${laxa(l.nombre)}|${limpiar(c.nombre)}`;
    porLaxa.set(k2, [...(porLaxa.get(k2) ?? []), l]);
  }
  const salida = (l: Fila): LugarCruzado => ({
    id: l.id, direccion: l.direccion, categoriaBase: l.categoriaBase, categoriaFina: l.categoriaFina,
    telefonos: l.telefonos, correos: l.correos, webs: l.webs, redes: l.redes,
  });
  return (nombre, ciudad, slug) => {
    const regla = reglaDeNicho(slug);
    const ok = (x: Fila) => !regla || coincideNicho(regla, x);
    const exactos = [...(porClave.get(`${limpiar(nombre)}|${limpiar(ciudad)}`) ?? [])].sort((a, b) => b.confianza - a.confianza);
    const exacto = exactos.find(ok);
    if (exacto) return salida(exacto);
    const llave = laxa(nombre);
    if (llave.length < 5) return null;
    const laxos = (porLaxa.get(`${llave}|${limpiar(ciudad)}`) ?? []).filter(ok);
    return laxos.length === 1 ? salida(laxos[0]) : null;
  };
}
