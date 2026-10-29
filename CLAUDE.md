# Panel de prospección NERACOSU — Notas para Claude

Plataforma de Neri para prospectar por nicho y llevar los proyectos vendidos. Pieza 1 (panel de
prospección: cola del día, embudo, propuesta por enlace, seguimientos) en producción en
`prospectos.neracosu.com`. Entra con PIN.

## Embudo /empezar en el panel (desde el 2026-10-29)

`/api/web/solicitud` acepta `type: "embudo"` con `respuestas` (JSON de rubro, actual, objetivo, tamano, sistema; texto, no
Json), `calificacion` (`demo` | `diagnostico`) y `origen` (el `?de=` del enlace); `/api/web/evento` acepta `t: "paso"` con
`p1`..`p4`, `resultado`, `datos`, `enviado`. Se ven en `/web` (bloque «Embudo de /empezar» y las respuestas en cada
solicitud) y en el correo de aviso. Contrato en `src/lib/web-contrato.ts`; migracion a mano `20261029090000_embudo_empezar`.
**Al desplegar, `npx prisma migrate deploy` necesita `DATABASE_URL` en el entorno** (`set -a; . ~/.config/prospectos/env;
set +a`): el 2026-10-28 se corrio sin ella, no fallo la cadena y el panel quedo dos minutos con el codigo nuevo sin las
columnas. Plan: `docs/superpowers/plans/2026-10-28-embudo-empezar-panel.md`.

## Panel CRM, fase 4: pulido (desde el 2026-10-30)

Plan: `docs/superpowers/plans/2026-10-30-panel-crm-fase-4-pulido.md`. Sin migración.

- **Búsqueda global** (`BusquedaGlobal`, montada en el layout del panel): se abre con **Ctrl+K / Cmd+K**, con el botón
  «Buscar» de la barra lateral y con «Buscar» en la hoja «Más» del teléfono; los tres disparan el evento
  `nc:buscar` (`abrirBusqueda()`), así que no comparten estado. Diálogo `role="dialog"` con flechas, Enter y Escape;
  al cerrar devuelve el foco a donde estaba. Espera 200 ms y descarta respuestas viejas. Lo puro en
  `src/lib/busqueda-contrato.ts` (`normalizarConsulta`: mínimo 2 caracteres, máximo 80; `ordenarResultados`: primero
  lo que empieza por la consulta sin acentos ni mayúsculas, luego por tipo lead · proyecto · cliente · directorio, tope
  20). La acción `buscarGlobal` (`src/acciones/busqueda.ts`) **respeta el rol**: el prospectador solo alcanza el
  directorio y los leads de `fuenteLead = directorio`; clientes y proyectos son del dueño; nunca devuelve montos.
- **Arrastre en el tablero de leads** (`ColumnaTablero` + `TarjetaLead arrastrable`): API nativa de HTML5; el dato
  viaja como `id:etapa` en `text/plain` y la etapa también como tipo `application/x-lead-etapa-<etapa>` (durante
  `dragover` el navegador no deja leer el dato). Al soltar llama a `moverLead`, la misma acción de «Mover a…»;
  `puedeSoltar` (puro) no deja soltar en la misma columna, en una no permitida ni en **Descartado** (pide motivo).
  Con el dedo el arrastre nativo no se dispara: ahí sigue «Mover a…». CSS solo bajo `(pointer: fine)`.
- Recorrido real: `scripts/verificar-pulido.mts` (17 comprobaciones a 1280 y 390, dueño y prospectador). Solo contra el
  clon y la base de tests. ⚠️ Un script de depuración que falle **antes** de su `try` deja sembrado en la base de
  tests (pasó con un dueño de PIN repetido): sembrar siempre dentro del `try`.
- **La prueba en el teléfono real la hace Neri.**

## Panel CRM, fase 3: dinero y proyectos (desde el 2026-10-30)

Plan: `docs/superpowers/plans/2026-10-30-panel-crm-fase-3-dinero-proyectos.md`. Sin migración.

- **`/cobros`** (solo dueño): tres cifras (por cobrar este mes · vencido · cobrado este mes, las de `resumenMes`), filtro
  `?f=pendientes|vencidos|mes|pagados` (`filtrarCobros`/`ordenarCobros` en `cobros-contrato.ts`, puros; la consulta
  `listarCobros` en `src/lib/cobros.ts`, tope 300; **«Este mes» = pendientes que vencen desde hoy hasta fin de mes, lo
  mismo que suma la cifra «Por cobrar este mes»; lo vencido va en «Vencidos»; «Pagados» son todos, del más reciente al
  más viejo**) y `TablaCobros`: mismo DOM para teléfono (filas apiladas con
  `data-label`) y escritorio (tabla), con las mismas acciones que la pestaña Cobros del proyecto (Marcar pagado en
  línea, Recordar, Avisar, Anular con motivo, recibo). «Agregar cobro» sigue solo en el proyecto. `CobroFila` lleva
  `proyectoId` y `proyectoNombre` (`aCobroFila` la arma en los dos sitios); `refrescar` de `acciones/cobros.ts`
  revalida también `/cobros`. **Cobros está en la barra**: fijas del teléfono Inicio · Leads · Solicitudes · Cobros,
  y «Más» con Proyectos, Directorio, Web y Ajustes (`navegacion-contrato.ts`). La cifra «Por cobrar» de Inicio y los
  cobros de la lista Hoy llevan a `/cobros`.
- **`/proyectos`** es una tabla (`.tabla--proyectos`: proyecto, cliente, nicho, estado, mensualidad, próximo cobro,
  avance) con chips `?estado=` y un chip aparte «Clientes»; `listarProyectos(hoy, estado?)` trae `nichoNombre`,
  `mensualidad` y `proximoCobro` (`proximoCobroDe`, puro: el `vence` más chico sin pagar ni anular, o `null` → «—»).
  Las cifras de dinero salieron de aquí. «Ganados sin proyecto» es un aviso `.aviso` bajo la cabecera.
- **Ficha de proyecto a dos columnas** (`.ficha--proyecto`): cabecera con `CabeceraPagina`, pestañas y la pestaña
  activa a la izquierda; a la derecha el **resumen** (`AccionesProyecto` + cliente con sus canales) y el historial. En
  el teléfono los dos van plegados arriba (`details.historial-plegado`). **La pestaña Cliente ya no existe**
  (`?t=cliente` cae en cobros): su contenido vive en el resumen. `TabPendientes` y `TabHoras` abren el formulario con
  «Nuevo pendiente» / «Registrar horas» y lo cierran al guardar.
- **`/web`**: «Personas por día» son barras compactas (`ol.web-dias-barras`, `alturaBarra` en `web-contrato.ts`,
  etiqueta cada 7 días, detalle en el `title`).
- `TabPendientes` y `TabHoras` envían con `onSubmit` + `FormData`, no con `<form action>`: React vacía un `form action`
  al terminar la acción, antes de la respuesta, y un error del servidor borraba lo escrito.
- `/web`: `rellenarDias` pone en 0 los días sin visitas para que la gráfica no comprima el tiempo.
- Recorrido real: `scripts/verificar-dinero.mts` (27 comprobaciones a 1280 y 390: cifras y filtros de /cobros, marcar
  pagado desde la tabla y verlo en el proyecto, tabla de proyectos con filtro, ficha a dos columnas, formularios detrás
  de botón, barras de /web, prospectador fuera de /cobros). Solo contra el clon y la base de tests.
- La fase 4 (búsqueda global, arrastre) ya está hecha: ver arriba.

## Panel CRM, fase 2: leads vs directorio (desde el 2026-10-30)

Plan: `docs/superpowers/plans/2026-10-29-panel-crm-fase-2-leads.md`. **Un lead es una conversación real; el directorio es
la prospección masiva.** Mismo modelo `Prospecto`, con `esLead`, `fuenteLead` (web, embudo, whatsapp, instagram, referido,
directorio, otro), `valorEstimado`, `proximoPaso`, `propuestaUrl` (migración a mano `20261030090000_leads`, con el
`UPDATE` que marcó como lead lo que ya había avanzado de etapa u origen `manual`); `SolicitudWeb.prospectoId`.

- **Contrato puro en `src/lib/leads-contrato.ts`**: etiquetas de lead (Nuevo · Propuesta enviada · Conversando · Demo o
  diagnóstico · Ganado · Descartado) sobre los mismos seis valores de etapa; **transiciones propias de lead**
  (`puedePasarLead`: desde Nuevo a cualquiera; propuesta, conversando y demo van y vienen) que **no borran la fecha del
  siguiente paso**; `claveLead(nombre, ciudad, contacto)` (ciudad opcional, el contacto evita que dos personas con el
  mismo nombre choquen; el directorio sigue con `nombre|ciudad`); `naceLead` (solo `manual` y `solicitud`);
  `nichoDesdeRubro` (rubro del embudo → slug). Nicho comodín **`otro`** (sembrado; en `SIN_EQUIVALENCIA`; el test de
  slugs va en 20).
