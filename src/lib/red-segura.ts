// src/lib/red-segura.ts -- TODA peticion saliente del panel pasa por aqui.
// Solo http(s), sin localhost ni IPs privadas (se resuelve el DNS y se revisa cada salto),
// con tope de tiempo TOTAL y de bytes. Evita que el panel se use para tocar la red interna
// del servidor. No hay logs en este modulo: las URL pueden traer tokens en la query string.
//
// La conexion real se hace con node:http/node:https en vez de fetch(), y se fija (pin) a la
// IP que ya paso la guardia con la opcion "lookup" de esos modulos: asi el nombre de host que
// llega al servidor remoto (el Host real, y el SNI/certificado si es https) sigue siendo el
// original, pero la conexion de red nunca vuelve a preguntarle al DNS: evita que una segunda
// resolucion (DNS rebinding) devuelva una IP privada distinta a la que valido la guardia.
import dns from "node:dns";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import { StringDecoder } from "node:string_decoder";

export const USER_AGENT = "prospectos.neracosu.com (contacto: neracosu@gmail.com)";

// Lista blanca para las opciones que solo existen para pruebas: fuera de esto se
// ignoran siempre, sin excepcion (ni "esta corriendo en mi maquina", ni nada). El
// "!== production" es a proposito: si por error queda PROSPECTOS_TEST_DB=1 puesto
// en un entorno de produccion, igual no alcanza para activar el resolvedor de pruebas.
function enListaBlancaDePruebas(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    (process.env.NODE_ENV === "test" || process.env.PROSPECTOS_TEST_DB === "1")
  );
}

type Opciones = {
  maxBytes?: number;
  // Limite de INACTIVIDAD: se reinicia con cada byte que llega. Un servidor que
  // gotea de a poco nunca lo dispara solo con esto.
  timeoutMs?: number;
  // Limite TOTAL: conexion + DNS + cabeceras + cuerpo, sumando todos los saltos de
  // una redireccion. Es el que de verdad acota cuanto puede tardar la llamada entera.
  plazoTotalMs?: number;
  maxRedirecciones?: number;
  metodo?: "GET" | "HEAD" | "POST";
  cuerpo?: string;
  contentType?: string;
  // Solo para pruebas: reemplaza la resolucion DNS real para poder simular un host
  // publico que en realidad apunta a un servidor http local levantado por el test.
  // Se ignora siempre fuera de la lista blanca (ver enListaBlancaDePruebas).
  _lookupParaTests?: (host: string) => Promise<string>;
  // Solo para pruebas: sin este flag, la IP que devuelva _lookupParaTests se valida
  // igual que una resuelta por DNS real (rechaza privadas). Con el flag, se confia en
  // ella tal cual, para poder simular que un nombre "publico" apunta al server del test.
  _confiarEnLookupParaTests?: boolean;
};

type ResultadoGuardia = { ok: true; url: URL; ip: string } | { ok: false; motivo: string };
type ResultadoDescarga =
  | { ok: true; estado: number; urlFinal: string; texto: string; truncado?: true }
  | { ok: false; motivo: string };

function ipPrivada(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b, c] = ip.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224 || // multicast 224.0.0.0/4 y reservado 240.0.0.0/4 (incluye 255.255.255.255)
      (a === 192 && b === 0 && c === 0) || // asignaciones IETF 192.0.0.0/24
      (a === 198 && (b === 18 || b === 19)) || // benchmarking 198.18.0.0/15
      (a === 192 && b === 0 && c === 2) || // TEST-NET-1 192.0.2.0/24
      (a === 198 && b === 51 && c === 100) || // TEST-NET-2 198.51.100.0/24
      (a === 203 && b === 0 && c === 113) || // TEST-NET-3 203.0.113.0/24
      (a === 192 && b === 88 && c === 99) // relay anycast 6to4 (obsoleto) 192.88.99.0/24
    );
  }
  const v6 = ip.toLowerCase();
  return (
    v6 === "::1" ||
    v6 === "::" ||
    v6.startsWith("fc") || // ULA fc00::/7
    v6.startsWith("fd") || // ULA fc00::/7
    v6.startsWith("fe8") || // link-local fe80::/10 (mascara completa: fe80..febf)
    v6.startsWith("fe9") ||
    v6.startsWith("fea") ||
    v6.startsWith("feb") ||
    v6.startsWith("fec") || // site-local (obsoleto) fec0::/10 (mascara completa: fec0..feff)
    v6.startsWith("fed") ||
    v6.startsWith("fee") ||
    v6.startsWith("fef") ||
    v6.startsWith("::ffff:") || // IPv4 mapeada en IPv6
    v6.startsWith("64:ff9b:") || // NAT64 64:ff9b::/96
    v6.startsWith("2002:") // 6to4 2002::/16
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

// Errores propios: sirven para que motivoDeError() clasifique por identidad, no por
// texto, y para no tener que adivinar el codigo exacto que da cada version de Node.
class ErrorTiempoAgotado extends Error {
  constructor() {
    super("tiempo agotado");
    this.name = "ErrorTiempoAgotado";
  }
}
class ErrorDescargaCortada extends Error {
  constructor() {
    super("descarga cortada");
    this.name = "ErrorDescargaCortada";
  }
}

// Envuelve una promesa con un plazo: si "ms" pasa antes de que resuelva, se rechaza
// con ErrorTiempoAgotado. Se usa para acotar la resolucion DNS al plazo TOTAL que
// le queda a la llamada completa (no tiene su propio limite independiente).
function conVencimiento<T>(promesa: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new ErrorTiempoAgotado()), ms);
    promesa.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

