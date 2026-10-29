import { exigirSesion } from "@/lib/sesion";
import { prisma } from "@/lib/db";
import { CabeceraPagina } from "@/componentes/CabeceraPagina";
import { FormularioLead } from "@/componentes/FormularioLead";

export const dynamic = "force-dynamic";

export default async function NuevoLead({ searchParams }: { searchParams: Promise<{ nicho?: string }> }) {
  await exigirSesion();
  const sp = await searchParams;
  const nichos = await prisma.nicho.findMany({ select: { id: true, nombre: true, slug: true }, orderBy: { nombre: "asc" } });
  const pedido = Number(sp.nicho);
  const nichoInicial = nichos.some((n) => n.id === pedido) ? pedido : undefined;
  return (
    <>
      <CabeceraPagina titulo="Nuevo lead" />
      <FormularioLead nichos={nichos} nichoInicial={nichoInicial} />
    </>
  );
}
