// Genera el cobro de mensualidad de cada proyecto activo cuando faltan 7 dias o
// menos para su dia de cobro. Idempotente: (proyectoId, mes) es unico en la base.
import { prisma } from "@/lib/db";
import { hoyCaracas } from "@/lib/fecha-caracas";
import { mensualidadesQueTocan, nombreMes } from "@/lib/cobros-contrato";

function esConflictoUnico(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
}

export async function generarMensualidades(hoy = hoyCaracas()): Promise<{ creadas: number; proyectos: number }> {
  const proyectos = await prisma.proyecto.findMany({
    where: { estado: "activo" },
    select: { id: true, estado: true, diaCobroMensual: true, fechaInicio: true, mensualidad: true, cobros: { where: { concepto: "mensualidad" }, select: { mes: true } } },
  });
  let creadas = 0;
  for (const p of proyectos) {
    if (Number(p.mensualidad) <= 0) continue; // proyecto solo de pago unico, sin cobro mensual
    try {
      const existentes = p.cobros.map((c) => c.mes).filter((m): m is string => !!m);
      for (const { mes, vence } of mensualidadesQueTocan(p, hoy, existentes)) {
        try {
          // Cobro y evento van juntos: un cobro nuevo nunca queda sin su rastro.
          await prisma.$transaction(async (tx) => {
            const c = await tx.cobro.create({ data: { proyectoId: p.id, concepto: "mensualidad", detalle: `Mensualidad de ${nombreMes(mes)}`, monto: p.mensualidad, vence, mes }, select: { id: true } });
            await tx.evento.create({ data: { proyectoId: p.id, cobroId: c.id, tipo: "cobro_agregado", texto: `mensualidad ${mes}` } });
          });
          creadas++;
        } catch (err) {
          // P2002: otra corrida lo creo primero (proyectoId+mes es unico). Es el caso idempotente.
          if (!esConflictoUnico(err)) throw err;
        }
      }
    } catch (err) {
      // Un proyecto envenenado no debe tumbar la corrida de los demas.
      console.error("[mensualidades] proyecto", p.id, err);
    }
  }
  // Latido: una linea por corrida, siempre, para ver en el log que el cron sigue vivo.
  console.log(`[mensualidades] ${hoy}: ${creadas} creadas de ${proyectos.length} activos`);
  return { creadas, proyectos: proyectos.length };
}

// Milisegundos hasta las proximas 06:00 de Caracas (UTC-4 fijo => 10:00Z).
export function proximoDisparoMs(ahora = new Date()): number {
  const objetivo = new Date(ahora);
  objetivo.setUTCHours(10, 0, 0, 0);
  if (objetivo.getTime() <= ahora.getTime()) objetivo.setUTCDate(objetivo.getUTCDate() + 1);
  return objetivo.getTime() - ahora.getTime();
}

// Bandera en globalThis (no en el modulo): sobrevive al recargado en caliente
// (HMR) de dev, igual que el prisma singleton de src/lib/db.ts.
const g = globalThis as unknown as { cronMensualidades?: boolean };
export function programarCron(): void {
  if (g.cronMensualidades) return;
  g.cronMensualidades = true;
  const correr = () => generarMensualidades().catch((e) => console.error("[mensualidades]", e));
  const siguiente = () => {
    const t = setTimeout(() => { correr().finally(siguiente); }, proximoDisparoMs());
    t.unref(); // no debe mantener vivo el proceso (ni bloquear tests/scripts)
  };
  correr().finally(siguiente).catch(() => {});
}
