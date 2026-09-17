import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { esUrlPermitida, descargar, _esSaltoPermitido } from "@/lib/red-segura";

let servidor: http.Server;
let puerto = 0;
let temporizadorLento: NodeJS.Timeout | null = null;
let ultimaFinal: { metodo: string; longitudCuerpo: number } | null = null;

// Espera "ms" sin retener el proceso vivo si nadie mas lo necesita (para no demorar
// la salida de vitest cuando el timer sobrevive a la promesa que lo usa, p.ej. un
// resolvedor de prueba que se abandona porque ya vencio el plazo total).
function esperar(ms: number): Promise<void> {
  return new Promise((r) => {
    const t = setTimeout(r, ms);
    t.unref?.();
  });
}

beforeAll(async () => {
  servidor = http.createServer((req, res) => {
    if (req.url === "/redir") {
      res.writeHead(302, { Location: "/final" });
      return res.end();
    }
    if (req.url === "/bucle") {
      res.writeHead(302, { Location: "/bucle" });
      return res.end();
    }
    if (req.url === "/grande") {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end("x".repeat(3 * 1024 * 1024));
    }
    if (req.url === "/lento") {
      temporizadorLento = setTimeout(() => {
        res.writeHead(200);
        res.end("tarde");
      }, 3000);
      return;
    }
    if (req.url === "/privado") {
      res.writeHead(302, { Location: "http://127.0.0.1:" + puerto + "/final" });
      return res.end();
    }
    if (req.url === "/redir-datos") {
      res.writeHead(302, { Location: "data:text/html,x" });
      return res.end();
    }
    if (req.url === "/redir-archivo") {
      res.writeHead(302, { Location: "file:///etc/passwd" });
      return res.end();
    }
    if (req.url === "/redir307-otro-origen") {
      res.writeHead(307, { Location: "http://otro-host.ejemplo.test:1/z" });
      return res.end();
    }
    if (req.url === "/redir307-mismo-origen") {
      res.writeHead(307, { Location: "/final" });
      return res.end();
    }
    // Cadena de 4 redirecciones distintas (no un bucle): sirve para probar que el
    // conteo de saltos es exacto y no solo que un bucle infinito siempre lo agota.
    if (req.url && /^\/r[1-4]$/.test(req.url)) {
      const n = Number(req.url.slice(2));
      res.writeHead(302, { Location: "/r" + (n + 1) });
      return res.end();
    }
    // Igual que /r[1-4] pero cada salto tarda 400ms: sirve para el plazo TOTAL.
    if (req.url && /^\/d[1-4]$/.test(req.url)) {
      const n = Number(req.url.slice(2));
      const t = setTimeout(() => {
        res.writeHead(302, { Location: "/d" + (n + 1) });
        res.end();
      }, 400);
      res.on("close", () => clearTimeout(t));
      return;
    }
    if (req.url === "/goteo") {
      const iv = setInterval(() => res.write("x"), 100);
      res.on("close", () => clearInterval(iv));
      return;
    }
    if (req.url === "/lento-continuo") {
      // 20 chunks de 100ms = 2s en total, pero nunca calla mas de 100ms seguidos.
      let n = 0;
      const iv = setInterval(() => {
        n++;
        res.write("x");
        if (n >= 20) {
          clearInterval(iv);
          res.end();
        }
      }, 100);
      res.on("close", () => clearInterval(iv));
      return;
    }
    if (req.url === "/silencio") {
      // Escribe una vez y despues nunca mas: sirve para el timeout de INACTIVIDAD puro.
      res.writeHead(200);
      res.write("x");
      return;
    }
    if (req.url === "/multibyte") {
      // El corte a maxBytes:1000 cae justo a la mitad de "é" (2 bytes UTF-8): el byte
      // 1000 es el primero de esos dos. No debe colar un caracter de reemplazo (U+FFFD).
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      return res.end("a".repeat(999) + "é" + "b".repeat(50));
    }
    if (req.url === "/incompleta-utf8") {
      // Respuesta COMPLETA (no truncada por maxBytes) cuyo ultimo byte es el inicio
      // invalido/incompleto de un caracter multibyte: a diferencia de /multibyte, aqui
      // SI debe verse el caracter de reemplazo, porque el cuerpo real termina asi.
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
      return res.end(Buffer.concat([Buffer.from("hola "), Buffer.from([0xc3])]));
    }
    if (req.url === "/exacto100") {
      res.writeHead(200, { "content-type": "text/plain" });
      return res.end("x".repeat(100));
    }
    if (req.url === "/cortada") {
      res.writeHead(200, { "content-length": "1000" });
      res.write("x".repeat(100));
      // Un pelin de demora: si se destruye en el mismo tick, el cliente ni llega a
      // recibir la respuesta (se cae como error de conexion en vez de "cortada").
      setTimeout(() => res.socket?.destroy(), 20);
      return;
    }
    if (req.url === "/final") {
      let datos = "";
      req.on("data", (c) => (datos += c));
      req.on("end", () => {
        ultimaFinal = { metodo: req.method ?? "", longitudCuerpo: datos.length };
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end("<html>hola /final</html>");
      });
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("<html>hola " + req.url + "</html>");
  });
  await new Promise<void>((r) =>
    servidor.listen(0, "127.0.0.1", () => {
      puerto = (servidor.address() as { port: number }).port;
      r();
    })
  );
});

afterAll(() => {
  if (temporizadorLento) clearTimeout(temporizadorLento);
  return new Promise<void>((r) => servidor.close(() => r()));
});

// Confiamos en el resolvedor de pruebas (bandera explicita): sin ella, la guardia
// valida la IP resuelta igual que si viniera de DNS real, y 127.0.0.1 es privada.
const publica = { _lookupParaTests: async () => "127.0.0.1", _confiarEnLookupParaTests: true };
const url = (p: string) => `http://ejemplo.test:${puerto}${p}`;

describe("esUrlPermitida", () => {
  it("rechaza esquemas raros, localhost y privadas", async () => {
    for (const u of [
      "ftp://x.com/",
      "file:///etc/passwd",
      "http://localhost/",
      "http://127.0.0.1/",
      "http://10.0.0.1/",
      "http://192.168.1.1/",
      "http://169.254.169.254/",
      "http://intranet/",
    ]) {
      const r = await esUrlPermitida(u);
      expect(r.ok, u).toBe(false);
    }
  });

  it("rechaza nombres bloqueados por forma aunque el DNS pudiera decir otra cosa", async () => {
    for (const u of ["http://algo.localhost/", "http://impresora.local/", "http://svc.internal/", "http://0.0.0.0/"]) {
      const r = await esUrlPermitida(u);
      expect(r.ok, u).toBe(false);
    }
  });

  it("un punto final en el nombre no evita el bloqueo por forma, aunque el DNS diga que es publica", async () => {
    // Sin inyectar un resolvedor "publico" de por medio, este caso pasaria igual por
    // simple falla de DNS real (ENOTFOUND en ".localhost."), lo que no probaria nada:
    // por eso se fuerza una IP publica (8.8.8.8) y confianza total en ella, para que
    // el unico motivo posible de rechazo sea el bloqueo por FORMA del nombre.
    const r = await esUrlPermitida("http://algo.localhost./", async () => "8.8.8.8", true);
    expect(r).toEqual({ ok: false, motivo: "Dirección privada o local no permitida" });
  });

  it("rechaza IPv4 disfrazadas (decimal, hex, octal, forma corta) y rangos reservados/benchmarking", async () => {
    for (const u of [
      "http://2130706433/", // 127.0.0.1 en decimal
      "http://0x7f000001/", // 127.0.0.1 en hex
      "http://0177.0.0.1/", // 127.0.0.1 con el primer octeto en octal
      "http://0x7f.1/", // 127.0.0.1 en forma corta+hex
      "http://127.1/", // forma corta de 127.0.0.1
      "http://172.16.0.1/",
      "http://100.64.0.1/",
      "http://224.0.0.1/", // multicast
      "http://255.255.255.255/", // broadcast (240/4)
      "http://192.0.0.1/", // asignaciones IETF
      "http://198.18.0.1/", // benchmarking
    ]) {
      const r = await esUrlPermitida(u);
      expect(r.ok, u).toBe(false);
    }
  });

  it("rechaza rangos TEST-NET, relay anycast 6to4 y site-local IPv6 (obsoleto)", async () => {
    for (const u of [
      "http://192.0.2.1/", // TEST-NET-1
      "http://198.51.100.1/", // TEST-NET-2
      "http://203.0.113.1/", // TEST-NET-3
      "http://192.88.99.1/", // relay anycast 6to4 (obsoleto)
      "http://[fec0::1]/", // site-local (obsoleto), fec0::/10
    ]) {
      const r = await esUrlPermitida(u);
      expect(r.ok, u).toBe(false);
    }
  });

  it("rechaza IPv6 loopback, ULA, link-local, v4-mapeada, NAT64 y 6to4", async () => {
    for (const u of [
      "http://[::1]/",
      "http://[0::1]/", // forma alterna de ::1
      "http://[fd00::1]/",
      "http://[fe80::1]/",
      "http://[febf::1]/", // borde superior de fe80::/10
      "http://[::ffff:127.0.0.1]/",
      "http://[0:0:0:0:0:ffff:127.0.0.1]/", // misma IP mapeada, forma expandida
      "http://[64:ff9b::1]/", // NAT64
      "http://[2002::1]/", // 6to4
    ]) {
      const r = await esUrlPermitida(u);
      expect(r.ok, u).toBe(false);
    }
  });

  it("fuera de la lista blanca de pruebas (produccion, o NODE_ENV sin definir) se ignora el resolvedor inyectado", async () => {
    const entorno = process.env as Record<string, string | undefined>;
    const previoNodeEnv = entorno.NODE_ENV;
    const previoTestDb = entorno.PROSPECTOS_TEST_DB;
    delete entorno.PROSPECTOS_TEST_DB;
    try {
      for (const valor of ["production", undefined] as const) {
        if (valor === undefined) delete entorno.NODE_ENV;
        else entorno.NODE_ENV = valor;
        const r = await esUrlPermitida("http://ejemplo.test/x", async () => "127.0.0.1", true);
        expect(r.ok, String(valor)).toBe(false);
      }
      // Produccion "protegida": ni siquiera PROSPECTOS_TEST_DB=1 puesto por error alcanza.
      entorno.NODE_ENV = "production";
      entorno.PROSPECTOS_TEST_DB = "1";
      const rProdConFlag = await esUrlPermitida("http://ejemplo.test/x", async () => "127.0.0.1", true);
      expect(rProdConFlag.ok).toBe(false);
    } finally {
      if (previoNodeEnv === undefined) delete entorno.NODE_ENV;
      else entorno.NODE_ENV = previoNodeEnv;
      if (previoTestDb === undefined) delete entorno.PROSPECTOS_TEST_DB;
      else entorno.PROSPECTOS_TEST_DB = previoTestDb;
    }
  });

  it("sin la bandera de confianza, la IP que da el resolvedor de pruebas se valida igual que el DNS real", async () => {
    const r = await esUrlPermitida("http://ejemplo.test/x", async () => "127.0.0.1");
    expect(r.ok).toBe(false);
  });
});

describe("_esSaltoPermitido", () => {
  it("es la misma guardia que se corre en cada salto de una redireccion", async () => {
    const r = await _esSaltoPermitido("http://127.0.0.1:1/x");
    expect(r.ok).toBe(false);
  });
});

describe("descargar", () => {
  it("baja una pagina publica (con resolvedor inyectado) y sigue una redireccion relativa", async () => {
    const r = await descargar(url("/redir"), { ...publica });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.texto).toContain("hola /final");
      expect(r.urlFinal).toBe(url("/final"));
    }
  });

  it("corta a maxBytes (marcando truncado, sin partir un caracter multibyte), corta por inactividad y corta los bucles de redireccion", async () => {
    const g = await descargar(url("/grande"), { ...publica, maxBytes: 1024 });
    expect(g.ok && g.texto.length <= 1024).toBe(true);
    expect(g.ok && g.truncado).toBe(true);

    const l = await descargar(url("/lento"), { ...publica, timeoutMs: 500 });
    expect(l).toEqual({ ok: false, motivo: "Tiempo de espera agotado" });

    const b = await descargar(url("/bucle"), { ...publica });
    expect(b).toEqual({ ok: false, motivo: expect.stringContaining("redirecciones") });
  });

  it("un corte por maxBytes a mitad de un caracter UTF-8 no deja un U+FFFD colgado", async () => {
    const r = await descargar(url("/multibyte"), { ...publica, maxBytes: 1000 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.truncado).toBe(true);
      expect(r.texto).toBe("a".repeat(999));
      expect(r.texto).not.toContain("�");
    }
  });

  it("una respuesta COMPLETA que termina en un byte UTF-8 invalido SI muestra el caracter de reemplazo", async () => {
    // A diferencia del corte por maxBytes (arriba), aqui no hay ningun limite de por
    // medio: el cuerpo real llega entero y termina en un byte invalido, asi que debe
    // decodificarse como lo haria cualquier lector de UTF-8 (con U+FFFD al final).
    const r = await descargar(url("/incompleta-utf8"), { ...publica });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.truncado).toBeUndefined();
      expect(r.texto.endsWith("�")).toBe(true);
    }
  });

  it("un cuerpo de exactamente maxBytes bytes, completo, no se marca truncado", async () => {
    const r = await descargar(url("/exacto100"), { ...publica, maxBytes: 100 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.texto.length).toBe(100);
      expect(r.truncado).toBeUndefined();
    }
  });

  it("una conexion cortada a medio cuerpo no se reporta como exitosa", async () => {
    const r = await descargar(url("/cortada"), { ...publica });
    expect(r).toEqual({ ok: false, motivo: "La descarga se cortó" });
  });

  it("un puerto cerrado nunca expone el mensaje ni la IP/puerto crudos de Node", async () => {
    const r = await descargar(`http://ejemplo.test:9/`, { ...publica, timeoutMs: 2000 });
    expect(r).toEqual({ ok: false, motivo: "No se pudo conectar" });
  });

  it("cuenta las redirecciones exactas, no solo detecta el bucle infinito", async () => {
    const r = await descargar(url("/r1"), { ...publica });
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining("redirecciones") });
  });

  it("una redireccion a un esquema no-http (data:/file:) se rechaza en el siguiente salto", async () => {
    const d = await descargar(url("/redir-datos"), { ...publica });
    expect(d.ok).toBe(false);
    const f = await descargar(url("/redir-archivo"), { ...publica });
    expect(f.ok).toBe(false);
  });

  it("un 307 hacia otro origen con POST se rechaza en vez de reenviar el cuerpo (o vaciarlo)", async () => {
    const r = await descargar(url("/redir307-otro-origen"), {
      ...publica,
      metodo: "POST",
      cuerpo: "x=1",
      contentType: "text/plain",
    });
    expect(r).toEqual({ ok: false, motivo: "Redirección no permitida" });
  });

  it("un 307 dentro del mismo origen SI preserva metodo y cuerpo", async () => {
    ultimaFinal = null;
    const r = await descargar(url("/redir307-mismo-origen"), {
      ...publica,
      metodo: "POST",
      cuerpo: "campo=1",
      contentType: "text/plain",
    });
    expect(r.ok).toBe(true);
    expect(ultimaFinal).toEqual({ metodo: "POST", longitudCuerpo: 7 });
  });

  it("una redireccion hacia una IP privada se rechaza aunque el origen sea publico", async () => {
    // El primer salto pasa la guardia gracias al resolvedor de pruebas de siempre
    // (publica, sin pisarlo), pero /privado redirige a un literal "http://127.0.0.1:.../final":
    // ese segundo salto es una IP literal, asi que la guardia lo revisa directo, sin
    // pasar nunca por el resolvedor inyectado (los literales de IP nunca lo usan).
    // Determinista: no depende de si el entorno tiene salida real a internet.
    const r = await descargar(url("/privado"), { ...publica });
    expect(r).toEqual({ ok: false, motivo: "Dirección privada o local no permitida" });
  });

  it("sin resolvedor inyectado, un host que resuelve a 127.0.0.1 se rechaza", async () => {
    const r = await descargar(`http://127.0.0.1:${puerto}/final`);
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining("privada") });
  });

  it("un POST que sigue una redireccion 302 llega al destino como GET sin cuerpo", async () => {
    ultimaFinal = null;
    const r = await descargar(url("/redir"), {
      ...publica,
      metodo: "POST",
      cuerpo: "campo=1",
      contentType: "application/x-www-form-urlencoded",
    });
    expect(r.ok).toBe(true);
    expect(ultimaFinal).toEqual({ metodo: "GET", longitudCuerpo: 0 });
  });
});

