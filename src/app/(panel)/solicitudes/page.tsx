import Link from "next/link";
import { exigirRol } from "@/lib/sesion";
import { listarSolicitudes } from "@/lib/web";
import { CabeceraPagina } from "@/componentes/CabeceraPagina";
import { TarjetaSolicitud } from "@/componentes/TarjetaSolicitud";

export const dynamic = "force-dynamic";

// Solicitudes (panel CRM, fase 1): lo que llega por el formulario de neracosu.com y por el embudo /empezar.
// Las sin atender primero. En la fase 2 cada una se convierte en lead con un toque.
export default async function Solicitudes({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  await exigirRol("dueno");
  const t = (await searchParams).t === "todas" ? "todas" : "nuevas";
  const todas = await listarSolicitudes(200);
  const nuevas = todas.filter((s) => !s.atendidaEn);
  const lista = t === "todas" ? todas : nuevas;
  return (
    <>
      <CabeceraPagina titulo="Solicitudes" cifra={nuevas.length > 0 ? `${nuevas.length} sin atender` : "Al día"} />
      <nav className="pestanas" aria-label="Filtro">
        <Link href="/solicitudes" className={"pestanas__item" + (t === "nuevas" ? " activa" : "")} aria-current={t === "nuevas" ? "page" : undefined}>Sin atender</Link>
        <Link href="/solicitudes?t=todas" className={"pestanas__item" + (t === "todas" ? " activa" : "")} aria-current={t === "todas" ? "page" : undefined}>Todas</Link>
      </nav>
      {lista.length === 0 && (
        <p className="suave">{t === "nuevas" && todas.length > 0 ? "Ninguna sin atender." : "Todavía no llega ninguna. Las que entren por la web y por /empezar aparecen aquí."}</p>
      )}
      {lista.map((s) => <TarjetaSolicitud key={s.id} s={s} />)}
    </>
  );
}
