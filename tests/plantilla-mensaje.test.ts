import { describe, it, expect } from "vitest";
import { rellenar, armarMensaje } from "@/lib/plantilla-mensaje";

describe("rellenar", () => {
  it("sustituye {nombre} y {enlace} todas las veces", () => {
    expect(rellenar("Hola {nombre}. Mira {enlace}. Gracias, {nombre}.", { nombre: "Hotel Yare", enlace: "https://x/p/abc" }))
      .toBe("Hola Hotel Yare. Mira https://x/p/abc. Gracias, Hotel Yare.");
  });
  it("deja intacta una variable que no conoce", () => {
    expect(rellenar("Hola {nombre}, {monto}", { nombre: "A" })).toBe("Hola A, {monto}");
  });
  it("no interpreta llaves dentro del valor", () => {
    expect(rellenar("{nombre}", { nombre: "{enlace}" })).toBe("{enlace}");
  });
});

describe("armarMensaje", () => {
  const plantilla = "Buenas, {cliente}.\nYa quedó listo: {hito}.\nPuede verlo en su portal: {enlace}\nCualquier duda me escribe.";
  it("con enlace rellena todo", () => {
    expect(armarMensaje(plantilla, { cliente: "Ana", hito: "Recepción", enlace: "https://x.test/c/abc" }))
      .toBe("Buenas, Ana.\nYa quedó listo: Recepción.\nPuede verlo en su portal: https://x.test/c/abc\nCualquier duda me escribe.");
  });
  it("sin enlace quita ENTERO el renglon que lo lleva: no queda una frase colgando", () => {
    expect(armarMensaje(plantilla, { cliente: "Ana", hito: "Recepción", enlace: "" }))
      .toBe("Buenas, Ana.\nYa quedó listo: Recepción.\nCualquier duda me escribe.");
  });
  it("una plantilla de un solo renglon no se queda vacia: conserva el renglon y {enlace} sale vacio", () => {
    expect(armarMensaje("Hola {cliente}, mire {enlace}", { cliente: "Ana", enlace: "" })).toBe("Hola Ana, mire");
    expect(armarMensaje("{enlace}\n   ", { enlace: "" })).toBe("");
  });
  it("colapsa espacios de mas, recorta cada renglon y no deja mas de un renglon vacio seguido", () => {
    expect(armarMensaje("a  b   \n\n\n\nc {enlace}\nd", { enlace: "" })).toBe("a b\n\nd");
  });
  it("un valor con varios renglones entra tal cual y un valor con llaves no se vuelve a rellenar", () => {
    expect(armarMensaje("Cambios:\n{cambios}", { cambios: "• uno\n• {enlace}", enlace: "https://x" })).toBe("Cambios:\n• uno\n• {enlace}");
  });
});

import { mensajeDeProspecto } from "@/lib/plantilla-mensaje";
import { fraseDePromo } from "@/lib/propuesta-contrato";

describe("mensaje del prospecto con el gancho de la temporada", () => {
  const base = "Hola, {nombre}. Propuesta: {enlace} {promo} ¿Le parece si hablamos?";
  it("mientras dura la temporada mete la frase del 40 %", () => {
    for (const hoy of ["2026-10-05", "2026-12-31"]) {
      expect(mensajeDeProspecto(base, { nombre: "Bar Uno", enlace: "https://x/p/1", promo: fraseDePromo(hoy) }))
        .toBe("Hola, Bar Uno. Propuesta: https://x/p/1 Hasta el 31 de diciembre hay 40 % de descuento en el pago único. ¿Le parece si hablamos?");
    }
  });
  it("pasada la fecha la frase desaparece sin dejar el hueco ni la variable a la vista", () => {
    expect(fraseDePromo("2027-01-01")).toBe("");
    expect(mensajeDeProspecto(base, { nombre: "Bar Uno", enlace: "https://x/p/1", promo: fraseDePromo("2027-01-01") }))
      .toBe("Hola, Bar Uno. Propuesta: https://x/p/1 ¿Le parece si hablamos?");
  });
  it("un mensaje sin {promo} sale igual que antes, y sin enlace no queda nada colgando", () => {
    expect(mensajeDeProspecto("Hola, {nombre}: {enlace}", { nombre: "Bar", enlace: "", promo: "x" })).toBe("Hola, Bar:");
  });
});

import { MENSAJE_CO_INICIAL, MENSAJE_CO_SEGUIMIENTO } from "@/lib/colombia-contrato";

describe("mensajes para prospectos de Colombia", () => {
  it("hablan de Wompi y no de lo que solo existe en Venezuela, y no mandan la propuesta venezolana", () => {
    for (const m of [MENSAJE_CO_INICIAL, MENSAJE_CO_SEGUIMIENTO]) {
      expect(m).toContain("{nombre}");
      expect(m).not.toContain("{enlace}");
      expect(m).not.toMatch(/bol[ií]var|pago m[oó]vil|BCV|tasa del d[ií]a|Caracas|Valencia/i);
    }
    expect(MENSAJE_CO_INICIAL).toContain("Wompi");
    expect(MENSAJE_CO_INICIAL).toContain("{promo}");
  });
  it("se arma con el nombre, la ciudad y el rubro, y el gancho de la temporada", () => {
    const m = mensajeDeProspecto(MENSAJE_CO_INICIAL, { nombre: "Café Tinto", enlace: "", promo: fraseDePromo("2026-10-05"), ciudad: "Cali", rubro: "restaurantes y bares" });
    expect(m).toContain("equipo de Café Tinto");
    expect(m).toContain("Cali");
    expect(m).toContain("restaurantes y bares");
    expect(m).toContain("40 % de descuento");
    expect(m).not.toMatch(/\{[a-z]+\}/);
    expect(m).not.toContain("  ");
  });
});

import { mensajeColombia } from "@/lib/colombia-contrato";

describe("que se le manda a un prospecto de Colombia segun su nicho tenga o no propuesta en version Colombia", () => {
  it("sin version Colombia: mensaje sin enlace y sin propuesta", () => {
    const m = mensajeColombia("hoteles", "inicial", ["restaurantes-y-bares"]);
    expect(m.conPropuesta).toBe(false);
    expect(m.base).not.toContain("{enlace}");
  });
  it("con version Colombia: el primer mensaje y el seguimiento llevan el enlace", () => {
    for (const tipo of ["inicial", "seguimiento"] as const) {
      const m = mensajeColombia("restaurantes-y-bares", tipo, ["restaurantes-y-bares"]);
      expect([tipo, m.conPropuesta, m.base.includes("{enlace}"), /bol[ií]var|pago m[oó]vil/i.test(m.base)]).toEqual([tipo, true, true, false]);
    }
    expect(mensajeColombia("restaurantes-y-bares", "inicial", ["restaurantes-y-bares"]).base).toContain("{promo}");
  });
  it("un nicho sin plantilla nunca tiene propuesta", () => {
    expect(mensajeColombia("", "inicial", [""]).conPropuesta).toBe(false);
  });
});
