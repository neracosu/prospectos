"use client";
import { useEffect, useState, useTransition } from "react";
import { buscarOverpass, buscarOverture } from "@/acciones/buscar";
import { fechaDePublicacion } from "@/lib/overture-contrato";
import { ResumenLote } from "./ResumenLote";

type Fuente = "osm" | "directorio";
type Salida = { lote: string; nuevos: number; repetidos: number; errores: number; consultado: string; aviso: string };

const CLAVE_ULTIMA = "pr:buscar-osm";
const NOMBRE_FUENTE: Record<Fuente, string> = { osm: "OpenStreetMap", directorio: "Directorio abierto" };

// Dos fuentes con el mismo nicho y la misma ciudad. OpenStreetMap sale a la red y tarda: hasta 90 s, mas 5 s de
// cola si hay otra consulta en vuelo; el boton se apaga y el texto de espera dice cuanto, porque una pantalla quieta
// durante minuto y medio parece rota. El directorio abierto (Overture Maps) ya esta en la base y responde al momento.
export function FormOverpass({
  nichos,
  ciudades,
  directorio,
}: {
  nichos: { id: number; nombre: string }[];
  ciudades: { slug: string; nombre: string; pais: "VE" | "CO" }[];
  directorio: { publicaciones: Record<"VE" | "CO", string | null>; sinNicho: number[] };
}) {
  const [error, setError] = useState("");
  const [salida, setSalida] = useState<Salida | null>(null);
  const [enVuelo, setEnVuelo] = useState<Fuente | null>(null);
  const [pendiente, empezar] = useTransition();
  // Controlados: React vacia un formulario no controlado cuando termina su accion, y con
  // 19 nichos y muchas ciudades volver al primero de la lista hace perder por donde se iba.
  const [nichoId, setNichoId] = useState(nichos[0] ? String(nichos[0].id) : "");
  const [ciudad, setCiudad] = useState(ciudades[0]?.slug ?? "");

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

  // Cada pais tiene su propia carga del directorio: la que cuenta es la del pais de la ciudad elegida.
  const paisElegido = ciudades.find((c) => c.slug === ciudad)?.pais ?? "VE";
  const publicacion = directorio.publicaciones[paisElegido];
  const motivoSinDirectorio = !publicacion
    ? (paisElegido === "CO" ? "El directorio de Colombia no está cargado todavía." : "El directorio no está cargado todavía.")
    : directorio.sinNicho.includes(Number(nichoId))
      ? "Este nicho no está en el directorio."
      : "";

  // La etiqueta sale de `pendiente`, no solo de `enVuelo`: si la accion lanza (se cae la senal a mitad de los 90 s),
  // la transicion termina sola y el boton no puede quedarse diciendo «Consultando…».
  const consultando = pendiente ? enVuelo : null;

  return (
    <>
      <form
        className="tarjeta"
        onSubmit={(e) => {
          // onSubmit y no action: al terminar una action React reinicia el formulario entero.
          e.preventDefault();
          const boton = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
          const fuente: Fuente = boton?.value === "directorio" ? "directorio" : "osm";
          const fd = new FormData(e.currentTarget);
          const nId = String(fd.get("nichoId") ?? "");
          const cSlug = String(fd.get("ciudad") ?? "");
          recordar(nId, cSlug);
          const n = nichos.find((x) => String(x.id) === nId)?.nombre ?? "";
          const c = ciudades.find((x) => x.slug === cSlug)?.nombre ?? "";
          const consultado = `${n} · ${c} · ${NOMBRE_FUENTE[fuente]}`;
          // Antes de empezar(): dentro de la transicion no se pintaria hasta que responda el servidor.
          setEnVuelo(fuente);
          empezar(async () => {
            setError("");
            setSalida(null);
            if (fuente === "directorio") {
              const r = await buscarOverture(fd);
              if (r.ok) {
                const q = r.datos.quedan;
                setSalida({ ...r.datos, consultado, aviso: q > 0 ? `Quedan ${q} más de este nicho en esta ciudad. Vuelve a buscar cuando termines con estas y llegan las siguientes.` : "" });
              }
              else setError(r.mensaje);
            } else {
              const r = await buscarOverpass(fd);
              if (r.ok) {
                const d = r.datos.antiguedadDias;
                const aviso = !r.datos.desdeCache
                  ? ""
                  : d > 0
                    ? `Resultados de hace ${d} ${d === 1 ? "día" : "días"}: salieron de la consulta guardada.`
                    : "Resultados de hoy: salieron de la consulta guardada.";
                setSalida({ ...r.datos, consultado, aviso });
              } else setError(r.mensaje);
            }
            setEnVuelo(null);
          });
        }}
      >
        <b>Buscar en el mapa</b>
        <p className="suave">
          Trae los negocios del nicho con lo que cada uno publicó: nombre, dirección y, cuando existen, teléfono,
          correo, web y redes. Una ciudad por vez.
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
            {([["VE", "Venezuela"], ["CO", "Colombia"]] as const).map(([pais, etiqueta]) => (
              <optgroup key={pais} label={etiqueta}>
                {ciudades.filter((c) => c.pais === pais).map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.nombre}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="boton boton--primario" disabled={pendiente} type="submit" name="fuente" value="osm">
          {consultando === "osm" ? "Consultando…" : "Buscar en OpenStreetMap"}
        </button>
        <p className="suave" role="status" aria-live="polite">
          {consultando === "osm"
            ? "Consultando OpenStreetMap: puede tardar hasta minuto y medio. No cierres esta pantalla."
            : "El resultado se guarda 7 días: la misma ciudad con el mismo nicho no se vuelve a consultar."}
        </p>
        <div className="fila-botones fila-botones--secundarias">
          <button className="boton" disabled={pendiente || Boolean(motivoSinDirectorio)} type="submit" name="fuente" value="directorio">
            {consultando === "directorio" ? "Buscando…" : "Buscar en el directorio abierto"}
          </button>
        </div>
        <label className="campo" style={{ marginTop: 10 }}>
          <span>
            <input type="checkbox" name="soloContactables" defaultChecked /> Solo con teléfono o correo
          </span>
        </label>
        <p className="suave">
          {motivoSinDirectorio ||
            `Directorio del ${fechaDePublicacion(publicacion ?? "")}: lo que cada negocio publicó en su página de Facebook. Responde al momento.`}
        </p>
      </form>
      {salida && (
        <ResumenLote lote={salida.lote} nuevos={salida.nuevos} repetidos={salida.repetidos} errores={salida.errores}>
          <p className="suave">
            Se consultó: <b>{salida.consultado}</b>
          </p>
          {salida.aviso && <p className="aviso">{salida.aviso}</p>}
        </ResumenLote>
      )}
    </>
  );
}
