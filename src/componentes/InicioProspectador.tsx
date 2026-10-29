import Link from "next/link";
import { hoyCaracas } from "@/lib/fecha-caracas";
import { resumenHoy, seguimientosQueTocan, colaDelDia } from "@/lib/prospectos";
import { TarjetaCola } from "@/componentes/TarjetaCola";
import { TarjetaSeguimiento } from "@/componentes/TarjetaSeguimiento";
import { ProveedorHoy, ResumenHoy } from "@/componentes/ResumenHoy";
import type { CifrasHoy } from "@/lib/hoy-contrato";

// La pantalla «Hoy» de siempre (cola del dia, seguimientos, cifras del embudo), que desde la fase 1 del panel
// CRM es el Inicio del prospectador. El dueno tiene el suyo con cifras y la lista Hoy (inicio/page.tsx).
export async function InicioProspectador({ usuario }: { usuario: { id: number; nombre: string } }) {
  const hoy = hoyCaracas();
  const [resumen, seguimientos, cola] = await Promise.all([resumenHoy(hoy), seguimientosQueTocan(hoy), colaDelDia(10)]);
  const mio = resumen.porUsuario.find((x) => x.id === usuario.id) ?? { enviados: 0, meta: 0, nombre: usuario.nombre, id: usuario.id };
  const otros = resumen.porUsuario.filter((x) => x.id !== usuario.id);
  const cifras: CifrasHoy = { enviados: mio.enviados, meta: mio.meta, por_contactar: resumen.embudo.por_contactar, enviado: resumen.embudo.enviado, respondio: resumen.embudo.respondio, reunion: resumen.embudo.reunion };
  return (
    <ProveedorHoy cifras={cifras}>
      <ResumenHoy cifras={cifras} otros={otros} />
      <h2 className="titulo" tabIndex={-1}>Seguimientos que tocan ({seguimientos.length})</h2>
      {seguimientos.length === 0 && <p className="suave">Ninguno hoy.</p>}
      {seguimientos.map((p) => <TarjetaSeguimiento key={p.id} p={p} hoy={hoy} />)}
      <h2 className="titulo" tabIndex={-1}>Por contactar</h2>
      {cola.length === 0 && <p className="suave">La cola está vacía. <Link href="/prospectos/nuevo">Agrega un prospecto</Link>.</p>}
      {cola.map((p) => <TarjetaCola key={p.id} p={p} />)}
    </ProveedorHoy>
  );
}
