import { describe, it, expect } from "vitest";
import { serializarEnvio, leerEnvio, VIGENCIA_ENVIO_MS, CLAVE_ENVIO_PENDIENTE } from "@/lib/envio-pendiente-contrato";

const AHORA = 1_800_000_000_000;

describe("envio pendiente de confirmar", () => {
  it("va y vuelve", () => {
    const e = { prospectoId: 7, canal: "whatsapp" as const, en: AHORA - 5000 };
    expect(leerEnvio(serializarEnvio(e), AHORA)).toEqual(e);
  });
  it("la clave lleva el prefijo del panel", () => {
    expect(CLAVE_ENVIO_PENDIENTE.startsWith("pr:")).toBe(true);
  });
  it("sin nada guardado no hay pendiente", () => {
    expect(leerEnvio(null, AHORA)).toBeNull();
    expect(leerEnvio("", AHORA)).toBeNull();
  });
  it("vence a los 30 minutos", () => {
    const justo = { prospectoId: 7, canal: "sms" as const, en: AHORA - VIGENCIA_ENVIO_MS };
    expect(leerEnvio(serializarEnvio({ ...justo, en: justo.en + 1 }), AHORA)).not.toBeNull();
    expect(leerEnvio(serializarEnvio(justo), AHORA)).toBeNull();
  });
  it("una marca del futuro (reloj movido) no vale", () => {
    expect(leerEnvio(serializarEnvio({ prospectoId: 7, canal: "whatsapp", en: AHORA + 60_000 }), AHORA)).toBeNull();
  });
  it("JSON roto, forma incompleta, id invalido o canal inventado dan null", () => {
    expect(leerEnvio("{", AHORA)).toBeNull();
    expect(leerEnvio("null", AHORA)).toBeNull();
    expect(leerEnvio("[1,2]", AHORA)).toBeNull();
    expect(leerEnvio(JSON.stringify({ prospectoId: 7, canal: "whatsapp" }), AHORA)).toBeNull();
    expect(leerEnvio(JSON.stringify({ prospectoId: 0, canal: "whatsapp", en: AHORA }), AHORA)).toBeNull();
    expect(leerEnvio(JSON.stringify({ prospectoId: 1.5, canal: "whatsapp", en: AHORA }), AHORA)).toBeNull();
    expect(leerEnvio(JSON.stringify({ prospectoId: "7", canal: "whatsapp", en: AHORA }), AHORA)).toBeNull();
    expect(leerEnvio(JSON.stringify({ prospectoId: 7, canal: "paloma", en: AHORA }), AHORA)).toBeNull();
  });
});
