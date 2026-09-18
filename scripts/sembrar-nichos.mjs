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
