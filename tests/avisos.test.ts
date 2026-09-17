import { vi } from "vitest";
vi.mock("@/lib/sesion", async () => {
  const { sesionFalsa } = await import("./ayuda-sesion");
  return {
    COOKIE_SESION: "pr_sesion", DIAS_SESION: 30,
    sesionActual: async () => sesionFalsa.actual,
    exigirSesion: async () => { if (!sesionFalsa.actual) throw new Error("REDIRECT:/entrar"); return sesionFalsa.actual; },
    exigirRol: async (rol: string) => { if (sesionFalsa.actual?.rol !== rol) throw new Error("REDIRECT:/hoy"); return sesionFalsa.actual; },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, sembrarCliente, sembrarProyecto } from "./ayuda-db";
import { sesionFalsa } from "./ayuda-sesion";
import { leerConfig, guardarConfig, CLAVES } from "@/lib/configuracion";
import { AVISO_POR_DEFECTO } from "@/lib/avisos-contrato";
import { darAcceso } from "@/lib/acceso-cliente";
import { marcarPendiente, avisarHito } from "@/acciones/pendientes";
import { avisarCobro, registrarRecordatorio } from "@/acciones/cobros";
import { marcarAvisada } from "@/acciones/versiones";
import { guardarMensajesAviso, guardarUsuario, restablecerPin } from "@/acciones/ajustes";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const texto = (href: string) => decodeURIComponent(href.split("?text=")[1]);

describe.runIf(DB_HABILITADA)("avisos al cliente", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  let cliente: Awaited<ReturnType<typeof sembrarCliente>>;
  let proyectoId = 0;
  beforeAll(async () => {
    await limpiarBase();
    ids = await sembrarBasico();
    cliente = await sembrarCliente({ nombre: "Hotel Avisos", whatsapp: "584125550000" });
    proyectoId = (await sembrarProyecto(cliente.id, ids.nichoId, { nombre: "PMS Hotel" })).id;
  });
  beforeEach(() => { sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" }; });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("los tres avisos tienen texto de fabrica, y el recordatorio de cobro ya trae el renglon del portal", async () => {
    expect(await leerConfig(CLAVES.avisoHito)).toBe(AVISO_POR_DEFECTO.hito);
    expect(await leerConfig(CLAVES.avisoVersion)).toBe(AVISO_POR_DEFECTO.version);
    expect(await leerConfig(CLAVES.avisoCobro)).toBe(AVISO_POR_DEFECTO.cobro);
    for (const clave of [CLAVES.mensajeRecordatorio, CLAVES.mensajeVencido]) {
      const renglones = (await leerConfig(clave)).split("\n");
      expect(renglones.filter((r) => r.includes("{enlace}"))).toEqual(["Puede ver el detalle en su portal: {enlace}"]);
    }
  });

  it("avisarHito: solo el dueno, solo un hito cumplido y visible; abre WhatsApp, deja rastro y no se repite", async () => {
    const interno = await prisma.pendiente.create({ data: { proyectoId, texto: "Refactor interno", hecho: true, hechoEn: new Date(), visibleCliente: false, orden: 1 } });
    const hito = await prisma.pendiente.create({ data: { proyectoId, texto: "Recepción y habitaciones", visibleCliente: true, orden: 2 } });
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
    await expect(avisarHito(hito.id)).rejects.toThrow("REDIRECT:/hoy");
    sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" };
    expect((await avisarHito(interno.id)).ok).toBe(false);
    expect((await avisarHito(hito.id)).ok).toBe(false); // todavia no esta cumplido
    await marcarPendiente(hito.id, true);
    const r = await avisarHito(hito.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.datos.href).toMatch(/^https:\/\/wa\.me\/584125550000\?text=/);
    // El cliente todavia no tiene acceso al portal: el renglon del enlace no va.
    expect(texto(r.datos.href)).toBe("Buenas, Hotel Avisos. Ya quedó listo en PMS Hotel: Recepción y habitaciones.\nCualquier duda me escribe por aquí.");
    expect((await prisma.pendiente.findUniqueOrThrow({ where: { id: hito.id } })).avisadoEn).not.toBeNull();
    expect(await prisma.evento.count({ where: { proyectoId, tipo: "aviso_cliente", texto: "hito: Recepción y habitaciones" } })).toBe(1);
    const otra = await avisarHito(hito.id);
    expect(otra.ok).toBe(false);
    if (!otra.ok) expect(otra.mensaje).toContain("ya se avisó");
    expect(await prisma.evento.count({ where: { proyectoId, tipo: "aviso_cliente", texto: "hito: Recepción y habitaciones" } })).toBe(1);
  });

  it("desmarcar un hito le borra el aviso: al volver a cumplirlo se puede avisar otra vez, ya con el enlace del portal", async () => {
    const hito = await prisma.pendiente.findFirstOrThrow({ where: { proyectoId, texto: "Recepción y habitaciones" } });
    await marcarPendiente(hito.id, false);
    expect((await prisma.pendiente.findUniqueOrThrow({ where: { id: hito.id } })).avisadoEn).toBeNull();
    await marcarPendiente(hito.id, true);
    await darAcceso(cliente.id);
    const r = await avisarHito(hito.id);
    expect(r.ok).toBe(true);
    if (r.ok) expect(texto(r.datos.href)).toContain(`Puede ver el avance en su portal: http://localhost:3013/c/${cliente.codigo}`);
  });

  it("sin WhatsApp del cliente no se avisa ni se marca nada", async () => {
    const mudo = await sembrarCliente({ nombre: "Sin Celular", whatsapp: "" });
    const p = await sembrarProyecto(mudo.id, ids.nichoId);
    const hito = await prisma.pendiente.create({ data: { proyectoId: p.id, texto: "Hito mudo", hecho: true, hechoEn: new Date(), visibleCliente: true } });
    const cobro = await prisma.cobro.create({ data: { proyectoId: p.id, concepto: "extra", detalle: "Extra mudo", monto: "20.00", vence: "2026-10-01" } });
    const h = await avisarHito(hito.id);
    const c = await avisarCobro(cobro.id);
    expect(h.ok).toBe(false);
    expect(c.ok).toBe(false);
    if (!h.ok) expect(h.mensaje).toContain("WhatsApp");
    expect((await prisma.pendiente.findUniqueOrThrow({ where: { id: hito.id } })).avisadoEn).toBeNull();
    expect((await prisma.cobro.findUniqueOrThrow({ where: { id: cobro.id } })).avisadoEn).toBeNull();
    expect(await prisma.evento.count({ where: { proyectoId: p.id, tipo: "aviso_cliente" } })).toBe(0);
  });

  it("avisarCobro: cuotas y extras sin pagar; ni mensualidades, ni pagados, ni anulados, ni dos veces", async () => {
    const extra = await prisma.cobro.create({ data: { proyectoId, concepto: "extra", detalle: "Módulo de reportes", monto: "150.50", vence: "2026-10-05" } });
    const mensualidad = await prisma.cobro.create({ data: { proyectoId, concepto: "mensualidad", detalle: "Mensualidad de octubre 2026", mes: "2026-10", monto: "100.00", vence: "2026-10-05" } });
    const pagado = await prisma.cobro.create({ data: { proyectoId, concepto: "cuota", detalle: "Cuota 1", monto: "10.00", vence: "2026-09-01", pagadoEn: new Date(), canal: "zelle" } });
    const anulado = await prisma.cobro.create({ data: { proyectoId, concepto: "extra", detalle: "Anulado", monto: "10.00", vence: "2026-09-01", anuladoEn: new Date(), anuladoMotivo: "x" } });
    for (const c of [mensualidad, pagado, anulado]) expect((await avisarCobro(c.id)).ok, c.detalle).toBe(false);
    const r = await avisarCobro(extra.id);
    expect(r.ok).toBe(true);
    if (r.ok) expect(texto(r.datos.href)).toBe(`Buenas, Hotel Avisos. Registré un cobro de PMS Hotel: Extra (Módulo de reportes) por $150,50, que vence el 05/10/2026.\nPuede verlo en su portal: http://localhost:3013/c/${cliente.codigo}\nCualquier duda me escribe por aquí.`);
    expect((await avisarCobro(extra.id)).ok).toBe(false);
    expect(await prisma.evento.count({ where: { cobroId: extra.id, tipo: "aviso_cliente", texto: "cobro: Módulo de reportes" } })).toBe(1);
    // El recordatorio de siempre sigue andando y ahora trae el renglon del portal de fabrica.
    const rec = await registrarRecordatorio(mensualidad.id);
    expect(rec.ok).toBe(true);
    if (rec.ok) expect(texto(rec.datos.href)).toContain(`Puede ver el detalle en su portal: http://localhost:3013/c/${cliente.codigo}`);
  });

  it("el aviso de version sale de la plantilla de Ajustes", async () => {
    const v = await prisma.version.create({ data: { proyectoId, version: "2.0.0", fecha: "2026-09-17", cambios: { create: [{ tipo: "nuevo", texto: "Reporte semanal", orden: 0 }] } } });
    await guardarConfig(CLAVES.avisoVersion, "Salió la {version} de {proyecto}, {cliente}.\n{cambios}\nMírela aquí: {enlace}");
    const r = await marcarAvisada(v.id);
    expect(r.ok).toBe(true);
    if (r.ok) expect(texto(r.datos.href)).toBe(`Salió la 2.0.0 de PMS Hotel, Hotel Avisos.\n• Nuevo: Reporte semanal\nMírela aquí: http://localhost:3013/c/${cliente.codigo}`);
  });

  it("guardarMensajesAviso: solo el dueno; cada aviso lleva su variable; guarda los tres", async () => {
    const buenos = { hito: "Listo {hito} en {proyecto}.\n{enlace}", version: "Versión {version}:\n{cambios}\n{enlace}", cobro: "Cobro por {monto}, vence {vence}.\n{enlace}" };
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
    await expect(guardarMensajesAviso(fd(buenos))).rejects.toThrow("REDIRECT:/hoy");
    sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" };
    for (const malos of [{ ...buenos, hito: "Ya quedó listo, avise si lo ve." }, { ...buenos, version: "Publicamos una versión nueva." }, { ...buenos, cobro: "Le registré un cobro nuevo." }, { ...buenos, hito: "{hito}" }]) {
      const r = await guardarMensajesAviso(fd(malos));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.mensaje).toContain("{hito}");
    }
    expect((await guardarMensajesAviso(fd(buenos))).ok).toBe(true);
    expect(await leerConfig(CLAVES.avisoHito)).toBe(buenos.hito);
    expect(await leerConfig(CLAVES.avisoVersion)).toBe(buenos.version);
    expect(await leerConfig(CLAVES.avisoCobro)).toBe(buenos.cobro);
  });

  it("Ajustes solo toca cuentas del panel: la cuenta de un cliente no se vuelve prospectador ni recibe un PIN del panel", async () => {
    const cuenta = await prisma.usuario.findFirstOrThrow({ where: { clienteId: cliente.id } });
    const r = await guardarUsuario(fd({ id: String(cuenta.id), nombre: "Intruso", rol: "prospectador", metaDiaria: "5", activo: "on" }));
    expect(r.ok).toBe(false);
    const p = await restablecerPin(cuenta.id, "246813");
    expect(p.ok).toBe(false);
    expect(await prisma.usuario.findUniqueOrThrow({ where: { id: cuenta.id } })).toMatchObject({ rol: "cliente", nombre: cuenta.nombre, pinHash: cuenta.pinHash });
    // Una cuenta del panel se sigue pudiendo editar.
    expect((await guardarUsuario(fd({ id: String(ids.prospectadorId), nombre: "María José", rol: "prospectador", metaDiaria: "8", activo: "on" }))).ok).toBe(true);
  });
});
