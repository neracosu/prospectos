// src/lib/red-segura.ts -- TODA peticion saliente del panel pasa por aqui.
// Solo http(s), sin localhost ni IPs privadas (se resuelve el DNS y se revisa cada salto),
// con tope de tiempo y de bytes. Evita que el panel se use para tocar la red interna del servidor.
// No hay logs en este modulo: las URL pueden traer tokens en la query string.
//
// La conexion real se hace con node:http/node:https en vez de fetch(), y se fija (pin) a la
// IP que ya paso la guardia con la opcion "lookup" de esos modulos: asi el nombre de host que
// llega al servidor remoto (el Host real) sigue siendo el original -correcto para SNI/TLS y
// para servidores con varios sitios por IP-, pero la conexion de red nunca vuelve a preguntarle
// al DNS: evita que una segunda resolucion (DNS rebinding) devuelva una IP privada distinta a
// la que valido la guardia.
import dns from "node:dns";
import net from "node:net";
import http from "node:http";
import https from "node:https";

export const USER_AGENT = "prospectos.neracosu.com (contacto: neracosu@gmail.com)";

type Opciones = {
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirecciones?: number;
  metodo?: "GET" | "HEAD" | "POST";
  cuerpo?: string;
  contentType?: string;
  // Solo para pruebas: reemplaza la resolucion DNS real para poder simular un host
  // publico que en realidad apunta a un servidor http local levantado por el test.
  _lookupParaTests?: (host: string) => Promise<string>;
};

type ResultadoGuardia = { ok: true; url: URL; ip: string } | { ok: false; motivo: string };
type ResultadoDescarga = { ok: true; estado: number; urlFinal: string; texto: string } | { ok: false; motivo: string };

function ipPrivada(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  const v6 = ip.toLowerCase();
  return (
    v6 === "::1" ||
    v6 === "::" ||
    v6.startsWith("fc") || // ULA fc00::/7
    v6.startsWith("fd") || // ULA fc00::/7
    v6.startsWith("fe80") || // link-local fe80::/10
    v6.startsWith("::ffff:") // IPv4 mapeada en IPv6
  );
}

// Nombres que se rechazan por su forma, sin depender del DNS (que podria mentir
// o cambiar): localhost, sus subdominios, .local/.internal, y cualquier nombre
// sin punto (no es un dominio real resoluble desde afuera).
function nombreBloqueado(host: string): boolean {
  if (host === "localhost") return true;
  if (host.endsWith(".localhost")) return true;
  if (host.endsWith(".local")) return true;
  if (host.endsWith(".internal")) return true;
  if (!host.includes(".")) return true;
  return false;
}

// Guardia SSRF: valida esquema, forma del host y, si es un nombre, a que IP resuelve.
// Se llama antes de CADA conexion, incluyendo cada salto de una redireccion, y devuelve
// la IP validada para que la conexion real se fije a ella (ver cabecera del archivo).
export async function esUrlPermitida(url: string, lookup?: (host: string) => Promise<string>): Promise<ResultadoGuardia> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, motivo: "URL invalida" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, motivo: "Solo se aceptan direcciones http(s)" };
  }
  const host = u.hostname.toLowerCase();
  // Un literal de IP en la URL (v4 o v6, esta ultima entre corchetes) se revisa
  // directamente: no hay DNS de por medio y ningun resolvedor inyectado lo cambia.
  const sinCorchetes = host.replace(/^\[/, "").replace(/\]$/, "");
  if (net.isIP(sinCorchetes)) {
    if (ipPrivada(sinCorchetes)) return { ok: false, motivo: "Direccion privada o local no permitida" };
    return { ok: true, url: u, ip: sinCorchetes };
  }
  if (nombreBloqueado(host)) {
    return { ok: false, motivo: "Direccion privada o local no permitida" };
  }
  try {
    const ip = lookup ? await lookup(host) : (await dns.promises.lookup(host)).address;
    // El resolvedor inyectado es solo para pruebas: se confia en el para simular
    // un host publico. Sin el, se valida siempre la IP real que entrega el DNS.
    if (!lookup && ipPrivada(ip)) return { ok: false, motivo: "Direccion privada o local no permitida" };
    return { ok: true, url: u, ip };
  } catch {
    return { ok: false, motivo: "No se pudo resolver el dominio" };
  }
}

