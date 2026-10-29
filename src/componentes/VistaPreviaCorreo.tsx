"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import type { FilaCola } from "@/lib/correos";
import { GANCHO_MAX } from "@/lib/ficha-contrato";
import { fechaCorta, hitosDe, yaEnviado } from "@/lib/correos-contrato";
import { guardarGancho, vistaPrevia, enviarPropuestaCorreo, bloquearCorreo, ponerAlAutomatico } from "@/acciones/correos";
import { Campo } from "@/componentes/Campo";
import { useFlotante } from "@/componentes/LineaFlotante";

type Previa = { asunto: string; html: string; pdfUrl: string };

// Vista previa del correo de una fila de /correos: hoja lateral desde 1024 px y pantalla completa en el telefono. Muestra
// el asunto, el correo tal cual (iframe sin permisos), el enlace al PDF y el gancho editable; desde aqui se envia,
// se reenvia (con confirmacion), se bloquea el correo y se pone o quita del automatico. Escape y «Cerrar» la cierran;
// el foco entra al abrir y vuelve al boton «Ver» al cerrar (lo devuelve quien la monta).
export function VistaPreviaCorreo({ fila, onCerrar }: { fila: FilaCola; onCerrar: () => void }) {
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [error, setError] = useState("");
  const [estado, setEstado] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [pendiente, empezar] = useTransition();
  const avisar = useFlotante();
  const cerrarRef = useRef<HTMLButtonElement>(null);
  const id = fila.prospectoId;

  const cargar = async () => {
    const r = await vistaPrevia(id);
    if (r.ok) { setPrevia(r.datos); setError(""); } else setError(r.mensaje);
  };
  useEffect(() => {
    let vivo = true;
    vistaPrevia(id).then((r) => { if (!vivo) return; if (r.ok) setPrevia(r.datos); else setError(r.mensaje); }).catch(() => { if (vivo) setError("No se pudo armar la vista previa. Intente de nuevo."); });
    return () => { vivo = false; };
  }, [id]);
  useEffect(() => {
    const raf = requestAnimationFrame(() => cerrarRef.current?.focus());
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onCerrar(); } };
    document.addEventListener("keydown", tecla);
    return () => { cancelAnimationFrame(raf); document.removeEventListener("keydown", tecla); };
  }, [onCerrar]);

  const correr = (fn: () => Promise<{ ok: boolean; mensaje?: string }>, siBien: () => void) => {
    setError(""); setEstado("");
    empezar(async () => {
      let r: { ok: boolean; mensaje?: string };
      try { r = await fn(); } catch { r = { ok: false, mensaje: "No se pudo completar. Intente de nuevo." }; }
      if (!r.ok) return setError(r.mensaje ?? "No se pudo completar.");
      siBien();
    });
  };

  const guardar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(""); setEstado("");
    empezar(async () => {
      const r = await guardarGancho(id, fd);
      if (!r.ok) return setError(r.mensaje);
      await cargar();
      setEstado("Gancho guardado. La vista previa ya lo muestra.");
    });
  };

  const enviado = yaEnviado(fila.envio);
  // Con la propuesta ya enviada: si toca, «Enviar seguimiento»; si no, «Reenviar» con confirmacion.
  const enviar = (reenviar: boolean) => correr(() => enviarPropuestaCorreo(id, reenviar), () => {
    setConfirmar(false);
    avisar({ texto: `Correo enviado a ${fila.nombre}` });
    onCerrar();
  });
  const hitos = hitosDe(fila.envio);

  return (
    <>
      <div className="velo" onClick={onCerrar} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-labelledby="previa-titulo" className="hoja-lateral">
        <div className="hoja-lateral__cabecera">
          <h2 id="previa-titulo">{fila.nombre}</h2>
          <button ref={cerrarRef} type="button" className="boton" onClick={onCerrar}>Cerrar</button>
        </div>
        <p className="suave">{fila.email} · {fila.ciudad}{hitos.length ? ` · ${hitos.join(" · ")}` : ""}</p>
        {fila.nombreNoCoincide && <p className="aviso">El nombre no coincide con su página web: revise la ficha antes de enviar.</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <p className="estado-fila" role="status">{estado}</p>

        <dl className="datos">
          <dt>Asunto</dt><dd className="previa__asunto">{previa?.asunto ?? "Armando la vista previa…"}</dd>
        </dl>
        {previa && <iframe className="previa__marco" sandbox="" srcDoc={previa.html} title="Vista previa del correo" />}
        {previa && <p><a href={previa.pdfUrl} target="_blank" rel="noopener">Ver el PDF que va adjunto</a></p>}

        <form onSubmit={guardar} key={fila.gancho}>
          <input type="hidden" name="resumen" value={fila.resumen} />
          <Campo etiqueta="Gancho (una línea, lo que se encontró del negocio)" nombre="gancho" control="textarea" rows={3} maxLength={GANCHO_MAX}
            regla={{ tipo: "linea", max: GANCHO_MAX }} defaultValue={fila.gancho} />
          <button className="boton" type="submit" disabled={pendiente}>Guardar gancho</button>
        </form>

        {!fila.bloqueado && (
          <div className="fila-botones">
            {!enviado && <button type="button" className="boton boton--primario" disabled={pendiente || !previa} onClick={() => enviar(false)}>{pendiente ? "Enviando…" : "Enviar"}</button>}
            {enviado && fila.tocaSeguimiento && <button type="button" className="boton boton--primario" disabled={pendiente || !previa} onClick={() => enviar(false)}>Enviar seguimiento</button>}
            {enviado && !fila.tocaSeguimiento && !confirmar && <button type="button" className="boton" disabled={pendiente || !previa} onClick={() => setConfirmar(true)}>Reenviar</button>}
          </div>
        )}
        {confirmar && fila.envio && (
          <div className="pregunta" role="group" aria-label="Confirmar reenvío">
            <p>Ya se le envió el {fechaCorta(fila.envio.enviadoEn)}. ¿Enviar otra vez?</p>
            <div className="fila-botones">
              <button type="button" className="boton boton--primario" disabled={pendiente} onClick={() => enviar(true)}>Sí, enviar otra vez</button>
              <button type="button" className="boton" disabled={pendiente} onClick={() => setConfirmar(false)}>No</button>
            </div>
          </div>
        )}
        <div className="fila-botones fila-botones--secundarias">
          <button type="button" className="boton" aria-pressed={fila.alAutomatico} disabled={pendiente} onClick={() => correr(() => ponerAlAutomatico(id, !fila.alAutomatico), () => setEstado(fila.alAutomatico ? "Fuera del envío automático." : "Va al envío automático."))}>
            Al automático: {fila.alAutomatico ? "sí" : "no"}
          </button>
          {!fila.bloqueado && <>
            <button type="button" className="boton boton--peligro" disabled={pendiente} onClick={() => correr(() => bloquearCorreo(id, "no_quiere"), () => { avisar({ texto: `Correo bloqueado: ${fila.nombre}` }); onCerrar(); })}>No quiere correo</button>
            <button type="button" className="boton boton--peligro" disabled={pendiente} onClick={() => correr(() => bloquearCorreo(id, "rebote"), () => { avisar({ texto: `Correo bloqueado: ${fila.nombre}` }); onCerrar(); })}>Rebotó</button>
          </>}
          {fila.bloqueado && <p className="suave">Correo bloqueado ({fila.bloqueado === "rebote" ? "rebotó" : "no quiere correo"}).</p>}
        </div>
      </div>
    </>
  );
}
