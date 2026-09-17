"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DocumentoFila } from "@/lib/documentos";
import { ACEPTA, problemaDeArchivo, descripcionDocumento, tamanoLegible, nombreVisible } from "@/lib/documentos-contrato";
import { quitarDocumentoDeProyecto } from "@/acciones/documentos";

type Respuesta = { ok: true; datos: { id: number } } | { ok: false; mensaje: string } | null;

// Documentos que ve el cliente en su portal (pieza 5b). La subida va por XMLHttpRequest y no por una Server
// Action: es la unica forma de tener el porcentaje real, y el servidor la recibe en un route handler.
export function TabDocumentos({ proyectoId, documentos }: { proyectoId: number; documentos: DocumentoFila[] }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [nombre, setNombre] = useState("");
  const [progreso, setProgreso] = useState<number | null>(null);
  const [estado, setEstado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [vuelta, setVuelta] = useState(0); // cambia la key del <input type=file>: es la forma de vaciarlo
  const [porQuitar, setPorQuitar] = useState<number | null>(null);
  const [errorQuitar, setErrorQuitar] = useState("");
  const [quitando, empezar] = useTransition();
  const router = useRouter();
  const problema = archivo ? problemaDeArchivo({ nombre: archivo.name, tamano: archivo.size }) : null;
  const subiendo = progreso !== null;

  const elegir = (f: File | null) => { setArchivo(f); setEstado(null); setNombre(f ? nombreVisible("", f.name) : ""); };

  const subir = () => {
    if (!archivo || problema || subiendo) return; // aria-disabled no bloquea el clic: el guardia es este
    const fd = new FormData();
    fd.set("archivo", archivo);
    fd.set("nombre", nombre);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/proyectos/${proyectoId}/documentos`);
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgreso(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      const r = xhr.response as Respuesta;
      setProgreso(null);
      if (r?.ok) { setArchivo(null); setNombre(""); setVuelta((v) => v + 1); setEstado({ ok: true, texto: "Documento subido." }); router.refresh(); }
      else setEstado({ ok: false, texto: r?.mensaje ?? "No se pudo subir. Intenta de nuevo." });
    };
    xhr.onerror = () => { setProgreso(null); setEstado({ ok: false, texto: "Se cortó la conexión mientras subía. El archivo sigue elegido: intenta de nuevo." }); };
    setEstado(null);
    setProgreso(0);
    xhr.send(fd);
  };

  const quitar = (id: number) => empezar(async () => {
    const r = await quitarDocumentoDeProyecto(id);
    if (r.ok) { setPorQuitar(null); setErrorQuitar(""); router.refresh(); } else setErrorQuitar(r.mensaje);
  });

  return (
    <>
      <section className="tarjeta">
        <b>Documentos que ve el cliente</b>
        {documentos.length === 0 && <p className="suave" style={{ margin: "6px 0 0" }}>Todavía no le has subido ninguno.</p>}
        {documentos.map((d) => (
          <div key={d.id} className="documento-fila">
            <span><b>{d.nombre}</b><br /><span className="suave">{descripcionDocumento(d)}, subido el {d.subidoEn.toLocaleDateString("es-VE", { timeZone: "America/Caracas" })}</span></span>
            <span className="fila-botones" style={{ margin: 0 }}>
              <a className="boton mini" href={`/c/documentos/${d.id}`} target="_blank" rel="noopener">Ver</a>
              <button className="boton mini boton--peligro" onClick={() => { setErrorQuitar(""); setPorQuitar((a) => (a === d.id ? null : d.id)); }}>Quitar</button>
            </span>
            {porQuitar === d.id && (
              <div className="pregunta" style={{ gridColumn: "1 / -1" }}>
                <p style={{ margin: "0 0 8px" }}>El cliente deja de verlo en su portal. El archivo no se borra del servidor.</p>
                <div className="fila-botones">
                  <button className="boton boton--peligro" disabled={quitando} onClick={() => quitar(d.id)}>{quitando ? "Quitando…" : "Quitar documento"}</button>
                  <button className="boton" onClick={() => setPorQuitar(null)}>Conservar</button>
                </div>
                {errorQuitar && <p className="error" role="alert">{errorQuitar}</p>}
              </div>
            )}
          </div>
        ))}
      </section>
      <section className="tarjeta">
        <b>Subir un documento</b>
        <p className="suave" style={{ margin: "4px 0 10px" }}>PDF, JPG, PNG o ZIP, hasta 10 MB. El cliente lo ve apenas sube.</p>
        <label className={`subida${archivo ? (problema ? " subida--error" : " subida--elegido") : ""}`}>
          <input key={vuelta} type="file" accept={ACEPTA} disabled={subiendo} aria-label="Elegir archivo" onChange={(e) => elegir(e.target.files?.[0] ?? null)} />
          {archivo ? <b>{archivo.name}</b> : <b>Elegir archivo</b>}
          {!archivo && <span className="suave">Toca aquí para buscarlo en el teléfono</span>}
          {archivo && !problema && <span className="suave">{tamanoLegible(archivo.size)}. Toca para elegir otro</span>}
          {archivo && problema && <span className="error" role="alert">{problema}</span>}
        </label>
        {archivo && !problema && <label className="campo"><span>Nombre que verá el cliente</span><input value={nombre} maxLength={120} disabled={subiendo} onChange={(e) => setNombre(e.target.value)} /></label>}
        {subiendo && <div className="progreso" role="progressbar" aria-valuenow={progreso ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label="Subida del documento"><i style={{ width: `${progreso ?? 0}%` }} /></div>}
        <p className={`estado-fila${estado && !estado.ok ? " estado-fila--error" : ""}`} role="status">{subiendo ? `Subiendo… ${progreso} %` : estado?.texto ?? ""}</p>
        <div className="fila-botones">
          <button className="boton boton--primario" disabled={!archivo || Boolean(problema)} aria-disabled={subiendo} onClick={subir}>{subiendo ? "Subiendo…" : "Subir documento"}</button>
        </div>
      </section>
    </>
  );
}
