import { exigirSesion } from "@/lib/sesion";
import { listarNichos } from "@/lib/prospectos";
import { FormularioNuevo } from "@/componentes/FormularioNuevo";

export default async function Nuevo() {
  await exigirSesion();
  const nichos = await listarNichos();
  return (<><h1 className="titulo">Nuevo prospecto</h1><FormularioNuevo nichos={nichos} /></>);
}
