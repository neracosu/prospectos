import { describe, it, expect } from "vitest";
import { crearToken, verificarToken, crearTokenCliente, verificarTokenCliente } from "@/lib/auth";

describe("tokens del panel y del portal", () => {
  it("el del portal lleva usuario, cliente y version de sesion", async () => {
    const t = await crearTokenCliente({ usuarioId: 7, clienteId: 3, v: 2 });
    expect(await verificarTokenCliente(t)).toEqual({ usuarioId: 7, clienteId: 3, v: 2 });
  });
  it("tener sesion de cliente no da acceso al panel, ni al reves", async () => {
    const delPortal = await crearTokenCliente({ usuarioId: 7, clienteId: 3, v: 0 });
    const delPanel = await crearToken({ id: 1, nombre: "Neri", rol: "dueno" });
    expect(await verificarToken(delPortal)).toBeNull();
    expect(await verificarTokenCliente(delPanel)).toBeNull();
    expect(await verificarTokenCliente("basura")).toBeNull();
  });
});
