# Panel de prospección NERACOSU — Notas para Claude

Plataforma de Neri para prospectar por nicho y llevar los proyectos vendidos. Pieza 1 (panel de
prospección: cola del día, embudo, propuesta por enlace, seguimientos) en producción en
`prospectos.neracosu.com`. Entra con PIN.

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
  precio (diagnóstico $250). Los mensajes de todos los nichos mandan `{enlace}`. La ficha tiene «PDF»
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
