// scripts/rastro-leer.mts -- lee los logs de acceso de Apache, guarda las visitas a los enlaces enviados y les pone lugar (pais/ciudad).
// Uso (env cargado): node_modules/.bin/tsx scripts/rastro-leer.mts [--importar (--enlace <id> | --host <host>) [--desde AAAA-MM-DD] [--aplicar]] [--sin-geo]
//   Sin flags: leerLogs() + geolocalizarPendientes() con la base DB-IP Lite (si falta el archivo, las pendientes se cierran sin lugar)
//   y poda las visitas de mas de 400 dias. Imprime "[rastro] ..." solo si hubo visitas nuevas, geolocalizadas o podadas; lo corre el crontab.
//   --sin-geo       no geolocaliza (las visitas quedan pendientes de lugar).
//   --importar      carga la historia archivada (.gz) de un enlace ya registrado, p. ej. uno enviado hace dias. Sin --aplicar es un
//                   ENSAYO: lee los archivos y cuenta las visitas que coinciden (pueden incluir las ya guardadas) sin escribir nada.
//                   Con --aplicar inserta de verdad. --desde (AAAA-MM-DD, sin valor o invalido es error) se lee como medianoche de Caracas.
//   --host <host>   en lugar de --enlace: todos los enlaces activos del host. Con prospectos.neracosu.com carga los /p/<codigo>,
//                   que no tienen fila hasta la primera peticion: con --aplicar se crean (salvo lineas propias); el ensayo no crea
//                   ninguna y cuenta lo que importaria.
import { prisma } from "../src/lib/db";
import { leerLogs, importarArchivados } from "../src/lib/rastro-lector";
import { podarVisitasViejas } from "../src/lib/rastro";
import { abrirGeo, geolocalizarPendientes } from "../src/lib/rastro-geo";

const arg = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const tiene = (n: string) => process.argv.includes(n);

async function importar(): Promise<void> {
  let desde: Date | undefined;
  if (tiene("--desde")) {
    const d = arg("--desde") ?? "";
    desde = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T00:00:00-04:00`) : undefined;
    if (!desde || Number.isNaN(desde.getTime())) { console.error("[rastro] fallo: --desde debe ser AAAA-MM-DD"); process.exit(1); }
  }
  const aplicar = tiene("--aplicar");
  if (tiene("--host")) {
    const host = (arg("--host") ?? "").trim().toLowerCase();
    if (!/^([a-z0-9-]+\.)*neracosu\.com$/.test(host)) { console.error("[rastro] fallo: --host debe ser neracosu.com o un subdominio"); process.exit(1); }
    const r = await importarArchivados({ host, desde, ensayo: !aplicar });
    console.log(aplicar
      ? `[rastro] importado host ${host}: ${r.lineas} lineas, ${r.visitas} visitas`
      : `[rastro] host ${host}: importaria ${r.visitas} visitas que coinciden (use --aplicar para escribir)`);
    return;
  }
  const id = Number(arg("--enlace"));
  const enlace = Number.isInteger(id) && id > 0 ? await prisma.enlaceEnviado.findUnique({ where: { id } }) : null;
  if (!enlace) { console.error("[rastro] fallo: falta --enlace <id> (o --host <host>) o no existe"); process.exit(1); }
  const r = await importarArchivados({ host: enlace.host, prefijo: enlace.prefijo, desde, ensayo: !aplicar });
  console.log(aplicar
    ? `[rastro] importado enlace ${id}: ${r.lineas} lineas, ${r.visitas} visitas`
    : `[rastro] enlace ${id}: importaria ${r.visitas} visitas que coinciden (use --aplicar para escribir)`);
}

async function normal(): Promise<void> {
  const r = await leerLogs({ silencioso: true });
  const g = tiene("--sin-geo") ? { resueltas: 0, sinDato: 0 } : await geolocalizarPendientes(2000, abrirGeo());
  if (r.visitas > 0 || g.resueltas + g.sinDato > 0) {
    const pendientes = await prisma.visitaEnlace.count({ where: { geoPendiente: true } });
    const fecha = new Intl.DateTimeFormat("es-VE", { timeZone: "America/Caracas", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
    console.log(`[rastro] ${fecha} Caracas: ${r.lineas} lineas, ${r.visitas} visitas, ${pendientes} pendientes de lugar`);
  }
  const podadas = await podarVisitasViejas();
  if (podadas > 0) console.log(`[rastro] poda: ${podadas} visitas`);
}

try {
  if (tiene("--importar")) await importar(); else await normal();
  await prisma.$disconnect();
  process.exit(0);
} catch (err) {
  console.error(`[rastro] fallo: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
