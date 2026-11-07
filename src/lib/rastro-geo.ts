// Geolocalizacion de las visitas del rastro con la base DB-IP Lite (archivo .mmdb local, sin llamadas a la red).
// IP Geolocation by DB-IP (https://db-ip.com), CC BY 4.0.
// SOLO la usan los scripts (scripts/rastro-leer.mts) y los tests: no importar desde ninguna ruta, accion ni pagina de Next
// (el lector del archivo usa node:fs y no debe entrar al grafo del servidor web).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Reader } from "mmdb-lib";
import { prisma } from "./db";

export type Lugar = { pais: string; ciudad: string; red: string };
type Resolver = (ip: string) => Lugar | null;

const corto = (s: string, n: number) => s.slice(0, n);

// Aqui puede crecer una lista de rangos de VPN o relay (iCloud Private Relay, etc.) para marcar "vpn" | "relay" | "hosting".
export function redDeIp(_ip: string): string {
  return "";
}

type Nombres = { names?: { es?: string; en?: string } };
export function lugarDesdeRegistro(r: unknown, ip = ""): Lugar {
  const reg = (r ?? {}) as { country?: Nombres; city?: Nombres };
  const nombre = (x?: Nombres) => x?.names?.es ?? x?.names?.en ?? "";
  return { pais: corto(nombre(reg.country), 60), ciudad: corto(nombre(reg.city), 80), red: ip ? redDeIp(ip) : "" };
}

export function abrirGeo(ruta?: string): Resolver | null {
  const archivo = ruta ?? process.env.RASTRO_MMDB ?? path.join(process.env.HOME ?? "/home/neracosu", ".config/prospectos/geo/dbip-city-lite.mmdb");
  if (!existsSync(archivo)) return null;
  let lector: Reader<object>;
  try { lector = new Reader<object>(readFileSync(archivo)); } catch { return null; }
  return (ip) => {
    let r: object | null = null;
    try { r = lector.get(ip); } catch { return null; }
    return r ? lugarDesdeRegistro(r, ip) : null;
  };
}

export function esIpPrivada(ip: string): boolean {
  const s = ip.trim().toLowerCase();
  if (s === "desconocida" || s === "::1") return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(s);
  if (v4) {
    const a = Number(v4[1]), b = Number(v4[2]);
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  return s.startsWith("fc") || s.startsWith("fd") || /^fe[89ab]/.test(s);
}

// Cierra las visitas pendientes de lugar: una consulta de escritura por IP distinta.
export async function geolocalizarPendientes(limite = 2000, resolver?: Resolver | null): Promise<{ resueltas: number; sinDato: number }> {
  const filas = await prisma.visitaEnlace.findMany({ where: { geoPendiente: true }, orderBy: { id: "asc" }, take: limite, select: { id: true, ip: true } });
  const porIp = new Map<string, number[]>();
  for (const f of filas) { const l = porIp.get(f.ip); if (l) l.push(f.id); else porIp.set(f.ip, [f.id]); }
  let resueltas = 0, sinDato = 0;
  for (const [ip, ids] of porIp) {
    const lugar = resolver && !esIpPrivada(ip) ? resolver(ip) : null;
    if (!lugar) {
      await prisma.visitaEnlace.updateMany({ where: { id: { in: ids } }, data: { geoPendiente: false } });
      sinDato += ids.length;
    } else {
      await prisma.visitaEnlace.updateMany({ where: { id: { in: ids } }, data: { pais: lugar.pais, ciudad: lugar.ciudad, red: lugar.red, geoPendiente: false } });
      resueltas += ids.length;
    }
  }
  return { resueltas, sinDato };
}
