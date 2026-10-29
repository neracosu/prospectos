# Panel CRM — fase 2: leads (leads vs directorio, tablero, solicitudes → lead, Directorio, carga real)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el panel distinga **leads** (conversaciones reales) de **directorio** (filas importadas), con `/leads` (lista en teléfono, tablero por etapas en escritorio), ficha del lead con «Siguiente paso» y «Mover a…», solicitudes que se convierten en lead con un toque, `Directorio` con la prospección masiva, y los prospectos reales de Neri cargados.

**Architecture:** Mismo modelo `Prospecto` con cinco columnas nuevas y un booleano `esLead`; un contrato puro nuevo (`leads-contrato.ts`: fuentes, etiquetas y transiciones propias de los leads, clave con contacto, nicho desde el rubro del embudo); acciones nuevas en `src/acciones/leads.ts` que no tocan las de la cola masiva; consultas en `src/lib/leads.ts`; pantallas `/leads`, `/leads/nuevo`, `/leads/[id]` y `/directorio` (que reúne `/prospectos` y `/buscar` por pestañas, con redirecciones). La navegación cambia por el contrato de la fase 1.

**Tech Stack:** Next 15, Prisma 6 / MariaDB (migración a mano), Vitest, Playwright contra el clon (`~/dev-clon-prospectos`, `next dev -p 3021 -H 127.0.0.1`, base de tests; **`npx prisma generate` en el clon tras la migración**).

**Spec:** `docs/superpowers/specs/2026-10-29-panel-crm-design.md` (secciones «La idea en una frase», «Leads», «Prospectador y seguimientos masivos», «Solicitudes», «Directorio», «Cómo se hace → fase 2» y «Decisiones 1, 2, 3, 8, 10»).

## Global Constraints

- Migración a mano, `migrate deploy` con `DATABASE_URL` en el entorno; nada de `Json`; sello posterior a `20261029090000`. Columnas exactas: `Prospecto.esLead BOOLEAN NOT NULL DEFAULT false`, `fuenteLead VARCHAR(20) NOT NULL DEFAULT ''`, `valorEstimado DECIMAL(10,2) NULL`, `proximoPaso VARCHAR(160) NOT NULL DEFAULT ''`, `propuestaUrl VARCHAR(300) NOT NULL DEFAULT ''`; `SolicitudWeb.prospectoId INT NULL`; índice `Prospecto(esLead, etapa)`. `UPDATE Prospecto SET esLead = 1, fuenteLead = CASE WHEN origen = 'manual' THEN 'otro' ELSE 'directorio' END WHERE etapa <> 'por_contactar' OR origen = 'manual'`.
- Valores fijos: `FUENTES_LEAD = ["web", "embudo", "whatsapp", "instagram", "referido", "directorio", "otro"]`; etiquetas de lead: por_contactar «Nuevo», enviado «Propuesta enviada», respondio «Conversando», reunion «Demo o diagnóstico», ganado «Ganado», descartado «Descartado»; transiciones de lead: Nuevo → cualquiera; Propuesta enviada → Conversando, Demo o diagnóstico, Ganado, Descartado; Conversando → Propuesta enviada, Demo o diagnóstico, Ganado, Descartado; Demo o diagnóstico → Conversando, Ganado, Descartado; Descartado → Nuevo; Ganado → nada. Mover de etapa **no borra** `proximoSeguimiento` ni `proximoPaso`.
- Nace lead: origen `manual` o `solicitud`; todo lo de la bandeja nace directorio y **asciende a lead al marcar enviado** (`fuenteLead = "directorio"`). Nicho comodín `otro` (slug `otro`, nombre «Otro», sin plantilla, sin etiquetas OSM, en `SIN_EQUIVALENCIA`). Ciudad opcional en un lead; clave de lead `claveLead(nombre, ciudad, contacto)` = `claveProspecto(nombre, ciudad) + "|" + limpiar(whatsapp || correo || instagram)`; la del directorio no cambia.
- Navegación de esta fase (`navegacion-contrato.ts`): dueño → Inicio `/inicio`, Leads `/leads`, Solicitudes `/solicitudes`, Proyectos `/proyectos`, Directorio `/directorio`, Web `/web`, Ajustes `/ajustes`; barra: Inicio · Leads · Solicitudes · Proyectos · Más (Directorio, Web, Ajustes). Prospectador → Inicio, Leads, Directorio, Mi PIN; barra: esos cuatro. (Cobros llega en la fase 3.)
- El prospectador en `/leads` ve solo `fuenteLead = "directorio"`; su Inicio sigue siendo la cola. El «Hoy» del dueño lista leads con `fuenteLead <> "directorio"` o etapa en Conversando/Demo o diagnóstico/Ganado; los seguimientos de directorio en «Propuesta enviada» van a Directorio › Cola.
- `/prospectos` → 308 `/directorio?t=lista` (con la misma consulta); `/prospectos/nuevo` → `/leads/nuevo`; `/prospectos/[id]` → `/leads/[id]` si `esLead`, si no se sirve como ficha de directorio (misma página, cabecera «Directorio»); `/buscar` → 308 `/directorio?t=buscar` (y `?t=maps|importar|bandeja`, `?url=`, `?text=`, `?lote=` se conservan); el `share_target` del manifiesto pasa a `/directorio?t=maps`.
- Textos en español de Venezuela; el panel tutea; nada de «llamada»; comentarios sin acentos; TDD; un build a la vez; `pm2 list` antes de reiniciar; el clon se apaga por PID.
- Carga de los prospectos reales: **por un script fuera del repo** (scratchpad), contra la base real tras desplegar, con datos que Neri ya dio en las sesiones (nombres y contactos de prospectos no entran al repo). Seis leads: la marca de ropa (comercio, fuente web, Conversando, propuesta en el subdominio del prototipo, valor 2.100), el hotel de Catia La Mar (hoteles-estadia, referido, Nuevo, valor 5.100, próximo paso «enviar propuesta»), el concesionario de motos (comercio, whatsapp, Conversando, valor 4.600, próximo paso «esperar su cifra»), la cadena de farmacias (farmacias, referido, Propuesta enviada, valor 17.500), el estudiante (otro, whatsapp, Nuevo, próximo paso «esperar sus datos»), los tres puestos de comida (restaurantes-y-bares, referido, Nuevo).

