# Pieza 4 — Recibos de pago — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada cobro pagado pueda tener su «Recibo de pago» en PDF, con número correlativo por año que nunca se repite ni queda con huecos sin explicar, descargable solo por el dueño, avisable por WhatsApp y anulable con una nota `-A`.

**Architecture:** Mismos cimientos (Next 15 + Server Actions, Prisma/MariaDB, CSS plano). Las reglas (número, concepto, versiones incluidas, render de la plantilla) son un módulo puro. El motor de PDF de las propuestas se extrae a `src/lib/pdf.ts` para que recibos y propuestas compartan **la misma fila de un solo Chromium**. El número se asigna dentro de una transacción que bloquea la fila de `Correlativo` (`SELECT … FOR UPDATE`) y que **incluye la generación del PDF**: si Chromium falla, la transacción se deshace y el número sigue libre.

**Tech Stack:** Node 20 · Next 15.5 · Prisma 6.19 (MariaDB) · zod 4 · vitest 4 · Playwright 1.63 (PDF y recorrido).

**Spec:** `docs/superpowers/specs/2026-09-16-recibos-design.md` (pieza 4) y `docs/superpowers/specs/2026-09-16-plataforma-vision-general.md`. Referencias de estilo en el repo: `src/acciones/cobros.ts` (acciones), `src/lib/propuesta.ts` (motor de PDF actual), `tests/cobros.test.ts` (mock de sesión y base), `src/componentes/TabCobros.tsx` (fila de cobro). Leer también el `CLAUDE.md` del proyecto: trae las trampas del servidor.

## Global Constraints

- El documento se titula **«Recibo de pago»**, nunca «factura». Pie fijo: «Este documento es un recibo de pago y no constituye factura fiscal.»
- **Solo `dueno`** genera, descarga, avisa y anula. Acciones: `exigirRol("dueno")` **fuera** del try/catch (redirige a `/hoy`, como toda la pieza 3). Ruta de descarga: sin sesión → `307` a `/entrar`; con sesión que no es `dueno` → **`403`**.
- Número **`R-AAAA-NNNN`**, correlativo por año (año del día de Caracas en que se genera), en la tabla `Correlativo (serie, anio, ultimo)`. Se asigna con la fila bloqueada (`FOR UPDATE`) y **solo se confirma si el PDF ya está en disco**. Nunca se reutiliza.
- **Un recibo emitido no cambia**: si `Cobro.reciboNumero` ya tiene valor, jamás se regenera el PDF, aunque cambie la plantilla. Si el archivo no está en disco, la descarga responde `404`; no se regenera.
- Archivos en `$PROSPECTOS_DIR_ARCHIVOS/recibos/<año>/R-2026-0001.pdf` (producción: `~/prospectos-archivos`), fuera del docroot, directorio `700`, archivo `600`, escritura atómica (temporal + `rename`).
- Un cobro **pendiente** o **anulado** no genera recibo. Si faltan datos del emisor (nombre, RIF, WhatsApp, correo) no se genera y la pantalla dice «Completa tus datos en Ajustes».
- Anular un cobro con recibo **no borra el PDF**: genera la nota `R-2026-0001-A`.
- **Un solo Chromium a la vez en todo el proceso** (fila global de `src/lib/pdf.ts`), compartido con las propuestas.
- ⚠️ **La cadena de imports de `src/instrumentation.ts` no puede tocar ningún `node:`.** `src/lib/pdf.ts` y `src/lib/recibos.ts` usan `node:` → nunca se importan desde esa cadena (`mensualidades`, `revision`, `revision-contrato`, `clave-prospecto`, `cobros-contrato`, `db`, `dinero`, `fecha-caracas`). `recibos-contrato.ts` es puro a propósito.
- ⚠️ **Migraciones solo con `prisma migrate deploy`**; nunca `migrate dev` ni `db push`. La migración de esta pieza se escribe a mano (no tiene columnas Json).
- ⚠️ **El recorrido de punta a punta nunca corre contra producción**: generar un recibo de prueba gastaría un correlativo real. Se corre contra un servidor de desarrollo levantado desde un clon fuera del docroot, con la base `neracosu_prospectos_test`.
- ⚠️ **Procesos: matar solo por PID** guardado con `$!`. Nunca `pkill`/`killall`/patrones. Nunca `next dev` ni `next build` en el docroot salvo el build del despliegue, que lo corre **solo el controlador**, uno a la vez en todo el servidor. Los subagentes verifican con `npx tsc --noEmit` y los tests.
- Tests contra `neracosu_prospectos_test`. `npm test` (pura) y `npm run test:db` (real) en verde antes de fusionar.
- Toda acción `"use server"`: sesión fuera del try/catch, zod, sin helpers exportados, devuelve `Resultado`.
- Español (Venezuela) en todo texto visible; comentarios en el código **sin acentos**; 390 px primero. Commits por heredoc (`git commit -F -`) terminados en `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Todo el trabajo va en la rama **`pieza-4`**, creada desde `main` en la tarea 1.

## Decisiones de este plan que no están en la spec

1. **Un cobro pagado ahora se puede anular** (con motivo). La pieza 3 lo prohibía («Un cobro pagado no se anula»), pero la spec de la pieza 4 exige «anular un cobro con recibo emitido», y un cobro con recibo siempre está pagado. Se permite para todo cobro pagado, tenga o no recibo: limitarlo a «solo si tiene recibo» obligaría a generar un recibo para poder corregir un pago marcado por error. Un cobro anulado deja de contar como cobrado (`cifrasDelMes` ya salta los anulados). Una mensualidad anulada no la recrea el cron (el mes ya existe): si hace falta, se agrega un cobro a mano.
2. **El PDF se genera dentro de la transacción del correlativo**, no después. La spec pide a la vez «el número va impreso en el PDF» y «el número se asigna después de que el PDF exista»: la única forma de cumplir ambas es reservar el número con la fila bloqueada, generar, y confirmar al final. La transacción puede durar hasta ~60 s (`timeout: 90_000`); a esta escala (un usuario) no estorba, y de paso serializa las generaciones.
3. **Columna nueva `Cobro.notaAnulacionEn`**: si Chromium falla al anular, el cobro queda anulado igual y la nota se puede generar después con un botón. Hace falta saber si ya existe.
4. **Fuentes locales** en `plantillas/fuentes/` (Source Sans 3 y Source Serif 4, las mismas de la propuesta de hoteles, licencia OFL), incrustadas como `data:` al renderizar. Un recibo no cambia nunca, así que no puede quedar con la tipografía de respaldo porque Google Fonts tardó ese día.
5. **Eventos nuevos** `recibo_generado` y `nota_anulacion` en el historial del proyecto (además del `aviso_cliente` que pide la spec).
6. **PDF etiquetado** (`tagged: true`) para todos los PDF del motor: idioma y estructura accesibles. Medido en el prototipo: el recibo pesa ~140 KB.

---

## Estructura de archivos

```
prisma/schema.prisma                         ← Correlativo, Cobro.notaAnulacionEn, indice por reciboNumero
prisma/migrations/20260917120000_recibos/migration.sql
plantillas/recibo.html                       ← una sola plantilla: recibo y nota de anulacion
plantillas/fuentes/                          ← source-sans-3.woff2, source-serif-4.woff2, LEEME.txt
src/lib/
  cobros-contrato.ts                         ← (modificar) exporta nombreMes
  mensualidades.ts                           ← (modificar) usa nombreMes de cobros-contrato
  fecha-caracas.ts                           ← (modificar) fechaVisible(iso) → dd/mm/aaaa
  mensajes-cobro.ts                          ← (modificar) usa fechaVisible
  recibos-contrato.ts                        ← numero, concepto, versiones, emisor, campos, render, mensaje  (puro)
  pdf.ts                                     ← conTurnoGlobal, imprimirPdf, escribirAtomico (extraido de propuesta.ts)
  propuesta.ts                               ← (modificar) usa pdf.ts
  recibos.ts                                 ← rutaDocumento, generarRecibo, generarNotaAnulacion (base + disco)
  proyectos.ts                               ← (modificar) CobroFila.reciboNumero / notaAnulacion
src/acciones/
  recibos.ts                                 ← generarReciboDeCobro, avisarRecibo, generarNotaDeAnulacion
  cobros.ts                                  ← (modificar) anularCobro admite pagados y dispara la nota
src/app/recibos/[archivo]/route.ts           ← GET /recibos/R-2026-0001.pdf y /recibos/R-2026-0001-A.pdf
src/app/(panel)/proyectos/[id]/page.tsx      ← (modificar) emisorListo, textos de evento
src/componentes/AccionesRecibo.tsx           ← botones de recibo de una fila de cobro
src/componentes/TabCobros.tsx                ← (modificar) monta AccionesRecibo, confirmacion de anular
src/app/globals.css                          ← (modificar) .estado-fila, boton aria-disabled
tests/
  esquema.test.ts · ayuda-db.ts · cobros.test.ts · fecha-caracas.test.ts   ← (modificar)
  recibos-contrato.test.ts · instrumentation-grafo.test.ts                  ← puros
  pdf.test.ts · recibos.test.ts · recibos-pdf.test.ts · recibos-ruta.test.ts ← con base
scripts/verificar-flujo-recibos.mts          ← recorrido a 390 px, SOLO contra la base de tests
```

**Convenciones:** los errores de `src/lib/recibos.ts` son `Error` con un código en `message` (`EMISOR_INCOMPLETO`, `COBRO_NO_EXISTE`, `RECIBO_NO_APLICA`, `NOTA_NO_APLICA`, `PDF_OCUPADO`); las acciones los traducen a texto. Fechas de negocio: texto ISO `YYYY-MM-DD` en día de Caracas; en pantalla y en el PDF, `dd/mm/aaaa` con `fechaVisible`.

---

### Task 1: Esquema — `Correlativo`, `notaAnulacionEn`, índice por número

**Files:**
- Modify: `prisma/schema.prisma` (modelo `Cobro`, líneas 191-218; modelo nuevo al final)
- Create: `prisma/migrations/20260917120000_recibos/migration.sql`
- Modify: `tests/ayuda-db.ts:14-29` (`limpiarBase`)
- Test: `tests/esquema.test.ts`

**Interfaces:**
- Produces: `prisma.correlativo` con clave compuesta `serie_anio: { serie, anio }` y `ultimo: number` (defecto 0); `Cobro.notaAnulacionEn: Date | null`; `limpiarBase()` también vacía `Correlativo`.

- [ ] **Step 1: Crear la rama**

```bash
cd /home/neracosu/public_html/prospectos.neracosu.com && git status --short && git switch -c pieza-4
```
Expected: sin cambios pendientes; `Switched to a new branch 'pieza-4'`.

- [ ] **Step 2: Escribir el test que falla** — agregar al final del `describe` de `tests/esquema.test.ts`:

```ts
  it("el correlativo es unico por serie y anio, y el cobro guarda cuando se genero su nota de anulacion", async () => {
    const { nichoId } = await sembrarBasico();
    await prisma.correlativo.create({ data: { serie: "R", anio: 2026 } });
    await expect(prisma.correlativo.create({ data: { serie: "R", anio: 2026 } })).rejects.toThrow(/Unique/);
    await prisma.correlativo.create({ data: { serie: "R", anio: 2027 } }); // otro anio, otra fila
    expect((await prisma.correlativo.findUniqueOrThrow({ where: { serie_anio: { serie: "R", anio: 2026 } } })).ultimo).toBe(0);
    const c = await sembrarCliente();
    const p = await sembrarProyecto(c.id, nichoId);
    const cobro = await prisma.cobro.create({ data: { proyectoId: p.id, concepto: "extra", monto: "10.00", vence: "2026-10-05" } });
    expect(cobro.notaAnulacionEn).toBeNull();
    expect(cobro.reciboNumero).toBe("");
  });
```

- [ ] **Step 3: Correrlo y ver que falla**

Run: `PROSPECTOS_TEST_DB=1 npx vitest run tests/esquema.test.ts`
Expected: FAIL — `prisma.correlativo` es `undefined` (o error de tipos).

- [ ] **Step 4: Esquema** — en `prisma/schema.prisma`, dentro de `model Cobro`, debajo de `reciboGeneradoEn`:

```prisma
  // Nota de anulacion R-AAAA-NNNN-A: cuando se genero su PDF. Nulo = todavia no existe.
  notaAnulacionEn  DateTime?
```

y entre los `@@index` de `Cobro`:

```prisma
  @@index([reciboNumero])
