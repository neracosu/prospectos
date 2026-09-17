// Arranca el cron de mensualidades con el servidor. Next 15 carga este archivo
// solo (no hace falta registrarlo en next.config).
//
// Bandera en globalThis, no en el modulo: sobrevive al recargado en caliente de
// dev, igual que la de mensualidades.
const g = globalThis as unknown as { cronRevision?: boolean };

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { programarCron, proximoDisparoMs } = await import("@/lib/mensualidades");
  programarCron();

  // Limpieza de la bandeja, a la misma hora que las mensualidades (06:00 de
  // Caracas) y con su propia linea de latido en el log. Es lo unico que borra
  // algo en toda la app: filas de revision YA DECIDIDAS de mas de 30 dias.
  // Nunca un Prospecto, y nunca lo que sigue pendiente.
  if (g.cronRevision) return;
  g.cronRevision = true;
  const { limpiarLotesViejos } = await import("@/lib/revision");
  const correr = async () => {
    try {
      // limpiarLotesViejos cuenta filas borradas, no lotes: el log dice "lotes"
      // porque es lo que se ve en la pantalla.
      const n = await limpiarLotesViejos(30);
      console.log(`[revision] ${n} lotes viejos limpiados`);
    } catch (e) {
      console.error("[revision]", e);
    }
  };
  const siguiente = () => {
    const t = setTimeout(() => {
      correr().finally(siguiente);
    }, proximoDisparoMs());
    t.unref(); // no debe mantener vivo el proceso
  };
  correr().finally(siguiente);
}
