# Rastro de lo que se le manda a un prospecto — diseño

Fecha: 2026-11-06. Dueño: Neri. Panel de prospección (`prospectos.neracosu.com`).

## Intención

Cuando se le manda algo a un prospecto (una propuesta a medida publicada en `neracosu.com/propuesta/<carpeta>/`,
una demo con su marca en un subdominio como `<marca>.neracosu.com`, o la propuesta por plantilla de `/p/<código>`),
Neri quiere saber **qué hizo con eso**, con la misma lectura que hoy se sacó a mano de los registros de Apache
para la demo de una tienda de ropa:

> 13:08 un iPhone desde Venezuela abrió la demo de la factura y un minuto después el panel; a las 13:11 pegó los dos
> enlaces en WhatsApp (los reenvió); a las 13:28 otro iPhone, el mismo que ya había visto la demo anterior el 28-oct,
> abrió la factura completa; a las 15:19 un tercero la abrió desde el navegador interno de una app y la cerró enseguida.

Esa lectura le dice si lo vieron, si lo hicieron circular dentro del negocio y cuándo, y con eso decide cuándo y cómo
empujar el cierre por escrito sin preguntar «¿qué le pareció?». Hoy esa información existe solo en los access-logs y
hay que leerla a mano; el panel solo sabe «abrió la propuesta» para los enlaces `/p/`, sin aparato, lugar, duración
ni reenvíos.

Palabras de Neri: «me gustaría tener esto mismo para todo lo que hagamos, todo lo que enviemos a nuestros prospectos,
poder conocer bien qué hicieron para tener una idea de la lectura»; «ver si lo compartieron, de dónde lo abrieron,
hora, etc., tal cual como lo mostraste, si está referido»; «me basta con verlo en el panel».

## Decisiones de Neri

- Se ve **en el panel**, en la ficha del prospecto y en el tablero de leads. **Sin avisos** (ni WhatsApp, ni correo,
  ni notificaciones): se consulta al entrar.
- Lo que se muestra: hora, aparato, de dónde (país y ciudad aproximada), qué páginas vio y en qué orden, cuánto
  estuvo, de dónde venía el clic (WhatsApp, Instagram, correo, directo) y **si lo reenvió**.
- **Desde ahora las propuestas se mandan siempre como enlace** a su página publicada, con el botón de bajar el PDF ahí
  mismo. No más PDF adjunto por WhatsApp: un adjunto no deja rastro de nada.
- «Confío en ti»: el cómo queda en manos del constructor y de este documento.

## Metas

1. Cada enlace que se le manda a un prospecto queda **registrado en su ficha** y produce una **línea de tiempo** por
   visitante con los datos de arriba.
2. Las **vistas previas** de WhatsApp, Telegram, Facebook, etc. se muestran como **«lo reenvió por …»** (no como
   visitas) con su hora.
3. **Las visitas de Neri no cuentan** ni se muestran por defecto (hay un interruptor «mostrar las mías»).
4. En el **tablero** cada tarjeta de lead dice en una línea qué pasó con lo enviado («Vio la propuesta hace 2 h · la
   reenvió», «Sin abrir, enviada hace 1 d»).
5. Los enlaces **ya enviados** (las dos propuestas a medida publicadas en `/propuesta/` y la demo de la tienda de ropa)
   se cargan **hacia atrás** desde los registros que ya existen, para que la ficha nazca con historia.
6. Las propuestas por plantilla (`/p/<código>`) que el panel ya manda por WhatsApp y correo reciben la misma línea de
   tiempo **sin trabajo por prospecto**: el enlace `/p/` se registra solo.

## No metas

- Avisos en tiempo real. Si Neri los pide después, la tabla de visitas ya tiene todo para dispararlos.
- Rastrear PDF adjuntos ni mensajes de WhatsApp en sí.
- Identificar personas por nombre. Se habla de «Visitante 1», «Visitante 2» (mismo aparato = mismo visitante).
- Cambiar la medición anónima de `neracosu.com` (`medir.js` sigue sin IP y sin cookies). Este rastro es solo para
  páginas **hechas para un prospecto concreto**.
- Reemplazar el evento `abierto` de `/p/` ni el píxel/clic/PDF de los correos: siguen tal cual; la línea de tiempo
  nueva los complementa.

## Antimetas (si pasa esto, falló aunque funcione)

