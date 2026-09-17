"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { leerWebDeProspecto, aplicarSugerencia } from "@/acciones/buscar";

type Sugerencia = { campo: string; valor: string; fuente: string };

const ETIQUETA: Record<string, string> = {
  email: "Correo", whatsapp: "WhatsApp", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok",
};

// Solo se ofrece para los campos que estan vacios y solo con lo que el negocio
// publica en su propia web. Nada se guarda sin que alguien lo agregue a mano:
// una lectura es una propuesta, no un dato.
function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function SugerenciasWeb({ prospectoId, tieneWeb }: { prospectoId: number; tieneWeb: boolean }) {
  const [sugerencias, setSugerencias] = useState<Sugerencia[] | null>(null);
  const [error, setError] = useState("");
  const [corriendo, setCorriendo] = useState<"leer" | number | null>(null);
  const [pendiente, empezar] = useTransition();
  const router = useRouter();

  if (!tieneWeb) return null;

  const leer = () =>
    empezar(async () => {
      setError("");
      setCorriendo("leer");
      const r = await leerWebDeProspecto(prospectoId);
      setCorriendo(null);
      if (r.ok) setSugerencias(r.datos.sugerencias);
      else setError(r.mensaje);
    });

  const agregar = (s: Sugerencia, i: number) =>
    empezar(async () => {
      setError("");
      setCorriendo(i);
      const r = await aplicarSugerencia(prospectoId, s.campo, s.valor, s.fuente);
      setCorriendo(null);
      if (r.ok) {
        setSugerencias((x) => x?.filter((_, j) => j !== i) ?? null);
        router.refresh();
      } else setError(r.mensaje);
    });

  return (
    <section className="tarjeta">
      <b>Su web</b>
      <p className="suave">
        Lee la web del negocio y propone lo que publique y acá falte. Nada se guarda hasta que lo agregues.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="fila-botones">
        <button className="boton" disabled={pendiente} onClick={leer}>
          {corriendo === "leer" ? "Leyendo la web…" : sugerencias ? "Leer otra vez" : "Leer web"}
        </button>
      </div>
      {sugerencias?.length === 0 && (
        <p className="suave">Su web no publica nada que falte en esta ficha.</p>
      )}
      {sugerencias?.map((s, i) => (
        <div key={`${s.campo}-${s.valor}`} className="fila">
          <span>
            <b>{ETIQUETA[s.campo] ?? s.campo}</b>
            <br />
            <span style={{ overflowWrap: "anywhere" }}>{s.valor}</span>
            <br />
            <a className="suave" href={s.fuente} target="_blank" rel="noopener">
              {host(s.fuente)}
            </a>
          </span>
          <button className="boton boton--primario" disabled={pendiente} onClick={() => agregar(s, i)}>
            {corriendo === i ? "Guardando…" : "Agregar"}
          </button>
        </div>
      ))}
    </section>
  );
}
