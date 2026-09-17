import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { nombreMes } from "@/lib/cobros-contrato";
import {
  numeroRecibo, numeroNota, anioDeDocumento, NUMERO_RECIBO, ARCHIVO_RECIBO, conceptoRecibo, versionesIncluidas,
  faltantesEmisor, celularVisible, camposRecibo, camposNota, renderDocumento, fuentesDePlantilla, incrustarFuentes,
  mensajeRecibo, PIE_RECIBO, PIE_NOTA, type DatosRecibo,
} from "@/lib/recibos-contrato";

const PLANTILLA = readFileSync(path.join(import.meta.dirname, "..", "plantillas", "recibo.html"), "utf8");
const DATOS: DatosRecibo = {
  numero: "R-2026-0001", emitidoEl: "2026-09-17",
  emisor: { nombre: "Neri Colón", rif: "V-12345678-9", whatsapp: "584121234567", email: "neri@ejemplo.test" },
  cliente: { nombre: "Hotel <Prueba> & Hijos", rif: "J-40123456-7", contactoNombre: "Ana Pérez" },
  concepto: "PMS Hotel: Mensualidad — octubre 2026", versiones: "Incluye v1.4.0 a v1.4.2",
  monto: 1250, fechaPago: "2026-09-16", canal: "pago_movil", referencia: "0102-44819",
};

describe("numero de recibo", () => {
  it("R-AAAA-NNNN con cuatro digitos como minimo; pasado 9999 crece", () => {
    expect(numeroRecibo(2026, 1)).toBe("R-2026-0001");
    expect(numeroRecibo(2026, 9999)).toBe("R-2026-9999");
    expect(numeroRecibo(2027, 10000)).toBe("R-2027-10000");
    expect(() => numeroRecibo(2026, 0)).toThrow("NUMERO_INVALIDO");
    expect(() => numeroRecibo(2026, 1.5)).toThrow("NUMERO_INVALIDO");
    expect(() => numeroRecibo(26, 1)).toThrow("NUMERO_INVALIDO");
  });
  it("la nota de anulacion es el numero con -A, y el anio sale del nombre", () => {
    expect(numeroNota("R-2026-0001")).toBe("R-2026-0001-A");
    expect(anioDeDocumento("R-2026-0001")).toBe("2026");
    expect(anioDeDocumento("R-2027-0042-A")).toBe("2027");
    expect(anioDeDocumento("../R-2026-0001")).toBeNull();
    expect(anioDeDocumento("R-2026-1")).toBeNull();
  });
  it("las expresiones de numero y de archivo no dejan pasar rutas raras", () => {
    expect(NUMERO_RECIBO.test("R-2026-0001")).toBe(true);
    expect(NUMERO_RECIBO.test("R-2026-0001-A")).toBe(false);
    expect(ARCHIVO_RECIBO.exec("R-2026-0001.pdf")?.[1]).toBe("R-2026-0001");
    expect(ARCHIVO_RECIBO.exec("R-2026-0001-A.pdf")?.[3]).toBe("-A");
    for (const malo of ["R-2026-0001", "r-2026-0001.pdf", "R-2026-0001.pdf.txt", "../R-2026-0001.pdf", "R-2026-0001-B.pdf", "R-2026-1.pdf"]) expect(ARCHIVO_RECIBO.test(malo)).toBe(false);
  });
});

describe("concepto y versiones", () => {
  it("nombreMes", () => { expect(nombreMes("2026-10")).toBe("octubre 2026"); expect(nombreMes("2027-01")).toBe("enero 2027"); });
  it("arma proyecto + tipo + detalle", () => {
    expect(conceptoRecibo({ concepto: "mensualidad", detalle: "Mensualidad de octubre 2026", mes: "2026-10" }, "PMS Hotel")).toBe("PMS Hotel: Mensualidad — octubre 2026");
    expect(conceptoRecibo({ concepto: "cuota", detalle: "Cuota 2 de 3", mes: null }, "PMS Hotel")).toBe("PMS Hotel: Pago único — cuota 2 de 3");
    expect(conceptoRecibo({ concepto: "cuota", detalle: "Adelanto de octubre", mes: null }, "PMS")).toBe("PMS: Cuota — Adelanto de octubre");
    expect(conceptoRecibo({ concepto: "pago_unico", detalle: "Pago único", mes: null }, "PMS")).toBe("PMS: Pago único");
    expect(conceptoRecibo({ concepto: "extra", detalle: "Módulo de reportes", mes: null }, "PMS")).toBe("PMS: Extra — Módulo de reportes");
    expect(conceptoRecibo({ concepto: "extra", detalle: " ", mes: null }, "PMS")).toBe("PMS: Extra");
  });
  it("lista las versiones cuya fecha cae en el mes, en orden semver", () => {
    const v = [{ version: "1.4.2", fecha: "2026-10-28" }, { version: "1.4.0", fecha: "2026-10-02" }, { version: "1.10.0", fecha: "2026-10-30" }, { version: "1.3.9", fecha: "2026-09-30" }];
    expect(versionesIncluidas(v, "2026-10")).toBe("Incluye v1.4.0 a v1.10.0");
    expect(versionesIncluidas(v, "2026-09")).toBe("Incluye v1.3.9");
    expect(versionesIncluidas(v, "2026-08")).toBe("");
    expect(versionesIncluidas(v, null)).toBe("");
  });
});

