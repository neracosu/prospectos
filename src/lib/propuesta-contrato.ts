// src/lib/propuesta-contrato.ts
// La plantilla es un fragmento (empieza en <title>, sigue <link>/<style> y luego
// el cuerpo), como la lee pdf.cjs. Aqui se envuelve en un documento completo y se
// personaliza igual que alla: data-nombre en .documento, que el script de la
// plantilla reparte a cada [data-hotel].
import { esFechaIso, hoyCaracas, sumarDias } from "@/lib/fecha-caracas";

export function nombreSeguro(nombre: string): string {
  return nombre.replace(/[&"<>]/g, "").trim().slice(0, 60);
}

// El enlace de descarga pide el PDF por fetch en vez de navegar directo: si el
// servidor responde con error (por ejemplo 503 por PDF_OCUPADO), el aviso de
// reintento le llega al visitante en la misma pagina en vez de mostrarle una
// pantalla de error en blanco.
const SCRIPT_DESCARGA = `
<script>
(function () {
  var boton = document.getElementById("descargar-pdf");
  var aviso = document.getElementById("aviso-descarga");
  if (!boton || !aviso) return;
  var href = boton.getAttribute("href");
  boton.addEventListener("click", async function (ev) {
    ev.preventDefault();
    boton.setAttribute("aria-disabled", "true");
    boton.style.pointerEvents = "none";
    aviso.textContent = "Generando PDF...";
    try {
      var res = await fetch(href);
      if (!res.ok) {
        var texto = "";
        try { texto = await res.text(); } catch (e) {}
        aviso.textContent = texto || "No se pudo generar el PDF ahora. Intenta de nuevo en un momento.";
        return;
      }
      var blob = await res.blob();
      var url = URL.createObjectURL(blob);
      var enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = (document.title || "Propuesta").replace(/[^a-zA-Z0-9]+/g, "-") + ".pdf";
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      // Revocar de una vez puede cortar la descarga en algunos navegadores
      // (todavia no terminaron de leer el blob); se espera un poco.
      setTimeout(function(){ URL.revokeObjectURL(url); }, 2000);
      aviso.textContent = "PDF descargado.";
    } catch (e) {
      location.href = href;
    } finally {
      boton.removeAttribute("aria-disabled");
      boton.style.pointerEvents = "";
    }
  });
})();
</script>`;

// Lo que una plantilla puede pedir del prospecto ademas del nombre (fase «propuesta por prospecto», 17-sep-2026).
// Los tokens {{nombre}} {{ciudad}} {{rubro}} se rellenan escapados en el servidor; los bloques
// <!--si:web-->…<!--fin:web--> y <!--si:sinweb-->…<!--fin:sinweb--> se dejan o se quitan segun el prospecto tenga
// web publicada: a quien ya tiene pagina no se le propone «una pagina», se le propone conectarla.
// {{fecha}} y {{vigencia}} (5-oct-2026): la fecha iba escrita a mano en cada plantilla y la de hoteles salio dos
// semanas con los precios vencidos. `fecha` es el dia de Caracas (YYYY-MM-DD) del primer envio, o el de hoy si
// todavia no se envio; la vigencia son 30 dias desde ahi.
// <!--si:promo-->…<!--fin:promo--> (temporada promocional, decision de Neri del 5-oct-2026): 40 % de descuento en el
// pago unico para quien contrate hasta PROMO_HASTA. Lo decide el dia en que se ABRE la propuesta (`hoy`), no el del
// envio: una propuesta enviada en diciembre y abierta en enero ya no lo ofrece.
export const PROMO_HASTA = "2026-12-31";
// La misma temporada, como frase para el primer mensaje de WhatsApp: la variable {promo} de los mensajes de nicho.
// Vacia cuando la temporada termino, para que ningun mensaje ofrezca un descuento vencido.
export function fraseDePromo(hoy: string): string {
  return hoy <= PROMO_HASTA ? "Hasta el 31 de diciembre hay 40 % de descuento en el pago único." : "";
}
export type ExtraPropuesta = { ciudad?: string; rubro?: string; conWeb?: boolean; fecha?: string; hoy?: string };

export const DIAS_VIGENCIA = 30;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
// "2026-10-05" -> "5 de octubre de 2026"
export function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function bloque(html: string, nombre: string, dejar: boolean): string {
  const re = new RegExp(`<!--si:${nombre}-->([\\s\\S]*?)<!--fin:${nombre}-->`, "g");
  return html.replace(re, dejar ? "$1" : "");
}

export function renderPropuesta(plantilla: string, nombre: string, urlPdf: string, extra: ExtraPropuesta = {}): string {
  if (!plantilla.includes('<div class="documento">') || !plantilla.includes("</style>")) {
    throw new Error("PLANTILLA_SIN_MARCADORES");
  }
  const n = nombreSeguro(nombre);
  const hoy = extra.hoy && esFechaIso(extra.hoy) ? extra.hoy : hoyCaracas();
  const fecha = extra.fecha && esFechaIso(extra.fecha) ? extra.fecha : hoy;
  let cuerpo = plantilla.replace('<div class="documento">', `<div class="documento" data-nombre="${n}">`);
  cuerpo = cuerpo
    .replace(/\{\{nombre\}\}/g, escapar(n) || "su negocio")
    .replace(/\{\{ciudad\}\}/g, escapar((extra.ciudad ?? "").trim().slice(0, 80)) || "su ciudad")
    .replace(/\{\{rubro\}\}/g, escapar((extra.rubro ?? "").trim().slice(0, 60)) || "su negocio")
    .replace(/\{\{fecha\}\}/g, fechaLarga(fecha))
    .replace(/\{\{vigencia\}\}/g, fechaLarga(sumarDias(fecha, DIAS_VIGENCIA)));
  cuerpo = bloque(bloque(cuerpo, "web", extra.conWeb === true), "sinweb", extra.conWeb === false);
  cuerpo = bloque(cuerpo, "promo", hoy <= PROMO_HASTA);
  cuerpo = cuerpo.replace(
    /<button class="boton" id="descargar-pdf"[^>]*>([\s\S]*?)<\/button>/,
    `<a class="boton" id="descargar-pdf" href="${urlPdf}">$1</a>`,
  );
  // Cabecera = todo hasta el cierre del ultimo </style>; el resto es el cuerpo.
  const corte = cuerpo.lastIndexOf("</style>") + "</style>".length;
  const cabecera = cuerpo.slice(0, corte);
  const resto = cuerpo.slice(corte);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow">${cabecera}</head><body>${resto}${SCRIPT_DESCARGA}</body></html>`;
}
