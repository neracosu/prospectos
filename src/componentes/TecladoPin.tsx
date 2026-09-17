"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { entrar } from "@/acciones/entrar";
import type { Resultado } from "@/acciones/resultado";

type AccionPin = (estado: unknown, formData: FormData) => Promise<Resultado>;

// Teclado numerico grande: se usa con el pulgar. Al sexto digito envia solo.
// Por defecto entra al panel; el portal del cliente le pasa su accion y el codigo como campo oculto.
export function TecladoPin({ accion: accionPropia, campos }: { accion?: AccionPin; campos?: Record<string, string> } = {}) {
  const [estado, accion, pendiente] = useActionState(accionPropia ?? entrar, null);
  const [pin, setPin] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const teclas = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

  function tocar(t: string) {
    if (pendiente) return; // ya se esta enviando: no tocar el pin o se postea a medio armar
    if (t === "⌫") { setPin((p) => p.slice(0, -1)); return; }
    if (!t) return;
    setPin((p) => (p.length >= 6 ? p : p + t));
  }

  // El envio va aparte de la actualizacion de pin: un updater de setState debe
  // ser puro (React puede llamarlo mas de una vez), y requestSubmit() no lo es.
  useEffect(() => {
    if (pin.length !== 6 || pendiente) return;
    const id = setTimeout(() => formRef.current?.requestSubmit(), 50);
    return () => clearTimeout(id);
  }, [pin, pendiente]);

  return (
    <form ref={formRef} action={accion} className="teclado" onSubmit={() => setTimeout(() => setPin(""), 300)}>
      <input type="hidden" name="pin" value={pin} />
      {campos && Object.entries(campos).map(([nombre, valor]) => <input key={nombre} type="hidden" name={nombre} value={valor} />)}
      <div className="teclado__puntos" aria-label={`${pin.length} de 6`}>
        {Array.from({ length: 6 }, (_, i) => <span key={i} className={i < pin.length ? "lleno" : ""} />)}
      </div>
      <div className="teclado__grilla">
        {teclas.map((t, i) => (
          <button key={i} type="button" className="teclado__tecla" disabled={pendiente || !t} aria-label={t === "⌫" ? "Borrar" : t}
            onClick={() => tocar(t)}>{t}</button>
        ))}
      </div>
      {estado && !estado.ok && <p className="error" role="alert">{estado.mensaje}</p>}
    </form>
  );
}
