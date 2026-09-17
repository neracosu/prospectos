import { exigirSesion } from "@/lib/sesion";
import { BarraInferior } from "@/componentes/BarraInferior";
import { ProveedorFlotante } from "@/componentes/LineaFlotante";

export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  const u = await exigirSesion();
  return (
    <ProveedorFlotante>
      <main className="contenedor">{children}</main>
      <BarraInferior rol={u.rol} />
    </ProveedorFlotante>
  );
}
