import { describe, it, expect } from "vitest";
import { parsearTabla, validarFila } from "@/lib/tabla-contrato";

describe("parsearTabla", () => {
  it("lee TSV pegado desde Excel con encabezados en cualquier orden y mayusculas", () => {
    const r = parsearTabla("Nombre\tCiudad\tNICHO\tWhatsApp\tTamaño\nHotel A\tCaracas\thoteles\t0412 111 22 33\t20 hab.\n");
    expect(r.desconocidas).toEqual([]);
    expect(r.filas[0]).toMatchObject({ nombre: "Hotel A", ciudad: "Caracas", nicho: "hoteles", whatsapp: "0412 111 22 33", tamano: "20 hab." });
  });
  it("lee CSV con ; y con , y comillas; ignora columnas desconocidas y las reporta", () => {
    expect(parsearTabla('nombre;ciudad;nicho;color\n"Farmacia, La";Valencia;farmacias;rojo\n').filas[0]).toMatchObject({ nombre: "Farmacia, La", ciudad: "Valencia" });
    const r = parsearTabla("nombre,ciudad,nicho,color\nA,B,hoteles,rojo\n");
    expect(r.desconocidas).toEqual(["color"]);
    expect(r.filas[0].nombre).toBe("A");
  });
  it("rechaza mas de 5000 filas y tablas vacias", () => {
    const grande = "nombre\tciudad\tnicho\n" + "A\tB\thoteles\n".repeat(5001);
    expect(parsearTabla(grande).error).toMatch(/pártelo/);
    expect(parsearTabla("").error).toBeTruthy();
  });
  it("descarta la celda vacia de un separador colgante al final del encabezado", () => {
    const r = parsearTabla("nombre;ciudad;nicho;\nA;B;hoteles;\n");
    expect(r.desconocidas).toEqual([]);
    expect(r.filas[0]).toMatchObject({ nombre: "A", ciudad: "B", nicho: "hoteles" });
  });
});

describe("validarFila", () => {
  const base = { nicho: "hoteles", nombre: "Hotel A", ciudad: "Caracas", estado: "", tipo: "", tamano: "", telefono: "0212 555 1234", whatsapp: "", email: "", web: "", instagram: "@hotela", facebook: "", tiktok: "", nota: "", fuente: "https://hotela.com/contacto" };
  it("normaliza y arma las fuentes por campo", () => {
    const { entrada, errores } = validarFila(base);
    expect(errores).toEqual([]);
    expect(entrada).toMatchObject({ nicho: "hoteles", nombre: "Hotel A", whatsapp: "", telefono: "0212 555 1234", instagram: "https://www.instagram.com/hotela/", fuentes: ["https://hotela.com/contacto"] });
    expect(entrada.fuentesPorCampo).toEqual({ nombre: "https://hotela.com/contacto", ciudad: "https://hotela.com/contacto", telefono: "https://hotela.com/contacto", instagram: "https://hotela.com/contacto" });
  });
  it("marca errores: sin ciudad, whatsapp sin formato", () => {
    expect(validarFila({ ...base, ciudad: "" }).errores).toContain("Falta la ciudad");
    expect(validarFila({ ...base, whatsapp: "12345" }).errores).toContain("WhatsApp sin formato");
    expect(validarFila({ ...base, whatsapp: "+58 412 3229005" }).entrada.whatsapp).toBe("584123229005");
  });
});
