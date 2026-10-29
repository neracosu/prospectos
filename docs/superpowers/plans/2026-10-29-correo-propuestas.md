# Propuesta por correo personalizada: plan de ejecución

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada prospecto del directorio con correo reciba, goteado y rastreado, un correo de marca con su propuesta en PDF personalizada por una ficha investigada de su negocio, y que Neri pueda hacerlo a mano desde `/correos` para los que entren después.

**Architecture:** Tres piezas sobre el panel existente: (1) `FichaNegocio` (investigación por reglas puras sobre la web, Overture y la base) que produce un `gancho` «Vi que…»; (2) el gancho entra como bloque opcional en `renderPropuesta` y por tanto en el PDF y en `/p/<codigo>`; (3) un contrato puro arma el correo (HTML + texto), `nodemailer` lo manda por el `sendmail` local, `EnvioCorreo` guarda el token con el que el píxel, `/r/<token>` y `/p/<codigo>/pdf?e=` rastrean apertura, vista y descarga; una ruta con secreto, llamada por el crontab cada hora, gotea los envíos automáticos dentro del tope diario.

**Tech Stack:** Next.js 15 (App Router, Server Actions, route handlers), Prisma 6 + MariaDB, zod, vitest (`npm test` puro, `npm run test:db` con base), Playwright (verificadores), `nodemailer` (nuevo, transporte `sendmail`), Python 3 (`armar-plantillas.py`).

**Spec:** `docs/superpowers/specs/2026-10-29-correo-propuestas-design.md` (leerlo entero antes de cada tarea; las decisiones del revisor y las de Neri están al final).

## Global Constraints

- Español (Venezuela) en todo texto visible; comentarios en el código sin acentos; mensajes de commit por heredoc (`git commit -F -`).
- Textos de cara al prospecto: de usted, en positivo; **nunca** «llamada», «videollamada», «reunión» ni «30 minutos»; la demostración se ofrece «cuando el caso lo permite»; en `citas-y-servicios` no se promete demostración ni agenda construida.
- Nada en la ficha ni en el gancho que no salga de una fuente (web, Overture, base). Sin hallazgos → sin gancho.
- Correos excluidos: `@*.gob.ve`, `example`, `noreply|no-reply`; prospectos de Colombia (`paisDeCiudad === "CO"`) fuera; leads que no sean `fuenteLead = "directorio"` fuera; un correo por dirección (normalizada a minúsculas y sin espacios).
- Remitente `Neri Colón · NERACOSU <info@neracosu.com>`, `Reply-To: info@neracosu.com`, envelope `-f info@neracosu.com`; fuera de `NODE_ENV=production` no se manda nada salvo con `PROSPECTOS_CORREO_SIMULADO=1` (devuelve éxito sin enviar).
- Tope diario por defecto **25** (`correos_por_dia`), interruptor `correos_automatico` por defecto `on`, lote por hora `ceil(tope / 8)`, solo lunes a viernes de 09:00 a 17:00 hora de Caracas.
- `GANCHO_MAX = 280` caracteres; el gancho se escapa siempre (HTML y correo); nunca contiene saltos de línea.
- Toda petición saliente va por `src/lib/red-segura.ts` (`descargar`), nunca `fetch`.
- Ningún archivo nuevo entra en la cadena de imports de `src/instrumentation.ts` (lo vigila `tests/instrumentation-grafo.test.ts`); `correo-envio.ts` usa `node:`.
- Migraciones a mano con `prisma migrate deploy`; columnas Json con `DEFAULT '{}'` escrito a mano; sello posterior a `20261030090000`.
- Tests con base solo contra `neracosu_prospectos_test` (`describe.runIf(DB_HABILITADA)`, `limpiarBase`, `sembrarBasico` de `tests/ayuda-db.ts`; sesión con `vi.mock("@/lib/sesion")` como en `tests/acciones-leads.test.ts`).
- Todo se revisa a 390 px y a 1280 px con Playwright contra el clon `~/dev-clon-prospectos` (`next dev -p 3021 -H 127.0.0.1`, base de tests); **nunca** `next dev` ni `next build` en el directorio servido salvo el build del despliegue; procesos solo por PID.
- Un build a la vez en el servidor, nunca desde un subagente; `pm2 list` antes de `pm2 restart prospectos`.

## Review Focus

1. **Una web que devuelve binario, HTML de 2 MB o texto sin etiquetas** (PDF, imagen, página en blanco): `analizarWeb` no revienta, marca `estado: "viva"` sin señales y la ficha queda `sin_hallazgos` → test en Tarea 2.
2. **Correos con mayúsculas, espacios o la misma dirección en tres sucursales**: la depuración y `CorreoBloqueado` comparan normalizado y solo la principal recibe correo → test en Tarea 2 y Tarea 8.
3. **Token inválido, de otro largo o ya usado por otro prospecto en las rutas públicas** (`/api/correo/a/`, `/r/`, `/p/…/pdf?e=`): 404 o imagen vacía, sin consulta a la base con texto sucio y sin contar nada → test en Tarea 7.
4. **Dos llamadas del cron solapadas o el tope alcanzado a mitad de lote**: nunca se pasa del tope del día (conteo y envío en serie, con `enviadosHoy` releído antes de cada correo) → test en Tarea 9.
5. **Gancho editado por Neri con HTML, saltos de línea o más de 280 caracteres**: la acción lo rechaza con mensaje y el que se guarda sale escapado en PDF y correo → test en Tarea 4 y Tarea 6.
6. **`sendmail` falla o no está**: `EnvioCorreo.fallo` guarda el motivo, la etapa no cambia, la fila queda en la cola con «Falló: reintentar» → test en Tarea 8.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `prisma/schema.prisma`, `prisma/migrations/20261031090000_fichas_correo/migration.sql` | Modelos `FichaNegocio`, `CorreoBloqueado`, `EnvioCorreo` |
| `src/lib/ficha-contrato.ts` | Puro: señales de una web, estado de la web, gancho y resumen por reglas, depuración del universo |
| `src/lib/overture-cruce.ts` | Lectura de `LugarOverture` por nombre+ciudad (sale de `scripts/_cruzar.mts`) |
| `src/lib/fichas.ts` | Investigar un prospecto (descarga + Overture + base) y guardar/leer/editar la ficha |
| `scripts/investigar-prospectos.mts` | CLI: depuración del universo e investigación en bloque, con `--aplicar` |
| `src/lib/mensajes-nicho-contrato.ts` | + `PROMESA_POR_ARQUETIPO`, `CREDENCIAL_POR_ARQUETIPO`, `ANTETITULO_POR_ARQUETIPO` |
| `src/lib/propuesta-contrato.ts`, `plantillas/base/*.cuerpo.html`, `plantillas/hoteles*.html`, `scripts/verificar-plantillas.mts` | Bloque `si:gancho` + `{{gancho}}` |
| `src/app/p/[codigo]/route.ts`, `src/app/p/[codigo]/pdf/route.ts` | Leen el gancho de la ficha; el PDF cuenta la descarga con `?e=` |
| `src/lib/correo-propuesta-contrato.ts` | Puro: asunto, HTML, texto plano y previo del correo (inicial y seguimiento) |
| `src/lib/correo-envio.ts` | `nodemailer` por `sendmail`; guarda fuera de producción; transporte capturable en tests |
| `src/lib/correos.ts` | Cola, cifras, preparar envío (PDF), registrar envío, rastreo, envío automático |
| `src/app/api/correo/a/[token]/route.ts`, `src/app/r/[token]/route.ts`, `src/app/api/correos/automatico/route.ts` | Píxel, clic, cron |
| `src/acciones/correos.ts` | Server Actions: enviar a mano, guardar gancho, reinvestigar, bloquear, al automático |
| `src/app/(panel)/correos/page.tsx`, `src/componentes/ColaCorreos.tsx`, `src/componentes/VistaPreviaCorreo.tsx`, `src/componentes/FichaNegocioBloque.tsx` | Pantalla `/correos`, vista previa, bloque en la ficha del prospecto |
| `src/lib/navegacion-contrato.ts`, `src/componentes/Icono.tsx`, `src/lib/configuracion.ts`, `src/componentes/FormularioAjustesCorreos.tsx`, `src/acciones/ajustes.ts` | Sección, icono, claves y formulario de Ajustes |
| `scripts/pregenerar-pdf-correos.mts`, `scripts/verificar-correos.mts` | PDFs por adelantado; recorrido Playwright |
| `tests/ficha-contrato.test.ts` (+ `tests/fixtures/webs/*.html`), `tests/fichas.test.ts`, `tests/acciones-correos.test.ts`, `tests/correo-propuesta-contrato.test.ts`, `tests/correo-envio.test.ts`, `tests/correos.test.ts`, `tests/rastreo.test.ts`, `tests/ajustes-correos.test.ts`; actualizar `tests/navegacion-contrato.test.ts`, `tests/propuesta-contrato.test.ts` | Pruebas |

