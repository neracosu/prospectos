import { exigirSesion } from "@/lib/sesion";
import { prisma } from "@/lib/db";
import { CabeceraPagina } from "@/componentes/CabeceraPagina";
import { FormularioLead } from "@/componentes/FormularioLead";

export const dynamic = "force-dynamic";

// Acepta el prellenado que antes recibia /prospectos/nuevo («Cargarlo a mano» desde Maps): nichoId, fuente, nombre, web, telefono, nota.
export default async function NuevoLead({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await exigirSesion();
  const sp = await searchParams;
  const nichos = await prisma.nicho.findMany({ select: { id: true, nombre: true, slug: true }, orderBy: { nombre: "asc" } });
  const pedido = Number(sp.nicho ?? sp.nichoId);
  const nichoInicial = nichos.some((n) => n.id === pedido) ? pedido : undefined;
  const corta = (s: string | undefined, n: number) => (s ?? "").slice(0, n);
  return (
    <>
      <CabeceraPagina titulo="Nuevo lead" />
      <FormularioLead nichos={nichos} nichoInicial={nichoInicial} valores={{ nombre: corta(sp.nombre, 120), web: corta(sp.web, 200), telefono: corta(sp.telefono, 80), fuente: corta(sp.fuente, 300), nota: corta(sp.nota, 2000) }} />
    </>
  );
}
