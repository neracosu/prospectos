import { describe, it, expect, afterEach } from "vitest";
import { dominioRecibeCorreo, dominioDe, _resolvedorParaTests, _vaciarCacheDominios } from "@/lib/correo-dominio";

const err = (code: string) => Object.assign(new Error(code), { code });

describe("correo-dominio: ¿el dominio recibe correo?", () => {
  afterEach(() => { _resolvedorParaTests(null); _vaciarCacheDominios(); });
  it("dominioDe", () => {
    expect(dominioDe("Info@Hotel.Test")).toBe("hotel.test");
    expect(dominioDe("sin-arroba")).toBe("");
  });
  it("con MX es si; sin MX pero con A es si; sin nada es no", async () => {
    _resolvedorParaTests({ mx: async () => 2, a: async () => 0 });
    expect(await dominioRecibeCorreo("a@conmx.test")).toBe("si");
    _resolvedorParaTests({ mx: async () => { throw err("ENODATA"); }, a: async () => 1 });
    expect(await dominioRecibeCorreo("a@soloa.test")).toBe("si");
    _resolvedorParaTests({ mx: async () => { throw err("ENOTFOUND"); }, a: async () => { throw err("ENOTFOUND"); } });
    expect(await dominioRecibeCorreo("a@muerto.test")).toBe("no");
  });
  it("un DNS caido o lento es duda, no un no", async () => {
    _resolvedorParaTests({ mx: async () => { throw err("ETIMEOUT"); }, a: async () => { throw err("ESERVFAIL"); } });
    expect(await dominioRecibeCorreo("a@lento.test")).toBe("duda");
  });
  it("cache por dominio: la segunda consulta no vuelve al DNS", async () => {
    let llamadas = 0;
    _resolvedorParaTests({ mx: async () => { llamadas++; return 1; }, a: async () => 0 });
    await dominioRecibeCorreo("a@uno.test"); await dominioRecibeCorreo("b@uno.test");
    expect(llamadas).toBe(1);
  });
  it("un correo sin dominio con punto es no", async () => {
    expect(await dominioRecibeCorreo("a@localhost")).toBe("no");
  });
});
