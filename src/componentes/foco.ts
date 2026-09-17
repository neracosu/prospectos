// Una tarjeta que se esconde con el foco adentro lo deja caer en <body>: quien navega con teclado o lector de
// pantalla pierde el lugar. Antes de esconderla, el foco pasa a la tarjeta siguiente, o al titulo de su seccion
// (los <h2 class="titulo"> de Hoy llevan tabIndex -1 para poder recibirlo).
export function sacarFocoDe(tarjeta: HTMLElement | null): void {
  if (!tarjeta || !tarjeta.contains(document.activeElement)) return;
  let destino: HTMLElement | null = null;
  const siguiente = tarjeta.nextElementSibling;
  if (siguiente instanceof HTMLElement && siguiente.tagName === "ARTICLE") destino = siguiente.querySelector<HTMLElement>("a, button");
  for (let e = tarjeta.previousElementSibling; !destino && e; e = e.previousElementSibling) {
    if (e instanceof HTMLElement && e.matches("h2.titulo")) destino = e;
  }
  destino?.focus({ preventScroll: true });
}
