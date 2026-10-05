// Acceso a la tabla del directorio abierto (Overture Maps). Las reglas viven en overture-contrato.ts; aqui solo
// se lee y se reemplaza. No entra en la cadena de src/instrumentation.ts.
import { prisma } from "@/lib/db";
import type { Ciudad } from "@/lib/overpass-contrato";
import { cajaDeCiudad, type LugarOverture, type ReglaNicho } from "@/lib/overture-contrato";

// Trae la caja que encierra el circulo de la ciudad y las categorias base del nicho. El desempate entre ciudades
// y el filtro fino los hace prospectosDesdeOverture.
export async function lugaresDeOverture(regla: ReglaNicho, c: Ciudad): Promise<LugarOverture[]> {
  const caja = cajaDeCiudad(c);
  return prisma.lugarOverture.findMany({
    where: {
      categoriaBase: { in: regla.bases },
      lat: { gte: caja.latMin, lte: caja.latMax },
      lon: { gte: caja.lonMin, lte: caja.lonMax },
    },
  });
}

// La publicacion de Overture que esta cargada, o null si la tabla esta vacia. Toda la tabla es de una sola.
export async function publicacionCargada(): Promise<string | null> {
  const f = await prisma.lugarOverture.findFirst({ select: { publicacion: true } });
  return f?.publicacion ?? null;
}

const POR_TANDA = 1000;

// Borra todo e inserta lo nuevo en UNA transaccion: si algo falla, el directorio queda como estaba.
export async function reemplazarLugares(lugares: LugarOverture[]): Promise<number> {
  await prisma.$transaction(
    async (tx) => {
      await tx.lugarOverture.deleteMany();
      for (let i = 0; i < lugares.length; i += POR_TANDA) {
        await tx.lugarOverture.createMany({ data: lugares.slice(i, i + POR_TANDA) });
      }
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
  return lugares.length;
}