---

## Fase 1 · Fichas

### Task 1: Modelos y migración

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261031090000_fichas_correo/migration.sql`
- Test: `tests/fichas.test.ts` (solo la prueba de esta tarea; el resto llega en la Tarea 3)

**Interfaces:**
- Produces (Prisma): `FichaNegocio { id Int @id @default(autoincrement()); prospectoId Int @unique; prospecto Prospecto; hallazgos Json @default("{}"); fuentes Json @default("[]"); resumen String @default("") @db.Text; gancho String @default("") @db.VarChar(400); estado String @default("sin_hallazgos") @db.VarChar(20); alAutomatico Boolean @default(false); generadaEn DateTime @default(now()); revisadaEn DateTime? }`; `CorreoBloqueado { email String @id @db.VarChar(120); motivo String @db.VarChar(20) /* no_quiere | rebote */; creadoEn DateTime @default(now()) }`; `EnvioCorreo { id Int @id @default(autoincrement()); prospectoId Int; prospecto Prospecto; token String @unique @db.VarChar(22); tipo String @db.VarChar(12) /* inicial | seguimiento */; asunto String @db.VarChar(200); para String @db.VarChar(120); enviadoEn DateTime @default(now()); abiertoEn DateTime?; aperturas Int @default(0); clicEn DateTime?; clics Int @default(0); pdfEn DateTime?; pdfs Int @default(0); fallo String @default("") @db.VarChar(300); @@index([prospectoId, enviadoEn]) }`; relaciones inversas `ficha FichaNegocio?` y `envios EnvioCorreo[]` en `Prospecto`.

- [ ] **Step 1: Write the failing test** en `tests/fichas.test.ts`:

```ts
describe.runIf(DB_HABILITADA)("modelos de ficha y correo", () => {
  beforeAll(async () => { await limpiarBase(); });
  it("una ficha por prospecto, hallazgos vacios por defecto, token unico por envio", async () => {
    const ids = await sembrarBasico(); const p = await crearProspectoDePrueba(ids.nichoId, { nombre: "Bodegón Uno", email: "uno@x.test" });
    const f = await prisma.fichaNegocio.create({ data: { prospectoId: p.id } });
    expect(f.hallazgos).toEqual({}); expect(f.estado).toBe("sin_hallazgos"); expect(f.alAutomatico).toBe(false);
    await expect(prisma.fichaNegocio.create({ data: { prospectoId: p.id } })).rejects.toThrow();
    await prisma.envioCorreo.create({ data: { prospectoId: p.id, token: "a".repeat(22), tipo: "inicial", asunto: "x", para: "uno@x.test" } });
    await expect(prisma.envioCorreo.create({ data: { prospectoId: p.id, token: "a".repeat(22), tipo: "inicial", asunto: "x", para: "uno@x.test" } })).rejects.toThrow();
    await prisma.correoBloqueado.create({ data: { email: "uno@x.test", motivo: "no_quiere" } });
  });
});
```

(`limpiarBase` debe borrar también las tres tablas nuevas: agregar `envioCorreo`, `fichaNegocio` y `correoBloqueado` al principio de su lista de `deleteMany`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:db -- tests/fichas.test.ts`
Expected: FAIL (`prisma.fichaNegocio` no existe).

- [ ] **Step 3: Escribir los modelos en `schema.prisma` y la migración a mano** (`CREATE TABLE` de las tres con `hallazgos JSON NOT NULL DEFAULT '{}'`, `fuentes JSON NOT NULL DEFAULT '[]'`, claves foráneas a `Prospecto(id)`, índices `FichaNegocio_prospectoId_key`, `EnvioCorreo_token_key`, `EnvioCorreo_prospectoId_enviadoEn_idx`). Comentario de cabecera con la fecha y «escrita a mano (ver CLAUDE.md)».

- [ ] **Step 4: Aplicar a la base de tests y regenerar el cliente**

Run: `set -a; . ~/.config/prospectos/env; set +a; DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy && npx prisma generate`
Expected: `1 migration applied` (`20261031090000_fichas_correo`).

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test:db -- tests/fichas.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma tests/fichas.test.ts tests/ayuda-db.ts
git commit -F - <<'EOF'
feat(db): FichaNegocio, CorreoBloqueado y EnvioCorreo (migracion a mano)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

### Task 2: Contrato puro de la ficha

**Files:**
- Create: `src/lib/ficha-contrato.ts`
- Create: `tests/fixtures/webs/restaurante-carta-pdf.html`, `tienda-shopify-cobra-a-mano.html`, `hotel-reserva-whatsapp.html`, `consultorio-wordpress.html`, `dominio-en-venta.html`, `wix-sin-dominio.html`, `binario.bin` (HTML cortos escritos a mano, sin marcas reales de terceros; cada uno con solo las señales que su nombre dice: `wa.me/...` con texto «reservas», enlace `carta.pdf`, `cdn.shopify.com` + «Pago Móvil» + «Zelle» sin `checkout`, «This domain is for sale», «ConnectYourDomain Error | Wix.com», bytes al azar)
- Test: `tests/ficha-contrato.test.ts`