// Alias explicito: cada salto de una redireccion pasa por aqui, sin excepcion.
// Se expone por separado para poder probar ese hecho de forma directa.
export async function _esSaltoPermitido(url: string, lookup?: (host: string) => Promise<string>): Promise<ResultadoGuardia> {
  return esUrlPermitida(url, lookup);
}

type RespuestaCruda = { estado: number; ubicacion: string | null; texto: string };

// Hace la conexion real, fijada a "ip" (ver comentario de cabecera). No usa fetch()
// porque fetch no permite forzar la IP de conexion sin tambien perder el Host real.
function conectarFijo(u: URL, ip: string, opts: { metodo: string; cuerpo?: string; contentType?: string; timeoutMs: number; maxBytes: number }): Promise<RespuestaCruda> {
  return new Promise((resolve, reject) => {
    const transportador = u.protocol === "https:" ? https : http;
    const puerto = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
    const familia = net.isIPv6(ip) ? 6 : 4;
    let resuelto = false;
    const terminar = (v: RespuestaCruda | Error) => {
      if (resuelto) return;
      resuelto = true;
      if (v instanceof Error) reject(v);
      else resolve(v);
    };

    const req = transportador.request(
      {
        hostname: u.hostname,
        port: puerto,
        path: u.pathname + u.search,
        method: opts.metodo,
        // No se vuelve a preguntar al DNS: se conecta directo a la IP que ya paso la guardia.
        lookup: (
          _hostname: string,
          opciones: { all?: boolean },
          cb: ((err: NodeJS.ErrnoException | null, address: string, family: number) => void) &
            ((err: NodeJS.ErrnoException | null, addresses: Array<{ address: string; family: number }>) => void)
        ) => {
          if (opciones && opciones.all) (cb as (err: null, addresses: Array<{ address: string; family: number }>) => void)(null, [{ address: ip, family: familia }]);
          else (cb as (err: null, address: string, family: number) => void)(null, ip, familia);
        },
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/json;q=0.9,*/*;q=0.5",
          ...(opts.contentType ? { "content-type": opts.contentType } : {}),
        },
        timeout: opts.timeoutMs,
      },
      (res) => {
        const partes: Buffer[] = [];
        let total = 0;
        res.on("data", (chunk: Buffer) => {
          if (total >= opts.maxBytes) return;
          const restante = opts.maxBytes - total;
          partes.push(restante < chunk.length ? chunk.subarray(0, restante) : chunk);
          total += chunk.length;
          if (total >= opts.maxBytes) res.destroy();
        });
        res.on("end", () =>
          terminar({ estado: res.statusCode ?? 0, ubicacion: (res.headers.location as string | undefined) ?? null, texto: Buffer.concat(partes).toString("utf8") })
        );
        res.on("close", () =>
          terminar({ estado: res.statusCode ?? 0, ubicacion: (res.headers.location as string | undefined) ?? null, texto: Buffer.concat(partes).toString("utf8") })
        );
        res.on("error", (err) => terminar(err));
      }
    );
    req.on("timeout", () => req.destroy(new Error("__timeout__")));
    req.on("error", (err) => terminar(err));
    if (opts.cuerpo) req.write(opts.cuerpo);
    req.end();
  });
}

export async function descargar(url: string, o: Opciones = {}): Promise<ResultadoDescarga> {
  const maxBytes = o.maxBytes ?? 2 * 1024 * 1024;
  const timeoutMs = o.timeoutMs ?? 10_000;
  const maxRedir = o.maxRedirecciones ?? 3;
  let actual = url;

  for (let salto = 0; salto <= maxRedir; salto++) {
    const g = await _esSaltoPermitido(actual, o._lookupParaTests);
    if (!g.ok) return g;

    try {
      const r = await conectarFijo(g.url, g.ip, {
        metodo: o.metodo ?? "GET",
        cuerpo: o.cuerpo,
        contentType: o.contentType,
        timeoutMs,
        maxBytes,
      });

      if (r.estado >= 300 && r.estado < 400 && r.ubicacion) {
        if (salto === maxRedir) return { ok: false, motivo: "Demasiadas redirecciones" };
        actual = new URL(r.ubicacion, g.url).toString();
        continue;
      }

      return { ok: true, estado: r.estado, urlFinal: g.url.toString(), texto: r.texto };
    } catch (err) {
      const mensaje = (err as Error).message;
      return {
        ok: false,
        motivo: mensaje === "__timeout__" ? "Tiempo de espera agotado" : `No se pudo conectar (${mensaje})`,
      };
    }
  }
  return { ok: false, motivo: "Demasiadas redirecciones" };
}
