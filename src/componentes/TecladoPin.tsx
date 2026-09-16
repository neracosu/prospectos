"use client";
import { useActionState, useState } from "react";
import { entrar } from "@/acciones/entrar";

// Teclado numerico grande: se usa con el pulgar. Al sexto digito envia solo.
export function TecladoPin() {
  const [estado, accion, pendiente] = useActionState(entrar, null);
  const [pin, setPin] = useState("");
  const teclas = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

  function tocar(t: string, form: HTMLFormElement | null) {
    if (t === "⌫") return setPin((p) => p.slice(0, -1));
    if (!t || pin.length >= 6) return;
    const nuevo = pin + t;
    setPin(nuevo);
    if (nuevo.length === 6) setTimeout(() => form?.requestSubmit(), 50);
  }

  return (
    <form action={accion} className="teclado" onSubmit={() => setTimeout(() => setPin(""), 300)}>
      <input type="hidden" name="pin" value={pin} />
      <div className="teclado__puntos" aria-label={`${pin.length} de 6`}>
        {Array.from({ length: 6 }, (_, i) => <span key={i} className={i < pin.length ? "lleno" : ""} />)}
      </div>
      <div className="teclado__grilla">
        {teclas.map((t, i) => (
          <button key={i} type="button" className="teclado__tecla" disabled={pendiente || !t} aria-label={t === "⌫" ? "Borrar" : t}
            onClick={(e) => tocar(t, e.currentTarget.form)}>{t}</button>
        ))}
      </div>
      {estado && !estado.ok && <p className="error" role="alert">{estado.mensaje}</p>}
    </form>
  );
}