// Guardia SSRF: valida esquema, forma del host y, si es un nombre, a que IP resuelve.
// Se llama antes de CADA conexion, incluyendo cada salto de una redireccion, y devuelve
// la IP validada para que la conexion real se fije a ella (ver cabecera del archivo).
// "plazoRestanteMs", si se da, acota la resolucion DNS (parte del plazo TOTAL de descargar()).
export async function esUrlPermitida(
  url: string,
  lookup?: (host: string) => Promise<string>,
  confiarEnLookup?: boolean,
  plazoRestanteMs?: number
): Promise<ResultadoGuardia> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { ok: false, motivo: "URL inválida" };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, motivo: "Solo se aceptan direcciones http(s)" };
  }
  const host = u.hostname.toLowerCase();
  // Un literal de IP en la URL (v4 o v6, esta ultima entre corchetes) se revisa
  // directamente: no hay DNS de por medio y ningun resolvedor inyectado lo cambia.
  const sinCorchetes = host.replace(/^\[/, "").replace(/\]$/, "");
  if (net.isIP(sinCorchetes)) {
    if (ipPrivada(sinCorchetes)) return { ok: false, motivo: "Dirección privada o local no permitida" };
    return { ok: true, url: u, ip: sinCorchetes };
  }
  // Un punto final es un nombre de dominio absoluto valido ("algo.localhost.") y no
  // cambia a que resuelve: se quita antes de comparar para que no sirva de escape.
  if (nombreBloqueado(host.replace(/\.$/, ""))) {
    return { ok: false, motivo: "Dirección privada o local no permitida" };
  }
  // El resolvedor inyectado es solo para pruebas: fuera de la lista blanca se ignora
  // siempre (produccion, NODE_ENV sin definir, cualquier otro valor).
  const lookupEfectivo = enListaBlancaDePruebas() ? lookup : undefined;
  try {
    const tareaIp: Promise<string> = lookupEfectivo
      ? lookupEfectivo(host)
      : dns.promises.lookup(host).then((r) => r.address);
    const ip = plazoRestanteMs !== undefined ? await conVencimiento(tareaIp, plazoRestanteMs) : await tareaIp;
    const confiar = Boolean(lookupEfectivo) && Boolean(confiarEnLookup);
    if (!confiar && ipPrivada(ip)) return { ok: false, motivo: "Dirección privada o local no permitida" };
    return { ok: true, url: u, ip };
  } catch (err) {
    if (err instanceof ErrorTiempoAgotado) return { ok: false, motivo: "Tiempo de espera agotado" };
    return { ok: false, motivo: "No se pudo resolver el dominio" };
  }
}

// Alias explicito: cada salto de una redireccion pasa por aqui, sin excepcion.
// Se expone por separado para poder probar ese hecho de forma directa.
export async function _esSaltoPermitido(
  url: string,
  lookup?: (host: string) => Promise<string>,
  confiarEnLookup?: boolean,
  plazoRestanteMs?: number
): Promise<ResultadoGuardia> {
  return esUrlPermitida(url, lookup, confiarEnLookup, plazoRestanteMs);
}

const CODIGOS_CERTIFICADO = new Set([
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "CERT_HAS_EXPIRED",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "CERT_UNTRUSTED",
  "CERT_CHAIN_TOO_LONG",
]);

// Nunca se expone err.message (puede traer IP:puerto internos y sirve de oraculo
// para escanear la red del servidor): siempre un texto fijo segun el tipo de fallo.
function motivoDeError(err: unknown): string {
  if (err instanceof ErrorTiempoAgotado) return "Tiempo de espera agotado";
  if (err instanceof ErrorDescargaCortada) return "La descarga se cortó";
  const codigo = (err as NodeJS.ErrnoException | undefined)?.code ?? "";
  if (codigo.startsWith("ERR_TLS") || codigo.startsWith("CERT_") || CODIGOS_CERTIFICADO.has(codigo)) {
    return "Certificado inválido";
  }
  return "No se pudo conectar";
}

