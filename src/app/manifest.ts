import type { MetadataRoute } from "next";

// Manifiesto minimo para dos cosas: que el panel se pueda instalar en el
// telefono y que aparezca en "Compartir" de Android. Al compartir una ficha de
// Google Maps, el enlace llega por GET a /buscar en ?url= (algunas apps lo
// mandan dentro de ?text=, y la pantalla lo saca de ahi).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Prospectos NERACOSU",
    short_name: "Prospectos",
    description: "Panel de prospección: cola del día, embudo y bandeja de revisión.",
    start_url: "/hoy",
    scope: "/",
    display: "standalone",
    background_color: "#0f1412",
    theme_color: "#5ed29c",
    lang: "es-VE",
    // Los PNG los arma scripts/generar-iconos.mts desde icono.svg, con el
    // dibujo al 80 %: "maskable" deja que Android recorte hasta un 10 % por
    // lado sin comerse la marca.
    icons: [
      { src: "/icono.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
    share_target: {
      action: "/buscar",
      method: "GET",
      params: { url: "url", text: "text", title: "title" },
    },
  } as MetadataRoute.Manifest;
}
