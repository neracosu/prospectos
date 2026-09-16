import { exigirRol } from "@/lib/sesion";
import { prisma } from "@/lib/db";
import { listarUsuarios } from "@/lib/usuarios";
import { FormularioNicho, FormularioUsuario } from "@/componentes/FormularioAjustes";
import { FormularioPin } from "@/componentes/FormularioPin";

export const dynamic = "force-dynamic";

export default async function Ajustes() {
  await exigirRol("dueno");
  const [nichos, usuarios] = await Promise.all([
    prisma.nicho.findMany({ orderBy: { nombre: "asc" } }),
    listarUsuarios(),
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
      <h2 className="titulo">Mi PIN</h2>
      <FormularioPin />
    </>
  );
}
