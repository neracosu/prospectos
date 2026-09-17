import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, sembrarCliente } from "./ayuda-db";
import { _reiniciarIntentos } from "@/lib/rate-limit";
import { crearToken, verificarTokenCliente } from "@/lib/auth";
import { generarPinCliente, estadoAcceso, darAcceso, regenerarPin, desactivarAcceso, intentarEntrada, sesionDesdeToken, enlaceSiTieneAcceso } from "@/lib/acceso-cliente";

describe("generarPinCliente", () => {
  it("siempre 6 digitos, con ceros a la izquierda si tocan", () => {
    for (let i = 0; i < 200; i++) expect(generarPinCliente()).toMatch(/^\d{6}$/);
  });
});

describe.runIf(DB_HABILITADA)("acceso del cliente al portal", () => {
  let cliente: Awaited<ReturnType<typeof sembrarCliente>>;
  let otro: Awaited<ReturnType<typeof sembrarCliente>>;
  beforeAll(async () => {
    await limpiarBase(); await sembrarBasico();
    cliente = await sembrarCliente({ nombre: "Hotel Acceso" });
    otro = await sembrarCliente({ nombre: "Farmacia Otra" });
  });
  beforeEach(() => _reiniciarIntentos());
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("sin acceso enviado: estado sin_acceso, sin enlace y no entra con ningun PIN", async () => {
    expect(await estadoAcceso(cliente.id)).toEqual({ estado: "sin_acceso", ultimoIngreso: null, ingresos: 0 });
    expect(await enlaceSiTieneAcceso(cliente.id)).toBe("");
    expect(await intentarEntrada({ codigo: cliente.codigo, pin: "123456", ip: "1.1.1.1" })).toEqual({ ok: false, motivo: "incorrecto" });
  });

  it("darAcceso crea la cuenta una sola vez: la primera vez devuelve el PIN, la segunda no", async () => {
    const a = await darAcceso(cliente.id);
    expect(a.pin).toMatch(/^\d{6}$/);
    expect((await darAcceso(cliente.id)).pin).toBeNull();
    const u = await prisma.usuario.findUniqueOrThrow({ where: { clienteId: cliente.id } });
    expect(u).toMatchObject({ rol: "cliente", activo: true, nombre: "Hotel Acceso", sesionVersion: 0 });
    expect(u.pinHash).not.toContain(a.pin!); // guardado con hash
    await expect(darAcceso(999_999)).rejects.toThrow("CLIENTE_NO_EXISTE");
    expect((await estadoAcceso(cliente.id)).estado).toBe("activo");
    expect(await enlaceSiTieneAcceso(cliente.id)).toMatch(new RegExp(`/c/${cliente.codigo}$`));
  });

  it("entra con su PIN: token valido, evento portal_abierto y sesion con su codigo", async () => {
    const { pin } = await regenerarPin(cliente.id);
    const r = await intentarEntrada({ codigo: cliente.codigo, pin, ip: "2.2.2.2" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await verificarTokenCliente(r.token)).toMatchObject({ clienteId: cliente.id });
    expect(await sesionDesdeToken(r.token)).toMatchObject({ clienteId: cliente.id, codigo: cliente.codigo, nombre: "Hotel Acceso" });
    expect(await prisma.evento.count({ where: { clienteId: cliente.id, tipo: "portal_abierto" } })).toBe(1);
    const e = await estadoAcceso(cliente.id);
    expect(e.ingresos).toBe(1);
    expect(e.ultimoIngreso).not.toBeNull();
  });

  it("el PIN de un cliente no abre el portal de otro, y un codigo inexistente responde igual que un PIN errado", async () => {
    const { pin } = await regenerarPin(cliente.id);
    await darAcceso(otro.id);
    expect(await intentarEntrada({ codigo: otro.codigo, pin, ip: "3.3.3.3" })).toEqual({ ok: false, motivo: "incorrecto" });
    expect(await intentarEntrada({ codigo: "A".repeat(22), pin, ip: "3.3.3.4" })).toEqual({ ok: false, motivo: "incorrecto" });
    expect(await intentarEntrada({ codigo: cliente.codigo, pin: "12345", ip: "3.3.3.5" })).toEqual({ ok: false, motivo: "incorrecto" });
  });

  it("regenerar el PIN invalida el anterior y las sesiones abiertas", async () => {
    const viejo = (await regenerarPin(cliente.id)).pin;
    const r = await intentarEntrada({ codigo: cliente.codigo, pin: viejo, ip: "4.4.4.4" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const nuevo = (await regenerarPin(cliente.id)).pin;
    expect(await sesionDesdeToken(r.token)).toBeNull();
    if (nuevo !== viejo) expect((await intentarEntrada({ codigo: cliente.codigo, pin: viejo, ip: "4.4.4.5" })).ok).toBe(false);
    expect((await intentarEntrada({ codigo: cliente.codigo, pin: nuevo, ip: "4.4.4.6" })).ok).toBe(true);
  });

  it("desactivar corta la sesion y el PIN deja de servir; regenerar reactiva", async () => {
    const { pin } = await regenerarPin(cliente.id);
    const r = await intentarEntrada({ codigo: cliente.codigo, pin, ip: "5.5.5.5" });
    if (!r.ok) throw new Error("debio entrar");
    await desactivarAcceso(cliente.id);
    expect((await estadoAcceso(cliente.id)).estado).toBe("desactivado");
    expect(await sesionDesdeToken(r.token)).toBeNull();
    expect(await enlaceSiTieneAcceso(cliente.id)).toBe("");
    expect(await intentarEntrada({ codigo: cliente.codigo, pin, ip: "5.5.5.6" })).toEqual({ ok: false, motivo: "incorrecto" });
    const otra = await regenerarPin(cliente.id);
    expect((await estadoAcceso(cliente.id)).estado).toBe("activo");
    expect((await intentarEntrada({ codigo: cliente.codigo, pin: otra.pin, ip: "5.5.5.7" })).ok).toBe(true);
    expect(await prisma.usuario.count({ where: { clienteId: cliente.id } })).toBe(1); // nada se borra ni se duplica
  });

  it("bloquea la CUENTA a los 5 fallos aunque vengan de IPs distintas, y ni el PIN correcto entra", async () => {
    const { pin } = await regenerarPin(cliente.id);
    const malo = pin === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect(await intentarEntrada({ codigo: cliente.codigo, pin: malo, ip: `6.6.6.${i}` })).toEqual({ ok: false, motivo: "incorrecto" });
    expect(await intentarEntrada({ codigo: cliente.codigo, pin, ip: "6.6.6.99" })).toEqual({ ok: false, motivo: "bloqueado" });
  });

  it("bloquea la IP a los 5 fallos aunque pruebe contra cuentas distintas", async () => {
    await darAcceso(otro.id);
    const { pin } = await regenerarPin(cliente.id);
    for (let i = 0; i < 5; i++) await intentarEntrada({ codigo: i % 2 ? cliente.codigo : otro.codigo, pin: "9".repeat(5) + String(i), ip: "7.7.7.7" });
    expect(await intentarEntrada({ codigo: cliente.codigo, pin, ip: "7.7.7.7" })).toEqual({ ok: false, motivo: "bloqueado" });
    expect((await intentarEntrada({ codigo: cliente.codigo, pin, ip: "7.7.7.8" })).ok).toBe(true); // otra IP si entra
  });

  it("sesionDesdeToken rechaza basura, un token sin cookie y un token del panel", async () => {
    expect(await sesionDesdeToken(undefined)).toBeNull();
    expect(await sesionDesdeToken("basura")).toBeNull();
    expect(await sesionDesdeToken(await crearToken({ id: 1, nombre: "Neri", rol: "dueno" }))).toBeNull();
  });

  it("una IP bloqueada no le suma fallos a las cuentas: no sirve para dejar fuera a otro cliente", async () => {
    const { pin } = await regenerarPin(otro.id);
    for (let i = 0; i < 5; i++) await intentarEntrada({ codigo: cliente.codigo, pin: "00000" + i, ip: "9.9.9.9" }); // bloquea 9.9.9.9 (y la cuenta de `cliente`)
    for (let i = 0; i < 20; i++) expect(await intentarEntrada({ codigo: otro.codigo, pin: "11111" + (i % 10), ip: "9.9.9.9" })).toEqual({ ok: false, motivo: "bloqueado" });
    expect((await intentarEntrada({ codigo: otro.codigo, pin, ip: "9.9.9.10" })).ok).toBe(true); // `otro` sigue entrando desde su IP
  });

  it("un codigo mal formado solo cuenta contra la IP", async () => {
    for (let i = 0; i < 5; i++) expect(await intentarEntrada({ codigo: "../basura" + i, pin: "123456", ip: "9.9.8.8" })).toEqual({ ok: false, motivo: "incorrecto" });
    expect(await intentarEntrada({ codigo: "../basura-nueva", pin: "123456", ip: "9.9.8.8" })).toEqual({ ok: false, motivo: "bloqueado" });
    const { pin } = await regenerarPin(cliente.id);
    expect((await intentarEntrada({ codigo: cliente.codigo, pin, ip: "9.9.8.9" })).ok).toBe(true);
  });
});
