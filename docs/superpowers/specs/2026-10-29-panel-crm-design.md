# Panel de prospección: de cola de WhatsApp a CRM de Neri

**Fecha:** 2026-10-29 · **Dueño:** Neri Colón · **Estado:** diseño para corregir, nada construido.

## Por qué

Neri (2026-10-28): el panel «no tiene pies ni cabeza, la navegación es pésima, no tiene nada de
experiencia de usuario ni es intuitiva y hay opciones como complicadas; no parece un dashboard serio ni
se acerca a un CRM; todo está como en vertical y confunde mucho».

Lo que hay detrás no es solo visual. Los datos reales del panel al 29-oct: **4.172 prospectos, 4.171
«por contactar» y 1 «enviado»; 0 clientes, 0 proyectos, 0 cobros, 0 solicitudes**. El panel está
construido alrededor de una **cola de prospección masiva por WhatsApp** (10 hoteles al día, «¿se
envió?», seguimiento a los 3 días) que Neri no está usando, y **no contiene los prospectos reales**: los
que llegaron por la web, por ChatGPT, por WhatsApp o por referidos (una docena de carpetas en
`~/propuestas/`: marca de ropa con 13 locales, hotel de Catia La Mar, concesionario de motos, cadena de
farmacias, un estudiante…) viven en la memoria de las sesiones y en archivos, no en el panel. Y las
solicitudes de la web y del embudo `/empezar` caen en `/web`, debajo de un párrafo, al final de un
enlace que sale de una tarjeta de Hoy.

Además, **no existe ninguna disposición para pantalla ancha**: una sola columna de 640 px con la barra
inferior también en escritorio, formularios siempre abiertos (Ajustes son unos 25 formularios
apilados, uno por nicho) y listas sin tope (historial, solicitudes, 100 filas por página).

Entonces el rediseño tiene dos partes que van juntas: **poner el trabajo real de Neri en el centro**
(sus leads, sus solicitudes, su dinero) y **darle al panel una estructura de CRM** (inicio con cifras,
embudo visible de un vistazo, tablas en escritorio, formularios detrás de botones).

## Para quién y cómo lo usa

- **Neri, dueño**, desde el teléfono en la calle y desde el escritorio cuando trabaja. En el teléfono
  quiere responder rápido a quien escribió y saber qué toca hoy; en el escritorio quiere ver todo el
  embudo y el dinero sin desplazarse.
- **Un prospectador de confianza** (rol ya existente) que trabaja el directorio: busca, importa, manda
  el primer mensaje. No ve clientes, proyectos ni cobros.
- Los clientes tienen su portal aparte (`/c/`), que no cambia.

Éxito, en palabras llanas: Neri abre el panel y **en cinco segundos sabe a quién debe escribir hoy,
qué solicitud nueva llegó y qué cobro vence**; en el escritorio **ve el embudo completo en una
pantalla**; y **sus prospectos reales están ahí**, con su próximo paso y su propuesta enlazada.

## Lo que no es

- No es otro producto ni una herramienta para terceros: sigue siendo el panel de Neri.
- No cambia las reglas de negocio ni las transiciones de etapa; no borra la prospección masiva ni la
  bandeja de importación: las **mueve a su sitio** (Directorio).
- No mete librerías de interfaz (nada de MUI, shadcn, Tailwind, Chakra): sigue CSS propio.
- No abandona el teléfono: todo sigue cabiendo a 390 px. Lo que suma es el escritorio.
- No hay arrastrar y soltar en las primeras fases: el embudo se mueve con botones, que funcionan igual
  con una mano. El arrastre es un pulido posterior.
- No se rehace lo que ya funciona bien (optimismo, deshacer, pregunta «¿se envió?», portal del cliente,
  recibos): se reubica.

## La idea en una frase

**Dos cosas distintas que hoy están mezcladas: «leads» (conversaciones reales con alguien que puede
comprar) y «directorio» (filas importadas para prospección masiva).** El panel gira alrededor de los
primeros; el directorio es una sección de trabajo, no la portada.

## Estructura y navegación

### Secciones

