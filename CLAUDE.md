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
| 5 | Portal del cliente | `2026-09-16-portal-cliente-design.md` | **5a implementada (17-sep)** · 5b pendiente |

Orden de construcción: **1 → 3 → 2 → 4 → 5**. Cada pieza sale a producción cuando termina.

Estado al 17-sep: **piezas 1, 3, 2, 4 y 5a construidas y en producción.** Falta la 5b (documentos con
subida de archivos y plantillas de aviso), sin plan todavía.

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
  `scripts/verificar-flujo-portal.mts` (⚠️ igual: solo contra el clon y la base de tests, ver pieza 5a),
  `scripts/sembrar-nichos.mjs`, `scripts/importar-hoteles.mts`, `scripts/generar-iconos.mts`.
- **Pieza 3 (Proyectos y cobros) en producción:** `/proyectos`, `/proyectos/nuevo`, `/proyectos/[id]` (pestañas
  cobros · pendientes · horas · versiones · cliente), `/clientes`, `/clientes/[id]`, `/clientes/nuevo`; Ajustes
  suma mensajes de cobro, datos del emisor y tarifa por hora. **Cron de mensualidades dentro de la app**
  (`src/instrumentation.ts` → `src/lib/mensualidades.ts`): corre al arrancar y a las 06:00 de Caracas,
  idempotente por `(proyectoId, mes)`, deja una línea `[mensualidades] <fecha>: N creadas de M activos` en
  cada corrida (si no aparece tras un `pm2 restart`, el cron no arrancó). Un proyecto con mensualidad 0 no
  genera cobros; al activar un cliente que ya existía solo se generan mensualidades desde hoy (el rescate
  de 60 días nunca va antes del primer mes facturado). Recorrido real: `scripts/verificar-flujo-proyectos.mts`.
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
    de la inactividad de 10 s, tope de bytes, máximo 3 redirecciones.
  - **Overpass:** una consulta a la vez por proceso, 5 s entre consultas, User-Agent identificado, caché
    de 7 días en `BusquedaOsm` con huella de la consulta (cambiar `etiquetaOsm` la invalida); solo se
    cachean respuestas 200 con resultados; una búsqueda puede tardar hasta 90 s. Ciudades y alias en
    `CIUDADES` de `src/lib/overpass-contrato.ts`. Un nicho sin `etiquetaOsm` no se puede buscar en el mapa
    (lo llena `scripts/sembrar-nichos.mjs`). `PROSPECTOS_OVERPASS_ESPERA_MS` solo se respeta fuera de
    producción.
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
  - Pendiente menor: `guardarUsuario` y el restablecer PIN de Ajustes aceptan el id de una cuenta `cliente` si
    el dueño fabrica el formulario a mano (falta `rol: { in: ROLES_PANEL }` en el `where`).
- ⚠️ **Procesos: matar solo por PID.** Nunca `pkill`/`killall` ni matar por patrón en este servidor:
  `pkill -f next-server` tumbó los cinco sitios de PM2 el 16-sep (Adastram incluido). Un dev server de
  prueba se lanza desde un clon fuera del docroot con `DATABASE_URL` de prueba, con
  `node node_modules/next/dist/bin/next dev -p <puerto>` (sin `npx` y **sin subshell con `cd`**: si no, `$!`
  es el envoltorio y no node), guardando `$!`; `next dev` deja además un hijo `next-server`: al terminar
  `kill $PID $(pgrep -P $PID)` y comprobar el puerto con `ss -ltnp`, no solo `pgrep`. Nunca `next dev` ni
  `next build` en este directorio salvo el build del despliegue.
- Siguiente pieza: **5b (documentos del cliente con subida de archivos y plantillas de aviso)**, sin plan.
  Al construirla: vigía de que toda ruta bajo `src/app/c/` exija la sesión (al estilo de
  `tests/instrumentation-grafo.test.ts`), y resolver a dónde va el cliente con la sesión vencida (hoy
  `/recibos/*` sin sesión manda al teclado del **panel**). Plan nuevo por pieza en
  `docs/superpowers/plans/`. Pendiente aparte: la **pasada de UX** del panel
  (`docs/superpowers/specs/2026-09-17-ux-panel-design.md`, propuesta sin aprobar).
- Pendientes de Neri: decidir si los recordatorios de cobro llevan el enlace del portal por defecto (hoy
  solo si él agrega `{enlace}` al mensaje en Ajustes); rotar la contraseña de la base (spec, decisiones abiertas) y decidir los precios
  de farmacias (bloquea la propuesta de ese nicho; hoy `farmacias` no tiene plantilla y la ficha no
  muestra enlace de propuesta).

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