- Contar una visita de Neri o una vista previa de WhatsApp como «lo vio el prospecto».
- Inventar precisión: la ciudad es «aproximada» y se dice así; si la IP no se resuelve, se dice «ubicación
  desconocida», nunca se adivina.
- Que el pedacito de JavaScript rompa, frene o cambie la propuesta o la demo. Si falla, falla en silencio.
- Que la ficha o el tablero se pongan lentos por esto (ver «Rendimiento»).
- Nombrar prospectos reales en el código, las pruebas o la documentación commiteada (regla de Neri: ni nombres ni URLs
  de clientes en lo que va al repo; en las pruebas se usan nombres inventados).

## Restricciones del entorno

- Panel: Next 15 (App Router, server actions), Prisma 6 sobre MySQL (`neracosu_prospectos`), Zod 4, Vitest 4. Lo puro
  va en `src/lib/*-contrato.ts` con pruebas; lo que toca base en `src/lib/*.ts`; acciones en `src/acciones/`.
  Migraciones **a mano** en `prisma/migrations/<fecha>_<nombre>/migration.sql` (así se hicieron las últimas).
- Un solo build a la vez y lo hace la sesión principal, nunca un subagente (regla de la cuenta). Antes de
  `pm2 restart prospectos --update-env`, pausar el automático de correos en Ajustes.
- **El servidor está en hora de Los Ángeles** (`-0800`); todo lo visible va en hora de **Caracas**. Las líneas de
  Apache traen su propio desfase (`[06/Nov/2026:09:08:32 -0800]`): se convierte desde ahí.
- Registros de Apache: `/home/neracosu/access-logs/<host>-ssl_log` (HTTPS, el que importa) y
  `/home/neracosu/access-logs/<host>` (HTTP, casi todo redirecciones). Formato *combined*. Son `root:neracosu 640`:
  el proceso del panel (usuario `neracosu`) los **lee sin problema**. cPanel los archiva por mes en
  `/home/neracosu/logs/<host>-ssl_log-<Mes>-<Año>.gz` y el archivo vivo puede **truncarse** (empieza de cero): el lector
  tiene que tolerarlo.
- `neracosu.com` tiene CSP en su `.htaccess`: `script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net` y
  `connect-src 'self' https://prospectos.neracosu.com`. Para cargar el script desde el panel hay que **sumar
  `https://prospectos.neracosu.com` a `script-src`**. Los subdominios de demo no tienen CSP propia.
- El panel ya tiene: `Prospecto.codigo` (16 bytes base64url, único, para `/p/`), `Evento` (historial de la ficha,
  `TEXTO_EVENTO` en las fichas de lead y directorio), `EnvioCorreo` con `token` y rastreo de correo, `EventoWeb`
  (medición anónima del sitio, poda a 400 días), `ipDesdeCabeceras`/`ipCliente` en `src/lib/ip.ts` (Apache anexa la IP
  real **al final** de `X-Forwarded-For`), `tieneSesion()` ligero, `permitirIntento` (rate limit), y el patrón de ruta
  de cron con `x-cron-secret` = `PROSPECTOS_CRON_SECRET` (`/api/correos/automatico`).
- Las propuestas a medida se construyen en `~/propuestas/<carpeta>/` con `construir.py` y se publican con
  `publicar-web.py`, que arma el `index.html` de `neracosu.com/propuesta/<carpeta>-<sufijo>/` y copia el PDF al lado.
  Las demos viven en repos propios (p. ej. `~/jamesbark-demo`, `herramientas/construir.py` + `publicar.sh` con
  `rsync` al docroot del subdominio). Ni las unas ni las otras llevan `medir.js`, y así se quedan.
- No hay base de geolocalización en el servidor (`/usr/share/GeoIP` no existe).

## Cómo funciona (decisiones del diseñador, marcadas como tales)

### 1. El enlace enviado

Entidad nueva **`EnlaceEnviado`**: lo que se le mandó a un prospecto y se quiere seguir.

| Campo | Qué es |
|---|---|
| `prospectoId` | a quién se le mandó |
| `etiqueta` | cómo lo ve Neri: «Propuesta», «Demo · factura», «Demo · panel» (≤ 40) |
| `host` | `neracosu.com`, `<marca>.neracosu.com`, `prospectos.neracosu.com` |
| `prefijo` | ruta que lo identifica en el log: `/propuesta/<carpeta>/`, `/factura/`, `/p/<código>` |
| `token` | 22 base64url, único; lo lleva el script de la página para avisar al panel |
| `origen` | `manual` (lo pegó Neri) · `plantilla` (el `/p/` de cada prospecto, automático) |
| `enviadoEn` | cuándo se mandó (por defecto, al registrarlo; editable) |
| `creadoEn`, `activo` | un enlace se puede desactivar; sus visitas se conservan |

