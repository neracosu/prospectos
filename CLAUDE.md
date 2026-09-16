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
| 1 | Panel de prospección | `2026-09-16-panel-prospeccion-design.md` | Aprobada completa |
| 3 | Proyectos y cobros | `2026-09-16-proyectos-cobros-design.md` | Aprobada |
| 2 | Buscador e importación | `2026-09-16-buscador-importacion-design.md` | Aprobada |
| 4 | Recibos de pago | `2026-09-16-recibos-design.md` | Aprobada |
| 5 | Portal del cliente | `2026-09-16-portal-cliente-design.md` | Aprobada |

Orden de construcción: **1 → 3 → 2 → 4 → 5**. Cada pieza sale a producción cuando termina.

Estado al 16-sep (noche): **pieza 1 construida y en producción.**

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
  a 390 px contra el dominio), `scripts/sembrar-nichos.mjs`, `scripts/importar-hoteles.mts`.
- Siguiente pieza: **3 (Proyectos y cobros)**, luego 2, 4 y 5. Plan nuevo por pieza en
  `docs/superpowers/plans/`.
- Pendientes de Neri: rotar la contraseña de la base (spec, decisiones abiertas) y decidir los precios
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
