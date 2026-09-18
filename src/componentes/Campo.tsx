"use client";
import { createElement, useId, useRef, useState, type ReactNode } from "react";
import { validar, FALTA, type Regla } from "@/lib/validacion-contrato";

// Un campo de formulario con validacion en linea (pasada de UX, fase C). El mensaje aparece al SALIR del campo o al
// enviar, nunca mientras se escribe la primera vez; una vez visible, se va apenas el valor queda bien. Va ENTRE la
// etiqueta y el control: con el teclado del telefono abierto, lo de debajo del campo no se ve.
// Como funciona con el envio nativo: cada valor invalido se marca con setCustomValidity, asi el formulario no se
// envia y el navegador dispara `invalid` en cada campo malo; ahi se muestra el mensaje (sin la burbuja nativa) y el
// primero de ellos recibe el foco. La regla del servidor sigue mandando: esto solo la copia.
type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
type Props = {
  etiqueta: ReactNode;
  nombre: string;
  regla?: Regla;
  requerido?: boolean;
  control?: "input" | "select" | "textarea";
  children?: ReactNode; // las opciones de un select
  className?: string;
} & Record<string, unknown>;

function mensajeNativo(el: Control): string {
  const v = el.validity;
  if (v.valueMissing) return FALTA;
  if (v.typeMismatch) return el.getAttribute("type") === "email" ? "Escribe un correo válido." : "Escribe una dirección que empiece por http:// o https://.";
  if (v.rangeUnderflow || v.rangeOverflow || v.stepMismatch) return `Tiene que ser un número entre ${el.getAttribute("min") ?? "…"} y ${el.getAttribute("max") ?? "…"}.`;
  if (v.tooLong) return `Máximo ${el.getAttribute("maxlength")} letras.`;
  return v.valid ? "" : "Revisa este dato.";
}

export function Campo({ etiqueta, nombre, regla, requerido = false, control = "input", children, className, ...resto }: Props) {
  const [mensaje, setMensaje] = useState("");
  const visible = useRef(false);
  const id = useId();

  // Evalua y deja la validez en el control (para que el envio nativo se bloquee); devuelve el mensaje.
  const evaluar = (el: Control): string => {
    el.setCustomValidity("");
    const propio = regla ? validar(regla, el.value, requerido) : "";
    if (propio) el.setCustomValidity(propio);
    return propio || mensajeNativo(el);
  };
  const mostrar = (m: string) => { setMensaje(m); visible.current = !!m; };

  const props: Record<string, unknown> = {
    ...resto,
    name: nombre,
    required: requerido || undefined,
    id: `${id}-c`,
    "aria-invalid": mensaje ? true : undefined,
    "aria-describedby": mensaje ? `${id}-m` : undefined,
    onBlur: (e: React.FocusEvent<Control>) => { mostrar(evaluar(e.currentTarget)); (resto.onBlur as ((e: React.FocusEvent<Control>) => void) | undefined)?.(e); },
    onInput: (e: React.FormEvent<Control>) => { const m = evaluar(e.currentTarget); if (visible.current) mostrar(m); (resto.onInput as ((e: React.FormEvent<Control>) => void) | undefined)?.(e); },
    onInvalid: (e: React.FormEvent<Control>) => {
      e.preventDefault(); // sin la burbuja del navegador: el mensaje va pegado al campo, en nuestro idioma
      const el = e.currentTarget;
      mostrar(evaluar(el) || mensajeNativo(el) || "Revisa este dato.");
      // Los eventos `invalid` llegan en orden: el primero del formulario se lleva el foco.
      if (el.form?.querySelector(":invalid") === el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }
    },
  };

  return (
    <label className={"campo" + (mensaje ? " campo--error" : "") + (className ? ` ${className}` : "")} htmlFor={`${id}-c`}>
      <span>{etiqueta}</span>
      {mensaje && <small id={`${id}-m`} className="campo__error" role="alert">{mensaje}</small>}
      {createElement(control, props, children)}
    </label>
  );
}
