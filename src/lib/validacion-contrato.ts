import { MONTO_TEXTO } from "@/lib/dinero";
import { esFechaIso } from "@/lib/fecha-caracas";

// Validacion en linea de los formularios (pasada de UX, fase C). COPIA las reglas de zod del servidor: el servidor
// sigue mandando; esto solo dice antes, pegado al campo, lo que el servidor diria despues. Puro: lo importa el
// navegador y los tests.
export type Regla =
  | { tipo: "texto"; min?: number; max: number }
  | { tipo: "monto" }
  | { tipo: "fecha" }
  | { tipo: "entero"; min: number; max: number };
// No hay regla de correo ni de url: el servidor acepta cualquier texto (un hotel publica «reservas@x.com /
// ventas@x.com», o una web sin http://). Lo que el servidor no exige, el navegador tampoco.

export const FALTA = "Este dato hace falta.";

// Devuelve el mensaje para la persona, o "" si el valor esta bien.
export function validar(regla: Regla, valor: string, requerido: boolean): string {
  const v = (valor ?? "").trim();
  if (!v) return requerido ? FALTA : "";
  switch (regla.tipo) {
    case "texto":
      if (regla.min && v.length < regla.min) return `Mínimo ${regla.min} letras.`;
      if (v.length > regla.max) return `Máximo ${regla.max} letras.`;
      return "";
    case "monto":
      return MONTO_TEXTO.test(v) ? "" : "Escribe el monto sin punto de miles, por ejemplo 150 o 150,50.";
    case "fecha":
      return esFechaIso(v) ? "" : "Escribe una fecha válida.";
    case "entero": {
      const n = /^-?\d+$/.test(v) ? Number(v) : NaN;
      return Number.isInteger(n) && n >= regla.min && n <= regla.max ? "" : `Tiene que ser un número entre ${regla.min} y ${regla.max}.`;
    }
  }
}
