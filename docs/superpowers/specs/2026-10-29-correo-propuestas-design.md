# Propuesta por correo, personalizada, desde el panel (diseño)

Fecha: 2026-10-29. Pedido de Neri: «diseñar la plantilla de email con diseño que le vamos a enviar a cada
prospecto por correo, personalizado y con el PDF de la propuesta de su nicho y la información que tengamos de
su negocio […] analizar cada prospecto con correo, investigarlo bien, armar una ficha de su negocio […] y le
armamos el PDF para enviárselo desde el mismo panel; dejar todo listo para yo darle solo a enviar».

## Intención y por qué

Hoy la prospección del panel es por WhatsApp. Hay 326 filas con correo publicado por el propio negocio que
nunca se han tocado. Con los últimos prospectos aprendimos que lo que mueve es que el negocio se sienta leído
(James Bark: «esto está increíble» cuando vio su tienda) y que el siguiente paso sea gratis y sin reunión
(diagnóstico por escrito + demostración con su marca). El correo permite mandar la propuesta completa (PDF)
con una carta que demuestre que miramos su negocio, y queda registrado en el panel como cualquier contacto.

## Metas

1. Una **ficha de negocio** por prospecto con correo, investigada con fuentes verificables (su web, Overture,
   lo que ya hay en la base), guardada en el panel y editable por Neri.
2. Un **gancho personalizado** («Vi que…») sacado de esa ficha, que entra en la carta del PDF y en el correo.
3. Un **correo con diseño** (marca NERACOSU, se lee bien en Gmail del teléfono), con el PDF adjunto y el
   enlace a la propuesta en línea, en texto de usted y con el enganche actual.
4. **Envío desde el panel**: automático y goteado para todo lo que ya está en la base (decisión de Neri, 29-oct) y
   un botón «Enviar» con vista previa para los prospectos que entren después; registrado como evento, con etapa y
   seguimiento como el WhatsApp.
5. **Rastreo por correo enviado** (pedido de Neri, 29-oct): cuántos abrieron el correo, cuántos vieron la propuesta en
   línea, cuántos descargaron el PDF y cuántos respondieron, por correo y en total.
6. Todo listo antes de que Neri entre: fichas generadas, correos armados, cola ordenada por calidad.

## No metas y anti-metas

- **No** envío masivo de un golpe: el envío automático (pedido de Neri el 29-oct, ver §4b) sale **goteado**, dentro
  del tope diario y en horario laboral de Caracas, y se apaga con un interruptor. Protege la reputación del dominio
  (ver Entregabilidad).
- **No** se inventa nada en la ficha ni en el gancho: cada dato tiene su fuente. Si de un negocio solo
  sabemos nombre, ciudad y rubro, el correo va sin «Vi que…» y lo dice el estado de la ficha («sin hallazgos»).
- **No** se mandan correos a direcciones del Estado (`gob.ve`, 10 filas) ni genéricas.
- **No** se cambia el fondo de las propuestas: el PDF es el de su arquetipo (ya personaliza nombre, ciudad,
  con/sin web, país, promoción) más el párrafo del gancho.
- **Anti-meta:** un correo que suene a envío automático. Si el gancho no aporta, mejor sin gancho.
- **Anti-meta:** reseñas inventadas o «resumidas» sin fuente. Hoy no tenemos una fuente fiable de reseñas (ver
  Decisiones de Neri).

## Lo que hay (verificado el 29-oct)

- **Universo:** 326 prospectos con `email` (325 por contactar). Por arquetipo: citas 97, restaurantes 74,
  hoteles de estadía 63, comercio 49, hoteles 18, reservas 15. Con web 218, con Instagram 136, con nota 283,
  sin web ni redes 46. Origen: Overpass 254, importados 70, manuales 2.
- **Depuración:** 10 filas con correo `gob.ve` (Misión Nevado, Venetur) se excluyen. Quedan 316 filas con
  **286 correos distintos**: 25 correos los comparten dos o más filas (sucursales o duplicados con nombre
  distinto). A un correo se le manda **una** propuesta: la del prospecto más completo; las otras filas quedan
  con la nota «mismo correo que #id» y no entran en la cola.
