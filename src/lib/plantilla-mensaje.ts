// Plantillas de Nicho: {nombre}, {enlace}. Una variable desconocida se deja
// tal cual para que se note en pantalla en vez de desaparecer.
export function rellenar(plantilla: string, valores: Record<string, string>): string {
  return plantilla.replace(/\{([a-zA-Z_]+)\}/g, (todo, clave: string) =>
    Object.prototype.hasOwnProperty.call(valores, clave) ? valores[clave] : todo,
  );
}