- **Un directorio asciende a lead al marcar enviado** (`marcarEnviado`: `esLead = true`, `fuenteLead = "directorio"` si
  estaba vacía).
- Acciones en `src/acciones/leads.ts`: `crearLead` (alta corta, exige un contacto), `moverLead` (rechaza lo que no es
  lead; a «Propuesta enviada» deja evento `enviado` sin pasar por «¿se envió?»), `guardarSiguientePaso`,
  `guardarDatosLead`, `convertirSolicitud` (con la solicitud bloqueada `FOR UPDATE`: dos toques crean uno; deja
  `prospectoId` y `atendidaEn`).
- Pantallas: `/leads` (`listarLeads`: cinco columnas sin descartados, valor por columna; **mismo DOM** para teléfono (chips
  `?etapa=`) y escritorio (tablero con desplazamiento interno por columna); el prospectador solo ve
  `fuenteLead = directorio`), `/leads/nuevo`, `/leads/[id]` (Siguiente paso + Mover a, datos, contacto, propuesta,
  historial a la derecha en escritorio y plegado en el teléfono). `/prospectos/[id]` redirige los leads y sigue siendo la
  ficha del directorio con la cola. `/solicitudes` convierte en lead (`BotonConvertir`) o enlaza al lead.
- **`/directorio`** (`?t=cola|lista|buscar|maps|importar|bandeja`): la cola de siempre (`InicioProspectador`), la lista
  filtrada `esLead: false` (`DirectorioLista`, `FiltrosProspectos.soloDirectorio`) y lo de `/buscar`
  (`DirectorioBuscar`; la pestaña `osm` se llama `buscar`). `/prospectos` → `/directorio?t=lista`, `/prospectos/nuevo` →
  `/leads/nuevo`, `/buscar` → `/directorio?t=…` (conservan la consulta); `share_target` del manifiesto → `/directorio`.
  Las acciones de buscar/revisión revalidan también `/directorio`.
- Inicio del dueño: cifras por `esLead`; en «Hoy» no entran los seguimientos de directorio en «Propuesta enviada» (viven
  en Directorio › Cola); la cola dejó de estar plegada en Inicio: es un enlace.
- **Lo que es del directorio** (`DEL_DIRECTORIO` en `src/lib/prospectos.ts`: `esLead: false` o `fuenteLead: directorio`)
  es lo único que entra en la cola del día, en «Seguimientos que tocan» del prospectador y en el embudo de `resumenHoy`:
  un lead de la web o referido jamás recibe el mensaje masivo. El Inicio del dueño pide `seguimientosQueTocan(hoy,
  "todos")` y mete en Hoy los leads propios en cualquier etapa activa (Nuevo incluido) con paso para hoy o vencido.
- **El prospectador no ve montos ni «Nuevo lead»**, y de los leads solo los de `fuenteLead = directorio`: `/leads?fuente=web`
  le devuelve vacío (las dos condiciones se suman), `/leads/<id>` de otro lead es `notFound()` y `moverLead` /
  `guardarSiguientePaso` le exigen directorio.
- `/leads/nuevo` acepta el prellenado de «Cargarlo a mano» desde Maps (`nichoId` o `nicho`, `fuente`, `nombre`, `web`,
  `telefono`, `nota`); `crearLead` guarda la `fuente` (URL) en `fuentes` y `fuentesPorCampo` de cada contacto presente.
  Un WhatsApp que no normaliza a celular VE/CO devuelve error en el alta; en `convertirSolicitud` va crudo a `telefono` y
  a la nota.
- Recorrido real: `scripts/verificar-leads.mts` (41 comprobaciones a 1280, 1024 y 390; tablero con 30 leads en una
  columna y 0 en otra, nada sobresale de las tarjetas, prellenado, Mover a, alta sin ciudad, ficha, convertir solicitud,
  Directorio, redirecciones, prospectador sin leads ajenos). ⚠️ Con `loading.tsx` el `notFound()` llega en streaming con
  estado 200: se comprueba por el cuerpo. Suite 608 con base.
- Carga de los prospectos reales: hecha a mano con un script fuera del repo (los nombres y contactos no entran aquí).
- La fase 3 (cobros, tabla de proyectos, ficha a dos columnas, `/web`) ya está hecha: ver arriba.

## Panel CRM, fase 1: esqueleto (desde el 2026-10-29)

Diseño: `docs/superpowers/specs/2026-10-29-panel-crm-design.md` (leads vs directorio, Inicio con cifras, tablero, cobros,
escritorio); plan de la fase 1: `docs/superpowers/plans/2026-10-29-panel-crm-fase-1-esqueleto.md`. **Las fases 2 a 4
(leads, dinero y proyectos, pulido) siguen en el diseño, sin plan.** Lo que trae la fase 1:

- **Navegación por rol en `src/lib/navegacion-contrato.ts`** (puro): `seccionesPara`, `barraPara` (cuatro fijas más
  «Más»), `estaActiva`. La barra lateral (`BarraLateral`) existe desde **1024 px, el primer breakpoint del proyecto**;
  debajo manda la barra inferior (`BarraInferior` + `HojaMas`, un `role="dialog"` que cierra con Escape, el velo y al
  navegar, y devuelve el foco a «Más»). Iconos de línea en `Icono.tsx`. Al sumar una sección, va en el contrato y en
  su test, no en los componentes.
- **`/inicio` reemplaza a `/hoy`** (`/hoy`, `/` y el `start_url` del manifiesto llevan a `/inicio`; `/hoy` es
  `permanentRedirect`). El dueño ve cuatro cifras (`CifrasInicio`) y una sola lista «Hoy» (`armarHoy` en
  `src/lib/inicio-contrato.ts`: seguimientos, cobros que vencen en 7 días e hitos con fecha, por fecha; lo sin fecha ISO
  se omite); el prospectador ve su cola de siempre (`InicioProspectador`). Las acciones que revalidaban `/hoy` ahora
  revalidan `/inicio`. «Ganó y no tiene proyecto» ya no está en Inicio: vive en Proyectos.
- **`/solicitudes`** (solo dueño): las de la web y del embudo, «Sin atender · Todas», con `TarjetaSolicitud`. `/web`
  queda solo con la medición y enlaza a Solicitudes desde la cabecera.
- **Ajustes en acordeón** (`<details>` nativos con índice de anclas): un nicho a la vez; `?abrir=nicho-<id>` deja ese
  abierto tras el refresco.
- `CabeceraPagina` (título, cifra, acción principal; pegajosa en escritorio) y `.tabla` base (filas apiladas con
  `data-label` en el teléfono, tabla de verdad desde 1024 px) quedan para las fases siguientes; hoy solo Prospectos,
  Inicio, Solicitudes, Web y Ajustes usan la cabecera.
- **Recorrido real: `scripts/verificar-esqueleto.mts`** (45 comprobaciones a 390, 1023, 1024 y 1280 px, con dueño y
  prospectador temporales; captura todas las pantallas) contra el clon `~/dev-clon-prospectos` con
  `next dev -p 3021 -H 127.0.0.1` y la base de tests. ⚠️ **Tras cada migración, el clon necesita `npx prisma generate`**
  (su cliente no conocía las columnas del embudo y `/inicio` reventaba solo allá). El viejo `capturas-panel.mts` espera
  `/hoy` tras entrar: ya no sirve tal cual.

## Cómo retomar

**El diseño vive en `docs/superpowers/specs/`. Leer primero `2026-09-16-plataforma-vision-general.md`
y después el spec de la pieza que toque.** Se armó el 16-sep en una sesión de Hotel Marte, se trasladó
acá a pedido de Neri y esa misma tarde se amplió de un panel a una plataforma de cinco piezas.

| # | Pieza | Spec | Estado |
|---|---|---|---|
| 1 | Panel de prospección | `2026-09-16-panel-prospeccion-design.md` | Implementada (16-sep) |
| 3 | Proyectos y cobros | `2026-09-16-proyectos-cobros-design.md` | Implementada (16-sep) |
| 2 | Buscador e importación | `2026-09-16-buscador-importacion-design.md` | Implementada (17-sep) |
| 4 | Recibos de pago | `2026-09-16-recibos-design.md` | Implementada (17-sep) |
| 5 | Portal del cliente | `2026-09-16-portal-cliente-design.md` | Implementada (5a y 5b, 17-sep) |

Orden de construcción: **1 → 3 → 2 → 4 → 5**. Cada pieza sale a producción cuando termina.

Estado al 17-sep: **las cinco piezas y la pasada de UX (Fases A, B y C) en producción**. Hoteles repartidos en dos
nichos (`hoteles`, `hoteles-estadia`).

