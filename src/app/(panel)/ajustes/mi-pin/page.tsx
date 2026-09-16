// lo unico de Ajustes que ve el prospectador
import { exigirSesion } from "@/lib/sesion";
import { FormularioPin } from "@/componentes/FormularioPin";

export default async function MiPin() {
  await exigirSesion();
  return (
    <>
      <h1 className="titulo">Mi PIN</h1>
      <FormularioPin />
    </>
  );
}
