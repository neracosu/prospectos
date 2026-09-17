import { describe, it, expect } from "vitest";
import { serializarEnvio, leerEnvio, VIGENCIA_ENVIO_MS, CLAVE_ENVIO_PENDIENTE } from "@/lib/envio-pendiente-contrato";

const AHORA = 1_800_000_000_000;

describe("envio pendiente de confirmar", () => {
  it("va y vuelve", () => {
    const e = { prospectoId: 7, canal: "whatsapp" as const, accion: "envio" as const, en: AHORA - 5000 };
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
    const justo = { prospectoId: 7, canal: "sms" as const, accion: "seguimiento" as const, en: AHORA - VIGENCIA_ENVIO_MS };
    expect(leerEnvio(serializarEnvio({ ...justo, en: justo.en + 1 }), AHORA)).not.toBeNull();
    expect(leerEnvio(serializarEnvio(justo), AHORA)).toBeNull();
  });
  it("una marca del futuro (reloj movido) no vale", () => {
    expect(leerEnvio(serializarEnvio({ prospectoId: 7, canal: "whatsapp", accion: "envio", en: AHORA + 60_000 }), AHORA)).toBeNull();
  });
  it("JSON roto, forma incompleta, id invalido o canal inventado dan null", () => {
    expect(leerEnvio("{", AHORA)).toBeNull();
    expect(leerEnvio("null", AHORA)).toBeNull();
    expect(leerEnvio("[1,2]", AHORA)).toBeNull();
    expect(leerEnvio(JSON.stringify({ prospectoId: 7, canal: "whatsapp", accion: "envio" }), AHORA)).toBeNull();
    expect(leerEnvio(JSON.stringify({ prospectoId: 0, canal: "whatsapp", accion: "envio", en: AHORA }), AHORA)).toBeNull();
    expect(leerEnvio(JSON.stringify({ prospectoId: 1.5, canal: "whatsapp", accion: "envio", en: AHORA }), AHORA)).toBeNull();
    expect(leerEnvio(JSON.stringify({ prospectoId: "7", canal: "whatsapp", accion: "envio", en: AHORA }), AHORA)).toBeNull();
    expect(leerEnvio(JSON.stringify({ prospectoId: 7, canal: "paloma", accion: "envio", en: AHORA }), AHORA)).toBeNull();
    // Sin accion (un recuerdo de antes) o con una inventada tampoco vale: un «Si» no puede ejecutar otra cosa.
    expect(leerEnvio(JSON.stringify({ prospectoId: 7, canal: "whatsapp", en: AHORA }), AHORA)).toBeNull();
    expect(leerEnvio(JSON.stringify({ prospectoId: 7, canal: "whatsapp", accion: "borrar", en: AHORA }), AHORA)).toBeNull();
  });
});