- Código en `main` (rama `pieza-1` ya fusionada). Proceso PM2 **`prospectos`**, puerto 3013 en
  `127.0.0.1`, proxy en el `.htaccess` (ver abajo). Repo: `git@github.com:neracosu/prospectos.git`.
- Base real con 2 nichos, 132 hoteles + Farmahogar, y un usuario `dueno` (Neri).
- **Redesplegar:** `git pull && npm ci && npx prisma migrate deploy && npm run build && pm2 restart prospectos`
  con el env cargado (`set -a; . ~/.config/prospectos/env; set +a`). **No exportar `NODE_ENV=production`
  antes de `npm ci`**: se perderían `typescript` y `playwright` (el PDF quedaría en 503 permanente).
  `pm2 list` antes; `pm2 save` solo con los cinco procesos `online`.
- **Tests:** `npm test` corre solo la parte pura (los archivos con base se saltan); **`npm run test:db`
  es la suite real** (contra `neracosu_prospectos_test`). Ambos antes de cualquier merge.
- **`.htaccess` es el proxy.** Todo va a Next salvo `/.well-known/`; por eso `CLAUDE.md`, `docs/`,
  `src/` y `plantillas/` responden 404 por el dominio. **Nunca** agregarle
  `RewriteCond %{REQUEST_FILENAME} !-f`: Apache serviría el repo entero.
- Scripts útiles (PIN siempre por stdin, nunca en la línea de comandos): `scripts/crear-usuario.mjs`,
  `scripts/cambiar-pin.mjs <id>`, `scripts/pin-en-uso.mjs`, `scripts/verificar-flujo.mts` (Playwright
  a 390 px contra el dominio), `scripts/verificar-flujo-proyectos.mts`, `scripts/verificar-flujo-buscar.mts`,
  `scripts/verificar-flujo-recibos.mts` (⚠️ solo contra la base de tests, ver pieza 4),
  `scripts/verificar-flujo-portal.mts` (⚠️ igual: solo contra el clon y la base de tests, ver pieza 5a; desde la 5b también entra al panel
  con un dueño temporal, sube y quita un documento),
  `scripts/sembrar-nichos.mjs`, `scripts/importar-hoteles.mts`, `scripts/generar-iconos.mts`.
- **Pieza 3 (Proyectos y cobros) en producción:** `/proyectos`, `/proyectos/nuevo`, `/proyectos/[id]` (pestañas
  cobros · pendientes · horas · versiones · cliente), `/clientes`, `/clientes/[id]`, `/clientes/nuevo`; Ajustes
  suma mensajes de cobro, datos del emisor y tarifa por hora. **Cron de mensualidades dentro de la app**
  (`src/instrumentation.ts` → `src/lib/mensualidades.ts`): corre al arrancar y a las 06:00 de Caracas,
  idempotente por `(proyectoId, mes)`, deja una línea `[mensualidades] <fecha>: N creadas de M activos` en
  cada corrida (si no aparece tras un `pm2 restart`, el cron no arrancó). Un proyecto con mensualidad 0 no
  genera cobros; al activar un cliente que ya existía solo se generan mensualidades desde hoy (el rescate
  de 60 días nunca va antes del primer mes facturado). Recorrido real: `scripts/verificar-flujo-proyectos.mts`.
- **Propuesta por prospecto (17-sep):** los 19 nichos tienen plantilla, por **arquetipo** (`plantillas/<arquetipo>.html`:
  `hoteles`, `hoteles-estadia`, `restaurantes-y-bares`, `reservas`, `comercio-y-tienda`, `cobros-y-pagos`,
  `citas-y-servicios`). **Las cinco nuevas se generan**: `plantillas/base/` (cabecera con el CSS de hoteles, barra,
  autor, qué-recibe, comparar, condiciones) + `plantillas/base/<arquetipo>.cuerpo.html` →
  `python3 scripts/armar-plantillas.py`; **no editar los `.html` generados**. `renderPropuesta` rellena `{{nombre}}`,
  `{{ciudad}}`, `{{rubro}}` y deja o quita `<!--si:web-->…<!--fin:web-->` / `<!--si:sinweb-->…` según el prospecto
  tenga web (a quien ya tiene página no se le vende una página: se le conecta). Antes de tocar una plantilla:
  `npx tsx scripts/verificar-plantillas.mts` (desbordes de hoja A4 y tokens sin rellenar; las siete pasan con un
  nombre largo). **Texto corrido justificado con silabeo** (regla de Neri, 27-sep): bloque `:where(...)` al final del
  `<style>` de `base/cabecera.html`, `hoteles.html` y `hoteles-estadia.html`; toda plantilla nueva lo lleva.
  Cifras y precios **solo** los de `neracosu.com/para/<arquetipo>`; `citas-y-servicios` no lleva
  precio (diagnóstico $250). Los mensajes de todos los nichos mandan `{enlace}`. **Fecha y vigencia las pone el panel** (5-oct): `{{fecha}}` es el día
  de Caracas del primer envío (o el de hoy si aún no se envió) y `{{vigencia}}` son 30 días más (`fechaDePropuesta`,
  `DIAS_VIGENCIA`); no escribir fechas a mano en una plantilla. El verificador las prueba con una fecha larga fija.
  El correo de las propuestas es `info@neracosu.com`. El pago único se llama «adaptación e instalación» (no
  «desarrollo») salvo donde de verdad se construye (citas, calendario de estadía), y **la demostración es con datos de
  ejemplo**: no se promete cargar el menú, los productos o los espacios del prospecto. `scripts/ajustar-mensajes.mts`
  corrige frases de los mensajes en la base sin pisar lo editado en Ajustes.
  **Temporada promocional (decisión de Neri, 5-oct): 40 % de descuento en el pago único de cualquier plan para quien
  contrate hasta el 31-dic-2026**; la mensualidad no cambia. En las plantillas va dentro de `<!--si:promo-->…<!--fin:promo-->`,
  que `renderPropuesta` deja mientras el día de Caracas no pase de `PROMO_HASTA` (`propuesta-contrato.ts`): fila de
  precios con el descuento y gancho en el resumen. La meta que dio: al menos 10 negocios pagando USD 100 a 130 al mes
  de aquí a diciembre. En la web vive en `~/build-para/precios.py` (`PROMO_PCT`, `PROMO_HASTA`) y en `body-index.html`;
  se esconde sola al vencer, pero **en enero hay que quitarla de las fuentes** y de las plantillas.
  En el primer mensaje de WhatsApp de cada nicho va la variable **`{promo}`** (`fraseDePromo`, misma fecha): sale
  como frase mientras dura la temporada y vacía después, sin dejar hueco (`mensajeDeProspecto`).
  **Todos los nichos llevan precio cerrado desde el 5-oct** (decisión de Neri: «cada nicho ya debería ir con un precio
  o 3 precios definidos»). `citas-y-servicios`: 2.400 / 3.800 / 5.700 por cantidad de profesionales (hasta 3, de 4 a
  10, más de 10 o varias sedes). `hoteles-estadia`: 2.800 / 4.300 / 6.600 por habitaciones (hasta 15, 16 a 40, más de
  40); la «página conectada» sigue cotizándose tras el diagnóstico. Sistema completo de gimnasios (dentro de
  `cobros-y-pagos`): 2.400 / 3.800 / 5.700 por alumnos (hasta 150, hasta 500, más). Mensualidad 100 / 130 / 170 en los
  tres. Las dos propuestas siguen diciendo qué existe y qué se construye (agenda por profesional, calendario de
  noches), con precio que no se mueve y plazo por escrito. **Lo que más arriba y más abajo en este archivo dice
  «sin precio cerrado» o «no lleva tabla de precios» para citas y estadía ya no rige.** La ficha tiene «PDF»
  (`/p/<código>/pdf`, caché por hash); `scripts/generar-propuestas.mts --primeros N` los deja listos para la cola.

