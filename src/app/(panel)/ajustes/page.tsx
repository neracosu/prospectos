import { exigirRol } from "@/lib/sesion";
import { prisma } from "@/lib/db";
import { listarUsuarios } from "@/lib/usuarios";
import { leerConfig, leerEmisor, leerTarifaHora, CLAVES } from "@/lib/configuracion";
import { CabeceraPagina } from "@/componentes/CabeceraPagina";
import { FormularioNicho, FormularioUsuario } from "@/componentes/FormularioAjustes";
import { FormularioMensajesCobro, FormularioEmisor, FormularioTarifa, FormularioMensajesAviso } from "@/componentes/FormularioAjustesCobros";
import { FormularioPin } from "@/componentes/FormularioPin";

export const dynamic = "force-dynamic";

const SECCIONES = [
  { id: "usuarios", texto: "Usuarios" },
  { id: "nichos", texto: "Mensajes por nicho" },
  { id: "cobros", texto: "Cobros" },
  { id: "pin", texto: "Mi PIN" },
] as const;

// Ajustes (panel CRM, fase 1): indice y acordeon. Todo cerrado hasta que se toca; los nichos son una lista y cada
// uno abre solo su formulario. ?abrir=<id> deja abierto ese bloque (y la seccion que lo contiene) al refrescar.
export default async function Ajustes({ searchParams }: { searchParams: Promise<{ abrir?: string }> }) {
  await exigirRol("dueno");
  const abrir = (await searchParams).abrir ?? "";
  const [nichos, usuarios, mensajeRecordatorio, mensajeVencido, emisor, tarifaHora, avisoHito, avisoVersion, avisoCobro] = await Promise.all([
    prisma.nicho.findMany({ orderBy: { nombre: "asc" } }),
    listarUsuarios(),
    leerConfig(CLAVES.mensajeRecordatorio),
    leerConfig(CLAVES.mensajeVencido),
    leerEmisor(),
    leerTarifaHora(),
    leerConfig(CLAVES.avisoHito),
    leerConfig(CLAVES.avisoVersion),
    leerConfig(CLAVES.avisoCobro),
  ]);
  const abierta = (id: string) => abrir === id || (id === "nichos" && abrir.startsWith("nicho-"));
  return (
    <>
      <CabeceraPagina titulo="Ajustes" />
      <nav className="indice-ajustes" aria-label="Secciones de ajustes">
        {SECCIONES.map((s) => <a key={s.id} href={`#${s.id}`}>{s.texto}</a>)}
      </nav>
      <div className="ajustes-cuerpo">
        <details className="acordeon" id="usuarios" open={abierta("usuarios")}>
          <summary><span>Usuarios</span><span className="suave">{usuarios.length}</span></summary>
          <div className="acordeon__cuerpo">
            {usuarios.map((u) => <FormularioUsuario key={u.id} usuario={u} />)}
            <FormularioUsuario />
          </div>
        </details>

        <details className="acordeon" id="nichos" open={abierta("nichos")}>
          <summary><span>Mensajes por nicho</span><span className="suave">{nichos.length} nichos</span></summary>
          <div className="acordeon__cuerpo">
            <ul className="lista-nichos">
              {nichos.map((n) => (
                <li key={n.id}>
                  <details className="acordeon acordeon--nicho" id={`nicho-${n.id}`} open={abrir === `nicho-${n.id}`}>
                    <summary><span>{n.nombre}</span><span className="suave">seguimiento a los {n.diasSeguimiento} días</span></summary>
                    <div className="acordeon__cuerpo"><FormularioNicho nicho={n} /></div>
                  </details>
                </li>
              ))}
            </ul>
          </div>
        </details>

        <details className="acordeon" id="cobros" open={abierta("cobros")}>
          <summary><span>Cobros</span><span className="suave">mensajes, avisos, emisor, tarifa</span></summary>
          <div className="acordeon__cuerpo">
            <FormularioMensajesCobro recordatorio={mensajeRecordatorio} vencido={mensajeVencido} />
            <FormularioMensajesAviso hito={avisoHito} version={avisoVersion} cobro={avisoCobro} />
            <FormularioEmisor emisor={emisor} />
            <FormularioTarifa tarifa={tarifaHora} />
          </div>
        </details>

        <details className="acordeon" id="pin" open={abierta("pin")}>
          <summary><span>Mi PIN</span></summary>
          <div className="acordeon__cuerpo"><FormularioPin /></div>
        </details>
      </div>
    </>
  );
}