- **Los 2 leads con correo** (Hotel Alto Mar, Escuda) ya tienen propuesta hecha a mano: no entran.
- **Correo saliente:** no hay SMTP configurado ni hace falta. El panel ya manda los avisos por el `sendmail`
  local (exim de cPanel) desde `info@neracosu.com` (`src/lib/correo.ts`), y `info@` es un buzón real del
  servidor que reenvía al Gmail de Neri. DNS: SPF con la IP del servidor (94.72.127.96), DKIM publicado
  (`default._domainkey`), DMARC `p=quarantine`. El PTR de la IP es el genérico de Contabo; no lo cambiamos
  desde aquí (ver Entregabilidad).
- **PDF:** `/p/<codigo>/pdf` ya genera y cachea el PDF por hash del HTML (`generarPdf`), con un solo Chromium a
  la vez. El correo reutiliza esa misma función y ese caché.
- **Lectura de webs:** `red-segura.descargar` + `contactos-web-contrato.extraerContactos` ya leen una web con
  todas las protecciones (sin IPs privadas, plazo, tamaño). La investigación se apoya en eso.

## Diseño

### 1. Ficha de negocio (`FichaNegocio`)

Modelo nuevo, una por prospecto (`prospectoId` único):

| Campo | Qué guarda |
|---|---|
| `hallazgos` (Json) | Lo que se encontró, por fuente: `web` {url, titulo, descripcion, plataforma (WordPress, Shopify, Wix, Tiendanube, otra), paginasLeidas, tieneReservasEnLinea, tieneTiendaEnLinea, tieneMenuOCatalogo, reservaPorWhatsApp, metodosPagoMencionados (pago móvil, Zelle, transferencia, tarjeta, Cashea), horario, direccion, redesEnlazadas}, `overture` {direccion, categoriaBase, categoriaFina}, `base` {tipo, tamano, nota, instagram, facebook, telefono, whatsapp}. Solo claves con valor. |
| `fuentes` (Json) | Lista de URLs de donde salió cada hallazgo. |
| `resumen` (Text) | 2 a 4 líneas internas para Neri: qué es, qué tiene montado, dónde está la fuga probable. Generado por reglas (sin inventar), editable. |
| `gancho` (VarChar 400) | El párrafo «Vi que…» que va al PDF y al correo. Generado por reglas por arquetipo, editable. Vacío = sin gancho. |
| `estado` | `sin_hallazgos` \| `borrador` \| `lista` \| `revisada` (revisada = Neri la tocó o la aprobó). |
| `generadaEn`, `revisadaEn` | Fechas. |

**Investigación** (`scripts/investigar-prospectos.mts`, idempotente, `--aplicar`, una web a la vez con 3 s
entre sitios, por `red-segura`): para cada prospecto con correo válido lee la portada y hasta 3 páginas
internas enlazadas desde ella cuyo nombre sugiera contacto, menú/carta, reservas, servicios, tienda o
habitaciones; extrae título, meta descripción, plataforma (por marcas en el HTML), señales de reservas/tienda/
menú, métodos de pago mencionados, horario y dirección (texto visible), redes enlazadas; cruza con
`LugarOverture` por nombre+ciudad (como el cruce del 29-oct) para dirección y categoría; y toma lo que ya
hay en la base. Con eso arma `resumen` y `gancho` por reglas y guarda la ficha. Un prospecto sin web ni redes
queda `sin_hallazgos` con el resumen de lo que hay en la base. Deja un `Evento` `ficha_generada`.

**Reglas del gancho** (una o dos frases, de usted, en positivo, solo con hechos encontrados; el orden es la
prioridad):

- Reserva/cita/pedido por WhatsApp en la web → «Vi que en su página las reservas se piden por WhatsApp. Eso
  es justo lo que el sistema convierte en una reserva confirmada sola, con el anticipo validado.»
  (texto por arquetipo: citas → «la cita», restaurantes → «los pedidos», comercio → «los pedidos»).
