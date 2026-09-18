import { exigirSesion } from "@/lib/sesion";
import { BarraInferior } from "@/componentes/BarraInferior";
import { ProveedorFlotante } from "@/componentes/LineaFlotante";
import { RegistrarSW } from "@/componentes/RegistrarSW";

export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  const u = await exigirSesion();
  return (
    <ProveedorFlotante>
      <main className="contenedor">{children}</main>
      <BarraInferior rol={u.rol} />
      <RegistrarSW />
    </ProveedorFlotante>
  );
}
