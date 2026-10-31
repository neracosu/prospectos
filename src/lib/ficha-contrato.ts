// Contrato puro de la ficha de negocio: lee las senales de la web de un negocio, decide
// que se encontro, redacta el gancho y el resumen por reglas y depura el universo de
// prospectos con correo. Sin base, sin red y sin node: lo importan tareas con base y el navegador.

// desconocida: la descarga fallo por algo que no prueba que la web este caida (plazo, corte, certificado):
// se mantiene como web existente y no genera gancho de web.
export type EstadoWeb = "viva" | "caida" | "vendida" | "en_mantenimiento" | "red_social" | "sin_web" | "desconocida";
export type Plataforma = "wordpress" | "woocommerce" | "shopify" | "wix" | "tiendanube" | "otra" | "";

export type HallazgosWeb = {
  url: string; estado: EstadoWeb; titulo: string; descripcion: string; plataforma: Plataforma;
  paginasLeidas: string[]; reservaPorWhatsApp: boolean; pedidoPorWhatsApp: boolean; tieneReservasEnLinea: boolean;
  tieneTiendaEnLinea: boolean; cobraEnLinea: boolean; tieneMenuOCatalogo: boolean; menuEnPdf: boolean;
  motorExterno: string; metodosPago: string[]; horario: string; direccion: string; redes: string[];
  nombreCoincide: boolean;
};
export type HallazgosBase = {
  tipo: string; tamano: string; nota: string; instagram: string; facebook: string;
  telefono: string; whatsapp: string; variasSedes: boolean;
};
export type Hallazgos = {
  web?: HallazgosWeb;
  overture?: { id: string; direccion: string; categoriaBase: string; categoriaFina: string };
  base: HallazgosBase;
};
export type EstadoFicha = "sin_hallazgos" | "borrador" | "lista" | "revisada";

export const GANCHO_MAX = 280;

// ---------- descarga ----------

const REDES = /(^|\.)(instagram\.com|facebook\.com|fb\.com|fb\.me|linktr\.ee|wa\.me|tiktok\.com|twitter\.com|x\.com|t\.me|beacons\.ai)(\/|$|\?)/i;

export function esWebRedSocial(url: string): boolean {
  const limpio = (url || "").trim().replace(/^[a-z]+:\/\//i, "").replace(/^www\./i, "");
  return REDES.test(limpio);
}

const MANTENIMIENTO = /mantenci[oó]n|mantenimiento|coming soon|pr[oó]ximamente/i;

// mantenimiento solo si lo dice el titulo o el h1, o si el cuerpo casi no tiene texto
function senalMantenimiento(html: string): boolean {
  const titulo = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "";
  const h1 = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? "";
  if (MANTENIMIENTO.test(titulo) || MANTENIMIENTO.test(h1)) return true;
  const visible = textoPlano(html);
  return visible.length < 400 && MANTENIMIENTO.test(visible);
}

// Motivos de red-segura que si prueban que la web no abre (el dominio no resuelve o nadie atiende).
export const MOTIVOS_CAIDA = new Set(["No se pudo resolver el dominio", "No se pudo conectar"]);

export function estadoDeDescarga(r: { ok: boolean; estado?: number; texto?: string; motivo?: string }, urlPedida: string): EstadoWeb {
  if (esWebRedSocial(urlPedida)) return "red_social";
  if (!r.ok) return MOTIVOS_CAIDA.has(r.motivo ?? "") ? "caida" : "desconocida";
  if (r.estado !== undefined && r.estado >= 500) return "caida";
  const t = r.texto ?? "";
  if (/domain is for sale|dominio en venta|hugedomains|sedo\b/i.test(t)) return "vendida";
  if (/ConnectYourDomain|not connected to a website/i.test(t)) return "caida";
  if (senalMantenimiento(t)) return "en_mantenimiento";
  return "viva";
}

const PALABRAS_ENLACE = /contacto|menu|menú|carta|reserv|servicio|tienda|habitaci|catalogo|catálogo/i;

export function enlacesInternos(html: string, urlBase: string): string[] {
  let base: URL;
  try { base = new URL(urlBase); } catch { return []; }
  const salida: string[] = [];
  const re = /<a\b[^>]*?href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html ?? "")) && salida.length < 3) {
    const href = m[1].trim();
    if (/^(mailto|tel|javascript):/i.test(href)) continue;
    if (!PALABRAS_ENLACE.test(href) && !PALABRAS_ENLACE.test(textoPlano(m[2]))) continue;
    let u: URL;
    try { u = new URL(href, base); } catch { continue; }
    if (u.host !== base.host || !/^https?:$/.test(u.protocol)) continue;
    u.hash = "";
    const s = u.toString();
    if (s !== base.toString() && !salida.includes(s)) salida.push(s);
  }
  return salida;
}