- Tienda en línea que cobra a mano (Shopify/Woo/Tiendanube sin pasarela local) → «Vi que ya venden en línea
  por su página. Lo que le propongo es que el pago móvil se confirme solo dentro de esa misma tienda.»
- Menú/catálogo en PDF o imagen → «Vi que su carta está en PDF. Con el sistema, el cliente pide desde esa
  misma carta y la cocina lo recibe sin que nadie lo copie.»
- Varias sedes (en la nota o en la web) → frase de sucursales del arquetipo.
- Solo Instagram, sin web → «Vi que atienden por Instagram (@cuenta). El sistema le da una página propia que
  cobra sola, sin depender de que alguien conteste el mensaje.»
- Nada de lo anterior → sin gancho.

Cada gancho cita la fuente en la ficha (no en el correo). Pruebas con fixtures de HTML reales anonimizados.

### 2. El gancho dentro del PDF

`renderPropuesta` acepta `gancho?: string` y las nueve plantillas llevan, en la carta, el bloque
`<!--si:gancho--><p>{{gancho}}</p><!--fin:gancho-->` después del primer párrafo (se quita si no hay gancho,
como los bloques web/sinweb). `verificar-plantillas.mts` prueba también con un gancho de 400 caracteres: si la
hoja 2 se desborda, el gancho se acorta por reglas (máximo 280 caracteres) antes que tocar la maqueta. El PDF
cambia de hash cuando cambia el gancho, así que el caché se regenera solo.

### 3. El correo

- **Remitente:** `Neri Colón · NERACOSU <info@neracosu.com>`, `Reply-To: info@neracosu.com`. Sale por
  `sendmail` local con `-f info@neracosu.com` (exim firma DKIM). Se agrega `nodemailer` (transporte
  `sendmail`) solo para armar el MIME multipart (HTML + texto plano + PDF adjunto) sin escribirlo a mano.
  Fuera de producción no se manda (misma guarda que `avisarSolicitud`); en pruebas se captura el mensaje.
- **Asunto:** `Propuesta para {nombre}: {promesa del arquetipo}` (hoteles: «la caja y los turnos cerrados
  cada día»; estadía: «reservas que se cobran solas por WhatsApp»; restaurantes: «comandas y caja sin
  cuaderno»; comercio: «inventario que cuadra y tienda que cobra sola»; reservas: «reservas con anticipo que
  no se caen»; cobros: «mensualidades que se cobran solas»; citas: «su agenda, con el precio ya definido»).
- **Cuerpo HTML** (tabla de 600 px, CSS en línea, sin imágenes remotas: el logotipo es texto «NERACOSU.» con el
  punto en `#5ed29c`; colores de las propuestas: tinta `#1a1d1c`, sello `#1f5a45`, fondo `#f1f4f2`; Georgia
  para títulos y Arial para el cuerpo, porque las fuentes propias no cargan en correo):
  1. Cabecera con el logotipo y «Propuesta para {nombre}».
  2. «Estimado equipo de {nombre}:» + un párrafo de quién soy con la credencial del arquetipo (las mismas
     frases verificadas de los mensajes de WhatsApp).
  3. El gancho, si lo hay.
  4. Qué le mando: «Le adjunto la propuesta en PDF ({hojas} hojas) y aquí la puede leer en el teléfono:
     {enlace /p/codigo}» con un botón «Ver la propuesta».
  5. El enganche: «Si me cuenta en dos líneas {pregunta del arquetipo}, le respondo yo con un diagnóstico
     gratis por escrito y, cuando el caso lo permite, una demostración con su marca para que la vea en su
     teléfono antes de pagar nada.» (citas: la versión sin demostración). Botón «Responder por WhatsApp»
     (`wa.me` con texto listo) y la nota de que también puede responder este correo.
  6. Promoción, solo mientras `hoy <= PROMO_HASTA`: una línea.
  7. Firma: Ing. Neri Colón · NERACOSU · neracosu.com · WhatsApp.
  8. Pie pequeño: «Le escribo porque {nombre} publica este correo en {su página / un directorio}. Si prefiere
     no recibir más correos míos, respóndame "no" y no vuelvo a escribir.» (honesto, y lo que piden Gmail y
     la ley de datos; además reduce marcas de spam).