- **Registro manual:** en la ficha del lead y del directorio, bloque «Lo que hicieron con lo enviado» → «Agregar
  enlace»: Neri pega la URL completa y una etiqueta. El panel saca `host` y `prefijo` (la ruta hasta la última `/`
  inclusive; una URL con archivo, como `/factura/index.html`, queda en `/factura/`), genera el `token` y muestra **la
  etiqueta `<script>` lista para copiar** con la instrucción de dónde va (antes de `</body>`). Dos enlaces del mismo
  prospecto no pueden tener el mismo `host`+`prefijo`. Varios enlaces del mismo subdominio (`/factura/` y `/panel/`)
  son dos filas, cada una con su etiqueta; la línea de tiempo del prospecto los mezcla en orden.
- **Registro automático de `/p/`** (decisión tras la revisión de constructor): cada prospecto con plantilla tiene
  implícito el enlace `host = prospectos.neracosu.com`, `prefijo = /p/<código>`. No se crea una fila por cada uno de
  los miles de prospectos del directorio: **la propia ruta `/p/[codigo]`, al servir la propuesta, busca o crea la fila
  `EnlaceEnviado` con `origen = plantilla`** (también cuando quien pide es un bot de vista previa: eso ya prueba que el
  enlace se mandó) con `enviadoEn` = la fecha del primer evento `enviado` del prospecto, o la de esa primera petición
  si no lo hay. Con la fila ya existe el `token`, y `renderPropuesta` **inserta la etiqueta `<script>` de `rastro.js`
  antes de `</body>`** igual que en las demos: los `/p/` tienen la misma línea de tiempo completa (duración, scroll,
  origen del clic, PDF). El evento `abierto` y el `tieneSesion()` de esa ruta siguen tal cual. El lector del log
  también reconoce el patrón `/p/<código>` por si una línea llega antes que la fila (crea la fila con la misma regla).
  `/p/<código>/pdf` cuenta como `pdf` de ese mismo enlace.
- `Prospecto.propuestaUrl` (campo libre que ya existe en el lead) **se mantiene**; al guardarlo con una URL de
  `neracosu.com/propuesta/` o de un subdominio `*.neracosu.com`, la ficha ofrece «Seguir este enlace» con un clic que
  lo registra con etiqueta «Propuesta». No se registra solo: Neri decide.

### 2. Dos fuentes que se cruzan

**a) El registro de Apache (fuente `log`).** Es la fuente **principal**: ve todo lo que pidió cualquier cliente,
incluido lo que ningún JavaScript puede ver (vistas previas de mensajería, aparatos sin JS, descargas directas del
PDF).

- Un **lector** recorre los archivos `-ssl_log` (y el HTTP por si acaso) de cada `host` con enlaces activos, desde la
  última posición leída. Estado por archivo en una tabla **`LecturaLog`** (`archivo`, `inode`, `posicion`, `leidoEn`).
  **El archivo vivo se trunca todos los días a las ~04:12 hora del servidor (08:12 de Caracas)**, y cPanel anexa lo del
  día al `.gz` del mes en `~/logs/<host>-ssl_log-<Mes>-<Año>.gz` (gzip de varios miembros: se lee entero, no tiene
  posición útil). Cuando el lector detecta `inode` distinto o tamaño menor que `posicion`, **relee completo el `.gz`
  del mes en curso** (para recuperar las líneas escritas entre su última pasada y el truncado) y después el archivo
  vivo desde cero. Para que nada se cuente dos veces, cada visita guarda una **huella** (`sha256` de la línea cruda,
  16 hex) con índice único por enlace: el duplicado se ignora. El importador hacia atrás (§6) es **el mismo código**
  apuntado a todos los `.gz` que haya, no un script aparte.
- De cada línea toma: IP, fecha con su desfase, método, ruta, estado, referer, user-agent. Solo `GET` con estado 200,
  **206** (WhatsApp pide la vista previa con `Range`: en el log real del 6-nov los reenvíos salen como 206) o 304. Los
  301 y 404 no se guardan. Se queda con las **páginas**: ruta igual al prefijo, o que termina en `/`, o sin extensión, o `.html`; más los
  `.pdf` (evento `pdf`). CSS, JS, imágenes, JSON, fuentes y `favicon.ico` se ignoran.