**Interfaces:**
- Produces:
  - `type EstadoWeb = "viva" | "caida" | "vendida" | "en_mantenimiento" | "red_social" | "sin_web"`
  - `type Plataforma = "wordpress" | "woocommerce" | "shopify" | "wix" | "tiendanube" | "otra" | ""`
  - `type HallazgosWeb = { url: string; estado: EstadoWeb; titulo: string; descripcion: string; plataforma: Plataforma; paginasLeidas: string[]; reservaPorWhatsApp: boolean; tieneReservasEnLinea: boolean; tieneTiendaEnLinea: boolean; cobraEnLinea: boolean; tieneMenuOCatalogo: boolean; menuEnPdf: boolean; motorExterno: string; metodosPago: string[]; horario: string; direccion: string; redes: string[]; nombreCoincide: boolean }`
  - `type HallazgosBase = { tipo: string; tamano: string; nota: string; instagram: string; facebook: string; telefono: string; whatsapp: string; variasSedes: boolean }`
  - `type Hallazgos = { web?: HallazgosWeb; overture?: { id: string; direccion: string; categoriaBase: string; categoriaFina: string }; base: HallazgosBase }`
  - `type EstadoFicha = "sin_hallazgos" | "borrador" | "lista" | "revisada"`
  - `const GANCHO_MAX = 280`
  - `function esWebRedSocial(url: string): boolean` (instagram, facebook, linktr.ee, wa.me, tiktok)
  - `function estadoDeDescarga(r: { ok: boolean; estado?: number; texto?: string }, urlPedida: string): EstadoWeb`
  - `function enlacesInternos(html: string, urlBase: string): string[]` (hasta 3, mismo host, cuyo `href` o texto contenga contacto|menu|menú|carta|reserv|servicio|tienda|habitaci|catalogo|catálogo, sin repetir)
  - `function analizarWeb(html: string, urlFinal: string, nombre: string, estado: EstadoWeb): HallazgosWeb`
  - `function hallazgosDeBase(p: { tipo: string; tamano: string; nota: string; instagram: string; facebook: string; telefono: string; whatsapp: string }): HallazgosBase` (`variasSedes` si la nota o el tamaño dicen sede|sucursal|locales)
  - `function armarGancho(h: Hallazgos, arquetipo: string): string` (tabla del spec §5 de las respuestas al revisor; `""` fuera de la tabla, si `web.nombreCoincide === false`, o si queda sobre `GANCHO_MAX`)
  - `function armarResumen(h: Hallazgos, arquetipo: string, ciudad: string): string` (2 a 4 líneas: qué es, qué tiene montado, fuga probable; solo hechos)
  - `function estadoDeFicha(h: Hallazgos, gancho: string): EstadoFicha` (`lista` si hay gancho o `web.estado === "viva"`; `borrador` si hay web pero `nombreCoincide === false`; `sin_hallazgos` sin web ni Overture)
  - `type FilaUniverso = { id: number; email: string; nombre: string; ciudad: string; etapa: string; esLead: boolean; fuenteLead: string; web: string; whatsapp: string; instagram: string; facebook: string; telefono: string; nota: string }`
  - `function normalizarCorreo(e: string): string` (minúsculas, sin espacios)
  - `function depurarUniverso(filas: FilaUniverso[], pais: (ciudad: string) => "VE" | "CO"): { cola: FilaUniverso[]; duplicadas: { id: number; principalId: number }[]; excluidas: { id: number; motivo: string }[] }` (principal = más campos de contacto y nota llenos; empate → menor id)

- [ ] **Step 1: Write the failing tests** (`tests/ficha-contrato.test.ts`), uno por regla, con los fixtures:

