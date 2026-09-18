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
    // Etiquetas OSM para el buscador (pieza 2): tourism=hotel/motel/guest_house
    etiquetaOsm: [["tourism", "hotel"], ["tourism", "motel"], ["tourism", "guest_house"]],
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
