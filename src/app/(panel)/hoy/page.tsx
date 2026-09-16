import Link from "next/link";
import { exigirSesion } from "@/lib/sesion";
import { hoyCaracas } from "@/lib/fecha-caracas";
import { resumenHoy, seguimientosQueTocan, colaDelDia } from "@/lib/prospectos";
import { prisma } from "@/lib/db";
import { TarjetaCola } from "@/componentes/TarjetaCola";
import { TarjetaSeguimiento } from "@/componentes/TarjetaSeguimiento";

export const dynamic = "force-dynamic";

export default async function Hoy() {
  const u = await exigirSesion();
  const hoy = hoyCaracas();
  const [resumen, seguimientos, cola, ganadosSinProyecto] = await Promise.all([
    resumenHoy(hoy), seguimientosQueTocan(hoy), colaDelDia(10),
    // Pieza 3: cuando exista Proyecto, esta consulta pasa a contar ganados sin proyecto.
    prisma.prospecto.count({ where: { etapa: "ganado" } }),
  ]);
  const mio = resumen.porUsuario.find((x) => x.id === u.id) ?? { enviados: 0, meta: 0, nombre: u.nombre, id: u.id };
  const otros = resumen.porUsuario.filter((x) => x.id !== u.id);
  const pct = mio.meta ? Math.min(100, Math.round((mio.enviados / mio.meta) * 100)) : 0;

  return (
    <>
      <section className="tarjeta">
        <b>Hoy: {mio.enviados} de {mio.meta} enviados</b>
        <div className="progreso" role="progressbar" aria-valuenow={mio.enviados} aria-valuemax={mio.meta}><i style={{ width: `${pct}%` }} /></div>
        {otros.map((o) => <div key={o.id} className="suave">{o.nombre}: {o.enviados} de {o.meta}</div>)}
        <div className="embudo">
          <div><b>{resumen.embudo.por_contactar}</b>por contactar</div>
          <div><b>{resumen.embudo.enviado}</b>enviados</div>
          <div><b>{resumen.embudo.respondio}</b>respondieron</div>
          <div><b>{resumen.embudo.reunion}</b>reuniones</div>
        </div>
        {ganadosSinProyecto > 0 && u.rol === "dueno" && <p className="suave">{ganadosSinProyecto} ganado(s): el módulo de proyectos llega en la pieza 3.</p>}
      </section>

      <h2 className="titulo">Seguimientos que tocan ({seguimientos.length})</h2>
      {seguimientos.length === 0 && <p className="suave">Ninguno hoy.</p>}
      {seguimientos.map((p) => <TarjetaSeguimiento key={p.id} p={p} />)}

      <h2 className="titulo">Por contactar</h2>
      {cola.length === 0 && <p className="suave">La cola está vacía. <Link href="/prospectos/nuevo">Agrega un prospecto</Link>.</p>}
      {cola.map((p) => <TarjetaCola key={p.id} p={p} />)}
    </>
  );
}
