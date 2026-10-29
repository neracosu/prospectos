import Link from "next/link";
import { exigirSesion } from "@/lib/sesion";
import { hoyCaracas, fechaVisible } from "@/lib/fecha-caracas";
import { datosInicio } from "@/lib/inicio";
import { CabeceraPagina } from "@/componentes/CabeceraPagina";
import { CifrasInicio } from "@/componentes/CifrasInicio";
import { InicioProspectador } from "@/componentes/InicioProspectador";

export const dynamic = "force-dynamic";

const ESTADO_TEXTO = { vencido: "Vencido", hoy: "Hoy", proximo: "" } as const;

// Inicio (panel CRM, fase 1): el dueno ve cuatro cifras y una sola lista «Hoy» con lo que toca; el prospectador
// sigue viendo su cola del dia.
export default async function Inicio() {
  const u = await exigirSesion();
  if (u.rol !== "dueno") return <InicioProspectador usuario={{ id: u.id, nombre: u.nombre }} />;
  const hoy = hoyCaracas();
  const { cifras, hoyLista, ultimas } = await datosInicio(hoy);
  return (
    <>
      <CabeceraPagina titulo="Inicio" accion={<Link href="/prospectos/nuevo" className="boton boton--primario">Nuevo prospecto</Link>} />
      <CifrasInicio cifras={cifras} />

      <section aria-labelledby="hoy-titulo">
        <h2 id="hoy-titulo">Hoy</h2>
        {hoyLista.length === 0 && <p className="suave">Nada pendiente. Las solicitudes nuevas están en <Link href="/solicitudes">Solicitudes</Link>.</p>}
        {hoyLista.length > 0 && (
          <ul className="hoy-lista">
            {hoyLista.map((i) => (
              <li key={i.id} className={`hoy-item hoy-item--${i.estado}`} data-tipo={i.tipo}>
                <Link href={i.href} className="hoy-item__texto">
                  <b>{i.titulo}</b>
                  <span className="suave">{i.sub}</span>
                </Link>
                <span className={`hoy-item__fecha hoy-item__fecha--${i.estado}`}>{ESTADO_TEXTO[i.estado] || fechaVisible(i.fecha)}</span>
                {i.tipo === "seguimiento" && (i.enlaceWhatsApp ? <a className="boton boton--primario mini" href={i.enlaceWhatsApp} target="_blank" rel="noopener noreferrer">WhatsApp</a> : <Link className="boton mini" href={i.href}>Ver ficha</Link>)}
                {i.tipo === "cobro" && <Link className="boton mini" href={i.href}>Ver cobro</Link>}
                {i.tipo === "hito" && <Link className="boton mini" href={i.href}>Ver proyecto</Link>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="ultimas-titulo">
        <h2 id="ultimas-titulo">Últimas solicitudes</h2>
        {ultimas.length === 0 && <p className="suave">Todavía no llega ninguna. Las que entren por la web y por /empezar aparecen en <Link href="/solicitudes">Solicitudes</Link>.</p>}
        {ultimas.length > 0 && (
          <ul className="hoy-lista">
            {ultimas.map((s) => (
              <li key={s.id} className={"hoy-item" + (s.atendidaEn ? "" : " hoy-item--nueva")} data-tipo="solicitud">
                <Link href="/solicitudes" className="hoy-item__texto">
                  <b>{s.nombre}</b>
                  <span className="suave">{s.tipo === "embudo" ? "Embudo /empezar" : s.tipo}{s.calificacion === "demo" ? " · califica para demostración" : ""}</span>
                </Link>
                <span className="hoy-item__fecha">{s.atendidaEn ? "Atendida" : "Nueva"}</span>
              </li>
            ))}
          </ul>
        )}
        {ultimas.length > 0 && <p><Link href="/solicitudes">Ver todas las solicitudes</Link></p>}
      </section>

      <p className="suave"><Link href="/directorio?t=cola">Cola de prospección: los 10 del día, seguimientos y el embudo →</Link></p>
    </>
  );
}