```ts
it("restaurante con carta en PDF y pedidos por WhatsApp", () => {
  const w = analizarWeb(fx("restaurante-carta-pdf.html"), "https://ejemplo.test/", "La Trattoria", "viva");
  expect(w).toMatchObject({ menuEnPdf: true, reservaPorWhatsApp: true, nombreCoincide: true });
  const g = armarGancho({ web: w, base: vacia }, "restaurantes-y-bares");
  expect(g).toContain("carta está en PDF"); expect(g.length).toBeLessThanOrEqual(GANCHO_MAX); expect(g).not.toMatch(/llamada|reuni/i);
});
it("tienda Shopify que cobra a mano", () => { /* plataforma shopify, cobraEnLinea false, metodosPago ["pago móvil","zelle"]; gancho comercio contiene "ya venden en línea" */ });
it("hotel con reservas por WhatsApp: gancho en estadia y reservas, nunca en hoteles de paso ni demostracion en citas", () => {
  expect(armarGancho(h, "hoteles-estadia")).toContain("reservas se piden por WhatsApp");
  expect(armarGancho(h, "hoteles")).toBe("");
  expect(armarGancho(h, "citas-y-servicios")).toContain("se confirma a mano"); expect(armarGancho(h, "citas-y-servicios")).not.toMatch(/demostraci/);
});
it("dominio en venta y Wix sin dominio son web caida/vendida: gancho «hoy no abre» para todos", () => { /* estadoDeDescarga + analizarWeb; armarGancho(...,"hoteles") contiene "hoy no abre" */ });
it("nombre que no coincide: sin gancho y ficha en borrador", () => { /* analizarWeb(fx consultorio), nombre "Chino" → nombreCoincide false → armarGancho "" ; estadoDeFicha "borrador" */ });
it("binario o HTML vacio no revienta y queda sin hallazgos", () => { /* analizarWeb(bytes al azar como string) → sin señales; estadoDeFicha → "sin_hallazgos" */ });
it("enlacesInternos devuelve hasta 3 del mismo host por palabras clave", () => { /* 5 enlaces, 2 externos → 3 internos en orden */ });
it("depurarUniverso: gob.ve fuera, Colombia fuera, leads de la web fuera, una por correo normalizado, principal la mas completa", () => {
  const r = depurarUniverso([...], (c) => c === "Bogotá" ? "CO" : "VE");
  expect(r.excluidas.map((e) => e.motivo)).toEqual(expect.arrayContaining(["correo_estado", "colombia", "lead_propio", "etapa"]));
  expect(r.duplicadas).toEqual([{ id: 3, principalId: 2 }]); // "Info@X.test " y "info@x.test" son la misma
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ficha-contrato.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `src/lib/ficha-contrato.ts`** con las firmas de arriba. Detección de plataforma por marcas en el HTML (`wp-content`, `woocommerce`, `cdn.shopify.com`/`Shopify.theme`, `wixstatic`/`wix.com`, `tiendanube`/`nuvemshop`); `cobraEnLinea` = hay `checkout`, `pasarela`, `mercadopago`, `stripe`, `paypal` o botón de pago; `motorExterno` = `cloudbeds|booking.com|expedia|despegar|siteminder|littlehotelier`; `nombreCoincide` = alguna palabra de 4+ letras del nombre (sin genéricas: hotel, restaurante, clínica, centro, posada, farmacia) aparece en `<title>` o en el `h1`; `estadoDeDescarga`: `!ok` o 5xx → `caida`; texto con «domain is for sale|dominio en venta|hugedomains|sedo» → `vendida`; «mantención|mantenimiento|coming soon|próximamente» → `en_mantenimiento`; `ConnectYourDomain|not connected to a website` → `caida`; url de red social → `red_social`. Textos de los ganchos: los de la tabla del spec, en una sola línea, sin saltos.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/ficha-contrato.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ficha-contrato.ts tests/ficha-contrato.test.ts tests/fixtures/webs
git commit -F - <<'EOF'
feat(fichas): contrato puro de la ficha de negocio: senales de la web, gancho y resumen por reglas, depuracion del universo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

### Task 3: Investigar un prospecto y el script en bloque

**Files:**
- Create: `src/lib/overture-cruce.ts` (sacar de `scripts/_cruzar.mts`: `limpiar`, `laxa`, `GENERICAS`, la carga de lugares por país y el cruce exacto/laxo; sin escribir nada)
- Create: `src/lib/fichas.ts`
- Create: `scripts/investigar-prospectos.mts`
- Test: `tests/fichas.test.ts`

**Interfaces:**
- Consumes: `descargar` de `@/lib/red-segura` (`{ ok, estado, urlFinal, texto }`), `ficha-contrato.ts` (Tarea 2), `paisDeCiudad` de `@/lib/overpass-contrato`, `reglaDeNicho`/`coincide` de `@/lib/overture-contrato`.
- Produces:
  - `overture-cruce.ts`: `type LugarCruzado = { id: string; direccion: string; categoriaBase: string; categoriaFina: string; telefonos: string; correos: string; webs: string; redes: string }`; `async function crearCruzador(pais: "VE" | "CO" = "VE"): Promise<(nombre: string, ciudad: string, slug: string) => LugarCruzado | null>` (carga `LugarOverture` del país una vez).
  - `fichas.ts`: `type Deps = { descargar?: typeof descargar; cruzar?: Awaited<ReturnType<typeof crearCruzador>>; ahora?: Date }`; `async function investigarProspecto(id: number, deps?: Deps): Promise<{ estado: EstadoFicha; gancho: string; fuentes: string[] }>` (lee portada + `enlacesInternos` con 1 s entre páginas vía `deps.descargar`; `maxBytes` 2 MB; arma `Hallazgos`; `upsert` de la ficha conservando `alAutomatico` y, si `estado === "revisada"`, **no pisa** `gancho` ni `resumen`; evento `ficha_generada` con el resumen en `texto`); `type FichaFila = { prospectoId: number; hallazgos: Hallazgos; fuentes: string[]; resumen: string; gancho: string; estado: EstadoFicha; alAutomatico: boolean; generadaEn: Date; revisadaEn: Date | null }`; `async function leerFicha(prospectoId: number): Promise<FichaFila | null>`; `async function guardarFicha(prospectoId: number, datos: { gancho: string; resumen: string }, usuarioId: number): Promise<void>` (estado → `revisada`, `revisadaEn`); `async function marcarAlAutomatico(prospectoId: number, si: boolean): Promise<void>`; `async function depurarYMarcar(aplicar: boolean): Promise<{ cola: number; duplicadas: number; excluidas: Record<string, number> }>` (usa `depurarUniverso` sobre `prisma.prospecto.findMany({ where: { email: { not: "" } } })`; con `aplicar`: duplicadas → `etapa: "descartado"` + evento `nota` «mismo correo que #id»; cola → ficha `alAutomatico: true` (crea la ficha vacía si no existe)).
  - `scripts/investigar-prospectos.mts`: `--depurar` (solo depuración), `--ids 1,2,3`, `--limite N`, `--aplicar`; sin `--aplicar` imprime lo que haría; 3 s entre prospectos; resumen final `investigados / listas / borrador / sin_hallazgos / con gancho`.

- [ ] **Step 1: Write the failing tests** (`tests/fichas.test.ts`, con base; `descargar` falso por `deps`, nunca a internet):

```ts
it("investiga con la web del fixture: ficha lista, gancho y fuentes, y evento ficha_generada", async () => {
  const p = await crearProspectoDePrueba(nichoRestaurantes, { nombre: "La Trattoria", email: "a@x.test", web: "https://ejemplo.test/" });
  const r = await investigarProspecto(p.id, { descargar: falsoCon({ "https://ejemplo.test/": fx("restaurante-carta-pdf.html") }), cruzar: () => null });
  expect(r.estado).toBe("lista"); expect(r.gancho).toContain("carta");
  const f = await leerFicha(p.id); expect(f?.fuentes).toContain("https://ejemplo.test/");
  expect(await prisma.evento.count({ where: { prospectoId: p.id, tipo: "ficha_generada" } })).toBe(1);
});
it("volver a investigar no pisa un gancho revisado por Neri", async () => { /* guardarFicha → investigarProspecto → leerFicha().gancho sigue siendo el editado y estado revisada */ });
it("sin web ni redes queda sin_hallazgos con el resumen de la base", async () => { /* resumen contiene tipo y ciudad; gancho "" */ });
it("depurarYMarcar: la principal al automatico, la duplicada descartada con nota, gob.ve excluida", async () => { /* 3 prospectos; aplicar=true; comprobar alAutomatico, etapa, evento */ });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:db -- tests/fichas.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `overture-cruce.ts`, `fichas.ts` y el script.** El cruce exacto exige la regla de nicho si la hay (como el script original); el laxo solo con un candidato único.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:db -- tests/fichas.test.ts tests/instrumentation-grafo.test.ts`
Expected: PASS.

- [ ] **Step 5: Ensayo real en seco (sin escribir)**

Run: `set -a; . ~/.config/prospectos/env; set +a; npx tsx scripts/investigar-prospectos.mts --depurar`
Expected: imprime cola ≈ 284, duplicadas ≈ 25, excluidas con `correo_estado` 10 (los números exactos se anotan en el commit); nada escrito.

- [ ] **Step 6: Commit**

```bash
git add src/lib/overture-cruce.ts src/lib/fichas.ts scripts/investigar-prospectos.mts tests/fichas.test.ts
git commit -F - <<'EOF'
feat(fichas): investigar prospectos (web + Overture + base), guardar la ficha y depurar el universo de correo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

### Task 4: La ficha en la pantalla del prospecto y sus acciones

**Files:**
- Create: `src/acciones/correos.ts` (solo `guardarGancho`, `reinvestigar`, `bloquearCorreo`, `ponerAlAutomatico` en esta tarea; `enviarPropuestaCorreo` llega en la Tarea 8)
- Create: `src/componentes/FichaNegocioBloque.tsx`
- Modify: `src/app/(panel)/prospectos/[id]/page.tsx` (bloque después de `SugerenciasWeb`), `src/lib/prospectos.ts` (`fichaProspecto` devuelve `ficha: FichaFila | null` y `correoBloqueado: string`)
- Test: `tests/acciones-correos.test.ts`

**Interfaces:**
- Consumes: `leerFicha`, `guardarFicha`, `investigarProspecto`, `marcarAlAutomatico` (Tarea 3); `exigirRol("dueno")`; `fallo`/`exito`.
- Produces: `guardarGancho(prospectoId: number, fd: FormData): Promise<Resultado>` (campos `gancho` ≤ 280, sin `<`, `>` ni saltos; `resumen` ≤ 1000; error «El gancho va en una sola línea, sin HTML, de hasta 280 caracteres.»); `reinvestigar(prospectoId: number): Promise<Resultado<{ estado: EstadoFicha }>>` (una por minuto por prospecto, con `permitirIntento`); `bloquearCorreo(prospectoId: number, motivo: "no_quiere" | "rebote"): Promise<Resultado>` (upsert en `CorreoBloqueado` con el correo normalizado + evento `correo_bloqueado`); `ponerAlAutomatico(prospectoId: number, si: boolean): Promise<Resultado>`. Todas solo `dueno`; revalidan `/correos` y `/prospectos/<id>`.
- `FichaNegocioBloque` (cliente): muestra estado, resumen, gancho (editable con `Campo`), hallazgos legibles (plataforma, qué tiene, dirección, fuentes con enlace) y los botones; `data-estado` en la tarjeta.

- [ ] **Step 1: Write the failing tests**

```ts
it("guardarGancho acepta 280 limpios y rechaza HTML, saltos y 281", ...);
it("guardarGancho deja la ficha revisada y no la pisa una reinvestigacion", ...);
it("bloquearCorreo normaliza y bloquea a todas las filas con esa direccion", ...); // dos prospectos, "Info@X.test" y "info@x.test"
it("el prospectador no puede: fallo sin tocar la base", ...);
```