- Clasificación por user-agent (en `rastro-contrato.ts`, puro, con pruebas sobre líneas reales anonimizadas):
  - **Reenvío** (`tipo = reenvio`, `detalle = whatsapp | telegram | facebook | instagram | twitter | slack | discord |
    linkedin | imessage | otro`): `WhatsApp/`, `facebookexternalhit`, `TelegramBot`, `Twitterbot`, `Slackbot`,
    `Discordbot`, `LinkedInBot`, `Facebot`, `iMessage`… Es la petición que hace la app para armar la vista previa
    **cuando alguien pega el enlace**. Dos reenvíos del mismo visitante al mismo prefijo dentro de 60 s son uno (WhatsApp
    pide dos veces).
  - **Robots y herramientas** (se descartan sin guardar): `bot`, `crawl`, `spider`, `HeadlessChrome`, `curl`,
    `python-requests`, `Go-http`, `Atalaya-monitor`, `ClaudeBot`, `getdomaindata`, `SemrushBot`, `Lighthouse`.
  - **Visita** (`tipo = vista`): lo demás.
- **Visitante** = `sha256(ip + "|" + user-agent)` recortado a 16 hex. Mismo teléfono con la misma IP = mismo
  visitante. Si cambia la IP (datos a wifi) se ve como otro visitante: se acepta y se dice en la interfaz («mismo
  aparato o parecido» no se afirma nunca; a lo sumo «iPhone · iOS 18.7» coincide a la vista).
- **Aparato** a partir del user-agent, resumido en texto corto y estable (`resumirAparato`): «iPhone · iOS 18.7 ·
  Safari», «Android · Chrome», «Windows · Chrome 156», «Mac · Safari», y la marca **«navegador dentro de una app»**
  cuando es un WebView (iPhone sin `Safari/` en el UA; Android con `; wv)` o `Instagram`/`FBAN`/`WhatsApp` en el UA).
- **Lugar** por IP con **DB-IP Lite (ciudad)** en formato `.mmdb`, leído con la librería pura `mmdb-lib` (sin compilar
  nada). El archivo vive **fuera del repo**, en `~/.config/prospectos/geo/dbip-city-lite.mmdb`; un script
  `scripts/actualizar-geo.mts` lo baja (es mensual) y se puede poner en el crontab el día 3 de cada mes. **El `.mmdb`
  de ciudad pesa 120-140 MB en memoria y `prospectos` comparte el daemon de PM2 con otros siete procesos: el panel
  (rutas y acciones) NUNCA lo carga.** La geolocalización la hace solo el **proceso del cron**
  (`scripts/rastro-leer.mts`: lee los logs, resuelve las visitas con lugar pendiente, termina y libera la memoria).
  Las visitas que entran por el botón «Actualizar» o por `rastro.js` quedan con `geoPendiente = true` y la interfaz
  dice «ubicación: en unos minutos» hasta la siguiente pasada (≤ 10 min). La licencia (CC BY 4.0) pide atribución: al
  pie del bloque va «Ubicación aproximada por IP · DB-IP». Si el archivo no está o la IP no resuelve → `pais = ""`,
  `ciudad = ""`, `geoPendiente = false` y la interfaz dice «ubicación desconocida». Las IP de VPN y de *relay*
  (iCloud Private Relay sale por Fastly/Cloudflare/Akamai; Datacamp/M247 son VPN) se resuelven a donde digan y se
  marca `red = vpn|relay|hosting` si el `.mmdb` o una lista corta de rangos conocidos lo indica; la interfaz lo dice
  («desde una VPN»). Esta lista corta es del constructor y puede empezar vacía.
- La **IP se guarda** en la visita (hace falta para agrupar, excluir y re-geolocalizar) y se **poda a 400 días**, igual
  que `EventoWeb`. Nunca se muestra en la interfaz; solo el país, la ciudad y «misma red que …» si hace falta.

> **Nota (2026-11-06, tarea 14):** desde los rangos de Meta (`esIpDeMeta`) solo cuenta la línea con UA de vista previa
> (`reenvio`); las demás se descartan, y el visitante de un reenvío es la app (`visitanteDe("reenvio", app)`), no la
> IP. Ver la nota al final de §4.

