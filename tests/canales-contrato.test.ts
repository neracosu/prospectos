import { describe, it, expect } from "vitest";
import { canalesDisponibles, prioridadContacto, type ContactoProspecto } from "@/lib/canales-contrato";

const vacio: ContactoProspecto = { whatsapp: "", telefono: "", email: "", instagram: "", facebook: "", tiktok: "" };
const msj = "Hola & adiós";

describe("canalesDisponibles", () => {
  it("con WhatsApp: wa.me primero, con el mensaje codificado", () => {
    const c = canalesDisponibles({ ...vacio, whatsapp: "584123229005", email: "a@b.co" }, msj, "Propuesta");
    expect(c[0]).toEqual({ canal: "whatsapp", etiqueta: "Enviar por WhatsApp", href: "https://wa.me/584123229005?text=Hola%20%26%20adi%C3%B3s", modo: "abrir" });
    expect(c.map((x) => x.canal)).toEqual(["whatsapp", "sms", "llamada", "email"]);
  });
  it("SMS y llamada salen del mismo celular; email lleva asunto", () => {
    const c = canalesDisponibles({ ...vacio, whatsapp: "584123229005", email: "a@b.co" }, msj, "Propuesta");
    expect(c.find((x) => x.canal === "sms")?.href).toBe("sms:+584123229005?body=Hola%20%26%20adi%C3%B3s");
    expect(c.find((x) => x.canal === "llamada")?.href).toBe("tel:+584123229005");
    expect(c.find((x) => x.canal === "email")?.href).toBe("mailto:a@b.co?subject=Propuesta&body=Hola%20%26%20adi%C3%B3s");
  });
  it("un fijo permite llamar pero no WhatsApp ni SMS", () => {
    const c = canalesDisponibles({ ...vacio, telefono: "0212-793-0708" }, msj);
    expect(c.map((x) => x.canal)).toEqual(["llamada"]);
    expect(c[0].href).toBe("tel:02127930708");
  });
  it("redes: copiar y abrir el perfil", () => {
    const c = canalesDisponibles({ ...vacio, instagram: "https://www.instagram.com/hotelyare/" }, msj);
    expect(c).toEqual([{ canal: "instagram", etiqueta: "Copiar y abrir Instagram", href: "https://www.instagram.com/hotelyare/", modo: "copiar_y_abrir" }]);
  });
  it("sin nada: lista vacia", () => {
    expect(canalesDisponibles(vacio, msj)).toEqual([]);
  });
});

describe("prioridadContacto", () => {
  it("ordena WhatsApp < telefono/email < redes < nada", () => {
    expect(prioridadContacto({ ...vacio, whatsapp: "584123229005" })).toBe(0);
    expect(prioridadContacto({ ...vacio, email: "a@b.co" })).toBe(1);
    expect(prioridadContacto({ ...vacio, telefono: "0212-1" })).toBe(1);
    expect(prioridadContacto({ ...vacio, tiktok: "https://www.tiktok.com/@x" })).toBe(2);
    expect(prioridadContacto(vacio)).toBe(3);
  });
});