| Sección | Qué tiene | Quién |
|---|---|---|
| **Inicio** | Cifras del día y «lo que toca hoy» | los dos |
| **Leads** | El embudo de conversaciones reales: lista (teléfono) o tablero por etapas (escritorio); la ficha del lead | los dos (el prospectador ve solo los suyos del directorio) |
| **Solicitudes** | Lo que llega de la web y de `/empezar`: convertir en lead o archivar | dueño |
| **Clientes y proyectos** | Tabla de proyectos, fichas, clientes | dueño |
| **Cobros** | Por cobrar este mes, vencidos, pagados; marcar pagado, recordar, recibo | dueño |
| **Directorio** | La prospección masiva: cola del día, lista de 4.000 con filtros, Buscar, Importar, Bandeja | los dos |
| **Web** | Solo medición (visitas, embudo de `/empezar`, orígenes) | dueño |
| **Ajustes** | Usuarios, mensajes por nicho, cobros, emisor, PIN, en acordeón con índice | dueño |

### Escritorio (≥ 1024 px)

Barra lateral fija a la izquierda (240 px) con las ocho secciones, el logotipo arriba y el usuario
abajo. Contenido hasta 1280 px, con **cabecera de página** fija: título, cifra o filtro clave y la
acción principal a la derecha («Nuevo lead», «Nuevo proyecto»). Las listas son **tablas** (fila de
48 px, cabecera pegajosa, columnas alineadas: texto a la izquierda, dinero y fechas a la derecha con
cifras tabulares). Las fichas van **a dos columnas**: datos y acciones a la izquierda, historial a la
derecha. Un atajo global de búsqueda (Ctrl+K) que busca leads, directorio, clientes y proyectos
(fase de pulido).

### Teléfono (< 1024 px)

Barra inferior de cinco: **Inicio · Leads · Solicitudes · Cobros · Más** (Más abre una hoja con
Clientes y proyectos, Directorio, Web, Ajustes). Para el prospectador: **Inicio · Leads · Directorio ·
Buscar · Mi PIN**. Las tablas se vuelven listas de filas de una línea y media (nombre, dato clave a la
derecha), **no** tarjetas con cinco botones: la acción principal aparece al abrir la fila. Los
formularios de alta y los historiales van **detrás de un botón o plegados** (`<details>`), nunca
abiertos por defecto.

### Jerarquía visual

Se mantienen los tokens de la pasada de septiembre (fondo `#121614`, superficies por luminosidad, verde
solo para la acción principal y el dinero, Source Sans 3, cifras tabulares). Se añaden: tres niveles de
título (24 / 18 / 15 px), densidad de escritorio (14 px en tablas), y menos tarjetas: una tarjeta es
una unidad de contenido, no un envoltorio de todo. Nada de tarjetas dentro de tarjetas.

## Pantallas

### Inicio

Arriba, **cuatro cifras** en una fila (en el teléfono, dos y dos): leads activos (y cuántos con el
siguiente paso vencido), solicitudes sin atender, por cobrar este mes (y vencido en rojo), personas en
la web en 7 días. Cada cifra es un enlace a su sección.

Debajo, **«Hoy»**: una sola lista, ordenada por fecha, de lo que toca: leads con próximo paso para hoy
o vencido, cobros que vencen esta semana, hitos con fecha. Cada fila: qué, de quién, cuándo, y un botón
(WhatsApp o «Pagado»). Si no hay nada: «Nada pendiente. Las solicitudes nuevas están en Solicitudes».

Después, **«Últimas solicitudes»** (tres, con «Ver todas»). La cola del directorio («10 para escribir
hoy») **sale de Inicio** y vive en Directorio; el prospectador, que es quien la trabaja, la ve en su
Inicio en lugar de las cifras de dinero.

### Leads

Un lead es un `Prospecto` con conversación real. Mismo modelo, con cinco campos nuevos:
`esLead` (booleano), `fuenteLead` (`web`, `embudo`, `whatsapp`, `instagram`, `referido`,
`directorio`, `otro`), `valorEstimado` (decimal, opcional; el pago único de la propuesta), `proximoPaso`
(texto corto: «mandar propuesta», «esperar su plan», «armar demo») y `propuestaUrl` (enlace a la
propuesta o al prototipo). `proximoSeguimiento` ya existe y es la fecha del próximo paso.

