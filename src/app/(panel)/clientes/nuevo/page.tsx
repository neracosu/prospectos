import { exigirRol } from "@/lib/sesion";
import { FormularioCliente } from "@/componentes/FormularioCliente";

export const dynamic = "force-dynamic";

export default async function NuevoCliente() {
  await exigirRol("dueno");
  return (<><h1 className="titulo">Nuevo cliente</h1><FormularioCliente /></>);
}