## Review Focus

1. Un directorio que se marca enviado desde la cola asciende a lead con `fuenteLead = "directorio"` y aparece en `/leads` del dueño **sin** aparecer en su «Hoy» hasta que responda. → Tarea 2 (test con base) y Tarea 6.
2. Convertir dos veces la misma solicitud (doble toque) crea **un** lead y deja la solicitud enlazada; convertir una ya convertida abre el lead existente. → Tarea 3, test «doble conversión».
3. Un lead sin ciudad y otro con el mismo nombre pero distinto WhatsApp conviven; el mismo nombre y el mismo WhatsApp es duplicado con mensaje claro. → Tarea 3, test «clave de lead».
4. `/prospectos/<id>` de un lead redirige a `/leads/<id>` y de un directorio sigue mostrando la ficha con las acciones de la cola («¿se envió?», Saltar). → Tarea 5, recorrido.
5. El tablero en escritorio no se rompe con 0 leads en una columna ni con 200 en otra: columnas con alto fijo y desplazamiento interno, total de valor por columna. → Tarea 4, recorrido con 0 y con 30 sembrados.

---

### Task 1: Contrato de leads

**Files:**
- Create: `src/lib/leads-contrato.ts`
- Test: `tests/leads-contrato.test.ts`

**Interfaces:**
- Produces: `FUENTES_LEAD`, `type FuenteLead`, `ETIQUETA_FUENTE: Record<FuenteLead, string>` («Web», «Embudo /empezar», «WhatsApp», «Instagram», «Referido», «Directorio», «Otro»), `ETIQUETA_ETAPA_LEAD: Record<Etapa, string>`, `puedePasarLead(de: Etapa, a: Etapa): boolean`, `destinosLead(de: Etapa): Etapa[]`, `naceLead(origen: string): boolean` (`manual` y `solicitud`), `claveLead(nombre: string, ciudad: string, contacto: string): string`, `nichoDesdeRubro(rubro: string): string` (`hoteles`→`hoteles-estadia`, `comercio`→`comercio`, `restaurantes`→`restaurantes-y-bares`, `citas`→`clinicas-y-consultorios`, `reservas`→`canchas-y-espacios`, `logistica`→`otro`, `otro`→`otro`, desconocido→`otro`), `fuenteDesdeSolicitud(s: { tipo: string; origen: string }): FuenteLead` (`embudo`→`embudo`, si no `web`).