Regla de clasificación: origen `manual` o el origen nuevo `solicitud` (creado desde una solicitud) →
lead. Todo lo que entra por la bandeja (`importado`, `overpass`, `overture`, `web` que aquí significa
«lectura de web», `maps`) → directorio, **hasta que pase de «por contactar»** (al marcar enviado, se
vuelve lead con `fuenteLead = directorio`). Migración de datos: las filas existentes con etapa ≠
`por_contactar` u origen `manual` pasan a lead; el resto queda en directorio.

**Nicho:** `nichoId` sigue siendo obligatorio. Se siembra un nicho comodín **«Otro»** (slug `otro`,
mensaje inicial y de seguimiento genéricos, sin plantilla de propuesta, sin etiquetas OSM, fuera de
las reglas de Overture) para los leads que no encajan en los 19 (un estudiante, una marca de ropa en
Shopify). El nicho de un lead se puede cambiar después desde la ficha.

**Ciudad y duplicados:** para un lead la ciudad es opcional (el formulario corto la pide, pero no la
exige); sin ciudad, el país es Venezuela. La clave de duplicado de un lead es `nombre|ciudad|contacto`
(el WhatsApp o el correo), para que dos personas con el mismo nombre no choquen; el directorio sigue
con `nombre|ciudad`.

Etapas: los mismos seis valores en la base, con **etiquetas de lead**: Nuevo · Propuesta enviada ·
Conversando · Demo o diagnóstico · Ganado · Descartado. («Reunión» deja de llamarse así: Neri no hace
llamadas; esa etapa es la demostración con su marca o el diagnóstico.) **Los leads tienen su propia
tabla de transiciones**, porque una conversación real no sigue el orden de la cola masiva: desde Nuevo
se puede ir a cualquiera; Propuesta enviada → Conversando, Demo o diagnóstico, Ganado, Descartado;
Conversando → Propuesta enviada, Demo o diagnóstico, Ganado, Descartado; Demo o diagnóstico →
Conversando, Ganado, Descartado; Descartado → Nuevo; Ganado no sale. Mover un lead a «Propuesta
enviada» desde la ficha o el tablero no exige pasar por «¿se envió?»: deja el evento «propuesta
enviada» con la fecha. Mover de etapa **no borra** el próximo paso ni su fecha. El directorio conserva
las transiciones de hoy.

**Escritorio:** tablero de cinco columnas (sin descartados; un enlace «Descartados (n)» al pie). Cada
tarjeta: nombre, fuente, valor, próximo paso con su fecha (rojo si venció, ámbar si es hoy), último
contacto. Se mueve con un botón «→» que ofrece solo las etapas permitidas. Arriba: filtro por fuente y
por nicho, y el total de valor estimado por columna.

**Teléfono:** chips de etapa con el conteo y, debajo, la lista filtrada. Cada fila: nombre y fuente a
la izquierda, próximo paso y fecha a la derecha.

**Ficha del lead:** cabecera con nombre, etapa, fuente y valor. Primera tarjeta: **«Siguiente paso»**
(texto, fecha, botón WhatsApp con el mensaje del nicho y la propuesta si hay) y **«Mover a…»**.
Después: contacto (como hoy), propuesta (como hoy, más `propuestaUrl`), nota, y el historial **a la
derecha en escritorio y plegado en el teléfono** (últimos cinco y «Ver todo»). «Ganó» abre directo
«Crear cliente y proyecto» con los datos ya puestos.

**Nuevo lead:** formulario corto (nombre, fuente, nicho, WhatsApp o Instagram, próximo paso, valor,
nota); lo demás se completa después. Con un enlace de Instagram o web, se intenta leer el nombre como
ya hace Maps.

**Carga inicial:** los prospectos reales de hoy entran como leads en la fase 2, uno por uno desde el
panel (Neri o la sesión), con su etapa, su propuesta enlazada y su próximo paso. Es la primera prueba
de que el panel sirve.

### Prospectador y seguimientos masivos

