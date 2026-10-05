"use client";
import { useEffect, useState, useTransition } from "react";
import { buscarOverpass } from "@/acciones/buscar";
import { ResumenLote } from "./ResumenLote";

type Salida = { lote: string; nuevos: number; repetidos: number; errores: number; desdeCache: boolean; antiguedadDias: number };

const CLAVE_ULTIMA = "pr:buscar-osm";

// La consulta a OpenStreetMap tarda: hasta 90 s, mas 5 s de cola si hay otra en
// vuelo. El boton se apaga mientras tanto y el texto de espera dice cuanto,
// porque una pantalla quieta durante minuto y medio parece rota.
export function FormOverpass({
  nichos,
  ciudades,
}: {
  nichos: { id: number; nombre: string }[];
  ciudades: { slug: string; nombre: string }[];
}) {
  const [error, setError] = useState("");
  const [salida, setSalida] = useState<Salida | null>(null);
  const [pendiente, empezar] = useTransition();
  // Controlados: React vacia un formulario no controlado cuando termina su accion, y con
  // 19 nichos y muchas ciudades volver al primero de la lista hace perder por donde se iba.
  const [nichoId, setNichoId] = useState(nichos[0] ? String(nichos[0].id) : "");
  const [ciudad, setCiudad] = useState(ciudades[0]?.slug ?? "");
  const [consultado, setConsultado] = useState("");

  // En un efecto y no en el estado inicial: el servidor no tiene localStorage y la hidratacion tiene que coincidir.
  // Lo recordado sobrevive a la ida a la bandeja y a cambiar de pestana.
  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem(CLAVE_ULTIMA) ?? "null");
      if (nichos.some((n) => String(n.id) === u?.nichoId)) setNichoId(u.nichoId);
      if (ciudades.some((c) => c.slug === u?.ciudad)) setCiudad(u.ciudad);
    } catch { /* sin localStorage o con algo ilegible solo se pierde el recuerdo */ }
  }, []);

  function recordar(n: string, c: string) {
    try { localStorage.setItem(CLAVE_ULTIMA, JSON.stringify({ nichoId: n, ciudad: c })); } catch {}
  }

  return (
    <>
      <form
        className="tarjeta"
        onSubmit={(e) => {
          // onSubmit y no action: al terminar una action React reinicia el formulario entero.
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          empezar(async () => {
            setError("");
            setSalida(null);
            const nId = String(fd.get("nichoId") ?? "");
            const cSlug = String(fd.get("ciudad") ?? "");
            recordar(nId, cSlug);
            const r = await buscarOverpass(fd);
            if (r.ok) {
              const n = nichos.find((x) => String(x.id) === nId)?.nombre ?? "";
              const c = ciudades.find((x) => x.slug === cSlug)?.nombre ?? "";
              setConsultado(`${n} · ${c}`);
              setSalida(r.datos);
            } else setError(r.mensaje);
          });
        }}
      >
        <b>Buscar en el mapa</b>
        <p className="suave">
          Trae los negocios del nicho que están cargados en OpenStreetMap: nombre, dirección y, cuando el
          negocio los publicó, teléfono, web e Instagram. Una ciudad por vez.
        </p>
        <label className="campo">
          <span>Nicho</span>
          <select
            name="nichoId"
            required
            value={nichoId}
            onChange={(e) => {
              setNichoId(e.target.value);
              recordar(e.target.value, ciudad);
            }}
          >
            {nichos.map((n) => (
              <option key={n.id} value={n.id}>
                {n.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Ciudad</span>
          <select
            name="ciudad"
            required
            value={ciudad}
            onChange={(e) => {
              setCiudad(e.target.value);
              recordar(nichoId, e.target.value);
            }}
          >
            {ciudades.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="boton boton--primario" disabled={pendiente} type="submit">
          {pendiente ? "Consultando…" : "Buscar en OpenStreetMap"}
        </button>
        <p className="suave" role="status" aria-live="polite">
          {pendiente
            ? "Consultando OpenStreetMap: puede tardar hasta minuto y medio. No cierres esta pantalla."
            : "El resultado se guarda 7 días: la misma ciudad con el mismo nicho no se vuelve a consultar."}
        </p>
      </form>
      {salida && (
        <ResumenLote lote={salida.lote} nuevos={salida.nuevos} repetidos={salida.repetidos} errores={salida.errores}>
          <p className="suave">
            Se consultó: <b>{consultado}</b>
          </p>
          {salida.desdeCache && (
            <p className="aviso">
              {salida.antiguedadDias > 0
                ? `Resultados de hace ${salida.antiguedadDias} ${salida.antiguedadDias === 1 ? "día" : "días"}: salieron de la consulta guardada.`
                : "Resultados de hoy: salieron de la consulta guardada."}
            </p>
          )}
        </ResumenLote>
      )}
    </>
  );
}