type RespuestaCruda = { estado: number; ubicacion: string | null; texto: string; truncado?: true };

// Hace la conexion real, fijada a "ip" (ver comentario de cabecera). No usa fetch()
// porque fetch no permite forzar la IP de conexion sin tambien perder el Host real.
function conectarFijo(
  u: URL,
  ip: string,
  opts: {
    metodo: string;
    cuerpo?: string;
    contentType?: string;
    // Inactividad: se reinicia con cada byte (lo maneja el "timeout" de node:http).
    timeoutMs: number;
    // Plazo TOTAL que le queda a la llamada completa para este salto en particular
    // (descargar() lo recalcula restando lo ya gastado antes de llamar aqui).
    plazoRestanteMs: number;
    maxBytes: number;
  }
): Promise<RespuestaCruda> {
  return new Promise((resolve, reject) => {
    const transportador = u.protocol === "https:" ? https : http;
    const puerto = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
    const familia = net.isIPv6(ip) ? 6 : 4;

    let resuelto = false;
    let agotado = false;
    let truncado = false;
    let recibioRespuesta = false;

    const terminar = (v: RespuestaCruda | Error) => {
      if (resuelto) return;
      resuelto = true;
      clearTimeout(temporizadorTotal);
      if (v instanceof Error) reject(v);
      else resolve(v);
    };

    const req = transportador.request(
      {
        hostname: u.hostname,
        port: puerto,
        path: u.pathname + u.search,
        method: opts.metodo,
        // Sin agente ni keep-alive: cada peticion abre su propia conexion, siempre
        // fijada a la IP validada, y no deja sockets colgados entre llamadas.
        agent: false,
        // No se vuelve a preguntar al DNS: se conecta directo a la IP que ya paso la guardia.
        lookup: (
          _hostname: string,
          opciones: { all?: boolean },
          cb: ((err: NodeJS.ErrnoException | null, address: string, family: number) => void) &
            ((err: NodeJS.ErrnoException | null, addresses: Array<{ address: string; family: number }>) => void)
        ) => {
          if (opciones && opciones.all) {
            (cb as (err: null, addresses: Array<{ address: string; family: number }>) => void)(null, [
              { address: ip, family: familia },
            ]);
          } else {
            (cb as (err: null, address: string, family: number) => void)(null, ip, familia);
          }
        },
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/json;q=0.9,*/*;q=0.5",
          "accept-encoding": "identity",
          ...(opts.contentType ? { "content-type": opts.contentType } : {}),
        },
        // Limite de INACTIVIDAD (sin datos por timeoutMs). No es el plazo total: un
        // servidor que gotea un byte de vez en cuando nunca dispara esto solo.
        timeout: opts.timeoutMs,
      },
      (res) => {
        recibioRespuesta = true;
        const partes: Buffer[] = [];
        let total = 0;
        res.on("data", (chunk: Buffer) => {
          if (total >= opts.maxBytes) {
            // Ya se habia llegado exacto al limite (sin recortar nada todavia) y
            // sigue llegando mas: recien ahora hay algo que de verdad se descarta.
            truncado = true;
            res.destroy();
            return;
          }
          const restante = opts.maxBytes - total;
          if (chunk.length > restante) {
            // Este chunk por si solo se pasa del limite: se guarda solo lo que entra.
            partes.push(chunk.subarray(0, restante));
            total += restante;
            truncado = true;
            res.destroy();
            return;
          }
          partes.push(chunk);
          total += chunk.length;
        });
        // Sin este listener, un error del lado del stream de respuesta (el servidor
        // corta la conexion a medio cuerpo) se relanza y tumba el proceso: la
        // decision real se toma en "close", que siempre llega despues.
        res.on("error", () => {});
        res.on("close", () => {
          if (agotado) return terminar(new ErrorTiempoAgotado());
          const ubicacion = (res.headers.location as string | undefined) ?? null;
          if (truncado || res.complete) {
            // write() sin end() deja afuera cualquier caracter multibyte incompleto
            // al final en vez de convertirlo en U+FFFD: es lo que hace falta cuando
            // maxBytes corta a media secuencia. Pero si la respuesta llego COMPLETA
            // (no truncada), se cierra con end(): un cuerpo real que termine en un
            // byte UTF-8 invalido/incompleto debe verse como tal (U+FFFD), no perderse.
            const d = new StringDecoder("utf8");
            let texto = d.write(Buffer.concat(partes));
            if (!truncado) texto += d.end();
            return terminar(truncado ? { estado: res.statusCode ?? 0, ubicacion, texto, truncado: true } : { estado: res.statusCode ?? 0, ubicacion, texto });
          }
          terminar(new ErrorDescargaCortada());
        });
      }
    );

    const agotarPorTiempo = () => {
      agotado = true;
      req.destroy();
    };
    // Inactividad (Node reinicia este contador solo con cada byte que pasa por el socket).
    req.on("timeout", agotarPorTiempo);
    // Plazo TOTAL de este salto: a diferencia del "timeout" de arriba, este no se
    // reinicia con la actividad, por eso corta a un goteo continuo que nunca calla.
    const temporizadorTotal = setTimeout(agotarPorTiempo, opts.plazoRestanteMs);

    req.on("error", (err) => {
      if (agotado) return terminar(new ErrorTiempoAgotado());
      // Si ya hay respuesta en curso, el "close" del handler de arriba decide: no pisarlo.
      if (!recibioRespuesta) terminar(err);
    });

    if (opts.cuerpo) req.write(opts.cuerpo);
    req.end();
  });
}

export async function descargar(url: string, o: Opciones = {}): Promise<ResultadoDescarga> {
  const maxBytes = o.maxBytes ?? 2 * 1024 * 1024;
  const timeoutMs = o.timeoutMs ?? 10_000; // inactividad, no total
  const plazoTotalMs = o.plazoTotalMs ?? 30_000; // total: DNS + conexion + cuerpo, todos los saltos
  const maxRedir = o.maxRedirecciones ?? 3;
  // Se calcula UNA sola vez para toda la llamada (incluye todos los saltos de
  // redireccion): cada etapa recibe lo que queda, no un plazo nuevo por su cuenta.
  const vence = Date.now() + plazoTotalMs;
  let actual = url;
  let metodoActual = o.metodo ?? "GET";
  let cuerpoActual = o.cuerpo;
  let contentTypeActual = o.contentType;

  for (let salto = 0; salto <= maxRedir; salto++) {
    const restanteParaGuardia = vence - Date.now();
    if (restanteParaGuardia <= 0) return { ok: false, motivo: "Tiempo de espera agotado" };
    const g = await _esSaltoPermitido(actual, o._lookupParaTests, o._confiarEnLookupParaTests, restanteParaGuardia);
    if (!g.ok) return g;

    const restanteParaConexion = vence - Date.now();
    if (restanteParaConexion <= 0) return { ok: false, motivo: "Tiempo de espera agotado" };

    try {
      const r = await conectarFijo(g.url, g.ip, {
        metodo: metodoActual,
        cuerpo: cuerpoActual,
        contentType: contentTypeActual,
        timeoutMs,
        plazoRestanteMs: restanteParaConexion,
        maxBytes,
      });

      if (r.estado >= 300 && r.estado < 400 && r.ubicacion) {
        if (salto === maxRedir) return { ok: false, motivo: "Demasiadas redirecciones" };
        const nuevaUrl = new URL(r.ubicacion, g.url);
        const cambiaOrigen = nuevaUrl.origin !== g.url.origin;
        // 307/308 deben preservar metodo y cuerpo por spec; hacerlo hacia OTRO origen
        // con un metodo no seguro (POST) es justo el patron de un ataque de replay
        // cross-site, asi que ese salto se rechaza en vez de reenviarlo vacio.
        if ((r.estado === 307 || r.estado === 308) && cambiaOrigen && metodoActual === "POST") {
          return { ok: false, motivo: "Redirección no permitida" };
        }
        // 301/302/303 despues de un POST: el navegador (y todo cliente serio) vuelve
        // a pedir por GET, sin cuerpo ni content-type.
        if ((r.estado === 301 || r.estado === 302 || r.estado === 303) && metodoActual === "POST") {
          metodoActual = "GET";
          cuerpoActual = undefined;
          contentTypeActual = undefined;
        }
        // Cambia de origen (esquema, host o puerto): el cuerpo no viaja a un destino
        // distinto al que el llamador autorizo, sin importar el metodo o el codigo.
        if (cambiaOrigen) {
          cuerpoActual = undefined;
          contentTypeActual = undefined;
        }
        actual = nuevaUrl.toString();
        continue;
      }

      return {
        ok: true,
        estado: r.estado,
        urlFinal: g.url.toString(),
        texto: r.texto,
        ...(r.truncado ? { truncado: true as const } : {}),
      };
    } catch (err) {
      return { ok: false, motivo: motivoDeError(err) };
    }
  }
  return { ok: false, motivo: "Demasiadas redirecciones" };
}