- [ ] **Step 2: Run tests to verify they fail** · `npm run test:db -- tests/acciones-correos.test.ts` → FAIL.

- [ ] **Step 3: Implementar acciones, bloque y el enganche en la página.**

- [ ] **Step 4: Run tests to verify they pass** · `npm run test:db -- tests/acciones-correos.test.ts tests/prospectos.test.ts` → PASS; `npx tsc --noEmit` limpio.

- [ ] **Step 5: Mirar en el clon** a 390 px: `/prospectos/<id>` de un prospecto con ficha muestra el bloque y guarda un gancho (captura al scratchpad).

- [ ] **Step 6: Commit**

```bash
git add src/acciones/correos.ts src/componentes/FichaNegocioBloque.tsx "src/app/(panel)/prospectos/[id]/page.tsx" src/lib/prospectos.ts tests/acciones-correos.test.ts
git commit -F - <<'EOF'
feat(fichas): bloque «Lo que sabemos del negocio» en la ficha del prospecto, gancho editable, reinvestigar y bloquear correo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

## Fase 2 · El gancho en la propuesta

### Task 5: `{{gancho}}` en `renderPropuesta`, en las nueve plantillas y en `/p/<codigo>`

**Files:**
- Modify: `src/lib/propuesta-contrato.ts` (`ExtraPropuesta.gancho?: string`; bloque `si:gancho` con `bloque(html, "gancho", !!gancho)`; `{{gancho}}` escapado), `src/lib/mensajes-nicho-contrato.ts` (+ `PROMESA_POR_ARQUETIPO`, `CREDENCIAL_POR_ARQUETIPO`, `ANTETITULO_POR_ARQUETIPO`, siete entradas cada uno; las credenciales copiadas tal cual de la frase «Mis sistemas funcionan…» de cada arquetipo en `scripts/sembrar-nichos.mjs`; las promesas y antetítulos del spec §3), las nueve cartas (`plantillas/base/*.cuerpo.html`, `plantillas/hoteles.html`, `plantillas/hoteles-estadia.html`): `<!--si:gancho--><p>{{gancho}}</p><!--fin:gancho-->` justo después del primer `<p>` que sigue a `carta__destino`; `scripts/verificar-plantillas.mts` (segunda pasada con `gancho` de 280 caracteres); `src/app/p/[codigo]/route.ts` y `pdf/route.ts` (leen `leerFicha(p.id)?.gancho` y lo pasan en `extra`); `scripts/generar-propuestas.mts` (idem).
- Test: `tests/propuesta-contrato.test.ts`, `tests/mensajes-nicho-contrato.test.ts`

**Interfaces:**
- Produces: `renderPropuesta(plantilla, nombre, urlPdf, { ...extra, gancho })`; `PROMESA_POR_ARQUETIPO: Record<string, string>`, `CREDENCIAL_POR_ARQUETIPO: Record<string, string>`, `ANTETITULO_POR_ARQUETIPO: Record<string, string>`.

- [ ] **Step 1: Write the failing tests**

```ts
it("con gancho deja el bloque si:gancho con el texto escapado; sin gancho lo quita entero", () => { /* plantilla minima con el bloque; gancho "<b>x</b>" sale como &lt;b&gt; */ });
it("promesa, credencial y antetitulo existen para los 7 arquetipos y no proponen llamadas", () => { /* keys = las 7; not.toMatch(PROHIBIDO) */ });
```

- [ ] **Step 2: Run tests to verify they fail** · `npx vitest run tests/propuesta-contrato.test.ts tests/mensajes-nicho-contrato.test.ts` → FAIL.

- [ ] **Step 3: Implementar** contrato, listas, bloques en las plantillas (`python3 scripts/armar-plantillas.py` después), rutas y verificador.

- [ ] **Step 4: Verificar**

Run: `npx vitest run tests/propuesta-contrato.test.ts tests/mensajes-nicho-contrato.test.ts && npx tsx scripts/verificar-plantillas.mts`
Expected: PASS y las nueve `ok` con y sin gancho. Si comercio o reservas se desbordan **solo** con gancho: dejar `GANCHOS_SIN_PDF = ["comercio-y-tienda", "reservas"]` en `propuesta-contrato.ts` (esos dos no reciben `gancho` en `renderPropuesta` cuando `extra.paraPdf === true`) y anotarlo en el commit; el correo y la propuesta en línea sí lo llevan.

- [ ] **Step 5: Commit**

```bash
git add src/lib/propuesta-contrato.ts src/lib/mensajes-nicho-contrato.ts plantillas scripts/verificar-plantillas.mts scripts/generar-propuestas.mts "src/app/p" tests/propuesta-contrato.test.ts tests/mensajes-nicho-contrato.test.ts
git commit -F - <<'EOF'
feat(propuestas): parrafo de gancho «Vi que…» en la carta de las nueve plantillas, en linea y en PDF; promesa y credencial por arquetipo

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

## Fase 3 · Correo, rastreo y cola

### Task 6: Contrato puro del correo

**Files:**
- Create: `src/lib/correo-propuesta-contrato.ts`
- Test: `tests/correo-propuesta-contrato.test.ts`

**Interfaces:**
- Consumes: `cierreInicial`, `cierreSeguimiento`, `PREGUNTA_POR_ARQUETIPO`, `PROMESA_POR_ARQUETIPO`, `CREDENCIAL_POR_ARQUETIPO`, `ANTETITULO_POR_ARQUETIPO` (Tareas 2 y 5 de esta fase: `mensajes-nicho-contrato.ts`); `fraseDePromo` (`propuesta-contrato.ts`); `limpiarCabecera` (`@/lib/correo`).
- Produces: `const BASE_PANEL = "https://prospectos.neracosu.com"`; `const WA_NERI = "584222707095"`; `type DatosCorreo = { nombre: string; ciudad: string; arquetipo: string; codigo: string; token: string; gancho: string; hojas: number; hoy: string; dondeCorreo: string; tipo: "inicial" | "seguimiento" }`; `function asuntoPropuesta(d: DatosCorreo): string` (`Propuesta para {nombre}: {promesa}` / `Le reenvío la propuesta para {nombre}`; pasa por `limpiarCabecera`); `function armarCorreoPropuesta(d: DatosCorreo): { asunto: string; previo: string; html: string; texto: string }`; `function enlacesDe(d): { ver: string; pdf: string; pixel: string; whatsapp: string }` (`${BASE_PANEL}/r/${token}`, `${BASE_PANEL}/p/${codigo}/pdf?e=${token}`, `${BASE_PANEL}/api/correo/a/${token}.png`, `https://wa.me/${WA_NERI}?text=` con «Hola Neri, leí la propuesta para {nombre} y quiero ver cómo quedaría con mi marca.»). La maqueta es la de la prueba del 29-oct (tabla 600 px, CSS en línea, logotipo de texto con el punto `#5ed29c`, Georgia en títulos, Arial en cuerpo, botón «Ver la propuesta» `#1f5a45`, botón «Responder por WhatsApp» con borde, gancho en caja `#f1f4f2` con filete `#1f5a45`, línea de temporada si `fraseDePromo(hoy)` no es vacía, firma, pie con `dondeCorreo` y la salida «respóndame «no»»); el píxel es la única `<img>`. El seguimiento: tres párrafos (le escribí el {fecha}, aquí la propuesta, cierre de seguimiento), sin gancho ni promo. Texto plano con el mismo contenido.

