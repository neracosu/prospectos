// Lo que se le escribe a un prospecto de Colombia (etapa 1, 6-oct-2026). Las propuestas del panel estan escritas para
// Venezuela (pago movil, tasa del dia, referencias de La Guaira): a un negocio colombiano NO se le manda ese enlace.
// Se le escribe un mensaje propio, sin {enlace}, que dice lo que Neri ofrece alla: la plataforma con el cobro en linea
// integrado a Wompi. Variables: {nombre}, {ciudad}, {rubro} y {promo}. Las propuestas en version Colombia son la etapa 2.
export const MENSAJE_CO_INICIAL =
  "Buenas, equipo de {nombre}. Soy Neri Colón, desarrollador de sistemas. Mis sistemas funcionan hoy en empresas de Venezuela y el exterior, y estoy empezando a trabajar con negocios de {ciudad}. Para {rubro} tengo un sistema propio que se adapta a su operación y queda a su nombre, con el cobro en línea integrado a Wompi. {promo} ¿Le parece si lo conversamos 30 minutos?";
export const MENSAJE_CO_SEGUIMIENTO =
  "Buenas de nuevo, equipo de {nombre}. Le escribí hace unos días sobre un sistema propio para {rubro}, con el cobro en línea integrado a Wompi. Si le interesa, lo conversamos en una llamada de 30 minutos. Quedo atento.";

// Etapa 2: los arquetipos cuya plantilla ya tiene sus bloques <!--si:co--> revisados y aprobados por Neri. Solo los
// prospectos colombianos de esos nichos reciben el enlace a la propuesta; los demas, el mensaje sin enlace.
// VACIA a proposito hasta que Neri apruebe la primera (restaurantes-y-bares esta escrita, falta su visto bueno).
export const PLANTILLAS_CON_COLOMBIA: string[] = [];

export const MENSAJE_CO_INICIAL_CON_PROPUESTA =
  "Buenas, equipo de {nombre}. Soy Neri Colón, desarrollador de sistemas. Mis sistemas funcionan hoy en empresas de Venezuela y el exterior, y estoy empezando a trabajar con negocios de {ciudad}. Para {rubro} tengo un sistema propio que se adapta a su operación y queda a su nombre, con el cobro en línea integrado a Wompi. Le preparé una propuesta de 9 páginas para {nombre}: {enlace} {promo} ¿Le parece si lo conversamos 30 minutos?";
export const MENSAJE_CO_SEGUIMIENTO_CON_PROPUESTA =
  "Buenas de nuevo, equipo de {nombre}. Le escribí hace unos días con una propuesta para {rubro}: {enlace} Si le interesa, lo conversamos en una llamada de 30 minutos. Quedo atento.";

export function mensajeColombia(
  plantillaPropuesta: string, tipo: "inicial" | "seguimiento", conVersion: string[] = PLANTILLAS_CON_COLOMBIA,
): { base: string; conPropuesta: boolean } {
  const conPropuesta = plantillaPropuesta !== "" && conVersion.includes(plantillaPropuesta);
  if (conPropuesta) return { base: tipo === "inicial" ? MENSAJE_CO_INICIAL_CON_PROPUESTA : MENSAJE_CO_SEGUIMIENTO_CON_PROPUESTA, conPropuesta };
  return { base: tipo === "inicial" ? MENSAJE_CO_INICIAL : MENSAJE_CO_SEGUIMIENTO, conPropuesta };
}