- **Texto plano:** el mismo contenido sin HTML, generado del mismo contrato.
- **Adjunto:** `Propuesta-NERACOSU-{nombre}.pdf` (el mismo nombre que la descarga). Tamaño hoy ~400 KB.
- Todo lo que entra en una cabecera pasa por `limpiarCabecera`.

### 4. En el panel

- **Sección `/correos`** (solo `dueno`; entra en la barra lateral debajo de Directorio y en la hoja «Más»
  del teléfono): la cola de correo. Filas: nombre, ciudad, arquetipo, correo, estado de la ficha, gancho
  (recortado), estado del envío (lista / enviado {fecha} / abrió / respondió). Orden: primero las fichas con
  gancho, luego por arquetipo con más señal de compra (comercio y restaurantes con web, hoteles de estadía
  con reservas por WhatsApp), luego el resto. Filtros por arquetipo y estado. Contador arriba: «{n} listas,
  {m} enviadas hoy de {tope}».
- **Vista previa** (hoja lateral en escritorio, pantalla en teléfono): asunto, el HTML tal cual saldrá, enlace
  al PDF, la ficha debajo (resumen, hallazgos, fuentes) con **gancho y resumen editables** en el sitio. Botón
  **Enviar** (uno a uno). Después de enviar: la fila pasa a «enviado», la etapa del prospecto a `enviado`,
  `proximoSeguimiento` a hoy + `diasSeguimiento`, y queda `Evento` `correo_enviado` (canal `email`, texto =
  asunto). Un segundo envío al mismo prospecto pide confirmación («ya se le envió el {fecha}»).
- **Tope diario** en Ajustes (`correos_por_dia`, por defecto 15): al llegar, el botón se deshabilita con el
  motivo. Es un freno de reputación, no un límite técnico.
- **Ficha del prospecto** (`/prospectos/[id]`): bloque «Lo que sabemos del negocio» con la ficha (editable) y
  el botón «Enviar propuesta por correo» que abre la misma vista previa. También «Volver a investigar».
- **Rebotes y «no»:** llegan a `info@` (los ve Neri en Gmail). Desde `/correos` o la ficha, Neri marca «Rebotó» o «No
  quiere correo»: la dirección entra en `CorreoBloqueado` (correo único, motivo, fecha) y ninguna fila con esa
  dirección vuelve a salir en la cola ni admite reenvío, aunque sea otra sucursal. El `email` del prospecto no se
  borra (es un dato con fuente). Leer el buzón para marcarlo solo queda fuera de esta versión.
- **Seguimiento:** a los `diasSeguimiento` sin respuesta ni apertura, la fila aparece en `/correos` como «toca
  seguimiento» con dos salidas: WhatsApp con el `mensajeSeguimiento` del nicho si el prospecto tiene WhatsApp, o un
  **segundo correo corto** (asunto «Le reenvío la propuesta para {nombre}», tres líneas, sin adjunto, con el enlace).
  Los enviados por correo **no** entran en `seguimientosQueTocan` del prospectador (filtro por evento con canal
  `email`): viven en `/correos`. No hay tercer toque en esta versión.
- La búsqueda global y el Inicio no cambian.

### 4b. Envío automático (decisión de Neri, 29-oct)

- **Interruptor** en Ajustes (`correos_automatico`: `on`/`off`, por defecto `on` al desplegar, tras revisar con Neri
  la muestra de 20 fichas) y **tope diario** `correos_por_dia` (por defecto **25**; Neri pidió «un poquito más» que
  15; recomendación: una semana en 25 y, sin rebotes ni quejas, subir a 40).
- **Goteo:** una ruta interna `POST /api/correos/automatico` (cabecera `x-cron-secret` = `PROSPECTOS_CRON_SECRET` del
  env; sin ella 404) manda **un lote pequeño** por llamada: `ceil(tope / 8)` correos, solo de lunes a viernes entre las
  09:00 y las 17:00 de Caracas, hasta completar el tope del día. La llama el crontab de cPanel cada hora con `curl`.
  No va en `src/instrumentation.ts`: su cadena de imports no admite `node:` y el envío lo usa (nodemailer).