No existe asignación de prospectos a usuarios y no hace falta todavía (hoy hay un solo usuario): el
prospectador ve **todo el directorio** y, en Leads, **solo los leads con `fuenteLead = directorio`**.
Los seguimientos de la prospección masiva (enviado sin respuesta, `fuenteLead = directorio`) **no
entran en el «Hoy» del dueño**: viven en Directorio › Cola (pestaña «Seguimientos», la de hoy) y en el
Inicio del prospectador. El «Hoy» del dueño lista leads con `fuenteLead ≠ directorio`, o de directorio
que ya respondieron (etapa Conversando en adelante), más cobros e hitos.

### Solicitudes

Una lista con todo lo que llega por `/api/web/solicitud` (formulario de la home y embudo `/empezar`),
las no atendidas primero. Cada fila: nombre, origen (web, embudo, TikTok…), calificación («demo» o
«diagnóstico») y hace cuánto. Al abrir: el mensaje, las respuestas del embudo y dos botones:
**«Convertir en lead»** (crea el Prospecto como lead con `fuenteLead` web o embudo, el nicho inferido
del rubro del embudo, el WhatsApp y el correo, la nota con el mensaje y las respuestas, el próximo paso
«escribirle» para hoy; la solicitud queda atendida y enlazada) y **«Archivar»** (atendida sin lead).
`SolicitudWeb` suma `prospectoId` opcional.

### Clientes y proyectos

Una sección. **Tabla de proyectos** (cliente, nicho, estado con semáforo, mensualidad, próximo cobro,
avance %) con filtro por estado; clientes como pestaña secundaria. La ficha del proyecto conserva sus
pestañas (Cobros, Pendientes, Horas, Versiones, Documentos, Cliente), con tres cambios: el **historial
plegado**, los **formularios de alta detrás de un botón** («Agregar cobro», «Nuevo pendiente»,
«Registrar horas» abren el formulario; no están abiertos siempre) y en escritorio **dos columnas**
(pestaña activa a la izquierda, resumen y cliente a la derecha). «Ganados sin proyecto» deja de
repetirse en Inicio y en Proyectos: vive solo en la cabecera de Proyectos como aviso.

### Cobros

Vista propia, que hoy no existe: tres cifras (por cobrar este mes, vencido, cobrado este mes) y una
tabla de cobros de todos los proyectos con filtro (vencidos, este mes, pagados), con las mismas
acciones de hoy (Pagado, Recordar, Avisar, Recibo) y el enlace al proyecto. El dinero deja de estar
enterrado dentro de cada proyecto.

### Directorio

Todo lo de la prospección masiva, intacto en su lógica, ordenado así: pestañas **Cola del día ·
Lista · Buscar · Importar · Bandeja**. La cola es la de Hoy actual (10 al día, «¿se envió?», saltar).
La lista es una tabla con **filtros en un panel plegable** (hoy ocupan la primera pantalla entera) y
paginación de 50. Buscar, Importar y Bandeja son las de hoy, con la bandeja en filas de una línea que
se expanden para corregir, en vez de 50 tarjetas de cuatro botones.

### Web

Solo medición: las cifras, el embudo de `/empezar`, orígenes, páginas y, en vez de 90 renglones,
«Personas por día» como barras compactas. Las solicitudes se van a su sección.

### Ajustes

Un índice lateral (escritorio) o arriba (teléfono) con las secciones, y **acordeón**: cada bloque
plegado hasta que se toca; los 19 nichos son una lista con «Editar» que abre el formulario de ese
nicho solo. Un «Guardar» por formulario, como hoy.

## Reglas de contenido (las del repo, que no cambian)

Español de Venezuela; el panel tutea a Neri (es su herramienta), los mensajes al cliente van de usted;
sin llamadas en ningún texto; nada de contactos personales; comentarios del código sin acentos; nada
sale a internet desde el panel salvo lo que ya sale.

## Cómo se hace

- **Mismo stack**: Next 15 (App Router), Prisma 6 sobre MariaDB, Vitest, Playwright a 390 y a 1280
  px. CSS propio en `globals.css` con tokens; **primer breakpoint del proyecto** en 1024 px.