- [ ] **Step 1: Tests que fallan:** `puedePasarLead("por_contactar","reunion")===true`, `puedePasarLead("enviado","por_contactar")===false`, `puedePasarLead("respondio","enviado")===true`, `puedePasarLead("ganado","respondio")===false`, `destinosLead("por_contactar")` tiene 5; `naceLead("manual")`, `naceLead("solicitud")` true, `naceLead("maps")`, `naceLead("overpass")` false; `claveLead("Boutique Alma","", "0412-123.4567")==="boutiquealma||04121234567"`, `claveLead("Ana","", "")==="ana||"`; `nichoDesdeRubro("citas")==="clinicas-y-consultorios"`, `nichoDesdeRubro("x")==="otro"`; `fuenteDesdeSolicitud({tipo:"embudo",origen:"tiktok"})==="embudo"`, `({tipo:"Software a Medida",origen:""})==="web"`; etiquetas de etapa: `reunion`→«Demo o diagnóstico».
- [ ] **Step 2: Correr y ver que falla.** Run: `npx vitest run tests/leads-contrato.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implementar** (reutiliza `limpiar` de `clave-prospecto.ts`: exportarla).
- [ ] **Step 4: Correr.** Expected: PASS; `npm run tsc` limpio.
- [ ] **Step 5: Commit:** `feat(leads): contrato de leads (fuentes, etiquetas, transiciones, clave con contacto, nicho desde el rubro)`

---

### Task 2: Esquema, migración, nicho «Otro» y ascenso a lead

**Files:**
- Modify: `prisma/schema.prisma`, `scripts/sembrar-nichos.mjs`, `src/lib/overture-contrato.ts` (`SIN_EQUIVALENCIA`), `tests/overture-contrato.test.ts` (19→20), `src/acciones/prospectos.ts` (`marcarEnviado`), `tests/ayuda-db.ts` (`sembrarBasico` siembra también `otro` si hace falta)
- Create: `prisma/migrations/20261030090000_leads/migration.sql`
- Test: `tests/acciones-prospectos.test.ts` (un `it` nuevo)

**Interfaces:**
- Produces: columnas de Global Constraints en el cliente de Prisma; `marcarEnviado` hace `esLead: true, fuenteLead: "directorio"` cuando `fuenteLead === ""` (si ya era lead, no toca la fuente).

- [ ] **Step 1: Test que falla** en `tests/acciones-prospectos.test.ts`: «marcarEnviado asciende un directorio a lead con fuente directorio y no pisa la fuente de un lead» (crear uno con `esLead: true, fuenteLead: "web"` en por_contactar, marcar enviado, seguir `web`). Run `npm run test:db -- tests/acciones-prospectos.test.ts`. Expected: FAIL (columna desconocida).
- [ ] **Step 2: Esquema y migración** (SQL de Global Constraints, con `CREATE INDEX Prospecto_esLead_etapa_idx ON Prospecto(esLead, etapa)`), aplicar a la base de tests (`DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy`), `npx prisma generate`. Nicho `otro` en `sembrar-nichos.mjs` (mensajes genéricos sin `{enlace}`: «Hola, {nombre}. Soy Neri Colón, de NERACOSU…» / seguimiento corto), `SIN_EQUIVALENCIA = ["hoteles", "cosmeticos", "otro"]`, el test a 20. Sembrar en la base de tests (`node scripts/sembrar-nichos.mjs` con `DATABASE_URL` de tests).
- [ ] **Step 3: `marcarEnviado`.** Run el test. Expected: PASS. `npm run test:db` completo en verde.
- [ ] **Step 4: Commit:** `feat(leads): columnas de lead, nicho Otro, un directorio asciende a lead al marcar enviado`

---

### Task 3: Acciones de lead y conversión de solicitudes

**Files:**
- Create: `src/acciones/leads.ts`
- Modify: `src/lib/web.ts` (`SolicitudFila` suma `prospectoId: number | null`), `src/acciones/web.ts` (sin cambios de firma)
- Test: `tests/acciones-leads.test.ts` (con base)

**Interfaces:**
- Produces (todas con `exigirSesion`; `convertirSolicitud` y `guardarDatosLead` con `exigirRol("dueno")`; todas revalidan `/leads`, `/leads/<id>`, `/inicio`, `/solicitudes`):
  - `crearLead(formData): Promise<Resultado<{ id: number }>>` — zod: `nombre` 2..120, `fuenteLead` enum, `nichoId` int, `ciudad` max 80 (opcional), `whatsapp` max 40, `instagram` max 200, `correo` max 120, `proximoPaso` max 160, `proximoSeguimiento` `""`|ISO, `valorEstimado` `""`|MONTO_TEXTO, `propuestaUrl` max 300, `nota` max 2000; exige al menos un contacto (whatsapp, correo o instagram); `origen: "manual"`, `esLead: true`, `clave: claveLead(...)`, `codigo`, `ordenCola: 0`, evento `importado` con texto «lead manual». P2002 → «Ya tienes un lead con ese nombre y ese contacto.».
  - `moverLead(id: number, a: Etapa, motivo = ""): Promise<Resultado>` — exige `esLead`, `puedePasarLead`, descartado con motivo ≥ 2; `updateMany where {id, etapa: de}`; si `a === "enviado"` crea evento `enviado` (canal `""`, texto «propuesta enviada desde la ficha»), si no evento `etapa`. **No toca `proximoSeguimiento`.**
  - `guardarSiguientePaso(id: number, texto: string, fecha: string): Promise<Resultado>` — texto max 160, fecha `""`|ISO; evento `nota` «Siguiente paso: …».
  - `guardarDatosLead(id, datos: { fuenteLead?, valorEstimado?, propuestaUrl?, nichoId? }): Promise<Resultado>`.
  - `convertirSolicitud(solicitudId: number): Promise<Resultado<{ id: number }>>` — en una transacción con la solicitud bloqueada (`SELECT … FOR UPDATE` vía `$queryRaw`, como `deshacerSalto`): si ya tiene `prospectoId`, devuelve ese id sin crear nada; si no, crea el lead (`nombre` = nombre de la solicitud, `fuenteLead = fuenteDesdeSolicitud`, nicho = `nichoDesdeRubro(respuestas.rubro)` buscando el slug (si no existe, `otro`), `whatsapp` normalizado, `correo`, `nota` = mensaje + respuestas legibles, `proximoPaso` = «escribirle», `proximoSeguimiento` = hoy, `origen: "solicitud"`, `esLead: true`), marca `atendidaEn` y `prospectoId`. P2002 → busca el existente por `nichoId_clave` y lo enlaza.
- [ ] **Step 1: Tests que fallan** (`tests/acciones-leads.test.ts`, mocks como `acciones-prospectos.test.ts`): crearLead sin ciudad ok; mismo nombre distinto WhatsApp ok, mismo nombre y WhatsApp → fallo con mensaje; crearLead sin contacto → fallo; moverLead respeta las transiciones de lead y conserva la fecha; moverLead a enviado deja evento `enviado`; moverLead sobre un directorio → fallo «No es un lead»; guardarSiguientePaso valida; convertirSolicitud crea el lead con fuente `embudo`, nicho `comercio`, nota con las respuestas y deja la solicitud atendida y enlazada; «doble conversión» (`Promise.all` de dos llamadas) crea uno solo; convertir una ya convertida devuelve el mismo id.
- [ ] **Step 2: Correr y ver que fallan.** Run: `npm run test:db -- tests/acciones-leads.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Correr.** Expected: PASS; suite completa en verde; tsc limpio.
- [ ] **Step 5: Commit:** `feat(leads): acciones de lead (crear, mover, siguiente paso, datos) y convertir solicitud en lead`

