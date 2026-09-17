"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";

// La linea de resultado del panel (pasada de UX, fase B): «Enviado a Hotel Yare», «Pagado $100,00». Una sola a
// la vez, sobre la barra inferior, se va sola y se anuncia con aria-live. Lo reversible trae «Deshacer»; lo
// irreversible (anular, descartar) no pasa por aca: sigue con su confirmacion en la tarjeta.
export type AvisoFlotante = {
  texto: string;
  tono?: "ok" | "error";
  // La accion que lo revierte en el servidor. Si falla, la linea muestra su mensaje en rojo.
  deshacer?: () => Promise<{ ok: boolean; mensaje?: string }>;
  textoDeshecho?: string;
};

const DURACION_MS = 4000;
// Con una mano, llegar hasta «Deshacer» toma mas que leer una linea.
const DURACION_CON_DESHACER_MS = 6000;

const Contexto = createContext<(a: AvisoFlotante) => void>(() => {});

// Fuera del proveedor (una pantalla sin panel) avisar no hace nada: el componente que lo usa no se entera.
export function useFlotante(): (a: AvisoFlotante) => void {
  return useContext(Contexto);
}

export function ProveedorFlotante({ children }: { children: ReactNode }) {
  const [actual, setActual] = useState<(AvisoFlotante & { id: number }) | null>(null);
  const [deshaciendo, empezar] = useTransition();
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cuenta = useRef(0);

  const parar = () => { if (reloj.current) { clearTimeout(reloj.current); reloj.current = null; } };
  const arrancar = (id: number, conDeshacer: boolean) => {
    parar();
    reloj.current = setTimeout(() => setActual((v) => (v?.id === id ? null : v)), conDeshacer ? DURACION_CON_DESHACER_MS : DURACION_MS);
  };
  const avisar = useCallback((a: AvisoFlotante) => {
    const id = ++cuenta.current;
    setActual({ ...a, id });
    arrancar(id, !!a.deshacer);
  }, []);
  useEffect(() => parar, []);

  const deshacer = () => {
    const a = actual;
    if (!a?.deshacer) return;
    parar(); // mientras corre no se va: el resultado del deshacer sale en esta misma linea
    empezar(async () => {
      let r: { ok: boolean; mensaje?: string };
      try { r = await a.deshacer!(); } catch { r = { ok: false }; }
      // Si mientras tanto llego otro aviso (con su propio «Deshacer»), un «Deshecho» no lo pisa. Un error si: hay que verlo.
      if (r.ok && cuenta.current !== a.id) return;
      avisar(r.ok ? { texto: a.textoDeshecho ?? "Deshecho" } : { texto: r.mensaje ?? "No se pudo deshacer. Intenta de nuevo.", tono: "error" });
    });
  };

  return (
    <Contexto.Provider value={avisar}>
      {children}
      {/* La zona existe siempre: una region viva que nace junto con su contenido no se anuncia. */}
      <div className="flotante-zona" role="status" aria-live="polite">
        {actual && (
          // Con el foco o el dedo encima no se va (WCAG 2.2.1): quien llega a «Deshacer» con teclado o lector tiene su tiempo.
          <div key={actual.id} className={"flotante" + (actual.tono === "error" ? " flotante--error" : "")}
            onFocus={parar} onPointerEnter={parar}
            onBlur={() => { if (!deshaciendo) arrancar(actual.id, !!actual.deshacer); }} onPointerLeave={() => { if (!deshaciendo) arrancar(actual.id, !!actual.deshacer); }}>
            <span className="flotante__texto">{actual.texto}</span>
            {actual.deshacer && <button type="button" className="flotante__deshacer" disabled={deshaciendo} onClick={deshacer}>{deshaciendo ? "Deshaciendo…" : "Deshacer"}</button>}
          </div>
        )}
      </div>
    </Contexto.Provider>
  );
}