- **Migraciones a mano** con `migrate deploy` (nunca `migrate dev`; nada de `Json`): `Prospecto` suma
  `esLead BOOLEAN DEFAULT false`, `fuenteLead VARCHAR(20) DEFAULT ''`, `valorEstimado DECIMAL(10,2)
  NULL`, `proximoPaso VARCHAR(160) DEFAULT ''`, `propuestaUrl VARCHAR(300) DEFAULT ''`; `SolicitudWeb`
  suma `prospectoId INT NULL`; el nicho «Otro» se siembra en `scripts/sembrar-nichos.mjs`. Más un
  `UPDATE` que marca `esLead = true` donde `etapa <> 'por_contactar'` u `origen = 'manual'`.
- **Rutas**: `/inicio` (y `/hoy` redirige), `/leads`, `/leads/[id]` (la ficha de prospecto actual,
  `/prospectos/[id]`, redirige), `/solicitudes`, `/proyectos` (con `/clientes` dentro), `/cobros`,
  `/directorio` (con `?t=cola|lista|buscar|importar|bandeja`; `/buscar` y `/prospectos` redirigen),
  `/web`, `/ajustes`. Las redirecciones mantienen vivos los enlaces guardados y el Web Share Target.
- **Un build a la vez** y `pm2 restart prospectos` solo con `pm2 list` delante; `DATABASE_URL` en el
  entorno al migrar (lección del 28-oct).
- **Fases que se publican una a una** (cada una con sus pruebas y revisión a 390 y 1280 px):
  1. **Esqueleto** (sin tocar datos): barra lateral de escritorio y barra inferior nueva, cabecera de
     página, tabla base, Inicio nuevo (cifras + «Hoy» con lo que ya existe: seguimientos y cobros),
     Ajustes en acordeón, rutas y redirecciones.
  2. **Leads**: migración, clasificación lead/directorio, `/leads` (lista y tablero), ficha del lead
     con «Siguiente paso», `/solicitudes` con «Convertir en lead», Directorio con la cola. Carga de los
     prospectos reales.
  3. **Dinero y proyectos**: `/cobros`, tabla de proyectos, ficha a dos columnas con formularios detrás
     de botones e historial plegado, `/web` solo medición.
  4. **Pulido**: búsqueda global, arrastre en el tablero, prueba en el teléfono de Neri.

## Lo que queda al constructor

- El ancho exacto de columnas de cada tabla y el corte de texto en el teléfono.
- Cómo inferir el nicho desde el rubro del embudo (mapa rubro → slug de nicho; «otro» sin nicho).
- El contenido de la hoja «Más» y el orden dentro de Ajustes.
- La forma de las barras compactas de «Personas por día».

## Decisiones que tomé yo (para que Neri las revise)

1. Separar **leads** de **directorio** en el mismo modelo con un booleano, en vez de una tabla nueva:
   conserva historial, propuestas y el código `/p/`, y un importado puede «ascender» a lead.
2. Las **etiquetas de etapa cambian** («Reunión» → «Demo o diagnóstico»), los valores en la base no.
3. **Tablero por etapas solo en escritorio**; en el teléfono, chips y lista. Sin arrastre hasta la fase 4.
4. **Cobros como sección propia**, aunque hoy no haya ninguno: es lo que Neri espera de un CRM y lo que
   va a mirar cuando los proyectos existan.
5. La **cola masiva sale de Inicio** del dueño y se queda en el Inicio del prospectador.
6. **Barra lateral a partir de 1024 px**; debajo, barra inferior de cinco con «Más».
7. **Sin librerías de interfaz**: CSS propio, como el resto del repo.
8. Las solicitudes **se convierten en lead con un toque**, en vez de abrir el formulario de 15 campos.
9. Orden de fases: esqueleto primero (se ve el cambio enseguida sin tocar datos), leads después.
10. (Tras la revisión del constructor) Nicho comodín «Otro» en vez de hacer el nicho opcional;
    ciudad opcional y clave con contacto para leads; **tabla de transiciones propia para leads** (el
    directorio no cambia); solo `manual` y `solicitud` nacen como lead (Maps y bandeja son
    directorio); el prospectador ve el directorio y los leads que salieron de él; los seguimientos
    masivos no entran en el «Hoy» del dueño.