---

### Task 4: Consultas y pantalla `/leads` (lista y tablero) y `/leads/nuevo`

**Files:**
- Create: `src/lib/leads.ts`, `src/app/(panel)/leads/page.tsx`, `src/app/(panel)/leads/nuevo/page.tsx`, `src/componentes/TarjetaLead.tsx` (cliente: «Mover a» con menú de destinos), `src/componentes/FormularioLead.tsx` (cliente, con `Campo`)
- Modify: `src/app/globals.css` (`.tablero`, `.tablero__columna`, `.lead`), `src/lib/navegacion-contrato.ts` + `tests/navegacion-contrato.test.ts` (Leads y Directorio según Global Constraints)
- Test: `tests/leads.test.ts` (con base), `scripts/verificar-leads.mts` (recorrido nuevo, misma plantilla que `verificar-esqueleto.mts`)

**Interfaces:**
- Produces:
  - `type LeadTarjeta = { id, nombre, ciudad, nichoNombre, etapa, fuenteLead, valorEstimado: number | null, proximoPaso, proximoSeguimiento, whatsapp, instagram, correo, propuestaUrl, estadoPaso: "vencido" | "hoy" | "proximo" | "" }`
  - `listarLeads(f: { rol: Rol; fuente?: FuenteLead; nichoId?: number; q?: string }, hoy: string): Promise<{ columnas: { etapa: Etapa; leads: LeadTarjeta[]; valor: number }[]; descartados: number }>` (cinco columnas sin descartados; orden dentro: fecha del próximo paso asc, nulos al final; prospectador → solo `fuenteLead = "directorio"`).
  - `/leads`: `<CabeceraPagina titulo="Leads" cifra="N activos · $X" accion={<Link href="/leads/nuevo">Nuevo lead</Link>}/>`; filtros (fuente, nicho, texto) en una fila plegable; **mismo DOM** para teléfono y escritorio: `<div className="tablero">` con cinco `<section className="tablero__columna" data-etapa>` (título con etiqueta de lead, conteo y valor); en teléfono se muestra una columna a la vez con chips arriba (`?etapa=`; por defecto la primera con leads), en escritorio las cinco en una rejilla con alto `calc(100vh - 180px)` y desplazamiento interno. Enlace «Descartados (n)» al pie → `/leads?etapa=descartado`. Vacío total → «Todavía no tienes leads. Convierte una solicitud o crea uno.».
  - `TarjetaLead`: nombre (enlace a la ficha), fuente y nicho, valor, próximo paso con fecha coloreada, WhatsApp (primario si hay) y «Mover a» (`<details>` con un botón por destino de `destinosLead`; descartar pide motivo inline) que llama `moverLead` optimista (la tarjeta cambia de columna al instante con `useOptimistic` en el tablero o, más simple, desaparece de la columna y la acción revalida; elegir lo segundo).
  - `/leads/nuevo`: `FormularioLead` (campos de `crearLead`; «Fuente» como select con `ETIQUETA_FUENTE`; nicho con `otro` preseleccionado si no hay pista); al guardar → `/leads/<id>`.
