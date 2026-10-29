"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buscarGlobal } from "@/acciones/busqueda";
import { normalizarConsulta, ETIQUETA_TIPO, type ResultadoBusqueda } from "@/lib/busqueda-contrato";

// Busqueda global del panel (fase 4). Se abre con Ctrl+K (o Cmd+K) y con el evento `nc:buscar` que disparan el boton
// de la barra lateral y el de la hoja «Mas». Flechas mueven la seleccion, Enter abre, Escape cierra; al cerrar el
// foco vuelve a donde estaba. Espera 200 ms tras la ultima tecla y descarta respuestas viejas.
export const EVENTO_BUSCAR = "nc:buscar";
export function abrirBusqueda() { window.dispatchEvent(new CustomEvent(EVENTO_BUSCAR)); }

export function BusquedaGlobal() {
  const [abierta, setAbierta] = useState(false);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<ResultadoBusqueda[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [sel, setSel] = useState(0);
  const anterior = useRef<HTMLElement | null>(null);
  const peticion = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const cerrar = useCallback(() => {
    setAbierta(false); setQ(""); setResultados([]); setSel(0);
    const a = anterior.current; anterior.current = null;
    requestAnimationFrame(() => a?.focus());
  }, []);
  const abrir = useCallback(() => {
    anterior.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAbierta(true);
  }, []);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); abrir(); } };
    const evento = () => abrir();
    document.addEventListener("keydown", tecla);
    window.addEventListener(EVENTO_BUSCAR, evento);
    return () => { document.removeEventListener("keydown", tecla); window.removeEventListener(EVENTO_BUSCAR, evento); };
  }, [abrir]);

  useEffect(() => {
    if (!abierta) return;
    const t = normalizarConsulta(q);
    if (!t) { setResultados([]); setBuscando(false); return; }
    const n = ++peticion.current;
    setBuscando(true);
    const id = setTimeout(async () => {
      const r = await buscarGlobal(t);
      if (n !== peticion.current) return; // llego una respuesta vieja
      setResultados(r.ok ? r.datos : []); setSel(0); setBuscando(false);
    }, 200);
    return () => clearTimeout(id);
  }, [q, abierta]);

  if (!abierta) return null;
  const ir = (r: ResultadoBusqueda) => { cerrar(); router.push(r.href); };
  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); cerrar(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, resultados.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === "Enter" && resultados[sel]) { e.preventDefault(); ir(resultados[sel]); }
  };
  const t = normalizarConsulta(q);
  return (
    <div className="busqueda" onKeyDown={teclas}>
      <div className="velo" onClick={cerrar} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label="Buscar en el panel" className="busqueda__caja">
        <input ref={input} type="search" className="busqueda__input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Leads, directorio, clientes, proyectos…" autoFocus autoComplete="off" aria-label="Buscar" aria-controls="busqueda-lista" aria-activedescendant={resultados[sel] ? `busqueda-${resultados[sel].tipo}-${resultados[sel].id}` : undefined} />
        <ul id="busqueda-lista" role="listbox" className="busqueda__lista" aria-label="Resultados">
          {resultados.map((r, i) => (
            <li key={`${r.tipo}-${r.id}`} id={`busqueda-${r.tipo}-${r.id}`} role="option" aria-selected={i === sel} className="busqueda__item" onMouseEnter={() => setSel(i)} onClick={() => ir(r)}>
              <span className="busqueda__tipo">{ETIQUETA_TIPO[r.tipo]}</span>
              <span className="busqueda__texto"><b>{r.titulo}</b>{r.sub && <span className="suave"> · {r.sub}</span>}</span>
            </li>
          ))}
        </ul>
        {t && !buscando && resultados.length === 0 && <p className="suave busqueda__nada">Nada con «{t}».</p>}
        {!t && <p className="suave busqueda__nada">Escribe al menos dos letras. Enter abre, Escape cierra.</p>}
      </div>
    </div>
  );
}
