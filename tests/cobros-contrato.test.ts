import { describe, it, expect } from "vitest";
import { estadoCobro, cifrasDelMes, generarCuotas, mesDe, venceMensualidad, mensualidadesQueTocan, filtrarCobros, ordenarCobros, esFiltroCobros } from "@/lib/cobros-contrato";

const hoy = "2026-09-16";
const base = { pagadoEn: null as Date | null, anuladoEn: null as Date | null };

describe("estadoCobro", () => {
  it("clasifica por fecha y por pago", () => {
    expect(estadoCobro({ ...base, vence: "2026-09-10" }, hoy)).toBe("vencido");
    expect(estadoCobro({ ...base, vence: "2026-09-16" }, hoy)).toBe("por_vencer");
    expect(estadoCobro({ ...base, vence: "2026-09-23" }, hoy)).toBe("por_vencer");
    expect(estadoCobro({ ...base, vence: "2026-09-24" }, hoy)).toBe("pendiente");
    expect(estadoCobro({ ...base, vence: "2026-09-10", pagadoEn: new Date() }, hoy)).toBe("pagado");
    expect(estadoCobro({ ...base, vence: "2026-09-10", anuladoEn: new Date() }, hoy)).toBe("anulado");
  });
});

describe("cifrasDelMes", () => {
  const cobros = [
    { monto: 100, vence: "2026-09-05", pagadoEn: new Date("2026-09-05T10:00:00-04:00"), anuladoEn: null },
    { monto: 200, vence: "2026-08-05", pagadoEn: new Date("2026-09-01T10:00:00-04:00"), anuladoEn: null }, // pagado en septiembre aunque vencia en agosto
    { monto: 300, vence: "2026-08-20", pagadoEn: null, anuladoEn: null }, // vencido, se arrastra
    { monto: 400, vence: "2026-09-25", pagadoEn: null, anuladoEn: null }, // por cobrar este mes
    { monto: 500, vence: "2026-10-05", pagadoEn: null, anuladoEn: null }, // mes siguiente: no cuenta
    { monto: 600, vence: "2026-09-10", pagadoEn: null, anuladoEn: new Date() }, // anulado: no cuenta
    { monto: 700, vence: "2026-09-30", pagadoEn: new Date("2026-08-31T23:59:00-04:00"), anuladoEn: null }, // pagado en agosto
  ];
  it("suma cobrado, vencido y por cobrar del mes de Caracas", () => {
    expect(cifrasDelMes(cobros, "2026-09", hoy)).toEqual({ cobrado: 300, vencido: 300, porCobrar: 400 });
  });
  it("mesDe recorta la fecha", () => { expect(mesDe("2026-09-16")).toBe("2026-09"); });
});

describe("generarCuotas", () => {
  it("parte en partes iguales y la ultima absorbe el redondeo", () => {
    expect(generarCuotas(2800, 3, "2026-09-01")).toEqual([
      { detalle: "Cuota 1 de 3", monto: 933.33, vence: "2026-09-01" },
      { detalle: "Cuota 2 de 3", monto: 933.33, vence: "2026-10-01" },
      { detalle: "Cuota 3 de 3", monto: 933.34, vence: "2026-10-31" },
    ]);
  });
  it("una sola cuota es el pago unico completo", () => {
    expect(generarCuotas(2800, 1, "2026-09-01")).toEqual([{ detalle: "Pago único", monto: 2800, vence: "2026-09-01" }]);
  });
});

