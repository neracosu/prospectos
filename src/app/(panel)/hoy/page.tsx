import Link from "next/link";
import { exigirSesion } from "@/lib/sesion";
import { hoyCaracas } from "@/lib/fecha-caracas";
import { resumenHoy, seguimientosQueTocan, colaDelDia } from "@/lib/prospectos";
import { ganadosSinProyecto as listarGanadosSinProyecto } from "@/lib/proyectos";
import { TarjetaCola } from "@/componentes/TarjetaCola";
import { TarjetaSeguimiento } from "@/componentes/TarjetaSeguimiento";
import { ProveedorHoy, ResumenHoy } from "@/componentes/ResumenHoy";
import type { CifrasHoy } from "@/lib/hoy-contrato";

export const dynamic = "force-dynamic";

export default async function Hoy() {
  const u = await exigirSesion();
  const hoy = hoyCaracas();
  const [resumen, seguimientos, cola, ganados] = await Promise.all([
    resumenHoy(hoy), seguimientosQueTocan(hoy), colaDelDia(10), listarGanadosSinProyecto(),
  ]);
  const mio = resumen.porUsuario.find((x) => x.id === u.id) ?? { enviados: 0, meta: 0, nombre: u.nombre, id: u.id };
  const otros = resumen.porUsuario.filter((x) => x.id !== u.id);
  const cifras: CifrasHoy = { enviados: mio.enviados, meta: mio.meta, por_contactar: resumen.embudo.por_contactar, enviado: resumen.embudo.enviado, respondio: resumen.embudo.respondio, reunion: resumen.embudo.reunion };

  return (
    // Las tarjetas ajustan las cifras al tocar (fase B de la pasada de UX); el proveedor los junta con el resumen.
    <ProveedorHoy cifras={cifras}>
      <ResumenHoy cifras={cifras} otros={otros}>
        {ganados.length > 0 && u.rol === "dueno" && (
          <div className="suave">
            {ganados.map((g) => (
              <div key={g.id}>
                {g.nombre} ({g.ciudad}) ganó y no tiene proyecto. <Link href={`/proyectos/nuevo?prospecto=${g.id}`}>Crear proyecto</Link>
              </div>
            ))}
          </div>
        )}
      </ResumenHoy>

      <h2 className="titulo" tabIndex={-1}>Seguimientos que tocan ({seguimientos.length})</h2>
      {seguimientos.length === 0 && <p className="suave">Ninguno hoy.</p>}
      {seguimientos.map((p) => <TarjetaSeguimiento key={p.id} p={p} hoy={hoy} />)}

      <h2 className="titulo" tabIndex={-1}>Por contactar</h2>
      {cola.length === 0 && <p className="suave">La cola está vacía. <Link href="/prospectos/nuevo">Agrega un prospecto</Link>.</p>}
      {cola.map((p) => <TarjetaCola key={p.id} p={p} />)}
    </ProveedorHoy>
  );
}
