import type { Metadata } from "next";
import localFont from "next/font/local";
import "./portal.css";

// Las mismas fuentes del recibo y la propuesta, locales (OFL): el portal no depende de Google Fonts.
const sans = localFont({ src: "../../../plantillas/fuentes/source-sans-3.woff2", weight: "400 700", variable: "--fuente-sans", display: "swap" });
const serif = localFont({ src: "../../../plantillas/fuentes/source-serif-4.woff2", weight: "400 700", variable: "--fuente-serif", display: "swap" });

// manifest: null -> el portal no ofrece instalar la PWA del panel.
export const metadata: Metadata = { title: "Portal de clientes · NERACOSU", manifest: null, robots: { index: false, follow: false } };

export default function LayoutPortal({ children }: { children: React.ReactNode }) {
  return <div className={`${sans.variable} ${serif.variable}`}>{children}</div>;
}
