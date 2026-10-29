import { exigirSesion } from "@/lib/sesion";
import { BarraInferior } from "@/componentes/BarraInferior";
import { BarraLateral } from "@/componentes/BarraLateral";
import { ProveedorFlotante } from "@/componentes/LineaFlotante";
import { RegistrarSW } from "@/componentes/RegistrarSW";
import { BusquedaGlobal } from "@/componentes/BusquedaGlobal";

export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  const u = await exigirSesion();
  return (
    <ProveedorFlotante>
      <div className="panel">
        <BarraLateral rol={u.rol} nombre={u.nombre} />
        <main className="contenedor">{children}</main>
        <BarraInferior rol={u.rol} />
      </div>
      <BusquedaGlobal />
      <RegistrarSW />
    </ProveedorFlotante>
  );
}