**b) El script en la página (fuente `js`).** Añade lo que el log no sabe: **cuánto estuvo**, **hasta dónde bajó**,
**qué tocó** y **de dónde venía el clic** (referer y `?de=`).

- `public/rastro.js` del panel (≤ 3 KB, sin dependencias, `defer`, envuelto en `try`), se incluye en la página con
  `<script src="https://prospectos.neracosu.com/rastro.js?v=1" data-enlace="<token>" defer></script>`. Un fallo del
  script o del panel **no cambia nada en la página**.
- Manda a `POST /api/rastro/evento` (público, CORS limitado a `*.neracosu.com` y `neracosu.com`, cuerpo `text/plain`
  JSON ≤ 2 KB, rate limit 120/min por IP, robots por UA → 204 sin guardar, como `/api/web/evento`):
  - `inicio`: al cargar; `ruta`, `origen` (igual que `medir.js`: `?de=`, `utm_source`, `fbclid`, o el host del
    referer si no es nuestro), `ancho` de pantalla.
  - `fin`: en `pagehide`/`visibilitychange→hidden`, por `sendBeacon`; `segundos` visibles (contados solo con la
    pestaña visible) y `scroll` máximo en % (0–100). Si la página se cierra sin `fin`, la vista queda sin duración y la
    interfaz no dice nada de tiempo.
  - `clic`: en cualquier `a` o `button` con `data-rastro="<nombre>"` (p. ej. `pdf`, `whatsapp`, `plan-b`), y por
    defecto en enlaces a `.pdf`, `wa.me`, `mailto:` y `tel:`. `detalle` = el nombre.
- El servidor calcula `visitante` **con la misma fórmula** (IP del `X-Forwarded-For` + UA de la petición): así los
  eventos `js` caen en el mismo visitante que las líneas del log.
- **«Soy yo»**: abrir cualquier página rastreada con `?soyyo=1` guarda una marca en `localStorage` y el script deja
  de mandar en ese navegador (`?soyyo=0` la quita). Es el equivalente de `?nomedir=1` del sitio.

### 3. Exclusión de las visitas de Neri

Una visita es «propia» si cumple cualquiera de estas; se guarda igual (con `propia = true`) pero **no cuenta ni se
muestra** salvo con «mostrar las mías»:

1. La IP está en **`Configuracion.rastro_ips_propias`** (lista editable en Ajustes, solo dueño; arranca con la IP de la
   casa y la de la VPN del PC, que Neri confirma). Es por IP porque son conexiones fijas de Neri; él la administra.
2. El **visitante** (`sha256(ip|ua)`, la misma fórmula del log) coincide con el de **cualquier usuario del panel**
   (dueño o prospectador) **en los últimos 30 días**. Es por visitante y no por IP sola porque el teléfono con datos
   sale por una IP de operadora compartida con muchísima gente (CGNAT): marcar esa IP entera escondería a prospectos
   reales. Hoy las sesiones no guardan nada de esto: el constructor agrega un registro ligero
   (`Configuracion.rastro_visitantes_sesion`, JSON `{visitante: últimaVez}`, ≤ 60 entradas) que `exigirSesion` y el
   login actualizan leyendo IP y `user-agent` de `headers()`, como mucho una vez por hora por visitante.
3. Marcas de herramientas propias: `HeadlessChrome`, `Atalaya-monitor`, `curl` (ya se descartan como robots).
4. Las visitas con `?soyyo=1` nunca llegan (lado cliente), pero las líneas del log de ese mismo aparato sí: por eso la
   regla 2 importa. `?soyyo=1` hay que ponerlo una vez por subdominio (cada origen tiene su `localStorage`).

Las visitas que entren antes de que un visitante o IP se marque propio **no se reclasifican solas**; en la línea de
tiempo, «Es mío» sobre un visitante lo agrega a la lista **y** reclasifica sus visitas; en Ajustes se puede marcar una
IP entera igual.

**Para la carga hacia atrás** (no hay registro de sesiones de antes): el importador reconstruye la regla 2 leyendo
el log del propio panel (`prospectos.neracosu.com-ssl_log*`): todo visitante con 200 en páginas con sesión (`/inicio`,
`/hoy`, `/leads`, `/prospectos`, …) en los 30 días anteriores a la visita es propio. Más la lista 1 sembrada a mano.