- **Qué entra al automático:** la cola de §4 con ficha en estado `lista` o `revisada` (con o sin gancho), **nunca** una
  ficha `nombreNoCoincide` ni una dirección en `CorreoBloqueado`; orden: primero las fichas con gancho. Los prospectos
  que entren al directorio **después** del despliegue no entran al automático: se les investiga y se les manda a mano
  desde `/correos` (botón «Enviar»), salvo que Neri los marque «al automático» en la ficha.
- Cada llamada deja una línea `[correos] <fecha hora>: N enviados, M del día, tope T` en el log de PM2; si una
  dirección falla en sendmail se registra el evento `correo_fallido` y la fila queda para reintento manual.
- En `/correos`, arriba: estado del automático (encendido, enviados hoy / tope, próximo lote) y el botón de pausa.

### 4c. Rastreo

- Modelo `EnvioCorreo`: `id`, `prospectoId`, `token` (22 caracteres base64url, único), `tipo` (`inicial` |
  `seguimiento`), `asunto`, `para`, `enviadoEn`, `abiertoEn` (primera vez), `aperturas`, `clicEn` (primera vez),
  `clics`, `pdfEn` (primera vez), `pdfs`, `fallo` (texto, vacío si salió).
- **Apertura:** imagen de 1×1 `GET /api/correo/a/<token>.png` al final del HTML (la única imagen remota del correo).
  Suma `aperturas` y fija `abiertoEn`; deja evento `correo_abierto` solo la primera vez.
- **Vio la propuesta:** el botón «Ver la propuesta» apunta a `GET /r/<token>` que suma `clics`, fija `clicEn`, deja
  evento `correo_clic` (primera vez) y redirige a `/p/<codigo>?e=<token>`; `/p/<codigo>` sigue dejando `abierto`.
- **Descargó el PDF:** el enlace al PDF del correo y el botón del documento en línea llevan `?e=<token>`;
  `/p/<codigo>/pdf` con `e` válido suma `pdfs`, fija `pdfEn` y deja evento `pdf_descargado` (primera vez). Sin `e`
  (descarga desde el panel) no cuenta.
- **Respondió:** lo marca Neri («Respondió», ya existe) o llega una solicitud web del mismo correo; cuenta por etapa.
- Ninguno de los tres endpoints exige sesión ni expone datos: con token inválido responden la imagen vacía / 404.
  Los pedidos con sesión del panel (Neri probando) no cuentan, como en `/p/<codigo>`.
- **Cifras en `/correos`:** enviados · abrieron el correo · vieron la propuesta · descargaron el PDF · respondieron,
  con porcentaje sobre enviados, para el total y por arquetipo; y en cada fila los cuatro hitos con su fecha. La
  ficha del prospecto muestra los eventos en el historial.

### 5. Entregabilidad (lo que protege el dominio)

- Goteado, con tope diario de 25 la primera semana; si no hay rebotes ni quejas, Neri lo sube desde Ajustes.
- DKIM, SPF y DMARC ya están. El PTR genérico de Contabo es un punto en contra menor; cambiarlo es un ajuste
  en el panel de Contabo (PTR → `mail.neracosu.com`), lo anotamos para Neri.
- Contenido: texto real, un solo enlace al panel y uno a WhatsApp, sin acortadores, sin imágenes remotas, pie
  con el porqué y la salida.
- Rastreo con píxel y enlaces con token (§4c), porque Neri lo pidió; se dice con honestidad en el panel que la
  apertura por píxel es aproximada (Gmail la carga por su proxy y algunos clientes la bloquean).

### 6. Fases publicables

1. **Fichas:** modelo + migración, script de investigación, bloque en la ficha del prospecto. Correr la
   investigación sobre los 286 y revisar una muestra de 20 fichas por arquetipo a mano antes de seguir.