- [ ] **Step 1: Tests que fallan:** `tests/leads.test.ts`: `listarLeads` del dueño reparte por etapa, suma valor, ordena por fecha, excluye directorio sin ascender y descartados; del prospectador solo directorio. Recorrido `verificar-leads.mts`: a 1280, `/leads` con 30 leads sembrados en Conversando y 0 en Demo: cinco columnas, la vacía dice «Nada aquí», la llena se desplaza por dentro (scrollHeight > clientHeight) sin desplazar la página; a 390: chips y una columna; «Mover a» → Ganado mueve la tarjeta; `/leads/nuevo` crea uno sin ciudad y abre su ficha; `navegacion-contrato` con Leads/Directorio.
- [ ] **Step 2: Correr y ver que fallan.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Correr.** Expected: PASS (unitarios, con base, recorrido contra el clon).
- [ ] **Step 5: Commit:** `feat(leads): /leads con lista en telefono y tablero en escritorio; /leads/nuevo; navegacion con Leads y Directorio`

---

### Task 5: Ficha del lead

**Files:**
- Create: `src/app/(panel)/leads/[id]/page.tsx`, `src/componentes/SiguientePaso.tsx` (cliente), `src/componentes/DatosLead.tsx` (cliente: fuente, valor, propuesta, nicho, editable en línea)
- Modify: `src/app/(panel)/prospectos/[id]/page.tsx` (si `esLead` → `redirect(/leads/<id>)`; si no, cabecera «Directorio»), `src/lib/prospectos.ts` (`SELECT` suma las columnas nuevas; `fichaProspecto` las devuelve), `src/app/globals.css` (`.ficha` a dos columnas desde 1024)
- Test: `scripts/verificar-leads.mts` (ampliar)

**Interfaces:**
- Produces: `/leads/[id]`: `<CabeceraPagina titulo={nombre} cifra={etiqueta de etapa · fuente · valor} accion={WhatsApp con el mensaje del nicho si hay}/>`; columna izquierda: tarjeta **«Siguiente paso»** (`SiguientePaso`: texto + fecha, guarda al salir del campo con `guardarSiguientePaso`; debajo «Mover a…» con `destinosLead` y motivo si descartar; si Ganado y dueño: «Crear cliente y proyecto» → `/proyectos/nuevo?prospecto=<id>`), `DatosLead`, contacto (el bloque actual), propuesta (actual + `propuestaUrl` como «Propuesta o prototipo» con enlace), nota; columna derecha (escritorio) / `<details>` plegado (teléfono): historial, últimos 5 y «Ver todo».
- [ ] **Step 1: Recorrido que falla:** `/leads/<id>` muestra «Siguiente paso», guardar texto y fecha persiste (se ve en la ficha tras recargar), «Mover a» cambia la cabecera, `/prospectos/<id>` de ese lead redirige a `/leads/<id>`, `/prospectos/<id directorio>` sigue mostrando «Enviar propuesta»; a 1280 el historial está a la derecha (su `x` > 700), a 390 está dentro de un `details` cerrado.
- [ ] **Step 2–4:** fallar, implementar, pasar (suites + recorrido).
- [ ] **Step 5: Commit:** `feat(leads): ficha del lead con siguiente paso, mover a, datos y historial a un lado`

