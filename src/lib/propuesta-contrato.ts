// src/lib/propuesta-contrato.ts
// La plantilla es un fragmento (empieza en <title>, sigue <link>/<style> y luego
// el cuerpo), como la lee pdf.cjs. Aqui se envuelve en un documento completo y se
// personaliza igual que alla: data-nombre en .documento, que el script de la
// plantilla reparte a cada [data-hotel].
export function nombreSeguro(nombre: string): string {
  return nombre.replace(/[&"<>]/g, "").trim().slice(0, 60);
}

export function renderPropuesta(plantilla: string, nombre: string, urlPdf: string): string {
  const n = nombreSeguro(nombre);
  let cuerpo = plantilla.replace('<div class="documento">', `<div class="documento" data-nombre="${n}">`);
  cuerpo = cuerpo.replace(/<button class="boton" id="descargar-pdf"[^>]*>([\s\S]*?)<\/button>/, `<a class="boton" href="${urlPdf}" download>$1</a>`);
  // Cabecera = todo hasta el cierre del ultimo </style>; el resto es el cuerpo.
  const corte = cuerpo.lastIndexOf("</style>") + "</style>".length;
  const cabecera = cuerpo.slice(0, corte);
  const resto = cuerpo.slice(corte);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow">${cabecera}</head><body>${resto}</body></html>`;
}
