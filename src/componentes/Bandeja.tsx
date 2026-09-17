"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FilaRevision } from "@/lib/revision";
import { COLUMNAS, type Columna } from "@/lib/tabla-contrato";
import { etiquetaOrigen } from "@/lib/revision-contrato";
import { aprobarFila, completarExistente, descartarFila, corregirFila, aprobarNuevos } from "@/acciones/revision";

// La bandeja es el filtro: nada llega al panel sin que alguien lo mire aca. Cada
// tarjeta tiene UNA accion principal (aprobar, completar o corregir) y las demas
// al lado, para que en el telefono no haya que apuntar.
const ESTADO: Record<string, string> = { nuevo: "Nuevo", repetido: "Ya existe", error: "Con problema" };
const DECISION: Record<string, string> = { aprobado: "Aprobado", completado: "Completado", descartado: "Descartado" };
// Datos de contacto que se muestran en la tarjeta, en el orden en que sirven
// para escribirle a un negocio.
type CampoContacto = "whatsapp" | "telefono" | "email" | "web" | "instagram" | "facebook" | "tiktok";
const CONTACTO: { campo: CampoContacto; texto: string }[] = [
  { campo: "whatsapp", texto: "WhatsApp" },
  { campo: "telefono", texto: "Teléfono" },
  { campo: "email", texto: "Correo" },
  { campo: "web", texto: "Web" },
  { campo: "instagram", texto: "Instagram" },
  { campo: "facebook", texto: "Facebook" },
  { campo: "tiktok", texto: "TikTok" },
];
const ETIQUETA_COLUMNA: Record<Columna, string> = {
  nicho: "Nicho", nombre: "Nombre", ciudad: "Ciudad", estado: "Estado", tipo: "Tipo", tamano: "Tamaño",
  telefono: "Teléfono", whatsapp: "WhatsApp", email: "Correo", web: "Web", instagram: "Instagram",
  facebook: "Facebook", tiktok: "TikTok", nota: "Nota interna", fuente: "Fuente (dónde lo publican)",
};
// Texto que pone loteConDetalle cuando el JSON de la fila no se puede leer. Esa
// fila no se puede aprobar ni corregir: lo unico que queda es descartarla.
const ILEGIBLE = "Datos inválidos";
const ERROR_GENERICO = "No se pudo completar. Intenta de nuevo.";

type Accion = number | "lote";
type Aviso = { donde: Accion; mensaje: string };

