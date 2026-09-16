import { describe, it, expect, beforeEach } from "vitest";
import { bloqueado, registrarFallo, olvidarFallos, permitirIntento, _reiniciarIntentos } from "@/lib/rate-limit";

const MIN = 60_000;

describe("bloqueado / registrarFallo", () => {
  beforeEach(_reiniciarIntentos);

  it("5 fallos bloquean, 4 no", () => {
    for (let i = 0; i < 4; i++) registrarFallo("entrar:1.2.3.4");
    expect(bloqueado("entrar:1.2.3.4")).toBe(false);
    registrarFallo("entrar:1.2.3.4");
    expect(bloqueado("entrar:1.2.3.4")).toBe(true);
  });

  it("un exito (olvidarFallos) limpia el contador", () => {
    for (let i = 0; i < 4; i++) registrarFallo("entrar:1.2.3.4");
    olvidarFallos("entrar:1.2.3.4");
    expect(bloqueado("entrar:1.2.3.4")).toBe(false);
    registrarFallo("entrar:1.2.3.4");
    expect(bloqueado("entrar:1.2.3.4")).toBe(false); // solo 1 fallo tras el olvido
  });

  it("el bloqueo dura la ventana completa desde el quinto fallo, no desde el primero", () => {
    registrarFallo("entrar:1.2.3.4", 5, 15 * MIN, 0);
    registrarFallo("entrar:1.2.3.4", 5, 15 * MIN, 1 * MIN);
    registrarFallo("entrar:1.2.3.4", 5, 15 * MIN, 2 * MIN);
    registrarFallo("entrar:1.2.3.4", 5, 15 * MIN, 3 * MIN);
    // Quinto fallo a los 14 min: reinicia la ventana desde aqui.
    registrarFallo("entrar:1.2.3.4", 5, 15 * MIN, 14 * MIN);
    expect(bloqueado("entrar:1.2.3.4", 5, 15 * MIN, 14 * MIN + 1)).toBe(true);
    // Si la ventana contara desde el primer fallo (t=0) ya habria expirado a los 15 min.
    expect(bloqueado("entrar:1.2.3.4", 5, 15 * MIN, 20 * MIN)).toBe(true);
    // Sigue bloqueado justo antes de que se cumplan los 15 min desde el quinto fallo (t=29min).
    expect(bloqueado("entrar:1.2.3.4", 5, 15 * MIN, 29 * MIN - 1)).toBe(true);
    // Y ya no, apenas pasa esa ventana.
    expect(bloqueado("entrar:1.2.3.4", 5, 15 * MIN, 29 * MIN + 1)).toBe(false);
  });

  it("una clave distinta no comparte contador", () => {
    for (let i = 0; i < 5; i++) registrarFallo("entrar:a");
    expect(bloqueado("entrar:a")).toBe(true);
    expect(bloqueado("entrar:b")).toBe(false);
  });
});

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