```

y al final del archivo:

```prisma
// Contador por serie y anio (pieza 4: serie "R" de los recibos). Se incrementa con la
// fila bloqueada (SELECT ... FOR UPDATE), nunca con un UPDATE suelto.
model Correlativo {
  serie  String
  anio   Int
  ultimo Int    @default(0)

  @@id([serie, anio])
}
```

- [ ] **Step 5: Migración a mano** — crear `prisma/migrations/20260917120000_recibos/migration.sql`:

```sql
-- CreateTable
CREATE TABLE `Correlativo` (
    `serie` VARCHAR(191) NOT NULL,
    `anio` INTEGER NOT NULL,
    `ultimo` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`serie`, `anio`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `Cobro` ADD COLUMN `notaAnulacionEn` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `Cobro_reciboNumero_idx` ON `Cobro`(`reciboNumero`);
```

- [ ] **Step 6: Comprobar que la migración coincide con el esquema**

```bash
set -a; . /home/neracosu/.config/prospectos/env; set +a
npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "$SHADOW_DATABASE_URL" --script
```
Expected: **solo** las líneas `MODIFY … JSON NOT NULL` de siempre (el desencuentro conocido de Prisma con MariaDB, ver `CLAUDE.md`). Si aparece `Correlativo`, `notaAnulacionEn` o `reciboNumero`, la migración a mano no coincide: corregirla.

- [ ] **Step 7: Aplicar a la base de tests y regenerar el cliente**

```bash
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy | tail -3
npx prisma generate | tail -1
```
Expected: `1 migration … applied` y `Generated Prisma Client`.

- [ ] **Step 8: Aplicar a producción (solo el controlador).** Es aditiva (tabla nueva, columna nula, índice) y el código viejo que está sirviendo no la nota. Tiene que ir **ya**, no en el despliegue: el cliente recién generado selecciona `notaAnulacionEn`, y si PM2 reiniciara `prospectos` antes de migrar, toda consulta de cobros fallaría.

```bash
pm2 list    # solo mirar: prospectos online
npx prisma migrate deploy | tail -3      # con el env ya cargado: DATABASE_URL es la real
```
Expected: `1 migration … applied`. No reiniciar nada.

- [ ] **Step 9: `limpiarBase`** — en `tests/ayuda-db.ts`, antes de `await prisma.configuracion.deleteMany();`:

```ts
  await prisma.correlativo.deleteMany();
```

- [ ] **Step 10: Tests en verde**

Run: `PROSPECTOS_TEST_DB=1 npx vitest run tests/esquema.test.ts && npx tsc --noEmit`
Expected: PASS (4 tests), `tsc` sin salida.

- [ ] **Step 11: Commit**

```bash
git add prisma tests/ayuda-db.ts tests/esquema.test.ts
git commit -F - <<'EOF'
feat(recibos): esquema - Correlativo, nota de anulacion e indice por numero

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 2: Contrato puro, plantilla y fuentes

**Files:**
- Modify: `src/lib/cobros-contrato.ts` (agregar `nombreMes`), `src/lib/mensualidades.ts:7-11` (quitar su copia), `src/lib/fecha-caracas.ts` (agregar `fechaVisible`), `src/lib/mensajes-cobro.ts:6-9,19` (usar `fechaVisible`)
- Create: `src/lib/recibos-contrato.ts`, `plantillas/recibo.html`, `plantillas/fuentes/source-sans-3.woff2`, `plantillas/fuentes/source-serif-4.woff2`, `plantillas/fuentes/LEEME.txt`
- Test: `tests/recibos-contrato.test.ts`, `tests/fecha-caracas.test.ts`

**Interfaces:**
- Consumes: `ETIQUETA_CANAL_COBRO`, `Concepto` de `@/lib/cobros-contrato`; `formatoUSD` de `@/lib/dinero`; `compararSemver` de `@/lib/semver-contrato`; `type DatosEmisor` de `@/lib/configuracion` (solo tipo).
- Produces (todo desde `@/lib/recibos-contrato` salvo indicación):
  - `nombreMes(mes: string): string` — **desde `@/lib/cobros-contrato`** (`"2026-10"` → `"octubre 2026"`).
  - `fechaVisible(iso: string): string` — **desde `@/lib/fecha-caracas`** (`"2026-09-17"` → `"17/09/2026"`).
  - `SERIE_RECIBO = "R"`, `PIE_RECIBO`, `PIE_NOTA`, `NUMERO_RECIBO: RegExp`, `ARCHIVO_RECIBO: RegExp`, `DOCUMENTO_RECIBO: RegExp`
  - `numeroRecibo(anio: number, n: number): string`, `numeroNota(numero: string): string`, `anioDeDocumento(nombre: string): string | null`
  - `conceptoRecibo(c: { concepto: Concepto; detalle: string; mes: string | null }, proyecto: string): string`
  - `versionesIncluidas(versiones: { version: string; fecha: string }[], mes: string | null): string`
  - `faltantesEmisor(e: DatosEmisor): string[]`, `celularVisible(whatsapp: string): string`
  - `type DatosRecibo`, `type DatosAnulacion`, `camposRecibo(d: DatosRecibo): Record<string, string>`, `camposNota(d: DatosRecibo, a: DatosAnulacion): Record<string, string>`
  - `renderDocumento(plantilla: string, campos: Record<string, string>): string`, `fuentesDePlantilla(plantilla: string): string[]`, `incrustarFuentes(plantilla: string, fuentes: Record<string, string>): string`
  - `mensajeRecibo(d: { cliente: string; numero: string; concepto: string; monto: number }): string`

- [ ] **Step 1: Fuentes locales**

```bash
cd /home/neracosu/public_html/prospectos.neracosu.com && mkdir -p plantillas/fuentes
curl -sS -m 30 -o plantillas/fuentes/source-sans-3.woff2 "https://fonts.gstatic.com/s/sourcesans3/v19/nwpStKy2OAdR1K-IwhWudF-R3w8aZQ.woff2"
curl -sS -m 30 -o plantillas/fuentes/source-serif-4.woff2 "https://fonts.gstatic.com/s/sourceserif4/v14/vEFI2_tTDB4M7-auWDN0ahZJW1gb8tc.woff2"
sha256sum plantillas/fuentes/*.woff2
```
Expected (exacto; si no coincide, Google cambió la versión: avisar al controlador antes de seguir):
```
7a19a7027e125257d310c6dbd78ae3a30b5ea1e3794d60b12bb28227a003bfda  plantillas/fuentes/source-sans-3.woff2
f2ea9c12d2fe9bd3a9589b02ad2c0909da88f30938c91adc838c4f4098f9f9e0  plantillas/fuentes/source-serif-4.woff2
```

Crear `plantillas/fuentes/LEEME.txt`:

```
Fuentes del recibo de pago (plantillas/recibo.html). Se incrustan en el PDF al generarlo:
un recibo emitido no cambia, asi que no puede depender de que Google Fonts responda ese dia.

source-sans-3.woff2   Source Sans 3, variable 400-700, subconjunto latin.
source-serif-4.woff2  Source Serif 4, variable 400-700, subconjunto latin.

Copyright Adobe. Licencia SIL Open Font License 1.1 (https://openfontlicense.org).
Bajadas de fonts.gstatic.com el 2026-09-17. Son las mismas familias de la propuesta de hoteles.
```

- [ ] **Step 2: La plantilla** — crear `plantillas/recibo.html`. El diseño ya se probó en A4 y encogido a 390 px (como lo ve el cliente en el visor del teléfono): por eso nada baja de 12 pt y lo que importa va en grande. **Los bloques `<!--si:x-->…<!--fin:x-->` no se anidan.**

```html
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>{{titulo}} {{numero}} - NERACOSU</title>
<style>
  /* Fuentes locales (OFL), incrustadas al renderizar: un recibo no puede depender de la red. */
  @font-face { font-family: "Source Sans 3"; font-weight: 400 700; font-style: normal; src: url("fuentes/source-sans-3.woff2") format("woff2"); }
  @font-face { font-family: "Source Serif 4"; font-weight: 400 700; font-style: normal; src: url("fuentes/source-serif-4.woff2") format("woff2"); }
  @page { size: A4; margin: 0; }
  :root {
    --papel: #ffffff; --tinta: #1a1d1c; --tinta-2: #3c4240; --gris: #5d6664; --regla: #c3cbc7;
    --sello: #1f5a45; --anulado: #8f2a23; --verde-marca: #5ed29c;
    --serif: "Source Serif 4", Georgia, "Times New Roman", serif;
    --sans: "Source Sans 3", "Segoe UI", Arial, sans-serif;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: var(--papel); color: var(--tinta); }
  /* El cliente lo abre en el visor del telefono, donde el A4 se ve a la mitad:
     nada baja de 12pt y lo que importa (quien, cuanto, por que) va en grande. */
  body { font-family: var(--sans); font-size: 13pt; line-height: 1.4; -webkit-font-smoothing: antialiased; }
  .hoja { width: 210mm; min-height: 297mm; padding: 20mm 20mm 16mm; display: flex; flex-direction: column; }

  .cabecera { display: flex; justify-content: space-between; align-items: flex-start; gap: 10mm; }
  .logo { font-weight: 700; font-size: 21pt; letter-spacing: .06em; line-height: 1; margin: 0 0 4mm; }
  .logo i { font-style: normal; color: var(--verde-marca); }
  .emisor { margin: 0; color: var(--tinta-2); }
  .emisor b { color: var(--tinta); font-weight: 600; }
  .documento { text-align: right; }
  .documento h1 { font-family: var(--serif); font-weight: 600; font-size: 23pt; line-height: 1.1; margin: 0 0 3mm; }
  .numero { font-size: 19pt; font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: .02em; margin: 0; }
  .emitido { margin: 1mm 0 0; color: var(--gris); }
  .anulacion .documento h1 { color: var(--anulado); }

  /* La linea punteada es la del talonario: separa el taco del recibo. */
  .corte { border: 0; border-top: 2.5pt dotted var(--regla); margin: 11mm 0 10mm; }

  .frase { margin: 0; }
  .frase dt { color: var(--gris); font-size: 14pt; margin: 0 0 1mm; }
  .frase dd { margin: 0 0 8mm; font-family: var(--serif); font-weight: 600; font-size: 24pt; line-height: 1.2; text-wrap: balance; }
  .frase dd small { display: block; font-family: var(--sans); font-weight: 400; font-size: 13pt; color: var(--tinta-2); margin-top: 1.5mm; }
  .frase dd.monto { font-weight: 700; font-size: 56pt; line-height: 1; color: var(--sello); font-variant-numeric: tabular-nums lining-nums; }
  .frase dd.monto small { margin-top: 3mm; }
  .frase dd.motivo { font-size: 17pt; font-weight: 400; }
  /* La nota de anulacion lleva tres renglones mas: se aprieta para seguir en una sola hoja. */
  .anulacion .corte { margin: 8mm 0 7mm; }
  .anulacion .frase dd { font-size: 20pt; margin-bottom: 5mm; }
  .anulacion .frase dd.monto { font-size: 40pt; color: var(--anulado); }
  .anulacion .frase dd.motivo { font-size: 16pt; }

  .datos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6mm; margin: 2mm 0 0; padding: 7mm 0 0; border-top: 1pt solid var(--regla); }
  .datos div { min-width: 0; }
  .datos dt { color: var(--gris); font-size: 13pt; }
  .datos dd { margin: .5mm 0 0; font-size: 17pt; font-weight: 600; overflow-wrap: anywhere; }

  .pie { margin-top: auto; padding-top: 8mm; border-top: 1pt solid var(--regla); color: var(--gris); font-size: 12pt; }
  .pie p { margin: 0; }
</style>
</head>
<body>
<main class="hoja {{clase}}">
  <header class="cabecera">
    <div>
      <p class="logo">NERACOSU<i>.</i></p>
      <p class="emisor"><b>{{emisor_nombre}}</b><br>RIF {{emisor_rif}}<br>WhatsApp {{emisor_whatsapp}}<br>{{emisor_email}}</p>
    </div>
    <div class="documento">
      <h1>{{titulo}}</h1>
      <p class="numero">{{numero}}</p>
      <p class="emitido">{{emitido_texto}}</p>
    </div>
  </header>

  <hr class="corte">

  <dl class="frase">
    <!--si:es_recibo-->
    <dt>Recibí de</dt>
    <!--fin:es_recibo-->
    <!--si:es_anulacion-->
    <dt>Queda anulado el recibo</dt>
    <dd>{{recibo_anulado}}<small>emitido el {{recibo_emitido}}</small></dd>
    <dt>que se había entregado a</dt>
    <!--fin:es_anulacion-->
    <dd>{{cliente_nombre}}<!--si:cliente_rif--><small>RIF {{cliente_rif}}</small><!--fin:cliente_rif--><!--si:cliente_contacto--><small>Contacto: {{cliente_contacto}}</small><!--fin:cliente_contacto--></dd>
    <dt>{{monto_etiqueta}}</dt>
    <dd class="monto">{{monto}}<small>dólares de los Estados Unidos (USD)</small></dd>
    <dt>por concepto de</dt>
    <dd>{{concepto}}<!--si:versiones--><small>{{versiones}}</small><!--fin:versiones--></dd>
    <!--si:motivo-->
    <dt>Motivo de la anulación</dt>
    <dd class="motivo">{{motivo}}</dd>
    <!--fin:motivo-->
  </dl>

  <dl class="datos">
    <div><dt>Fecha de pago</dt><dd>{{fecha_pago}}</dd></div>
    <div><dt>Canal</dt><dd>{{canal}}</dd></div>
    <!--si:referencia--><div><dt>Referencia</dt><dd>{{referencia}}</dd></div><!--fin:referencia-->
  </dl>

  <footer class="pie">
    <p>{{pie}}</p>
  </footer>
</main>
</body>
</html>
```

- [ ] **Step 3: Escribir los tests que fallan** — crear `tests/recibos-contrato.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { nombreMes } from "@/lib/cobros-contrato";
import {
  numeroRecibo, numeroNota, anioDeDocumento, NUMERO_RECIBO, ARCHIVO_RECIBO, conceptoRecibo, versionesIncluidas,
  faltantesEmisor, celularVisible, camposRecibo, camposNota, renderDocumento, fuentesDePlantilla, incrustarFuentes,
  mensajeRecibo, PIE_RECIBO, PIE_NOTA, type DatosRecibo,
} from "@/lib/recibos-contrato";

const PLANTILLA = readFileSync(path.join(import.meta.dirname, "..", "plantillas", "recibo.html"), "utf8");
const DATOS: DatosRecibo = {
  numero: "R-2026-0001", emitidoEl: "2026-09-17",
  emisor: { nombre: "Neri Colón", rif: "V-12345678-9", whatsapp: "584121234567", email: "neri@ejemplo.test" },
  cliente: { nombre: "Hotel <Prueba> & Hijos", rif: "J-40123456-7", contactoNombre: "Ana Pérez" },
  concepto: "PMS Hotel: Mensualidad — octubre 2026", versiones: "Incluye v1.4.0 a v1.4.2",
  monto: 1250, fechaPago: "2026-09-16", canal: "pago_movil", referencia: "0102-44819",
};

describe("numero de recibo", () => {
  it("R-AAAA-NNNN con cuatro digitos como minimo; pasado 9999 crece", () => {
    expect(numeroRecibo(2026, 1)).toBe("R-2026-0001");
    expect(numeroRecibo(2026, 9999)).toBe("R-2026-9999");
    expect(numeroRecibo(2027, 10000)).toBe("R-2027-10000");
    expect(() => numeroRecibo(2026, 0)).toThrow("NUMERO_INVALIDO");
    expect(() => numeroRecibo(2026, 1.5)).toThrow("NUMERO_INVALIDO");
    expect(() => numeroRecibo(26, 1)).toThrow("NUMERO_INVALIDO");
  });
  it("la nota de anulacion es el numero con -A, y el anio sale del nombre", () => {
    expect(numeroNota("R-2026-0001")).toBe("R-2026-0001-A");
    expect(anioDeDocumento("R-2026-0001")).toBe("2026");
    expect(anioDeDocumento("R-2027-0042-A")).toBe("2027");
    expect(anioDeDocumento("../R-2026-0001")).toBeNull();
    expect(anioDeDocumento("R-2026-1")).toBeNull();
  });
  it("las expresiones de numero y de archivo no dejan pasar rutas raras", () => {
    expect(NUMERO_RECIBO.test("R-2026-0001")).toBe(true);
    expect(NUMERO_RECIBO.test("R-2026-0001-A")).toBe(false);
    expect(ARCHIVO_RECIBO.exec("R-2026-0001.pdf")?.[1]).toBe("R-2026-0001");
    expect(ARCHIVO_RECIBO.exec("R-2026-0001-A.pdf")?.[3]).toBe("-A");
    for (const malo of ["R-2026-0001", "r-2026-0001.pdf", "R-2026-0001.pdf.txt", "../R-2026-0001.pdf", "R-2026-0001-B.pdf", "R-2026-1.pdf"]) expect(ARCHIVO_RECIBO.test(malo)).toBe(false);
  });
});

describe("concepto y versiones", () => {
  it("nombreMes", () => { expect(nombreMes("2026-10")).toBe("octubre 2026"); expect(nombreMes("2027-01")).toBe("enero 2027"); });
  it("arma proyecto + tipo + detalle", () => {
    expect(conceptoRecibo({ concepto: "mensualidad", detalle: "Mensualidad de octubre 2026", mes: "2026-10" }, "PMS Hotel")).toBe("PMS Hotel: Mensualidad — octubre 2026");
    expect(conceptoRecibo({ concepto: "cuota", detalle: "Cuota 2 de 3", mes: null }, "PMS Hotel")).toBe("PMS Hotel: Pago único — cuota 2 de 3");
    expect(conceptoRecibo({ concepto: "cuota", detalle: "Adelanto de octubre", mes: null }, "PMS")).toBe("PMS: Cuota — Adelanto de octubre");
    expect(conceptoRecibo({ concepto: "pago_unico", detalle: "Pago único", mes: null }, "PMS")).toBe("PMS: Pago único");
    expect(conceptoRecibo({ concepto: "extra", detalle: "Módulo de reportes", mes: null }, "PMS")).toBe("PMS: Extra — Módulo de reportes");
    expect(conceptoRecibo({ concepto: "extra", detalle: " ", mes: null }, "PMS")).toBe("PMS: Extra");
  });
  it("lista las versiones cuya fecha cae en el mes, en orden semver", () => {
    const v = [{ version: "1.4.2", fecha: "2026-10-28" }, { version: "1.4.0", fecha: "2026-10-02" }, { version: "1.10.0", fecha: "2026-10-30" }, { version: "1.3.9", fecha: "2026-09-30" }];
    expect(versionesIncluidas(v, "2026-10")).toBe("Incluye v1.4.0 a v1.10.0");
    expect(versionesIncluidas(v, "2026-09")).toBe("Incluye v1.3.9");
    expect(versionesIncluidas(v, "2026-08")).toBe("");
    expect(versionesIncluidas(v, null)).toBe("");
  });
});

describe("emisor", () => {
  it("dice que falta; completo = lista vacia", () => {
    expect(faltantesEmisor({ nombre: "Neri Colón", rif: "", whatsapp: "", email: " " })).toEqual(["RIF", "WhatsApp", "correo"]);
    expect(faltantesEmisor(DATOS.emisor)).toEqual([]);
  });
  it("celularVisible formatea el 58XXXXXXXXXX y deja lo demas igual", () => {
    expect(celularVisible("584121234567")).toBe("+58 412-1234567");
    expect(celularVisible("0412 123")).toBe("0412 123");
  });
});

describe("render de la plantilla", () => {
  it("recibo: titulo, numero, monto, fechas, canal con etiqueta y pie; escapa el HTML de los datos", () => {
    const html = renderDocumento(PLANTILLA, camposRecibo(DATOS));
    expect(html).toContain("<h1>Recibo de pago</h1>");
    expect(html).toContain("<title>Recibo de pago R-2026-0001 - NERACOSU</title>");
    expect(html).toContain("Emitido el 17/09/2026");
    expect(html).toContain("$1.250,00");
    expect(html).toContain("<dd>16/09/2026</dd>");
    expect(html).toContain("<dd>Pago móvil</dd>");
    expect(html).toContain("+58 412-1234567");
    expect(html).toContain("Hotel &lt;Prueba&gt; &amp; Hijos");
    expect(html).not.toContain("<Prueba>");
    expect(html).toContain("<small>RIF J-40123456-7</small>");
    expect(html).toContain("<small>Contacto: Ana Pérez</small>");
    expect(html).toContain("Incluye v1.4.0 a v1.4.2");
    expect(html).toContain(PIE_RECIBO);
    expect(html).toContain("Recibí de");
    expect(html).not.toContain("Queda anulado");
    expect(html).not.toMatch(/\{\{|<!--si:|<!--fin:/); // no queda ningun marcador
    expect(html).not.toMatch(/<h1>[^<]*[Ff]actura/);   // nunca se titula factura
  });
  it("los bloques opcionales desaparecen cuando el dato viene vacio", () => {
    const html = renderDocumento(PLANTILLA, camposRecibo({ ...DATOS, referencia: "", versiones: "", cliente: { nombre: "Hotel X", rif: "", contactoNombre: "" } }));
    expect(html).not.toContain("Referencia");
    expect(html).not.toContain("Incluye");
    expect(html).not.toContain("<small>RIF ");
    expect(html).not.toContain("Contacto:");
  });
  it("nota de anulacion: dice que recibo anula, cuando y por que", () => {
    const html = renderDocumento(PLANTILLA, camposNota(DATOS, { anuladoEl: "2026-09-20", motivo: "Pago registrado dos veces" }));
    expect(html).toContain("<h1>Nota de anulación</h1>");
    expect(html).toContain('<p class="numero">R-2026-0001-A</p>');
    expect(html).toContain("Emitida el 20/09/2026");
    expect(html).toContain("Queda anulado el recibo");
    expect(html).toContain("emitido el 17/09/2026");
    expect(html).toContain("Pago registrado dos veces");
    expect(html).toContain('class="hoja anulacion"');
    expect(html).toContain(PIE_NOTA);
    expect(html).not.toContain("Recibí de");
    expect(html).not.toContain("Incluye");
  });
  it("una plantilla sin marcadores se rechaza", () => {
    expect(() => renderDocumento("<html></html>", camposRecibo(DATOS))).toThrow("PLANTILLA_SIN_MARCADORES");
  });
  it("el HTML del recibo de ejemplo no cambia sin que alguien lo decida (snapshot)", () => {
    expect(renderDocumento(PLANTILLA, camposRecibo(DATOS))).toMatchSnapshot();
  });
});

describe("fuentes", () => {
  it("lista las fuentes que pide la plantilla y las incrusta como data:", () => {
    expect(fuentesDePlantilla(PLANTILLA)).toEqual(["source-sans-3.woff2", "source-serif-4.woff2"]);
    const html = incrustarFuentes(PLANTILLA, { "source-sans-3.woff2": "QUJD", "source-serif-4.woff2": "REVG" });
    expect(html).toContain('url("data:font/woff2;base64,QUJD")');
    expect(html).toContain('url("data:font/woff2;base64,REVG")');
    expect(html).not.toContain('url("fuentes/');
    expect(() => incrustarFuentes(PLANTILLA, { "source-sans-3.woff2": "QUJD" })).toThrow("FUENTE_FALTANTE:source-serif-4.woff2");
  });
});

describe("mensajeRecibo", () => {
  it("lleva numero, concepto y monto", () => {
    expect(mensajeRecibo({ cliente: "Ana", numero: "R-2026-0001", concepto: "PMS: Extra — Reportes", monto: 350 }))
      .toBe("Buenas, Ana. Le envío el recibo de pago R-2026-0001 por $350,00, correspondiente a PMS: Extra — Reportes. Gracias por su pago.");
  });
});
```

Y en `tests/fecha-caracas.test.ts`, agregar `fechaVisible` al import de `@/lib/fecha-caracas` y, al final del archivo:

```ts
describe("fechaVisible", () => {
  it("pasa de ISO a dd/mm/aaaa", () => {
    expect(fechaVisible("2026-09-17")).toBe("17/09/2026");
  });
});
```

- [ ] **Step 4: Correrlos y ver que fallan**

Run: `npx vitest run tests/recibos-contrato.test.ts tests/fecha-caracas.test.ts`
Expected: FAIL — no existe `@/lib/recibos-contrato`, ni `nombreMes`, ni `fechaVisible`.

- [ ] **Step 5: `nombreMes` y `fechaVisible`**

En `src/lib/cobros-contrato.ts`, debajo de `mesDe`:

```ts
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
// "2026-10" -> "octubre 2026". Lo usan el detalle de la mensualidad y el concepto del recibo.
export function nombreMes(mes: string): string {
  const [a, m] = mes.split("-");
  return `${MESES[Number(m) - 1]} ${a}`;
}
```

En `src/lib/mensualidades.ts`: borrar la constante `MESES` y la función `nombreMes` (líneas 7-11) y cambiar el import a `import { mensualidadesQueTocan, nombreMes } from "@/lib/cobros-contrato";`.

En `src/lib/fecha-caracas.ts`, al final:

```ts
// Fecha de negocio (YYYY-MM-DD) como se escribe en Venezuela: dd/mm/aaaa.
export function fechaVisible(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
```

En `src/lib/mensajes-cobro.ts`: borrar la función local `fechaLarga`, importar `import { fechaVisible } from "@/lib/fecha-caracas";` y cambiar `vence: fechaLarga(c.vence)` por `vence: fechaVisible(c.vence)`.

- [ ] **Step 6: El contrato** — crear `src/lib/recibos-contrato.ts`:

```ts
// src/lib/recibos-contrato.ts — reglas puras de los recibos (pieza 4). Sin base, sin disco, sin node:.
import { ETIQUETA_CANAL_COBRO, nombreMes, type CanalCobro, type Concepto } from "@/lib/cobros-contrato";
import { formatoUSD } from "@/lib/dinero";
import { fechaVisible } from "@/lib/fecha-caracas";
import { compararSemver } from "@/lib/semver-contrato";
import type { DatosEmisor } from "@/lib/configuracion";

export const SERIE_RECIBO = "R";
// "Recibo de pago", nunca "factura": la factura es un documento fiscal del SENIAT y este panel no la emite.
export const PIE_RECIBO = "Este documento es un recibo de pago y no constituye factura fiscal.";
export const PIE_NOTA = "Esta nota deja sin efecto el recibo indicado. No constituye documento fiscal.";
// R-AAAA-NNNN: cuatro digitos como minimo; pasado el 9999 el numero crece, no se reinicia.
export const NUMERO_RECIBO = /^R-(\d{4})-(\d{4,})$/;
// Un documento guardado: el recibo o su nota de anulacion (-A).
export const DOCUMENTO_RECIBO = /^R-(\d{4})-\d{4,}(-A)?$/;
// Lo unico que acepta la ruta de descarga. [1] = numero del recibo, [3] = "-A" si es la nota.
export const ARCHIVO_RECIBO = /^(R-(\d{4})-\d{4,})(-A)?\.pdf$/;

export function numeroRecibo(anio: number, n: number): string {
  if (!Number.isInteger(anio) || anio < 2000 || anio > 9999 || !Number.isInteger(n) || n < 1) throw new Error("NUMERO_INVALIDO");
  return `${SERIE_RECIBO}-${anio}-${String(n).padStart(4, "0")}`;
}

export function numeroNota(numero: string): string {
  return `${numero}-A`;
}

export function anioDeDocumento(nombre: string): string | null {
  return DOCUMENTO_RECIBO.exec(nombre)?.[1] ?? null;
}

// Proyecto + tipo + detalle: "PMS Hotel: Mensualidad — octubre 2026", "…: Pago único — cuota 2 de 3".
export function conceptoRecibo(c: { concepto: Concepto; detalle: string; mes: string | null }, proyecto: string): string {
  const detalle = c.detalle.trim();
  let texto: string;
  if (c.concepto === "mensualidad") texto = c.mes ? `Mensualidad — ${nombreMes(c.mes)}` : detalle || "Mensualidad";
  else if (c.concepto === "cuota") {
    const m = /^cuota (\d+) de (\d+)$/i.exec(detalle);
    texto = m ? `Pago único — cuota ${m[1]} de ${m[2]}` : detalle ? `Cuota — ${detalle}` : "Cuota";
  } else if (c.concepto === "pago_unico") texto = !detalle || detalle.toLowerCase() === "pago único" ? "Pago único" : `Pago único — ${detalle}`;
  else texto = detalle ? `Extra — ${detalle}` : "Extra";
  return `${proyecto}: ${texto}`;
}

// Solo las mensualidades traen `mes`: las versiones publicadas ese mes son lo que esa mensualidad pago.
export function versionesIncluidas(versiones: { version: string; fecha: string }[], mes: string | null): string {
  if (!mes) return "";
  const delMes = versiones.filter((v) => v.fecha.startsWith(`${mes}-`)).map((v) => v.version).sort(compararSemver);
  if (delMes.length === 0) return "";
  return delMes.length === 1 ? `Incluye v${delMes[0]}` : `Incluye v${delMes[0]} a v${delMes[delMes.length - 1]}`;
}

// Que le falta al emisor para poder emitir. Lista vacia = listo.
export function faltantesEmisor(e: DatosEmisor): string[] {
  const faltan: string[] = [];
  if (!e.nombre.trim()) faltan.push("nombre");
  if (!e.rif.trim()) faltan.push("RIF");
  if (!e.whatsapp.trim()) faltan.push("WhatsApp");
  if (!e.email.trim()) faltan.push("correo");
  return faltan;
}

export function celularVisible(whatsapp: string): string {
  const m = /^58(\d{3})(\d{7})$/.exec(whatsapp);
  return m ? `+58 ${m[1]}-${m[2]}` : whatsapp;
}

export type DatosRecibo = {
  numero: string;
  emitidoEl: string; // YYYY-MM-DD, dia de Caracas
  emisor: DatosEmisor;
  cliente: { nombre: string; rif: string; contactoNombre: string };
  concepto: string;
  versiones: string;
  monto: number;
  fechaPago: string; // YYYY-MM-DD
  canal: string;
  referencia: string;
};
export type DatosAnulacion = { anuladoEl: string; motivo: string };

function camposComunes(d: DatosRecibo): Record<string, string> {
  return {
    emisor_nombre: d.emisor.nombre, emisor_rif: d.emisor.rif, emisor_whatsapp: celularVisible(d.emisor.whatsapp), emisor_email: d.emisor.email,
    cliente_nombre: d.cliente.nombre, cliente_rif: d.cliente.rif, cliente_contacto: d.cliente.contactoNombre,
    monto: formatoUSD(d.monto), concepto: d.concepto,
    fecha_pago: fechaVisible(d.fechaPago), canal: ETIQUETA_CANAL_COBRO[d.canal as CanalCobro] ?? d.canal, referencia: d.referencia,
  };
}

export function camposRecibo(d: DatosRecibo): Record<string, string> {
  return {
    ...camposComunes(d), clase: "", titulo: "Recibo de pago", numero: d.numero, emitido_texto: `Emitido el ${fechaVisible(d.emitidoEl)}`,
    es_recibo: "1", es_anulacion: "", monto_etiqueta: "la cantidad de", versiones: d.versiones, motivo: "", pie: PIE_RECIBO,
  };
}

export function camposNota(d: DatosRecibo, a: DatosAnulacion): Record<string, string> {
  return {
    ...camposComunes(d), clase: "anulacion", titulo: "Nota de anulación", numero: numeroNota(d.numero), emitido_texto: `Emitida el ${fechaVisible(a.anuladoEl)}`,
    es_recibo: "", es_anulacion: "1", recibo_anulado: d.numero, recibo_emitido: fechaVisible(d.emitidoEl),
    monto_etiqueta: "por la cantidad de", versiones: "", motivo: a.motivo, pie: PIE_NOTA,
  };
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
function escaparHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

// Bloques <!--si:x-->...<!--fin:x--> (sin anidar) se quedan solo si campos.x trae texto;
// {{x}} se reemplaza por el dato escapado. Un marcador sin dato queda vacio, no a la vista.
export function renderDocumento(plantilla: string, campos: Record<string, string>): string {
  if (!plantilla.includes("{{numero}}") || !plantilla.includes("{{titulo}}")) throw new Error("PLANTILLA_SIN_MARCADORES");
  const sinBloques = plantilla.replace(/<!--si:([a-z_]+)-->([\s\S]*?)<!--fin:\1-->/g, (_todo, clave: string, dentro: string) => (campos[clave] ? dentro : ""));
  return sinBloques.replace(/\{\{([a-z_]+)\}\}/g, (_todo, clave: string) => escaparHtml(campos[clave] ?? ""));
}

const URL_FUENTE = /url\("fuentes\/([a-z0-9-]+\.woff2)"\)/g;

export function fuentesDePlantilla(plantilla: string): string[] {
  return [...new Set([...plantilla.matchAll(URL_FUENTE)].map((m) => m[1]))];
}

// fuentes: { "archivo.woff2": "<base64>" }. El PDF no puede depender de la red.
export function incrustarFuentes(plantilla: string, fuentes: Record<string, string>): string {
  return plantilla.replace(URL_FUENTE, (_todo, archivo: string) => {
    const base64 = fuentes[archivo];
    if (!base64) throw new Error(`FUENTE_FALTANTE:${archivo}`);
    return `url("data:font/woff2;base64,${base64}")`;
  });
}

// El PDF no viaja en el enlace de WhatsApp: lo adjunta Neri desde el telefono.
export function mensajeRecibo(d: { cliente: string; numero: string; concepto: string; monto: number }): string {
  return `Buenas, ${d.cliente}. Le envío el recibo de pago ${d.numero} por ${formatoUSD(d.monto)}, correspondiente a ${d.concepto}. Gracias por su pago.`;
}
```

- [ ] **Step 7: Tests en verde** (el snapshot se escribe solo la primera vez)

Run: `npx vitest run tests/recibos-contrato.test.ts tests/fecha-caracas.test.ts tests/cobros-contrato.test.ts && PROSPECTOS_TEST_DB=1 npx vitest run tests/cobros.test.ts tests/mensualidades.test.ts && npx tsc --noEmit`
Expected: PASS todo; aparece `tests/__snapshots__/recibos-contrato.test.ts.snap`. Abrirlo y comprobar que dice «Recibo de pago» y no tiene `{{`.

- [ ] **Step 8: Commit**

```bash
git add src/lib plantillas tests
git commit -F - <<'EOF'
feat(recibos): contrato puro, plantilla del recibo y fuentes locales

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 3: Motor de PDF compartido (`src/lib/pdf.ts`) y guardia del grafo de `instrumentation`

**Files:**
- Create: `src/lib/pdf.ts`
- Modify: `src/lib/propuesta.ts` (queda sin la fila global ni Chromium: los toma de `pdf.ts`)
- Test: `tests/pdf.test.ts`, `tests/instrumentation-grafo.test.ts`; red de seguridad: `tests/propuesta.test.ts` **sin tocar**

**Interfaces:**
- Produces (desde `@/lib/pdf`):
  - `conTurnoGlobal<T>(tarea: () => Promise<T>): Promise<T>` — un solo turno a la vez en el proceso; quien espera más de 20 s lanza `Error("PDF_OCUPADO")`.
  - `imprimirPdf(html: string): Promise<Buffer>` — lanza Chromium, A4, `printBackground`, `preferCSSPageSize`, `tagged: true`. **No hace fila**: llamarlo siempre dentro de `conTurnoGlobal`.
  - `escribirAtomico(salida: string, bytes: Buffer): Promise<void>` — crea el directorio (`700`), escribe a un temporal (`600`) y hace `rename`. Pisa lo que hubiera.
  - `_generacionesParaTests(): number`
- `@/lib/propuesta` sigue exportando exactamente lo mismo que hoy (`leerPlantilla`, `rutaPdf`, `hashDe`, `generarPdf`, `_generacionesParaTests`).

- [ ] **Step 1: Tests que fallan** — crear `tests/pdf.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DB_HABILITADA } from "./ayuda-db";
import { conTurnoGlobal, imprimirPdf, escribirAtomico, _generacionesParaTests } from "@/lib/pdf";

