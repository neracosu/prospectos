// src/lib/correo-dominio.ts -- ¿el dominio de un correo recibe correo? Mira si tiene MX (o, a falta de MX, un registro A:
// RFC 5321). Es lo minimo para no mandar a dominios muertos: el 2026-10-31, 10 de 25 correos rebotaron y 3 eran dominios sin
// correo. No hace RCPT TO contra el servidor ajeno (eso si daña la reputacion). Cache por dominio de 6 h en memoria.
import dns from "node:dns";

export type Veredicto = "si" | "no" | "duda";
export type Resolvedor = { mx: (dominio: string) => Promise<number>; a: (dominio: string) => Promise<number> };

export function dominioDe(email: string): string {
  const i = email.lastIndexOf("@");
  return i < 0 ? "" : email.slice(i + 1).trim().toLowerCase();
}

const real: Resolvedor = {
  mx: async (d) => (await dns.promises.resolveMx(d)).filter((m) => m.exchange && m.exchange !== ".").length,
  a: async (d) => (await dns.promises.resolve4(d)).length,
};
let inyectado: Resolvedor | null = null;
export function _resolvedorParaTests(r: Resolvedor | null): void { inyectado = r; }

const SIN_DATOS = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN"]);
const cache = new Map<string, { v: Veredicto; hasta: number }>();
const TTL_MS = 6 * 3600_000;

// "no" solo cuando el DNS responde con certeza que no hay MX ni A (NXDOMAIN / sin datos). Un timeout o un SERVFAIL es
// "duda": no se bloquea a nadie por un DNS caido.
export async function dominioRecibeCorreo(email: string, ahora = Date.now()): Promise<Veredicto> {
  // Con el correo simulado (clon, recorridos) no se consulta DNS: los dominios de prueba no existen.
  if (process.env.PROSPECTOS_CORREO_SIMULADO === "1" && !inyectado) return "si";
  const dominio = dominioDe(email);
  if (!dominio || !dominio.includes(".")) return "no";
  const c = cache.get(dominio);
  if (c && c.hasta > ahora) return c.v;
  const r = inyectado ?? real;
  const v = await veredicto(dominio, r);
  cache.set(dominio, { v, hasta: ahora + TTL_MS });
  return v;
}

async function veredicto(dominio: string, r: Resolvedor): Promise<Veredicto> {
  const codigo = (e: unknown) => String((e as { code?: string })?.code ?? "");
  try { if ((await r.mx(dominio)) > 0) return "si"; } catch (e) { if (!SIN_DATOS.has(codigo(e))) return "duda"; }
  try { return (await r.a(dominio)) > 0 ? "si" : "no"; } catch (e) { return SIN_DATOS.has(codigo(e)) ? "no" : "duda"; }
}

export function _vaciarCacheDominios(): void { cache.clear(); }
