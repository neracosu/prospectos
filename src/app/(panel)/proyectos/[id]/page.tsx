import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirRol } from "@/lib/sesion";
import { hoyCaracas } from "@/lib/fecha-caracas";
import { fichaProyecto } from "@/lib/proyectos";
import { leerTarifaHora } from "@/lib/configuracion";
import { formatoUSD } from "@/lib/dinero";
import { Semaforo } from "@/componentes/Semaforo";
import { EstadoProyecto } from "@/componentes/EstadoProyecto";
import { Pestanas } from "@/componentes/Pestanas";
import { AccionesProyecto } from "@/componentes/AccionesProyecto";
import { TabCobros } from "@/componentes/TabCobros";
import { TabPendientes } from "@/componentes/TabPendientes";
import { TabHoras } from "@/componentes/TabHoras";
import { TabVersiones } from "@/componentes/TabVersiones";
import { canalesDisponibles } from "@/lib/canales-contrato";

export const dynamic = "force-dynamic";
const PESTANAS = [{ clave: "cobros", texto: "Cobros" }, { clave: "pendientes", texto: "Pendientes" }, { clave: "horas", texto: "Horas" }, { clave: "versiones", texto: "Versiones" }, { clave: "cliente", texto: "Cliente" }];
const TEXTO_EVENTO: Record<string, string> = { proyecto_creado: "Proyecto creado", proyecto_estado: "Estado", proyecto_editado: "Proyecto editado", cobro_pagado: "Cobro pagado", cobro_anulado: "Cobro anulado", cobro_agregado: "Cobro agregado", recordatorio: "Recordatorio enviado", hito_cumplido: "Hito cumplido", version_publicada: "Versión publicada", aviso_cliente: "Aviso al cliente", horas: "Horas" };

export default async function Proyecto({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await exigirRol("dueno");
  const id = Number((await params).id);
  const hoy = hoyCaracas();
  const [p, tarifa] = await Promise.all([Number.isInteger(id) ? fichaProyecto(id, hoy) : null, leerTarifaHora()]);
  if (!p) notFound();
  const tParam = (await searchParams).t;
  const t = tParam && PESTANAS.some((pestana) => pestana.clave === tParam) ? tParam : "cobros";
  const base = `/proyectos/${p.id}`;
  return (
    <>
      <h1 className="titulo"><Semaforo valor={p.semaforo} />{p.nombre} <EstadoProyecto estado={p.estado} /></h1>
      <p className="suave"><Link href={`/clientes/${p.clienteId}`}>{p.clienteNombre}</Link> · {p.nichoNombre} · {formatoUSD(p.pagoUnico)} + {formatoUSD(p.mensualidad)}/mes · día {p.diaCobroMensual}{p.versionActual ? ` · v${p.versionActual}` : ""}{p.avance !== null ? ` · ${p.avance} %` : ""}</p>
      <AccionesProyecto proyecto={{ id: p.id, nombre: p.nombre, estado: p.estado, mensualidad: p.mensualidad, horasCotizadas: p.horasCotizadas, fechaEntregaEstimada: p.fechaEntregaEstimada, diaCobroMensual: p.diaCobroMensual }} />
      <Pestanas base={base} activa={t} items={PESTANAS} />
      {t === "cobros" && <TabCobros proyectoId={p.id} cobros={p.cobros} hoy={hoy} />}
      {t === "pendientes" && <TabPendientes proyectoId={p.id} pendientes={p.pendientes} avance={p.avance} />}
      {t === "horas" && <TabHoras proyectoId={p.id} horas={p.horas} cotizadas={p.horasCotizadas} reales={p.horasReales} tarifa={tarifa} hoy={hoy} />}
      {t === "versiones" && <TabVersiones proyectoId={p.id} versiones={p.versiones} hoy={hoy} />}
      {t === "cliente" && (
        <section className="tarjeta">
          <b>{p.cliente.nombre}</b> <span className="suave">{p.cliente.contactoNombre}</span>
          {p.cliente.rif && <div className="suave">RIF {p.cliente.rif}</div>}
          <div className="fila-botones">
            {canalesDisponibles({ ...p.cliente, telefono: "" }, `Buenas, ${p.cliente.contactoNombre || p.cliente.nombre}.`).map((a) => <a key={a.canal} className="boton" href={a.href} target="_blank" rel="noopener">{a.etiqueta}</a>)}
            <Link className="boton" href={`/clientes/${p.clienteId}`}>Editar cliente</Link>
          </div>
          {p.propuestaCodigo && <p className="suave">Propuesta aceptada: <a href={`/p/${p.propuestaCodigo}`} target="_blank" rel="noopener">ver</a></p>}
          <p className="suave">El acceso al portal del cliente llega en la pieza 5.</p>
        </section>
      )}
      <section className="tarjeta">
        <b>Historial</b>
        <ul className="historial" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {p.historial.map((e) => <li key={e.id}>{TEXTO_EVENTO[e.tipo] ?? e.tipo}{e.texto ? `: ${e.texto}` : ""}<time>{e.creadoEn.toLocaleString("es-VE", { timeZone: "America/Caracas" })}{e.usuarioNombre ? ` · ${e.usuarioNombre}` : ""}</time></li>)}
        </ul>
      </section>
    </>
  );
}