// Lanza Chromium de verdad: va con la suite real (npm run test:db), no con la pura.
describe.runIf(DB_HABILITADA)("pdf", () => {
  const dir = path.join(os.tmpdir(), `prospectos-pdf-test-${process.pid}`);

  it("imprimirPdf devuelve un PDF y cuenta la generacion", async () => {
    const antes = _generacionesParaTests();
    const bytes = await conTurnoGlobal(() => imprimirPdf('<!doctype html><html lang="es"><head><title>Hola</title></head><body><h1>Hola</h1></body></html>'));
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(_generacionesParaTests() - antes).toBe(1);
  }, 60_000);

  it("escribirAtomico crea el directorio, deja el archivo en 600, pisa el anterior y no deja temporales", async () => {
    rmSync(dir, { recursive: true, force: true });
    const salida = path.join(dir, "2026", "x.pdf");
    await escribirAtomico(salida, Buffer.from("uno"));
    await escribirAtomico(salida, Buffer.from("dos"));
    expect(readFileSync(salida, "utf8")).toBe("dos");
    expect(statSync(salida).mode & 0o777).toBe(0o600);
    expect(statSync(path.dirname(salida)).mode & 0o777).toBe(0o700);
    expect(readdirSync(path.dirname(salida))).toEqual(["x.pdf"]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("conTurnoGlobal corre las tareas de a una", async () => {
    let dentro = 0, maximo = 0;
    const tarea = () => conTurnoGlobal(async () => { dentro += 1; maximo = Math.max(maximo, dentro); await new Promise((r) => setTimeout(r, 30)); dentro -= 1; });
    await Promise.all([tarea(), tarea(), tarea()]);
    expect(maximo).toBe(1);
  });
});
```

Y crear `tests/instrumentation-grafo.test.ts` (puro; la trampa que documenta el `CLAUDE.md` hoy solo la detecta `next build`):

```ts
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.join(import.meta.dirname, "..", "src");

function resolver(desde: string, espec: string): string | null {
  const base = espec.startsWith("@/") ? path.join(SRC, espec.slice(2)) : espec.startsWith(".") ? path.resolve(path.dirname(desde), espec) : null;
  if (!base) return null; // paquete de npm
  for (const c of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) if (existsSync(c)) return c;
  return null;
}

// Imports estaticos (y re-exportaciones) y dinamicos de un archivo. Los `import type` se borran al compilar: no cuentan.
function importsDe(archivo: string): string[] {
  const codigo = readFileSync(archivo, "utf8");
  const salida: string[] = [];
  for (const m of codigo.matchAll(/^\s*(?:import|export)\s+(?!type\s)[^;]*?from\s+["']([^"']+)["']/gm)) salida.push(m[1]);
  for (const m of codigo.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) salida.push(m[1]);
  for (const m of codigo.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) salida.push(m[1]);
  return salida;
}

describe("grafo de src/instrumentation.ts", () => {
  it("ningun archivo de la cadena importa node: (Next la compila tambien para edge y deja todas las rutas en 500)", () => {
    const vistos = new Set<string>();
    const culpables: string[] = [];
    const cola = [path.join(SRC, "instrumentation.ts")];
    while (cola.length) {
      const archivo = cola.pop()!;
      if (vistos.has(archivo)) continue;
      vistos.add(archivo);
      for (const espec of importsDe(archivo)) {
        if (espec.startsWith("node:")) culpables.push(`${path.relative(SRC, archivo)} -> ${espec}`);
        const destino = resolver(archivo, espec);
        if (destino) cola.push(destino);
      }
    }
    expect(culpables).toEqual([]);
    const nombres = [...vistos].map((v) => path.relative(SRC, v));
    for (const prohibido of ["lib/pdf.ts", "lib/recibos.ts", "lib/propuesta.ts"]) expect(nombres).not.toContain(prohibido);
    expect(nombres).toContain("lib/mensualidades.ts"); // si esto falla, el test dejo de seguir la cadena
  });
});
```

- [ ] **Step 2: Correrlos**

Run: `npx vitest run tests/instrumentation-grafo.test.ts && PROSPECTOS_TEST_DB=1 npx vitest run tests/pdf.test.ts`
Expected: el del grafo **PASA** ya (documenta el estado sano de hoy: recorre 9 archivos, de `instrumentation.ts` a `lib/revision.ts`, sin ningún `node:`); `pdf.test.ts` FALLA porque no existe `@/lib/pdf`.

- [ ] **Step 3: `src/lib/pdf.ts`** — mover (no copiar) la fila global y Chromium desde `propuesta.ts`:

```ts
// src/lib/pdf.ts — HTML -> PDF con Playwright. Lo comparten las propuestas y los recibos.
// Usa node: -> NO importarlo desde la cadena de src/instrumentation.ts (ver CLAUDE.md).
import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

// --- Fila global de generacion -------------------------------------------
// El daemon PM2 de este servidor es compartido con otros sitios (incluido uno
// que cobra plata real): no se deja mas de una generacion de PDF con Chromium
// corriendo a la vez en todo el proceso, para que una tormenta de descargas
// aca no le robe CPU/RAM a los demas. Quien espera mas de 20s su turno se
// rinde en vez de seguir haciendo fila indefinidamente.
const ESPERA_MAXIMA_MS = 20_000;
let colaGlobal: Promise<void> = Promise.resolve();
let generaciones = 0;

export async function conTurnoGlobal<T>(tarea: () => Promise<T>): Promise<T> {
  let liberar!: () => void;
  const miEslabon = new Promise<void>((resolve) => { liberar = resolve; });
  const turnoAnterior = colaGlobal;
  colaGlobal = miEslabon; // el siguiente en la fila espera a que YO libere
  const gane = await Promise.race([
    turnoAnterior.then(() => true as const),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), ESPERA_MAXIMA_MS)),
  ]);
  if (!gane) {
    // Nos rendimos, pero SIN liberar ya mismo: si liberaramos ahora, a quien
    // viene detras (que espera nuestro eslabon) le pareceria libre la fila
    // aunque el dueno real de antes siga generando su PDF, y arrancarian dos
    // Chromium a la vez. En cambio encadenamos: nuestro eslabon se resuelve
    // recien cuando de verdad termine el turno anterior.
    turnoAnterior.finally(liberar);
    throw new Error("PDF_OCUPADO");
  }
  try {
    return await tarea();
  } finally {
    liberar();
  }
}

