"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { VersionFila } from "@/lib/proyectos";
import { ETIQUETA_CAMBIO } from "@/lib/semver-contrato";
import { publicarVersion, editarVersion, marcarAvisada } from "@/acciones/versiones";

// Arma el bloque de CHANGELOG.md a partir de los cambios guardados, para
// prellenar el formulario cuando se edita una version ya publicada.
function markdownDeCambios(cambios: VersionFila["cambios"]): string {
  const bloques: string[] = [];
  for (const tipo of ["nuevo", "mejora", "arreglo"] as const) {
    const items = cambios.filter((c) => c.tipo === tipo);
    if (items.length) bloques.push(`### ${ETIQUETA_CAMBIO[tipo]}\n${items.map((c) => `- ${c.texto}`).join("\n")}`);
  }
  return bloques.join("\n");
}

export function TabVersiones({ proyectoId, versiones, hoy }: { proyectoId: number; versiones: VersionFila[]; hoy: string }) {
  // "nueva" abre el formulario de publicar; un numero abre el de editar esa version.
  const [abierta, setAbierta] = useState<"nueva" | number | null>(null);
  const [error, setError] = useState("");
  // Igual que en TabCobros: si window.open() vuelve bloqueado, se deja el
  // enlace como texto para abrirlo con un toque.
  const [enlaceManual, setEnlaceManual] = useState<{ id: number; href: string } | null>(null);
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
  const correr = (fn: () => Promise<{ ok: boolean; mensaje?: string }>) => empezar(async () => { const r = await fn(); if (r.ok) { setError(""); setAbierta(null); router.refresh(); } else setError(r.mensaje ?? "Error"); });
  const avisar = (id: number) => empezar(async () => {
    const r = await marcarAvisada(id);
    if (r.ok) {
      const ventana = window.open(r.datos.href, "_blank", "noopener");
      setEnlaceManual(ventana ? null : { id, href: r.datos.href });
      setError("");
      router.refresh();
    } else setError(r.mensaje);
  });
  const actual = versiones[0];
  const editando = typeof abierta === "number" ? versiones.find((v) => v.id === abierta) : undefined;
  return (
    <section className="tarjeta">
      <b>{actual ? `Versión actual: ${actual.version}` : "Sin versiones todavía"}</b>
      <div className="fila-botones"><button className="boton" onClick={() => setAbierta((a) => (a === "nueva" ? null : "nueva"))}>{abierta === "nueva" ? "Cancelar" : "Publicar versión"}</button></div>
      {(abierta === "nueva" || editando) && (
        <form key={abierta ?? "nueva"} className="pregunta" action={(fd) => correr(() => (editando ? editarVersion(fd) : publicarVersion(fd)))}>
          <input type="hidden" name="proyectoId" value={proyectoId} />
          {editando && <input type="hidden" name="id" value={editando.id} />}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label className="campo"><span>Versión</span><input name="version" defaultValue={editando?.version} placeholder={actual ? `mayor que ${actual.version}` : "1.0.0"} required /></label>
            <label className="campo"><span>Fecha</span><input name="fecha" type="date" defaultValue={editando?.fecha ?? hoy} required /></label>
          </div>
          <label className="campo"><span>Pega el bloque del CHANGELOG.md</span><textarea name="markdown" rows={6} defaultValue={editando ? markdownDeCambios(editando.cambios) : ""} placeholder={"### Nuevo\n- Reporte de ocupación\n### Arreglo\n- Cierre de caja"} required /></label>
          <button className="boton boton--primario" disabled={pendiente}>{editando ? "Guardar cambios" : "Publicar"}</button>
        </form>
      )}
      {versiones.map((v) => (
        <div key={v.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--borde)" }}>
          <b>v{v.version}</b> <span className="suave">{v.fecha}{v.avisadoEn ? " · avisada" : ""}</span>
          <ul style={{ margin: "6px 0", paddingLeft: 0, listStyle: "none" }}>{v.cambios.map((c) => <li key={c.id} className={`cambio--${c.tipo}`}><span className="suave">{ETIQUETA_CAMBIO[c.tipo]}:</span> {c.texto}</li>)}</ul>
          {!v.avisadoEn && (
            <div className="fila-botones">
              <button className="boton mini" disabled={pendiente} onClick={() => setAbierta((a) => (a === v.id ? null : v.id))}>{abierta === v.id ? "Cancelar edición" : "Editar"}</button>
              <button className="boton mini" disabled={pendiente} onClick={() => avisar(v.id)}>Avisar al cliente</button>
            </div>
          )}
          {enlaceManual?.id === v.id && <p className="suave">El navegador bloqueó la ventana: <a href={enlaceManual.href} target="_blank" rel="noopener">Abrir WhatsApp</a></p>}
        </div>
      ))}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
