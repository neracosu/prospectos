# Pieza 1 — Panel de prospección — diseño

**Fecha:** 2026-09-16 · **Dueño:** Neri Colón · **Estado:** aprobada completa (partes 1, 2 y 3) en la
sesión del 16-sep. Ver «Decisiones abiertas» al final. Es la pieza 1 de cinco: ver
`2026-09-16-plataforma-vision-general.md` para roles, canales, navegación y orden de construcción.

**Cambios del 16-sep (tarde), acordados al diseñar las otras piezas:** dos roles (`dueno`,
`prospectador`), meta diaria por usuario, `usuarioId` en cada `Evento`, ocho canales de contacto,
`origen`/`facebook`/`tiktok` en `Prospecto`, barra de navegación de cinco botones, y `ganado`
ofrece crear el proyecto (pieza 3). Están integrados abajo.

## Qué es y por qué

Neri armó a mano, para hoteles, una **propuesta general de 9 hojas** y una **lista de 132 hoteles** con
sus contactos públicos y un botón de WhatsApp (artefactos de claude.ai, fuentes en
`~/propuestas/hoteles/`). Le gustó y quiere repetirlo con otros nichos, empezando por **farmacias**
(ya le envió una propuesta a Farmahogar), y trabajar la prospección **todos los días**: enviar
propuestas y llevar el registro de a quién ya se le envió y en qué quedó.

La lista de hoteles de hoy guarda «Contactado» en el `localStorage` del navegador: se pierde al
cambiar de teléfono y no dice nada después del envío. Este panel lo reemplaza.

Se eligió **Next.js** (y no un Node sin compilación, que era la recomendación) porque Neri ve que el
proyecto puede crecer. Es una decisión suya y está cerrada.

## Dónde encaja

Es la **pieza 1** de la plataforma (visión general en `2026-09-16-plataforma-vision-general.md`):
entra con PIN, cola del día, embudo, enlace personalizado por prospecto. Absorbe la lista de hoteles
existente. Las demás piezas (proyectos y cobros, buscador e importación, recibos, portal del cliente)
tienen su propio spec. Orden de construcción: **1 → 3 → 2 → 4 → 5**.

Quedan como trabajo de contenido, no de código, y siguen pendientes:

- **Prospectos de farmacias**: búsqueda con solo datos publicados por el negocio; entra por la pieza 2.
- **Propuesta general de farmacias**: plantilla a partir de la de Farmahogar
  (`~/propuestas/archivo/2026-09-08-farmahogar.md`). **Bloqueada por la decisión de precios** (ver
  al final).

---

## Parte 1 — Arquitectura y datos (APROBADA)

**Dónde corre**

- Código en `/home/neracosu/public_html/prospectos.neracosu.com` (docroot del subdominio
  `prospectos.neracosu.com`, creado en cPanel el 16-sep), con git, igual que Hotel Marte.
- Proceso PM2 **`prospectos`**, puerto **3013** (libres al 16-sep: los usados eran 3000–3006, 3009,
  3011, 3012; **reconfirmar con `ss -ltn` antes de usarlo**). Apache hace de proxy con `.htaccess`,
  como `hotelmarte.neracosu.com/.htaccess`.
- **Next.js 15** (App Router, Server Components + Server Actions) · **Prisma + MySQL** · CSS plano,
  sin librerías de UI.
- Base **`neracosu_prospectos`**, usuario `neracosu_prospectos`. Credenciales en
  `~/.config/prospectos/env` (600, fuera del repo). La contraseña se pegó en el chat del 16-sep:
  **rotarla en cPanel** cuando la app funcione y actualizar solo ese archivo.

**Acceso con PIN**

- Tabla `Usuario` con `nombre`, `rol` (`dueno`, `prospectador`, `cliente`), `activo`, `pinHash`,
  `clienteId` (solo rol `cliente`, pieza 5). Una sola cuenta al inicio (Neri, `dueno`); el
  `prospectador` es la persona de confianza que contacta mientras Neri programa: ve Hoy, Prospectos
  y Buscar, no ve Proyectos ni Ajustes. Alta desde Ajustes, solo `dueno`; cada quien cambia su PIN.