// Solo para tests: cuenta cuantas veces se lanzo Chromium de verdad.
export function _generacionesParaTests(): number {
  return generaciones;
}

// Lanza Chromium y devuelve el PDF. No hace fila: llamar siempre dentro de conTurnoGlobal.
export async function imprimirPdf(html: string): Promise<Buffer> {
  generaciones += 1;
  const { chromium } = await import("playwright");
  const b = await chromium.launch();
  try {
    const p = await b.newPage();
    try {
      await p.setContent(html, { waitUntil: "networkidle", timeout: 30_000 });
    } catch {
      // Si Google Fonts no responde (red bloqueada), seguir con "load" y
      // esperar solo las fuentes en vez de la quietud total de la red.
      await p.setContent(html, { waitUntil: "load", timeout: 30_000 });
    }
    await p.evaluate(async () => { await (document as any).fonts.ready; });
    await p.emulateMedia({ media: "print" });
    // tagged: estructura e idioma accesibles para lectores de pantalla.
    return await p.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, tagged: true });
  } finally {
    await b.close();
  }
}

// Escritura atomica: nunca se debe leer un archivo a medio escribir. Pisa lo que hubiera.
export async function escribirAtomico(salida: string, bytes: Buffer): Promise<void> {
  await mkdir(path.dirname(salida), { recursive: true, mode: 0o700 });
  const temporal = `${salida}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporal, bytes, { mode: 0o600 });
  await rename(temporal, salida);
}
```

- [ ] **Step 4: `src/lib/propuesta.ts` usa el motor** — el archivo completo queda así:

```ts
// src/lib/propuesta.ts
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { conTurnoGlobal, imprimirPdf, escribirAtomico } from "@/lib/pdf";

// Los tests de propuesta lo importan desde aqui.
export { _generacionesParaTests } from "@/lib/pdf";

const DIR_PLANTILLAS = path.join(process.cwd(), "plantillas");
const dirArchivos = () => process.env.PROSPECTOS_DIR_ARCHIVOS ?? "/home/neracosu/prospectos-archivos";

export async function leerPlantilla(slug: string): Promise<string | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  try { return await readFile(path.join(DIR_PLANTILLAS, `${slug}.html`), "utf8"); } catch { return null; }
}

// La clave de cache es el contenido ya renderizado (plantilla + nombre), no la
// plantilla sola: dos prospectos con la misma plantilla pero nombre distinto
// no deben compartir PDF.
export function rutaPdf(codigo: string, hashContenido: string): string {
  return path.join(dirArchivos(), "propuestas", `${codigo}-${hashContenido}.pdf`);
}

export function hashDe(texto: string): string {
  return createHash("sha256").update(texto).digest("hex").slice(0, 12);
}

// Llamadas concurrentes para el mismo archivo esperan la misma promesa en vez
// de generar el PDF por duplicado.
const enVuelo = new Map<string, Promise<string>>();

// Genera el PDF con Playwright (mismo criterio que ~/propuestas/hoteles/pdf.cjs) y lo
// guarda fuera del docroot. Si ya existe para este contenido, no regenera.
export async function generarPdf(codigo: string, html: string, hashContenido: string): Promise<string> {
  const salida = rutaPdf(codigo, hashContenido);
  const existente = enVuelo.get(salida);
  if (existente) return existente;
  const promesa = generarUnaVez(salida, html).finally(() => { enVuelo.delete(salida); });
  enVuelo.set(salida, promesa);
  return promesa;
}

async function generarUnaVez(salida: string, html: string): Promise<string> {
  try { await stat(salida); return salida; } catch { /* no existe: generar */ }
  return conTurnoGlobal(async () => {
    // Pudo haberse escrito mientras esperabamos el turno (otra llamada, otro
    // proceso): revisar de nuevo antes de gastar un Chromium entero.
    try { await stat(salida); return salida; } catch { /* sigue sin existir */ }
    await escribirAtomico(salida, await imprimirPdf(html));
    return salida;
  });
}
```

- [ ] **Step 5: Todo en verde, incluida la red de seguridad de las propuestas**

Run: `PROSPECTOS_TEST_DB=1 npx vitest run tests/pdf.test.ts tests/propuesta.test.ts && npx vitest run tests/instrumentation-grafo.test.ts tests/propuesta-contrato.test.ts && npx tsc --noEmit`
Expected: PASS todo (`propuesta.test.ts` sigue viendo «un solo Chromium para las 3 llamadas»).

- [ ] **Step 6: Commit**

```bash
git add src/lib/pdf.ts src/lib/propuesta.ts tests/pdf.test.ts tests/instrumentation-grafo.test.ts
git commit -F - <<'EOF'
refactor(pdf): motor de PDF compartido y guardia del grafo de instrumentation

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 4: Generación con correlativo (`src/lib/recibos.ts`)

**Files:**
- Create: `src/lib/recibos.ts`
- Test: `tests/recibos.test.ts` (base real, Chromium simulado), `tests/recibos-pdf.test.ts` (base real, Chromium real)

**Interfaces:**
- Consumes: todo lo de la tarea 2 desde `@/lib/recibos-contrato`; `conTurnoGlobal`, `imprimirPdf`, `escribirAtomico` de `@/lib/pdf`; `leerEmisor` de `@/lib/configuracion`; `hoyCaracas` de `@/lib/fecha-caracas`; `prisma.correlativo` y `Cobro.notaAnulacionEn` de la tarea 1.
- Produces (desde `@/lib/recibos`):
  - `rutaDocumento(nombre: string): string` — `nombre` es `R-2026-0001` o `R-2026-0001-A` (sin `.pdf`); lanza `Error("DOCUMENTO_INVALIDO")` si no cumple `DOCUMENTO_RECIBO`.
  - `generarRecibo(cobroId: number, usuarioId: number): Promise<{ numero: string; nuevo: boolean; proyectoId: number }>` — lanza `EMISOR_INCOMPLETO`, `COBRO_NO_EXISTE`, `RECIBO_NO_APLICA`, `PDF_OCUPADO` o el error de Chromium. Si el cobro ya tiene número, lo devuelve con `nuevo: false` sin tocar nada.
  - `generarNotaAnulacion(cobroId: number, usuarioId: number): Promise<{ numero: string; nueva: boolean; proyectoId: number }>` — lanza `COBRO_NO_EXISTE`, `NOTA_NO_APLICA` (no anulado o sin recibo), `PDF_OCUPADO` o el error de Chromium.

- [ ] **Step 1: Tests que fallan** — crear `tests/recibos.test.ts`. Chromium va simulado (`imprimirPdf` falso, sin fila) para que la concurrencia y el fallo sean deterministas; **`escribirAtomico` es el real**.

```ts
import { vi } from "vitest";
const pdfFalso = vi.hoisted(() => ({ fallarProxima: false, llamadas: 0 }));
vi.mock("@/lib/pdf", async (original) => {
  const real = await original<typeof import("@/lib/pdf")>();
  return {
    ...real,
    conTurnoGlobal: <T,>(tarea: () => Promise<T>) => tarea(),
    imprimirPdf: async () => {
      pdfFalso.llamadas += 1;
      if (pdfFalso.fallarProxima) { pdfFalso.fallarProxima = false; throw new Error("CHROMIUM_ROTO"); }
      await new Promise((r) => setTimeout(r, 150)); // lo bastante lento para que dos generaciones se pisen
      return Buffer.from("%PDF-1.4 falso");
    },
  };
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, sembrarCliente, sembrarProyecto } from "./ayuda-db";
import { guardarConfig, CLAVES } from "@/lib/configuracion";
import { hoyCaracas } from "@/lib/fecha-caracas";
import { generarRecibo, generarNotaAnulacion, rutaDocumento } from "@/lib/recibos";

const ANIO = Number(hoyCaracas().slice(0, 4));
const EMISOR = JSON.stringify({ nombre: "Neri Colón", rif: "V-12345678-9", whatsapp: "584121234567", email: "neri@ejemplo.test" });
const ultimo = async () => (await prisma.correlativo.findUnique({ where: { serie_anio: { serie: "R", anio: ANIO } } }))?.ultimo ?? 0;

describe.runIf(DB_HABILITADA)("generarRecibo y generarNotaAnulacion", () => {
  let usuarioId: number;
  let proyectoId: number;
  const cobroPagado = (detalle: string) => prisma.cobro.create({ data: { proyectoId, concepto: "extra", detalle, monto: "350.00", vence: "2026-09-01", pagadoEn: new Date("2026-09-16T16:00:00Z"), canal: "zelle", referencia: "Z-1" } });

  beforeAll(async () => {
    await limpiarBase();
    rmSync(path.join(process.env.PROSPECTOS_DIR_ARCHIVOS!, "recibos"), { recursive: true, force: true });
    const ids = await sembrarBasico();
    usuarioId = ids.usuarioId;
    const c = await sembrarCliente({ nombre: "Hotel Recibos", whatsapp: "584129999999" });
    proyectoId = (await sembrarProyecto(c.id, ids.nichoId, { estado: "activo" })).id;
  });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("rutaDocumento arma <dir>/recibos/<anio>/<nombre>.pdf y rechaza nombres raros", () => {
    expect(rutaDocumento("R-2026-0001")).toBe(path.join(process.env.PROSPECTOS_DIR_ARCHIVOS!, "recibos", "2026", "R-2026-0001.pdf"));
    expect(rutaDocumento("R-2027-0042-A")).toBe(path.join(process.env.PROSPECTOS_DIR_ARCHIVOS!, "recibos", "2027", "R-2027-0042-A.pdf"));
    expect(() => rutaDocumento("../../etc/passwd")).toThrow("DOCUMENTO_INVALIDO");
  });

  it("sin datos del emisor no genera ni gasta numero", async () => {
    const c = await cobroPagado("Sin emisor");
    await expect(generarRecibo(c.id, usuarioId)).rejects.toThrow("EMISOR_INCOMPLETO");
    expect(await ultimo()).toBe(0);
    await guardarConfig(CLAVES.emisor, EMISOR);
  });

  it("un cobro pendiente o anulado no genera recibo", async () => {
    const pendiente = await prisma.cobro.create({ data: { proyectoId, concepto: "extra", detalle: "Pendiente", monto: "10.00", vence: "2026-12-01" } });
    const anulado = await prisma.cobro.create({ data: { proyectoId, concepto: "extra", detalle: "Anulado", monto: "10.00", vence: "2026-12-01", pagadoEn: new Date(), anuladoEn: new Date(), anuladoMotivo: "x" } });
    await expect(generarRecibo(pendiente.id, usuarioId)).rejects.toThrow("RECIBO_NO_APLICA");
    await expect(generarRecibo(anulado.id, usuarioId)).rejects.toThrow("RECIBO_NO_APLICA");
    await expect(generarRecibo(999_999, usuarioId)).rejects.toThrow("COBRO_NO_EXISTE");
    expect(await ultimo()).toBe(0);
  });

  it("genera el 0001, guarda el PDF en 600, marca el cobro y deja su evento; la segunda vez devuelve el mismo numero", async () => {
    const c = await cobroPagado("Primero");
    const r = await generarRecibo(c.id, usuarioId);
    expect(r).toEqual({ numero: `R-${ANIO}-0001`, nuevo: true, proyectoId });
    const ruta = rutaDocumento(r.numero);
    expect(readFileSync(ruta, "utf8")).toBe("%PDF-1.4 falso");
    expect(statSync(ruta).mode & 0o777).toBe(0o600);
    const d = await prisma.cobro.findUniqueOrThrow({ where: { id: c.id } });
    expect(d.reciboNumero).toBe(r.numero);
    expect(d.reciboGeneradoEn).not.toBeNull();
    expect(await prisma.evento.count({ where: { cobroId: c.id, tipo: "recibo_generado", usuarioId, texto: r.numero } })).toBe(1);

    const llamadas = pdfFalso.llamadas;
    expect(await generarRecibo(c.id, usuarioId)).toEqual({ numero: r.numero, nuevo: false, proyectoId });
    expect(pdfFalso.llamadas).toBe(llamadas); // un recibo emitido no se regenera
    expect(await ultimo()).toBe(1);
  });

  it("dos generaciones simultaneas dan dos numeros distintos", async () => {
    const [a, b] = await Promise.all([cobroPagado("Simultaneo A"), cobroPagado("Simultaneo B")]);
    const [ra, rb] = await Promise.all([generarRecibo(a.id, usuarioId), generarRecibo(b.id, usuarioId)]);
    expect(new Set([ra.numero, rb.numero])).toEqual(new Set([`R-${ANIO}-0002`, `R-${ANIO}-0003`]));
    expect(await ultimo()).toBe(3);
  }, 30_000);

  it("dos toques sobre el mismo cobro dan un solo recibo", async () => {
    const c = await cobroPagado("Doble toque");
    const [r1, r2] = await Promise.all([generarRecibo(c.id, usuarioId), generarRecibo(c.id, usuarioId)]);
    expect(r1.numero).toBe(`R-${ANIO}-0004`);
    expect(r2.numero).toBe(r1.numero);
    expect([r1.nuevo, r2.nuevo].filter(Boolean)).toHaveLength(1);
    expect(await ultimo()).toBe(4);
    expect(await prisma.evento.count({ where: { cobroId: c.id, tipo: "recibo_generado" } })).toBe(1);
  }, 30_000);

  it("si el PDF falla, el cobro sigue pagado y sin numero, y el correlativo no se gasta", async () => {
    const c = await cobroPagado("Falla");
    pdfFalso.fallarProxima = true;
    await expect(generarRecibo(c.id, usuarioId)).rejects.toThrow("CHROMIUM_ROTO");
    const d = await prisma.cobro.findUniqueOrThrow({ where: { id: c.id } });
    expect(d.reciboNumero).toBe("");
    expect(d.pagadoEn).not.toBeNull();
    expect(await ultimo()).toBe(4);
    expect((await generarRecibo(c.id, usuarioId)).numero).toBe(`R-${ANIO}-0005`); // el reintento toma el numero que quedo libre
  });

  it("la nota de anulacion es R-...-A, no borra el recibo y se genera una sola vez", async () => {
    const c = await cobroPagado("Para anular");
    const r = await generarRecibo(c.id, usuarioId);
    await expect(generarNotaAnulacion(c.id, usuarioId)).rejects.toThrow("NOTA_NO_APLICA"); // todavia no esta anulado
    await prisma.cobro.update({ where: { id: c.id }, data: { anuladoEn: new Date(), anuladoMotivo: "Pago duplicado" } });
    const n = await generarNotaAnulacion(c.id, usuarioId);
    expect(n).toEqual({ numero: `${r.numero}-A`, nueva: true, proyectoId });
    expect(existsSync(rutaDocumento(n.numero))).toBe(true);
    expect(existsSync(rutaDocumento(r.numero))).toBe(true);
    expect((await prisma.cobro.findUniqueOrThrow({ where: { id: c.id } })).notaAnulacionEn).not.toBeNull();
    expect((await generarNotaAnulacion(c.id, usuarioId)).nueva).toBe(false);
    expect(await prisma.evento.count({ where: { cobroId: c.id, tipo: "nota_anulacion", texto: n.numero } })).toBe(1);
    expect(await ultimo()).toBe(6); // la nota no gasta correlativo
  });

  it("un cobro anulado que nunca tuvo recibo no lleva nota", async () => {
    const c = await prisma.cobro.create({ data: { proyectoId, concepto: "extra", detalle: "Anulado sin recibo", monto: "10.00", vence: "2026-12-01", anuladoEn: new Date(), anuladoMotivo: "x" } });
    await expect(generarNotaAnulacion(c.id, usuarioId)).rejects.toThrow("NOTA_NO_APLICA");
  });
});
```

Y crear `tests/recibos-pdf.test.ts` (Chromium real, sin simulacros):

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, sembrarCliente, sembrarProyecto } from "./ayuda-db";
import { guardarConfig, CLAVES } from "@/lib/configuracion";
import { generarRecibo, generarNotaAnulacion, rutaDocumento } from "@/lib/recibos";

const paginas = (ruta: string) => (readFileSync(ruta).toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;

describe.runIf(DB_HABILITADA)("recibo real con Chromium", () => {
  let usuarioId: number;
  let cobroId: number;
  beforeAll(async () => {
    await limpiarBase();
    rmSync(path.join(process.env.PROSPECTOS_DIR_ARCHIVOS!, "recibos"), { recursive: true, force: true });
    const ids = await sembrarBasico();
    usuarioId = ids.usuarioId;
    await guardarConfig(CLAVES.emisor, JSON.stringify({ nombre: "Neri Colón", rif: "V-12345678-9", whatsapp: "584121234567", email: "neri@ejemplo.test" }));
    const c = await sembrarCliente({ nombre: "Inversiones Hotel Parque Central, C.A." });
    const p = await sembrarProyecto(c.id, ids.nichoId, { estado: "activo" });
    await prisma.version.create({ data: { proyectoId: p.id, version: "1.4.0", fecha: "2026-10-02" } });
    await prisma.version.create({ data: { proyectoId: p.id, version: "1.4.2", fecha: "2026-10-28" } });
    cobroId = (await prisma.cobro.create({ data: { proyectoId: p.id, concepto: "mensualidad", detalle: "Mensualidad de octubre 2026", mes: "2026-10", monto: "100.00", vence: "2026-10-05", pagadoEn: new Date("2026-10-04T16:00:00Z"), canal: "pago_movil", referencia: "0102-4481927733" } })).id;
  });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("el PDF existe, es un PDF, pesa mas de 10 KB, cabe en una hoja y queda en 600", async () => {
    const r = await generarRecibo(cobroId, usuarioId);
    const ruta = rutaDocumento(r.numero);
    expect(readFileSync(ruta).subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(statSync(ruta).size).toBeGreaterThan(10_000);
    expect(statSync(ruta).mode & 0o777).toBe(0o600);
    expect(paginas(ruta)).toBe(1);
  }, 90_000);

  it("la nota de anulacion tambien es un PDF real de una hoja", async () => {
    await prisma.cobro.update({ where: { id: cobroId }, data: { anuladoEn: new Date(), anuladoMotivo: "El pago se registró dos veces por error." } });
    const n = await generarNotaAnulacion(cobroId, usuarioId);
    const ruta = rutaDocumento(n.numero);
    expect(n.numero.endsWith("-A")).toBe(true);
    expect(statSync(ruta).size).toBeGreaterThan(10_000);
    expect(paginas(ruta)).toBe(1);
  }, 90_000);
});
```

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `PROSPECTOS_TEST_DB=1 npx vitest run tests/recibos.test.ts tests/recibos-pdf.test.ts`
Expected: FAIL — no existe `@/lib/recibos`.

- [ ] **Step 3: Implementar** — crear `src/lib/recibos.ts`:

```ts
// src/lib/recibos.ts — genera y guarda los recibos de pago y sus notas de anulacion (pieza 4).
// Usa node: -> NO importarlo desde la cadena de src/instrumentation.ts (ver CLAUDE.md).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { hoyCaracas } from "@/lib/fecha-caracas";
import { leerEmisor } from "@/lib/configuracion";
import { conTurnoGlobal, imprimirPdf, escribirAtomico } from "@/lib/pdf";
import type { Concepto } from "@/lib/cobros-contrato";
import {
  SERIE_RECIBO, anioDeDocumento, numeroRecibo, numeroNota, conceptoRecibo, versionesIncluidas, faltantesEmisor,
  camposRecibo, camposNota, renderDocumento, fuentesDePlantilla, incrustarFuentes, type DatosRecibo,
} from "@/lib/recibos-contrato";

const DIR_PLANTILLAS = path.join(process.cwd(), "plantillas");
const dirArchivos = () => process.env.PROSPECTOS_DIR_ARCHIVOS ?? "/home/neracosu/prospectos-archivos";

// nombre = "R-2026-0001" o "R-2026-0001-A" (sin .pdf). Fuera del docroot, una carpeta por anio.
export function rutaDocumento(nombre: string): string {
  const anio = anioDeDocumento(nombre);
  if (!anio) throw new Error("DOCUMENTO_INVALIDO");
  return path.join(dirArchivos(), "recibos", anio, `${nombre}.pdf`);
}

async function plantillaConFuentes(): Promise<string> {
  const plantilla = await readFile(path.join(DIR_PLANTILLAS, "recibo.html"), "utf8");
  const fuentes: Record<string, string> = {};
  for (const archivo of fuentesDePlantilla(plantilla)) fuentes[archivo] = (await readFile(path.join(DIR_PLANTILLAS, "fuentes", archivo))).toString("base64");
  return incrustarFuentes(plantilla, fuentes);
}

const INCLUIR = { proyecto: { include: { cliente: true, versiones: { select: { version: true, fecha: true } } } } } as const;
type CobroCompleto = NonNullable<Awaited<ReturnType<typeof leerCobro>>>;
function leerCobro(db: Pick<typeof prisma, "cobro">, id: number) {
  return db.cobro.findUnique({ where: { id }, include: INCLUIR });
}

function datosDe(c: CobroCompleto, numero: string, emitidoEl: string, emisor: DatosRecibo["emisor"]): DatosRecibo {
  return {
    numero, emitidoEl, emisor,
    cliente: { nombre: c.proyecto.cliente.nombre, rif: c.proyecto.cliente.rif, contactoNombre: c.proyecto.cliente.contactoNombre },
    concepto: conceptoRecibo({ concepto: c.concepto as Concepto, detalle: c.detalle, mes: c.mes }, c.proyecto.nombre),
    versiones: versionesIncluidas(c.proyecto.versiones, c.mes),
    monto: Number(c.monto), fechaPago: hoyCaracas(c.pagadoEn ?? new Date()), canal: c.canal, referencia: c.referencia,
  };
}

// El numero va impreso en el PDF y a la vez solo se puede gastar si el PDF existe. Las dos
// cosas se cumplen asi: con la fila del contador bloqueada se calcula el numero, se genera
// el PDF, y recien al final se confirma. Si Chromium falla, la excepcion deshace la
// transaccion y el numero sigue libre. El bloqueo ademas serializa las generaciones.
export async function generarRecibo(cobroId: number, usuarioId: number): Promise<{ numero: string; nuevo: boolean; proyectoId: number }> {
  const emisor = await leerEmisor();
  if (faltantesEmisor(emisor).length > 0) throw new Error("EMISOR_INCOMPLETO");
  const plantilla = await plantillaConFuentes();
  const hoy = hoyCaracas();
  const anio = Number(hoy.slice(0, 4));
  // La fila del contador tiene que existir para poder bloquearla. Va FUERA de la transaccion:
  // dos INSERT IGNORE simultaneos dentro de transacciones largas se pueden interbloquear.
  await prisma.$executeRaw`INSERT IGNORE INTO Correlativo (serie, anio, ultimo) VALUES (${SERIE_RECIBO}, ${anio}, 0)`;
  return prisma.$transaction(async (tx) => {
    const filas = await tx.$queryRaw<{ ultimo: number | bigint }[]>`SELECT ultimo FROM Correlativo WHERE serie = ${SERIE_RECIBO} AND anio = ${anio} FOR UPDATE`;
    // Con el contador bloqueado nadie mas esta generando: lo que se lea ahora del cobro es definitivo.
    const c = await leerCobro(tx, cobroId);
    if (!c) throw new Error("COBRO_NO_EXISTE");
    if (c.reciboNumero) return { numero: c.reciboNumero, nuevo: false, proyectoId: c.proyectoId }; // un recibo emitido no cambia
    if (!c.pagadoEn || c.anuladoEn) throw new Error("RECIBO_NO_APLICA");
    const numero = numeroRecibo(anio, Number(filas[0].ultimo) + 1);
    const html = renderDocumento(plantilla, camposRecibo(datosDe(c, numero, hoy, emisor)));
    // Pisa el archivo si existiera: solo puede ser el resto de una transaccion que no llego a confirmar.
    await conTurnoGlobal(async () => escribirAtomico(rutaDocumento(numero), await imprimirPdf(html)));
    await tx.$executeRaw`UPDATE Correlativo SET ultimo = ultimo + 1 WHERE serie = ${SERIE_RECIBO} AND anio = ${anio}`;
    const r = await tx.cobro.updateMany({ where: { id: cobroId, reciboNumero: "", anuladoEn: null, pagadoEn: { not: null } }, data: { reciboNumero: numero, reciboGeneradoEn: new Date() } });
    if (r.count === 0) throw new Error("RECIBO_NO_APLICA"); // lo anularon mientras se generaba
    await tx.evento.create({ data: { proyectoId: c.proyectoId, cobroId, usuarioId, tipo: "recibo_generado", texto: numero } });
    return { numero, nuevo: true, proyectoId: c.proyectoId };
    // ReadCommitted: la lectura del cobro tiene que ver lo que confirmo quien tenia el bloqueo antes.
    // timeout: hasta 20 s de fila de Chromium mas la generacion.
  }, { isolationLevel: "ReadCommitted", maxWait: 60_000, timeout: 90_000 });
}

// La nota no gasta correlativo: es el numero del recibo con -A. Si Chromium fallo al anular,
// se puede reintentar despues; por eso el cobro guarda notaAnulacionEn.
export async function generarNotaAnulacion(cobroId: number, usuarioId: number): Promise<{ numero: string; nueva: boolean; proyectoId: number }> {
  const c = await leerCobro(prisma, cobroId);
  if (!c) throw new Error("COBRO_NO_EXISTE");
  if (!c.anuladoEn || !c.reciboNumero || !c.reciboGeneradoEn) throw new Error("NOTA_NO_APLICA");
  const numero = numeroNota(c.reciboNumero);
  if (c.notaAnulacionEn) return { numero, nueva: false, proyectoId: c.proyectoId };
  const datos = datosDe(c, c.reciboNumero, hoyCaracas(c.reciboGeneradoEn), await leerEmisor());
  const html = renderDocumento(await plantillaConFuentes(), camposNota(datos, { anuladoEl: hoyCaracas(c.anuladoEn), motivo: c.anuladoMotivo }));
  await conTurnoGlobal(async () => escribirAtomico(rutaDocumento(numero), await imprimirPdf(html)));
  // Marca y evento van juntos; si dos toques llegaron a la vez, solo uno cuenta.
  const nueva = await prisma.$transaction(async (tx) => {
    const r = await tx.cobro.updateMany({ where: { id: cobroId, notaAnulacionEn: null }, data: { notaAnulacionEn: new Date() } });
    if (r.count === 0) return false;
    await tx.evento.create({ data: { proyectoId: c.proyectoId, cobroId, usuarioId, tipo: "nota_anulacion", texto: numero } });
    return true;
  });
  return { numero, nueva, proyectoId: c.proyectoId };
}
```

- [ ] **Step 4: Tests en verde**

Run: `PROSPECTOS_TEST_DB=1 npx vitest run tests/recibos.test.ts tests/recibos-pdf.test.ts && npx vitest run tests/instrumentation-grafo.test.ts && npx tsc --noEmit`
Expected: PASS (9 + 2 + 1). Si «dos generaciones simultáneas» se cuelga o da el mismo número, el `FOR UPDATE` no está bloqueando: revisar que la consulta vaya por `tx`, no por `prisma`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recibos.ts tests/recibos.test.ts tests/recibos-pdf.test.ts
git commit -F - <<'EOF'
feat(recibos): generacion con correlativo bloqueado y nota de anulacion

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 5: Acciones — generar, avisar por WhatsApp, anular con nota

**Files:**
- Create: `src/acciones/recibos.ts`
- Modify: `src/acciones/cobros.ts:52-70` (`anularCobro`), `prisma/schema.prisma:91-93` (comentario de tipos de `Evento`)
- Test: `tests/recibos-acciones.test.ts` (nuevo), `tests/cobros.test.ts:83-93` (cambia la regla)

**Interfaces:**
- Consumes: `generarRecibo`, `generarNotaAnulacion` de `@/lib/recibos`; `mensajeRecibo`, `conceptoRecibo` de `@/lib/recibos-contrato`; `enlaceWhatsappCobro` de `@/lib/mensajes-cobro`; `exigirRol` de `@/lib/sesion`; `fallo`/`exito`/`Resultado` de `@/acciones/resultado`.
- Produces (desde `@/acciones/recibos`):
  - `generarReciboDeCobro(cobroId: number): Promise<Resultado<{ numero: string }>>`
  - `avisarRecibo(cobroId: number): Promise<Resultado<{ href: string | null; mensaje: string; repetido: boolean }>>` — `href` es `null` si el cliente no tiene WhatsApp (el mensaje igual se devuelve para copiarlo).
  - `generarNotaDeAnulacion(cobroId: number): Promise<Resultado<{ numero: string }>>`
- `anularCobro(cobroId, motivo)` conserva su firma; ahora acepta cobros pagados y, si el cobro tiene recibo, intenta generar la nota (si falla, el cobro queda anulado igual y el error va al log).

- [ ] **Step 1: Tests que fallan** — crear `tests/recibos-acciones.test.ts`:

```ts
import { vi } from "vitest";
const pdfFalso = vi.hoisted(() => ({ fallarProxima: false }));
vi.mock("@/lib/pdf", async (original) => {
  const real = await original<typeof import("@/lib/pdf")>();
  return {
    ...real,
    conTurnoGlobal: <T,>(tarea: () => Promise<T>) => tarea(),
    imprimirPdf: async () => { if (pdfFalso.fallarProxima) { pdfFalso.fallarProxima = false; throw new Error("CHROMIUM_ROTO"); } return Buffer.from("%PDF-1.4 falso"); },
  };
});
vi.mock("@/lib/sesion", async () => {
  const { sesionFalsa } = await import("./ayuda-sesion");
  return {
    COOKIE_SESION: "pr_sesion", DIAS_SESION: 30,
    sesionActual: async () => sesionFalsa.actual,
    exigirSesion: async () => { if (!sesionFalsa.actual) throw new Error("REDIRECT:/entrar"); return sesionFalsa.actual; },
    exigirRol: async (rol: string) => { if (sesionFalsa.actual?.rol !== rol) throw new Error("REDIRECT:/hoy"); return sesionFalsa.actual; },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, sembrarCliente, sembrarProyecto } from "./ayuda-db";
import { sesionFalsa } from "./ayuda-sesion";
import { guardarConfig, CLAVES } from "@/lib/configuracion";
import { rutaDocumento } from "@/lib/recibos";
import { generarReciboDeCobro, avisarRecibo, generarNotaDeAnulacion } from "@/acciones/recibos";
import { anularCobro } from "@/acciones/cobros";

const EMISOR = JSON.stringify({ nombre: "Neri Colón", rif: "V-12345678-9", whatsapp: "584121234567", email: "neri@ejemplo.test" });

describe.runIf(DB_HABILITADA)("acciones de recibos", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  let proyectoId: number;
  const cobroPagado = (detalle: string, pid = proyectoId) => prisma.cobro.create({ data: { proyectoId: pid, concepto: "extra", detalle, monto: "350.00", vence: "2026-09-01", pagadoEn: new Date("2026-09-16T16:00:00Z"), canal: "zelle", referencia: "Z-1" } });

  beforeAll(async () => {
    await limpiarBase();
    rmSync(path.join(process.env.PROSPECTOS_DIR_ARCHIVOS!, "recibos"), { recursive: true, force: true });
    ids = await sembrarBasico();
    const c = await sembrarCliente({ nombre: "Hotel Acciones", whatsapp: "584129999999" });
    proyectoId = (await sembrarProyecto(c.id, ids.nichoId, { estado: "activo", nombre: "PMS" })).id;
  });
  beforeEach(() => { sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" }; });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("el prospectador no toca recibos", async () => {
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
    await expect(generarReciboDeCobro(1)).rejects.toThrow("REDIRECT:/hoy");
    await expect(avisarRecibo(1)).rejects.toThrow("REDIRECT:/hoy");
    await expect(generarNotaDeAnulacion(1)).rejects.toThrow("REDIRECT:/hoy");
  });

  it("sin datos del emisor manda a Ajustes", async () => {
    const c = await cobroPagado("Sin emisor");
    expect(await generarReciboDeCobro(c.id)).toEqual({ ok: false, mensaje: expect.stringContaining("Ajustes") });
    await guardarConfig(CLAVES.emisor, EMISOR);
  });

  it("genera, y cada fallo tiene su mensaje", async () => {
    const pendiente = await prisma.cobro.create({ data: { proyectoId, concepto: "extra", detalle: "Pendiente", monto: "10.00", vence: "2026-12-01" } });
    expect(await generarReciboDeCobro(pendiente.id)).toEqual({ ok: false, mensaje: expect.stringContaining("pagado") });
    expect(await generarReciboDeCobro(999_999)).toEqual({ ok: false, mensaje: "Ese cobro no existe." });
    expect((await generarReciboDeCobro(-1)).ok).toBe(false);
    const c = await cobroPagado("Reportes");
    pdfFalso.fallarProxima = true;
    expect(await generarReciboDeCobro(c.id)).toEqual({ ok: false, mensaje: "No se pudo generar el recibo. Intenta de nuevo." });
    const r = await generarReciboDeCobro(c.id);
    expect(r).toEqual({ ok: true, datos: { numero: expect.stringMatching(/^R-\d{4}-0001$/) } });
  });

  it("avisarRecibo arma el mensaje con numero, concepto y monto; deja aviso_cliente una vez por dia", async () => {
    const c = await prisma.cobro.findFirstOrThrow({ where: { proyectoId, detalle: "Reportes" } });
    const a = await avisarRecibo(c.id);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.datos.repetido).toBe(false);
    expect(a.datos.mensaje).toContain(c.reciboNumero);
    expect(a.datos.mensaje).toContain("$350,00");
    expect(a.datos.mensaje).toContain("PMS: Extra — Reportes");
    expect(a.datos.href).toMatch(/^https:\/\/wa\.me\/584129999999\?text=/);
    const b = await avisarRecibo(c.id);
    expect(b.ok && b.datos.repetido).toBe(true);
    expect(await prisma.evento.count({ where: { cobroId: c.id, tipo: "aviso_cliente", texto: `recibo ${c.reciboNumero}` } })).toBe(1);
  });

  it("avisarRecibo sin recibo falla; sin WhatsApp devuelve el mensaje para copiar", async () => {
    const sinRecibo = await cobroPagado("Sin recibo");
    expect(await avisarRecibo(sinRecibo.id)).toEqual({ ok: false, mensaje: expect.stringContaining("recibo") });
    const c2 = await sembrarCliente({ nombre: "Sin Cel", whatsapp: "" });
    const p2 = await sembrarProyecto(c2.id, ids.nichoId, { estado: "activo" });
    const cobro = await cobroPagado("Otro", p2.id);
    await generarReciboDeCobro(cobro.id);
    const r = await avisarRecibo(cobro.id);
    expect(r.ok && r.datos.href).toBeNull();
    expect(r.ok && r.datos.mensaje).toContain("recibo de pago");
  });

  it("anular un cobro con recibo genera la nota -A y no borra el PDF", async () => {
    const c = await prisma.cobro.findFirstOrThrow({ where: { proyectoId, detalle: "Reportes" } });
    expect((await anularCobro(c.id, "Pago duplicado")).ok).toBe(true);
    const d = await prisma.cobro.findUniqueOrThrow({ where: { id: c.id } });
    expect(d.anuladoEn).not.toBeNull();
    expect(d.notaAnulacionEn).not.toBeNull();
    expect(existsSync(rutaDocumento(`${c.reciboNumero}-A`))).toBe(true);
    expect(existsSync(rutaDocumento(c.reciboNumero))).toBe(true);
    expect((await anularCobro(c.id, "otra vez")).ok).toBe(false); // ya estaba anulado
    expect(await avisarRecibo(c.id)).toEqual({ ok: false, mensaje: expect.stringContaining("anulado") });
  });

  it("si la nota falla al anular, el cobro queda anulado y la nota se genera despues", async () => {
    const c = await cobroPagado("Nota con reintento");
    await generarReciboDeCobro(c.id);
    pdfFalso.fallarProxima = true;
    expect((await anularCobro(c.id, "Error del banco")).ok).toBe(true);
    const d = await prisma.cobro.findUniqueOrThrow({ where: { id: c.id } });
    expect(d.anuladoEn).not.toBeNull();
    expect(d.notaAnulacionEn).toBeNull();
    expect(await generarNotaDeAnulacion(c.id)).toEqual({ ok: true, datos: { numero: `${d.reciboNumero}-A` } });
    expect((await prisma.cobro.findUniqueOrThrow({ where: { id: c.id } })).notaAnulacionEn).not.toBeNull();
  });

  it("generarNotaDeAnulacion sobre un cobro sin anular o sin recibo falla con mensaje claro", async () => {
    const c = await cobroPagado("Sin anular");
    expect(await generarNotaDeAnulacion(c.id)).toEqual({ ok: false, mensaje: expect.stringContaining("anulado") });
  });
});
```

Y en `tests/cobros.test.ts` reemplazar el test «anularCobro exige motivo, no anula uno pagado, y un anulado no se paga» (líneas 83-93) por:

```ts
  it("anularCobro exige motivo, anula tambien uno pagado (pieza 4), y un anulado no se paga ni se anula otra vez", async () => {
    const pagado = await prisma.cobro.findFirstOrThrow({ where: { proyectoId, concepto: "extra" } });
    expect((await anularCobro(pagado.id, " ")).ok).toBe(false);
    expect((await anularCobro(pagado.id, "se marcó por error")).ok).toBe(true);
    const d = await prisma.cobro.findUniqueOrThrow({ where: { id: pagado.id } });
    expect(d.anuladoEn).not.toBeNull();
    expect(d.pagadoEn).not.toBeNull(); // el rastro del pago no se borra
    expect(d.notaAnulacionEn).toBeNull(); // no tenia recibo: no hay nota
    expect(await anularCobro(pagado.id, "otra vez")).toEqual({ ok: false, mensaje: "Ese cobro ya estaba anulado." });
    const r = await agregarCobro(fd({ proyectoId: String(proyectoId), concepto: "cuota", detalle: "Cuota extra", monto: "100", vence: "2026-12-01" }));
    expect(r.ok).toBe(true);
    const c = await prisma.cobro.findFirstOrThrow({ where: { proyectoId, detalle: "Cuota extra" } });
    expect((await anularCobro(c.id, "se acordó otra cosa")).ok).toBe(true);
    expect((await marcarPagado(fd({ cobroId: String(c.id), pagadoEn: hoyCaracas(), canal: "efectivo", referencia: "", nota: "" }))).ok).toBe(false);
    expect((await prisma.cobro.findUniqueOrThrow({ where: { id: c.id } })).anuladoMotivo).toBe("se acordó otra cosa");
  });
```

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `PROSPECTOS_TEST_DB=1 npx vitest run tests/recibos-acciones.test.ts tests/cobros.test.ts`
Expected: FAIL — no existe `@/acciones/recibos`; en `cobros.test.ts` falla el test nuevo («Un cobro pagado no se anula»).

- [ ] **Step 3: `anularCobro`** — en `src/acciones/cobros.ts` agregar el import `import { generarNotaAnulacion } from "@/lib/recibos";` y reemplazar la función completa por:

```ts
// Desde la pieza 4 tambien se anula un cobro pagado: es la unica forma de corregir un pago
// marcado por error o un recibo mal emitido. Nada se borra: el pago, el recibo y su PDF quedan,
// y si habia recibo se genera la nota de anulacion R-...-A.
export async function anularCobro(cobroId: number, motivo: string): Promise<Resultado> {
  const u = await exigirRol("dueno");
  const e = z.object({ id: Id, motivo: z.string().trim().min(2).max(300) }).safeParse({ id: cobroId, motivo });
  if (!e.success) return fallo("Escribe el motivo.");
  try {
    const c = await prisma.cobro.findUnique({ where: { id: e.data.id }, select: { proyectoId: true } });
    if (!c) return fallo("Ese cobro no existe.");
    await prisma.$transaction(async (tx) => {
      const r = await tx.cobro.updateMany({ where: { id: e.data.id, anuladoEn: null }, data: { anuladoEn: new Date(), anuladoMotivo: e.data.motivo } });
      if (r.count === 0) throw new Error(COBRO_YA_RESUELTO);
      await tx.evento.create({ data: { proyectoId: c.proyectoId, cobroId: e.data.id, usuarioId: u.id, tipo: "cobro_anulado", texto: e.data.motivo } });
    });
    // Se lee DESPUES de anular: si un recibo se estaba generando a la vez, o quedo emitido
    // antes de la anulacion (y entonces lleva nota) o su transaccion fallo (y no hay recibo).
    const despues = await prisma.cobro.findUnique({ where: { id: e.data.id }, select: { reciboNumero: true } });
    if (despues?.reciboNumero) {
      // Si Chromium falla, el cobro ya quedo anulado: la nota se genera despues desde la fila.
      try { await generarNotaAnulacion(e.data.id, u.id); } catch (err) { console.error("anularCobro: nota de anulacion", e.data.id, err); }
    }
    refrescar(c.proyectoId);
    return exito();
  } catch (err) {
    if (err instanceof Error && err.message === COBRO_YA_RESUELTO) return fallo("Ese cobro ya estaba anulado.");
    console.error("anularCobro", err); return fallo(ERROR);
  }
}
```

Actualizar también el comentario de la línea 14 a: `// exigirRol("dueno") va FUERA del try/catch. Nada se borra: los cobros se anulan con motivo (tambien los pagados).`

- [ ] **Step 4: Las acciones** — crear `src/acciones/recibos.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { exigirRol } from "@/lib/sesion";
import { hoyCaracas } from "@/lib/fecha-caracas";
import type { Concepto } from "@/lib/cobros-contrato";
import { conceptoRecibo, mensajeRecibo } from "@/lib/recibos-contrato";
import { generarRecibo, generarNotaAnulacion } from "@/lib/recibos";
import { enlaceWhatsappCobro } from "@/lib/mensajes-cobro";
import { fallo, exito, type Resultado } from "@/acciones/resultado";

// exigirRol("dueno") va FUERA del try/catch. Solo el dueno genera, avisa y anula recibos.
const ERROR = "No se pudo completar. Intenta de nuevo.";
const Id = z.number().int().positive();
function refrescar(proyectoId: number) { revalidatePath(`/proyectos/${proyectoId}`); }
const codigoDe = (err: unknown) => (err instanceof Error ? err.message : "");

export async function generarReciboDeCobro(cobroId: number): Promise<Resultado<{ numero: string }>> {
  const u = await exigirRol("dueno");
  const e = Id.safeParse(cobroId);
  if (!e.success) return fallo(ERROR);
  try {
    const r = await generarRecibo(e.data, u.id);
    refrescar(r.proyectoId);
    return exito({ numero: r.numero });
  } catch (err) {
    const codigo = codigoDe(err);
    if (codigo === "EMISOR_INCOMPLETO") return fallo("Completa tus datos en Ajustes (nombre, RIF, WhatsApp y correo) antes de generar recibos.");
    if (codigo === "COBRO_NO_EXISTE") return fallo("Ese cobro no existe.");
    if (codigo === "RECIBO_NO_APLICA") return fallo("Solo un cobro pagado y sin anular puede tener recibo.");
    if (codigo === "PDF_OCUPADO") return fallo("El servidor está generando otro PDF. Intenta de nuevo en unos segundos.");
    // El cobro sigue pagado y sin numero: no se gasto ningun correlativo.
    console.error("generarReciboDeCobro", e.data, err);
    return fallo("No se pudo generar el recibo. Intenta de nuevo.");
  }
}

// Devuelve el mensaje (para copiarlo) y el enlace de WhatsApp. El PDF lo adjunta Neri desde el
// telefono: WhatsApp no adjunta por enlace. Deja rastro una vez por dia de Caracas.
export async function avisarRecibo(cobroId: number): Promise<Resultado<{ href: string | null; mensaje: string; repetido: boolean }>> {
  const u = await exigirRol("dueno");
  const e = Id.safeParse(cobroId);
  if (!e.success) return fallo(ERROR);
  try {
    const c = await prisma.cobro.findUnique({ where: { id: e.data }, include: { proyecto: { include: { cliente: true } } } });
    if (!c) return fallo("Ese cobro no existe.");
    if (!c.reciboNumero) return fallo("Ese cobro todavía no tiene recibo.");
    if (c.anuladoEn) return fallo("Ese recibo está anulado: no se envía.");
    const cliente = c.proyecto.cliente;
    const mensaje = mensajeRecibo({
      cliente: cliente.contactoNombre || cliente.nombre, numero: c.reciboNumero, monto: Number(c.monto),
      concepto: conceptoRecibo({ concepto: c.concepto as Concepto, detalle: c.detalle, mes: c.mes }, c.proyecto.nombre),
    });
    const href = enlaceWhatsappCobro(cliente.whatsapp, mensaje);
    const texto = `recibo ${c.reciboNumero}`;
    const desde = new Date(`${hoyCaracas()}T00:00:00-04:00`);
    const yaHoy = await prisma.evento.findFirst({ where: { cobroId: c.id, tipo: "aviso_cliente", texto, creadoEn: { gte: desde } }, select: { id: true } });
    if (yaHoy) return exito({ href, mensaje, repetido: true });
    await prisma.evento.create({ data: { proyectoId: c.proyectoId, cobroId: c.id, usuarioId: u.id, tipo: "aviso_cliente", canal: href ? "whatsapp" : "", texto } });
    refrescar(c.proyectoId);
    return exito({ href, mensaje, repetido: false });
  } catch (err) { console.error("avisarRecibo", err); return fallo(ERROR); }
}

// Reintento de la nota cuando Chromium fallo al anular.
export async function generarNotaDeAnulacion(cobroId: number): Promise<Resultado<{ numero: string }>> {
  const u = await exigirRol("dueno");
  const e = Id.safeParse(cobroId);
  if (!e.success) return fallo(ERROR);
  try {
    const r = await generarNotaAnulacion(e.data, u.id);
    refrescar(r.proyectoId);
    return exito({ numero: r.numero });
  } catch (err) {
    const codigo = codigoDe(err);
    if (codigo === "COBRO_NO_EXISTE") return fallo("Ese cobro no existe.");
    if (codigo === "NOTA_NO_APLICA") return fallo("La nota solo aplica a un cobro anulado que ya tenía recibo.");
    if (codigo === "PDF_OCUPADO") return fallo("El servidor está generando otro PDF. Intenta de nuevo en unos segundos.");
    console.error("generarNotaDeAnulacion", e.data, err);
    return fallo("No se pudo generar la nota. Intenta de nuevo.");
  }
}
```

- [ ] **Step 5: Comentario de tipos de evento** — en `prisma/schema.prisma`, en el comentario sobre `Evento.tipo`, agregar al final de la lista: `| recibo_generado | nota_anulacion`. (Solo comentario: no genera migración.)

- [ ] **Step 6: Tests en verde**

Run: `PROSPECTOS_TEST_DB=1 npx vitest run tests/recibos-acciones.test.ts tests/cobros.test.ts tests/recibos.test.ts && npx tsc --noEmit`
Expected: PASS todo.

- [ ] **Step 7: Commit**

```bash
git add src/acciones prisma/schema.prisma tests/recibos-acciones.test.ts tests/cobros.test.ts
git commit -F - <<'EOF'
feat(recibos): acciones de generar, avisar por WhatsApp y anular con nota

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 6: Ruta de descarga `/recibos/[archivo]`

**Files:**
- Create: `src/app/recibos/[archivo]/route.ts`
- Modify: `next.config.ts` (cabecera `noindex` para `/recibos/`)
- Test: `tests/recibos-ruta.test.ts`

**Interfaces:**
- Consumes: `sesionActual` de `@/lib/sesion`; `ARCHIVO_RECIBO` de `@/lib/recibos-contrato`; `rutaDocumento` de `@/lib/recibos`.
- Produces: `GET /recibos/R-2026-0001.pdf` y `GET /recibos/R-2026-0001-A.pdf` → `200 application/pdf` (`inline`) solo para `dueno`. La pieza 5 ampliará el permiso a la sesión de cliente del `clienteId` correcto: el cobro ya se busca por número para que ese chequeo tenga dónde ir.

- [ ] **Step 1: Tests que fallan** — crear `tests/recibos-ruta.test.ts`:

```ts
import { vi } from "vitest";
vi.mock("@/lib/sesion", async () => {
  const { sesionFalsa } = await import("./ayuda-sesion");
  return { COOKIE_SESION: "pr_sesion", DIAS_SESION: 30, sesionActual: async () => sesionFalsa.actual };
});

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, sembrarCliente, sembrarProyecto } from "./ayuda-db";
import { sesionFalsa } from "./ayuda-sesion";
import { rutaDocumento } from "@/lib/recibos";
import { GET } from "@/app/recibos/[archivo]/route";

const pedir = (archivo: string) => GET(new Request(`http://prueba.test/recibos/${archivo}`), { params: Promise.resolve({ archivo }) });
function guardar(nombre: string, contenido: string) { const r = rutaDocumento(nombre); mkdirSync(path.dirname(r), { recursive: true }); writeFileSync(r, contenido); }

describe.runIf(DB_HABILITADA)("GET /recibos/[archivo]", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  beforeAll(async () => {
    await limpiarBase();
    rmSync(path.join(process.env.PROSPECTOS_DIR_ARCHIVOS!, "recibos"), { recursive: true, force: true });
    ids = await sembrarBasico();
    const c = await sembrarCliente();
    const p = await sembrarProyecto(c.id, ids.nichoId);
    const base = { proyectoId: p.id, concepto: "extra", monto: "10.00", vence: "2026-09-01", pagadoEn: new Date(), reciboGeneradoEn: new Date() };
    await prisma.cobro.create({ data: { ...base, detalle: "Con archivo", reciboNumero: "R-2026-0001" } });
    await prisma.cobro.create({ data: { ...base, detalle: "Sin archivo", reciboNumero: "R-2026-0002" } });
    await prisma.cobro.create({ data: { ...base, detalle: "Anulado con nota", reciboNumero: "R-2026-0003", anuladoEn: new Date(), anuladoMotivo: "x", notaAnulacionEn: new Date() } });
    guardar("R-2026-0001", "%PDF-uno");
    guardar("R-2026-0003", "%PDF-tres");
    guardar("R-2026-0003-A", "%PDF-nota");
    guardar("R-2026-0001-A", "%PDF-huerfano"); // archivo suelto: la base no sabe de esa nota
  });
  beforeEach(() => { sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" }; });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("sin sesion manda a /entrar; el prospectador recibe 403", async () => {
    sesionFalsa.actual = null;
    const sin = await pedir("R-2026-0001.pdf");
    expect(sin.status).toBe(307);
    expect(sin.headers.get("location")).toBe("/entrar");
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
    expect((await pedir("R-2026-0001.pdf")).status).toBe(403);
  });

  it("el dueno descarga el recibo y la nota, sin cache", async () => {
    const r = await pedir("R-2026-0001.pdf");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("content-disposition")).toBe('inline; filename="R-2026-0001.pdf"');
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(await r.text()).toBe("%PDF-uno");
    const n = await pedir("R-2026-0003-A.pdf");
    expect(n.status).toBe(200);
    expect(await n.text()).toBe("%PDF-nota");
  });

  it("404 para nombres raros, numeros que no existen, archivos que faltan y notas que la base no conoce", async () => {
    for (const archivo of ["..%2F..%2Fetc%2Fpasswd", "R-2026-1.pdf", "R-2026-0001", "R-2026-0001.pdf.txt", "R-2026-9999.pdf", "R-2026-0002.pdf", "R-2026-0001-A.pdf"]) {
      expect((await pedir(archivo)).status, archivo).toBe(404);
    }
  });
});
```

- [ ] **Step 2: Correrlo y ver que falla**

Run: `PROSPECTOS_TEST_DB=1 npx vitest run tests/recibos-ruta.test.ts`
Expected: FAIL — no existe la ruta.

- [ ] **Step 3: La ruta** — crear `src/app/recibos/[archivo]/route.ts`:

```ts
import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/db";
import { sesionActual } from "@/lib/sesion";
import { ARCHIVO_RECIBO } from "@/lib/recibos-contrato";
import { rutaDocumento } from "@/lib/recibos";

