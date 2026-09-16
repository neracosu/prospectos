// Arranca el cron de mensualidades con el servidor. Next 15 carga este archivo
// solo (no hace falta registrarlo en next.config).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { programarCron } = await import("@/lib/mensualidades");
  programarCron();
}