describe("plazo TOTAL vs. inactividad (no deben confundirse)", () => {
  it("(a) una cadena de saltos de 400ms cada uno agota el plazo TOTAL en vez de completarse", async () => {
    const inicio = Date.now();
    const r = await descargar(url("/d1"), { ...publica, plazoTotalMs: 600 });
    const transcurrido = Date.now() - inicio;
    expect(r).toEqual({ ok: false, motivo: "Tiempo de espera agotado" });
    expect(transcurrido).toBeLessThan(1000);
  });

  it("(b) una resolucion DNS lenta tambien cuenta contra el plazo TOTAL", async () => {
    const inicio = Date.now();
    const r = await descargar(url("/final"), {
      _lookupParaTests: async () => {
        await esperar(2500);
        return "127.0.0.1";
      },
      _confiarEnLookupParaTests: true,
      plazoTotalMs: 200,
    });
    const transcurrido = Date.now() - inicio;
    expect(r).toEqual({ ok: false, motivo: "Tiempo de espera agotado" });
    expect(transcurrido).toBeLessThan(500);
  });

  it("(c) REGRESION: una descarga lenta pero CONTINUA no se corta si el timeout es de inactividad", async () => {
    const r = await descargar(url("/lento-continuo"), { ...publica, timeoutMs: 500, plazoTotalMs: 10_000 });
    expect(r.ok).toBe(true);
  });

  it("(d) un silencio mayor al timeoutMs de inactividad corta aunque sobre plazo total", async () => {
    const inicio = Date.now();
    const r = await descargar(url("/silencio"), { ...publica, timeoutMs: 300, plazoTotalMs: 5000 });
    const transcurrido = Date.now() - inicio;
    expect(r).toEqual({ ok: false, motivo: "Tiempo de espera agotado" });
    expect(transcurrido).toBeLessThan(1000);
  });
});
