import { describe, it, expect } from "vitest";
import { mismoOrigen } from "@/lib/origen";

const h = (o: Record<string, string>) => new Headers(o);

describe("mismoOrigen", () => {
  it("detras de Apache manda X-Forwarded-Host; sin proxy, Host", () => {
    expect(mismoOrigen(h({ origin: "https://prospectos.neracosu.com", "x-forwarded-host": "prospectos.neracosu.com", host: "127.0.0.1:3013" }))).toBe(true);
    expect(mismoOrigen(h({ origin: "http://127.0.0.1:3014", host: "127.0.0.1:3014" }))).toBe(true);
  });
  it("otro sitio, sin Origin, o un Origin que no es URL: no", () => {
    expect(mismoOrigen(h({ origin: "https://malo.test", "x-forwarded-host": "prospectos.neracosu.com", host: "127.0.0.1:3013" }))).toBe(false);
    expect(mismoOrigen(h({ origin: "https://prospectos.neracosu.com.malo.test", "x-forwarded-host": "prospectos.neracosu.com" }))).toBe(false);
    expect(mismoOrigen(h({ host: "prospectos.neracosu.com" }))).toBe(false);
    expect(mismoOrigen(h({ origin: "null", host: "prospectos.neracosu.com" }))).toBe(false);
    expect(mismoOrigen(h({ origin: "https://prospectos.neracosu.com" }))).toBe(false);
  });
  it("si el proxy encadena varios hosts, vale el primero", () => {
    expect(mismoOrigen(h({ origin: "https://prospectos.neracosu.com", "x-forwarded-host": "prospectos.neracosu.com, interno.local" }))).toBe(true);
  });
});
