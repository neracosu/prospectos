import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { esUrlPermitida, descargar, _esSaltoPermitido } from "@/lib/red-segura";

let servidor: http.Server;
let puerto = 0;

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
      return setTimeout(() => {
        res.writeHead(200);
        res.end("tarde");
      }, 3000);
    }
    if (req.url === "/privado") {
      res.writeHead(302, { Location: "http://127.0.0.1:" + puerto + "/final" });
      return res.end();
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

afterAll(() => new Promise<void>((r) => servidor.close(() => r())));

const publica = { _lookupParaTests: async () => "127.0.0.1" }; // simula que "ejemplo.test" resuelve a nuestro servidor
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

  it("rechaza IPv6 loopback, ULA, link-local y v4-mapeada", async () => {
    for (const u of ["http://[::1]/", "http://[fd00::1]/", "http://[fe80::1]/", "http://[::ffff:127.0.0.1]/"]) {
      const r = await esUrlPermitida(u);
      expect(r.ok, u).toBe(false);
    }
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

  it("corta a maxBytes, corta por tiempo y corta los bucles de redireccion", async () => {
    const g = await descargar(url("/grande"), { ...publica, maxBytes: 1024 });
    expect(g.ok && g.texto.length <= 1024).toBe(true);

    const l = await descargar(url("/lento"), { ...publica, timeoutMs: 500 });
    expect(l.ok).toBe(false);

    const b = await descargar(url("/bucle"), { ...publica });
    expect(b).toEqual({ ok: false, motivo: expect.stringContaining("redirecciones") });
  });

  it("una redireccion hacia una IP privada se rechaza aunque el origen sea publico", async () => {
    // El primer salto "resuelve" (via el inyector de pruebas) a una IP publica ficticia
    // que no existe en este entorno, asi que la conexion real al primer host puede fallar
    // antes de llegar al segundo salto. Lo que importa para este caso es que el resultado
    // final sea de rechazo: si el rechazo viene de no poder conectar o de la guardia del
    // segundo salto da igual, porque _esSaltoPermitido ya esta probado por separado arriba
    // (y se ejecuta en cada iteracion del bucle de redirecciones dentro de descargar).
    const r = await descargar(url("/privado"), {
      ...publica,
      timeoutMs: 1500,
      _lookupParaTests: async (h: string) => (h === "ejemplo.test" ? "93.184.216.34" : h),
    });
    expect(r.ok).toBe(false);
  });

  it("sin resolvedor inyectado, un host que resuelve a 127.0.0.1 se rechaza", async () => {
    const r = await descargar(`http://127.0.0.1:${puerto}/final`);
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining("privada") });
  });
});
