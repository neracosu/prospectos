import Link from "next/link";
import { exigirRol } from "@/lib/sesion";
import { hoyCaracas } from "@/lib/fecha-caracas";
import { colaCorreo, cifrasCorreo, enviadosHoy, type Cifras } from "@/lib/correos";
import { leerCorreosAutomatico, leerCorreosPorDia } from "@/lib/configuracion";
import { ESTADOS_COLA, ETIQUETA_ESTADO_COLA, esEstadoCola, porcentaje, proximoLote, type EstadoCola } from "@/lib/correos-contrato";
import { ANTETITULO_POR_ARQUETIPO } from "@/lib/mensajes-nicho-contrato";
import { CabeceraPagina } from "@/componentes/CabeceraPagina";
import { ColaCorreos } from "@/componentes/ColaCorreos";
import { InterruptorAutomatico } from "@/componentes/FormularioAjustesCorreos";

export const dynamic = "force-dynamic";

const ARQUETIPOS = Object.keys(ANTETITULO_POR_ARQUETIPO);
const FILAS_CIFRAS: { clave: keyof Cifras; texto: string }[] = [
  { clave: "enviados", texto: "Enviados" },
  { clave: "abrieron", texto: "Abrieron" },
  { clave: "vieron", texto: "Vieron la propuesta" },
  { clave: "descargaron", texto: "Descargaron el PDF" },
  { clave: "respondieron", texto: "Respondieron" },
];
const VACIO: Record<EstadoCola, string> = {
  listas: "No hay negocios listos para escribirles. Entran aquí los del directorio con correo, ficha y plantilla que todavía no recibieron nada.",
  enviadas: "Todavía no sale ningún correo.",
  seguimiento: "Ningún seguimiento toca hoy.",
  fallidas: "Ningún envío falló.",
  bloqueadas: "Ningún correo bloqueado.",
};

function hrefDe(estado: EstadoCola, arquetipo: string) {
  const q = new URLSearchParams({ estado });
  if (arquetipo) q.set("arquetipo", arquetipo);
  return `/correos?${q}`;
}

// Correos (propuesta por correo, 29-oct-2026): la cola del directorio con correo y ficha, las cifras de lo enviado,
// el estado del automatico y la vista previa de cada correo. Solo el dueno.
export default async function Correos({ searchParams }: { searchParams: Promise<{ estado?: string; arquetipo?: string }> }) {
  await exigirRol("dueno");
  const sp = await searchParams;
  const estado: EstadoCola = esEstadoCola(sp.estado ?? "") ? (sp.estado as EstadoCola) : "listas";
  const arquetipo = ARQUETIPOS.includes(sp.arquetipo ?? "") ? sp.arquetipo! : "";
  const hoy = hoyCaracas();
  const [filas, listas, cifras, delDia, tope, activo] = await Promise.all([
    colaCorreo(hoy, { estado, ...(arquetipo ? { arquetipo } : {}) }),
    estado === "listas" && !arquetipo ? null : colaCorreo(hoy, { estado: "listas" }),
    cifrasCorreo(), enviadosHoy(hoy), leerCorreosPorDia(), leerCorreosAutomatico(),
  ]);
  const nListas = (listas ?? filas).length;
  const conCifras = Object.entries(cifras.porArquetipo).sort((a, b) => b[1].enviados - a[1].enviados);
  const total = cifras.total;
  return (
    <>
      <CabeceraPagina titulo="Correos" cifra={`${nListas} ${nListas === 1 ? "lista" : "listas"} · ${delDia}/${tope} hoy`} />

      <section className="correos-cifras" aria-label="Cifras de los correos">
        {FILAS_CIFRAS.map((c) => (
          <div key={c.clave} className="cifra">
            <b>{total[c.clave]}</b>
            <span>{c.texto}{c.clave !== "enviados" ? ` · ${porcentaje(total[c.clave], total.enviados)}` : ""}</span>
          </div>
        ))}
      </section>
      <p className="suave">Porcentajes sobre enviados. La apertura es aproximada: muchos programas de correo no cargan imágenes y otros las cargan solos.</p>
      {conCifras.length > 0 && (
        <details className="acordeon correos-por-plantilla">
          <summary><span>Por plantilla</span><span className="suave">{conCifras.length}</span></summary>
          <div className="acordeon__cuerpo">
            <table className="tabla">
              <thead><tr><th>Plantilla</th>{FILAS_CIFRAS.map((c) => <th key={c.clave} className="num">{c.texto}</th>)}</tr></thead>
              <tbody>
                {conCifras.map(([a, c]) => (
                  <tr key={a}>
                    <td data-label="Plantilla"><b>{ANTETITULO_POR_ARQUETIPO[a] ?? a}</b></td>
                    {FILAS_CIFRAS.map((k) => <td key={k.clave} data-label={k.texto} className="num">{c[k.clave]}{k.clave !== "enviados" ? <span className="suave"> · {porcentaje(c[k.clave], c.enviados)}</span> : null}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <section className="tarjeta correos-automatico" data-activo={activo ? "si" : "no"}>
        <div>
          <b>Envío automático: {activo ? "encendido" : "en pausa"}</b>
          <p className="suave">{delDia}/{tope} hoy · {proximoLote(new Date(), { activo, delDia, tope })}</p>
        </div>
        <InterruptorAutomatico tope={tope} activo={activo} />
      </section>

      <nav className="pestanas" aria-label="Estado de los correos">
        {ESTADOS_COLA.map((e) => <Link key={e} href={hrefDe(e, arquetipo)} className={"pestanas__item" + (e === estado ? " activa" : "")} aria-current={e === estado ? "page" : undefined}>{ETIQUETA_ESTADO_COLA[e]}</Link>)}
      </nav>
      <nav className="pestanas" aria-label="Plantilla">
        <Link href={hrefDe(estado, "")} className={"pestanas__item" + (!arquetipo ? " activa" : "")} aria-current={!arquetipo ? "page" : undefined}>Todas</Link>
        {ARQUETIPOS.map((a) => <Link key={a} href={hrefDe(estado, a)} className={"pestanas__item" + (a === arquetipo ? " activa" : "")} aria-current={a === arquetipo ? "page" : undefined}>{ANTETITULO_POR_ARQUETIPO[a]}</Link>)}
      </nav>

      {filas.length === 0 ? <p className="suave">{VACIO[estado]}</p> : <ColaCorreos filas={filas} />}
    </>
  );
}