describe("emisor", () => {
  it("dice que falta; completo = lista vacia", () => {
    expect(faltantesEmisor({ nombre: "Neri Colón", rif: "", whatsapp: "", email: " " })).toEqual(["RIF", "WhatsApp", "correo"]);
    expect(faltantesEmisor(DATOS.emisor)).toEqual([]);
  });
  it("celularVisible formatea el 58XXXXXXXXXX y deja lo demas igual", () => {
    expect(celularVisible("584121234567")).toBe("+58 412-1234567");
    expect(celularVisible("0412 123")).toBe("0412 123");
  });
});

describe("render de la plantilla", () => {
  it("recibo: titulo, numero, monto, fechas, canal con etiqueta y pie; escapa el HTML de los datos", () => {
    const html = renderDocumento(PLANTILLA, camposRecibo(DATOS));
    expect(html).toContain("<h1>Recibo de pago</h1>");
    expect(html).toContain("<title>Recibo de pago R-2026-0001 - NERACOSU</title>");
    expect(html).toContain("Emitido el 17/09/2026");
    expect(html).toContain("$1.250,00");
    expect(html).toContain("<dd>16/09/2026</dd>");
    expect(html).toContain("<dd>Pago móvil</dd>");
    expect(html).toContain("+58 412-1234567");
    expect(html).toContain("Hotel &lt;Prueba&gt; &amp; Hijos");
    expect(html).not.toContain("<Prueba>");
    expect(html).toContain("<small>RIF J-40123456-7</small>");
    expect(html).toContain("<small>Contacto: Ana Pérez</small>");
    expect(html).toContain("Incluye v1.4.0 a v1.4.2");
    expect(html).toContain(PIE_RECIBO);
    expect(html).toContain("Recibí de");
    expect(html).not.toContain("Queda anulado");
    expect(html).not.toMatch(/\{\{|<!--si:|<!--fin:/); // no queda ningun marcador
    expect(html).not.toMatch(/<h1>[^<]*[Ff]actura/);   // nunca se titula factura
  });
  it("los bloques opcionales desaparecen cuando el dato viene vacio", () => {
    const html = renderDocumento(PLANTILLA, camposRecibo({ ...DATOS, referencia: "", versiones: "", cliente: { nombre: "Hotel X", rif: "", contactoNombre: "" } }));
    expect(html).not.toContain("Referencia");
    expect(html).not.toContain("Incluye");
    expect(html).not.toContain("<small>RIF ");
    expect(html).not.toContain("Contacto:");
  });
  it("nota de anulacion: dice que recibo anula, cuando y por que", () => {
    const html = renderDocumento(PLANTILLA, camposNota(DATOS, { anuladoEl: "2026-09-20", motivo: "Pago registrado dos veces" }));
    expect(html).toContain("<h1>Nota de anulación</h1>");
    expect(html).toContain('<p class="numero">R-2026-0001-A</p>');
    expect(html).toContain("Emitida el 20/09/2026");
    expect(html).toContain("Queda anulado el recibo");
    expect(html).toContain("emitido el 17/09/2026");
    expect(html).toContain("Pago registrado dos veces");
    expect(html).toContain('class="hoja anulacion"');
    expect(html).toContain(PIE_NOTA);
    expect(html).not.toContain("Recibí de");
    expect(html).not.toContain("Incluye");
  });
  it("una plantilla sin marcadores se rechaza", () => {
    expect(() => renderDocumento("<html></html>", camposRecibo(DATOS))).toThrow("PLANTILLA_SIN_MARCADORES");
  });
  it("el HTML del recibo de ejemplo no cambia sin que alguien lo decida (snapshot)", () => {
    expect(renderDocumento(PLANTILLA, camposRecibo(DATOS))).toMatchSnapshot();
  });
});

describe("fuentes", () => {
  it("lista las fuentes que pide la plantilla y las incrusta como data:", () => {
    expect(fuentesDePlantilla(PLANTILLA)).toEqual(["source-sans-3.woff2", "source-serif-4.woff2"]);
    const html = incrustarFuentes(PLANTILLA, { "source-sans-3.woff2": "QUJD", "source-serif-4.woff2": "REVG" });
    expect(html).toContain('url("data:font/woff2;base64,QUJD")');
    expect(html).toContain('url("data:font/woff2;base64,REVG")');
    expect(html).not.toContain('url("fuentes/');
    expect(() => incrustarFuentes(PLANTILLA, { "source-sans-3.woff2": "QUJD" })).toThrow("FUENTE_FALTANTE:source-serif-4.woff2");
  });
});

describe("mensajeRecibo", () => {
  it("lleva numero, concepto y monto", () => {
    expect(mensajeRecibo({ cliente: "Ana", numero: "R-2026-0001", concepto: "PMS: Extra — Reportes", monto: 350 }))
      .toBe("Buenas, Ana. Le envío el recibo de pago R-2026-0001 por $350,00, correspondiente a PMS: Extra — Reportes. Gracias por su pago.");
  });
});
