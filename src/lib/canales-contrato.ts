// Que boton dibuja cada canal y que pasa al tocarlo. WhatsApp/SMS/email abren
// la app con el mensaje; llamada abre el marcador; las redes no dejan abrir un
// DM con texto desde un enlace, asi que se copia el mensaje y se abre el perfil.
export const CANALES = ["whatsapp", "sms", "llamada", "email", "instagram", "facebook", "tiktok", "otro"] as const;
export type Canal = (typeof CANALES)[number];

export const ETIQUETA_CANAL: Record<Canal, string> = {
  whatsapp: "WhatsApp", sms: "SMS", llamada: "Llamada", email: "Correo",
  instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", otro: "Otro",
};

export type ContactoProspecto = {
  whatsapp: string; telefono: string; email: string; instagram: string; facebook: string; tiktok: string;
};

export type AccionCanal = { canal: Canal; etiqueta: string; href: string; modo: "abrir" | "copiar_y_abrir" };

export function canalesDisponibles(c: ContactoProspecto, mensaje: string, asunto = "Propuesta"): AccionCanal[] {
  const texto = encodeURIComponent(mensaje);
  const salida: AccionCanal[] = [];
  if (c.whatsapp) {
    salida.push({ canal: "whatsapp", etiqueta: "Enviar por WhatsApp", href: `https://wa.me/${c.whatsapp}?text=${texto}`, modo: "abrir" });
    salida.push({ canal: "sms", etiqueta: "Enviar SMS", href: `sms:+${c.whatsapp}?body=${texto}`, modo: "abrir" });
    salida.push({ canal: "llamada", etiqueta: "Llamar", href: `tel:+${c.whatsapp}`, modo: "abrir" });
  } else if (c.telefono) {
    const digitos = c.telefono.replace(/[^\d+]/g, "");
    if (digitos) salida.push({ canal: "llamada", etiqueta: "Llamar", href: `tel:${digitos}`, modo: "abrir" });
  }
  if (c.email) {
    salida.push({ canal: "email", etiqueta: "Enviar correo", href: `mailto:${c.email}?subject=${encodeURIComponent(asunto)}&body=${texto}`, modo: "abrir" });
  }
  for (const red of ["instagram", "facebook", "tiktok"] as const) {
    if (c[red]) salida.push({ canal: red, etiqueta: `Copiar y abrir ${ETIQUETA_CANAL[red]}`, href: c[red], modo: "copiar_y_abrir" });
  }
  return salida;
}

export function prioridadContacto(c: ContactoProspecto): number {
  if (c.whatsapp) return 0;
  if (c.telefono || c.email) return 1;
  if (c.instagram || c.facebook || c.tiktok) return 2;
  return 3;
}