> **Decisión de la revisión final (2026-11-06): esa reconstrucción no se implementó.** `cargarPropios` solo lee la
> configuración, así que la carga hacia atrás excluye por la lista de IPs (regla 1) y por los visitantes e IPs de
> sesión que existan en el momento de importar; una visita vieja de Neri desde otro aparato se marca a mano con «Es
> mío». Se suma además una regla para los reenvíos: WhatsApp arma la vista previa desde el teléfono del remitente, así
> que un **reenvío** (solo reenvíos) desde una IP con sesión del panel a menos de 24 h es propio
> (`Configuracion.rastro_ips_sesion`, JSON `{ip: últimaVez}`, ≤ 60).

### 4. Cruce de las dos fuentes

- La tabla de visitas (**`VisitaEnlace`**) guarda cada evento con `fuente = log | js`, `tipo = vista | reenvio | pdf |
  inicio | fin | clic`, `enlaceId`, `visitante`, `ip`, `aparato`, `ua` (≤ 300), `pais`, `ciudad`, `red`,
  `geoPendiente`, `ruta`, `detalle`, `origen`, `segundos`, `scroll`, `propia`, `huella` (solo `log`), `ocurrioEn` (la
  hora real del evento, no la de inserción), `creadoEn`.
- La línea de tiempo se arma en `rastro-contrato.ts` (puro) a partir de las filas: una **vista** `log` y un `inicio`
  `js` del **mismo visitante y misma ruta dentro de 90 s** son **la misma apertura**; el `fin` que sigue del mismo
  visitante y ruta le pone duración y scroll; los `clic` se cuelgan de esa apertura. Una apertura sin línea de log (p.
  ej. el log todavía no se leyó) se muestra igual con lo que trajo el `js`; cuando llegue la línea se funde. Un
  `inicio` sin `vista` **sigue siendo una apertura** (el `js` no miente sobre que la página cargó).
- Recargas del mismo visitante y ruta dentro de 60 s son una sola apertura.

> **Nota (2026-11-06, tarea 14): el envío propio y los robots de Meta.** Con datos reales del 1-nov (una propuesta
> enviada por Instagram), pegar el enlace en un mensaje hizo que Meta pidiera la página desde ~12 IPs en el mismo
> minuto con `facebookexternalhit` y, además, desde IPs de Meta y de AWS con UA de navegador Android: la ficha decía
> «la reenvió · 6 personas» sin que el prospecto hiciera nada. Tres reglas:
> 1. **IPs de Meta** (`esIpDeMeta`, CIDR de AS32934 más `2a03:2880::/32`): la línea se descarta salvo que su UA sea de
>    vista previa (`reenvio`); un evento `js` desde ellas recibe 204 sin guardar.
> 2. **El visitante de un reenvío es la app** (`visitanteDe("reenvio", app)`), no IP+UA: la ráfaga es un solo
>    visitante y la fusión de 60 s la deja en una fila. La IP se guarda igual; el alias de `visitasDe` le sigue
>    poniendo el visitante real con la misma IP (WhatsApp o Telegram desde el teléfono de alguien). «Es mío» no acepta
>    el visitante de una app (marcaría todos los reenvíos de todos los prospectos).
> 3. **Un reenvío no propio anterior a la primera apertura no propia de su enlace es el envío** (clase `envio`): se
>    pinta en gris («Enviado por …»), no crea visitante ni cuenta en «reenviado N veces» ni en el «la reenvió» del
>    tablero (`resumenesParaTablero` compara el último reenvío de cada grupo con la primera apertura del enlace).

### 5. Cuándo se lee el log

- **Cron cada 10 minutos** que corre directamente `node scripts/rastro-leer.mts` (proceso aparte, con el env de
  `~/.config/prospectos/env`; no pasa por HTTP). Lee todos los hosts con enlaces activos más `prospectos.neracosu.com`
  (por los `/p/`), geolocaliza lo pendiente y termina. Una pasada normal tarda milisegundos de lectura (solo lo nuevo)
  más la carga del `.mmdb` cuando hay algo que resolver. Log `[rastro] <fecha hh:mm>: N líneas, M visitas, K
  pendientes de lugar` solo cuando hubo algo.
- La lógica de lectura vive en `src/lib/rastro-lector.ts` y la usan el script y el panel. Botón **«Actualizar»** en el
  bloque de la ficha: server action (solo con sesión) que lee el log de los hosts de ese prospecto, **sin
  geolocalizar**, y refresca. Así Neri no espera los 10 minutos cuando acaba de mandar algo; el lugar llega después.
