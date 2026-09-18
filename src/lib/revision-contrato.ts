// Textos de la bandeja que ven las dos puntas: la pantalla servidor (la lista de
// lotes) y el componente cliente (la tarjeta del lote). Va aparte de
// src/lib/revision.ts porque ese importa Prisma y un componente cliente no lo
// puede tocar. "overpass" no le dice nada a nadie: el panel muestra de donde
// salio el lote en los mismos terminos de las pestanas de /buscar.
export const ETIQUETA_ORIGEN: Record<string, string> = {
  overpass: "Mapa (OSM)",
  maps: "Google Maps",
  importado: "Importado",
  web: "Lectura de web",
};

export function etiquetaOrigen(origen: string): string {
  return ETIQUETA_ORIGEN[origen] ?? origen;
}

// --- Repetidos que no valen una decision -----------------------------------
// Campos que se pueden rellenar en un existente (nombre y ciudad nunca: son la clave). Los usa completarExistente
// y la regla de abajo: si la fila que llega no trae NADA que el existente no tenga, no hay decision que tomar.
export const CAMPOS_CONTACTO = ["telefono", "whatsapp", "email", "web", "instagram", "facebook", "tiktok", "estado", "tipo", "tamano", "nota"] as const;
export const REPETIDO_EN_ARCHIVO = "Repetido en el mismo archivo";
export const SIN_NADA_NUEVO = "Ya existe y no trae nada nuevo";
type Campos = Partial<Record<(typeof CAMPOS_CONTACTO)[number], string | null | undefined>>;
// true si la fila trae algun dato que al existente le falta.
export function aportaAlgo(existente: Campos, datos: Campos): boolean {
  return CAMPOS_CONTACTO.some((c) => (datos[c] ?? "").toString().trim() && !(existente[c] ?? "").toString().trim());
}
// Una cadena con 40 sucursales entra a la bandeja 40 veces con la misma clave (nombre|ciudad): 39 «repetido en el
// mismo archivo» que nadie deberia tener que descartar a mano (17-sep-2026, Farmatodo en Caracas). Esas, y los
// «ya existe» sin nada nuevo, nacen descartadas. Nada se borra: la fila queda en el lote con su decision.
export function esRepetidoSinValor(errores: string[], existente: Campos | null, datos: Campos): boolean {
  if (errores.includes(REPETIDO_EN_ARCHIVO)) return true;
  return existente !== null && !aportaAlgo(existente, datos);
}

// Filas por pagina de la bandeja. Un lote de 5000 no se puede pintar entero: el
// HTML se va a varios MB y el telefono no lo mueve.
export const POR_PAGINA = 50;

// --- Aprobar en bloque ---------------------------------------------------
// aprobarNuevos() aprueba de a TOPE_APROBACION (500) y devuelve cuantas
// aprobo, cuantas fallaron y cuantas quedan. La pantalla lo llama en bucle, y
// el bucle vive aca, puro y con test: es el que decide cuando parar. Con una
// fila que siempre falla (datos ilegibles), una condicion mal puesta gira sin
// fin y deja la pantalla trabada.
export type EstadoAprobacion = {
  // Acumuladas de todas las pasadas: es el avance que se le muestra a la gente.
  aprobadas: number;
  // De la ULTIMA pasada: decir "12 fallidas" sumando pasadas miente, porque la
  // misma fila vuelve a fallar en cada vuelta.
  fallidas: number;
  quedan: number;
  pasadas: number;
  primerError: string;
};

export type RespuestaAprobacion = { aprobadas: number; fallidas: number; quedan: number; primerError?: string };

export const APROBACION_INICIAL: EstadoAprobacion = { aprobadas: 0, fallidas: 0, quedan: 0, pasadas: 0, primerError: "" };

export function siguientePasada(
  estado: EstadoAprobacion,
  respuesta: RespuestaAprobacion,
): { estado: EstadoAprobacion; seguir: boolean } {
  const nuevo: EstadoAprobacion = {
    aprobadas: estado.aprobadas + respuesta.aprobadas,
    fallidas: respuesta.fallidas,
    quedan: respuesta.quedan,
    pasadas: estado.pasadas + 1,
    // El primero que aparecio, que es el que se muestra: los siguientes suelen
    // ser el mismo texto repetido.
    primerError: estado.primerError || respuesta.primerError || "",
  };
  // Solo se sigue si la pasada movio la aguja Y todavia queda algo. Una pasada
  // que no aprobo nada no va a aprobar nada en la siguiente.
  return { estado: nuevo, seguir: respuesta.aprobadas > 0 && respuesta.quedan > 0 };
}
