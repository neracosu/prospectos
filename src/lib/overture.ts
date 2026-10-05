// Acceso a la tabla del directorio abierto (Overture Maps). Las reglas viven en overture-contrato.ts; aqui solo
// se lee y se reemplaza. No entra en la cadena de src/instrumentation.ts.
import { prisma } from "@/lib/db";
import { claveProspecto } from "@/lib/clave-prospecto";
import type { Ciudad } from "@/lib/overpass-contrato";
import type { Pais } from "@/lib/celular-contrato";
import { cajaDeCiudad, type LugarOverture, type ReglaNicho } from "@/lib/overture-contrato";

// Trae la caja que encierra el circulo de la ciudad y las categorias base del nicho. El desempate entre ciudades
// y el filtro fino los hace prospectosDesdeOverture.
export async function lugaresDeOverture(regla: ReglaNicho, c: Ciudad): Promise<LugarOverture[]> {
  const caja = cajaDeCiudad(c);
  const filas = await prisma.lugarOverture.findMany({
    where: {
      pais: c.pais,
      categoriaBase: { in: regla.bases },
      lat: { gte: caja.latMin, lte: caja.latMax },
      lon: { gte: caja.lonMin, lte: caja.lonMax },
    },
  });
  // La columna es texto: el pais ya viene filtrado, aqui solo se le da su tipo.
  return filas.map((f) => ({ ...f, pais: c.pais }));
}

// La publicacion de Overture cargada para ese pais, o null si no hay nada de ese pais.
export async function publicacionCargada(pais: Pais = "VE"): Promise<string | null> {
  const f = await prisma.lugarOverture.findFirst({ where: { pais }, select: { publicacion: true } });
  return f?.publicacion ?? null;
}

const POR_TANDA = 1000;

// Borra lo de ESE pais e inserta lo nuevo en UNA transaccion: si algo falla, el directorio queda como estaba, y
// cargar Colombia no toca Venezuela.
export async function reemplazarLugares(lugares: LugarOverture[], pais: Pais = "VE"): Promise<number> {
  if (lugares.some((l) => l.pais !== pais)) throw new Error(`Hay lugares que no son de ${pais}`);
  await prisma.$transaction(
    async (tx) => {
      await tx.lugarOverture.deleteMany({ where: { pais } });
      for (let i = 0; i < lugares.length; i += POR_TANDA) {
        await tx.lugarOverture.createMany({ data: lugares.slice(i, i + POR_TANDA) });
      }
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
  return lugares.length;
}

// Las claves (nombre|ciudad) de lo que ya paso por la bandeja desde el directorio para ese nicho y esa ciudad:
// filas de Revision con cualquier decision (pendiente, aprobada, descartada) y prospectos que entraron por ahi (las
// filas decididas se limpian a los 30 dias; el prospecto queda). Es lo que tomarLote no vuelve a ofrecer.
export async function clavesVistas(nichoId: number, nichoSlug: string, ciudad: string): Promise<Set<string>> {
  const [filas, prospectos] = await Promise.all([
    prisma.$queryRaw<{ nombre: string | null }[]>`
      SELECT JSON_UNQUOTE(JSON_EXTRACT(datos, '$.nombre')) AS nombre FROM Revision
      WHERE origen = 'overture'
        AND JSON_UNQUOTE(JSON_EXTRACT(datos, '$.nicho')) = ${nichoSlug}
        AND JSON_UNQUOTE(JSON_EXTRACT(datos, '$.ciudad')) = ${ciudad}`,
    prisma.prospecto.findMany({ where: { nichoId, origen: "overture", ciudad }, select: { clave: true } }),
  ]);
  return new Set([...filas.map((f) => claveProspecto(f.nombre ?? "", ciudad)), ...prospectos.map((p) => p.clave)]);
}