- **Pieza 2 (Buscador e importación) en producción:** `/buscar` con pestañas `?t=osm|maps|importar|bandeja`
  (Mapa · Maps · Importar · Bandeja; un lote se abre con `?t=bandeja&lote=<uuid>`, paginado de a 50),
  `/buscar/plantilla?formato=xlsx|csv`, «Leer web» en la ficha del prospecto (sugiere contactos publicados
  en su web; solo llena campos vacíos; una lectura por minuto), y PWA mínima: `/manifest.webmanifest` con
  Web Share Target, así que compartir un enlace de Google Maps desde el teléfono abre `/buscar?url=` (o
  dentro de `?text=`). **Nada entra al panel sin pasar por la bandeja** (`Revision`): Overpass, Maps, texto
  pegado y archivos crean un lote; cada fila se aprueba, completa (solo campos vacíos del existente),
  corrige o descarta. Cada dato lleva su fuente: `Prospecto.fuentes` (lista) y `fuentesPorCampo` (mapa).
  Recorrido real: `scripts/verificar-flujo-buscar.mts` (PIN por stdin; escribe en la base de
  `DATABASE_URL` y maneja el sitio de `BASE_URL`, por defecto el dominio público: por `127.0.0.1` la
  descarga de la plantilla falla porque la cookie de sesión es `Secure`; base y sitio tienen que ser la
  misma instancia; limpia lo que crea por la marca `(PRUEBA) <timestamp>`).
  - **Toda petición saliente va por `src/lib/red-segura.ts`** (`descargar`), nunca `fetch` en el servidor:
    solo http(s), sin IPs privadas ni nombres locales, DNS resuelto y fijado, plazo total 30 s separado
    de la inactividad de 10 s, tope de bytes, máximo 3 redirecciones. Desde el 17-sep resuelve **todas** las IP del
    nombre y las prueba en orden si la conexión falla (Overpass tiene dos servidores y uno estaba caído); si
    alguna es privada se rechaza el nombre entero.
  - **«Leer web» en bloque:** `scripts/leer-webs.mts [--aplicar]` (env cargado): lee la web de cada prospecto con contacto
    vacío, una a la vez con 3 s entre sitios, y llena solo los campos vacíos que traigan **un único** candidato (con
    varios no adivina: quedan en el evento `lectura_web`). La fuente del dato es la URL final de la web.
  - **Totales en `/prospectos`** (17-sep): un número grande y chips por etapa, nicho y ciudad que filtran al tocarlos
    (`resumenProspectos`, mismos filtros que la lista); filtro `?ciudad=` exacto y páginas de 100 (`?pagina=`).
  - **Buscar por lotes desde el servidor:** `scripts/buscar-region.mts <nichos> <ciudades>` (con el env cargado y
    `PROSPECTOS_OVERPASS_ESPERA_MS=12000`: Overpass devuelve 429 con el ritmo de 5 s del panel; el script reintenta
    con espera creciente). Deja lotes en la bandeja igual que el botón del panel. Región central del 17-sep: 7
    ciudades nuevas en `CIUDADES` y tres nichos nuevos sin plantilla (`restaurantes-y-bares`, `canchas-y-espacios`,
    `licorerias-y-bodegones`; sus mensajes mandan a la página pública de `/para/`).
  - **Overpass:** una consulta a la vez por proceso, 5 s entre consultas, User-Agent identificado, caché
    de 7 días en `BusquedaOsm` con huella de la consulta (cambiar `etiquetaOsm` la invalida); solo se
    cachean respuestas 200 con resultados; una búsqueda puede tardar hasta 90 s. Ciudades y alias en
    `CIUDADES` de `src/lib/overpass-contrato.ts`. Un nicho sin `etiquetaOsm` no se puede buscar en el mapa
    (lo llena `scripts/sembrar-nichos.mjs`). `PROSPECTOS_OVERPASS_ESPERA_MS` solo se respeta fuera de
    producción.
  - **Directorio abierto (Overture Maps, 5-oct):** segundo botón de la pestaña «Mapa», mismo nicho y ciudad. Lee la
    tabla `LugarOverture` (solo Venezuela, confianza ≥ 0,7): **el panel no sale a internet**, por eso responde al
    momento. Se llena a mano: `python3 scripts/extraer-overture.py <publicación>` (única salida a la red; deja
    `~/overture/ve-<publicación>.jsonl`) y luego `scripts/cargar-overture.mts <archivo> --aplicar` con el env
    cargado, que reemplaza la tabla en una transacción y **se niega si lo nuevo es menos de la mitad** de lo que hay.
    Overture publica una vez al mes. Reglas en `src/lib/overture-contrato.ts`: de nicho a categorías (`REGLAS_NICHO`;
    `hoteles` y `cosmeticos` no tienen: botón apagado), la ciudad **por distancia y no por nombre** (un lugar en el
    solape de dos radios es de la de centro más cercano), la fuente de cada dato es la página de Facebook del negocio
    y **sin Facebook ni web el lugar no entra**. Al agregar un nicho a `sembrar-nichos.mjs`, el test de los 19 slugs
    obliga a ponerlo en `REGLAS_NICHO` o en `SIN_EQUIVALENCIA`. Recorrido: `scripts/verificar-flujo-overture.mts`
    (⚠️ solo contra el clon y la base de tests, con `LugarOverture` vacía).
  - **Colombia, etapa 1 (6-oct, spec `2026-10-06-colombia-etapa-1-design.md`):** `CIUDADES` lleva `pais` y siete
    ciudades colombianas (Bogotá, Medellín, Cali, Barranquilla, Cartagena, Santa Marta, Cúcuta); **el país de un
    prospecto sale de su ciudad** (`paisDeCiudad`), no hay columna. `normalizarCelular(texto, pais?)` reconoce el
    móvil `+57 3XX…` y lo guarda como `57…`. El directorio va **por país**: `extraer-overture.py <pub> co`, archivo
    `co-<pub>.jsonl`, y `cargar-overture.mts` reemplaza solo ese país y **guarda solo rubros con regla dentro de una
    ciudad del panel** (`--forzar` salta el freno cuando el recorte baja a propósito). **A un prospecto de Colombia no
    se le manda la propuesta ni el mensaje del nicho**: lleva el de `src/lib/colombia-contrato.ts` (plataforma con
    cobro integrado a Wompi, sin enlace). Mismos precios en USD y misma promoción. Lo que se ofrece allá, dicho por
    Neri: integración con Wompi, con el registro del lado del cliente si tiene Bancolombia; **la integración no está
    construida**. Etapa 2 en curso: las plantillas llevan bloques `<!--si:ve-->…<!--fin:ve-->` y
    `<!--si:co-->…<!--fin:co-->` (`renderPropuesta` deja los del país del prospecto; el verificador arma las dos
    versiones). **Un prospecto colombiano solo recibe propuesta si su arquetipo está en `PLANTILLAS_CON_COLOMBIA`**
    (`colombia-contrato.ts`), que desde el 6-oct tiene seis: restaurantes, reservas, comercio, citas, hoteles y hoteles de estadía (Neri
    aprobó el criterio: Wompi, Nequi, pesos a la TRM, factura electrónica por el proveedor del negocio). **`cobros-y-pagos` tiene plantilla propia para Colombia**
    (`plantillas/base/cobros-y-pagos-co.cuerpo.html` → `cobros-y-pagos-co.html`): en Venezuela es validación contra
    bancos venezolanos y allá es otro producto, mensualidades cobradas por Wompi con mensualidad de servicio.
    `leerPlantillaPara(slug, pais)` busca primero `<slug>-co.html`. Nació de la venezolana y se mantiene aparte. Al tocar una frase propia de un país, va en su bloque.
    `condiciones.html` y `comparar.html` ya tienen su versión Colombia (pesos a la TRM, Wompi).
  - **Tope por búsqueda en el directorio (6-oct):** cada búsqueda deja pasar como mucho `TOPE_LOTE` (300), las de mayor
    confianza entre las que **todavía no pasaron por la bandeja** (`tomarLote` + `clavesVistas`: filas de `Revision`
    de origen `overture` con cualquier decisión y prospectos que entraron por ahí). Buscar otra vez trae las
    siguientes; cuando no queda ninguna lo dice y no crea lote. Un prospecto que existía de otra fuente sí vuelve a
    ofrecerse para completarlo.
  - **Segundo cron dentro de la app:** `src/instrumentation.ts` → `limpiarLotesViejos(30)`, a la misma hora
    que las mensualidades; deja `[revision] N lotes viejos limpiados` (si no aparece tras un
    `pm2 restart`, no arrancó). Es lo único que borra algo en toda la app: filas de `Revision` ya
    decididas, nunca un `Prospecto`.
  - ⚠️ **La cadena de imports de `src/instrumentation.ts` no puede tocar ningún `node:`.** Next la compila
    también para edge y un import con esquema deja **todas** las rutas en 500; `tsc` y los tests pasan
    igual, solo `next build` lo detecta. Hoy son 9 archivos (`mensualidades`, `revision`,
    `revision-contrato`, `clave-prospecto`, `cobros-contrato`, `db`, `dinero`, `fecha-caracas`); por eso
    `crearLote` usa el `crypto` global. Revisar el grafo antes de agregarle un import. Desde la pieza 4 lo vigila
    `tests/instrumentation-grafo.test.ts` (recorre la cadena y falla si alguien cuela un `node:`).
  - ⚠️ **Migraciones solo con `prisma migrate deploy`; nunca `migrate dev` ni `db push` contra ninguna
    base.** Prisma no emite `DEFAULT` para columnas `Json` en MariaDB y `migrate diff` pide siempre
    `MODIFY … JSON NOT NULL` con `DEFAULT []` sin comillas (SQL inválido): es el desencuentro de Prisma
    con el `LONGTEXT + json_valid` de MariaDB, no un cambio pendiente. Al agregar una columna Json:
    `migrate dev --create-only` → escribir a mano el `ALTER TABLE … MODIFY … JSON NOT NULL DEFAULT '{}'`
    (ver `20260917000100_json_defaults`) → `migrate deploy`.
  - **Topes compartidos** entre importación y alta manual en `TOPES` de `src/lib/tabla-contrato.ts`
    (nombre 120, ciudad 80, estado 60, y el par nombre+ciudad ≤ 191, que es el largo de `clave`).
  - **Los repetidos que no aportan nada nacen descartados** (17-sep, tras ver 40 sucursales de Farmatodo en la
    bandeja): «Repetido en el mismo archivo» siempre, y «Ya existe» solo si no trae ningún dato que al existente le
    falte (`esRepetidoSinValor` en `revision-contrato.ts`, misma lista `CAMPOS_CONTACTO` que `completarExistente`).
    Para lotes de antes, «Descartar N repetidos sin nada nuevo» en la bandeja (`descartarRepetidos`). Nada se borra.
    **El mismo archivo importado dos veces**: la fila que ya está pendiente en un lote anterior (mismo nicho, nombre
    y ciudad, textos tal cual) nace descartada con «Ya está pendiente en otro lote» (`copiaPendienteEnOtroLote`; Neri
    importó el mismo archivo cuatro veces el 17-sep). La copia vieja es la que vale.
  - **«Revisar de nuevo N con problema»** (`revisarDeNuevo`): vuelve a validar y clasificar en bloque las filas
    pendientes con problema sin tocar sus datos, para cuando el problema estaba afuera (un archivo con un nicho que
    el panel no tenía: se crea el nicho en `sembrar-nichos.mjs`, se siembra y se revisa). Lo que sigue mal (falta la
    ciudad) sigue con problema. Al 17-sep el panel tiene **19 nichos**; los que no tienen plantilla mandan a su
    página de `/para/`.
  - La clave de duplicado sigue siendo la de la pieza 1 (`nombre|ciudad` normalizados): **no quita
    «hotel/farmacia/posada» inicial** como pedía la spec. Cambiarla recalcula la clave de todos los
    prospectos; decisión de Neri, pendiente.
  - `scripts/generar-iconos.mts` regenera `public/icono-{192,512}.png` desde `public/icono.svg`; no
    dibujar los PNG a mano.
