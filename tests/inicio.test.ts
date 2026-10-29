import { vi } from "vitest";
vi.mock("@/lib/sesion", async () => {
  const { sesionFalsa } = await import("./ayuda-sesion");
  return {
    COOKIE_SESION: "pr_sesion", DIAS_SESION: 30,
    sesionActual: async () => sesionFalsa.actual,
    exigirSesion: async () => { if (!sesionFalsa.actual) throw new Error("REDIRECT:/entrar"); return sesionFalsa.actual; },
    exigirRol: async (rol: string) => { if (sesionFalsa.actual?.rol !== rol) throw new Error("REDIRECT:/inicio"); return sesionFalsa.actual; },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { describe, it, expect, beforeAll } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico } from "./ayuda-db";
import { datosInicio } from "@/lib/inicio";
import { cobrosQueVencen, hitosQueTocan } from "@/lib/proyectos";

const hoy = "2026-10-29";

describe.runIf(DB_HABILITADA)("datos de Inicio", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  beforeAll(async () => {
    await limpiarBase(); ids = await sembrarBasico();
    const cliente = await prisma.cliente.create({ data: { nombre: "Tienda Alma", contactoNombre: "Ana", whatsapp: "584129990000", codigo: "c".repeat(22) } });
    const proyecto = await prisma.proyecto.create({ data: { clienteId: cliente.id, nichoId: ids.nichoId, nombre: "Tienda en línea", pagoUnico: "2500.00", mensualidad: "100.00", fechaInicio: "2026-10-01", estado: "activo" } });
    await prisma.cobro.create({ data: { proyectoId: proyecto.id, concepto: "mensualidad", detalle: "Octubre", monto: "100.00", vence: hoy, mes: "2026-10" } });
    await prisma.cobro.create({ data: { proyectoId: proyecto.id, concepto: "extra", detalle: "Lejos", monto: "50.00", vence: "2026-12-30" } });
    await prisma.pendiente.create({ data: { proyectoId: proyecto.id, texto: "Entregar módulo", fechaEstimada: "2026-10-31" } });
    await prisma.pendiente.create({ data: { proyectoId: proyecto.id, texto: "Sin fecha" } });
    // Un prospecto enviado con seguimiento vencido (la siembra basica no trae prospectos)
    await prisma.prospecto.create({ data: { nichoId: ids.nichoId, nombre: "Posada Faro", ciudad: "Catia La Mar", whatsapp: "584121112233", fuentes: [], codigo: "p".repeat(22), clave: "posada faro|catia la mar", etapa: "enviado", proximoSeguimiento: "2026-10-28" } });
    await prisma.prospecto.create({ data: { nichoId: ids.nichoId, nombre: "Hotel Charla", ciudad: "Caracas", whatsapp: "584120000000", fuentes: [], codigo: "q".repeat(22), clave: "hotel charla|caracas", etapa: "respondio", proximoSeguimiento: "2026-10-27" } });
  });
  it("cobrosQueVencen e hitosQueTocan miran 7 dias y omiten lo lejano o sin fecha", async () => {
    const c = await cobrosQueVencen(hoy, 7);
    expect(c.map((x) => x.detalle)).toEqual(["Octubre"]);
    expect(c[0].proyectoNombre).toBe("Tienda en línea");
    const h = await hitosQueTocan(hoy, 7);
    expect(h.map((x) => x.texto)).toEqual(["Entregar módulo"]);
  });
  it("datosInicio trae cifras, la lista Hoy y hasta tres solicitudes", async () => {
    const d = await datosInicio(hoy);
    const enviados = await prisma.prospecto.count({ where: { etapa: { in: ["enviado", "respondio", "reunion"] } } });
    expect(d.cifras.leadsActivos).toBe(enviados);
    expect(d.cifras.conVencido).toBeGreaterThanOrEqual(1);
    expect(d.cifras.porCobrar).toBe(100);
    expect(d.hoyLista.map((x) => x.tipo)).toContain("cobro");
    expect(d.hoyLista.map((x) => x.tipo)).toContain("hito");
    expect(d.hoyLista.map((x) => x.tipo)).toContain("seguimiento");
    // La lista cuenta lo mismo que la cifra: enviado, respondio y reunion con fecha vencida
    expect(d.hoyLista.filter((x) => x.tipo === "seguimiento").map((x) => x.titulo).sort()).toEqual(["Hotel Charla", "Posada Faro"]);
    expect(d.cifras.conVencido).toBe(2);
    expect(d.hoyLista.find((x) => x.titulo === "Posada Faro")!.enlaceWhatsApp).toMatch(/^https:\/\/wa\.me\/584121112233\?text=/);
    expect(d.ultimas.length).toBeLessThanOrEqual(3);
  });
});
