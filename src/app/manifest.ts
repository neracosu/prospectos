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
    icons: [{ src: "/icono.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
    share_target: {
      action: "/buscar",
      method: "GET",
      params: { url: "url", text: "text", title: "title" },
    },
  } as MetadataRoute.Manifest;
}
