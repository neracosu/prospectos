import { exigirSesion } from "@/lib/sesion";
import { BarraInferior } from "@/componentes/BarraInferior";

export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  const u = await exigirSesion();
  return (
    <>
      <main className="contenedor">{children}</main>
      <BarraInferior rol={u.rol} />
    </>
  );
}