- **Pieza 4 (Recibos de pago) en producción:** en `/proyectos/[id]` → Cobros, cada cobro pagado tiene
  **Generar recibo** (la primera vez; después es el enlace `Recibo R-AAAA-NNNN`), **Enviar por WhatsApp**
  (copia el mensaje, abre WhatsApp y deja `aviso_cliente`; el PDF lo adjunta Neri desde el teléfono) y
  **Anular**. Descarga: `/recibos/R-2026-0001.pdf` y `/recibos/R-2026-0001-A.pdf`, solo `dueno` (sin
  sesión 307 a `/entrar`, otro rol 403). Sin nombre, RIF, WhatsApp y correo del emisor en Ajustes no se
  genera nada. El título es «Recibo de pago», **nunca «factura»**.
  - ⚠️ **`~/prospectos-archivos/recibos/<año>/` es lo único del servidor que NO se regenera nunca** (archivos
    `600`). Un recibo emitido no cambia: con `Cobro.reciboNumero` lleno jamás se vuelve a generar, aunque
    cambie `plantillas/recibo.html`; si el archivo falta, la descarga da 404. **Ese directorio necesita
    respaldo** (hoy no tiene). Por eso: `tests/preparar-entorno.ts` fuerza **siempre** un directorio temporal
    (sin `??=`: el env de producción define `PROSPECTOS_DIR_ARCHIVOS` y los tests de recibos borran
    `<dir>/recibos`; lo vigila `tests/entorno.test.ts`), y `dirArchivos()` de `src/lib/recibos.ts` se niega
    a usar `/home/neracosu/prospectos-archivos` fuera de `NODE_ENV=production` (`DIR_ARCHIVOS_DE_PRODUCCION`):
    un `next dev` o un script jamás escribe ahí.
  - **El número se asigna con la fila de `Correlativo` bloqueada (`FOR UPDATE`) y el PDF se genera dentro
    de esa misma transacción** (`src/lib/recibos.ts`): si Chromium falla, se deshace y el número sigue
    libre. La transacción puede durar hasta ~60 s; es a propósito. El año es el del día de Caracas en que
    se genera, no el del pago. Si el contador quedara por detrás de un número ya emitido (respaldo viejo,
    edición a mano) corta con `CORRELATIVO_DESFASADO` antes de pisar nada. Que una transacción colgada sea
    inocua depende de que PM2 corra `prospectos` en **`fork` con una sola instancia**: no pasarlo a cluster.
  - **Desde esta pieza un cobro pagado sí se anula** (con motivo, hasta 191 caracteres: el ancho de la
    columna). Si tenía recibo se genera la nota `R-…-A` y el PDF original no se borra; si Chromium falla al
    anular, el cobro queda anulado igual y la fila ofrece «Generar nota de anulación»
    (`Cobro.notaAnulacionEn`). La nota se arma con los datos de hoy (emisor, cliente, concepto), no con los
    del recibo original, que se conserva aparte. Una mensualidad anulada no la recrea el cron (el mes ya
    existe) y su reemplazo a mano solo puede ser «Extra» o «Cuota»: sale sin mes ni versiones incluidas.
  - ⚠️ **`scripts/verificar-flujo-recibos.mts` nunca contra producción**: cada recibo gasta un correlativo
    real. El script se niega si `DATABASE_URL` no dice `prospectos_test` o si `BASE_URL` es el dominio o el
    puerto 3013. Se corre contra `node_modules/.bin/next dev -p 3014` del clon `~/dev-clon-prospectos`, con
    `DATABASE_URL="$TEST_DATABASE_URL"` y `PROSPECTOS_DIR_ARCHIVOS` apuntando a un directorio temporal.
  - El motor de PDF es `src/lib/pdf.ts` (una sola fila de Chromium para propuestas y recibos, PDF
    etiquetado). `pdf.ts` y `recibos.ts` usan `node:`: fuera de la cadena de `src/instrumentation.ts`.
    Las fuentes del recibo son locales (`plantillas/fuentes/`, OFL) y se incrustan como `data:`: el recibo
    no depende de Google Fonts.
- **Pieza 5a (Portal del cliente) en producción:** el cliente entra por `/c/<código>` (`Cliente.codigo`, 22
  caracteres) con un **PIN de 6 dígitos que genera el servidor**; ve `/c/<código>/inicio`, `/proyecto/<id>`
  (hitos, versiones, cobros, recibos vigentes) y `/contacto`; `/salir` borra la cookie. En `/clientes/[id]` Neri
  tiene **Enviar acceso** (enlace y PIN salen en **dos mensajes separados**; el PIN en claro solo existe en la
  respuesta de esa acción), **Regenerar PIN** y **Desactivar acceso** (los dos suben `Usuario.sesionVersion`:
  tumban las sesiones abiertas; ninguno borra nada). Sobre un cliente que ya tiene acceso, «Enviar acceso»
  reenvía solo el enlace: el PIN está hasheado, si lo perdió se regenera. Los mensajes de cobro, de versión y
  de recibo aceptan `{enlace}`: sale vacío si el cliente no puede entrar, y la frase del portal se arma en
  código **solo si hay enlace** (no poner una frase fija con `{enlace}` en una plantilla: queda colgando).
  Recorrido real: `scripts/verificar-flujo-portal.mts`, **solo** contra el clon (`next dev -p 3014`, base de
  tests, `PROSPECTOS_DIR_ARCHIVOS` temporal compartido entre el servidor y el script).
  - ⚠️ **Toda página o ruta nueva bajo `src/app/c/` empieza por `exigirCliente(codigo)`** (o `sesionCliente()`
    en un `route.ts`), y **toda consulta del portal vive en `src/lib/portal.ts`**: `select` campo por campo,
    nunca `include`, siempre con el `clienteId` de la sesión (`where: { id, clienteId }`: el id de la URL jamás
    va solo). Lo ajeno responde **404, nunca 403**. El cliente no ve horas, tarifa, notas, pendientes no
    visibles, cobros anulados ni sus recibos (decisión del plan: la nota de anulación la manda Neri por
    WhatsApp). `tests/portal.test.ts` («nada interno») serializa todo y falla si aparece un campo prohibido:
    al agregar un campo sensible al esquema, sembrarle `SECRETO` ahí.
  - **El portal solo lee.** La única server action con sesión de cliente es `entrarPortal`; salir es un GET.
    El `tieneSesion()` de `/p/[codigo]` acepta el token del portal **sin mirar la base** (solo sirve para no
    contar como apertura del embudo la visita de un cliente ya ganado): **no copiarlo como guarda de acceso**.
  - **Sesiones separadas:** cookie `sesion_cliente` (token con audiencia `portal`, sin `rol`) y `pr_sesion`
    del panel; ninguna abre lo del otro. La sesión del cliente se revalida contra la base en cada petición
    (activo, rol, `clienteId`, `sesionVersion`).
  - **El PIN del cliente no participa de la unicidad de PINs del panel:** `pinEnUso` y los tres scripts de PIN
    miran solo `dueno` y `prospectador`. En el panel el PIN identifica a la persona; en el portal, el código.
  - ⚠️ **Bloqueo de intentos: el fallo se registra ANTES del primer `await` y se perdona solo al acertar**
    (`intentarEntrada` en `src/lib/acceso-cliente.ts` y `entrar` en `src/acciones/entrar.ts`). Con el orden
    natural (consultar → `await` → registrar) una ráfaga en paralelo pasa entera: se demostró 50 de 50 en la
    revisión final. No reordenarlo. 5 fallos / 15 min por cuenta y por IP; un código mal formado solo suma a
    la IP. `/c/*` tiene además 120 peticiones/min por IP (clave `c:<ip>`), páginas **y** `entrarPortal`.
    El `Map` de `src/lib/rate-limit.ts` lo comparten panel y portal (tope 10.000, desalojo FIFO): pendiente
    desalojar primero las entradas no bloqueadas. El login del panel no tiene test de la ráfaga (no hay patrón
    de mock de `next/headers` en el repo).
  - `X-Robots-Tag: noindex, nofollow` en todo `/c/*` (`next.config.ts`), `manifest: null` en su layout (el portal
    no ofrece instalar la PWA del panel), tema claro propio con las fuentes locales del recibo
    (`next/font/local` desde `plantillas/fuentes/`: **solo `next build` lo valida**, por eso antes de desplegar
    algo del portal se compila primero en el clon) y `src/app/c/not-found.tsx` para el 404 en español.
  - Ajustes solo administra cuentas del panel: `guardarUsuario` y `restablecerPin` filtran por `ROLES_PANEL`
    (5b). La cuenta del portal de un cliente se maneja desde su ficha, nunca desde Ajustes.
