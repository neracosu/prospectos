// Plantillas de Nicho: {nombre}, {enlace}. Una variable desconocida se deja
// tal cual para que se note en pantalla en vez de desaparecer.
export function rellenar(plantilla: string, valores: Record<string, string>): string {
  return plantilla.replace(/\{([a-zA-Z_]+)\}/g, (todo, clave: string) =>
    Object.prototype.hasOwnProperty.call(valores, clave) ? valores[clave] : todo,
  );
}

// Arma un mensaje de WhatsApp desde una plantilla de Ajustes. El renglon que lleva {enlace} (el portal del
// cliente) se quita ENTERO cuando no hay enlace, para que no quede una frase colgando. Si al quitarlo no
// quedara nada que decir (plantilla de un solo renglon), se conserva y {enlace} sale vacio.
export function armarMensaje(plantilla: string, valores: Record<string, string>): string {
  const renglones = plantilla.split("\n");
  const sinPortal = renglones.filter((r) => !r.includes("{enlace}"));
  const usar = !valores.enlace && sinPortal.some((r) => r.trim() !== "") ? sinPortal : renglones;
  return usar
    .map((r) => rellenar(r, valores).replace(/[^\S\n]{2,}/g, " ").replace(/[^\S\n]+$/gm, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+$/, "");
}

// El mensaje de prospeccion de un nicho ({nombre}, {enlace}, {promo}). Una variable que sale vacia no deja dos
// espacios seguidos ni un espacio colgando al final.
export function mensajeDeProspecto(base: string, valores: { nombre: string; enlace: string; promo: string }): string {
  return rellenar(base, valores).replace(/ {2,}/g, " ").trim();
}
