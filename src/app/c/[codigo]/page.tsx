import { notFound, redirect } from "next/navigation";
import { CODIGO_VALIDO } from "@/lib/codigo";
import { sesionCliente, limitarPortal } from "@/lib/sesion-cliente";
import { clienteParaEntrada } from "@/lib/portal";
import { leerEmisor } from "@/lib/configuracion";
import { primerNombre } from "@/lib/portal-contrato";
import { entrarPortal } from "@/acciones/portal";
import { TecladoPin } from "@/componentes/TecladoPin";

export const dynamic = "force-dynamic";

export default async function EntradaPortal({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  if (!CODIGO_VALIDO.test(codigo)) notFound();
  await limitarPortal();
  const c = await clienteParaEntrada(codigo);
  if (!c) notFound();
  const s = await sesionCliente();
  if (s && s.codigo === codigo) redirect(`/c/${codigo}/inicio`);
  const emisor = await leerEmisor();
  const quien = primerNombre(emisor.nombre);
  // Acceso nunca enviado o desactivado: la misma pantalla, sin pedir PIN.
  if (c.acceso !== "activo") {
    return (
      <main className="portal portal--entrar">
        <span className="portal__logo">NERACOSU<i>.</i></span>
        <h1>Acceso desactivado</h1>
        <p className="portal__bajada">{c.nombre}: por ahora no puedes entrar al portal. Escríbele a {quien} y te lo activa.</p>
        {emisor.whatsapp && <p><a className="boton boton--primario" href={`https://wa.me/${emisor.whatsapp}`} target="_blank" rel="noopener">Escribirle a {quien} por WhatsApp</a></p>}
      </main>
    );
  }
  return (
    <main className="portal portal--entrar">
      <span className="portal__logo">NERACOSU<i>.</i></span>
      <h1>{c.nombre}</h1>
      <p className="portal__bajada">Escribe tu PIN de 6 números para ver tus proyectos.</p>
      <TecladoPin accion={entrarPortal} campos={{ codigo }} />
      <p className="portal__pie">¿No tienes tu PIN? Escríbele a {quien} y te lo envía de nuevo.</p>
    </main>
  );
}