// ---------- analisis de la web ----------

function textoPlano(html: string): string {
  return (html ?? "")
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim();
}

function sinAcentos(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function recortar(s: string, max: number): string {
  return s.length > max ? s.slice(0, max).trim() : s;
}

function detectarPlataforma(html: string): Plataforma {
  if (/woocommerce/i.test(html)) return "woocommerce";
  if (/cdn\.shopify\.com|Shopify\.theme/i.test(html)) return "shopify";
  if (/wixstatic|wix\.com/i.test(html)) return "wix";
  if (/tiendanube|nuvemshop/i.test(html)) return "tiendanube";
  if (/wp-content|wp-includes/i.test(html)) return "wordpress";
  return "";
}

function hrefs(html: string): { href: string; texto: string }[] {
  const salida: { href: string; texto: string }[] = [];
  const re = /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    let href = m[1];
    try { href = decodeURIComponent(href); } catch { /* se deja tal cual */ }
    salida.push({ href, texto: textoPlano(m[2]) });
  }
  return salida;
}

const ENLACE_WHATSAPP = /wa\.me\/|api\.whatsapp\.com|whatsapp\.com\/send/i;
const VERBOS_RESERVA = /\b(reserv\w*|citas?|agend\w*|turnos?)\b/i;
const VERBOS_PEDIDO = /pedid|pedir|ordenar|delivery/i;

// "pedir/solicitar informacion o presupuesto" no es un pedido ni una reserva
function detectarWhatsApp(enlaces: { href: string; texto: string }[], verbos: RegExp): boolean {
  return enlaces.some((e) => ENLACE_WHATSAPP.test(e.href)
    && verbos.test((e.href + " " + e.texto).replace(/(pedir|solicitar)\s+(informaci[oó]n|presupuesto)/gi, " ")));
}

function detectarMenuEnPdf(enlaces: { href: string; texto: string }[]): boolean {
  return enlaces.some((e) => /\.pdf(\?|$)/i.test(e.href) && /carta|men[uú]|cat[aá]logo|precios/i.test(e.href + " " + e.texto));
}

function detectarMotor(html: string): string {
  const m = /cloudbeds|booking\.com|expedia|despegar|siteminder|littlehotelier/i.exec(html);
  return m ? m[0].toLowerCase() : "";
}

function detectarPagos(texto: string): string[] {
  const t = sinAcentos(texto);
  const reglas: [RegExp, string][] = [
    [/pago ?movil/, "pago móvil"], [/zelle/, "zelle"], [/paypal/, "paypal"], [/binance/, "binance"],
    [/transferencia/, "transferencia"], [/efectivo/, "efectivo"], [/punto de venta/, "punto de venta"],
  ];
  return reglas.filter(([re]) => re.test(t)).map(([, n]) => n);
}