- [ ] **Step 1: Write the failing tests**

```ts
it("inicial: asunto con la promesa del arquetipo, gancho escapado en su caja, enlaces con el token, enganche del arquetipo, pie con el porque", () => {
  const c = armarCorreoPropuesta(d({ gancho: "Vi que <su> carta", arquetipo: "restaurantes-y-bares", token: "t".repeat(22) }));
  expect(c.asunto).toBe("Propuesta para La Trattoria: comandas y caja sin cuaderno");
  expect(c.html).toContain("Vi que &lt;su&gt; carta"); expect(c.html).toContain("/r/tttttttttttttttttttttt"); expect(c.html).toContain("/p/abc/pdf?e=tttttttttttttttttttttt"); expect(c.html).toContain("/api/correo/a/tttttttttttttttttttttt.png");
  expect(c.html).toContain(cierreInicial("restaurantes-y-bares")); expect(c.texto).toContain("respóndame «no»");
  expect((c.html.match(/<img/g) ?? []).length).toBe(1); expect(c.html).not.toMatch(/\{\{|\{[a-z]+\}/);
});
it("sin gancho no hay caja; citas sin demostracion; despues del 31-dic sin temporada", ...);
it("seguimiento: asunto de reenvio, sin gancho, con el enlace y el cierre de seguimiento", ...);
it("nada del prospecto rompe una cabecera: nombre con salto de linea", () => { expect(asuntoPropuesta(d({ nombre: "X\nBcc: y" }))).not.toMatch(/[\r\n]/); });
it("ningun texto propone llamadas", () => { expect(c.html + c.texto).not.toMatch(/llamada|videollamada|reuni[oó]n|30 minutos/i); });
```

- [ ] **Step 2: Run tests to verify they fail** · `npx vitest run tests/correo-propuesta-contrato.test.ts` → FAIL.
- [ ] **Step 3: Implementar el contrato.**
- [ ] **Step 4: Run tests to verify they pass** · PASS.
- [ ] **Step 5: Commit** (`feat(correos): contrato puro del correo de propuesta, inicial y seguimiento, con rastreo por token`).

### Task 7: Envío por `sendmail` y las tres rutas de rastreo

**Files:**
- Create: `src/lib/correo-envio.ts`, `src/lib/correos.ts` (solo la parte de rastreo en esta tarea: `registrarApertura`, `registrarClic`, `registrarPdf`, `crearEnvio`), `src/app/api/correo/a/[token]/route.ts`, `src/app/r/[token]/route.ts`
- Modify: `src/app/p/[codigo]/pdf/route.ts` (`?e=` válido → `registrarPdf`), `package.json` (`npm i nodemailer@^7 && npm i -D @types/nodemailer`)
- Test: `tests/correo-envio.test.ts`, `tests/rastreo.test.ts`

**Interfaces:**
- Produces (`correo-envio.ts`): `type Mensaje = { para: string; asunto: string; html: string; texto: string; adjunto?: { nombre: string; ruta: string } }`; `async function enviarCorreo(m: Mensaje): Promise<{ ok: true; id: string } | { ok: false; error: string }>` (transporte `sendmail` de nodemailer: `{ sendmail: true, path: "/usr/sbin/sendmail", args: ["-i", "-f", "info@neracosu.com"], newline: "unix" }`; `from`, `replyTo`, `envelope.from`; fuera de producción: con `PROSPECTOS_CORREO_SIMULADO=1` devuelve `{ ok: true, id: "simulado" }`, si no `{ ok: false, error: "fuera de produccion" }`); `function _transporteParaTests(t: { sendMail: (o: Record<string, unknown>) => Promise<{ messageId: string }> } | null): void`.
- Produces (`correos.ts`): `const TOKEN_VALIDO = /^[A-Za-z0-9_-]{22}$/`; `async function crearEnvio(d: { prospectoId: number; tipo: "inicial" | "seguimiento"; asunto: string; para: string }): Promise<{ id: number; token: string }>` (token con `generarCodigo()`); `async function registrarApertura(token: string): Promise<void>`; `async function registrarClic(token: string): Promise<string | null>` (devuelve el `codigo` del prospecto o `null`); `async function registrarPdf(token: string, codigo: string): Promise<void>` (solo si el token es de ese prospecto). Las tres: token inválido → no consultan; primera vez → evento `correo_abierto` / `correo_clic` / `pdf_descargado`; siempre suman el contador; no cuentan si hay sesión del panel (misma `tieneSesion` que `/p/[codigo]`: moverla a `src/lib/sesion-ligera.ts` y usarla en los tres sitios).
- Rutas: píxel → `image/png` de 1×1 transparente (bytes fijos en el código), `cache-control: no-store`, siempre 200; `/r/<token>` → 302 a `/p/<codigo>?e=<token>` o 404; PDF → igual que hoy más el conteo.

- [ ] **Step 1: Write the failing tests**

```ts
// correo-envio.test.ts
it("arma el mensaje con remitente, reply-to, envelope, html, texto y adjunto, y devuelve el id del transporte", async () => { /* _transporteParaTests captura; comprobar o.from, o.replyTo, o.envelope.from, o.attachments[0].filename */ });
it("fuera de produccion sin transporte de tests ni simulado: no manda y lo dice", ...);
// rastreo.test.ts (con base)
it("apertura: primera vez evento y abiertoEn; segunda solo suma", ...);
it("clic devuelve el codigo y deja correo_clic una vez; token invalido devuelve null sin consultar", ...); // espiar prisma.envioCorreo.findUnique
it("pdf cuenta solo si el token es del mismo prospecto", ...);
it("la ruta del pixel responde png 1x1 con token basura y no escribe nada", ...); // importar GET de la ruta
```

- [ ] **Step 2: Run tests to verify they fail** · `npm run test:db -- tests/correo-envio.test.ts tests/rastreo.test.ts` → FAIL.
- [ ] **Step 3: Instalar nodemailer e implementar.**
- [ ] **Step 4: Verificar** · tests PASS; `npm run test:db -- tests/instrumentation-grafo.test.ts` PASS; `npx tsc --noEmit` limpio.
- [ ] **Step 5: Commit** (`feat(correos): envio por sendmail con nodemailer y rastreo de apertura, clic y descarga del PDF por token`).

### Task 8: Preparar y enviar a mano, cola y cifras

**Files:**
- Modify: `src/lib/correos.ts` (+ `prepararEnvio`, `registrarEnvio`, `enviarA`, `colaCorreo`, `cifrasCorreo`, `enviadosHoy`), `src/acciones/correos.ts` (+ `enviarPropuestaCorreo`)
- Test: `tests/correos.test.ts`, `tests/acciones-correos.test.ts`