const SIN_CACHE = { "cache-control": "private, no-store", "x-robots-tag": "noindex" };
const noEncontrado = (texto = "No encontrado") => new Response(texto, { status: 404, headers: SIN_CACHE });

// /recibos/R-2026-0001.pdf y /recibos/R-2026-0001-A.pdf. Solo el dueno; en la pieza 5 tambien
// la sesion de cliente del clienteId correcto (por eso el cobro se busca por numero).
export async function GET(_req: Request, ctx: { params: Promise<{ archivo: string }> }) {
  const u = await sesionActual();
  // Location relativa: detras del proxy de Apache, la URL de la peticion es la de 127.0.0.1.
  if (!u) return new Response(null, { status: 307, headers: { location: "/entrar", ...SIN_CACHE } });
  if (u.rol !== "dueno") return new Response("No tienes permiso para ver recibos.", { status: 403, headers: SIN_CACHE });
  const { archivo } = await ctx.params;
  const m = ARCHIVO_RECIBO.exec(archivo);
  if (!m) return noEncontrado();
  const numero = m[1];
  const esNota = Boolean(m[3]);
  const cobro = await prisma.cobro.findFirst({ where: { reciboNumero: numero }, select: { notaAnulacionEn: true } });
  if (!cobro || (esNota && !cobro.notaAnulacionEn)) return noEncontrado();
  try {
    const bytes = await readFile(rutaDocumento(esNota ? `${numero}-A` : numero));
    return new Response(bytes, { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${archivo}"`, ...SIN_CACHE } });
  } catch {
    // Un recibo emitido no se regenera: si el archivo no esta, se dice y se revisa a mano.
    console.error("recibo sin archivo en disco", archivo);
    return noEncontrado("Recibo no disponible: el archivo no está en el servidor.");
  }
}
```

- [ ] **Step 4: Cabecera en `next.config.ts`** — debajo de la entrada de `/p/:path*`:

```ts
      // Los recibos son privados: que ningun buscador guarde ni la redireccion.
      { source: "/recibos/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
```

- [ ] **Step 5: Tests en verde**

Run: `PROSPECTOS_TEST_DB=1 npx vitest run tests/recibos-ruta.test.ts && npx tsc --noEmit`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add "src/app/recibos" next.config.ts tests/recibos-ruta.test.ts
git commit -F - <<'EOF'
feat(recibos): ruta de descarga solo para el dueno

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 7: Pantalla — botones de recibo en la fila de cobro, y recorrido a 390 px

**Files:**
- Create: `src/componentes/AccionesRecibo.tsx`, `scripts/verificar-flujo-recibos.mts`
- Modify: `src/lib/proyectos.ts:10,68-71` (`CobroFila`), `src/componentes/TabCobros.tsx`, `src/app/(panel)/proyectos/[id]/page.tsx`, `src/app/globals.css`
- Test: `tests/clientes-proyectos.test.ts` (un test nuevo de `fichaProyecto`); recorrido real con `scripts/verificar-flujo-recibos.mts`

**Interfaces:**
- Consumes: `generarReciboDeCobro`, `avisarRecibo`, `generarNotaDeAnulacion` (tarea 5); ruta `/recibos/<numero>.pdf` (tarea 6); `faltantesEmisor` (tarea 2); `leerEmisor` de `@/lib/configuracion`.
- Produces: `CobroFila` gana `reciboNumero: string` y `notaAnulacion: boolean`; `<TabCobros … emisorListo={boolean} />`; `<AccionesRecibo cobro={CobroFila} emisorListo={boolean} onAnular={() => void} />`.

**Criterios de la pantalla** (salen de la pasada de investigación del 17-sep; aplican a todo lo que se toque aquí):
- La acción lenta (3–10 s) avisa **en el propio botón**: «Generando recibo…», con `aria-disabled` (no `disabled`, que tira el foco) y un guardia contra el doble toque.
- **Sin actualización optimista**: el número lo decide el servidor y el PDF puede fallar. Se espera la respuesta.
- El resultado y el error salen **en la misma fila**, en una región `role="status"` que existe desde el principio; nada de avisos flotantes.
- Anular es serio y poco frecuente: confirmación **en línea** que dice qué va a pasar, con botones que se explican solos («Anular cobro» / «Conservar»).
- Botones de 36 px de alto como mínimo (clase `mini`), sin que nada se corte a 390 px.

- [ ] **Step 1: Test que falla** — en `tests/clientes-proyectos.test.ts`: agregar `sembrarProyecto` al import de `./ayuda-db` (línea 15), agregar `import { hoyCaracas } from "@/lib/fecha-caracas";` si el archivo no lo trae ya (`fichaProyecto` y `prisma` ya están importados), y dentro del `describe("clientes y proyectos")`:

```ts
  it("fichaProyecto expone el numero de recibo y si ya existe la nota de anulacion", async () => {
    const cl = await sembrarCliente({ nombre: "Hotel Ficha Recibo" });
    const nicho = await prisma.nicho.findFirstOrThrow();
    const p = await sembrarProyecto(cl.id, nicho.id, { estado: "activo" });
    await prisma.cobro.create({ data: { proyectoId: p.id, concepto: "extra", detalle: "A", monto: "10.00", vence: "2026-09-01", pagadoEn: new Date(), reciboNumero: "R-2026-0007", reciboGeneradoEn: new Date() } });
    await prisma.cobro.create({ data: { proyectoId: p.id, concepto: "extra", detalle: "B", monto: "10.00", vence: "2026-09-02", pagadoEn: new Date(), reciboNumero: "R-2026-0008", reciboGeneradoEn: new Date(), anuladoEn: new Date(), anuladoMotivo: "x", notaAnulacionEn: new Date() } });
    await prisma.cobro.create({ data: { proyectoId: p.id, concepto: "extra", detalle: "C", monto: "10.00", vence: "2026-09-03" } });
    const f = await fichaProyecto(p.id, hoyCaracas());
    expect(f!.cobros.map((c) => [c.detalle, c.reciboNumero, c.notaAnulacion])).toEqual([["A", "R-2026-0007", false], ["B", "R-2026-0008", true], ["C", "", false]]);
  });
```

Run: `PROSPECTOS_TEST_DB=1 npx vitest run tests/clientes-proyectos.test.ts`
Expected: FAIL — `reciboNumero` es `undefined`.

- [ ] **Step 2: `CobroFila`** — en `src/lib/proyectos.ts`:

Línea 10, el tipo queda:
```ts
export type CobroFila = { id: number; concepto: Concepto; detalle: string; monto: number; vence: string; estado: EstadoCobro; pagadoEn: Date | null; canal: string; referencia: string; nota: string; anuladoMotivo: string; recordadoHoy: boolean; reciboNumero: string; notaAnulacion: boolean };
```
y en el `map` de `fichaProyecto` (líneas 68-71) agregar al objeto: `reciboNumero: c.reciboNumero, notaAnulacion: c.notaAnulacionEn !== null,`.

Run: `PROSPECTOS_TEST_DB=1 npx vitest run tests/clientes-proyectos.test.ts`
Expected: PASS.

- [ ] **Step 3: `AccionesRecibo`** — crear `src/componentes/AccionesRecibo.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CobroFila } from "@/lib/proyectos";
import { generarReciboDeCobro, avisarRecibo, generarNotaDeAnulacion } from "@/acciones/recibos";

type Accion = "recibo" | "aviso" | "nota";

// Botones de recibo de una fila de cobro pagado (o anulado que tuvo recibo).
// Generar tarda 3-10 s (lanza Chromium): el propio boton lo dice, no hay respuesta optimista
// (el numero lo decide el servidor) y el resultado sale aqui mismo, en la fila.
export function AccionesRecibo({ cobro, emisorListo, onAnular }: { cobro: CobroFila; emisorListo: boolean; onAnular: () => void }) {
  const [enCurso, setEnCurso] = useState<Accion | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [enlaceManual, setEnlaceManual] = useState("");
  const [, empezar] = useTransition();
  const router = useRouter();
  const anulado = cobro.estado === "anulado";

  // aria-disabled no bloquea el clic: el guardia es este.
  const correr = (accion: Accion, tarea: () => Promise<void>) => {
    if (enCurso) return;
    setEnCurso(accion); setAviso(null);
    empezar(async () => { try { await tarea(); } finally { setEnCurso(null); } });
  };

  const generar = () => correr("recibo", async () => {
    const r = await generarReciboDeCobro(cobro.id);
    if (r.ok) { setAviso({ tipo: "ok", texto: `Recibo ${r.datos.numero} generado.` }); router.refresh(); } else setAviso({ tipo: "error", texto: r.mensaje });
  });

  const avisar = () => correr("aviso", async () => {
    const r = await avisarRecibo(cobro.id);
    if (!r.ok) { setAviso({ tipo: "error", texto: r.mensaje }); return; }
    let copiado = false;
    try { await navigator.clipboard.writeText(r.datos.mensaje); copiado = true; } catch { /* sin permiso de portapapeles: el mensaje igual va en el enlace */ }
    if (!r.datos.href) { setAviso({ tipo: copiado ? "ok" : "error", texto: copiado ? "Mensaje copiado. El cliente no tiene WhatsApp cargado: pégalo donde le escribas." : "El cliente no tiene WhatsApp cargado. Agrégalo en su ficha." }); return; }
    // window.open despues de un await suele volver bloqueado en el telefono: queda el enlace a mano.
    // Sin "noopener" en las opciones: con el, window.open devuelve null SIEMPRE y no se sabria si abrio.
    const ventana = window.open(r.datos.href, "_blank");
    if (ventana) ventana.opener = null;
    setEnlaceManual(ventana ? "" : r.datos.href);
    setAviso({ tipo: "ok", texto: `${copiado ? "Mensaje copiado. " : ""}Adjunta el PDF del recibo desde el teléfono.` });
    router.refresh();
  });

  const generarNota = () => correr("nota", async () => {
    const r = await generarNotaDeAnulacion(cobro.id);
    if (r.ok) { setAviso({ tipo: "ok", texto: `Nota ${r.datos.numero} generada.` }); router.refresh(); } else setAviso({ tipo: "error", texto: r.mensaje });
  });

  return (
    <div style={{ gridColumn: "1 / -1" }}>
      <div className="fila-botones">
        {!cobro.reciboNumero && !anulado && (emisorListo
          ? <button type="button" className="boton mini boton--primario" aria-disabled={enCurso !== null} onClick={generar}>{enCurso === "recibo" ? "Generando recibo…" : "Generar recibo"}</button>
          : <Link className="boton mini" href="/ajustes">Completa tus datos en Ajustes</Link>)}
        {cobro.reciboNumero && <a className={`boton mini${anulado ? "" : " boton--primario"}`} href={`/recibos/${cobro.reciboNumero}.pdf`} target="_blank" rel="noopener">{anulado ? `Recibo ${cobro.reciboNumero} (anulado)` : `Recibo ${cobro.reciboNumero}`}</a>}
        {cobro.reciboNumero && !anulado && <button type="button" className="boton mini" aria-disabled={enCurso !== null} onClick={avisar}>{enCurso === "aviso" ? "Abriendo WhatsApp…" : "Enviar por WhatsApp"}</button>}
        {anulado && cobro.reciboNumero && (cobro.notaAnulacion
          ? <a className="boton mini" href={`/recibos/${cobro.reciboNumero}-A.pdf`} target="_blank" rel="noopener">Nota de anulación</a>
          : <button type="button" className="boton mini boton--primario" aria-disabled={enCurso !== null} onClick={generarNota}>{enCurso === "nota" ? "Generando nota…" : "Generar nota de anulación"}</button>)}
        {!anulado && <button type="button" className="boton mini boton--peligro" aria-disabled={enCurso !== null} onClick={() => { if (!enCurso) onAnular(); }}>Anular</button>}
      </div>
      {!cobro.reciboNumero && !anulado && !emisorListo && <p className="suave">Para generar recibos hacen falta tu nombre, RIF, WhatsApp y correo.</p>}
      {/* La region existe desde el principio: un lector de pantalla solo anuncia cambios dentro de una region que ya estaba. */}
      <p role="status" className={`estado-fila${aviso?.tipo === "error" ? " estado-fila--error" : ""}`}>{aviso?.texto ?? ""}</p>
      {enlaceManual && <p className="suave">El navegador bloqueó la ventana: <a href={enlaceManual} target="_blank" rel="noopener">Abrir WhatsApp</a></p>}
    </div>
  );
}
```

- [ ] **Step 4: `TabCobros`** — en `src/componentes/TabCobros.tsx`:

1. Agregar el import: `import { AccionesRecibo } from "@/componentes/AccionesRecibo";`
2. La firma queda: `export function TabCobros({ proyectoId, cobros, hoy, emisorListo }: { proyectoId: number; cobros: CobroFila[]; hoy: string; emisorListo: boolean }) {`
3. En el botón «Anular» de los cobros pendientes (línea 40), limpiar el motivo al abrir: `onClick={() => { setMotivo(""); setAbierto({ id: c.id, modo: "anular" }); }}`.
4. Justo después del bloque de botones de los pendientes (después de la línea 42, antes del bloque `enlaceManual`), agregar:

```tsx
          {(c.estado === "pagado" || (c.estado === "anulado" && c.reciboNumero !== "")) && (
            <AccionesRecibo cobro={c} emisorListo={emisorListo} onAnular={() => { setMotivo(""); setError(""); setAbierto({ id: c.id, modo: "anular" }); }} />
          )}
```

5. Reemplazar el bloque de anular (líneas 56-61) por la confirmación que dice qué va a pasar:

```tsx
          {abierto?.id === c.id && abierto.modo === "anular" && (
            <div className="pregunta" style={{ gridColumn: "1 / -1" }}>
              <p style={{ margin: "0 0 8px" }}>
                {c.reciboNumero
                  ? `Este cobro ya tiene el recibo ${c.reciboNumero}. Al anularlo se genera la nota ${c.reciboNumero}-A; el PDF del recibo no se borra.`
                  : c.pagadoEn ? "Este cobro ya está pagado. Al anularlo deja de contar como cobrado; el rastro del pago no se borra." : "El cobro queda anulado con su motivo; no se borra."}
              </p>
              <label className="campo"><span>Motivo</span><input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} autoFocus /></label>
              <div className="fila-botones"><button className="boton boton--peligro" disabled={pendiente} onClick={() => correr(() => anularCobro(c.id, motivo))}>{pendiente ? "Anulando…" : "Anular cobro"}</button><button className="boton" onClick={() => setAbierto(null)}>Conservar</button></div>
              {error && <p className="error" role="alert">{error}</p>}
            </div>
          )}
```

6. Arreglo de paso en `recordar` (línea 23), mismo archivo y mismo patrón: `window.open(url, "_blank", "noopener")` devuelve `null` **siempre** (así lo define HTML), de modo que hoy el aviso «El navegador bloqueó la ventana» sale aunque WhatsApp sí haya abierto. Reemplazar esa línea por:

```tsx
      const ventana = window.open(r.datos.href, "_blank");
      if (ventana) ventana.opener = null;
```

7. Como el error de anular ahora sale dentro de su panel, el `error` del final de la sección (línea 75) solo debe mostrarse cuando no hay un panel de anular abierto: cambiarlo a `{error && abierto?.modo !== "anular" && <p className="error" role="alert">{error}</p>}`.

- [ ] **Step 5: La página** — en `src/app/(panel)/proyectos/[id]/page.tsx`:

1. Imports: cambiar `import { leerTarifaHora } from "@/lib/configuracion";` por `import { leerTarifaHora, leerEmisor } from "@/lib/configuracion";` y agregar `import { faltantesEmisor } from "@/lib/recibos-contrato";`.
2. En `TEXTO_EVENTO` agregar: `recibo_generado: "Recibo generado", nota_anulacion: "Nota de anulación"`.
3. La carga queda: `const [p, tarifa, emisor] = await Promise.all([Number.isInteger(id) ? fichaProyecto(id, hoy) : null, leerTarifaHora(), leerEmisor()]);`
4. La pestaña: `{t === "cobros" && <TabCobros proyectoId={p.id} cobros={p.cobros} hoy={hoy} emisorListo={faltantesEmisor(emisor).length === 0} />}`

- [ ] **Step 6: CSS** — al final de `src/app/globals.css`:

```css
/* Pieza 4: recibos. El boton en curso usa aria-disabled (no pierde el foco); el clic lo frena el componente. */
.boton[aria-disabled="true"] { opacity: .6; cursor: progress; }
.estado-fila { margin: 8px 0 0; font-size: 14px; color: var(--verde); min-height: 0; }
.estado-fila:empty { display: none; }
.estado-fila--error { color: var(--rojo); }
```

Run: `npx tsc --noEmit`
Expected: sin salida.

- [ ] **Step 7: El recorrido** — crear `scripts/verificar-flujo-recibos.mts`. **Se niega a correr contra una base que no sea la de tests**: cada recibo gasta un correlativo.

```ts
// scripts/verificar-flujo-recibos.mts — recorrido a 390 px: pagar, generar recibo, bajarlo, avisar, anular, bajar la nota.
// SOLO contra un servidor de desarrollo con la base de tests: generar un recibo gasta un correlativo real.
// Uso (desde el clon de prueba, con su next dev en 3014):
//   set -a; . ~/.config/prospectos/env; set +a
//   DATABASE_URL="$TEST_DATABASE_URL" BASE_URL=http://127.0.0.1:3014 npx tsx scripts/verificar-flujo-recibos.mts < archivo-con-el-pin
import { readFileSync, mkdirSync } from "node:fs";
import bcrypt from "bcryptjs";
import { chromium } from "playwright";
import { prisma } from "../src/lib/db";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3014";
if (!(process.env.DATABASE_URL ?? "").includes("prospectos_test")) { console.error("ALTO: DATABASE_URL no es la base de tests. Este recorrido genera recibos y gastaria correlativos reales."); process.exit(2); }
if (/neracosu\.com/.test(BASE)) { console.error("ALTO: BASE_URL apunta al dominio publico. Usa el servidor de desarrollo del clon."); process.exit(2); }
const pin = readFileSync(0, "utf8").trim();
mkdirSync("capturas", { recursive: true });
const errores: string[] = [];
const marca = `(PRUEBA) ${Date.now()}`;
let usuarioCreado = 0, clienteId = 0;

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
ctx.on("page", (nueva) => { if (nueva.url().includes("wa.me") || nueva.url() === "about:blank") nueva.close().catch(() => {}); }); // la ventana de WhatsApp no interesa
const pg = await ctx.newPage();
pg.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
pg.on("console", (m) => { if (m.type() === "error") errores.push(`console: ${m.text()}`); });
try {
  // Sembrado minimo en la base de tests
  if (!(await prisma.usuario.findFirst({ where: { rol: "dueno", activo: true } }))) usuarioCreado = (await prisma.usuario.create({ data: { nombre: marca, rol: "dueno", pinHash: await bcrypt.hash(pin, 10) } })).id;
  const nicho = (await prisma.nicho.findFirst()) ?? (await prisma.nicho.create({ data: { slug: "hoteles", nombre: "Hoteles", mensajeInicial: "{nombre} {enlace}", mensajeSeguimiento: "{nombre} {enlace}" } }));
  await prisma.configuracion.upsert({ where: { clave: "datos_emisor" }, update: {}, create: { clave: "datos_emisor", valor: JSON.stringify({ nombre: "Neri Colón", rif: "V-12345678-9", whatsapp: "584121234567", email: "neri@ejemplo.test" }) } });
  const cliente = await prisma.cliente.create({ data: { nombre: `Hotel ${marca}`, whatsapp: "584120000000", rif: "J-40123456-7", codigo: `prueba-${Date.now()}` } });
  clienteId = cliente.id;
  const proyecto = await prisma.proyecto.create({ data: { clienteId, nichoId: nicho.id, nombre: "PMS de prueba", pagoUnico: "0", mensualidad: "100.00", fechaInicio: "2026-09-01", estado: "activo" } });
  await prisma.cobro.create({ data: { proyectoId: proyecto.id, concepto: "extra", detalle: "Módulo de reportes", monto: "350.00", vence: "2026-09-10" } });

  await pg.goto(`${BASE}/entrar`);
  for (const d of pin) await pg.getByRole("button", { name: d, exact: true }).click();
  await pg.waitForURL(/\/hoy$/);

  // 1. Pagar
  await pg.goto(`${BASE}/proyectos/${proyecto.id}`);
  await pg.getByRole("button", { name: "Marcar pagado" }).click();
  await pg.getByLabel("Referencia").fill("Z-998877");
  await pg.getByRole("button", { name: "Confirmar" }).click();
  await pg.getByRole("button", { name: "Generar recibo" }).waitFor();
  await pg.screenshot({ path: "capturas/p4-01-pagado.png", fullPage: true });

  // 2. Generar: el boton avisa mientras trabaja y despues aparece el enlace
  await pg.getByRole("button", { name: "Generar recibo" }).click();
  await pg.getByRole("button", { name: "Generando recibo…" }).waitFor({ timeout: 5_000 }).catch(() => errores.push("el boton no dijo «Generando recibo…»"));
  await pg.screenshot({ path: "capturas/p4-02-generando.png", fullPage: true });
  const enlace = pg.getByRole("link", { name: /^Recibo R-\d{4}-\d{4,}$/ });
  await enlace.waitFor({ timeout: 90_000 });
  await pg.screenshot({ path: "capturas/p4-03-con-recibo.png", fullPage: true });
  const numero = ((await enlace.textContent()) ?? "").replace("Recibo ", "");

  // 3. Descargar con la sesion del navegador
  const pdf = await ctx.request.get(`${BASE}/recibos/${numero}.pdf`);
  if (pdf.status() !== 200) errores.push(`descarga del recibo: ${pdf.status()}`);
  if (pdf.headers()["content-type"] !== "application/pdf") errores.push("la descarga no es application/pdf");
  if ((await pdf.body()).length < 10_000) errores.push("el PDF pesa menos de 10 KB");
  const sinSesion = await (await b.newContext()).request.get(`${BASE}/recibos/${numero}.pdf`, { maxRedirects: 0 });
  if (sinSesion.status() !== 307) errores.push(`sin sesion deberia ser 307, fue ${sinSesion.status()}`);

  // 4. Avisar por WhatsApp
  await pg.getByRole("button", { name: "Enviar por WhatsApp" }).click();
  await pg.getByText("Adjunta el PDF del recibo desde el teléfono.").waitFor();
  await pg.screenshot({ path: "capturas/p4-04-avisado.png", fullPage: true });
  if ((await prisma.evento.count({ where: { proyectoId: proyecto.id, tipo: "aviso_cliente", texto: `recibo ${numero}` } })) !== 1) errores.push("no quedo el evento aviso_cliente");

  // 5. Anular: la confirmacion dice que pasa con el recibo
  await pg.getByRole("button", { name: "Anular", exact: true }).click();
  await pg.getByText(`se genera la nota ${numero}-A`).waitFor();
  await pg.getByLabel("Motivo").fill("Recorrido de prueba");
  await pg.screenshot({ path: "capturas/p4-05-confirmar-anular.png", fullPage: true });
  await pg.getByRole("button", { name: "Anular cobro" }).click();
  await pg.getByRole("link", { name: "Nota de anulación" }).waitFor({ timeout: 90_000 });
  await pg.screenshot({ path: "capturas/p4-06-anulado.png", fullPage: true });
  const nota = await ctx.request.get(`${BASE}/recibos/${numero}-A.pdf`);
  if (nota.status() !== 200 || (await nota.body()).length < 10_000) errores.push("la nota de anulacion no se descarga bien");
  if ((await ctx.request.get(`${BASE}/recibos/${numero}.pdf`)).status() !== 200) errores.push("anular borro el PDF del recibo");

  // 6. Nada se sale de la pantalla a 390 px
  const ancho = await pg.evaluate(() => document.documentElement.scrollWidth);
  if (ancho > 390) errores.push(`hay scroll horizontal: ${ancho}px`);
} catch (e) {
  errores.push(`excepcion: ${(e as Error).message}`);
  await pg.screenshot({ path: "capturas/p4-error.png", fullPage: true }).catch(() => {});
} finally {
  await b.close();
  if (clienteId) {
    const pids = (await prisma.proyecto.findMany({ where: { clienteId }, select: { id: true } })).map((p) => p.id);
    await prisma.evento.deleteMany({ where: { proyectoId: { in: pids } } });
    await prisma.cobro.deleteMany({ where: { proyectoId: { in: pids } } });
    await prisma.proyecto.deleteMany({ where: { id: { in: pids } } });
    await prisma.cliente.delete({ where: { id: clienteId } });
  }
  if (usuarioCreado) await prisma.usuario.delete({ where: { id: usuarioCreado } });
  await prisma.$disconnect();
}
console.log(errores.length ? `FALLO:\n- ${errores.join("\n- ")}` : "PASS: recorrido de recibos sin errores");
process.exit(errores.length ? 1 : 0);
```

- [ ] **Step 8: Correr el recorrido contra un servidor de desarrollo del clon** (nunca `next dev` en el docroot). `S` es el directorio scratchpad de la sesión.

```bash
# 1. Commit de trabajo para que el clon lo vea
cd /home/neracosu/public_html/prospectos.neracosu.com && git add -A && git commit -F - <<'EOF'
feat(recibos): botones de recibo en la fila de cobro y recorrido a 390 px

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
# 2. Clon fuera del docroot (si ya existe: git -C ~/dev-clon-prospectos pull)
git clone --branch pieza-4 /home/neracosu/public_html/prospectos.neracosu.com ~/dev-clon-prospectos
cd ~/dev-clon-prospectos && npm ci 2>&1 | tail -2        # SIN NODE_ENV=production
# 3. Servidor de desarrollo con la base de tests y archivos en el scratchpad
set -a; . ~/.config/prospectos/env; set +a
export DATABASE_URL="$TEST_DATABASE_URL" PROSPECTOS_DIR_ARCHIVOS="$S/archivos-dev"
node_modules/.bin/next dev -p 3014 -H 127.0.0.1 > "$S/dev.log" 2>&1 &
echo $! > "$S/dev.pid"
# 4. Esperar a que responda y correr (PIN de pruebas por archivo, nunca en la linea de comandos)
until curl -s -o /dev/null http://127.0.0.1:3014/entrar; do sleep 2; done
printf '123456' > "$S/pin"; chmod 600 "$S/pin"
BASE_URL=http://127.0.0.1:3014 npx tsx scripts/verificar-flujo-recibos.mts < "$S/pin"
```
Expected: `PASS: recorrido de recibos sin errores` y seis capturas en `~/dev-clon-prospectos/capturas/p4-*.png`.

- [ ] **Step 9: Mirar las capturas** (con la herramienta de lectura de imágenes) `p4-01` a `p4-06`: que ningún botón se corte ni se monte a 390 px, que «Generando recibo…» se lea, que la confirmación de anular diga el número de la nota, y que en `p4-06` se vean «Recibo R-… (anulado)» y «Nota de anulación». Abrir además el PDF generado en `$S/archivos-dev/recibos/<año>/` y comprobar que es el diseño de la plantilla (una hoja, «Recibo de pago», monto en verde). Corregir lo que se vea mal, volver a hacer commit, `git -C ~/dev-clon-prospectos pull` y repetir el paso 8.4.

- [ ] **Step 10: Apagar el servidor de desarrollo — solo por PID**

```bash
kill "$(cat "$S/dev.pid")"; sleep 2
pgrep -af dev-clon-prospectos    # no debe quedar nada; si queda un hijo, matarlo por SU pid
pm2 list                          # los cinco siguen online, sin reinicios nuevos
rm -f "$S/pin" "$S/dev.pid"; rm -rf "$S/archivos-dev"
```

- [ ] **Step 11: Suite completa**

Run: `cd /home/neracosu/public_html/prospectos.neracosu.com && npm test && npm run test:db && npx tsc --noEmit`
Expected: todo PASS. (El commit ya se hizo en el paso 8.1; si hubo correcciones, quedaron en commits propios.)

---

### Task 8: Despliegue, verificación en producción y documentación

**Solo el controlador. Un build a la vez en todo el servidor.**

**Files:**
- Modify: `CLAUDE.md`, `docs/superpowers/specs/2026-09-16-recibos-design.md`
- Memoria: `~/.claude/projects/-home-neracosu-public-html-prospectos-neracosu-com/memory/estado-prospectos.md`

- [ ] **Step 1: Fusionar**

```bash
cd /home/neracosu/public_html/prospectos.neracosu.com && git status --short && git switch main && git merge --ff-only pieza-4
```
Expected: `Fast-forward`.

- [ ] **Step 2: Antes de compilar**

```bash
pm2 list                                  # los cinco online; anotar el contador de reinicios de prospectos
pgrep -af "next build" || echo "ningun build en curso"
set -a; . ~/.config/prospectos/env; set +a
npx prisma migrate deploy | tail -2       # "No pending migrations" (se aplico en la tarea 1)
```

- [ ] **Step 3: Build y reinicio** (sin `NODE_ENV=production` exportado; sin `npm ci`: no cambiaron dependencias)

```bash
npm run build 2>&1 | tail -15
pm2 restart prospectos
```
Expected: el build lista `/recibos/[archivo]` como ruta dinámica y termina sin errores. Si falla con un error de `node:` en edge, algún import se coló en la cadena de `instrumentation`: `npx vitest run tests/instrumentation-grafo.test.ts` dice cuál.

- [ ] **Step 4: Verificar producción — sin generar ningún recibo**

```bash
sleep 5; pm2 list                                         # prospectos online, contador = anterior + 1
pm2 logs prospectos --lines 30 --nostream | grep -E "\[mensualidades\]|\[revision\]"   # las dos lineas del arranque
curl -s -o /dev/null -L -w "%{http_code} %{url_effective}\n" https://prospectos.neracosu.com/          # 200 .../entrar
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://prospectos.neracosu.com/recibos/R-2026-0001.pdf   # 307 .../entrar
curl -s -o /dev/null -w "%{http_code}\n" https://prospectos.neracosu.com/plantillas/recibo.html          # 404: el repo no se sirve
curl -s -o /dev/null -w "%{http_code}\n" https://prospectos.neracosu.com/p/no-existe/pdf                 # 404: el motor de propuestas sigue en pie
```
Y comprobar que el correlativo real sigue intacto:

```bash
cat > "$S/contar.mts" <<'EOF'
import { prisma } from "/home/neracosu/public_html/prospectos.neracosu.com/src/lib/db";
console.log({ correlativos: await prisma.correlativo.count(), cobrosConRecibo: await prisma.cobro.count({ where: { reciboNumero: { not: "" } } }) });
await prisma.$disconnect();
EOF
npx tsx "$S/contar.mts"; rm -f "$S/contar.mts"
```
Expected: `{ correlativos: 0, cobrosConRecibo: 0 }`. El R-…-0001 real lo genera Neri con su primer cobro pagado.

- [ ] **Step 5: `CLAUDE.md`** — en la tabla de piezas, la fila 4 pasa a `Implementada (17-sep)`; la línea de estado pasa a «piezas 1, 3, 2 y 4 construidas y en producción»; «Siguiente pieza» pasa a **5 (Portal del cliente)**; en «Scripts útiles» agregar `scripts/verificar-flujo-recibos.mts`. Y agregar, después del bloque de la pieza 2, este bloque:

```markdown
- **Pieza 4 (Recibos de pago) en producción:** en `/proyectos/[id]` → Cobros, cada cobro pagado tiene
  **Generar recibo** (la primera vez; después es el enlace `Recibo R-AAAA-NNNN`), **Enviar por WhatsApp**
  (copia el mensaje, abre WhatsApp y deja `aviso_cliente`; el PDF lo adjunta Neri desde el teléfono) y
  **Anular**. Descarga: `/recibos/R-2026-0001.pdf` y `/recibos/R-2026-0001-A.pdf`, solo `dueno` (sin
  sesión 307 a `/entrar`, otro rol 403). Archivos en `~/prospectos-archivos/recibos/<año>/`, `600`.
  - **Un recibo emitido no cambia.** Con `Cobro.reciboNumero` lleno nunca se regenera, aunque cambie
    `plantillas/recibo.html`. Si el archivo no está en disco la descarga da 404: no se regenera solo.
  - **El número se asigna con la fila de `Correlativo` bloqueada (`FOR UPDATE`) y el PDF se genera
    dentro de esa misma transacción** (`src/lib/recibos.ts`): si Chromium falla, se deshace y el número
    sigue libre. La transacción puede durar hasta ~60 s; es a propósito. El año es el del día de Caracas
    en que se genera, no el del pago.
  - **Desde esta pieza un cobro pagado sí se anula** (con motivo). Si tenía recibo se genera la nota
    `R-…-A` y el PDF original no se borra; si Chromium falla al anular, el cobro queda anulado igual y la
    fila ofrece «Generar nota de anulación» (`Cobro.notaAnulacionEn`). Una mensualidad anulada no la
    recrea el cron: el mes ya existe.
  - ⚠️ **`scripts/verificar-flujo-recibos.mts` nunca contra producción**: cada recibo gasta un
    correlativo real. El script se niega si `DATABASE_URL` no dice `prospectos_test` o si `BASE_URL` es
    el dominio. Se corre contra `next dev -p 3014` del clon `~/dev-clon-prospectos` con la base de tests.
  - El motor de PDF es `src/lib/pdf.ts` (una sola fila de Chromium para propuestas y recibos). `pdf.ts`
    y `recibos.ts` usan `node:`: fuera de la cadena de `src/instrumentation.ts`.
    `tests/instrumentation-grafo.test.ts` recorre esa cadena y falla si alguien cuela un `node:`.
  - Las fuentes del recibo son locales (`plantillas/fuentes/`, OFL) y se incrustan como `data:`: el
    recibo no depende de Google Fonts. El título es «Recibo de pago», **nunca «factura»**.
```

En la advertencia existente sobre la cadena de `instrumentation`, agregar al final: «Desde la pieza 4 lo vigila `tests/instrumentation-grafo.test.ts`.»

- [ ] **Step 6: Spec** — en `docs/superpowers/specs/2026-09-16-recibos-design.md`, cambiar el estado de la cabecera a `**Estado:** implementada el 17-sep (plan: docs/superpowers/plans/2026-09-17-pieza-4-recibos.md).` y agregar al final una sección `## Desviaciones al implementar` con las seis decisiones de la sección «Decisiones de este plan que no están en la spec», una línea cada una.

- [ ] **Step 7: Commit de la documentación**

```bash
git add CLAUDE.md docs && git commit -F - <<'EOF'
docs: pieza 4 en produccion, trampas nuevas (correlativo, e2e solo en tests) y desviaciones de la spec

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
git branch -d pieza-4
```

- [ ] **Step 8: Memoria** — actualizar `estado-prospectos.md`: piezas 1, 3, 2 y 4 en producción; cuántos commits lleva `main` por delante de `origin/main` (`git log --oneline origin/main..main | wc -l`; el push lo hace Neri); siguiente pieza 5; pendiente nuevo de Neri: **llenar sus datos de emisor en Ajustes** (sin RIF, WhatsApp y correo no se genera ningún recibo) y generar el primer recibo real.

- [ ] **Step 9: Decirle a Neri** qué quedó, con la salida de `pm2 list` y de los `curl` a la vista, y los dos pendientes suyos: completar los datos del emisor y hacer el push.