export function Bandeja({ lote }: { lote: { lote: string; origen: string; creadoEn: Date; filas: FilaRevision[] } }) {
  const [editando, setEditando] = useState<number | null>(null);
  const [error, setError] = useState<Aviso | null>(null);
  const [corriendo, setCorriendo] = useState<Accion | null>(null);
  const [avance, setAvance] = useState<{ hechas: number; de: number } | null>(null);
  const [pendiente, empezar] = useTransition();
  const router = useRouter();

  const pendientes = lote.filas.filter((f) => f.decision === "pendiente");
  const nuevas = pendientes.filter((f) => f.estado === "nuevo").length;

  const correr = (donde: Accion, fn: () => Promise<{ ok: true; datos: unknown } | { ok: false; mensaje: string }>) =>
    empezar(async () => {
      setError(null);
      setCorriendo(donde);
      const r = await fn();
      setCorriendo(null);
      if (r.ok) {
        setEditando(null);
        router.refresh();
      } else setError({ donde, mensaje: r.mensaje });
    });

  // Aprueba de a 500 (TOPE_APROBACION) hasta que no queden nuevas. Para cuando
  // una pasada no aprueba ninguna: si no, con una fila que siempre falla la
  // pantalla gira sin fin.
  const aprobarTodas = () =>
    empezar(async () => {
      setError(null);
      setCorriendo("lote");
      let hechas = 0;
      let fallidas = 0;
      let primerError = "";
      setAvance({ hechas: 0, de: nuevas });
      for (;;) {
        const r = await aprobarNuevos(lote.lote);
        if (!r.ok) {
          setError({ donde: "lote", mensaje: r.mensaje });
          break;
        }
        hechas += r.datos.aprobadas;
        fallidas += r.datos.fallidas;
        if (!primerError && r.datos.primerError) primerError = r.datos.primerError;
        setAvance({ hechas, de: Math.max(nuevas, hechas) });
        if (r.datos.aprobadas === 0) {
          if (r.datos.fallidas > 0) {
            setError({ donde: "lote", mensaje: `${fallidas} no se pudieron aprobar. La primera dice: ${primerError || ERROR_GENERICO}` });
          }
          break;
        }
        if (r.datos.quedan === 0) {
          if (fallidas > 0) {
            setError({ donde: "lote", mensaje: `${fallidas} no se pudieron aprobar. La primera dice: ${primerError || ERROR_GENERICO}` });
          }
          break;
        }
      }
      setCorriendo(null);
      setAvance(null);
      router.refresh();
    });

  return (
    <>
      <section className="tarjeta">
        <div className="cabecera">
          <span>
            <b>{etiquetaOrigen(lote.origen)}</b>
            <br />
            <span className="suave">{lote.creadoEn.toLocaleString("es-VE", { timeZone: "America/Caracas" })}</span>
          </span>
          <span className="etiqueta">{pendientes.length} por decidir</span>
        </div>
        <p className="suave">
          {lote.filas.length} {lote.filas.length === 1 ? "ficha" : "fichas"} en este lote.
          {pendientes.length === 0 ? " Ya las decidiste todas." : " Aprueba, completa o descarta cada una."}
        </p>
        {avance && (
          <>
            <div className="progreso" aria-hidden="true">
              <i style={{ width: `${avance.de ? Math.round((avance.hechas / avance.de) * 100) : 0}%` }} />
            </div>
            <p className="suave" role="status" aria-live="polite">
              Aprobando: {avance.hechas} de {avance.de}. No cierres esta pantalla.
            </p>
          </>
        )}
        {error?.donde === "lote" && (
          <p className="error" role="alert">
            {error.mensaje}
          </p>
        )}
        <div className="fila-botones">
          {nuevas > 0 && (
            <button className="boton boton--primario" disabled={pendiente} onClick={aprobarTodas}>
              {corriendo === "lote" ? "Aprobando…" : nuevas === 1 ? "Aprobar la nueva" : `Aprobar las ${nuevas} nuevas`}
            </button>
          )}
          <Link className="boton" href="/buscar?t=bandeja">
            Otros lotes
          </Link>
        </div>
      </section>

      {lote.filas.map((f) => {
        const ilegible = f.errores.includes(ILEGIBLE);
        const decidida = f.decision !== "pendiente";
        const existente = f.existente;
        const faltantes = existente ? CONTACTO.filter((c) => !existente[c.campo] && f.datos[c.campo]) : [];
        return (
          <article key={f.id} className="tarjeta" style={decidida ? { opacity: 0.6 } : undefined}>
            <div className="cabecera">
              <span>
                <b>{f.datos.nombre || "(sin nombre)"}</b>
                <br />
                <span className="suave">
                  {f.datos.ciudad || "(sin ciudad)"}
                  {f.datos.nicho ? ` · ${f.datos.nicho}` : ""}
                  {lote.origen === "importado" ? ` · fila ${f.fila}` : ""}
                </span>
              </span>
              <span className={`etiqueta etiqueta--${decidida ? f.decision : f.estado}`}>
                {decidida ? DECISION[f.decision] : ESTADO[f.estado] ?? f.estado}
              </span>
            </div>

            {f.errores.length > 0 && <p className="error">{f.errores.join(" · ")}</p>}

            <dl className="datos">
              {CONTACTO.filter((c) => f.datos[c.campo]).map((c) => (
                <span key={c.campo} style={{ display: "contents" }}>
                  <dt>{c.texto}</dt>
                  <dd>{String(f.datos[c.campo])}</dd>
                </span>
              ))}
              {f.datos.fuentes?.[0] && (
                <span style={{ display: "contents" }}>
                  <dt>Fuente</dt>
                  <dd>
                    {/^https?:\/\//i.test(f.datos.fuentes[0]) ? (
                      <a href={f.datos.fuentes[0]} target="_blank" rel="noopener">
                        {f.datos.fuentes[0]}
                      </a>
                    ) : (
                      f.datos.fuentes[0]
                    )}
                  </dd>
                </span>
              )}
            </dl>

            {existente && !decidida && (
              <p className="pregunta">
                Ya está cargado como <b>{existente.nombre}</b> ({existente.ciudad}).{" "}
                {faltantes.length > 0
                  ? `Le puedes completar: ${faltantes.map((c) => c.texto).join(", ")}.`
                  : "No hay nada nuevo que completarle."}
              </p>
            )}

            {error?.donde === f.id && (
              <p className="error" role="alert">
                {error.mensaje}
              </p>
            )}

            {!decidida && editando !== f.id && (
              <div className="fila-botones">
                {f.estado === "nuevo" && (
                  <button className="boton boton--primario" disabled={pendiente} onClick={() => correr(f.id, () => aprobarFila(f.id))}>
                    {corriendo === f.id ? "Guardando…" : "Aprobar"}
                  </button>
                )}
                {f.estado === "repetido" && f.existenteId !== null && (
                  <button className="boton boton--primario" disabled={pendiente} onClick={() => correr(f.id, () => completarExistente(f.id))}>
                    {corriendo === f.id ? "Completando…" : "Completar el que existe"}
                  </button>
                )}
                {!ilegible && (
                  <button className="boton" disabled={pendiente} onClick={() => setEditando(f.id)}>
                    Corregir
                  </button>
                )}
                <button className="boton boton--peligro" disabled={pendiente} onClick={() => correr(f.id, () => descartarFila(f.id))}>
                  Descartar
                </button>
              </div>
            )}

            {editando === f.id && (
              <form className="pregunta" action={(fd) => correr(f.id, () => corregirFila(f.id, fd))}>
                <p className="suave">Al guardar se revisa de nuevo: puede pasar de «con problema» a «nuevo».</p>
                {COLUMNAS.filter((c) => c !== "nicho").map((c) => (
                  <label key={c} className="campo">
                    <span>{ETIQUETA_COLUMNA[c]}</span>
                    <input
                      name={c}
                      defaultValue={c === "fuente" ? f.datos.fuentes?.[0] ?? "" : String(f.datos[c as keyof typeof f.datos] ?? "")}
                    />
                  </label>
                ))}
                <div className="fila-botones">
                  <button className="boton boton--primario" disabled={pendiente} type="submit">
                    {corriendo === f.id ? "Guardando…" : "Guardar y revisar"}
                  </button>
                  <button type="button" className="boton" disabled={pendiente} onClick={() => setEditando(null)}>
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </article>
        );
      })}
    </>
  );
}