function detectarRedes(html: string): string[] {
  const salida: string[] = [];
  const re = /https?:\/\/(?:www\.)?(?:instagram\.com|facebook\.com|tiktok\.com)\/[^\s"'<>)]+/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) { if (!salida.includes(m[0])) salida.push(m[0]); }
  return salida.slice(0, 5);
}

const DIA = "(?:lun|mar|mi[eé]|jue|vie|s[aá]b|dom)";
function detectarHorario(texto: string): string {
  const m = new RegExp(`${DIA}[a-zéáó]*[^.]{0,60}\\d{1,2}(?::\\d{2})?\\s*(?:am|pm|h)\\b`, "i").exec(texto);
  return m ? recortar(m[0], 120) : "";
}
function detectarDireccion(texto: string): string {
  const m = /\b(?:av\.?|avenida|calle|carrera|urbanizaci[oó]n|local)\s[^.]{5,100}/i.exec(texto);
  return m ? recortar(m[0], 120) : "";
}

const GENERICAS = new Set(["hotel", "restaurante", "clinica", "centro", "posada", "farmacia"]);

function coincideNombre(nombre: string, titulo: string, h1: string): boolean {
  const destino = sinAcentos(titulo + " " + h1).trim();
  if (!destino) return true; // sin titulo ni h1 no hay con que comparar
  const palabras = sinAcentos(nombre).split(/[^a-z0-9ñ]+/).filter((p) => p.length >= 4 && !GENERICAS.has(p));
  if (palabras.length === 0) return true;
  return palabras.some((p) => destino.includes(p));
}

export function analizarWeb(html: string, urlFinal: string, nombre: string, estado: EstadoWeb): HallazgosWeb {
  const h = typeof html === "string" ? html : "";
  const texto = textoPlano(h);
  const enlaces = hrefs(h);
  const titulo = recortar(textoPlano(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(h)?.[1] ?? ""), 200);
  const h1 = textoPlano(/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(h)?.[1] ?? "");
  const descripcion = recortar(
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(h)?.[1] ?? "", 200);
  const plataforma = detectarPlataforma(h);
  const motorExterno = detectarMotor(h);
  const menuEnPdf = detectarMenuEnPdf(enlaces);
  const cobraEnLinea = /checkout|pasarela|mercadopago|stripe|paypal|bot[oó]n de pago/i.test(h);
  const tieneTiendaEnLinea = plataforma === "shopify" || plataforma === "woocommerce" || plataforma === "tiendanube"
    || /agregar al carrito|add to cart|a[ñn]adir al carrito/i.test(h);
  return {
    url: urlFinal, estado, titulo, descripcion, plataforma,
    paginasLeidas: [urlFinal],
    reservaPorWhatsApp: detectarWhatsApp(enlaces, VERBOS_RESERVA),
    pedidoPorWhatsApp: detectarWhatsApp(enlaces, VERBOS_PEDIDO),
    tieneReservasEnLinea: motorExterno !== "" || /reservar en l[ií]nea|book now|calendly/i.test(h),
    tieneTiendaEnLinea, cobraEnLinea,
    tieneMenuOCatalogo: menuEnPdf || enlaces.some((e) => /men[uú]|carta|cat[aá]logo/i.test(e.href + " " + e.texto)),
    menuEnPdf, motorExterno,
    metodosPago: detectarPagos(texto),
    horario: detectarHorario(texto), direccion: detectarDireccion(texto),
    redes: detectarRedes(h),
    // una pagina caida o vendida no es del negocio: no hay nombre que comparar
    nombreCoincide: estado !== "viva" || coincideNombre(nombre, titulo, h1),
  };
}

// Plural o numero >= 2: «1 sede», «una sede» y «comidas locales» no son varias sedes.
const VARIAS_SEDES = /\bvarias\s+(sedes|sucursales|locales)\b|\b([2-9]|\d{2,}|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(sedes|sucursales|locales)\b|\bsucursales\b/i;

// Solo los campos de la base, uno por uno: el prospecto trae id, correo, nicho y la ficha previa, que no van aqui.
// web y nombre son opcionales: con nombre, el campo instagram se reemplaza por el usuario validado ("" si no vale).
export function hallazgosDeBase(p: {
  tipo: string; tamano: string; nota: string; instagram: string; facebook: string; telefono: string; whatsapp: string;
  web?: string; nombre?: string;
}): HallazgosBase {
  const instagram = p.nombre === undefined ? p.instagram : usuarioInstagramValido(p.instagram, p.web ?? "", p.nombre);
  return {
    tipo: p.tipo, tamano: p.tamano, nota: p.nota, instagram, facebook: p.facebook, telefono: p.telefono,
    whatsapp: p.whatsapp, variasSedes: VARIAS_SEDES.test(`${p.nota} ${p.tamano}`),
  };
}

// ---------- gancho ----------

type Regla = "web_caida" | "mantenimiento" | "whatsapp" | "tienda_a_mano" | "carta_pdf" | "motor" | "sedes" | "instagram";

const ARQ_WHATSAPP = ["hoteles-estadia", "reservas", "restaurantes-y-bares", "citas-y-servicios"];
const ARQ_INSTAGRAM = ["comercio-y-tienda", "farmacias", "restaurantes-y-bares", "citas-y-servicios", "reservas", "hoteles-estadia"];
// Comercio con inventario: tienda a mano y catalogo en PDF valen para los dos.
const ARQ_INVENTARIO = ["comercio-y-tienda", "farmacias"];

// Web que no abre: gancho «hoy no abre» y la propuesta va como sin web (lo usa webUsable).
export const WEB_NO_ABRE: ReadonlySet<string> = new Set<EstadoWeb>(["caida", "vendida"]);
// Solo estos arquetipos venden la pagina propia como reemplazo; en los demas lo propuesto no depende de la web.
const ARQ_PAGINA_PROPIA = ["hoteles", "hoteles-estadia", "reservas", "comercio-y-tienda", "farmacias"];
const ARQUETIPOS = [
  "hoteles", "hoteles-estadia", "restaurantes-y-bares", "reservas", "comercio-y-tienda", "farmacias", "citas-y-servicios", "cobros-y-pagos",
];

function webViva(h: Hallazgos): HallazgosWeb | undefined {
  return h.web && h.web.estado === "viva" ? h.web : undefined;
}

function sinWebPropia(h: Hallazgos): boolean {
  return !h.web || h.web.estado === "sin_web" || h.web.estado === "red_social";
}

function whatsappAplica(w: HallazgosWeb, arq: string): boolean {
  if (!ARQ_WHATSAPP.includes(arq)) return false;
  return w.reservaPorWhatsApp || (arq === "restaurantes-y-bares" && w.pedidoPorWhatsApp);
}

function reglaDeGancho(h: Hallazgos, arq: string): Regla | "" {
  const w = webViva(h);
  if (h.web && WEB_NO_ABRE.has(h.web.estado)) return "web_caida";
  if (h.web?.estado === "en_mantenimiento") return "mantenimiento";
  // en restaurantes la carta en PDF es la senal mas especifica: va antes que el WhatsApp
  if (w && arq === "restaurantes-y-bares" && w.menuEnPdf) return "carta_pdf";
  if (w && whatsappAplica(w, arq)) return "whatsapp";
  if (w && ARQ_INVENTARIO.includes(arq) && w.tieneTiendaEnLinea && !w.cobraEnLinea) return "tienda_a_mano";
  if (w && w.menuEnPdf && ARQ_INVENTARIO.includes(arq)) return "carta_pdf";
  if (w && w.motorExterno && arq === "hoteles-estadia") return "motor";
  if (h.base.variasSedes && arq !== "hoteles") return "sedes";
  if (sinWebPropia(h) && usuarioInstagram(h.base.instagram) && !RUTAS_IG.has(usuarioInstagram(h.base.instagram).toLowerCase()) && ARQ_INSTAGRAM.includes(arq)) return "instagram";
  return "";
}

const RUTAS_IG = new Set(["p", "reel", "reels", "explore", "popular", "whatsapp", "accounts", "stories", "tv", "directory", "about", "legal", "developer", "web", "share"]);

function ultimoSegmentoIg(s: string): string {
  const limpio = (s ?? "").trim().replace(/[?#].*$/, "").replace(/\/+$/, "");
  return (limpio.split("/").pop() ?? "").replace(/^@/, "").trim();
}

export function usuarioInstagramValido(instagram: string, web: string, nombre: string): string {
  let u = ultimoSegmentoIg(instagram);
  if (!u || RUTAS_IG.has(u.toLowerCase())) {
    u = /instagram\.com\//i.test(web ?? "") ? ultimoSegmentoIg(web) : "";
    if (RUTAS_IG.has(u.toLowerCase())) u = "";
  }
  if (!u) return "";
  const n = sinAcentos(nombre ?? "");
  const uu = sinAcentos(u);
  const palabras = n.split(/[^a-z0-9]+/).filter((x) => x.length >= 4);
  if (palabras.some((x) => uu.includes(x))) return u;
  const nAplastado = n.replace(/[^a-z0-9]/g, "");
  const uAplastado = uu.replace(/[^a-z0-9]/g, "");
  if (uAplastado.length >= 5 && nAplastado.includes(uAplastado)) return u;
  if (nAplastado.length >= 5 && uu.includes(nAplastado)) return u;
  return "";
}

function usuarioInstagram(s: string): string {
  const limpio = s.trim().replace(/[?#].*$/, "").replace(/\/+$/, "");
  const ultimo = limpio.split("/").pop() ?? "";
  return ultimo.replace(/^@/, "");
}

function segundaDeWeb(arq: string): string {
  if (arq === "farmacias") return "El sistema trae su propia página, en su dominio, con existencia y precio por sede y el récipe por foto, dentro de lo que permite la norma.";
  return ARQ_PAGINA_PROPIA.includes(arq)
    ? "El sistema trae su propia página, en su dominio, lista para vender y cobrar."
    : "Lo que le propongo no depende de ella.";
}

function textoGancho(regla: Regla, h: Hallazgos, arq: string): string {
  switch (regla) {
    case "mantenimiento":
      return `Vi que su página está en mantenimiento. ${segundaDeWeb(arq)}`;
    case "web_caida":
      return `Vi que su dirección web hoy no abre. ${segundaDeWeb(arq)}`;
    case "whatsapp":
      if (arq === "restaurantes-y-bares") {
        return h.web?.reservaPorWhatsApp
          ? "Vi que en su página las reservas de mesa se piden por WhatsApp. Eso es justo lo que el sistema convierte en una reserva confirmada sola, con el anticipo validado."
          : "Vi que en su página los pedidos se hacen por WhatsApp. Eso es justo lo que el sistema convierte en un pedido confirmado solo, con el pago validado.";
      }
      if (arq === "citas-y-servicios") {
        return "Vi que hoy la cita se pide por WhatsApp y se confirma a mano. Eso es lo primero que el diagnóstico mira: cómo se aparta la hora y cómo se cobra.";
      }
      return "Vi que en su página las reservas se piden por WhatsApp. Eso es justo lo que el sistema convierte en una reserva confirmada sola, con el anticipo validado, a cualquier hora.";
    case "tienda_a_mano":
      return "Vi que ya venden en línea por su página. Lo que le propongo es que el pago móvil se confirme solo dentro de esa misma tienda, sin revisar el banco a mano.";
    case "carta_pdf":
      if (arq === "farmacias") return "Vi que su catálogo está en PDF. Con el sistema, el cliente ve existencia y precio por sede y pide desde ahí, con la foto del récipe.";
      return arq === "comercio-y-tienda"
        ? "Vi que su catálogo está en PDF. Con el sistema, el cliente ve solo lo que hay en existencia y paga desde ahí."
        : "Vi que su carta está en PDF. Con el sistema, el cliente pide desde esa misma carta y la cocina lo recibe sin que nadie lo copie.";
    case "motor":
      return "Vi que sus reservas pasan por un motor externo. Lo que le propongo convive con él: cobra en bolívares a la tasa del día, con la caja local y sin comisión por reserva.";
    case "sedes":
      return "Vi que atienden en varias sedes. El sistema las ve todas desde un solo panel, con lo de cada una por separado.";
    case "instagram":
      if (arq === "citas-y-servicios") {
        return `Vi que atienden por Instagram (@${usuarioInstagram(h.base.instagram)}) y la cita se pide por mensaje. Eso es lo primero que el diagnóstico mira: cómo se aparta la hora y cómo se cobra.`;
      }
      if (arq === "farmacias") {
        return `Vi que atienden por Instagram (@${usuarioInstagram(h.base.instagram)}). El sistema le da una página propia donde el cliente ve existencia y precio, pide con la foto del récipe y paga validado, sin depender de que alguien conteste el mensaje.`;
      }
      return `Vi que atienden por Instagram (@${usuarioInstagram(h.base.instagram)}). El sistema le da una página propia que vende y cobra sola, sin depender de que alguien conteste el mensaje.`;
  }
}

export function armarGancho(h: Hallazgos, arquetipo: string): string {
  if (!ARQUETIPOS.includes(arquetipo)) return "";
  if (h.web && h.web.nombreCoincide === false) return "";
  const regla = reglaDeGancho(h, arquetipo);
  if (!regla) return "";
  const g = textoGancho(regla, h, arquetipo).replace(/\s+/g, " ").trim();
  return g.length > GANCHO_MAX ? "" : g;
}

// ---------- resumen ----------

const NOMBRE_ARQUETIPO: Record<string, string> = {
  "hoteles": "hotel de paso", "hoteles-estadia": "hotel o posada de estadía", "restaurantes-y-bares": "restaurante o bar",
  "reservas": "negocio de reservas", "comercio-y-tienda": "comercio", "farmacias": "farmacia", "citas-y-servicios": "negocio de citas y servicios",
  "cobros-y-pagos": "negocio con cobros recurrentes",
};

function hechosDeWeb(w: HallazgosWeb): string[] {
  const hechos: string[] = [];
  if (w.plataforma) hechos.push(`página en ${w.plataforma}`);
  if (w.menuEnPdf) hechos.push("carta o catálogo en PDF");
  else if (w.tieneMenuOCatalogo) hechos.push("carta o catálogo en la página");
  if (w.reservaPorWhatsApp) hechos.push("reservas o pedidos por WhatsApp");
  if (w.motorExterno) hechos.push(`motor de reservas externo (${w.motorExterno})`);
  if (w.tieneTiendaEnLinea) hechos.push(w.cobraEnLinea ? "tienda en línea con cobro" : "tienda en línea sin cobro automático");
  if (w.metodosPago.length) hechos.push(`pagos: ${w.metodosPago.join(", ")}`);
  return hechos;
}

function lineaMontado(h: Hallazgos): string {
  const w = h.web;
  if (w && WEB_NO_ABRE.has(w.estado)) return "Su dirección web hoy no abre.";
  if (w && w.estado === "en_mantenimiento") return "Su página está en mantenimiento.";
  if (w && w.estado === "desconocida") return "No se pudo leer la web; se mantiene como web existente.";
  if (w && w.estado === "viva") {
    const hechos = hechosDeWeb(w);
    return hechos.length ? `Tiene web: ${hechos.join("; ")}.` : "Tiene web, sin señales claras de reservas, pedidos ni cobro.";
  }
  const redes = [h.base.instagram && `Instagram ${h.base.instagram}`, h.base.facebook && "Facebook"].filter(Boolean);
  return redes.length ? `Sin web propia; atiende por ${redes.join(" y ")}.` : "Sin web ni redes registradas.";
}

function lineaFuga(h: Hallazgos, arq: string): string {
  const regla = reglaDeGancho(h, arq);
  const fugas: Record<Regla, string> = {
    mantenimiento: "Fuga probable: mientras la página está en mantenimiento nadie puede reservar o comprar.",
    web_caida: "Fuga probable: quien la busca no encuentra dónde reservar o comprar.",
    whatsapp: "Fuga probable: la confirmación y el cobro dependen de que alguien conteste a mano.",
    tienda_a_mano: "Fuga probable: cada pago móvil se revisa en el banco a mano.",
    carta_pdf: "Fuga probable: el pedido se copia a mano desde la carta.",
    motor: "Fuga probable: comisión por reserva y cobro fuera de la tasa del día.",
    sedes: "Fuga probable: cada sede se lleva por separado.",
    instagram: "Fuga probable: las ventas dependen de que alguien conteste el mensaje.",
  };
  return regla ? fugas[regla] : "";
}

export function armarResumen(h: Hallazgos, arquetipo: string, ciudad: string): string {
  const que = NOMBRE_ARQUETIPO[arquetipo] ?? "negocio";
  const detalle = [h.base.tipo, h.base.tamano].filter(Boolean).join(", ");
  const l1 = `${que[0].toUpperCase()}${que.slice(1)}${ciudad ? ` en ${ciudad}` : ""}${detalle ? ` (${detalle})` : ""}.`;
  const lineas = [l1, lineaMontado(h)];
  const fuga = lineaFuga(h, arquetipo);
  if (fuga && h.web?.nombreCoincide !== false) lineas.push(fuga);
  if (h.web?.nombreCoincide === false) lineas.push("La web no coincide con el nombre del negocio: revisar antes de usarla.");
  return lineas.slice(0, 4).join("\n");
}

// ---------- estado de la ficha ----------

function webSinSenales(w: HallazgosWeb): boolean {
  return !w.titulo && !w.descripcion && !w.plataforma && !w.reservaPorWhatsApp && !w.pedidoPorWhatsApp && !w.tieneReservasEnLinea
    && !w.tieneTiendaEnLinea && !w.cobraEnLinea && !w.tieneMenuOCatalogo && !w.menuEnPdf && !w.motorExterno
    && w.metodosPago.length === 0 && !w.horario && !w.direccion && w.redes.length === 0;
}

export function estadoDeFicha(h: Hallazgos, gancho: string): EstadoFicha {
  const w = h.web && h.web.estado !== "sin_web" && (h.web.estado !== "viva" || !webSinSenales(h.web)) ? h.web : undefined;
  if (w && w.nombreCoincide === false) return "borrador";
  // No se pudo leer la web: se trata como web existente sin hallazgos, lista para el correo sin gancho de web.
  if (w && w.estado === "desconocida") return "lista";
  if (gancho.trim() || (w && w.estado === "viva")) return "lista";
  if (w || h.overture) return "lista";
  return "sin_hallazgos";
}

// ---------- universo ----------

export type FilaUniverso = {
  id: number; email: string; nombre: string; ciudad: string; etapa: string; esLead: boolean; fuenteLead: string;
  web: string; whatsapp: string; instagram: string; facebook: string; telefono: string; nota: string;
};

export function normalizarCorreo(e: string): string {
  return (e ?? "").toLowerCase().replace(/\s+/g, "");
}

function completitud(f: FilaUniverso): number {
  return [f.web, f.whatsapp, f.instagram, f.facebook, f.telefono, f.nota].filter((v) => (v ?? "").trim() !== "").length;
}

// Reglas de correo compartidas por la depuracion del universo y el envio a mano: invalido, generico, del Estado, Colombia.
export function motivoDeCorreo(correo: string, ciudad: string, pais: (c: string) => "VE" | "CO"): string {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return "correo_invalido";
  if (/(^|[^a-z])(no-?reply|noreply)|@(.*\.)?example\./.test(correo)) return "correo_generico";
  if (/\.gob\.ve$|\.gov\.ve$/.test(correo.split("@")[1])) return "correo_estado";
  if (pais(ciudad) === "CO") return "colombia";
  return "";
}

function motivoDeExclusion(f: FilaUniverso, correo: string, pais: (c: string) => "VE" | "CO"): string {
  const m = motivoDeCorreo(correo, f.ciudad, pais);
  if (m) return m;
  if (f.esLead && f.fuenteLead !== "directorio") return "lead_propio";
  if (f.etapa !== "por_contactar") return "etapa";
  return "";
}

export function depurarUniverso(filas: FilaUniverso[], pais: (ciudad: string) => "VE" | "CO"): {
  cola: FilaUniverso[]; duplicadas: { id: number; principalId: number }[]; excluidas: { id: number; motivo: string }[];
} {
  const excluidas: { id: number; motivo: string }[] = [];
  const grupos = new Map<string, FilaUniverso[]>();
  for (const f of filas) {
    const correo = normalizarCorreo(f.email);
    const motivo = motivoDeExclusion(f, correo, pais);
    if (motivo) { excluidas.push({ id: f.id, motivo }); continue; }
    grupos.set(correo, [...(grupos.get(correo) ?? []), f]);
  }
  const cola: FilaUniverso[] = [];
  const duplicadas: { id: number; principalId: number }[] = [];
  for (const grupo of grupos.values()) {
    const ordenado = [...grupo].sort((a, b) => completitud(b) - completitud(a) || a.id - b.id);
    cola.push(ordenado[0]);
    for (const otra of ordenado.slice(1)) duplicadas.push({ id: otra.id, principalId: ordenado[0].id });
  }
  duplicadas.sort((a, b) => a.id - b.id);
  return { cola: cola.sort((a, b) => a.id - b.id), duplicadas, excluidas };
}
