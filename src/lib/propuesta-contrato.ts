// src/lib/propuesta-contrato.ts
// La plantilla es un fragmento (empieza en <title>, sigue <link>/<style> y luego
// el cuerpo), como la lee pdf.cjs. Aqui se envuelve en un documento completo y se
// personaliza igual que alla: data-nombre en .documento, que el script de la
// plantilla reparte a cada [data-hotel].
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

export function renderPropuesta(plantilla: string, nombre: string, urlPdf: string): string {
  if (!plantilla.includes('<div class="documento">') || !plantilla.includes("</style>")) {
    throw new Error("PLANTILLA_SIN_MARCADORES");
  }
  const n = nombreSeguro(nombre);
  let cuerpo = plantilla.replace('<div class="documento">', `<div class="documento" data-nombre="${n}">`);
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