- Toda server action valida sesión **y rol**.
- PIN guardado con hash (bcrypt o argon2), sesión en cookie firmada, `httpOnly`, `secure`,
  `sameSite=lax`, 30 días.
- **5 intentos fallidos bloquean 15 minutos** (por cuenta y por IP).
- Todo exige sesión salvo `/entrar` y `/p/<código>`.
- El PIN inicial se fija con un script (`scripts/crear-usuario.mjs`), nunca en la línea de comandos
  visible en `ps`: se lee por stdin.

**Tablas**

- `Nicho`: `slug`, `nombre` (Hoteles, Farmacias…), `mensajeInicial` y `mensajeSeguimiento`
  (plantillas con `{nombre}` y `{enlace}`), `plantillaPropuesta` (nombre de la plantilla HTML),
  `diasSeguimiento`.
- `Prospecto`: `nichoId`, `nombre`, `ciudad`, `estado`, `region`, `tipo`, `tamano` (texto: «20 hab.»),
  `telefono`, `whatsapp` (normalizado `58XXXXXXXXXX`), `email`, `web`, `instagram`, `facebook`,
  `tiktok`, `nota`, `fuentes` (JSON `{campo: url}`), `origen` (`importado`, `manual`, `overpass`,
  `web`, `maps`), `etapa`, `proximoSeguimiento`, `codigo` (único, aleatorio), `ordenCola`,
  `creadoEn`. Único por nicho + nombre + ciudad normalizados (la clave que ya usa
  `armar.py`) para que reimportar no duplique.
- `Evento`: `prospectoId`, `usuarioId` (quién lo hizo), `tipo` (`etapa`, `enviado`, `abierto`,
  `nota`, `saltado`, `importado`; las piezas 3–5 suman los suyos), `de`, `a`, `canal` (`whatsapp`,
  `sms`, `llamada`, `email`, `instagram`, `facebook`, `tiktok`, `otro`), `texto`, `creadoEn`. Es el
  historial.
- `Configuracion`: clave/valor. La **meta diaria es por usuario** (`Usuario.metaDiaria`), no global.

**Embudo**

`por_contactar → enviado → respondio → reunion → ganado | descartado`

- Pasar a `enviado` fija `proximoSeguimiento = hoy + nicho.diasSeguimiento`.
- Abrir el enlace deja un `Evento` `abierto` pero **no cambia la etapa**: abrir no es responder.
- `descartado` pide motivo (va en el `Evento`).
- `ganado` ofrece **«¿Crear proyecto?»** (pieza 3). Si se pospone, Hoy lo recuerda como «falta crear
  proyecto». Hasta que exista la pieza 3, `ganado` solo cambia la etapa.
- Nada se borra: un prospecto equivocado se descarta con motivo.

**Propuestas**

- Una **plantilla HTML por nicho** dentro del repo. La de hoteles se trae de
  `~/propuestas/hoteles/propuesta-hoteles.html` (ya personaliza con `data-hotel`).
- `/p/<código>` la sirve con el nombre del prospecto. El código tiene **al menos 16 bytes
  aleatorios en base64url**: no se adivina ni se recorre.
- `noindex` en la página y cabecera `X-Robots-Tag: noindex`.
- **Descargar PDF** se genera a pedido con Playwright (como `~/propuestas/hoteles/pdf.cjs`) y se
  guarda en disco fuera del docroot, por código; se regenera si cambia la plantilla.

**Datos de entrada**

- Importar los **132 hoteles** desde `~/propuestas/hoteles/prospectos/fuentes/{capital,centro,interior}.json`.
- **Farmahogar** entra a mano, en etapa `enviado` con fecha 2026-09-15.
- Formulario de alta y un importador de JSON para búsquedas nuevas (pieza 2).

---

## Parte 2 — Pantallas (APROBADA)

