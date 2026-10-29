import Link from "next/link";
import { listarNichos } from "@/lib/prospectos";
import { lotesRecientes, loteConDetalle } from "@/lib/revision";
import { etiquetaOrigen } from "@/lib/revision-contrato";
import { CIUDADES } from "@/lib/overpass-contrato";
import { FormOverpass } from "@/componentes/FormOverpass";
import { publicacionCargada } from "@/lib/overture";
import { reglaDeNicho } from "@/lib/overture-contrato";
import { FormMaps } from "@/componentes/FormMaps";
import { FormImportar } from "@/componentes/FormImportar";
import { Bandeja } from "@/componentes/Bandeja";

// Los cuatro nombres tienen que entrar juntos en 390 px: la tira de pestanas se
// desplaza y la activa puede quedar fuera de pantalla (la bandeja es la que se
// abre por defecto). El titulo de cada tarjeta dice el resto.
// Las pestanas de buscar dentro del Directorio (antes /buscar; «osm» pasa a llamarse «buscar»).
export const PESTANAS_BUSCAR = [
  { clave: "buscar", texto: "Mapa" },
  { clave: "maps", texto: "Maps" },
  { clave: "importar", texto: "Importar" },
  { clave: "bandeja", texto: "Bandeja" },
];
// Los lotes son UUID: cualquier otra cosa en ?lote= ni se consulta.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Android comparte de dos maneras: unas apps mandan la URL en ?url= y otras la
// meten dentro del texto ("Hotel Tal https://maps.app.goo.gl/x"). Se saca la
// primera URL del texto; si no hay ninguna, no se inventa nada.
function urlCompartida(sp: Record<string, string | undefined>): string {
  if (sp.url) return sp.url.slice(0, 2000);
  const m = (sp.text ?? "").match(/https?:\/\/\S+/);
  return m ? m[0].slice(0, 2000) : "";
}

// Sin pestana elegida: si viene un lote se abre ese, si viene un enlace compartido desde el telefono se va a Maps,
// y si no, a la bandeja.
export function pestanaBuscar(sp: Record<string, string | undefined>): string {
  const pedido = sp.lote && UUID.test(sp.lote) ? sp.lote : "";
  return PESTANAS_BUSCAR.some((p) => p.clave === sp.t) ? sp.t! : pedido ? "bandeja" : urlCompartida(sp) ? "maps" : "bandeja";
}

export async function DirectorioBuscar({ sp, t }: { sp: Record<string, string | undefined>; t: string }) {
  const compartida = urlCompartida(sp);
  const pedido = sp.lote && UUID.test(sp.lote) ? sp.lote : "";
  const pagina = Math.max(1, Math.trunc(Number(sp.p)) || 1);

  const [nichos, lotes, lote, [pubVE, pubCO]] = await Promise.all([
    listarNichos(),
    t === "bandeja" && !pedido ? lotesRecientes() : Promise.resolve([]),
    t === "bandeja" && pedido ? loteConDetalle(pedido, { pagina }) : Promise.resolve(null),
    t === "buscar" ? Promise.all([publicacionCargada("VE"), publicacionCargada("CO")]) : Promise.resolve([null, null] as const),
  ]);
  const porRevisar = lotes.filter((l) => l.pendientes > 0);
  const listos = lotes.filter((l) => l.pendientes === 0);
  const enlacePagina = (n: number) => `/directorio?t=bandeja&lote=${lote!.lote}&p=${n}`;

  return (
    <>
      <p className="suave">
        Solo datos que el negocio publicó, cada uno con su fuente. Nada entra al panel sin que lo apruebes
        en la bandeja.
      </p>

      {t === "buscar" && (
        <FormOverpass
          nichos={nichos}
          ciudades={CIUDADES.map((c) => ({ slug: c.slug, nombre: c.nombre, pais: c.pais }))}
          directorio={{ publicaciones: { VE: pubVE, CO: pubCO }, sinNicho: nichos.filter((n) => !reglaDeNicho(n.slug)).map((n) => n.id) }}
        />
      )}
      {t === "maps" && <FormMaps nichos={nichos} urlInicial={compartida} />}
      {t === "importar" && <FormImportar />}

      {t === "bandeja" &&
        (lote ? (
          <>
            <Bandeja lote={lote} />
            {/* El paginador es del servidor a proposito: son enlaces, no estado
                del navegador, y asi la pagina se puede compartir y recargar. */}
            <nav className="paginador" aria-label="Páginas del lote">
              <span className="suave paginador__cuenta">
                Filas {lote.desde}–{lote.hasta} de {lote.total}
              </span>
              <div className="paginador__botones">
                {lote.pagina > 1 ? (
                  <Link className="boton" href={enlacePagina(lote.pagina - 1)} rel="prev">
                    Anteriores
                  </Link>
                ) : (
                  <span />
                )}
                {lote.pagina < lote.paginas ? (
                  <Link className="boton" href={enlacePagina(lote.pagina + 1)} rel="next">
                    Siguientes
                  </Link>
                ) : (
                  <span />
                )}
              </div>
            </nav>
          </>
        ) : (
          <>
            {sp.lote && (
              <section className="tarjeta">
                <b>Ese lote ya no está</b>
                <p className="suave">
                  Los lotes ya decididos se limpian a los 30 días. Los prospectos que aprobaste siguen en
                  el panel.
                </p>
              </section>
            )}
            <section className="tarjeta">
              <b>Lo que está por revisar</b>
              {porRevisar.length === 0 ? (
                <>
                  <p className="suave">
                    {listos.length > 0
                      ? "No queda nada por decidir. Busca negocios en el mapa, lee una ficha de Google Maps o sube una lista."
                      : "Todavía no hay nada por revisar. Busca negocios en el mapa, lee una ficha de Google Maps o sube una lista: todo cae acá antes de entrar al panel."}
                  </p>
                  <div className="fila-botones">
                    <Link className="boton boton--primario" href="/directorio?t=buscar">
                      Buscar en el mapa
                    </Link>
                    <Link className="boton" href="/directorio?t=importar">
                      Importar una lista
                    </Link>
                  </div>
                </>
              ) : (
                porRevisar.map((l) => (
                  <Link key={l.lote} href={`/directorio?t=bandeja&lote=${l.lote}`} className="fila">
                    <span>
                      <b>{etiquetaOrigen(l.origen)}</b>
                      <br />
                      <span className="suave">
                        {l.creadoEn.toLocaleString("es-VE", { timeZone: "America/Caracas", dateStyle: "short", timeStyle: "short" })} · {l.total}{" "}
                        {l.total === 1 ? "ficha" : "fichas"}
                      </span>
                    </span>
                    <span className="etiqueta etiqueta--repetido">{l.pendientes} por decidir</span>
                  </Link>
                ))
              )}
            </section>
            {listos.length > 0 && (
              <section className="tarjeta tarjeta--decidida">
                <b>Listos</b>
                <p className="suave">Lotes ya decididos. Se borran solos a los 30 días.</p>
                {listos.map((l) => (
                  <Link key={l.lote} href={`/directorio?t=bandeja&lote=${l.lote}`} className="fila">
                    <span>
                      <b>{etiquetaOrigen(l.origen)}</b>
                      <br />
                      <span className="suave">
                        {l.creadoEn.toLocaleString("es-VE", { timeZone: "America/Caracas", dateStyle: "short", timeStyle: "short" })} · {l.total}{" "}
                        {l.total === 1 ? "ficha" : "fichas"}
                      </span>
                    </span>
                    <span className="etiqueta">Listo</span>
                  </Link>
                ))}
              </section>
            )}
          </>
        ))}
    </>
  );
}
