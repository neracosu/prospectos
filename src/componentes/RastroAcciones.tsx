"use client";
import { useState, useTransition } from "react";
import { actualizarRastro, agregarEnlace, quitarEnlace, importarArchivadosAccion, marcarVisitanteMio } from "@/acciones/rastro";
import { BotonCopiar } from "@/componentes/BotonCopiar";
import { Campo } from "@/componentes/Campo";
import { useFlotante } from "@/componentes/LineaFlotante";
import type { Resultado } from "@/acciones/resultado";

// Piezas de cliente del bloque «Lo que hicieron con lo enviado» (RastroBloque, servidor).
// Las acciones llaman a revalidatePath de /leads/<id> y /prospectos/<id>: la respuesta ya trae el arbol nuevo,
// asi que no hay router.refresh() (regla del panel: seria un segundo viaje).

function useAccion() {
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  const avisar = useFlotante();
  const correr = <T,>(fn: () => Promise<Resultado<T>>, texto: (datos: T) => string) =>
    empezar(async () => {
      setError("");
      const r = await fn();
      if (r.ok) avisar({ texto: texto(r.datos) });
      else setError(r.mensaje);
    });
  return { error, pendiente, correr };
}

const visitasTexto = (n: number) => (n === 0 ? "nada nuevo" : n === 1 ? "1 visita nueva" : `${n} visitas nuevas`);

export function BotonActualizarRastro({ prospectoId }: { prospectoId: number }) {
  const { error, pendiente, correr } = useAccion();
  return (
    <>
      <button type="button" className="boton mini" disabled={pendiente}
        onClick={() => correr(() => actualizarRastro(prospectoId), (d) => `Rastro al día: ${visitasTexto(d.visitas)}`)}>
        {pendiente ? "Leyendo…" : "Actualizar"}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}

// «Agregar enlace»: detras de un boton; «Seguir este enlace» lo abre con la propuesta del lead ya escrita.
export function AgregarEnlace({ prospectoId, sugerida }: { prospectoId: number; sugerida: string | null }) {
  const [abierto, setAbierto] = useState(false);
  const [previo, setPrevio] = useState<{ url: string; etiqueta: string } | null>(null);
  const [script, setScript] = useState("");
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  const avisar = useFlotante();

  const abrir = (p: { url: string; etiqueta: string } | null) => { setPrevio(p); setScript(""); setError(""); setAbierto(true); };
  // onSubmit + FormData (no <form action>): React vaciaria el formulario antes de la respuesta y un error borraria lo escrito
  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    empezar(async () => {
      setError("");
      const r = await agregarEnlace(prospectoId, fd);
      if (!r.ok) return setError(r.mensaje);
      setScript(r.datos.script);
      setAbierto(false);
      avisar({ texto: `Enlace «${r.datos.etiqueta}» registrado` });
    });
  };

  return (
    <div className="rastro__agregar">
      {!abierto && (
        <div className="fila-botones">
          <button type="button" className="boton" onClick={() => abrir(null)}>Agregar enlace</button>
          {sugerida && <button type="button" className="boton" onClick={() => abrir({ url: sugerida, etiqueta: "Propuesta" })}>Seguir este enlace</button>}
        </div>
      )}
      {abierto && (
        <form onSubmit={enviar} key={previo?.url ?? "nuevo"}>
          <Campo etiqueta="Enlace enviado" nombre="url" type="url" requerido maxLength={300} autoComplete="off"
            placeholder="https://neracosu.com/…" defaultValue={previo?.url ?? ""} />
          <Campo etiqueta="Cómo lo llamo" nombre="etiqueta" requerido regla={{ tipo: "texto", min: 2, max: 40 }} maxLength={40}
            autoComplete="off" placeholder="Propuesta / Demo · factura" defaultValue={previo?.etiqueta ?? ""} />
          <Campo etiqueta="Enviado el (opcional)" nombre="enviadoEn" type="date" regla={{ tipo: "fecha" }} />
          {error && <p className="error" role="alert">{error}</p>}
          <div className="fila-botones">
            <button className="boton boton--primario" type="submit" disabled={pendiente}>{pendiente ? "Guardando…" : "Guardar enlace"}</button>
            <button className="boton" type="button" disabled={pendiente} onClick={() => setAbierto(false)}>Cancelar</button>
          </div>
        </form>
      )}
      {script && (
        <div className="rastro__script">
          <label className="campo"><span>Etiqueta para la página</span>
            <textarea readOnly rows={3} value={script} onFocus={(e) => e.currentTarget.select()} />
          </label>
          <p className="suave">Péguela antes de &lt;/body&gt; en la página enviada.</p>
          <div className="fila-botones"><BotonCopiar texto={script} etiqueta="Copiar etiqueta" /></div>
        </div>
      )}
    </div>
  );
}

// Solo dueno: «Cargar lo archivado» y «Quitar» de un enlace activo.
export function AccionesEnlace({ enlaceId, etiqueta }: { enlaceId: number; etiqueta: string }) {
  const { error, pendiente, correr } = useAccion();
  return (
    <>
      <button type="button" className="boton mini" disabled={pendiente}
        onClick={() => correr(() => importarArchivadosAccion(enlaceId), (d) => `Archivado leído: ${visitasTexto(d.visitas)}`)}>
        Cargar lo archivado
      </button>
      <button type="button" className="boton mini" disabled={pendiente}
        onClick={() => { if (confirm(`¿Quitar «${etiqueta}»? Deja de registrar visitas nuevas; lo ya registrado se conserva.`)) correr(() => quitarEnlace(enlaceId), () => "Enlace quitado"); }}>
        Quitar
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}

// Solo dueno: marca a un visitante como propio (sus visitas dejan de contar como del prospecto).
export function BotonEsMio({ prospectoId, visitante }: { prospectoId: number; visitante: string }) {
  const { error, pendiente, correr } = useAccion();
  return (
    <>
      <button type="button" className="boton mini" disabled={pendiente}
        onClick={() => correr(() => marcarVisitanteMio(prospectoId, visitante), () => "Marcado como suyo: ya no cuenta")}>
        Es mío
      </button>
      {error && <span className="error" role="alert">{error}</span>}
    </>
  );
}