Diseñadas **primero para teléfono (390 px)**. Barra inferior fija: **Hoy · Prospectos · Buscar ·
Proyectos · Ajustes** (Buscar y Proyectos se activan con las piezas 2 y 3; el `prospectador` no ve
Proyectos ni Ajustes, solo «Mi PIN»). «Nuevo» es un botón dentro de Prospectos.

1. **`/entrar`** — teclado numérico grande para el PIN. Nada más.
2. **`/hoy`** (principal)
   - Arriba: «Hoy: 4 de 10 enviados» (meta del usuario con sesión) con barra de progreso; si hay
     más de un usuario activo, debajo el avance de cada uno. Luego el conteo del embudo
     (por contactar · enviados · respondieron · reuniones).
   - **Seguimientos que tocan**: enviados con `proximoSeguimiento <= hoy`. Cada tarjeta dice si
     abrieron el enlace, con **Respondió**, **Escribir de nuevo** (abre WhatsApp con
     `mensajeSeguimiento` y corre el seguimiento otros N días) y **Descartar** (con motivo).
   - **Por contactar**: los siguientes de la cola compartida (sin asignación: quien abre Hoy toma
     el siguiente; un `enviado` no le vuelve a salir a nadie). Orden: primero WhatsApp, luego
     SMS/email, al final los que solo tienen redes. Tarjeta con nombre, ciudad, nicho y nota.
     - El botón depende del canal (tabla en la visión general): WhatsApp/SMS/email abren la app con
       el mensaje y el enlace; llamada abre `tel:` con el mensaje como guion; Instagram/Facebook/
       TikTok copian el mensaje y abren el perfil. Al volver, la tarjeta pregunta **«¿Se envió?» Sí
       / No**. Solo el «Sí» pasa a `enviado`, guarda el canal y cuenta para la meta (el panel no
       puede saber si el mensaje salió).
     - **Saltar**: `Evento` `saltado` y va al final de la cola.
3. **`/prospectos`** — buscador con filtros por nicho y etapa, resultados en fila compacta. Hace
   falta para encontrar a quien responde por WhatsApp y marcarlo.
4. **`/prospectos/[id]`** — ficha: contacto con enlaces directos, etapa con botones, próximo
   seguimiento editable, nota, enlace de la propuesta (**Ver** / **Copiar**), historial con fecha y
   hora.
5. **`/prospectos/nuevo`** — alta a mano.
6. **`/ajustes`** (solo `dueno`) — usuarios (alta, rol, activar/desactivar, meta diaria de cada
   uno); por nicho: mensaje inicial, mensaje de seguimiento, días; datos del emisor (pieza 4);
   **Cambiar PIN**. El `prospectador` solo ve «Mi PIN».
7. **`/p/<código>`** — la única pública: propuesta con el nombre y **Descargar PDF**. Cada visita es
   un `Evento` `abierto`, **salvo si quien la abre tiene sesión** (Neri revisando su propio enlace).

---

## Parte 3 — Seguridad, errores y pruebas (APROBADA)

**Seguridad**

- **Toda función exportada de un módulo `"use server"` es un endpoint público**, aunque ningún
  botón la llame. Cada acción valida sesión **fuera del try/catch** y valida la entrada con zod en el
  servidor. No exportar auxiliares desde esos módulos (lección de Hotel Marte).
- `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` fija en el env desde el primer build, o la pestaña abierta
  en el teléfono deja de responder después de cada despliegue.
- `/p/<código>` no expone nada más que el nombre del negocio: ni etapa, ni notas, ni otros
  prospectos. Límite de peticiones por IP para frenar a quien pruebe códigos.
- Datos: **solo contactos que el negocio publicó**. Las notas internas («solo cobra en dólares
  efectivo») nunca salen del panel.
- Mientras la app no exista, el `.htaccess` del docroot **niega todo salvo `/.well-known/`** (así
  quedó el 16-sep), para que Apache no publique `CLAUDE.md` ni `docs/`. Al activar el proxy a Next,
  comprobar que `https://prospectos.neracosu.com/CLAUDE.md` **no** devuelve el archivo.

