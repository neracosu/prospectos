import { redirect } from "next/navigation";
import { sesionActual } from "@/lib/sesion";
import { TecladoPin } from "@/componentes/TecladoPin";

export default async function Entrar() {
  if (await sesionActual()) redirect("/hoy");
  return (
    <main className="contenedor entrar">
      <h1 className="titulo">Prospectos</h1>
      <p className="suave">Escribe tu PIN.</p>
      <TecladoPin />
    </main>
  );
}
