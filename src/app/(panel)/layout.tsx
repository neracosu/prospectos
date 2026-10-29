import { exigirSesion } from "@/lib/sesion";
import { BarraInferior } from "@/componentes/BarraInferior";
import { BarraLateral } from "@/componentes/BarraLateral";
import { ProveedorFlotante } from "@/componentes/LineaFlotante";
import { RegistrarSW } from "@/componentes/RegistrarSW";

export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  const u = await exigirSesion();
  return (
    <ProveedorFlotante>
      <BarraLateral rol={u.rol} nombre={u.nombre} />
      <main className="contenedor">{children}</main>
      <BarraInferior rol={u.rol} />
      <RegistrarSW />
    </ProveedorFlotante>
  );
}