- Un **candado** (`Configuracion.candado_rastro`, patrón de `candado_correos` con `SELECT … FOR UPDATE`) evita que el
  cron, «Actualizar» y el registro de un enlace lean a la vez.
- Al **registrar un enlace** nuevo, el panel lee de inmediato lo que haya en el archivo vivo de ese host para ese
  prefijo (**desde el principio del archivo**, no desde la posición guardada) y ofrece «Cargar también lo archivado»
  que corre el importador de abajo para ese enlace. Si dos enlaces del mismo host se anidan (`/demo/` y
  `/demo/panel/`), la línea va al **prefijo más largo** que coincida.

### 6. Carga hacia atrás

`scripts/rastro-leer.mts --importar --enlace <id> [--desde AAAA-MM-DD] [--aplicar]` (el mismo lector, apuntado a todos
los `.gz`): recorre `/home/neracosu/logs/<host>-ssl_log-*.gz` y el archivo vivo, filtra por prefijo y mete las visitas
con su `ocurrioEn` real, deduplicadas por `huella`, marcando propias con la reconstrucción de §3. Sin `--aplicar` solo
cuenta. Se corre una vez para los tres enlaces existentes (dos propuestas en `/propuesta/`, la demo de
la tienda de ropa con `/factura/` y `/panel/`) y para los `/p/` que ya tuvieron evento `abierto`. El resultado tiene que
reproducir la lectura del 6-nov citada arriba (es la **prueba de aceptación** del lector).

### 7. Lo que se ve

**Ficha del lead y del directorio** (`/leads/[id]`, `/prospectos/[id]`), bloque **«Lo que hicieron con lo enviado»**
encima del Historial:

- Si no hay enlaces: una línea «Nada registrado» y «Agregar enlace». Con `propuestaUrl` candidata: «Seguir este
  enlace».
- Por enlace: etiqueta, URL corta, «enviado el …», resumen de una línea: «3 visitantes · 6 aperturas · reenviado 2
  veces · PDF bajado 1 vez» o «Sin abrir». Botones: copiar la etiqueta `<script>`, desactivar.
- **Línea de tiempo** del prospecto (todos sus enlaces mezclados), agrupada por día, más reciente arriba, en hora de
  Caracas. Cada fila: hora · **Visitante N** (numerados por orden de primera aparición en ese prospecto) con su
  aparato y lugar la primera vez que aparece en el día («iPhone · iOS 18 · Venezuela, Caracas», «Windows · Chrome ·
  desde una VPN», «navegador dentro de una app») · acción:
  - «Abrió *Demo · factura*» (+ «2 min 10 s · bajó hasta el 90 %» si hay `fin`; + «venía de instagram.com» si hay
    origen),
  - «Volvió a *Demo · factura*» cuando ya la había abierto,
  - «**Reenvió** *Demo · panel* por WhatsApp» (resaltado: es la señal que más le importa a Neri),
  - «Bajó el PDF», «Tocó WhatsApp», «Tocó *plan B*».
- Interruptor «Mostrar las mías» (apagado por defecto). Botón «Actualizar». Pie: «Ubicación aproximada por IP ·
  DB-IP».
- En **390 px** la tabla se vuelve lista (hora y acción en una línea, visitante debajo); el panel ya tiene ese patrón
  en el historial.

**Tablero (`/leads`)**, en `TarjetaLead`, una línea `lead__rastro` debajo del siguiente paso, solo si el lead tiene
enlaces:

- «Vio la propuesta hace 2 h» · «…y la reenvió» si hubo reenvío · «3 personas» si hay más de un visitante.
- «Sin abrir · enviada hace 1 d» (gris) si no hay aperturas no propias.
- El texto lo arma `resumenTarjeta(...)` en `rastro-contrato.ts` (puro, con pruebas), con «hace …» relativo a Caracas.

**Correos (`/correos`) y `/web`:** sin cambios.

### 8. Rendimiento

- `listarLeads` trae el resumen por lead en **una sola consulta agregada** (último `ocurrioEn` no propio, número de
  visitantes distintos, si hubo `reenvio`) sobre `VisitaEnlace` unida a `EnlaceEnviado`, para los ids de la página;
  nada por tarjeta.