2. **Gancho en el PDF:** token, bloque en las nueve plantillas, verificador con gancho largo.
3. **Correo, rastreo y cola:** contrato del correo, envío, rastreo (`EnvioCorreo`, píxel, `/r/<token>`, PDF con `e`),
   `/correos` con cifras, vista previa, tope, eventos, Ajustes, envío automático por cron.
4. **Despliegue y arranque:** build, `pm2 restart prospectos`, crontab, los primeros 10 envíos a mano con Neri
   mirando la vista previa, y entonces el automático encendido; memoria y CLAUDE.md al día.

### 7. Pruebas

- Unitarias (vitest): reglas del gancho y del resumen con fixtures de HTML (restaurante con carta en PDF,
  tienda Shopify, hotel con reservas por WhatsApp, consultorio sin web); armado del correo (asunto, HTML, texto
  plano, cabeceras limpias, sin `{tokens}`, con y sin gancho/promoción, VE y CO); `renderPropuesta` con y sin
  gancho; la acción de envío con el transporte capturado (crea evento, cambia etapa, respeta el tope y la
  confirmación de reenvío; no manda fuera de producción); depuración del universo (gob.ve fuera, un correo
  por dirección, leads fuera).
- Verificador de plantillas con gancho de 400 caracteres en las nueve.
- Recorrido Playwright `scripts/verificar-correos.mts` contra el clon (`~/dev-clon-prospectos`, base de
  tests): abrir `/correos`, abrir una vista previa, editar el gancho, enviar, ver la fila en «enviado» y el
  evento en la ficha; a 390 px y a 1280 px.

## Respuestas a la revisión de constructor (29-oct, decisiones mías; Neri puede cambiarlas)

1. **Universo hacia adelante y convivencia con la cola de WhatsApp.** `/correos` toma solo filas del directorio
   (`DEL_DIRECTORIO`) en `por_contactar`, sin ningún evento `enviado` previo y con correo no bloqueado. Al enviar, la
   etapa pasa a `enviado`, así que la fila sale de la cola de WhatsApp: **un negocio, un canal, un primer toque**.
   Quien ya recibió WhatsApp no recibe el correo como refuerzo. Las filas duplicadas por correo pasan a `descartado`
   con motivo «mismo correo que #id» en la depuración (evento `nota`; reversible desde la ficha).
2. **El evento es `enviado` con canal `email`**, no un tipo nuevo: así `fechaDePropuesta` congela la fecha y la
   vigencia del PDF y de `/p/<codigo>` el día del envío, y el envío cuenta para la meta diaria del Inicio.
3. **Un correo enviado no asciende el prospecto a lead.** Asciende cuando Neri marca «Respondió» (una conversación
   real, como define la fase 2). `marcarEnviado` no se reutiliza para el correo: acción propia `enviarPropuestaCorreo`.
4. **Colombia fuera de esta versión:** hoy no hay ningún prospecto colombiano con correo (verificado); la depuración
   excluye `paisDeCiudad === "CO"` y lo dice en el contador.
5. **Mapa regla de gancho × arquetipo** (fuera de la tabla no se genera gancho):

   | Regla | Arquetipos | Nota |
   |---|---|---|
   | Reserva, pedido o cita por WhatsApp en la web | estadía, reservas, restaurantes; citas con la versión honesta («Vi que hoy la cita se pide por WhatsApp y se confirma a mano»; sin prometer la agenda) | nunca hoteles de paso |
   | Tienda en línea que cobra a mano | comercio | plataforma detectada y sin pasarela local |
   | Carta o catálogo en PDF o imagen | restaurantes (carta), comercio (catálogo) | |
   | Motor de reservas externo (Cloudbeds, Booking) | estadía | el argumento es Bs a tasa, caja local y sin comisión; no «reemplace su motor» |
   | Varias sedes | todos menos hoteles de paso | |
   | Solo Instagram, sin web | comercio, restaurantes, citas, reservas, estadía | |
   | **Web caída, dominio vencido o en venta** (nuevo, de la muestra del 29-oct: 4 de 16) | todos | «Vi que su dirección web hoy no abre»; el PDF va como *sin web* |

   La muestra también mostró webs «en mantención», dominios de Wix sin conectar, enlaces de Linktree o Instagram
   puestos como web y nombres que no coinciden con la web (fila «Chino» → web «Da Guido»): la investigación marca
   `webViva`, `webEsRedSocial` y `nombreNoCoincide`, y con nombre que no coincide **no** se genera gancho ni se
   manda sin que Neri revise la ficha.
