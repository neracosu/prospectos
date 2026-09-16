import { exigirRol } from "@/lib/sesion";
import { prisma } from "@/lib/db";
import { listarUsuarios } from "@/lib/usuarios";
import { leerConfig, leerEmisor, leerTarifaHora, CLAVES } from "@/lib/configuracion";
import { FormularioNicho, FormularioUsuario } from "@/componentes/FormularioAjustes";
import { FormularioMensajesCobro, FormularioEmisor, FormularioTarifa } from "@/componentes/FormularioAjustesCobros";
import { FormularioPin } from "@/componentes/FormularioPin";

export const dynamic = "force-dynamic";

export default async function Ajustes() {
  await exigirRol("dueno");
  const [nichos, usuarios, mensajeRecordatorio, mensajeVencido, emisor, tarifaHora] = await Promise.all([
    prisma.nicho.findMany({ orderBy: { nombre: "asc" } }),
    listarUsuarios(),
    leerConfig(CLAVES.mensajeRecordatorio),
    leerConfig(CLAVES.mensajeVencido),
    leerEmisor(),
    leerTarifaHora(),
  ]);
  return (
    <>
      <h1 className="titulo">Ajustes</h1>
      <h2 className="titulo">Usuarios</h2>
      {usuarios.map((u) => (
        <FormularioUsuario key={u.id} usuario={u} />
      ))}
      <FormularioUsuario />
      <h2 className="titulo">Mensajes por nicho</h2>
      {nichos.map((n) => (
        <FormularioNicho key={n.id} nicho={n} />
      ))}
      <h2 className="titulo">Cobros</h2>
      <FormularioMensajesCobro recordatorio={mensajeRecordatorio} vencido={mensajeVencido} />
      <FormularioEmisor emisor={emisor} />
      <FormularioTarifa tarifa={tarifaHora} />
      <h2 className="titulo">Mi PIN</h2>
      <FormularioPin />
    </>
  );
}