---

### Task 6: Solicitudes → lead, Inicio y Directorio con redirecciones

**Files:**
- Modify: `src/componentes/TarjetaSolicitud.tsx` (+ `BotonConvertir`, cliente), `src/app/(panel)/solicitudes/page.tsx`, `src/lib/inicio.ts` (cifras por `esLead`; «Hoy» según Global Constraints), `tests/inicio.test.ts`, `src/app/(panel)/inicio/page.tsx` (la cola plegada pasa a ser un enlace a `/directorio?t=cola`), `src/app/manifest.ts` (`share_target.action: "/directorio"` con `t=maps` fijo vía `params`… Next no admite params fijos: la página de Directorio sin `t` y con `url`/`text` abre `maps`), `src/app/(panel)/buscar/page.tsx` → se mueve a `src/componentes/Directorio/*` y `/buscar` queda en `redirect`, `src/app/(panel)/prospectos/page.tsx` → ídem (`?t=lista`), `src/app/(panel)/prospectos/nuevo/page.tsx` → `redirect("/leads/nuevo")`
- Create: `src/app/(panel)/directorio/page.tsx` (pestañas `cola | lista | buscar | maps | importar | bandeja`; `cola` = `InicioProspectador` sin cifras; `lista` = la lista actual filtrada `esLead: false` con filtros plegados y 50 por página; el resto, los componentes de `/buscar`)
- Test: `tests/inicio.test.ts`, `tests/web.test.ts` (convertir desde la tarjeta usa `convertirSolicitud`, ya probada), `scripts/verificar-leads.mts` (ampliar)

- [ ] **Step 1: Tests que fallan:** `inicio.test.ts`: un lead de directorio en «Propuesta enviada» con fecha vencida **no** entra en `hoyLista` del dueño; uno de fuente `web` sí; `leadsActivos` cuenta `esLead` en las tres etapas. Recorrido: en `/solicitudes` «Convertir en lead» lleva a `/leads/<id>` y la tarjeta queda «Atendida · ver lead»; `/directorio` muestra las pestañas y `?t=cola` la cola; `/prospectos` → `/directorio?t=lista`; `/buscar?url=https://maps.app.goo.gl/x` → `/directorio?t=maps&url=…`; manifiesto con `action: "/directorio"`; barra del prospectador con Directorio.
- [ ] **Step 2–4:** fallar, implementar, pasar.
- [ ] **Step 5: Commit:** `feat(leads): convertir solicitud en lead, Inicio por leads, Directorio con la prospeccion masiva y redirecciones`

---

### Task 7: Revisión, despliegue y carga de los prospectos reales

- [ ] **Step 1:** capturas a 390 y 1280 de `/leads` (teléfono: chips; escritorio: tablero), `/leads/<id>`, `/solicitudes`, `/directorio?t=cola` y `?t=lista`; mirarlas. Apagar el clon por PID.
- [ ] **Step 2:** revisión final de la rama con revisor fresco; fix pass con TDD.
- [ ] **Step 3: Desplegar:** `git checkout main && git merge --ff-only`; `set -a; . ~/.config/prospectos/env; set +a`; `npx prisma migrate deploy` (comprobar «applied»); `node scripts/sembrar-nichos.mjs` (siembra `otro` en producción; es `upsert`); `npm run build`; `pm2 list`; `pm2 restart prospectos`; verificar `/entrar` 200, `/leads` con sesión (a ojo), `/prospectos` → 308.
- [ ] **Step 4: Carga real:** script en el scratchpad (no en el repo) con Prisma contra la base real que cree los seis leads de Global Constraints usando `claveLead`, `esLead: true`, `origen: "manual"`, evento `importado` «carga inicial fase 2», y los datos de contacto que Neri dio (del archivo de memoria de cada prospecto); imprimir los ids; borrar el script. Después, abrir `/leads` y confirmar que los seis están en su columna.
- [ ] **Step 5: Notas:** `CLAUDE.md` del panel (sección «Panel CRM, fase 2»: leads vs directorio, contrato, acciones, rutas y redirecciones, carga inicial hecha a mano, pendiente fase 3), memoria, `git push origin main`.
