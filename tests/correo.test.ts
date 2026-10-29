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
});
