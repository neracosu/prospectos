import { describe, it, expect, beforeEach } from "vitest";
import { permitirIntento, _reiniciarIntentos } from "@/lib/rate-limit";

describe("permitirIntento", () => {
  beforeEach(_reiniciarIntentos);
  it("deja 5 y bloquea el sexto", () => {
    for (let i = 0; i < 5; i++) expect(permitirIntento("ip:1.2.3.4")).toBe(true);
    expect(permitirIntento("ip:1.2.3.4")).toBe(false);
  });
  it("una clave distinta no comparte contador", () => {
    for (let i = 0; i < 6; i++) permitirIntento("ip:a");
    expect(permitirIntento("ip:b")).toBe(true);
  });
});
