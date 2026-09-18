"use client";
import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LoteDetalle } from "@/lib/revision";
import { COLUMNAS, type Columna } from "@/lib/tabla-contrato";
import { etiquetaOrigen, siguientePasada, APROBACION_INICIAL } from "@/lib/revision-contrato";
import { aplicarDecision, type CambioFila } from "@/lib/optimista-contrato";
import { aprobarFila, completarExistente, descartarFila, corregirFila, aprobarNuevos, descartarRepetidos, revisarDeNuevo } from "@/acciones/revision";
import { useFlotante } from "@/componentes/LineaFlotante";

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

function esUrl(v: string): boolean {
  return /^https?:\/\//i.test(v);
}

export function Bandeja({ lote: loteDelServidor }: { lote: LoteDetalle }) {
  const avisar = useFlotante();
  // Pasada de UX, fase B: aprobar, completar y descartar marcan la ficha al tocar y bajan «por decidir»; si el
  // servidor dice que no, vuelve sola y el error sale en la ficha. «Corregir» y «Aprobar todas» no son de un
  // toque y siguen esperando al servidor.
  const [lote, decidir] = useOptimistic<LoteDetalle, CambioFila>(loteDelServidor, aplicarDecision);
  const [editando, setEditando] = useState<number | null>(null);
  // Un error por ficha (y uno del lote): con varias decisiones en vuelo, el de una no borra el de otra.
  const [errores, setErrores] = useState<Record<string, string>>({});
  const ponerError = (donde: Accion, mensaje: string | null) => setErrores((e) => { const r = { ...e }; if (mensaje === null) delete r[String(donde)]; else r[String(donde)] = mensaje; return r; });
  const [corriendo, setCorriendo] = useState<Accion | null>(null);
  const [avance, setAvance] = useState<{ hechas: number; de: number } | null>(null);
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
  // Las decisiones de un toque no esperan a la anterior; solo se bloquean mientras corre «Aprobar todas».
  const enLote = corriendo === "lote";

  // Sin router.refresh(): cada accion de revision ya revalida /buscar y su respuesta trae el lote nuevo.
  const correr = (donde: Accion, fn: () => Promise<{ ok: true; datos: unknown } | { ok: false; mensaje: string }>, optimista?: { cambio: CambioFila; texto: string }) => {
    ponerError(donde, null);
    // Con cambio optimista no hay «Guardando…»: la ficha ya se ve decidida.
    if (!optimista) setCorriendo(donde);
    empezar(async () => {
      if (optimista) decidir(optimista.cambio);
      const r = await fn();
      // Solo se cierra y se apaga lo de ESTA ficha: mientras tanto se pudo abrir «Corregir» en otra.
      setCorriendo((c) => (c === donde ? null : c));
      if (r.ok) {
        setEditando((e) => (e === donde ? null : e));
        if (optimista) avisar({ texto: optimista.texto });
      } else ponerError(donde, r.mensaje);
    });
  };

  // Aprueba de a 500 (TOPE_APROBACION) hasta que no queden nuevas. Cuando parar
  // lo decide siguientePasada, que esta en revision-contrato con su test: una
  // fila que siempre falla no puede dejar la pantalla girando sin fin.
  const aprobarTodas = () => {
    // Antes de la transicion: adentro, lo que va antes del primer await no se pinta hasta que el servidor responde.
    ponerError("lote", null);
    setCorriendo("lote");
    setAvance({ hechas: 0, de: lote.aprobables });
    empezar(async () => {
      let estado = APROBACION_INICIAL;
      for (;;) {
        const r = await aprobarNuevos(lote.lote);
        if (!r.ok) {
          ponerError("lote", r.mensaje);
          break;
        }
        const paso = siguientePasada(estado, r.datos);
        estado = paso.estado;
        setAvance({ hechas: estado.aprobadas, de: Math.max(lote.aprobables, estado.aprobadas) });
        if (!paso.seguir) {
          // Los numeros que se muestran son los de la ultima pasada: las mismas
          // filas vuelven a fallar en cada vuelta y sumarlas no dice nada.
          if (estado.fallidas > 0) {
            ponerError(
              "lote",
              `Se aprobaron ${estado.aprobadas}. En la última pasada fallaron ${estado.fallidas} y quedan ${estado.quedan} sin aprobar. La primera falla dice: ${estado.primerError || ERROR_GENERICO}`,
            );
          }
          break;
        }
      }
      setCorriendo(null);
      setAvance(null);
      router.refresh();
    });
  };

  return (
    <>
      <section className="tarjeta">
        <div className="cabecera">
          <span>
            <b>{etiquetaOrigen(lote.origen)}</b>
            <br />
            <span className="suave">{lote.creadoEn.toLocaleString("es-VE", { timeZone: "America/Caracas", dateStyle: "short", timeStyle: "short" })}</span>
          </span>
          <span className="etiqueta">{lote.pendientes} por decidir</span>
        </div>
        <p className="suave">
          {lote.total} {lote.total === 1 ? "ficha" : "fichas"} en este lote.
          {lote.pendientes === 0 ? " Ya las decidiste todas." : " Aprueba, completa o descarta cada una."}
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
        {errores.lote && (
          <p className="error" role="alert">
            {errores.lote}
          </p>
        )}
        <div className="fila-botones">
          {lote.aprobables > 0 && (
            <button className="boton boton--primario" disabled={pendiente} onClick={aprobarTodas}>
              {corriendo === "lote"
                ? "Aprobando…"
                : lote.aprobables === 1
                  ? "Aprobar la nueva"
                  : `Aprobar las ${lote.aprobables} nuevas`}
            </button>
          )}
          {lote.conProblema > 0 && (
            // Para cuando el problema estaba afuera (un nicho que no existia): se revisan todas de una vez.
            <button className="boton" disabled={pendiente} onClick={() => correr("lote", async () => { const r = await revisarDeNuevo(lote.lote); if (r.ok) avisar({ texto: r.datos.liberadas ? `${r.datos.liberadas} de ${r.datos.revisadas} ya no tienen problema` : `Se revisaron ${r.datos.revisadas}: siguen con problema` }); return r; })}>
              {corriendo === "lote" ? "Revisando…" : `Revisar de nuevo ${lote.conProblema} con problema`}
            </button>
          )}
          {lote.descartables > 0 && (
            // Los lotes nuevos ya nacen sin estos; este boton limpia los de antes de la regla.
            <button className="boton" disabled={pendiente} onClick={() => correr("lote", async () => { const r = await descartarRepetidos(lote.lote); if (r.ok) { avisar({ texto: r.datos.descartadas === 1 ? "1 repetido descartado" : `${r.datos.descartadas} repetidos descartados` }); } return r; })}>
              {corriendo === "lote" ? "Descartando…" : `Descartar ${lote.descartables} repetidos sin nada nuevo`}
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
        const fuente = f.datos.fuentes?.[0] ?? "";
        return (
          <article key={f.id} className={"tarjeta" + (decidida ? " tarjeta--decidida" : "")}>
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
                  <dd className={c.campo === "web" ? "recorte" : undefined} title={c.campo === "web" ? String(f.datos[c.campo]) : undefined}>
                    {String(f.datos[c.campo])}
                  </dd>
                </span>
              ))}
              {fuente && (
                <span style={{ display: "contents" }}>
                  <dt>Fuente</dt>
                  <dd>
                    {esUrl(fuente) ? (
                      <a className="recorte recorte--tocable" href={fuente} target="_blank" rel="noopener" title={fuente}>
                        {fuente}
                      </a>
                    ) : (
                      fuente
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

            {errores[String(f.id)] && (
              <p className="error" role="alert">
                {errores[String(f.id)]}
              </p>
            )}

            {!decidida && editando !== f.id && (
              <div className="fila-botones">
                {f.estado === "nuevo" && (
                  <button className="boton boton--primario" disabled={enLote} onClick={() => correr(f.id, () => aprobarFila(f.id), { cambio: { id: f.id, decision: "aprobado" }, texto: `Aprobado: ${f.datos.nombre}` })}>
                    {corriendo === f.id ? "Guardando…" : "Aprobar"}
                  </button>
                )}
                {f.estado === "repetido" && f.existenteId !== null && (
                  <button className="boton boton--primario" disabled={enLote} onClick={() => correr(f.id, () => completarExistente(f.id), { cambio: { id: f.id, decision: "completado" }, texto: `Completado: ${f.datos.nombre}` })}>
                    {corriendo === f.id ? "Completando…" : "Completar el que existe"}
                  </button>
                )}
                {!ilegible && (
                  <button className="boton" disabled={pendiente} onClick={() => setEditando(f.id)}>
                    Corregir
                  </button>
                )}
                <button className="boton boton--peligro" disabled={enLote} onClick={() => correr(f.id, () => descartarFila(f.id), { cambio: { id: f.id, decision: "descartado" }, texto: `Descartado: ${f.datos.nombre || "ficha sin nombre"}` })}>
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
                      defaultValue={c === "fuente" ? fuente : String(f.datos[c as keyof typeof f.datos] ?? "")}
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
