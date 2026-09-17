import type { Metadata, Viewport } from "next";
import "./globals.css";

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
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
