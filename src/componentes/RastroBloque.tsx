// src/componentes/RastroBloque.tsx — bloque «Lo que hicieron con lo enviado» de la ficha (lead y directorio).
// Servidor: lee los enlaces y las visitas del prospecto y arma la linea de tiempo; los botones son de RastroAcciones.
// La IP nunca sale de aqui: el visitante se muestra por numero, aparato y lugar (pais, ciudad o «desde una VPN»).
import Link from "next/link";
import { listarEnlaces, visitasDe } from "@/lib/rastro";
import { armarLineaTiempo, resumirEnlace, textoResumenEnlace, etiquetaScript, descomponerUrl, type Apertura, type Visitante } from "@/lib/rastro-contrato";
import { hoyCaracas, sumarDias, fechaVisible } from "@/lib/fecha-caracas";
import { BotonCopiar } from "@/componentes/BotonCopiar";
import { AgregarEnlace, AccionesEnlace, BotonActualizarRastro, BotonEsMio } from "@/componentes/RastroAcciones";

const HOST_PANEL = "prospectos.neracosu.com";
const DESFASE_CARACAS_MS = -4 * 3600_000; // UTC-4 fijo, como fecha-caracas.ts
const hora = (d: Date) => new Date(d.getTime() + DESFASE_CARACAS_MS).toISOString().slice(11, 16);

const APP: Record<string, string> = { whatsapp: "WhatsApp", telegram: "Telegram", facebook: "Facebook", instagram: "Instagram", imessage: "iMessage", linkedin: "LinkedIn" };
const TOQUE: Record<string, string> = { pdf: "el PDF", whatsapp: "WhatsApp", correo: "el correo", telefono: "el teléfono" };
const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function duracion(seg: number): string {
  const m = Math.floor(seg / 60);
  const s = seg % 60;
  if (!m) return `${s} s`;
  return s ? `${m} min ${s} s` : `${m} min`;
}

function tituloDia(dia: string, hoy: string): string {
  if (dia === hoy) return "Hoy";
  if (dia === sumarDias(hoy, -1)) return "Ayer";
  return fechaVisible(dia);
}

// Lo que hizo, en palabras del spec §7. La etiqueta del enlace va en cursiva.
function Accion({ f }: { f: Apertura }) {
  const et = <i>{f.etiqueta}</i>;
  const tocados = f.clics.length ? ` · tocó ${f.clics.map((c) => TOQUE[c] ?? c).join(", ")}` : "";
  if (f.clase === "apertura" || f.clase === "vuelta") {
    const extra = [
      f.segundos !== null ? duracion(f.segundos) : "",
      f.scroll !== null ? `bajó hasta el ${f.scroll} %` : "",
      f.origen ? `venía de ${f.origen}` : "",
    ].filter(Boolean).map((t) => ` · ${t}`).join("");
    return <span>{f.clase === "apertura" ? "Abrió" : "Volvió a"} {et}{extra}{tocados}</span>;
  }
  if (f.clase === "reenvio") {
    const app = !f.detalle || f.detalle === "otro" ? "" : APP[f.detalle] ?? mayuscula(f.detalle);
    return <span><b>Reenvió</b> {et}{app ? ` por ${app}` : ""}</span>;
  }
  if (f.clase === "pdf") return <span>Bajó el PDF de {et}</span>;
  return <span>Tocó {TOQUE[f.detalle] ? TOQUE[f.detalle] : <i>{f.detalle}</i>}</span>;
}

// Una fila: hora · Visitante N (aparato · lugar la primera vez que se lee en el dia) · accion.
// «Primera vez» es en el orden en que se lee (lo mas reciente arriba): asi el dato esta en la fila que se ve primero.
function Fila({ f, v, conDatos, esMio, prospectoId }: { f: Apertura; v: Visitante | undefined; conDatos: boolean; esMio: boolean; prospectoId: number }) {
  return (
    <li className={"rastro__fila" + (f.clase === "reenvio" ? " rastro__fila--reenvio" : "")}>
      <time dateTime={f.ocurrioEn.toISOString()}>{hora(f.ocurrioEn)}</time>
      <span>
        <span className="rastro__visitante">Visitante {v?.numero ?? "?"}</span>
        {v?.propio ? " · mío" : ""}
        {conDatos && v ? ` · ${v.aparato || "aparato desconocido"} · ${v.lugar}` : ""}
      </span>
      <Accion f={f} />
      {esMio && v && !v.propio && <BotonEsMio prospectoId={prospectoId} visitante={v.visitante} />}
    </li>
  );
}