- **Pieza 5b (Documentos y avisos) en producción:** en `/proyectos/[id]?t=documentos` Neri sube PDF, JPG, PNG
  o ZIP de hasta 10 MB y los quita; el cliente los ve y baja en la pestaña Documentos de su portal, por
  `/c/documentos/<id>`. «Avisar al cliente» abre WhatsApp al cumplir un hito visible, al publicar una versión
  y al registrar una **cuota o un extra** (las mensualidades ya tienen «Recordar» y los pagos el recibo); los
  tres mensajes se editan en Ajustes → Avisos al cliente (`mensaje_aviso_hito|version|cobro`).
  - ⚠️ **`~/prospectos-archivos/documentos/<clienteId>/` es el SEGUNDO directorio del servidor que no se
    regenera** (el primero es `recibos/`). **Necesita respaldo** (hoy no tiene). `dirArchivos()` y
    `escribirAtomico()` viven en `src/lib/archivos.ts` y los comparten recibos y documentos: el guarda que se
    niega a usar el directorio real fuera de `NODE_ENV=production` es uno solo. `src/lib/propuesta.ts` conserva
    su propia copia **sin** guarda (solo maneja PDFs regenerables): no copiarla.
  - **La subida es un route handler, no una Server Action** (`POST /proyectos/<id>/documentos`): el tope de
    cuerpo de las acciones es global y subirlo a 11 MB se lo abriría también a `entrarPortal`, que no pide
    sesión. El handler valida la sesión `dueno` **antes** de leer el cuerpo y comprueba el origen con
    `src/lib/origen.ts` (`Origin` contra `X-Forwarded-Host`/`Host`), que es lo que Next hace solo en una
    acción. La pantalla sube por `XMLHttpRequest` porque `fetch` no da el porcentaje. No pasar nada de esto a
    Server Action ni tocar `serverActions.bodySizeLimit`.
  - **El tipo de archivo lo decide la firma de bytes** (`detectarTipo` en `src/lib/documentos-contrato.ts`),
    nunca la extensión ni el `type` del navegador. En la base va la ruta **relativa**
    (`documentos/<clienteId>/<uuid>.<ext>`) y `rutaDeDocumento()` no lee nada que no tenga esa forma. El nombre
    original del archivo no se usa para la ruta. `documentos-contrato.ts` es puro (lo importa también el
    navegador); `src/lib/documentos.ts` usa `node:`: en un componente `"use client"` solo con `import type`.
  - **Quitar no borra** (`Documento.quitadoEn`): el cliente deja de verlo y el archivo queda en disco. El único
    `rm` de la pieza es el de rescate de `guardarDocumento` (si la base falla tras escribir), y solo alcanza el
    archivo que acaba de crear. Para el cliente, lo ajeno, lo quitado y lo inexistente son **el mismo 404**.
    No se registra qué documento abrió.
  - **Todo mensaje de WhatsApp que sale de una plantilla pasa por `armarMensaje`** (`src/lib/plantilla-mensaje.ts`):
    **el renglón que lleva `{enlace}` se quita entero** cuando el cliente no tiene acceso al portal (si la
    plantilla es de un solo renglón se conserva y `{enlace}` sale vacío). Por eso `{enlace}` va siempre en su
    propio renglón, y por eso los textos de fábrica del recordatorio y del vencido ya traen el renglón del
    portal (decisión aceptada por Neri el 17-sep).
  - ⚠️ **En un aviso, el mensaje y el enlace se arman ANTES de la transacción que marca `avisadoEn`** y crea el
    `Evento aviso_cliente` (`avisarHito`, `avisarCobro`, `marcarAvisada`): al revés, un fallo al leer la
    plantilla deja algo «avisado» que nunca abrió WhatsApp, y el botón ya no vuelve. Desmarcar un hito le borra
    el `avisadoEn`. Sin WhatsApp del cliente no se marca nada.
  - ⚠️ **`window.open(url, "_blank", "noopener")` devuelve `null` SIEMPRE**: el componente creería que el
    navegador bloqueó la ventana. El patrón es el de `TabCobros`: abrir sin `"noopener"` y después
    `ventana.opener = null`.
  - **Sesión vencida del cliente:** los enlaces del portal a recibos y documentos llevan `?c=<código>`; sin
    ninguna sesión y con un `c` bien formado, la ruta redirige a `/c/<c>` (su PIN), no al teclado del panel.
    Sin `c`, un documento responde 404: decir de quién es sería regalar su código.
  - `tests/portal-guardas.test.ts` falla si una `page.tsx` o `route.ts` nueva bajo `src/app/c/` no llama a
    `exigirCliente(`/`sesionCliente(` (es textual: una alarma, no una prueba de autorización; no mira
    `layout.tsx`). El test «nada interno» de `tests/portal.test.ts` busca `/horas|tarifa|nota/i` en **todo** lo
    que sale del portal, también en los datos sembrados: un documento de prueba llamado «…tarifas» lo dispara.
  - ⚠️ **Trampa de herramienta:** una secuencia de escape unicode escrita como texto (barra invertida, `u` y
    cuatro dígitos) que pase por una herramienta de escritura o por un comando de shell armado por un agente
    llega **decodificada**: en `documentos-contrato.ts` quedaron bytes NUL crudos y git trató el archivo como
    binario. Esas líneas se escriben con un script que arme la secuencia con `chr(92)`, y antes de fusionar se
    barre la rama buscando caracteres por debajo de 0x20, el 0x7F y los combinantes U+0300–U+036F.
  - ⚠️ **La próxima migración debe llevar un sello posterior a `20260919090000`** (la de esta pieza va dos días
    por delante del calendario y ya está aplicada en producción: no se renombra).
