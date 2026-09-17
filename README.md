# Prospectos NERACOSU

Panel interno de [Neri Colón](https://neracosu.com) para llevar un negocio de desarrollo a la
medida de punta a punta: **buscar** prospectos por nicho, **contactarlos**, mandarles la
**propuesta**, dar **seguimiento**, convertirlos en **proyecto**, **cobrarles** cada mes y que el
cliente vea qué se le ha hecho. No es un CRM genérico adaptado: se construyó a medida porque nada
de eso lo resuelve una herramienta de terceros sin retorcerla.

> La herramienta no genera ingresos; los generan los mensajes enviados y los cobros hechos a
> tiempo. Por eso el orden de construcción prioriza enviar y cobrar antes que buscar.

## Stack

- **Next.js 15** (App Router, React 19, TypeScript) — una sola app, sin microservicios.
- **MySQL** vía **Prisma 6** (`neracosu_prospectos` en producción,
  `neracosu_prospectos_test` para las pruebas).
- **Vitest** para pruebas unitarias y de contrato; **Playwright** para revisar a 390&nbsp;px de
  ancho antes de cerrar cualquier pantalla.
- **PM2** (proceso `prospectos`, puerto `3013`, solo en `127.0.0.1`) detrás de un proxy de
  Apache/cPanel que hace HTTPS y sirve todo lo demás del dominio.
- Sin dependencias de scraping ni de APIs de pago: los datos salen de
  [Overpass](https://overpass-api.de/) (OpenStreetMap), de la propia web del negocio, de enlaces
  de Google Maps pegados a mano, o de archivos/tablas que ya existan.

## Las cinco piezas

Una sola app y una sola base de datos, divididas en piezas que comparten sesión, prospectos y
clientes. Cada pieza tiene su propio diseño (`docs/superpowers/specs/`) y su propio plan
(`docs/superpowers/plans/`), y sale a producción cuando termina, no al final de todo.

| # | Pieza | Qué resuelve | Estado |
|---|-------|--------------|--------|
| 1 | Panel de prospección | Entrar con PIN, cola del día, embudo, propuestas, seguimientos | ✅ En producción |
| 3 | Proyectos y cobros | Proyecto desde `ganado`, cobros, pendientes, horas, versiones | ✅ En producción |
| 2 | Buscador e importación | Llenar la base desde Overpass, la web del negocio, Maps y archivos, con una bandeja de revisión antes de que cualquier dato entre a la base | 🚧 En construcción (rama `pieza-2`) |
| 4 | Recibos de pago | PDF por cobro pagado, correlativo por año | ⏳ Pendiente |
| 5 | Portal del cliente | `/c/<código>` con PIN propio: avance, versiones, cobros, documentos | ⏳ Pendiente |

Orden de construcción: **1 → 3 → 2 → 4 → 5** — primero enviar, luego cobrar a los clientes que ya
existen, después llenar la base, luego los recibos, y el portal al final porque necesita
proyectos y recibos ya construidos.

### Roles

| Rol | Ve | No ve |
|-----|----|-------|
| `dueno` | Todo el panel | — |
| `prospectador` | Hoy, Prospectos, Buscar, notas internas de prospectos | Proyectos, cobros, horas, recibos, Ajustes |
| `cliente` | Su portal `/c/<código>` (pieza 5) | El panel entero |

La cola del día es **compartida, sin asignación**: quien la abre toma el siguiente prospecto; uno
ya `enviado` no le vuelve a salir a nadie. Cada `Evento` guarda quién hizo qué, y **nada se
borra**: los prospectos se descartan con motivo, los cobros se anulan con motivo, los accesos se
desactivan. El historial es la fuente de verdad.

## Reglas de diseño que atraviesan todo el proyecto

- **Solo datos que el negocio publicó**, y cada dato guarda de dónde salió (`fuentesPorCambio`).
  Nada de contactos personales ni scraping masivo: la decisión sobre Google se explica en el
  diseño de la pieza 2.
- **Toda descarga saliente pasa por un único módulo** (`src/lib/red-segura.ts`) con guardia
  SSRF: solo `http(s)`, sin `localhost` ni IPs privadas/reservadas (se revisa el DNS resuelto en
  cada salto de una redirección, no solo el primero), con plazo total y de inactividad
  separados, tope de bytes y sin seguir redirecciones inseguras (307/308 hacia otro origen con
  un método no seguro).
- **"Hoy" y "este mes" son de Caracas** (UTC−4 fijo, sin importar dónde corra el servidor).
- **Los precios de proyecto viven en `neracosu.com/para/`**; el panel los copia, nunca los
  define.
- **TDD contra una base de pruebas separada**, nunca contra la base real
  (`neracosu_prospectos_test`).
- **Todo se diseña primero para el teléfono** (390&nbsp;px) y se revisa con Playwright antes de
  cerrar una pantalla.
- **Un solo proceso PM2 a la vez en el servidor**: el daemon es compartido con otros sitios en
  producción, así que nunca se hace `pm2 restart/stop/delete` sin confirmar antes el nombre del
  proceso con `pm2 list`.

## Estructura del repositorio

```
src/
  app/            Rutas de Next (App Router): (panel) es el panel con sesión,
                  entrar/ y salir/ son login y logout, p/[codigo]/ son las
                  propuestas públicas (con su PDF).
  acciones/       Server actions ("use server"): todo lo que muta datos.
  lib/            Lógica pura y contratos: nada de "use server" aquí, para que
                  se pueda probar sin base de datos ni sesión.
  componentes/    Componentes de React reutilizables entre pantallas.
prisma/
  schema.prisma   Modelo de datos completo (Usuario, Nicho, Prospecto, Evento,
                  Cliente, Proyecto, Cobro, Pendiente, Horas, Version, ...).
  migrations/     Migraciones aplicadas, en orden.
tests/            Pruebas de Vitest, un archivo por módulo de src/lib.
plantillas/       Plantillas HTML de propuesta por nicho.
docs/superwers/   Specs y planes de cada pieza (diseño, antes de escribir código).
.superpowers/sdd/ Bitácora de implementación por pieza: briefs, reportes de
                  cada tarea y el ledger de progreso.
ecosystem.config.cjs  Configuración de PM2 para producción.
```

## Requisitos

- Node.js 20+
- Una base MySQL accesible (producción usa MariaDB de cPanel; el desarrollo puede usar cualquier
  MySQL/MariaDB 8+ compatible)

## Configuración

Los secretos **nunca viven en el repositorio**. En producción se cargan desde
`~/.config/prospectos/env` (permisos `600`) y PM2 los inyecta vía `env_file` en
`ecosystem.config.cjs`. Para desarrollo local, creá un `.env` (no se versiona) con al menos:

| Variable | Para qué |
|----------|----------|
| `DATABASE_URL` | Cadena de conexión de Prisma a MySQL/MariaDB |
| `SHADOW_DATABASE_URL` | Base sombra que usa Prisma para generar migraciones (el usuario de cPanel no puede `CREATE DATABASE`) |
| `SESION_SECRET` | Clave para firmar la cookie de sesión (JWT vía `jose`) |
| `PROSPECTOS_URL_PUBLICA` | URL pública del panel, usada para armar enlaces absolutos (propuestas, portal) |
| `PROSPECTOS_DIR_ARCHIVOS` | Directorio donde se guardan archivos subidos (fuera del docroot) |
| `TEST_DATABASE_URL` | Cadena de conexión a la base de pruebas, solo para `npm run test:db` |

## Desarrollo local

```bash
npm install                 # corre `prisma generate` automáticamente (postinstall)
npx prisma migrate deploy   # aplica las migraciones a tu base local
npm run dev                 # Next en modo desarrollo, puerto 3013
```

## Pruebas

```bash
npm test                    # Vitest: todo lo que no toca base de datos
npm run test:db             # + las pruebas que sí necesitan TEST_DATABASE_URL
npm run tsc                 # tsc --noEmit, sin compilar
```

El proyecto se desarrolla con **TDD**: el test se escribe antes que el código, y las pruebas de
`src/lib/` corren sin sesión ni base de datos siempre que el módulo lo permita (contratos puros
con *fixtures*).

## Producción

```bash
npm run build
pm2 list                    # confirmar el nombre exacto antes de tocar nada
pm2 restart prospectos      # nunca sin haber corrido `pm2 list` primero
```

Apache hace de proxy hacia `127.0.0.1:3013` (ver `.htaccess`); el directorio del repositorio
(código, `docs/`, `.superpowers/`, plantillas) nunca se sirve como archivo estático, solo lo que
Next decide responder.

## Convenciones

- Español (Venezuela) en todo texto visible para el usuario; comentarios de código sin acentos.
- Mensajes de commit en minúscula, estilo [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `docs:`, `refactor:`...), por heredoc.
- Cada tarea de implementación deja un *brief* y un reporte en
  `.superpowers/sdd/<pieza>/task-N-{brief,report}.md`, y una línea en el `progress.md` de esa
  pieza — es la bitácora de por qué el código quedó como quedó.

## Licencia

Proyecto privado de uso interno. Todos los derechos reservados.
