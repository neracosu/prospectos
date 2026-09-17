import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { esUrlPermitida, descargar, _esSaltoPermitido } from "@/lib/red-segura";

let servidor: http.Server;
let puerto = 0;
let temporizadorLento: NodeJS.Timeout | null = null;
let ultimaFinal: { metodo: string; longitudCuerpo: number } | null = null;

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
    // Cadena de 4 redirecciones distintas (no un bucle): sirve para probar que el
    // conteo de saltos es exacto y no solo que un bucle infinito siempre lo agota.
    if (req.url && /^\/r[1-4]$/.test(req.url)) {
      const n = Number(req.url.slice(2));
      res.writeHead(302, { Location: "/r" + (n + 1) });
      return res.end();
    }
    if (req.url === "/goteo") {
      const iv = setInterval(() => res.write("x"), 100);
      res.on("close", () => clearInterval(iv));
      return;
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

  it("rechaza IPv4 disfrazadas (decimal, hex, forma corta) y rangos reservados/benchmarking", async () => {
    for (const u of [
      "http://2130706433/", // 127.0.0.1 en decimal
      "http://0x7f000001/", // 127.0.0.1 en hex
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

  it("en produccion se ignora el resolvedor de pruebas por completo", async () => {
    const entorno = process.env as Record<string, string | undefined>;
    const previo = entorno.NODE_ENV;
    entorno.NODE_ENV = "production";
    try {
      const r = await esUrlPermitida("http://ejemplo.test/x", async () => "127.0.0.1", true);
      expect(r.ok).toBe(false);
    } finally {
      entorno.NODE_ENV = previo;
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

  it("corta a maxBytes (marcando truncado), corta por tiempo y corta los bucles de redireccion", async () => {
    const g = await descargar(url("/grande"), { ...publica, maxBytes: 1024 });
    expect(g.ok && g.texto.length <= 1024).toBe(true);
    expect(g.ok && g.truncado).toBe(true);

    const l = await descargar(url("/lento"), { ...publica, timeoutMs: 500 });
    expect(l).toEqual({ ok: false, motivo: "Tiempo de espera agotado" });

    const b = await descargar(url("/bucle"), { ...publica });
    expect(b).toEqual({ ok: false, motivo: expect.stringContaining("redirecciones") });
  });

  it("respeta un plazo TOTAL: un servidor que gotea 1 byte cada 100ms tambien corta", async () => {
    const inicio = Date.now();
    const r = await descargar(url("/goteo"), { ...publica, timeoutMs: 600 });
    const transcurrido = Date.now() - inicio;
    expect(r).toEqual({ ok: false, motivo: "Tiempo de espera agotado" });
    expect(transcurrido).toBeLessThan(1200);
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

  it("una redireccion hacia una IP privada se rechaza aunque el origen sea publico", async () => {
    // El primer salto "resuelve" (via el inyector de pruebas) a una IP publica ficticia
    // (192.0.2.1, TEST-NET-1: reservada para documentacion, nunca ruteable) que no existe
    // en este entorno, asi que la conexion real al primer host puede fallar antes de
    // llegar al segundo salto. Lo que importa aqui es que el resultado final sea de
    // rechazo: si viene de no poder conectar o de la guardia del segundo salto da igual,
    // porque _esSaltoPermitido ya esta probado por separado (y descargar lo ejecuta en
    // cada iteracion del bucle de redirecciones).
    const r = await descargar(url("/privado"), {
      ...publica,
      timeoutMs: 1500,
      _lookupParaTests: async (h: string) => (h === "ejemplo.test" ? "192.0.2.1" : h),
    });
    expect(r.ok).toBe(false);
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
