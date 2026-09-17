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