**Errores y bordes**

- **«Hoy» es el día de Caracas (UTC−4 fijo, sin horario de verano)**, no el del servidor ni el del
  navegador. Una sola función para eso, con tests.
- Marcar enviado va con un `updateMany` condicionado a la etapa leída: dos toques no cuentan dos
  envíos ni escriben dos eventos.
- Un número que no se puede normalizar a celular venezolano no dibuja botón de WhatsApp: queda
  «Copiar mensaje».
- Importar dos veces el mismo JSON no duplica (clave única nicho + nombre + ciudad normalizados).
- Si el PDF falla, la página de la propuesta sigue funcionando y el botón dice que se intente de
  nuevo; el error va al log.

**Pruebas**

- **TDD**: test primero, verlo fallar por el motivo correcto, mínimo para pasar.
- vitest contra una base aparte, **`neracosu_prospectos_test`** (Neri la crea en cPanel). El puente
  de tests aborta si la URL no dice `_test`. Archivos de test de a uno (`fileParallelism: false`),
  como en Hotel Marte, para no pelear con MySQL.
- Contratos puros (embudo, cola del día, normalización de WhatsApp, día de Caracas, plantillas de
  mensaje) testeados sin base.
- Cada pantalla se revisa **a 390 px con Playwright** antes de darla por terminada, y el flujo real
  (entrar → enviar → «¿se envió?» → seguimiento) se recorre de punta a punta en el navegador.

**Despliegue**

- **Un build a la vez en todo el servidor.** Nunca desde un subagente ni en paralelo con el de otro
  proyecto (Hotel Marte, Adastram, AMEB y OCLS comparten el daemon PM2). Los subagentes verifican
  con `npx tsc --noEmit`.
- Antes de `pm2 start/restart/save`: `pm2 list` y confirmar el nombre. `pm2 save` congela el estado
  de **todos** los procesos de la cuenta.
- Verificación mínima: 200 por el dominio, `pm2 list` con `prospectos` `online` sin subir
  reinicios, y el log de errores de pm2 limpio.

---

## Decisiones abiertas (antes o durante la implementación)

1. ~~Aprobar la parte 3~~ — aprobada el 16-sep.
2. **Precios de farmacias — bloquea la pieza 3.** La propuesta a Farmahogar dice A: USD 2.500 +
   80/mes y B: USD 4.500 + 150/mes. `neracosu.com/para/comercio-y-tienda.html` (que lista farmacia)
   publica $2.500 + 100, $4.000 + 130, $6.200 + 170. La regla del sitio (`public_html/CLAUDE.md`,
   «Los precios viven en un solo sitio») es que `/para/` es la única fuente de cifras. Además el
   producto no es el mismo: Farmahogar es **tienda en línea con pedidos por WhatsApp** y
   `comercio-y-tienda` es **sistema de inventario**. Decidir: ¿nicho «farmacias» con tienda en línea
   como producto propio (y entonces su página en `/para/` con esos precios), o farmacias dentro de
   comercio con los precios publicados?
3. **Crear `neracosu_prospectos_test`** en cPanel y dar privilegios al mismo usuario.
4. **Puerto 3013**: reconfirmar libre.
5. **Certificado**: al 16-sep el subdominio todavía no respondía con su propio sitio (DNS o vhost
   recién creados). Confirmar AutoSSL antes de publicar enlaces.
6. **Rotar la contraseña de la base** (se pegó en el chat).
7. **Resuelto (Neri, 16-sep):** los artefactos actuales de hoteles (`JNgfD2HQ` propuesta,
   `YBFhiJoY` lista) son la **base del sistema, con su data incluida**: la propuesta es la plantilla
   del nicho hoteles y los 132 hoteles de `~/propuestas/hoteles/prospectos/fuentes/*.json` son la
   primera importación. Los «Contactado» marcados en el navegador de Neri no se pueden leer desde el
   servidor: si hay alguno, se carga a mano al importar.
