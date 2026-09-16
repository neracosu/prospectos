import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, PIN_DUENO, PIN_PROSPECTADOR } from "./ayuda-db";
import { buscarPorPin, crearUsuario, cambiarPin, pinEnUso } from "@/lib/usuarios";

describe.runIf(DB_HABILITADA)("usuarios", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  beforeAll(async () => { await limpiarBase(); ids = await sembrarBasico(); });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("encuentra al usuario por su PIN y devuelve el rol", async () => {
    expect(await buscarPorPin(PIN_DUENO)).toMatchObject({ id: ids.usuarioId, rol: "dueno" });
    expect(await buscarPorPin(PIN_PROSPECTADOR)).toMatchObject({ id: ids.prospectadorId, rol: "prospectador" });
    expect(await buscarPorPin("000000")).toBeNull();
    expect(await buscarPorPin("12345")).toBeNull(); // largo invalido, ni consulta
  });
  it("no deja dos cuentas con el mismo PIN", async () => {
    await expect(crearUsuario({ nombre: "Otro", rol: "prospectador", pin: PIN_DUENO })).rejects.toThrow("PIN_REPETIDO");
    await expect(cambiarPin(ids.prospectadorId, PIN_DUENO)).rejects.toThrow("PIN_REPETIDO");
    expect(await pinEnUso(PIN_DUENO, ids.usuarioId)).toBe(false); // el propio no cuenta
  });
  it("un usuario desactivado no entra", async () => {
    await prisma.usuario.update({ where: { id: ids.prospectadorId }, data: { activo: false } });
    expect(await buscarPorPin(PIN_PROSPECTADOR)).toBeNull();
  });
});
