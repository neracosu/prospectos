import type { NextConfig } from "next";

const config: NextConfig = {
  // No revelar el framework en las respuestas.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
      // Las propuestas son publicas por codigo pero no se indexan.
      { source: "/p/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      // Los recibos son privados: que ningun buscador guarde ni la redireccion.
      { source: "/recibos/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      // El portal del cliente es privado: ningun buscador guarda ni la pantalla del PIN.
      { source: "/c/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default config;
