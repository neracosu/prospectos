import { describe, it, expect, afterEach, vi } from "vitest";
import { enviarCorreo, _transporteParaTests } from "@/lib/correo-envio";

const base = { para: "cliente@ejemplo.test", asunto: "Propuesta", html: "<p>Hola</p>", texto: "Hola" };

describe("enviarCorreo", () => {
  afterEach(() => { _transporteParaTests(null); vi.unstubAllEnvs(); });

  it("arma el mensaje con remitente, reply-to, envelope, html, texto y adjunto, y devuelve el id del transporte", async () => {
    let o: Record<string, any> = {};
    _transporteParaTests({ sendMail: async (x) => { o = x; return { messageId: "<abc@neracosu.com>" }; } });
    const r = await enviarCorreo({ ...base, adjunto: { nombre: "Propuesta.pdf", ruta: "/tmp/p.pdf" } });
    expect(r).toEqual({ ok: true, id: "<abc@neracosu.com>" });
    expect(o.to).toBe("cliente@ejemplo.test");
    expect(String(o.from)).toContain("info@neracosu.com");
    expect(String(o.replyTo)).toContain("info@neracosu.com");
    expect(o.envelope.from).toBe("info@neracosu.com");
    expect(o.envelope.to).toBe("cliente@ejemplo.test");
    expect(o.html).toBe("<p>Hola</p>");
    expect(o.text).toBe("Hola");
    expect(o.attachments[0].filename).toBe("Propuesta.pdf");
    expect(o.attachments[0].path).toBe("/tmp/p.pdf");
  });

  it("sin adjunto no manda attachments; un fallo del transporte vuelve como error", async () => {
    _transporteParaTests({ sendMail: async (x) => { expect(x.attachments).toBeUndefined(); throw new Error("boom"); } });
    expect(await enviarCorreo(base)).toEqual({ ok: false, error: "boom" });
  });

  it("fuera de produccion sin transporte de tests ni simulado: no manda y lo dice", async () => {
    _transporteParaTests(null);
    vi.stubEnv("PROSPECTOS_CORREO_SIMULADO", "");
    expect(await enviarCorreo(base)).toEqual({ ok: false, error: "fuera de produccion" });
  });

  it("con PROSPECTOS_CORREO_SIMULADO=1 devuelve simulado", async () => {
    vi.stubEnv("PROSPECTOS_CORREO_SIMULADO", "1");
    expect(await enviarCorreo(base)).toEqual({ ok: true, id: "simulado" });
  });
});
