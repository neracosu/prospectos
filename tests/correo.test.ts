import { describe, it, expect } from "vitest";
import { armarCorreo, limpiarCabecera } from "@/lib/correo";

const d = { nombre: "José Núñez", correo: "jose@posada.com", whatsapp: "+58 412-123.4567", tipo: "Software a Medida", presupuesto: "", mensaje: "Hola\nNecesito un sistema", pagina: "/para/hoteles.html", sesion: "", respuestas: "", calificacion: "" as const, origen: "" };

describe("armarCorreo", () => {
  it("lleva Reply-To del visitante, asunto codificado y enlace a WhatsApp", () => {
    const m = armarCorreo(d);
    expect(m).toMatch(/^From: Web NERACOSU <info@neracosu.com>\n/);
    expect(m).toContain("Reply-To: jose@posada.com\n");
    expect(m).toMatch(/Subject: =\?UTF-8\?B\?/);
    expect(m).toContain("https://wa.me/584121234567");
    expect(m).toContain("Hola\nNecesito un sistema");
    expect(m).not.toContain("Presupuesto:");
  });
  it("un nombre con salto de linea no agrega cabeceras", () => {
    const m = armarCorreo({ ...d, nombre: "X\nBcc: victima@x.com", correo: "" });
    const cabeceras = m.split("\n\n")[0];
    expect(cabeceras).not.toMatch(/^Bcc:/m);
    expect(cabeceras).not.toContain("Reply-To");
    expect(limpiarCabecera("a\r\nb")).toBe("a b");
  });
  it("una solicitud de embudo lleva asunto propio, las respuestas y la calificacion", () => {
    const m = armarCorreo({ ...d, tipo: "embudo", mensaje: "Embudo /empezar", respuestas: '{"rubro":"hoteles","actual":"manual","objetivo":"cobros","tamano":"1","sistema":"hoteles"}', calificacion: "demo", origen: "tiktok" });
    // El nombre lleva acentos, asi que el asunto va en base64: se decodifica para leerlo.
    const asunto = /Subject: =\?UTF-8\?B\?([^?]+)\?=/.exec(m)!;
    expect(Buffer.from(asunto[1], "base64").toString("utf8")).toBe("Embudo /empezar: José Núñez (demo)");
    expect(m).toContain("Rubro: hoteles");
    expect(m).toContain("Califica para: demostracion con su marca");
    expect(m).toContain("Llego desde: TikTok");
  });
  it("sin calificacion ni origen no agrega lineas vacias", () => {
    const m = armarCorreo({ ...d, respuestas: "", calificacion: "", origen: "" });
    expect(m).not.toContain("Califica para");
    expect(m).not.toContain("Llego desde");
  });
});