**Interfaces:**
- Consumes: `armarCorreoPropuesta` (T6), `enviarCorreo`, `crearEnvio` (T7), `leerFicha` (T3), `generarPdf`/`hashDe`/`fechaDePropuesta`/`leerPlantillaPara`/`renderPropuesta` (como `pdf/route.ts`), `leerConfig(CLAVES.correosPorDia)` (clave nueva en T10; hasta entonces `"25"` por defecto en `DEFECTOS`).
- Produces: `type FilaCola = { prospectoId: number; codigo: string; nombre: string; ciudad: string; arquetipo: string; nichoNombre: string; email: string; estadoFicha: EstadoFicha; gancho: string; alAutomatico: boolean; nombreNoCoincide: boolean; bloqueado: string; etapa: string; envio: { id: number; tipo: string; enviadoEn: Date; abiertoEn: Date | null; clicEn: Date | null; pdfEn: Date | null; fallo: string } | null; tocaSeguimiento: boolean }`; `async function colaCorreo(hoy: string, filtro?: { arquetipo?: string; estado?: "listas" | "enviadas" | "seguimiento" | "bloqueadas" | "fallidas" }): Promise<FilaCola[]>` (base: `DEL_DIRECTORIO`, `email != ""`, `paisDeCiudad === "VE"`, con ficha; orden: con gancho primero, luego arquetipo en `[comercio-y-tienda, restaurantes-y-bares, hoteles-estadia, reservas, hoteles, cobros-y-pagos, citas-y-servicios]`, luego `id`); `type Cifras = { enviados: number; abrieron: number; vieron: number; descargaron: number; respondieron: number }`; `async function cifrasCorreo(): Promise<{ total: Cifras; porArquetipo: Record<string, Cifras> }>`; `async function enviadosHoy(hoy: string): Promise<number>` (envíos sin `fallo` con `enviadoEn` en el día de Caracas); `async function prepararEnvio(prospectoId: number, tipo: "inicial" | "seguimiento"): Promise<{ datos: DatosCorreo; correo: ReturnType<typeof armarCorreoPropuesta>; pdf: { ruta: string; nombre: string } | null; token: string } | { error: string }>` (crea el `EnvioCorreo` **antes** de mandar, con el token; genera el PDF con el gancho; `dondeCorreo` = «su página {host}» si `fuentesPorCampo.email` es su web, si no «un directorio público»); `async function enviarA(prospectoId: number, tipo, usuarioId: number | null, opciones?: { reenviar?: boolean }): Promise<Resultado<{ token: string }>>` (rechaza si bloqueado, si ya hay envío `inicial` sin `fallo` y no `reenviar`, si `nombreNoCoincide`, si no hay plantilla; manda; con éxito: transacción con evento `enviado` canal `email` (o `seguimiento`), etapa `enviado`, `proximoSeguimiento = hoy + diasSeguimiento`; con fallo: `EnvioCorreo.fallo = error`, nada más cambia).
- `enviarPropuestaCorreo(prospectoId: number, reenviar = false): Promise<Resultado<{ token: string }>>` (solo `dueno`; respeta `enviadosHoy < tope`, mensaje «Hoy ya salieron {n} de {tope}. Sube el tope en Ajustes o espera a mañana.»).

- [ ] **Step 1: Write the failing tests** (`tests/correos.test.ts` con base y `_transporteParaTests`; `generarPdf` falso con `vi.mock("@/lib/propuesta")` que devuelve una ruta temporal):

```ts
it("prepararEnvio crea el EnvioCorreo con token y arma el correo con el gancho de la ficha", ...);
it("enviarA con exito: evento enviado canal email, etapa enviado, proximoSeguimiento a +diasSeguimiento, sale de colaCorreo('listas') y entra en 'enviadas'", ...);
it("enviarA con fallo del transporte: fallo guardado, etapa intacta, aparece en 'fallidas' y se puede reintentar", ...);
it("no manda a un correo bloqueado ni dos veces sin reenviar; con reenviar manda y deja dos envios", ...);
it("colaCorreo ordena: con gancho primero, luego comercio antes que citas", ...);
it("cifrasCorreo cuenta enviados, abrieron, vieron, descargaron y respondieron (etapa respondio o posterior)", ...);
it("enviarPropuestaCorreo respeta el tope diario y el rol", ...); // acciones-correos.test.ts
```

- [ ] **Step 2: Run tests to verify they fail** → FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Run tests to verify they pass** · `npm run test:db -- tests/correos.test.ts tests/acciones-correos.test.ts` → PASS.
- [ ] **Step 5: Commit** (`feat(correos): cola, cifras, preparar y enviar la propuesta por correo a mano con tope diario`).

### Task 9: Envío automático goteado

**Files:**
- Modify: `src/lib/correos.ts` (+ `enviarAutomatico`), `src/lib/configuracion.ts` (+ `CLAVES.correosPorDia = "correos_por_dia"` → `"25"`, `CLAVES.correosAutomatico = "correos_automatico"` → `"on"`)
- Create: `src/app/api/correos/automatico/route.ts`
- Test: `tests/correos.test.ts`

**Interfaces:**
- Produces: `function ventanaDeEnvio(ahora: Date): boolean` (puro, en `correo-propuesta-contrato.ts`: lunes a viernes, 09:00 a 16:59 hora de Caracas, usando `Intl.DateTimeFormat("es-VE", { timeZone: "America/Caracas", weekday, hour })`); `function tamanoLote(tope: number): number` = `Math.ceil(tope / 8)`; `async function enviarAutomatico(ahora: Date = new Date()): Promise<{ enviados: number; delDia: number; tope: number; motivo: string }>` (motivo: `"apagado" | "fuera_de_horario" | "tope" | "sin_cola" | "ok"`; toma `colaCorreo(hoy, { estado: "listas" })` filtrada por `alAutomatico && !nombreNoCoincide && !bloqueado && estadoFicha in (lista, revisada)`; manda en serie con `enviarA(id, "inicial", null)` releyendo `enviadosHoy` antes de cada uno; para al llegar al tope o al lote; imprime `[correos] <hoy hh:mm>: N enviados, M del dia, tope T (motivo)`).
- Ruta `POST /api/correos/automatico`: cabecera `x-cron-secret` igual a `process.env.PROSPECTOS_CRON_SECRET` (si la variable falta o no coincide → 404 sin cuerpo); responde el JSON de `enviarAutomatico`; `export const dynamic = "force-dynamic"`.

- [ ] **Step 1: Write the failing tests**

```ts
it("ventanaDeEnvio: lunes 09:00 Caracas si, sabado no, lunes 17:00 no", ...);
it("enviarAutomatico manda el lote (ceil(tope/8)) en orden de la cola y nunca pasa del tope aunque ya hubiera 24 de 25", ...);
it("apagado o fuera de horario: 0 enviados con su motivo", ...);
it("salta los no coincidentes, los bloqueados y los que no estan al automatico", ...);
it("la ruta sin secreto responde 404 y no manda", ...);
```

- [ ] **Step 2: Run tests to verify they fail** → FAIL.
- [ ] **Step 3: Implementar.** Agregar `PROSPECTOS_CRON_SECRET` al env de producción (`openssl rand -base64 32`, en `~/.config/prospectos/env`, 600) **sin pasarlo por la línea de comandos** y anotar la línea de crontab en el CLAUDE.md:
  `0 9-17 * * 1-5 bash -c 'set -a; . ~/.config/prospectos/env; set +a; curl -s -o /dev/null -X POST -H "x-cron-secret: $PROSPECTOS_CRON_SECRET" https://prospectos.neracosu.com/api/correos/automatico'`
- [ ] **Step 4: Run tests to verify they pass** → PASS.
- [ ] **Step 5: Commit** (`feat(correos): envio automatico goteado por ruta con secreto para el crontab, tope diario e interruptor`).

### Task 10: Pantalla `/correos`, navegación y Ajustes

