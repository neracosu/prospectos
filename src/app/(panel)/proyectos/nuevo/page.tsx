import { exigirRol } from "@/lib/sesion";
import { prisma } from "@/lib/db";
import { listarNichos } from "@/lib/prospectos";
import { listarClientes } from "@/lib/clientes";
import { FormularioProyecto } from "@/componentes/FormularioProyecto";

export const dynamic = "force-dynamic";

export default async function NuevoProyecto({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await exigirRol("dueno");
  const sp = await searchParams;
  const prospectoId = Number(sp.prospecto) || 0;
  const [nichos, clientes, prospecto] = await Promise.all([
    listarNichos(), listarClientes(),
    prospectoId ? prisma.prospecto.findUnique({ where: { id: prospectoId, etapa: "ganado" }, select: { id: true, nombre: true, nichoId: true, codigo: true } }) : null,
  ]);
  return (<><h1 className="titulo">Nuevo proyecto</h1><FormularioProyecto nichos={nichos} clientes={clientes.map((c) => ({ id: c.id, nombre: c.nombre }))} prospecto={prospecto ?? undefined} /></>);
}
