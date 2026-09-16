import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

// Los tests con base exigen PROSPECTOS_TEST_DB=1 para que un "npm test" casual
// no toque la base real. Con la bandera, preparar-entorno.ts ya redirigio
// DATABASE_URL a neracosu_prospectos_test.
export const DB_HABILITADA = process.env.PROSPECTOS_TEST_DB === "1";

export const PIN_DUENO = "123456";
export const PIN_PROSPECTADOR = "654321";

// La base de tests no guarda historia: se vacia entera, en orden de claves foraneas.
export async function limpiarBase(): Promise<void> {
  await prisma.evento.deleteMany();
  await prisma.prospecto.deleteMany();
  await prisma.nicho.deleteMany();
  await prisma.usuario.deleteMany();
  await prisma.configuracion.deleteMany();
}

export async function sembrarBasico(): Promise<{ nichoId: number; usuarioId: number; prospectadorId: number }> {
  const nicho = await prisma.nicho.create({
    data: {
      slug: "hoteles",
      nombre: "Hoteles",
      mensajeInicial: "Buenas, equipo de {nombre}. Propuesta: {enlace}",
      mensajeSeguimiento: "Hola de nuevo, {nombre}. ¿Pudiste ver la propuesta? {enlace}",
      plantillaPropuesta: "hoteles",
      diasSeguimiento: 3,
    },
  });
  const dueno = await prisma.usuario.create({
    data: { nombre: "Neri", rol: "dueno", pinHash: await bcrypt.hash(PIN_DUENO, 4), metaDiaria: 10 },
  });
  const prospectador = await prisma.usuario.create({
    data: { nombre: "María", rol: "prospectador", pinHash: await bcrypt.hash(PIN_PROSPECTADOR, 4), metaDiaria: 5 },
  });
  return { nichoId: nicho.id, usuarioId: dueno.id, prospectadorId: prospectador.id };
}

export async function crearProspectoDePrueba(
  nichoId: number,
  extra: Partial<{ nombre: string; ciudad: string; whatsapp: string; telefono: string; email: string; instagram: string; etapa: string; proximoSeguimiento: string | null; ordenCola: number }> = {},
) {
  const nombre = extra.nombre ?? `Hotel Prueba ${Math.random().toString(36).slice(2, 7)}`;
  const ciudad = extra.ciudad ?? "Caracas";
  return prisma.prospecto.create({
    data: {
      nichoId,
      nombre,
      ciudad,
      fuentes: ["https://ejemplo.test/"],
      codigo: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
      clave: (nombre + "|" + ciudad).toLowerCase().replace(/[^a-z0-9|]/g, ""),
      ...extra,
    },
  });
}
