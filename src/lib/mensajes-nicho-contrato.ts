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

// Para la carta y el correo de propuesta (29-oct-2026), por arquetipo: lo que se promete en una linea, la credencial
// (copiada de la frase «Mis sistemas funcionan…» del primer mensaje de un nicho de cada arquetipo en
// scripts/sembrar-nichos.mjs) y el antetitulo. Ninguna propone llamadas.
export const PROMESA_POR_ARQUETIPO: Record<string, string> = {
  "hoteles": "la caja y los turnos cerrados cada día",
  "hoteles-estadia": "reservas que se cobran solas por WhatsApp",
  "restaurantes-y-bares": "comandas y caja sin cuaderno",
  "reservas": "reservas con anticipo que no se caen",
  "comercio-y-tienda": "inventario que cuadra y tienda que cobra sola",
  "cobros-y-pagos": "mensualidades que se cobran solas",
  "citas-y-servicios": "su agenda, con el precio ya definido",
};
export const CREDENCIAL_POR_ARQUETIPO: Record<string, string> = {
  "hoteles": "Mis sistemas funcionan en empresas de Caracas, Valencia y el exterior, y uno de ellos controla desde el teléfono las habitaciones, la caja en bolívares y divisas y los turnos de recepción de un hotel.",
  "hoteles-estadia": "Mis sistemas funcionan en empresas de Caracas, Valencia y el exterior: para el Hotel VIP La Guaira construí el bot de WhatsApp que hoy atiende a sus huéspedes, reserva y cobra el anticipo solo, conectado a su página y al sistema que ya usaban; y para un hotel de Valencia la caja en bolívares y divisas y los turnos de recepción.",
  "restaurantes-y-bares": "Mis sistemas funcionan en empresas de Caracas, Valencia y el exterior. Para restaurantes y bares tengo un sistema propio de comandas, caja en bolívares y divisas con la tasa del día y cierre por turno, con un pago único de adaptación y un servicio mensual, y queda a su nombre.",
  "reservas": "Mis sistemas funcionan en empresas de Caracas, Valencia y el exterior. Para canchas y espacios que se alquilan por hora tengo un sistema propio de reservas con calendario, cupo retenido y pago validado, con un pago único de adaptación y un servicio mensual, y queda a su nombre.",
  "comercio-y-tienda": "Mis sistemas funcionan en empresas de Caracas, Valencia y el exterior. Para tiendas con inventario tengo un sistema propio de tienda en línea, catálogo, inventario y cobro en bolívares y divisas con la tasa del día, con un pago único de adaptación y un servicio mensual, y queda a su nombre.",
  "cobros-y-pagos": "Mis sistemas funcionan en empresas de Caracas, Valencia y el exterior. Para gimnasios y academias deportivas tengo un sistema propio de mensualidades con recordatorio automático, pago móvil validado contra el banco y control de quién está al día, que se paga una sola vez y queda a su nombre.",
  "citas-y-servicios": "Mis sistemas funcionan en empresas de Caracas, Valencia y el exterior. Para clínicas y consultorios médicos estoy armando un sistema propio de citas con agenda por profesional, recordatorio al cliente y cobro validado, con un pago único y un servicio mensual, y queda a su nombre.",
};
export const ANTETITULO_POR_ARQUETIPO: Record<string, string> = {
  "hoteles": "Hoteles de alta rotación",
  "hoteles-estadia": "Hoteles que venden por noche",
  "restaurantes-y-bares": "Restaurantes y bares",
  "reservas": "Canchas, salones y espacios",
  "comercio-y-tienda": "Tiendas y comercios",
  "cobros-y-pagos": "Gimnasios, academias e institutos",
  "citas-y-servicios": "Citas y servicios por profesional",
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
