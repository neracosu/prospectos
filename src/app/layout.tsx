import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// La misma familia de la propuesta en PDF y del portal del cliente: todo se ve de la misma casa. Autoalojada,
// asi el panel no depende de una fuente externa con senal debil.
const sans = localFont({ src: "../../plantillas/fuentes/source-sans-3.woff2", weight: "400 700", variable: "--fuente-panel", display: "swap" });

export const metadata: Metadata = {
  title: "Prospectos NERACOSU",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icono.svg", type: "image/svg+xml" },
      { url: "/icono-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: { url: "/icono-192.png", sizes: "192x192" },
  },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={sans.variable}>
      <body>{children}</body>
    </html>
  );
}
