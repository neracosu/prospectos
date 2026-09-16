"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { VersionFila } from "@/lib/proyectos";
import { ETIQUETA_CAMBIO } from "@/lib/semver-contrato";
import { publicarVersion, marcarAvisada } from "@/acciones/versiones";

export function TabVersiones({ proyectoId, versiones, hoy }: { proyectoId: number; versiones: VersionFila[]; hoy: string }) {
  const [nueva, setNueva] = useState(false);
  const [error, setError] = useState("");
  // Igual que en TabCobros: si window.open() vuelve bloqueado, se deja el
  // enlace como texto para abrirlo con un toque.
  const [enlaceManual, setEnlaceManual] = useState<{ id: number; href: string } | null>(null);
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
  const correr = (fn: () => Promise<{ ok: boolean; mensaje?: string }>) => empezar(async () => { const r = await fn(); if (r.ok) { setError(""); setNueva(false); router.refresh(); } else setError(r.mensaje ?? "Error"); });
  const avisar = (id: number) => empezar(async () => {
    const r = await marcarAvisada(id);
    if (r.ok) {
      if (r.datos.href) {
        const ventana = window.open(r.datos.href, "_blank", "noopener");
        setEnlaceManual(ventana ? null : { id, href: r.datos.href });
      }
      setError("");
      router.refresh();
    } else setError(r.mensaje);
  });
  const actual = versiones[0];
  return (
    <section className="tarjeta">
      <b>{actual ? `Versión actual: ${actual.version}` : "Sin versiones todavía"}</b>
      <div className="fila-botones"><button className="boton" onClick={() => setNueva((v) => !v)}>{nueva ? "Cancelar" : "Publicar versión"}</button></div>
      {nueva && (
        <form className="pregunta" action={(fd) => correr(() => publicarVersion(fd))}>
          <input type="hidden" name="proyectoId" value={proyectoId} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label className="campo"><span>Versión</span><input name="version" placeholder={actual ? `mayor que ${actual.version}` : "1.0.0"} required /></label>
            <label className="campo"><span>Fecha</span><input name="fecha" type="date" defaultValue={hoy} required /></label>
          </div>
          <label className="campo"><span>Pega el bloque del CHANGELOG.md</span><textarea name="markdown" rows={6} placeholder={"### Nuevo\n- Reporte de ocupación\n### Arreglo\n- Cierre de caja"} required /></label>
          <button className="boton boton--primario" disabled={pendiente}>Publicar</button>
        </form>
      )}
      {versiones.map((v) => (
        <div key={v.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--borde)" }}>
          <b>v{v.version}</b> <span className="suave">{v.fecha}{v.avisadoEn ? " · avisada" : ""}</span>
          <ul style={{ margin: "6px 0", paddingLeft: 0, listStyle: "none" }}>{v.cambios.map((c) => <li key={c.id} className={`cambio--${c.tipo}`}><span className="suave">{ETIQUETA_CAMBIO[c.tipo]}:</span> {c.texto}</li>)}</ul>
          {!v.avisadoEn && <button className="boton mini" disabled={pendiente} onClick={() => avisar(v.id)}>Avisar al cliente</button>}
          {enlaceManual?.id === v.id && <p className="suave">El navegador bloqueó la ventana: <a href={enlaceManual.href} target="_blank" rel="noopener">Abrir WhatsApp</a></p>}
        </div>
      ))}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
