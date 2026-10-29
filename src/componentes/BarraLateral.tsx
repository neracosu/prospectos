"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { seccionesPara, estaActiva, type Rol } from "@/lib/navegacion-contrato";
import { Icono } from "@/componentes/Icono";
import { abrirBusqueda } from "@/componentes/BusquedaGlobal";

// Barra lateral del escritorio (desde 1024 px; en el telefono no se dibuja, lo decide el CSS). Mismas secciones
// que la barra inferior mas las que alla van detras de «Mas». Abajo, quien entro y «Salir».
export function BarraLateral({ rol, nombre }: { rol: Rol; nombre: string }) {
  const ruta = usePathname();
  return (
    <nav className="lateral" aria-label="Secciones">
      <Link href="/inicio" className="lateral__marca" aria-label="NERACOSU, inicio">NERACOSU<b>.</b></Link>
      <button type="button" className="lateral__buscar" onClick={abrirBusqueda}><Icono nombre="buscar" /><span>Buscar</span><kbd>Ctrl K</kbd></button>
      <ul className="lateral__lista">
        {seccionesPara(rol).map((s) => {
          const activa = estaActiva(ruta, s.href);
          return (
            <li key={s.href}>
              <Link href={s.href} className={"lateral__item" + (activa ? " activo" : "")} aria-current={activa ? "page" : undefined}>
                <Icono nombre={s.icono} />
                <span>{s.texto}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="lateral__pie">
        <span className="lateral__usuario">{nombre}</span>
        <a href="/salir" className="lateral__salir">Salir</a>
      </div>
    </nav>
  );
}