- **Pasada de UX del panel** (spec `2026-09-17-ux-panel-design.md`): **Fase A** (visual) en la rama `ux-fase-a`,
  **Fase B** (reactividad) en `ux-fase-b` (sale de la A) y **Fase C** (carga, validación en línea, service worker) en
  `ux-fase-c` (sale de la B). **Las tres en producción desde el 17-sep** (fusionadas en `main`, build y
  `pm2 restart prospectos` verificados; Neri las aprobó tras ver el antes y después del artefacto
  `KMx9tx5cUwkSDN6zQKDMdT`). Planes en `docs/superpowers/plans/` (`…-ux-fase-b-reactividad.md`,
  `…-ux-fase-c-carga-validacion-sw.md`); revisiones en `~/backups/prospectos-ux-fase-{a,b,c}-revision-20260917.md`.
  Lo que trae la B y sus trampas:
  - **Una sola línea de resultado** (`src/componentes/LineaFlotante.tsx`, `useFlotante()`), montada en el layout del
    panel. Lo reversible trae «Deshacer»; lo irreversible (anular, descartar) sigue con su confirmación en la
    tarjeta y **no** pasa por ahí. Un `prospectador` ve los avisos de Hoy y de Prospectos: **sin montos**.
  - **«Deshacer» es una Server Action real, no un guardado demorado** (demorar un pago lo pierde si el teléfono
    cambia de app). `deshacerPago` es una regla estrecha a propósito: **60 s desde el evento `cobro_pagado` y solo
    sin recibo ni anulación**; pasado eso, se anula como desde la pieza 4. Por eso `generarRecibo` confirma el
    recibo solo si `pagadoEn`, `canal` y `referencia` siguen siendo los que leyó e imprimió. «Respondió», «Sí» y
    «Descartar» no llevan Deshacer: el embudo no retrocede.
  - ⚠️ **`deshacerSalto(id)` no recibe el orden del navegador**: lo lee del evento `saltado` (`Evento.de`), con la
    fila bloqueada y solo si ese es el último movimiento. `ordenCola` es lo único que `saltar`, `aprobarFila` e
    `importar` calculan como `max + 1`: un valor venido de afuera en el tope del INT los dejaba rotos a los tres
    (lo encontró la revisión). **Ningún `ordenCola` se acepta de un cliente.**
  - ⚠️ **Dentro de `startTransition(async …)`, un `setState` normal que va antes del primer `await` no se pinta
    hasta que el servidor responde.** Lo que tiene que verse al tocar es `useOptimistic` (adentro de la
    transición) o un `setState` llamado **antes** de `empezar(...)` (así va `ajustar` en las tarjetas de Hoy y
    `setCorriendo` en la bandeja). Después de un `await`, los `setState` vuelven a ser inmediatos.
  - **No hay `router.refresh()` después de una acción**: todas llaman a `revalidatePath` de la ruta desde la que
    se usan y la respuesta ya trae el árbol nuevo; el refresh era un segundo viaje. **Una acción nueva que no
    revalide su ruta deja la pantalla vieja.** `Bandeja.aprobarTodas` conserva el suyo (varias pasadas).
  - Las cifras de Hoy con el toque encima: `ProveedorHoy`/`ResumenHoy`; el ajuste se pone en cero **durante el
    render** cuando cambia `firmaCifras` (con un efecto, un cuadro contaba el envío dos veces).
  - «¿Se envió?» es `PreguntaEnvio` + `useEnvioPendiente` (las tres pantallas que envían): sale al tocar el canal,
    se resalta al volver (`visibilitychange`) y se recuerda 30 min en `sessionStorage` (`pr:envio-pendiente`, uno
    solo a la vez) por si el navegador recargó la pestaña. El recuerdo lleva la **acción** (`envio` o
    `seguimiento`): sin ella, un envío recordado aparecía en la ficha ya enviada y su «Sí» registraba un
    seguimiento que no existió.
  - Los reductores de `src/lib/optimista-contrato.ts` **copian lo que hace cada Server Action** (desmarcar un
    pendiente borra su «avisado», mover intercambia con el vecino): si la acción cambia, el reductor cambia con
    ella. Ese archivo lo importa el navegador: de `@/lib/proyectos` solo `import type`.
  - **El éxito de una fila solo cierra lo de esa fila** (`setAbierto((a) => a?.id === id ? null : a)`): con varias
    acciones en vuelo, cerrar «lo que esté abierto» se llevaba lo escrito en otra. En la bandeja, un error por ficha.
  - Una tarjeta que se esconde con el foco adentro lo pasa antes a la siguiente (`src/componentes/foco.ts`); la
    línea flotante no se va mientras tenga el foco o el dedo encima (WCAG 2.2.1).
  - Una fila de cobro `provisional` (pagada a la vista, sin confirmar) **no dibuja `AccionesRecibo`**.
  - Recorrido real: `scripts/verificar-flujo-ux.mts` (⚠️ solo contra el clon y la base de tests): retiene cada
    Server Action 2 s y exige que la pantalla cambie antes, que «Deshacer» deshaga en la base y que no haya un
    segundo GET a la misma ruta. `scripts/capturas-panel.mts` también captura la línea flotante.
  Lo que trae la C y sus trampas:
  - **Validación en línea** = `src/componentes/Campo.tsx` + `src/lib/validacion-contrato.ts`. **Las reglas del navegador
    COPIAN las de zod del servidor** (`TOPES`, `MONTO_TEXTO`, `esFechaIso`, mínimos y topes de cada acción): si cambia
    una regla en una acción, cambia en el formulario. El servidor sigue mandando. Funciona con el envío nativo:
    `setCustomValidity` bloquea el envío y `onInvalid` muestra el mensaje **entre la etiqueta y el control** (con el
    teclado abierto lo de abajo no se ve), sin la burbuja del navegador. `autoComplete="off"` en los datos de
    prospectos y clientes (rellenar el teléfono de Neri en la ficha de un hotel sería un dato falso); solo el emisor
    de Ajustes lleva autocompletado. Web, redes y fuente van como texto, no `type="url"`: el servidor no exige `http://`.
  - **Esqueleto**: `src/app/(panel)/loading.tsx`, decorativo (`aria-hidden`) más «Cargando…» para lectores. Cambiar de
    pestaña con `?t=` dentro de un proyecto NO lo muestra (React conserva lo viejo en la transición; lo comprueba el
    recorrido). Es lo que Next prefetch-ea en las `Link` de la barra: por eso sale en ~30 ms en producción.
  - ⚠️ **Service worker `public/sw.js`, clásico, con la decisión en `decidir` (puro; `tests/sw.test.ts`)**: solo cachea
    `/_next/static/*`, iconos y manifiesto (cache primero, poda a 200) y, si una navegación del panel falla sin red,
    sirve `/sin-conexion` (precacheada con su CSS y JS al instalar). **Nunca HTML, RSC ni datos; ignora `/c/`, `/p/`,
    `/recibos/`, `/api/`, `/entrar`, `/salir` y los documentos.** Se registra solo en producción (`RegistrarSW` en el
    layout del panel; `next dev` no lo tiene). `/sw.js` sale con `Cache-Control: no-cache` (`next.config.ts`). Alcance
    `/`: en el mismo navegador sirve también los `/_next/static/` del portal (assets públicos con hash), nada más. La
    página de sin conexión vive en su propia caché (`pr-sin-conexion-*`), que la poda no toca; iconos y manifiesto
    (sin hash) van por red y la copia es solo de respaldo. **Al cambiar `/sin-conexion` o el propio `sw.js`, subir
    `VERSION`** para que `activate` bote las cachés viejas (lo encontró la revisión: con la poda FIFO en una sola caché,
    a los 6-8 despliegues se comía la página de sin conexión).
  - Recorrido real: `scripts/verificar-flujo-ux-c.mts`, **contra `next start` del clon** (build previo con
    `NODE_ENV=production`; en dev no hay SW) y con `PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1` (sin eso el
    `route()` de Playwright no ve las peticiones del SW y `setOffline` tampoco las corta). ⚠️ Los otros recorridos
    (`verificar-flujo*.mts`, portal, recibos) están hechos para `next dev`: contra `next start` fallan por el arnés
    (la cookie es `Secure` y `ctx.request` no la manda por `http://127.0.0.1`; el prefetch de producción parece un
    «segundo viaje»), no por el código. En dev, las capturas de Playwright pueden disparar avisos de hidratación
    (`caret-color: transparent` que inyecta la captura): son del arnés.
- ⚠️ **Procesos: matar solo por PID.** Nunca `pkill`/`killall` ni matar por patrón en este servidor:
  `pkill -f next-server` tumbó los cinco sitios de PM2 el 16-sep (Adastram incluido). Un dev server de
  prueba se lanza desde un clon fuera del docroot con `DATABASE_URL` de prueba, con
  `node node_modules/next/dist/bin/next dev -p <puerto>` (sin `npx` y **sin subshell con `cd`**: si no, `$!`
  es el envoltorio y no node), guardando `$!`; `next dev` deja además un hijo `next-server`: al terminar
  `kill $PID $(pgrep -P $PID)` y comprobar el puerto con `ss -ltnp`, no solo `pgrep`. Nunca `next dev` ni
  `next build` en este directorio salvo el build del despliegue.
- La plataforma de cinco piezas está completa. Plan nuevo por pieza en `docs/superpowers/plans/`.
  Menores que quedaron anotados y pueden esperar: el desalojo FIFO de `src/lib/rate-limit.ts` (desalojar
  primero las entradas no bloqueadas), `mismoOrigen` toma el primer `X-Forwarded-Host` (teórico: un navegador
  ajeno no puede poner esa cabecera y Next hace lo mismo), y el vigía de guardas no mira `layout.tsx`.
  Pendiente aparte: la **pasada de UX** del panel
  (`docs/superpowers/specs/2026-09-17-ux-panel-design.md`, propuesta sin aprobar).
