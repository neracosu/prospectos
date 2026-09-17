"use client";
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { aplicarAjuste, firmaCifras, invertir, porcentajeDelDia, sumarAjustes, type AjusteHoy, type CifrasHoy } from "@/lib/hoy-contrato";

// Las cifras de Hoy con el ajuste optimista de las tarjetas (pasada de UX, fase B): al tocar «Si» el numero del
// dia sube ya, sin esperar al servidor. Cuando el servidor trae cifras nuevas, el ajuste ya esta contado ahi.
const CtxAjuste = createContext<AjusteHoy>({});
// ajustar() devuelve como revertirlo si la accion falla.
type Ajustar = (a: AjusteHoy) => () => void;
const CtxAjustar = createContext<Ajustar>(() => () => {});

// Fuera de Hoy (la ficha del prospecto) ajustar no hace nada.
export function useAjusteHoy(): Ajustar {
  return useContext(CtxAjustar);
}

export function ProveedorHoy({ cifras, children }: { cifras: CifrasHoy; children: ReactNode }) {
  const firma = firmaCifras(cifras);
  const [estado, setEstado] = useState<{ firma: string; ajuste: AjusteHoy }>({ firma, ajuste: {} });
  // Se pone en cero DURANTE el render y no en un efecto: con un efecto habria un cuadro con la cifra nueva del
  // servidor y el ajuste viejo sumados (el envio contado dos veces).
  if (estado.firma !== firma) setEstado({ firma, ajuste: {} });
  const firmaActual = useRef(firma);
  firmaActual.current = firma;
  const ajustar = useCallback<Ajustar>((a) => {
    const firmaAlAjustar = firmaActual.current;
    setEstado((e) => ({ ...e, ajuste: sumarAjustes(e.ajuste, a) }));
    // Revertir solo vale sobre las mismas cifras: si el servidor ya trajo otras, el ajuste se puso en cero con
    // ellas y restarlo dejaria el numero uno por debajo.
    return () => setEstado((e) => (e.firma === firmaAlAjustar ? { ...e, ajuste: sumarAjustes(e.ajuste, invertir(a)) } : e));
  }, []);
  return (
    <CtxAjustar.Provider value={ajustar}>
      <CtxAjuste.Provider value={estado.firma === firma ? estado.ajuste : {}}>{children}</CtxAjuste.Provider>
    </CtxAjustar.Provider>
  );
}

export function ResumenHoy({ cifras, otros, children }: { cifras: CifrasHoy; otros: { id: number; nombre: string; enviados: number; meta: number }[]; children?: ReactNode }) {
  const c = aplicarAjuste(cifras, useContext(CtxAjuste));
  return (
    <section className="tarjeta">
      <p className="dia"><b className="dia__numero">{c.enviados}</b> de {c.meta} enviados hoy</p>
      <div className="progreso" role="progressbar" aria-label="Enviados de hoy" aria-valuenow={c.enviados} aria-valuemin={0} aria-valuemax={c.meta}><i style={{ width: `${porcentajeDelDia(c)}%` }} /></div>
      {otros.map((o) => <div key={o.id} className="suave">{o.nombre}: {o.enviados} de {o.meta}</div>)}
      <div className="embudo">
        <div><b>{c.por_contactar}</b>por contactar</div>
        <div><b>{c.enviado}</b>enviados</div>
        <div><b>{c.respondio}</b>respondieron</div>
        <div><b>{c.reunion}</b>reuniones</div>
      </div>
      {children}
    </section>
  );
}
