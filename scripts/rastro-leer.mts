// scripts/rastro-leer.mts -- lee los logs de acceso de Apache, guarda las visitas a los enlaces enviados y les pone lugar (pais/ciudad).
// Uso (env cargado): node_modules/.bin/tsx scripts/rastro-leer.mts [--importar --enlace <id> [--desde AAAA-MM-DD] [--aplicar]] [--sin-geo]
//   Sin flags: leerLogs() + geolocalizarPendientes() con la base DB-IP Lite (si falta el archivo, las pendientes se cierran sin lugar).
//   Imprime una linea "[rastro] ..." solo si hubo visitas nuevas o visitas geolocalizadas; lo corre el crontab.
//   --sin-geo       no geolocaliza (las visitas quedan pendientes de lugar).
//   --importar      carga la historia archivada (.gz) de un enlace ya registrado, p. ej. uno enviado hace dias. Sin --aplicar es un
//                   ENSAYO: corre la importacion dentro de una transaccion y la deshace al final (rollback), asi cuenta lo que
//                   insertaria sin dejar nada. Con --aplicar inserta de verdad. --desde se lee como medianoche de Caracas.
import { prisma } from "../src/lib/db";
import { leerLogs, importarArchivados } from "../src/lib/rastro-lector";
import { abrirGeo, geolocalizarPendientes } from "../src/lib/rastro-geo";

const arg = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const tiene = (n: string) => process.argv.includes(n);

async function importar(): Promise<void> {
  const id = Number(arg("--enlace"));
  const enlace = Number.isInteger(id) && id > 0 ? await prisma.enlaceEnviado.findUnique({ where: { id } }) : null;
  if (!enlace) { console.error("[rastro] fallo: falta --enlace <id> o no existe"); process.exit(1); }
  const d = arg("--desde");
  let desde: Date | undefined;
  if (d) {
    desde = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T00:00:00-04:00`) : undefined;
    if (!desde || Number.isNaN(desde.getTime())) { console.error("[rastro] fallo: --desde debe ser AAAA-MM-DD"); process.exit(1); }
  }
  const opciones = { host: enlace.host, prefijo: enlace.prefijo, desde };
  if (tiene("--aplicar")) {
    const r = await importarArchivados(opciones);
    console.log(`[rastro] importado enlace ${id}: ${r.lineas} lineas, ${r.visitas} visitas`);
    return;
  }
  try {
    await prisma.$transaction(async () => {
      const r = await importarArchivados(opciones);
      console.log(`[rastro] ensayo enlace ${id}: insertaria ${r.visitas} visitas de ${r.lineas} lineas (use --aplicar para guardarlas)`);
      throw new Error("ENSAYO");
    }, { timeout: 300_000, maxWait: 60_000 });
  } catch (err) {
    if (!(err instanceof Error) || err.message !== "ENSAYO") throw err;
  }
}

async function normal(): Promise<void> {
  const r = await leerLogs();
  const g = tiene("--sin-geo") ? { resueltas: 0, sinDato: 0 } : await geolocalizarPendientes(2000, abrirGeo());
  if (r.visitas > 0 || g.resueltas + g.sinDato > 0) {
    const pendientes = await prisma.visitaEnlace.count({ where: { geoPendiente: true } });
    const fecha = new Intl.DateTimeFormat("es-VE", { timeZone: "America/Caracas", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
    console.log(`[rastro] ${fecha} Caracas: ${r.lineas} lineas, ${r.visitas} visitas, ${pendientes} pendientes de lugar`);
  }
}

try {
  if (tiene("--importar")) await importar(); else await normal();
  await prisma.$disconnect();
  process.exit(0);
} catch (err) {
  console.error(`[rastro] fallo: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