6. **Credencial y promesa por arquetipo** viven como lista fija en `mensajes-nicho-contrato.ts` (`CREDENCIAL_POR_ARQUETIPO`,
   `PROMESA_POR_ARQUETIPO`), copiadas de las frases ya verificadas de la semilla; no se recortan de la base editable.
7. **Gancho en la hoja 2 de comercio y reservas:** si el verificador dice que no cabe ni a 280 caracteres, esos dos
   arquetipos llevan el gancho en el correo y en la propuesta en línea, y el PDF sale sin él. No se toca la carta.
8. **El PDF se pregenera** al construir la cola (como `generar-propuestas.mts`) y al guardar un gancho editado, para
   que «Enviar» no espere a Chromium ni choque con `PDF_OCUPADO`. `/p/<codigo>` (route) y `pdf/route.ts` leen
   `FichaNegocio` para el gancho en línea.
9. El script del cruce con Overture ya está rescatado en `scripts/_cruzar.mts` (sin commitear).
10. **Prueba del 29-oct:** se mandó a Neri un correo real (hotel de estadía con gancho verdadero, PDF de 1 MB con el
    gancho en la carta) por el sendmail del servidor; la maqueta de esa prueba es la base de la fase 3.

## Decisiones de Neri (cambian lo que se construye)

Neri aprobó el diseño el 29-oct («está perfecto, aprobado») y sumó el envío automático y el rastreo (§4b y §4c).

1. **Reseñas.** No hay fuente gratuita y lícita de reseñas de Google. Opciones: (a) sin reseñas en esta
   versión (la ficha se arma con web, Overture y la base); (b) Google Places API con una clave de Neri con
   facturación: unas 300 consultas de «detalles del lugar» salen en el orden de USD 5 a 10 y traen puntuación,
   cantidad de reseñas y las 5 más relevantes. El diseño deja el hueco (`hallazgos.resenas`) para la (b).
2. **Remitente.** Propongo `info@neracosu.com` por el servidor (ya firma DKIM, nada que configurar; la prueba del
   29-oct a su Gmail salió así). La otra
   opción es su Gmail por SMTP con contraseña de aplicación: la respuesta le llegaría al mismo hilo de Gmail,
   pero hay que guardar esa contraseña en el servidor y Gmail limita a ~500 al día.
3. **Tope diario** de arranque: 25 (Neri, 29-oct: «un poquito más» que 15).

## Lo que decide el constructor

- Cómo detectar plataforma y señales en el HTML (marcas de Shopify, WooCommerce, Wix, Tiendanube, enlaces
  `wa.me`, `.pdf` en enlaces de «menú/carta»), y el orden de las páginas internas a leer.
- La maqueta exacta del correo dentro de las reglas de arriba (probarla en Gmail web y Gmail del teléfono con
  un envío a `info@`).
- Dónde vive la lista de promesas por arquetipo (junto a `PREGUNTA_POR_ARQUETIPO` en
  `mensajes-nicho-contrato.ts`).
- La migración (manual, como las anteriores) y el nombre del ajuste del tope.

## Referencias

- Reglas de contenido: `CLAUDE.md` del panel (propuestas, enganche del 29-oct) y del sitio.
- Correo actual: `src/lib/correo.ts`. PDF: `src/lib/propuesta.ts`, `src/app/p/[codigo]/pdf/route.ts`.
- Lectura de webs: `scripts/leer-webs.mts`, `src/lib/red-segura.ts`, `src/lib/contactos-web-contrato.ts`.
- Cruce con Overture: scratchpad `cruzar-overture.mts` de la sesión del 29-oct (copiar a `scripts/_cruzar.mts`).
