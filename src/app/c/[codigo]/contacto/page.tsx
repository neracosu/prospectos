import { exigirCliente } from "@/lib/sesion-cliente";
import { leerEmisor } from "@/lib/configuracion";
import { primerNombre } from "@/lib/portal-contrato";
import { celularVisible } from "@/lib/recibos-contrato";
import { PortalBarra } from "@/componentes/PortalBarra";

export const dynamic = "force-dynamic";

export default async function ContactoPortal({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  await exigirCliente(codigo);
  const emisor = await leerEmisor();
  const quien = primerNombre(emisor.nombre);
  return (
    <main className="portal">
      <PortalBarra codigo={codigo} activa="contacto" />
      <h1>Contacto</h1>
      <p className="portal__bajada">Te atiende {emisor.nombre || "Neri Colón"}.</p>
      <section className="tarjeta">
        {emisor.whatsapp
          ? <><p style={{ margin: "0 0 12px" }}>Lo más rápido es WhatsApp: {celularVisible(emisor.whatsapp)}</p><a className="boton boton--primario" href={`https://wa.me/${emisor.whatsapp}`} target="_blank" rel="noopener">Escribirle a {quien} por WhatsApp</a></>
          : <p style={{ margin: 0 }}>Escríbele a {quien} por el mismo chat donde ya se comunican.</p>}
        {emisor.email && <p style={{ margin: "12px 0 0" }}>Correo: <a href={`mailto:${emisor.email}`}>{emisor.email}</a></p>}
      </section>
    </main>
  );
}