- **Respaldo diario (desde el 17-sep):** `scripts/respaldo.sh` por cron a las 03:40 → `~/backups/prospectos/`
  (volcado de la base y tar de `recibos/` + `documentos/`, 30 días; más `archivos-espejo/`, copia acumulativa sin
  borrado). Credenciales en `~/.config/prospectos/my.cnf` (600) y nombre de la base en `base-nombre`; log en
  `~/.config/prospectos/respaldo.log`. **Está en el mismo disco**: cubre errores, no la pérdida del servidor; copiar
  `~/backups/prospectos` fuera queda pendiente de Neri.
- Pendientes de Neri: probar una subida real de ~10 MB desde el teléfono (el tope de Apache/ModSecurity de este cPanel
  no se puede probar desde el clon); rotar la contraseña de la base (spec, decisiones abiertas) y decidir los precios
  de farmacias (bloquea la propuesta de ese nicho; hoy `farmacias` no tiene plantilla y la ficha no
  muestra enlace de propuesta).

**Medición de neracosu.com (21-oct, en producción):** `/web` (solo `dueno`; tarjeta en Hoy con las solicitudes sin
atender y las personas de 7 días). Dos rutas **públicas** que llama neracosu.com: `POST /api/web/evento` (vistas, clics,
secciones de la home; lo manda `assets/js/medir.js` por `sendBeacon`) y `POST /api/web/solicitud` (el formulario de
contacto: guarda en `SolicitudWeb` y avisa por `sendmail` a info@neracosu.com, `src/lib/correo.ts`; fuera de producción
no manda nada). Solo aceptan `Origin` de neracosu.com (`ORIGENES_WEB`), cuerpo `text/plain` con JSON y tope de bytes;
120 eventos/min y 5 solicitudes/15 min por IP; robots por User-Agent (204 sin guardar) y campo trampa `sitio` (200 sin
guardar). **Sin IP ni cookies**: la «persona» es una sesión al azar de `sessionStorage`. Lo puro en
`src/lib/web-contrato.ts`; `EventoWeb` se poda a 400 días al abrir `/web`. Recorrido: `scripts/verificar-flujo-web.mts`
(solo clon + base de tests; el clon ya no puede usar el 3014, que es de `gygshopping`: usar 3021). Si cambia el dominio
o la CSP de neracosu.com, revisar `connect-src` en su `.htaccess`.

**Hoteles son dos nichos desde el 17-sep** (decisión de Neri): `hoteles` (de paso/motel, alta rotación: la propuesta
original) y `hoteles-estadia` (urbanos, económicos, posadas: venden por noche). Los 132 se repartieron por
`Prospecto.tipo` con `scripts/dividir-hoteles.mts` (46 y 86; idempotente, deja un evento `nota` en cada movido) y el
nicho lo siembra `scripts/sembrar-nichos.mjs`. La propuesta de estadía **no lleva tabla de precios**: ponerle una
exige publicarla antes en `neracosu.com/para/` (regla del sitio). Los dos nichos comparten etiquetas OSM: en la bandeja
se decide por el tipo. Meliá y Eurobuilding no son prospectos (PMS corporativo).

Decisiones de Neri del 16-sep que no se deducen del código: el buscador **no hace scraping masivo de
Google** (bloquea la IP compartida con Adastram); el portal del cliente **no muestra horas ni tarifa**;
los recibos son «recibo de pago», **nunca «factura»**; el acceso del cliente es **por cliente, no por
proyecto**.

## Cómo se vende (decisión de Neri, 6-oct-2026)

**No se vende «una plataforma»: se vende lo que el dueño deja de hacer a mano, y lo primero que se muestra es el bot
de WhatsApp que atiende, vende y cobra, conectado a su plataforma.** La plataforma se cuenta después, como lo que
hace que el bot diga cosas ciertas. «Automatización» sola es una palabra gastada: lo que distingue es *conectado*.

- **Solo se pone el bot al frente donde opera de verdad.** Hoy es un hotel de La Guaira (Hotel VIP): consulta lo que
  hay libre, toma la reserva y cobra el anticipo. El de Terrazas está en pausa. Por eso el giro empezó por
  `hoteles-estadia` (propuesta, mensajes y `/para/hoteles`); los demás nichos siguen como estaban.
- **Terrazas VIP Sport Park cerró por ahora (6-oct).** Las propuestas ya no lo dan como negocio en operación:
  reservas dice «un bowling de La Guaira» (antes «dos complejos») y cobros «dos negocios» (antes tres); Terrazas
  queda nombrado como sistema construido, en pausa. **Antes de escribir «opera hoy» sobre una referencia, confirmar
  con Neri que el negocio sigue abierto.**
- El bot actual corre con un proveedor externo; el servicio propio está solo diseñado (`~/bot-whatsapp/DISENO.md`).
- **Sin resolver:** cómo entra el bot en los planes (hoy en estadía va en Profesional y Completo y su consumo «se
  estima aparte») y qué cuesta al mes. No usar el bot de un cliente como demostración: hace falta una copia aparte.

## Reglas que no se negocian

- **Este directorio es el docroot público del subdominio.** Hasta que exista el proxy a Next, el
  `.htaccess` niega todo salvo `/.well-known/`. No quitar ese bloque sin tener el proxy andando, o
  Apache publica `CLAUDE.md` y `docs/`. Nunca un `chown -R` que toque `public_html` (su grupo es
  `nobody`; ver `public_html/CLAUDE.md`).
- **Secretos en `~/.config/prospectos/env` (600)**, nunca en el repo ni en la línea de comandos.
  Para MySQL, un `my.cnf` temporal con `chmod 600` en el scratchpad, borrado al terminar.
- **Un build a la vez en todo el servidor**, nunca desde un subagente. El daemon PM2 es compartido
  con Hotel Marte, Adastram (cobra plata real), AMEB y OCLS: `pm2 list` antes de cualquier
  `start/restart/stop/delete/save`.
- **TDD**, tests contra `neracosu_prospectos_test`, nunca contra la base real.
- **Todo se diseña para el teléfono** y se revisa a 390 px con Playwright antes de cerrarlo.
- **Solo contactos publicados por el propio negocio**, cada dato con su fuente. Nada de contactos
  personales. Las notas internas nunca salen del panel.
- **Español (Venezuela)** en todo texto visible. Comentarios en el código sin acentos.
- **Los mensajes de commit van por heredoc** (`git commit -F -`).

## Material que ya existe (fuera de este repo)

| Ruta | Qué es |
|---|---|
| `~/propuestas/hoteles/propuesta-hoteles.html` | Propuesta general de hoteles, 9 hojas, personaliza con `data-hotel`. Fuente de la plantilla del nicho hoteles |
| `~/propuestas/hoteles/pdf.cjs`, `construir.py` | Cómo se genera el PDF con Playwright |
| `~/propuestas/hoteles/prospectos/fuentes/*.json` | Los 132 hoteles (capital, centro, interior). `armar.py` sin argumentos vacía la lista: se corre con los tres JSON copiados fuera de `fuentes/` |
| `~/propuestas/hoteles-estadia/` | Propuesta para hoteles de estadía (venden por noche): fuente, PDF de 9 hojas y artefacto `3iFJCpJZ4krL3WVBoyqHTu`. Misma casa que la de hoteles; **sin precio cerrado** (diagnóstico de $250 y precio por escrito tras verlo): el calendario de noches no está construido. Es la fuente de `plantillas/hoteles-estadia.html` |
| `~/propuestas/archivo/2026-09-08-farmahogar.md` | Propuesta enviada a Farmahogar, base del nicho farmacias |
| `~/propuestas/PLANTILLA.md` | Plantilla general de propuestas |
| Artefacto `JNgfD2HQwcZYmhNDNbbUMQ` / `YBFhiJoYHATzV3UnH5HU2z` | Propuesta de hoteles y lista de hoteles publicadas en claude.ai |

## Reglas de contenido de las propuestas (vienen del sitio)

- Las cifras son verificables o no van. **Los precios de proyecto viven en `neracosu.com/para/`**
  y en ningún otro lado: una propuesta con otro número contradice la web.
- El caso de referencia hotelero va **anonimizado y sin número de habitaciones** («un hotel de alta
  rotación en Valencia»). Para decir dónde funcionan los sistemas: «Mis sistemas funcionan hoy en
  empresas de Caracas, Valencia y el exterior». No afirmar que un sistema de nicho corre en varias
  partes del país si no es cierto.
- ArmorPay es «plataforma de validación de pagos», nunca «pasarela». ZafraClic y Gustito Xpress no
  se nombran.
