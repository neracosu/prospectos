// Cierre de los mensajes de WhatsApp por nicho (29-oct-2026). Lo que aprendimos con los ultimos prospectos: el
// primer mensaje no vende un PDF ni pide una reunion; pide dos lineas sobre como opera el negocio (eso califica) y
// ofrece el diagnostico gratis por escrito y, cuando el caso lo permite, una demostracion con su marca para verla en
// el telefono antes de pagar nada. Nunca una llamada: de cara al cliente se dice lo que SI se ofrece, en positivo.
// Lo usan scripts/ajustar-mensajes.mts (sobre la base, sin pisar lo editado) y la semilla scripts/sembrar-nichos.mjs.

// Que se le pide que cuente, por arquetipo de propuesta. Es la pregunta que califica al prospecto.
export const PREGUNTA_POR_ARQUETIPO: Record<string, string> = {
  "hoteles": "cuántas habitaciones tiene y cómo llevan hoy la caja y los turnos",
  "hoteles-estadia": "cuántas habitaciones tiene y cómo lleva hoy las reservas",
  "restaurantes-y-bares": "cuántas mesas atiende y cómo toman hoy las comandas y cierran la caja",
  "reservas": "qué espacios alquila y cómo aparta y cobra hoy las reservas",
  "comercio-y-tienda": "cuántos productos maneja y cómo lleva hoy el inventario",
  "cobros-y-pagos": "cuántos alumnos tiene y cómo cobra hoy la mensualidad",
  "citas-y-servicios": "cuántos profesionales atienden y cómo agendan hoy",
  "": "cómo opera hoy",
};

function pregunta(arquetipo: string | null): string {
  return PREGUNTA_POR_ARQUETIPO[arquetipo ?? ""] ?? PREGUNTA_POR_ARQUETIPO[""];
}

// En citas la agenda por profesional NO esta construida: no se promete demostracion, se dice que esta hecho y que falta.
export function cierreInicial(arquetipo: string | null): string {
  if (arquetipo === "citas-y-servicios") {
    return `Si me cuenta en dos líneas ${pregunta(arquetipo)}, le respondo yo con un diagnóstico gratis por escrito: qué está construido, qué falta y el plazo de cada fase, antes de pagar nada.`;
  }
  return `Si me cuenta en dos líneas ${pregunta(arquetipo)}, le respondo yo con un diagnóstico gratis por escrito y, cuando el caso lo permite, una demostración con su marca para que la vea en su teléfono antes de pagar nada.`;
}

export function cierreSeguimiento(arquetipo: string | null): string {
  if (arquetipo === "citas-y-servicios") {
    return `Si prefiere, cuénteme en dos líneas ${pregunta(arquetipo)} y le respondo con un diagnóstico gratis por escrito, con lo que está construido y lo que falta.`;
  }
  return `Si prefiere verlo antes que leerlo, cuénteme en dos líneas ${pregunta(arquetipo)} y le respondo con un diagnóstico gratis por escrito y, cuando el caso lo permite, una demostración con su marca para su teléfono.`;
}

// Cambia SOLO la frase final del mensaje viejo («¿Le parece si en 30 minutos…?» / «Si prefiere, … llamada de 30
// minutos.») por el cierre nuevo. Un mensaje que Neri ya editó y no trae esa frase queda igual. Idempotente.
export function pasarAlEnganche(texto: string, arquetipo: string | null, tipo: "inicial" | "seguimiento"): string {
  if (tipo === "inicial") {
    return texto.replace(/\s*¿Le parece si en 30 minutos [^?]*\?\s*$/, ` ${cierreInicial(arquetipo)}`).trim();
  }
  return texto.replace(/Si prefiere, [^.]*30 minutos\.(?=\s*Quedo atento\.\s*$)/, cierreSeguimiento(arquetipo)).trim();
}