- Índices: `VisitaEnlace(enlaceId, ocurrioEn)`, `VisitaEnlace(enlaceId, huella)` único, `VisitaEnlace(ip)`,
  `EnlaceEnviado(prospectoId)`, `EnlaceEnviado(host, prefijo)`.
- La ficha carga como mucho las últimas 500 visitas del prospecto; más allá, «ver todo».

### 9. Cambios fuera del panel (los hace la sesión principal, no son del constructor del panel)

- `neracosu.com/.htaccess`: `script-src` suma `https://prospectos.neracosu.com`.
- `~/propuestas/*/publicar-web.py`: acepta el `token` (constante `RASTRO_TOKEN` en el script de cada propuesta) y
  antepone la etiqueta `<script>` a `</body>`; el botón del PDF lleva `data-rastro="pdf"`. Se republican las dos
  propuestas publicadas.
- Demos: su `construir.py` hace lo mismo con un token por página rastreada (`/factura/` y `/panel/` de la tienda de
  ropa). Se republican.
- Crontab: `*/10 * * * * bash -c 'set -a; . ~/.config/prospectos/env; set +a; cd ~/public_html/prospectos.neracosu.com
  && node scripts/rastro-leer.mts >> ~/.config/prospectos/rastro.log 2>&1'` y la del `.mmdb` el día 3 de cada mes.

## Decisiones tomadas tras la revisión de constructor (6-nov)

El revisor independiente planteó cuatro dudas; se resolvieron así, sin consultar a Neri porque no cambian lo que él
pidió:

1. **`/p/` también lleva `rastro.js`**: la ruta crea la fila `EnlaceEnviado` al servir y `renderPropuesta` inserta el
   script (§1).
2. **«Propia» por visitante (IP + UA) para las sesiones del panel**, por IP solo en la lista manual; el importador
   reconstruye las sesiones viejas desde el log del propio panel (§3).
3. **El log vivo se trunca a diario**: al detectar truncado se relee el `.gz` del mes; la huella evita duplicados; el
   importador es el mismo lector (§2a, §6).
4. **El `.mmdb` de ciudad no se carga en el proceso del panel**: solo en el script del cron; mientras tanto la visita
   dice «ubicación: en unos minutos» (§2a, §5).
5. Estado **206** cuenta (así llegan las vistas previas de WhatsApp) (§2a).
- `~/.config/prospectos/geo/` creado y con el `.mmdb` bajado antes del primer despliegue.

## Lo que queda al constructor

- Nombres finales de tablas, columnas, rutas, componentes y archivos (siguiendo el español sin acentos del repo).
- El parser de líneas *combined* (hay comillas escapadas en algunos UA: `\"`), la tabla de user-agents y su
  mantenimiento, el detalle del `resumirAparato`.
- Lista de rangos VPN/relay (puede empezar vacía; la interfaz no debe depender de ella).
- Cómo se actualiza el `.mmdb` (URL de DB-IP Lite del mes, verificación de tamaño mínimo, respaldo del anterior).
- Pruebas: contrato (parser, clasificación, visitante, fusión log+js, resúmenes de tarjeta y ficha), acciones
  (registrar enlace, desactivar, marcar IP propia), ruta pública (`/api/rastro/evento`: CORS, robots, tamaño, rate
  limit) y el lector (truncado, rotación, duplicados). Recorrido `scripts/verificar-flujo-rastro.mts` contra el clon
  (puerto 3021) con un log de prueba inventado.
- Textos de la interfaz: español de Venezuela, voz de usted no aplica (es el panel de Neri), sin jerga.

## Criterio de hecho

1. El importador reproduce sobre la demo de la tienda de ropa la línea de tiempo del 6-nov (tres visitantes no
   propios, dos reenvíos por WhatsApp a las 13:11 y 13:35, las visitas de Neri marcadas propias).
2. Al abrir una propuesta publicada desde un teléfono real, en menos de 10 minutos la ficha muestra la apertura con
   aparato, lugar aproximado y duración, y el tablero dice «Vio la propuesta hace X min».
3. Pegar el enlace en un WhatsApp propio produce «Reenvió … por WhatsApp» y no una apertura.
4. Abrir la página desde el PC de Neri con sesión en el panel no aparece salvo con «Mostrar las mías».
5. `npm test` en verde; `tsc --noEmit` limpio; `prospectos.neracosu.com` responde 200 y `pm2 list` muestra
   `prospectos` online sin subir el contador de reinicios.
