import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirRol } from "@/lib/sesion";
import { hoyCaracas } from "@/lib/fecha-caracas";
import { fichaProyecto } from "@/lib/proyectos";
import { documentosDeProyecto } from "@/lib/documentos";
import { leerTarifaHora, leerEmisor } from "@/lib/configuracion";
import { faltantesEmisor } from "@/lib/recibos-contrato";
import { formatoUSD } from "@/lib/dinero";
import { CabeceraPagina } from "@/componentes/CabeceraPagina";
import { Semaforo } from "@/componentes/Semaforo";
import { EstadoProyecto } from "@/componentes/EstadoProyecto";
import { Pestanas } from "@/componentes/Pestanas";
import { AccionesProyecto } from "@/componentes/AccionesProyecto";
import { TabCobros } from "@/componentes/TabCobros";
import { TabPendientes } from "@/componentes/TabPendientes";
import { TabHoras } from "@/componentes/TabHoras";
import { TabVersiones } from "@/componentes/TabVersiones";
import { TabDocumentos } from "@/componentes/TabDocumentos";
import { canalesDisponibles } from "@/lib/canales-contrato";

export const dynamic = "force-dynamic";
// Desde la fase 3 el cliente vive en el resumen de la derecha, no en una pestana; ?t=cliente cae en cobros.
const PESTANAS = [{ clave: "cobros", texto: "Cobros" }, { clave: "pendientes", texto: "Pendientes" }, { clave: "horas", texto: "Horas" }, { clave: "versiones", texto: "Versiones" }, { clave: "documentos", texto: "Documentos" }];
const TEXTO_EVENTO: Record<string, string> = { proyecto_creado: "Proyecto creado", proyecto_estado: "Estado", proyecto_editado: "Proyecto editado", cobro_pagado: "Cobro pagado", pago_deshecho: "Pago deshecho", cobro_anulado: "Cobro anulado", cobro_agregado: "Cobro agregado", recordatorio: "Recordatorio enviado", hito_cumplido: "Hito cumplido", version_publicada: "Versión publicada", aviso_cliente: "Aviso al cliente", horas: "Horas", recibo_generado: "Recibo generado", nota_anulacion: "Nota de anulación", documento_subido: "Documento subido", documento_quitado: "Documento quitado" };

export default async function Proyecto({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await exigirRol("dueno");
  const id = Number((await params).id);
  const hoy = hoyCaracas();
  const [p, tarifa, emisor, documentos] = await Promise.all([Number.isInteger(id) ? fichaProyecto(id, hoy) : null, leerTarifaHora(), leerEmisor(), Number.isInteger(id) && id > 0 ? documentosDeProyecto(id) : []]);
  if (!p) notFound();
  const tParam = (await searchParams).t;
  const t = tParam && PESTANAS.some((pestana) => pestana.clave === tParam) ? tParam : "cobros";
  const base = `/proyectos/${p.id}`;
  const resumen = (
    <div className="ficha__resumen">
      <AccionesProyecto proyecto={{ id: p.id, nombre: p.nombre, estado: p.estado, mensualidad: p.mensualidad, horasCotizadas: p.horasCotizadas, fechaEntregaEstimada: p.fechaEntregaEstimada, diaCobroMensual: p.diaCobroMensual }} />
      <section className="ficha__cliente">
        <b>{p.cliente.nombre}</b> <span className="suave">{p.cliente.contactoNombre}</span>
        {p.cliente.rif && <div className="suave">RIF {p.cliente.rif}</div>}
        <div className="fila-botones">
          {canalesDisponibles({ ...p.cliente, telefono: "" }, `Buenas, ${p.cliente.contactoNombre || p.cliente.nombre}.`).map((a) => <a key={a.canal} className="boton mini" href={a.href} target="_blank" rel="noopener">{a.etiqueta}</a>)}
          <Link className="boton mini" href={`/clientes/${p.clienteId}`}>Ficha del cliente</Link>
        </div>
        {p.propuestaCodigo && <p className="suave">Propuesta aceptada: <a href={`/p/${p.propuestaCodigo}`} target="_blank" rel="noopener">ver</a></p>}
        <p className="suave">El acceso al portal se envía desde la <Link href={`/clientes/${p.clienteId}`}>ficha del cliente</Link>.</p>
      </section>
    </div>
  );
  const historial = (
    <ul className="historial" style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {p.historial.map((e) => <li key={e.id}>{TEXTO_EVENTO[e.tipo] ?? e.tipo}{e.texto ? `: ${e.texto}` : ""}<time>{e.creadoEn.toLocaleString("es-VE", { timeZone: "America/Caracas" })}{e.usuarioNombre ? ` · ${e.usuarioNombre}` : ""}</time></li>)}
    </ul>
  );
  return (
    <>
      <CabeceraPagina titulo={p.nombre} cifra={<><Semaforo valor={p.semaforo} /> <EstadoProyecto estado={p.estado} /> · <Link href={`/clientes/${p.clienteId}`}>{p.clienteNombre}</Link> · {p.nichoNombre} · {formatoUSD(p.pagoUnico)} + {formatoUSD(p.mensualidad)}/mes · día {p.diaCobroMensual}{p.versionActual ? ` · v${p.versionActual}` : ""}{p.avance !== null ? ` · ${p.avance} %` : ""}</>} />
      <div className="ficha ficha--proyecto">
        <div className="ficha__principal">
          {/* En el telefono el resumen (editar, estado, cliente) y el historial van plegados arriba de las pestanas */}
          <details className="acordeon historial-plegado">
            <summary><span>Resumen e historial</span><span className="suave">{p.historial.length}</span></summary>
            <div className="acordeon__cuerpo">{resumen}{historial}</div>
          </details>
          <Pestanas base={base} activa={t} items={PESTANAS} />
          {t === "cobros" && <TabCobros proyectoId={p.id} cobros={p.cobros} hoy={hoy} emisorListo={faltantesEmisor(emisor).length === 0} />}
          {t === "pendientes" && <TabPendientes proyectoId={p.id} pendientes={p.pendientes} />}
          {t === "horas" && <TabHoras proyectoId={p.id} horas={p.horas} cotizadas={p.horasCotizadas} reales={p.horasReales} tarifa={tarifa} hoy={hoy} />}
          {t === "versiones" && <TabVersiones proyectoId={p.id} versiones={p.versiones} hoy={hoy} />}
          {t === "documentos" && <TabDocumentos proyectoId={p.id} documentos={documentos} />}
          <p className="suave"><Link href="/proyectos">← Volver a Proyectos</Link></p>
        </div>
        <aside className="ficha__historial" aria-label="Resumen e historial">
          <h2>Resumen</h2>
          {resumen}
          <h2>Historial</h2>
          {historial}
        </aside>
      </div>
    </>
  );
}
