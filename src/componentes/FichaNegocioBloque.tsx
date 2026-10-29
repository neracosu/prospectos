"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { guardarGancho, reinvestigar, bloquearCorreo, ponerAlAutomatico } from "@/acciones/correos";
import { Campo } from "@/componentes/Campo";
import { useFlotante } from "@/componentes/LineaFlotante";
import { GANCHO_MAX, type EstadoFicha } from "@/lib/ficha-contrato";
import type { FichaFila } from "@/lib/fichas";

const ESTADO: Record<EstadoFicha, string> = {
  sin_hallazgos: "Sin hallazgos todavía",
  borrador: "Borrador",
  lista: "Lista para revisar",
  revisada: "Revisada",
};
const PLATAFORMA: Record<string, string> = {
  wordpress: "WordPress", woocommerce: "WooCommerce", shopify: "Shopify", wix: "Wix", tiendanube: "Tiendanube", otra: "Otra plataforma",
};
const ESTADO_WEB: Record<string, string> = {
  viva: "En línea", caida: "No responde", vendida: "Dominio en venta", en_mantenimiento: "En mantenimiento",
  red_social: "Solo una red social", sin_web: "Sin web",
};
const MOTIVO: Record<string, string> = { no_quiere: "pidió que no le escriban", rebote: "el correo rebotó" };

function host(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

// Lo que se encontro, en palabras: solo lo que es cierto y no esta vacio.
function hallazgosLegibles(h: FichaFila["hallazgos"]): string[] {
  const filas: string[] = [];
  const w = h?.web;
  if (w) {
    filas.push(`Web: ${ESTADO_WEB[w.estado] ?? w.estado}`);
    if (w.plataforma) filas.push(`Plataforma: ${PLATAFORMA[w.plataforma] ?? w.plataforma}`);
    const tiene = [
      w.tieneTiendaEnLinea && "tienda en línea", w.cobraEnLinea && "cobro en línea", w.tieneReservasEnLinea && "reservas en línea",
      w.reservaPorWhatsApp && "reservas por WhatsApp", w.pedidoPorWhatsApp && "pedidos por WhatsApp",
      w.tieneMenuOCatalogo && (w.menuEnPdf ? "menú o catálogo en PDF" : "menú o catálogo"),
    ].filter(Boolean) as string[];
    if (tiene.length) filas.push(`Tiene: ${tiene.join(", ")}`);
    if (w.motorExterno) filas.push(`Motor externo: ${w.motorExterno}`);
    if (w.metodosPago?.length) filas.push(`Métodos de pago: ${w.metodosPago.join(", ")}`);
    if (w.horario) filas.push(`Horario: ${w.horario}`);
  }
  const dir = w?.direccion || h?.overture?.direccion || "";
  if (dir) filas.push(`Dirección: ${dir}`);
  if (h?.base?.variasSedes) filas.push("Tiene varias sedes");
  return filas;
}

export function FichaNegocioBloque({ prospectoId, ficha, correoBloqueado, tieneCorreo, esDueno }: {
  prospectoId: number; ficha: FichaFila | null; correoBloqueado: string; tieneCorreo: boolean; esDueno: boolean;
}) {
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  const avisar = useFlotante();
  const router = useRouter();

  const correr = (texto: string, fn: () => Promise<{ ok: boolean; mensaje?: string }>) =>
    empezar(async () => {
      setError("");
      const r = await fn();
      if (r.ok) { avisar({ texto }); router.refresh(); }
      else setError(r.mensaje ?? "No se pudo completar.");
    });

  const guardar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    correr("Gancho guardado", () => guardarGancho(prospectoId, datos));
  };

  const estado: EstadoFicha = ficha?.estado ?? "sin_hallazgos";
  const filas = ficha ? hallazgosLegibles(ficha.hallazgos) : [];
  const fuentes = (ficha?.fuentes ?? []).filter((f) => /^https?:\/\//i.test(f));

  return (
    <section className="tarjeta" data-estado={estado}>
      <b>Lo que sabemos del negocio</b>
      <p className="suave">
        {ESTADO[estado]}
        {ficha?.alAutomatico ? " · va al envío automático" : ""}
        {correoBloqueado ? ` · correo bloqueado: ${MOTIVO[correoBloqueado] ?? correoBloqueado}` : ""}
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      {!ficha && <p className="suave">Todavía no se ha investigado este negocio.</p>}
      {ficha?.resumen && <p style={{ overflowWrap: "anywhere" }}>{ficha.resumen}</p>}
      {filas.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
          {filas.map((f) => <li key={f} style={{ overflowWrap: "anywhere" }}>{f}</li>)}
        </ul>
      )}
      {fuentes.length > 0 && (
        <p className="suave">Fuentes: {fuentes.map((f, i) => <a key={f} href={f} target="_blank" rel="noopener">[{i + 1}] {host(f)} </a>)}</p>
      )}
      {!esDueno && ficha?.gancho && (
        <p><b>Gancho</b><br /><span style={{ overflowWrap: "anywhere" }}>{ficha.gancho}</span></p>
      )}
      {esDueno && (
        <form onSubmit={guardar} key={`${ficha?.revisadaEn?.toString() ?? ""}${ficha?.generadaEn?.toString() ?? ""}`}>
          <Campo etiqueta="Gancho de la propuesta" nombre="gancho" control="textarea" rows={3} maxLength={GANCHO_MAX}
            regla={{ tipo: "texto", max: GANCHO_MAX }} defaultValue={ficha?.gancho ?? ""} />
          <Campo etiqueta="Resumen" nombre="resumen" control="textarea" rows={4} maxLength={1000}
            regla={{ tipo: "texto", max: 1000 }} defaultValue={ficha?.resumen ?? ""} />
          <div className="fila-botones">
            <button className="boton boton--primario" type="submit" disabled={pendiente}>Guardar gancho</button>
          </div>
        </form>
      )}
      {esDueno && (
        <div className="fila-botones">
          <button className="boton" type="button" disabled={pendiente}
            onClick={() => correr("Investigación al día", () => reinvestigar(prospectoId))}>
            {pendiente ? "Trabajando…" : "Investigar de nuevo"}
          </button>
          <button className="boton" type="button" disabled={pendiente}
            onClick={() => correr(ficha?.alAutomatico ? "Fuera del envío automático" : "Va al envío automático", () => ponerAlAutomatico(prospectoId, !ficha?.alAutomatico))}>
            {ficha?.alAutomatico ? "Quitar del automático" : "Poner al automático"}
          </button>
          {tieneCorreo && !correoBloqueado && (
            <>
              <button className="boton" type="button" disabled={pendiente}
                onClick={() => correr("Correo bloqueado", () => bloquearCorreo(prospectoId, "no_quiere"))}>
                Bloquear: no quiere
              </button>
              <button className="boton" type="button" disabled={pendiente}
                onClick={() => correr("Correo bloqueado", () => bloquearCorreo(prospectoId, "rebote"))}>
                Bloquear: rebotó
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
