"use client";
import { useState, useTransition, type ReactNode } from "react";
import type { Etapa } from "@/lib/embudo-contrato";
import { esEtapa } from "@/lib/embudo-contrato";
import { puedeSoltar } from "@/lib/leads-contrato";
import { moverLead } from "@/acciones/leads";
import { useFlotante } from "@/componentes/LineaFlotante";

// Columna del tablero de leads que acepta una tarjeta arrastrada (fase 4). El dato viaja como "id:etapa" en
// text/plain (lo pone TarjetaLead). Al soltar se llama a moverLead, la misma accion de «Mover a…»; mientras el
// servidor responde la tarjeta de origen se atenua (clase lead--pendiente por id) y la revalidacion la trae aqui.
// Con el dedo (telefono, tablet) el arrastre nativo no se dispara: ahi sigue «Mover a…».
function leerDato(e: React.DragEvent): { id: number; de: Etapa } | null {
  const [id, de] = (e.dataTransfer.getData("text/plain") || "").split(":");
  const n = Number(id);
  return Number.isInteger(n) && n > 0 && esEtapa(de ?? "") ? { id: n, de: de as Etapa } : null;
}
// Durante dragover el navegador no deja leer el dato: se mira el tipo que TarjetaLead agrega como marca
function etapaDeTipos(e: React.DragEvent): Etapa | null {
  const t = Array.from(e.dataTransfer.types).find((x) => x.startsWith("application/x-lead-etapa-"));
  const de = t?.slice("application/x-lead-etapa-".length) ?? "";
  return esEtapa(de) ? de : null;
}

export function ColumnaTablero({ etapa, children }: { etapa: Etapa; children: ReactNode }) {
  const [recibe, setRecibe] = useState(false);
  const [pendientes, setPendientes] = useState<number[]>([]);
  const [, empezar] = useTransition();
  const avisar = useFlotante();
  // En el telefono no hace falta apagar nada: el arrastre nativo de HTML5 no se dispara con el dedo, y el CSS del
  // arrastre solo aplica con (pointer: fine). Leer window.matchMedia al renderizar desencuadraria la hidratacion.
  return (
    <div
      className={"tablero__lista" + (recibe ? " tablero__lista--recibe" : "")}
      data-pendientes={pendientes.join(",") || undefined}
      onDragOver={(e) => { const de = etapaDeTipos(e); if (de && puedeSoltar(de, etapa)) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (!recibe) setRecibe(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setRecibe(false); }}
      onDrop={(e) => {
        e.preventDefault(); setRecibe(false);
        const d = leerDato(e);
        if (!d || !puedeSoltar(d.de, etapa)) return;
        setPendientes((p) => [...p, d.id]);
        document.querySelector(`.lead[data-id="${d.id}"]`)?.classList.add("lead--pendiente");
        empezar(async () => {
          const r = await moverLead(d.id, etapa);
          setPendientes((p) => p.filter((x) => x !== d.id));
          document.querySelector(`.lead[data-id="${d.id}"]`)?.classList.remove("lead--pendiente");
          if (!r.ok) avisar({ texto: r.mensaje });
        });
      }}
    >
      {children}
    </div>
  );
}
