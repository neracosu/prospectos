// Genera el cobro de mensualidad de cada proyecto activo cuando faltan 7 dias o
// menos para su dia de cobro. Idempotente: (proyectoId, mes) es unico en la base.
import { prisma } from "@/lib/db";
import { hoyCaracas } from "@/lib/fecha-caracas";
import { mensualidadesQueTocan } from "@/lib/cobros-contrato";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function nombreMes(mes: string): string {
  const [a, m] = mes.split("-");
  return `${MESES[Number(m) - 1]} ${a}`;
}

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
  }
  return { creadas, proyectos: proyectos.length };
}

// Milisegundos hasta las proximas 06:00 de Caracas (UTC-4 fijo => 10:00Z).
export function proximoDisparoMs(ahora = new Date()): number {
  const objetivo = new Date(ahora);
  objetivo.setUTCHours(10, 0, 0, 0);
  if (objetivo.getTime() <= ahora.getTime()) objetivo.setUTCDate(objetivo.getUTCDate() + 1);
  return objetivo.getTime() - ahora.getTime();
}

// Bandera de modulo: nunca dos timers, aunque register() se llame mas de una vez.
let programado = false;
export function programarCron(): void {
  if (programado) return;
  programado = true;
  const correr = () =>
    generarMensualidades()
      .then((r) => { if (r.creadas) console.log(`[mensualidades] ${r.creadas} creadas`); })
      .catch((e) => console.error("[mensualidades]", e));
  const siguiente = () => {
    const t = setTimeout(() => { correr().finally(siguiente); }, proximoDisparoMs());
    t.unref(); // no debe mantener vivo el proceso (ni bloquear tests/scripts)
  };
  correr().finally(siguiente);
}