export async function RastroBloque({ prospectoId, propuestaUrl, rol, conPropias, ruta }: {
  prospectoId: number; propuestaUrl: string | null; rol: string; conPropias: boolean; ruta: string;
}) {
  const [enlaces, visitas] = await Promise.all([listarEnlaces(prospectoId), visitasDe(prospectoId)]);
  const lt = armarLineaTiempo(visitas, { conPropias });
  const porVisitante = new Map(lt.visitantes.map((v) => [v.visitante, v]));
  const esDueno = rol === "dueno";
  const base = process.env.PROSPECTOS_URL_PUBLICA ?? "https://prospectos.neracosu.com";
  const hoy = hoyCaracas();

  // «Seguir este enlace»: la propuesta del lead es nuestra y todavia no tiene enlace registrado (el /p/ del panel se registra solo)
  const descompuesta = propuestaUrl ? descomponerUrl(propuestaUrl) : null;
  const partes = descompuesta && descompuesta.host !== HOST_PANEL ? descompuesta : null;
  const sugerida = partes && !enlaces.some((e) => e.host === partes.host && e.prefijo === partes.prefijo) ? propuestaUrl : null;

  const vistosEnTodo = new Set<string>();
  return (
    <section className="tarjeta rastro" id="rastro">
      <div className="rastro__cabecera">
        <b>Lo que hicieron con lo enviado</b>
        <div className="fila-botones">
          <BotonActualizarRastro prospectoId={prospectoId} />
          <Link className="boton mini" href={`${ruta}${conPropias ? "" : "?mias=1"}#rastro`} scroll={false}>
            {conPropias ? "Ocultar las mías" : "Mostrar las mías"}
          </Link>
        </div>
      </div>
      {enlaces.length === 0 && <p className="suave">Nada registrado todavía.</p>}
      {enlaces.map((e) => (
        <div key={e.id} className="rastro__enlace">
          <p><b>{e.etiqueta}</b>{e.activo ? "" : " (quitado)"}</p>
          <p className="suave rastro__url">{e.host + e.prefijo}</p>
          <p className="suave">enviado el {fechaVisible(hoyCaracas(e.enviadoEn))} · {textoResumenEnlace(resumirEnlace(visitas, e.id))}</p>
          {e.activo && (
            <div className="fila-botones">
              <BotonCopiar texto={etiquetaScript(e.token, base)} etiqueta="Copiar etiqueta para la página" />
              {esDueno && <AccionesEnlace enlaceId={e.id} etiqueta={e.etiqueta} />}
            </div>
          )}
        </div>
      ))}
      <AgregarEnlace prospectoId={prospectoId} sugerida={sugerida} />
      {lt.dias.map((d) => {
        const vistosEnDia = new Set<string>();
        return (
          <section key={d.dia} className="rastro__dia">
            <h3>{tituloDia(d.dia, hoy)}</h3>
            <ol className="rastro__filas">
              {d.filas.map((f, i) => {
                const conDatos = !vistosEnDia.has(f.visitante);
                vistosEnDia.add(f.visitante);
                const esMio = esDueno && !vistosEnTodo.has(f.visitante);
                vistosEnTodo.add(f.visitante);
                return <Fila key={`${f.ocurrioEn.getTime()}-${f.visitante}-${i}`} f={f} v={porVisitante.get(f.visitante)} conDatos={conDatos} esMio={esMio} prospectoId={prospectoId} />;
              })}
            </ol>
          </section>
        );
      })}
      {enlaces.length > 0 && <p className="suave rastro__pie">Ubicación aproximada por IP · DB-IP</p>}
    </section>
  );
}