**Files:**
- Create: `src/app/(panel)/correos/page.tsx`, `src/componentes/ColaCorreos.tsx`, `src/componentes/VistaPreviaCorreo.tsx`, `src/componentes/FormularioAjustesCorreos.tsx`, `scripts/verificar-correos.mts`
- Modify: `src/lib/navegacion-contrato.ts` (`correos: { href: "/correos", texto: "Correos", icono: "correos" }` entre `directorio` y `web` para el dueño), `src/componentes/Icono.tsx` (sobre), `src/acciones/ajustes.ts` (+ `guardarCorreos(fd)`: `tope` 1 a 200, `automatico` on/off), `src/app/(panel)/ajustes/page.tsx` (sección «Correos»), `src/acciones/correos.ts` (+ `vistaPrevia(prospectoId): Promise<Resultado<{ asunto: string; html: string; pdfUrl: string }>>`, sin crear envío: usa `armarCorreoPropuesta` con token `"vista-previa-0000000000"`), estilos en el CSS global del panel (`.cola-correos`, `.hoja-lateral` desde 1024 px)
- Test: `tests/navegacion-contrato.test.ts` (lista del dueño con `/correos`), `tests/ajustes-correos.test.ts`

**Pantalla:** `CabeceraPagina` «Correos» con cifra «{listas} listas · {hoy}/{tope} hoy»; bloque de cifras (`Cifras` total y por arquetipo, con % sobre enviados y la nota «la apertura es aproximada»); estado del automático (encendido/apagado, próximo lote) con botón «Pausar/Reanudar» (llama `guardarCorreos`); chips `?estado=listas|enviadas|seguimiento|fallidas|bloqueadas` y `?arquetipo=`; tabla `.tabla` (mismo DOM teléfono/escritorio): nombre (enlace a la ficha), ciudad, arquetipo, correo, gancho recortado a 90, estado de la ficha, hitos (enviado · abrió · vio · PDF con fecha corta), botones «Ver» (abre `VistaPreviaCorreo`: hoja lateral en ≥1024, pantalla completa debajo; muestra asunto, el HTML en un `<iframe sandbox srcdoc>`, enlace al PDF, gancho editable con `guardarGancho`, y «Enviar»/«Reenviar») y «Enviar» directo. Solo `dueno`.

- [ ] **Step 1: Write the failing tests** (navegación: el arreglo del dueño con `/correos` en la posición 7; ajustes: `guardarCorreos` guarda tope y interruptor y rechaza 0 y 201) → FAIL.
- [ ] **Step 2: Implementar** pantalla, componentes, navegación, icono, ajustes y estilos.
- [ ] **Step 3: Tests** · `npm run test:db -- tests/navegacion-contrato.test.ts tests/ajustes-correos.test.ts` → PASS; `npx tsc --noEmit`.
- [ ] **Step 4: Recorrido real** `scripts/verificar-correos.mts` contra el clon (`PROSPECTOS_CORREO_SIMULADO=1`, base de tests; siembra dentro del `try`): a 390 y 1280: `/correos` lista 3 filas en orden, abre la vista previa de una, edita el gancho y lo ve en el iframe, envía y la fila pasa a «enviadas» con el hito, el prospectador recibe 404 en `/correos`, el pixel y `/r/<token>` responden y los hitos aparecen, pausa y reanuda el automático. Capturas al scratchpad.

Run: `npx tsx scripts/verificar-correos.mts` → `NN/NN ok`.

- [ ] **Step 5: Commit** (`feat(correos): pantalla /correos con cifras, vista previa, envio y bloqueo; seccion en la barra; ajustes de tope e interruptor`).

## Fase 4 · Datos reales, despliegue y arranque

### Task 11: Investigar los 286, PDFs por adelantado, desplegar y encender

**Files:**
- Create: `scripts/pregenerar-pdf-correos.mts` (para cada fila de `colaCorreo(hoy, { estado: "listas" })` genera el PDF con el gancho si no existe; Chromium de a uno)
- Modify: `CLAUDE.md` (sección «Propuesta por correo»), `~/.claude/...memory` (fuera del repo)

- [ ] **Step 1: Revisión final de la rama** con un revisor fresco (subagent-driven) y arreglos.
- [ ] **Step 2: Fusionar a `main`, desplegar:** `set -a; . ~/.config/prospectos/env; set +a; npm ci && npx prisma migrate deploy && npm run build && pm2 list && pm2 restart prospectos`; verificar `curl -s -o /dev/null -w '%{http_code}' https://prospectos.neracosu.com/entrar` = 200 y `pm2 list` online sin subir reinicios más de uno; `[mensualidades]` y `[revision]` en el log.
- [ ] **Step 3: Depurar y marcar:** `npx tsx scripts/investigar-prospectos.mts --depurar` (leer) → `--depurar --aplicar`. Anotar los números.
- [ ] **Step 4: Investigar en bloque:** `npx tsx scripts/investigar-prospectos.mts --aplicar` (unos 15 min a 3 s por prospecto; dejarlo en `nohup` con log en el scratchpad). Luego `npx tsx scripts/pregenerar-pdf-correos.mts`.
- [ ] **Step 5: Muestra de 20** (3 por arquetipo, con y sin gancho): leer ficha, gancho y vista previa en `/correos`; corregir reglas si algún gancho miente o suena a máquina; volver a investigar esos.
- [ ] **Step 6: Primeros 10 a mano con Neri** desde `/correos` (automático apagado hasta aquí: `guardarCorreos` con `off` antes del Step 2 si el `DEFECTO` es `on`). Confirmar con Neri que llegan a bandeja. Entonces crontab (línea de la Tarea 9) y automático `on`.
- [ ] **Step 7: Documentar:** CLAUDE.md (dónde vive cada cosa, el crontab, el secreto, la regla del tope, «la apertura es aproximada», qué no se hace: reseñas, Colombia, tercer toque) y la memoria. Commit y push.

---

## Self-review (hecho al escribir)

- **Cobertura del spec:** fichas (T1–T4), gancho en PDF y en línea (T5), correo (T6), envío y rastreo (T7), cola/cifras/manual/tope (T8), automático por cron (T9), pantalla/navegación/Ajustes/recorrido (T10), depuración, investigación real, pregenerar, despliegue, muestra de 20, primeros 10 con Neri, crontab (T11). Reseñas: fuera (decisión de Neri). Seguimiento: contrato en T6 y `tocaSeguimiento` en T8; el segundo correo se manda desde `/correos` con `enviarPropuestaCorreo(id)` cuando `tocaSeguimiento` (tipo `seguimiento`): **añadido a T8**: `enviarA` elige `tipo = "seguimiento"` si ya hay un envío inicial exitoso y `tocaSeguimiento`.
- **Nombres consistentes:** `leerFicha`/`guardarFicha`/`investigarProspecto` (T3) usados en T4, T5, T8; `armarCorreoPropuesta`/`DatosCorreo` (T6) en T8, T10; `crearEnvio`/`registrar*` (T7) en T8; `enviarA` (T8) en T9; `CLAVES.correosPorDia`/`correosAutomatico` (T9) en T8 y T10.
- **Review Focus:** 1 → T2; 2 → T2 y T4/T8; 3 → T7; 4 → T9; 5 → T4 y T6; 6 → T8.
- **Proporción:** el plan nombra firmas, valores y pruebas; los cuerpos quedan al constructor.
