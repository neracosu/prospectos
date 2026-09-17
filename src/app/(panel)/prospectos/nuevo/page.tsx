import { exigirSesion } from "@/lib/sesion";
import { listarNichos } from "@/lib/prospectos";
import { FormularioNuevo, type ValoresNuevo } from "@/componentes/FormularioNuevo";

export const dynamic = "force-dynamic";

const PRELLENA = ["fuente", "nombre", "web", "telefono", "nota"] as const;
// Tope al vuelo: lo que venga por la URL es texto de afuera. Las validaciones de
// verdad las hace crearProspecto; esto solo evita pintar un campo absurdo.
const MAX = 2000;

export default async function Nuevo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirSesion();
  const sp = await searchParams;
  const valores: ValoresNuevo = {};
  for (const k of PRELLENA) {
    const v = sp[k];
    const texto = Array.isArray(v) ? v[0] : v;
    if (texto) valores[k] = texto.slice(0, MAX);
  }
  const nichos = await listarNichos();
  return (
    <>
      <h1 className="titulo">Nuevo prospecto</h1>
      {valores.fuente && (
        <p className="suave">
          Viene del enlace que se leyó: copia lo que el negocio publica en esa ficha. La fuente ya quedó
          puesta.
        </p>
      )}
      <FormularioNuevo nichos={nichos} valores={valores} />
    </>
  );
}