describe("mensualidades", () => {
  it("venceMensualidad arma la fecha con el dia de cobro", () => {
    expect(venceMensualidad("2026-10", 5)).toBe("2026-10-05");
    expect(venceMensualidad("2026-02", 28)).toBe("2026-02-28");
  });
  it("toca la del mes que vence en 7 dias o menos y recupera las perdidas de 60 dias atras", () => {
    const p = { estado: "activo", diaCobroMensual: 20, fechaInicio: "2026-08-01" }; // julio queda fuera por fechaInicio
    expect(mensualidadesQueTocan(p, "2026-09-16", ["2026-07"])).toEqual([
      { mes: "2026-08", vence: "2026-08-20" }, // perdida (dentro de 60 dias, ya existe alguna mensualidad)
      { mes: "2026-09", vence: "2026-09-20" }, // en 4 dias
    ]);
    expect(mensualidadesQueTocan(p, "2026-09-16", ["2026-08"])).toEqual([{ mes: "2026-09", vence: "2026-09-20" }]);
    expect(mensualidadesQueTocan(p, "2026-09-12", ["2026-08"])).toEqual([]); // faltan 8 dias
  });
  it("no genera antes de fechaInicio ni fuera de activo", () => {
    expect(mensualidadesQueTocan({ estado: "activo", diaCobroMensual: 5, fechaInicio: "2026-09-10" }, "2026-09-16", [])).toEqual([]);
    // sin mensualidad previa (existentes vacio) no se rescata el mes ya vencido de septiembre
    expect(mensualidadesQueTocan({ estado: "activo", diaCobroMensual: 5, fechaInicio: "2026-09-01" }, "2026-09-30", [])).toEqual([{ mes: "2026-10", vence: "2026-10-05" }]);
    expect(mensualidadesQueTocan({ estado: "pausado", diaCobroMensual: 5, fechaInicio: "2026-01-01" }, "2026-09-16", [])).toEqual([]);
  });
  it("en la primera activacion (sin mensualidad previa) no nace con cobros vencidos; con alguna ya existente, si rescata", () => {
    const p = { estado: "activo", diaCobroMensual: 5, fechaInicio: "2024-01-01" };
    expect(mensualidadesQueTocan(p, "2026-09-16", [])).toEqual([]); // el de septiembre ya vencio y es la primera vez
    expect(mensualidadesQueTocan(p, "2026-09-30", [])).toEqual([{ mes: "2026-10", vence: "2026-10-05" }]);
    expect(mensualidadesQueTocan(p, "2026-09-16", ["2026-07"])).toEqual([
      { mes: "2026-08", vence: "2026-08-05" },
      { mes: "2026-09", vence: "2026-09-05" },
    ]); // ya existe una mensualidad: se restaura el rescate de 60 dias
  });
  it("el rescate de 60 dias nunca va antes del primer mes facturado", () => {
    const p = { estado: "activo", diaCobroMensual: 5, fechaInicio: "2024-01-01" };
    // Un mes despues de la primera mensualidad, el rescate no debe reabrir meses de antes de ella.
    expect(mensualidadesQueTocan(p, "2026-10-01", ["2026-10"])).toEqual([]);
    // Pero si el cron se cayo varios meses, sigue recuperando lo perdido desde el primer mes facturado.
    expect(mensualidadesQueTocan(p, "2026-10-25", ["2026-08"])).toEqual([
      { mes: "2026-09", vence: "2026-09-05" },
      { mes: "2026-10", vence: "2026-10-05" },
    ]);
    expect(mensualidadesQueTocan(p, "2026-11-03", ["2026-10"])).toEqual([{ mes: "2026-11", vence: "2026-11-05" }]);
  });
});

describe("filtrarCobros y ordenarCobros (fase 3)", () => {
  const hoy = "2026-10-30";
  const c = (vence: string, extra: Partial<{ pagadoEn: Date | null; anuladoEn: Date | null }> = {}) => ({ vence, pagadoEn: null, anuladoEn: null, ...extra });
  const vencido = c("2026-10-20"), esteMes = c("2026-10-31"), proximo = c("2026-11-05");
  const pagado = c("2026-10-01", { pagadoEn: new Date("2026-10-02T12:00:00-04:00") });
  const anulado = c("2026-10-10", { anuladoEn: new Date() });
  const anuladoPagado = c("2026-10-10", { pagadoEn: new Date(), anuladoEn: new Date() });
  const todos = [vencido, esteMes, proximo, pagado, anulado, anuladoPagado];
  it("pendientes = sin pagar ni anular, de cualquier fecha", () => expect(filtrarCobros(todos, "pendientes", hoy)).toEqual([vencido, esteMes, proximo]));
  it("vencidos = pendientes con vence < hoy", () => expect(filtrarCobros(todos, "vencidos", hoy)).toEqual([vencido]));
  it("mes = pendientes que vencen en el mes de hoy, vencidos incluidos", () => expect(filtrarCobros(todos, "mes", hoy)).toEqual([vencido, esteMes]));
  it("pagados = con pagadoEn y sin anular", () => expect(filtrarCobros(todos, "pagados", hoy)).toEqual([pagado]));
  it("ordenarCobros: vencidos primero y luego por fecha; pagados del mas reciente al mas viejo", () => {
    const filas = [{ vence: "2026-11-05", estado: "por_vencer" as const }, { vence: "2026-10-20", estado: "vencido" as const }, { vence: "2026-10-31", estado: "pendiente" as const }];
    expect(ordenarCobros(filas).map((f) => f.vence)).toEqual(["2026-10-20", "2026-10-31", "2026-11-05"]);
    const pagados = [{ vence: "2026-09-05", estado: "pagado" as const }, { vence: "2026-10-05", estado: "pagado" as const }];
    expect(ordenarCobros(pagados).map((f) => f.vence)).toEqual(["2026-10-05", "2026-09-05"]);
  });
  it("esFiltroCobros acepta solo los cuatro", () => { expect(esFiltroCobros("mes")).toBe(true); expect(esFiltroCobros("todo")).toBe(false); });
});
