import { exigirSesion } from "@/lib/sesion";
import { listarNichos } from "@/lib/prospectos";
import { TOPES } from "@/lib/tabla-contrato";
import { FormularioNuevo, type ValoresNuevo } from "@/componentes/FormularioNuevo";

export const dynamic = "force-dynamic";

// Lo que se puede prellenar desde la URL (el camino de "cargarlo a mano" cuando
// no se pudo leer una ficha de Google Maps), con el tope de cada campo. Son los
// mismos que valida `Nuevo` en src/acciones/prospectos.ts: si aca entrara un
// valor mas largo, el servidor lo rechazaria con "Revisa nombre, ciudad y
// nicho", que no dice cual campo esta mal.
const TOPE = { fuente: 300, nombre: TOPES.nombre, web: 200, telefono: 80, nota: 2000 };

export default async function Nuevo({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirSesion();
  const sp = await searchParams;
  const texto = (k: string): string => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const recortado = (k: keyof typeof TOPE): string | undefined => {
    const v = texto(k).trim().slice(0, TOPE[k]);
    return v || undefined;
  };
  const valores: ValoresNuevo = {
    fuente: recortado("fuente"),
    nombre: recortado("nombre"),
    web: recortado("web"),
    telefono: recortado("telefono"),
    nota: recortado("nota"),
  };
  const nichos = await listarNichos();
  // El nicho prellenado tiene que existir: un id inventado en la URL dejaria el
  // select en un valor que la accion rechaza.
  const nichoId = Number(texto("nichoId"));
  if (nichos.some((n) => n.id === nichoId)) valores.nichoId = nichoId;

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
