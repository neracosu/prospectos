#!/usr/bin/env node
// Nichos iniciales. Idempotente: no pisa mensajes ya editados desde Ajustes.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const NICHOS = [
  {
    slug: "hoteles", nombre: "Hoteles", plantillaPropuesta: "hoteles", diasSeguimiento: 3,
    // Mismo mensaje que la lista de hoteles (armar.py), mas el enlace.
    mensajeInicial: "Buenas, equipo de {nombre}. Soy Neri Colón, desarrollador de sistemas. Mis sistemas funcionan en empresas de Caracas, Valencia y el exterior, y uno de ellos controla desde el teléfono las habitaciones, la caja en bolívares y divisas y los turnos de recepción de un hotel. Preparé una propuesta de 9 páginas pensada para {nombre}: {enlace} ¿Le parece si en 30 minutos se la muestro funcionando?",
    mensajeSeguimiento: "Buenas de nuevo, equipo de {nombre}. Le escribí hace unos días con una propuesta para el hotel: {enlace} Si prefiere, le muestro el sistema funcionando en una llamada de 30 minutos. Quedo atento.",
    // Etiquetas OSM para el buscador (pieza 2). Desde el 17-sep solo motel: los tourism=hotel y guest_house entran por
    // «hoteles de estadia», y si uno es de paso se le corrige el nicho en la bandeja.
    etiquetaOsm: [["tourism", "motel"]],
  },
  {
    // Hoteles que venden por noche (urbanos, economicos, posadas): otra propuesta y otro mensaje que los de paso.
    // Los prospectos se reparten con scripts/dividir-hoteles.mts segun Prospecto.tipo.
    slug: "hoteles-estadia", nombre: "Hoteles de estadía", plantillaPropuesta: "hoteles-estadia", diasSeguimiento: 3,
    mensajeInicial: "Buenas, equipo de {nombre}. Soy Neri Colón, desarrollador de sistemas. Mis sistemas funcionan en empresas de Caracas, Valencia y el exterior: para el Hotel VIP La Guaira construí su página de reservas en línea conectada al sistema que ya usaban, y para un hotel de Valencia la caja en bolívares y divisas y los turnos de recepción. Preparé una propuesta de 9 páginas pensada para {nombre}: vender sus noches por su propia página, sin comisión y con el anticipo validado antes de bloquear la habitación: {enlace} ¿Le parece si en 30 minutos se la muestro funcionando?",
    mensajeSeguimiento: "Buenas de nuevo, equipo de {nombre}. Le escribí hace unos días con una propuesta para vender sus noches por su propia página, sin comisión: {enlace} Si prefiere, se la muestro funcionando en una llamada de 30 minutos. Quedo atento.",
    // Mismas etiquetas OSM que hoteles: el buscador no distingue el segmento; se decide en la bandeja por el tipo.
    etiquetaOsm: [["tourism", "hotel"], ["tourism", "guest_house"]],
  },
  {
    // Restaurantes y bares: el arquetipo de neracosu.com/para/restaurantes-y-bares.html (producto con precios publicados).
    // Sin plantilla de propuesta en el panel: el mensaje manda a la pagina publica.
    slug: "restaurantes-y-bares", nombre: "Restaurantes y bares", plantillaPropuesta: "", diasSeguimiento: 3,
    mensajeInicial: "Buenas, equipo de {nombre}. Soy Neri Colón, desarrollador de sistemas. Mis sistemas funcionan en empresas de Caracas, Valencia y el exterior. Para restaurantes y bares tengo un sistema propio de comandas, caja en bolívares y divisas con la tasa del día y cierre por turno, que se paga una sola vez y queda a su nombre: https://neracosu.com/para/restaurantes-y-bares.html ¿Le parece si en 30 minutos se lo muestro funcionando?",
    mensajeSeguimiento: "Buenas de nuevo, equipo de {nombre}. Le escribí hace unos días por el sistema para el local: https://neracosu.com/para/restaurantes-y-bares.html Si prefiere, se lo muestro funcionando en una llamada de 30 minutos. Quedo atento.",
    etiquetaOsm: [["amenity", "restaurant"], ["amenity", "bar"], ["amenity", "cafe"], ["amenity", "pub"]],
  },
  {
    // Canchas, complejos deportivos y salones: el arquetipo de reservas (neracosu.com/para/reservas.html).
    slug: "canchas-y-espacios", nombre: "Canchas y espacios", plantillaPropuesta: "", diasSeguimiento: 3,
    mensajeInicial: "Buenas, equipo de {nombre}. Soy Neri Colón, desarrollador de sistemas. Mis sistemas funcionan en empresas de Caracas, Valencia y el exterior. Para canchas y espacios que se alquilan por hora tengo un sistema propio de reservas con calendario, cupo retenido y pago validado, que se paga una sola vez y queda a su nombre: https://neracosu.com/para/reservas.html ¿Le parece si en 30 minutos se lo muestro funcionando?",
    mensajeSeguimiento: "Buenas de nuevo, equipo de {nombre}. Le escribí hace unos días por el sistema de reservas: https://neracosu.com/para/reservas.html Si prefiere, se lo muestro funcionando en una llamada de 30 minutos. Quedo atento.",
    etiquetaOsm: [["leisure", "sports_centre"], ["amenity", "events_venue"], ["leisure", "sports_hall"]],
  },
  {
    // Licorerias y bodegones: comercio con inventario (neracosu.com/para/comercio-y-tienda.html).
    slug: "licorerias-y-bodegones", nombre: "Licorerías y bodegones", plantillaPropuesta: "", diasSeguimiento: 3,
    mensajeInicial: "Buenas, equipo de {nombre}. Soy Neri Colón, desarrollador de sistemas. Mis sistemas funcionan en empresas de Caracas, Valencia y el exterior. Para tiendas con inventario tengo un sistema propio de ventas, inventario y caja en bolívares y divisas con la tasa del día, que se paga una sola vez y queda a su nombre: https://neracosu.com/para/comercio-y-tienda.html ¿Le parece si en 30 minutos se lo muestro funcionando?",
    mensajeSeguimiento: "Buenas de nuevo, equipo de {nombre}. Le escribí hace unos días por el sistema para la tienda: https://neracosu.com/para/comercio-y-tienda.html Si prefiere, se lo muestro funcionando en una llamada de 30 minutos. Quedo atento.",
    etiquetaOsm: [["shop", "alcohol"], ["shop", "wine"], ["shop", "beverages"]],
  },
  {
    // Arquetipo de citas por profesional (neracosu.com/para/citas-y-servicios.html): la agenda NO esta construida y la
    // pagina lo dice; el mensaje ofrece el diagnostico, no un sistema listo. Sin plantilla de propuesta en el panel.
    slug: "odontologias", nombre: "Odontologías", plantillaPropuesta: "", diasSeguimiento: 3,
    mensajeInicial: "Buenas, equipo de {nombre}. Soy Neri Colón, desarrollador de sistemas. Mis sistemas funcionan en empresas de Caracas, Valencia y el exterior. Para consultorios odontológicos estoy armando un sistema propio de citas con agenda por profesional, recordatorio al cliente y cobro validado, que se paga una sola vez y queda a su nombre. Antes de construirlo quiero verlo con negocios reales: https://neracosu.com/para/citas-y-servicios.html ¿Le parece si en 30 minutos le cuento cómo funcionaría en {nombre}?",
    mensajeSeguimiento: "Buenas de nuevo, equipo de {nombre}. Le escribí hace unos días por el sistema de citas para consultorios odontológicos: https://neracosu.com/para/citas-y-servicios.html Si prefiere, lo conversamos en una llamada de 30 minutos. Quedo atento.",
    etiquetaOsm: [["amenity", "dentist"], ["healthcare", "dentist"]],
  },
  {
    // Arquetipo de citas por profesional (neracosu.com/para/citas-y-servicios.html): la agenda NO esta construida y la
    // pagina lo dice; el mensaje ofrece el diagnostico, no un sistema listo. Sin plantilla de propuesta en el panel.
    slug: "peluquerias-y-barberias", nombre: "Peluquerías y barberías", plantillaPropuesta: "", diasSeguimiento: 3,
    mensajeInicial: "Buenas, equipo de {nombre}. Soy Neri Colón, desarrollador de sistemas. Mis sistemas funcionan en empresas de Caracas, Valencia y el exterior. Para peluquerías y barberías estoy armando un sistema propio de citas con agenda por profesional, recordatorio al cliente y cobro validado, que se paga una sola vez y queda a su nombre. Antes de construirlo quiero verlo con negocios reales: https://neracosu.com/para/citas-y-servicios.html ¿Le parece si en 30 minutos le cuento cómo funcionaría en {nombre}?",
    mensajeSeguimiento: "Buenas de nuevo, equipo de {nombre}. Le escribí hace unos días por el sistema de citas para peluquerías y barberías: https://neracosu.com/para/citas-y-servicios.html Si prefiere, lo conversamos en una llamada de 30 minutos. Quedo atento.",
    etiquetaOsm: [["shop", "hairdresser"], ["shop", "barber"]],
  },
  {
    // Arquetipo de citas por profesional (neracosu.com/para/citas-y-servicios.html): la agenda NO esta construida y la
    // pagina lo dice; el mensaje ofrece el diagnostico, no un sistema listo. Sin plantilla de propuesta en el panel.
    slug: "spas-y-estetica", nombre: "Spas y estética", plantillaPropuesta: "", diasSeguimiento: 3,
    mensajeInicial: "Buenas, equipo de {nombre}. Soy Neri Colón, desarrollador de sistemas. Mis sistemas funcionan en empresas de Caracas, Valencia y el exterior. Para spas y centros de estética estoy armando un sistema propio de citas con agenda por profesional, recordatorio al cliente y cobro validado, que se paga una sola vez y queda a su nombre. Antes de construirlo quiero verlo con negocios reales: https://neracosu.com/para/citas-y-servicios.html ¿Le parece si en 30 minutos le cuento cómo funcionaría en {nombre}?",
    mensajeSeguimiento: "Buenas de nuevo, equipo de {nombre}. Le escribí hace unos días por el sistema de citas para spas y centros de estética: https://neracosu.com/para/citas-y-servicios.html Si prefiere, lo conversamos en una llamada de 30 minutos. Quedo atento.",
    etiquetaOsm: [["shop", "beauty"], ["shop", "massage"], ["leisure", "spa"], ["shop", "cosmetics"]],
  },
  {
    // Arquetipo de citas por profesional (neracosu.com/para/citas-y-servicios.html): la agenda NO esta construida y la
    // pagina lo dice; el mensaje ofrece el diagnostico, no un sistema listo. Sin plantilla de propuesta en el panel.
    slug: "clinicas-y-consultorios", nombre: "Clínicas y consultorios", plantillaPropuesta: "", diasSeguimiento: 3,
    mensajeInicial: "Buenas, equipo de {nombre}. Soy Neri Colón, desarrollador de sistemas. Mis sistemas funcionan en empresas de Caracas, Valencia y el exterior. Para clínicas y consultorios médicos estoy armando un sistema propio de citas con agenda por profesional, recordatorio al cliente y cobro validado, que se paga una sola vez y queda a su nombre. Antes de construirlo quiero verlo con negocios reales: https://neracosu.com/para/citas-y-servicios.html ¿Le parece si en 30 minutos le cuento cómo funcionaría en {nombre}?",
    mensajeSeguimiento: "Buenas de nuevo, equipo de {nombre}. Le escribí hace unos días por el sistema de citas para clínicas y consultorios médicos: https://neracosu.com/para/citas-y-servicios.html Si prefiere, lo conversamos en una llamada de 30 minutos. Quedo atento.",
    etiquetaOsm: [["amenity", "clinic"], ["amenity", "doctors"], ["healthcare", "clinic"]],
  },
  {
    // Arquetipo de citas por profesional (neracosu.com/para/citas-y-servicios.html): la agenda NO esta construida y la
    // pagina lo dice; el mensaje ofrece el diagnostico, no un sistema listo. Sin plantilla de propuesta en el panel.
    slug: "veterinarias", nombre: "Veterinarias", plantillaPropuesta: "", diasSeguimiento: 3,
    mensajeInicial: "Buenas, equipo de {nombre}. Soy Neri Colón, desarrollador de sistemas. Mis sistemas funcionan en empresas de Caracas, Valencia y el exterior. Para veterinarias estoy armando un sistema propio de citas con agenda por profesional, recordatorio al cliente y cobro validado, que se paga una sola vez y queda a su nombre. Antes de construirlo quiero verlo con negocios reales: https://neracosu.com/para/citas-y-servicios.html ¿Le parece si en 30 minutos le cuento cómo funcionaría en {nombre}?",
    mensajeSeguimiento: "Buenas de nuevo, equipo de {nombre}. Le escribí hace unos días por el sistema de citas para veterinarias: https://neracosu.com/para/citas-y-servicios.html Si prefiere, lo conversamos en una llamada de 30 minutos. Quedo atento.",
    etiquetaOsm: [["amenity", "veterinary"]],
  },
  {
    // Nichos del archivo que Neri importo el 17-sep (Instagram como canal principal). Arquetipo comercio y tienda.
    slug: "emprendimientos-moda", nombre: "Emprendimientos de moda", plantillaPropuesta: "", diasSeguimiento: 3,
    mensajeInicial: "Buenas, equipo de {nombre}. Soy Neri Colón, desarrollador de sistemas. Mis sistemas funcionan en empresas de Caracas, Valencia y el exterior. Para tiendas de ropa, calzado y accesorios tengo un sistema propio de pedidos por WhatsApp e Instagram, catálogo, inventario y cobro en bolívares y divisas con la tasa del día, que se paga una sola vez y queda a su nombre: https://neracosu.com/para/comercio-y-tienda.html ¿Le parece si en 30 minutos se lo muestro funcionando?",
    mensajeSeguimiento: "Buenas de nuevo, equipo de {nombre}. Le escribí hace unos días por el sistema para tiendas de ropa, calzado y accesorios: https://neracosu.com/para/comercio-y-tienda.html Si prefiere, se lo muestro funcionando en una llamada de 30 minutos. Quedo atento.",
    etiquetaOsm: [["shop", "clothes"], ["shop", "shoes"], ["shop", "boutique"], ["shop", "bag"]],
  },
  {
    // Arquetipo comercio y tienda: pedidos y cobro, no comandas de salon.
    slug: "emprendimientos-comida", nombre: "Emprendimientos de comida", plantillaPropuesta: "", diasSeguimiento: 3,
    mensajeInicial: "Buenas, equipo de {nombre}. Soy Neri Colón, desarrollador de sistemas. Mis sistemas funcionan en empresas de Caracas, Valencia y el exterior. Para negocios de comida por encargo tengo un sistema propio de pedidos por WhatsApp e Instagram, catálogo, inventario y cobro en bolívares y divisas con la tasa del día, que se paga una sola vez y queda a su nombre: https://neracosu.com/para/comercio-y-tienda.html ¿Le parece si en 30 minutos se lo muestro funcionando?",
    mensajeSeguimiento: "Buenas de nuevo, equipo de {nombre}. Le escribí hace unos días por el sistema para negocios de comida por encargo: https://neracosu.com/para/comercio-y-tienda.html Si prefiere, se lo muestro funcionando en una llamada de 30 minutos. Quedo atento.",
    etiquetaOsm: [["shop", "bakery"], ["shop", "confectionery"], ["shop", "pastry"]],
  },
  {
    // Arquetipo comercio y tienda.
    slug: "comercio", nombre: "Comercio", plantillaPropuesta: "", diasSeguimiento: 3,
    mensajeInicial: "Buenas, equipo de {nombre}. Soy Neri Colón, desarrollador de sistemas. Mis sistemas funcionan en empresas de Caracas, Valencia y el exterior. Para tiendas con inventario tengo un sistema propio de pedidos por WhatsApp e Instagram, catálogo, inventario y cobro en bolívares y divisas con la tasa del día, que se paga una sola vez y queda a su nombre: https://neracosu.com/para/comercio-y-tienda.html ¿Le parece si en 30 minutos se lo muestro funcionando?",
    mensajeSeguimiento: "Buenas de nuevo, equipo de {nombre}. Le escribí hace unos días por el sistema para tiendas con inventario: https://neracosu.com/para/comercio-y-tienda.html Si prefiere, se lo muestro funcionando en una llamada de 30 minutos. Quedo atento.",
    etiquetaOsm: [["shop", "convenience"], ["shop", "hardware"], ["shop", "electronics"], ["shop", "variety_store"]],
  },
  {
    // Arquetipo comercio y tienda.
    slug: "cosmeticos", nombre: "Cosméticos", plantillaPropuesta: "", diasSeguimiento: 3,
    mensajeInicial: "Buenas, equipo de {nombre}. Soy Neri Colón, desarrollador de sistemas. Mis sistemas funcionan en empresas de Caracas, Valencia y el exterior. Para tiendas de cosméticos y cuidado personal tengo un sistema propio de pedidos por WhatsApp e Instagram, catálogo, inventario y cobro en bolívares y divisas con la tasa del día, que se paga una sola vez y queda a su nombre: https://neracosu.com/para/comercio-y-tienda.html ¿Le parece si en 30 minutos se lo muestro funcionando?",
    mensajeSeguimiento: "Buenas de nuevo, equipo de {nombre}. Le escribí hace unos días por el sistema para tiendas de cosméticos y cuidado personal: https://neracosu.com/para/comercio-y-tienda.html Si prefiere, se lo muestro funcionando en una llamada de 30 minutos. Quedo atento.",
    etiquetaOsm: [["shop", "cosmetics"], ["shop", "perfumery"]],
  },
  {
    // Arquetipo reservas (varios espacios y eventos).
    slug: "eventos", nombre: "Eventos", plantillaPropuesta: "", diasSeguimiento: 3,
    mensajeInicial: "Buenas, equipo de {nombre}. Soy Neri Colón, desarrollador de sistemas. Mis sistemas funcionan en empresas de Caracas, Valencia y el exterior. Para organizadores y salones de eventos tengo un sistema propio de reservas con calendario, cupo retenido y pago validado, que se paga una sola vez y queda a su nombre: https://neracosu.com/para/reservas.html ¿Le parece si en 30 minutos se lo muestro funcionando?",
    mensajeSeguimiento: "Buenas de nuevo, equipo de {nombre}. Le escribí hace unos días por el sistema para organizadores y salones de eventos: https://neracosu.com/para/reservas.html Si prefiere, se lo muestro funcionando en una llamada de 30 minutos. Quedo atento.",
    etiquetaOsm: [["amenity", "events_venue"], ["shop", "party"]],
  },
  {
    // Arquetipo cobros y pagos: mensualidades.
    slug: "gimnasios", nombre: "Gimnasios", plantillaPropuesta: "", diasSeguimiento: 3,
    mensajeInicial: "Buenas, equipo de {nombre}. Soy Neri Colón, desarrollador de sistemas. Mis sistemas funcionan en empresas de Caracas, Valencia y el exterior. Para gimnasios y academias deportivas tengo un sistema propio de mensualidades con recordatorio automático, pago móvil validado contra el banco y control de quién está al día, que se paga una sola vez y queda a su nombre: https://neracosu.com/para/cobros-y-pagos.html ¿Le parece si en 30 minutos se lo muestro funcionando?",
    mensajeSeguimiento: "Buenas de nuevo, equipo de {nombre}. Le escribí hace unos días por el sistema para gimnasios y academias deportivas: https://neracosu.com/para/cobros-y-pagos.html Si prefiere, se lo muestro funcionando en una llamada de 30 minutos. Quedo atento.",
    etiquetaOsm: [["leisure", "fitness_centre"], ["leisure", "sports_centre"]],
  },
  {
    // Arquetipo cobros y pagos: mensualidades.
    slug: "educacion", nombre: "Educación", plantillaPropuesta: "", diasSeguimiento: 3,
    mensajeInicial: "Buenas, equipo de {nombre}. Soy Neri Colón, desarrollador de sistemas. Mis sistemas funcionan en empresas de Caracas, Valencia y el exterior. Para academias, institutos y colegios tengo un sistema propio de mensualidades con recordatorio automático, pago móvil validado contra el banco y control de quién está al día, que se paga una sola vez y queda a su nombre: https://neracosu.com/para/cobros-y-pagos.html ¿Le parece si en 30 minutos se lo muestro funcionando?",
    mensajeSeguimiento: "Buenas de nuevo, equipo de {nombre}. Le escribí hace unos días por el sistema para academias, institutos y colegios: https://neracosu.com/para/cobros-y-pagos.html Si prefiere, se lo muestro funcionando en una llamada de 30 minutos. Quedo atento.",
    etiquetaOsm: [["amenity", "language_school"], ["amenity", "music_school"], ["amenity", "driving_school"], ["amenity", "training"]],
  },
  {
    // Arquetipo de citas por profesional: la agenda NO esta construida; el mensaje ofrece el diagnostico.
    slug: "talleres-y-autolavados", nombre: "Talleres y autolavados", plantillaPropuesta: "", diasSeguimiento: 3,
    mensajeInicial: "Buenas, equipo de {nombre}. Soy Neri Colón, desarrollador de sistemas. Mis sistemas funcionan en empresas de Caracas, Valencia y el exterior. Para talleres y autolavados estoy armando un sistema propio de citas y órdenes de trabajo, con recordatorio al cliente y cobro validado, que se paga una sola vez y queda a su nombre. Antes de construirlo quiero verlo con negocios reales: https://neracosu.com/para/citas-y-servicios.html ¿Le parece si en 30 minutos le cuento cómo funcionaría en {nombre}?",
    mensajeSeguimiento: "Buenas de nuevo, equipo de {nombre}. Le escribí hace unos días por el sistema de citas y órdenes para el taller: https://neracosu.com/para/citas-y-servicios.html Si prefiere, lo conversamos en una llamada de 30 minutos. Quedo atento.",
    etiquetaOsm: [["shop", "car_repair"], ["amenity", "car_wash"]],
  },
  {
    slug: "farmacias", nombre: "Farmacias", plantillaPropuesta: "", diasSeguimiento: 3,
    mensajeInicial: "Buenas, equipo de {nombre}. Soy Neri Colón, desarrollador de sistemas. Preparé una propuesta para que sus clientes compren desde el teléfono y ustedes despachen desde el mostrador. ¿Se la puedo enviar por aquí?",
    mensajeSeguimiento: "Buenas de nuevo, equipo de {nombre}. Le escribí hace unos días con una propuesta para la farmacia. ¿Tuvo chance de verla? Quedo atento.",
    // Etiquetas OSM para el buscador (pieza 2): amenity=pharmacy
    etiquetaOsm: [["amenity", "pharmacy"]],
  },
];
for (const n of NICHOS) {
  await prisma.nicho.upsert({ where: { slug: n.slug }, update: { etiquetaOsm: n.etiquetaOsm }, create: n });
  console.log("nicho listo:", n.slug);
}
await prisma.$disconnect();
