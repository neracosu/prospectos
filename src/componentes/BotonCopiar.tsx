"use client";
import { useState } from "react";
export function BotonCopiar({ texto, etiqueta = "Copiar mensaje" }: { texto: string; etiqueta?: string }) {
  const [listo, setListo] = useState(false);
  return (
    <button type="button" className="boton" onClick={async () => { await navigator.clipboard.writeText(texto); setListo(true); setTimeout(() => setListo(false), 1500); }}>
      {listo ? "Copiado" : etiqueta}
    </button>
  );
}
