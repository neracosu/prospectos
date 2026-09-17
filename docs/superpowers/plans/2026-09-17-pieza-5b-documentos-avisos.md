# Pieza 5b — Portal del cliente: documentos y avisos — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Neri suba documentos a un proyecto y el cliente los vea y baje desde su portal, y que al cumplir un hito, publicar una versión o registrar un cobro tenga a un toque el «Avisar al cliente» por WhatsApp con mensajes que él edita en Ajustes.

**Architecture:** Mismos cimientos de la 5a. Los archivos viven fuera del docroot (`~/prospectos-archivos/documentos/<clienteId>/<uuid>.<ext>`), se validan **por contenido** y se sirven solo por `/c/documentos/<id>` con sesión del cliente correcto o del dueño. La subida es un `POST` a un route handler del panel (no una Server Action: su tope de 1 MB es global y subirlo abriría la entrada del portal a cuerpos de 11 MB). Los avisos son plantillas en `Configuracion` que pasan por una sola función pura, `armarMensaje`, que quita el renglón del `{enlace}` cuando el cliente no tiene acceso.

**Tech Stack:** Node 20 · Next 15.5 · Prisma 6.19 (MariaDB) · zod 4 · vitest 4 · Playwright 1.63. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-09-16-portal-cliente-design.md` (secciones «Documentos», «Avisos», pestaña Documentos, «Reglas», «Pruebas»). Leer también el `CLAUDE.md` del proyecto (bloque «Pieza 5a») y, como referencia de estilo, `src/lib/recibos.ts`, `src/app/recibos/[archivo]/route.ts`, `tests/recibos-ruta.test.ts`, `src/acciones/versiones.ts`, `src/componentes/TabVersiones.tsx`.

**Diseño visual:** prototipo estático con el CSS real en `capturas/p5b-prototipo/` (`portal.html`, `panel.html`, `nuevo.css`, capturas a 390 px). Las clases y los textos de las tareas 6 y 7 salen de ahí, tal cual.

## Global Constraints

- **Solo `dueno` sube y quita documentos.** Límite **10 MB** (`TAMANO_MAXIMO = 10 * 1024 * 1024`). Solo **PDF, JPG, PNG y ZIP**, **validado por contenido (firma de bytes), nunca por extensión ni por el `type` que mande el navegador**.
- Archivo en disco: `<PROSPECTOS_DIR_ARCHIVOS>/documentos/<clienteId>/<uuid>.<ext>`, permisos `600` (directorios `700`), **fuera del docroot**. En la base se guarda la ruta **relativa** (`documentos/<clienteId>/<uuid>.<ext>`). El nombre original del archivo **no** se usa para la ruta.
- ⚠️ **`<dir>/documentos/` es el segundo directorio del servidor que NO se regenera** (el primero es `recibos/`). Mismas defensas: `dirArchivos()` se niega a usar `/home/neracosu/prospectos-archivos` fuera de `NODE_ENV=production`; `tests/preparar-entorno.ts` ya fuerza un directorio temporal. Ningún test ni script escribe en el directorio real.
- Se sirven **solo** por `GET /c/documentos/<id>`: sesión de cliente del `clienteId` dueño del proyecto, o sesión `dueno`. **Lo ajeno, lo quitado y lo inexistente responden el mismo 404** (nunca 403 para un cliente). `prospectador` → 403. Respuesta con `cache-control: private, no-store` y `x-robots-tag: noindex`.
- **Quitar no borra:** `Documento.quitadoEn`; el cliente deja de verlo, el archivo queda en disco. Nada de esta pieza borra filas ni archivos.
- **El portal solo lee.** Ninguna Server Action nueva acepta sesión de cliente. Toda página o ruta bajo `src/app/c/` exige la sesión (`exigirCliente` / `sesionCliente`); toda consulta del portal vive en `src/lib/portal.ts` con `select` campo por campo y el `clienteId` de la sesión.
- **No se registra qué documento abrió el cliente** (la spec solo registra `portal_abierto`).
- **Avisos:** tres plantillas en `Configuracion`: `mensaje_aviso_hito`, `mensaje_aviso_version`, `mensaje_aviso_cobro`. Variables: `{cliente}` `{proyecto}` `{hito}` `{version}` `{cambios}` `{concepto}` `{monto}` `{vence}` `{enlace}`. Cada aviso deja `Evento` `aviso_cliente`. Sin correo ni push. Sin WhatsApp del cliente no se avisa ni se marca nada.
- **Regla del `{enlace}`:** el renglón de la plantilla que lleva `{enlace}` **se quita entero** cuando el cliente no tiene acceso activo al portal; si la plantilla es de un solo renglón (o todos llevan `{enlace}`), se conserva y `{enlace}` queda vacío, como hoy.
- A los clientes se les trata de **usted** en los mensajes de WhatsApp (así están los que ya existen); **dentro del portal se tutea**. Español de Venezuela, sin jerga. «Recibo de pago», nunca «factura». Comentarios en el código **sin acentos**.
- ⚠️ **La cadena de imports de `src/instrumentation.ts` no puede tocar ningún `node:`** (`tests/instrumentation-grafo.test.ts`). `src/lib/archivos.ts` y `src/lib/documentos.ts` usan `node:`: nada de esa cadena los importa.
- ⚠️ **Migraciones solo con `prisma migrate deploy`**; nunca `migrate dev` ni `db push`. La migración se escribe a mano.
- ⚠️ **Procesos: matar solo por PID.** Nunca `next dev`/`next build` en el docroot salvo el build del despliegue (solo el controlador). Los subagentes verifican con `npx tsc --noEmit` y los tests.
- ⚠️ **Nunca cargar `~/.config/prospectos/env` para correr tests**: `PROSPECTOS_TEST_DB=1 npx vitest run <archivo>` encuentra la base de tests solo.
- Tests contra `neracosu_prospectos_test`. `npm test` y `npm run test:db` en verde antes de fusionar.
- Toda acción `"use server"`: sesión fuera del try/catch, zod, sin helpers exportados, devuelve `Resultado`.
- 390 px primero. Commits por heredoc (`git commit -F -`) con la línea `Co-Authored-By` del modelo que escribe.
- Todo el trabajo va en la rama **`pieza-5b`**, creada desde `main` por el controlador.

## Decisiones de este plan que no están en la spec

1. **Subida por route handler, no por Server Action** (`POST /proyectos/<id>/documentos`). El tope de cuerpo de las Server Actions es global; subirlo a 11 MB se lo abriría también a `entrarPortal`, que no pide sesión. El handler valida sesión `dueno` **antes** de leer el cuerpo y comprueba el origen (`Origin` contra `X-Forwarded-Host`/`Host`), que es lo que una Server Action hace sola.
2. **`Documento.quitadoEn`**: la spec no dice cómo se corrige un archivo subido por error (por ejemplo, al proyecto de otro cliente). Se quita sin borrar, como todo en la app.
3. **El aviso de cobro es para los cobros que Neri registra a mano (`cuota` y `extra`) mientras estén sin pagar.** Las mensualidades ya tienen «Recordar» y los pagos ya tienen «Enviar por WhatsApp» del recibo: un tercer botón ahí sería ruido.
4. **`Pendiente.avisadoEn` y `Cobro.avisadoEn`** (como `Version.avisadoEn`): el botón «Avisar al cliente» no depende de un estado de pantalla que se pierde al refrescar, y no se avisa dos veces lo mismo. Desmarcar un hito le borra el `avisadoEn`.
5. **`{cambios}`, `{concepto}` y `{vence}`** se suman a las variables de la spec: el aviso de versión ya listaba los cambios, y un cobro sin concepto ni fecha no se entiende.
6. **Los textos de fábrica del recordatorio y del vencido ganan el renglón del portal** (`Puede ver el detalle en su portal: {enlace}`). Con la regla del `{enlace}` ya no queda colgando. Producción no tiene ningún mensaje guardado en `Configuracion` (verificado el 17-sep), así que aplica de una vez; Neri lo cambia en Ajustes si no lo quiere.
7. **Sesión vencida del cliente** (pendiente m3 de la 5a): los enlaces del portal a documentos y recibos llevan `?c=<código>`. Sin ninguna sesión y con un `c` bien formado, la ruta redirige a `/c/<c>` (el PIN del portal) en vez del teclado del panel. El código lo trae quien pide: no se revela nada.
8. **Vigía de guardas del portal** (pendiente m7): un test recorre `src/app/c/**/{page.tsx,route.ts}` y falla si alguno no exige la sesión.
9. **`guardarUsuario` y `restablecerPin` solo tocan cuentas del panel** (pendiente m4): una cuenta `cliente` no se puede convertir en `prospectador` fabricando el formulario.

## Mapa de archivos

| Archivo | Qué es | Tarea |
|---|---|---|
| `prisma/schema.prisma`, `prisma/migrations/20260919090000_documentos_avisos/migration.sql` | `Documento`, `Pendiente.avisadoEn`, `Cobro.avisadoEn` | 1 |
| `tests/ayuda-db.ts`, `tests/esquema.test.ts` | limpieza y test del esquema | 1 |
| `src/lib/plantilla-mensaje.ts` | + `armarMensaje` (pura) | 2 |
| `src/lib/avisos-contrato.ts` | textos de fábrica y los tres mensajes de aviso (pura) | 2 |
| `src/lib/documentos-contrato.ts` | tipos por firma, tamaños, nombres, `Content-Disposition` (pura) | 2 |
| `src/lib/origen.ts` | `mismoOrigen(headers)` (pura) | 2 |
| `src/lib/archivos.ts` | `dirArchivos()` y `escribirAtomico()` compartidos (`node:`) | 3 |
| `src/lib/documentos.ts` | guardar, quitar, listar y leer para servir (`node:` + base) | 3 |
| `src/app/(panel)/proyectos/[id]/documentos/route.ts` | `POST` de subida | 4 |
| `src/acciones/documentos.ts` | `quitarDocumentoDeProyecto` | 4 |
| `src/app/c/documentos/[id]/route.ts` | `GET` que sirve el archivo | 4 |
| `src/app/recibos/[archivo]/route.ts` | + `?c=` para la sesión vencida | 4 |
| `src/lib/configuracion.ts`, `src/lib/mensajes-cobro.ts` | claves y textos de fábrica; `mensajeDeCobro` por `armarMensaje` | 5 |
| `src/acciones/pendientes.ts`, `cobros.ts`, `versiones.ts`, `ajustes.ts` | `avisarHito`, `avisarCobro`, plantilla de versión, `guardarMensajesAviso`, m4 | 5 |
| `src/lib/portal.ts`, `src/app/c/[codigo]/proyecto/[id]/page.tsx`, `src/app/c/portal.css` | pestaña Documentos del cliente | 6 |
| `tests/portal-guardas.test.ts` | vigía de guardas | 6 |
| `src/componentes/TabDocumentos.tsx`, `TabPendientes.tsx`, `TabCobros.tsx`, `FormularioAjustesCobros.tsx`, `src/lib/proyectos.ts`, páginas del panel, `src/app/globals.css` | pantallas del panel | 7 |
| `scripts/verificar-flujo-portal.mts` | recorrido ampliado | 7 |

---

### Task 1: Esquema — `Documento` y los dos `avisadoEn`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260919090000_documentos_avisos/migration.sql`
- Modify: `tests/ayuda-db.ts` (función `limpiarBase`)
- Test: `tests/esquema.test.ts`

**Interfaces:**
- Produces: modelo Prisma `Documento { id, proyectoId, nombre, archivo (único), tipoMime, tamano, usuarioId?, subidoEn, quitadoEn? }`; `Pendiente.avisadoEn: Date | null`; `Cobro.avisadoEn: Date | null`; relaciones `Proyecto.documentos`, `Usuario.documentos`.

- [ ] **Step 1: Test que falla** — al final del `describe` de `tests/esquema.test.ts`, antes del cierre:

```ts
  it("un documento cuelga de un proyecto, su archivo es unico, y hitos y cobros nacen sin avisar", async () => {
    const { nichoId, usuarioId } = await sembrarBasico();
    const c = await sembrarCliente();
    const p = await sembrarProyecto(c.id, nichoId);
    const datos = { proyectoId: p.id, nombre: "Manual", archivo: `documentos/${c.id}/11111111-1111-4111-8111-111111111111.pdf`, tipoMime: "application/pdf", tamano: 1234, usuarioId };
    const d = await prisma.documento.create({ data: datos });
    expect(d.quitadoEn).toBeNull();
    expect(d.subidoEn).toBeInstanceOf(Date);
    await expect(prisma.documento.create({ data: datos })).rejects.toThrow(/Unique/);
    const h = await prisma.pendiente.create({ data: { proyectoId: p.id, texto: "Hito" } });
    const k = await prisma.cobro.create({ data: { proyectoId: p.id, concepto: "extra", monto: "10.00", vence: "2026-10-01" } });
    expect(h.avisadoEn).toBeNull();
    expect(k.avisadoEn).toBeNull();
  });
```

- [ ] **Step 2: Verlo fallar**

Run: `PROSPECTOS_TEST_DB=1 npx vitest run tests/esquema.test.ts`
Expected: FAIL — `tsc`/vitest no conoce `prisma.documento` (o «Unknown argument»).

- [ ] **Step 3: Esquema.** En `prisma/schema.prisma`:

En `model Usuario`, debajo de `revisiones Revision[]`:
```prisma
  documentos Documento[]
```
En `model Proyecto`, debajo de `eventos              Evento[]`:
```prisma
  documentos           Documento[]
```
En `model Pendiente`, debajo de `fechaEstimada  String?`:
```prisma
  // Pieza 5b: cuando se le aviso al cliente que el hito quedo listo. Desmarcar el hito lo borra.
  avisadoEn      DateTime?
```
En `model Cobro`, debajo de `notaAnulacionEn  DateTime?`:
```prisma
  // Pieza 5b: cuando se le aviso al cliente de este cobro (solo cuota y extra; ver acciones/cobros.ts).
  avisadoEn        DateTime?
```
En el comentario de tipos de `model Evento`, agregar al final de la lista: `| documento_subido | documento_quitado`.

Modelo nuevo, después de `model Version { … }` y su `model Cambio`:
```prisma
// Pieza 5b: archivos que Neri sube a un proyecto y el cliente ve en su portal.
model Documento {
  id         Int       @id @default(autoincrement())
  proyectoId Int
  proyecto   Proyecto  @relation(fields: [proyectoId], references: [id])
  // Lo que ve el cliente. El nombre original del archivo no se guarda ni se usa para la ruta.
  nombre     String
  // Ruta RELATIVA a PROSPECTOS_DIR_ARCHIVOS: documentos/<clienteId>/<uuid>.<ext>
  archivo    String    @unique
  tipoMime   String
  tamano     Int
  usuarioId  Int?
  usuario    Usuario?  @relation(fields: [usuarioId], references: [id])
  subidoEn   DateTime  @default(now())
  // Quitar no borra: el cliente deja de verlo y el archivo queda en disco.
  quitadoEn  DateTime?

  @@index([proyectoId, subidoEn])
}
```

- [ ] **Step 4: Migración a mano** — `prisma/migrations/20260919090000_documentos_avisos/migration.sql`:

```sql
-- AlterTable
ALTER TABLE `Pendiente` ADD COLUMN `avisadoEn` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `Cobro` ADD COLUMN `avisadoEn` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `Documento` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `proyectoId` INTEGER NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `archivo` VARCHAR(191) NOT NULL,
    `tipoMime` VARCHAR(191) NOT NULL,
    `tamano` INTEGER NOT NULL,
    `usuarioId` INTEGER NULL,
    `subidoEn` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `quitadoEn` DATETIME(3) NULL,

    UNIQUE INDEX `Documento_archivo_key`(`archivo`),
    INDEX `Documento_proyectoId_subidoEn_idx`(`proyectoId`, `subidoEn`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Documento` ADD CONSTRAINT `Documento_proyectoId_fkey` FOREIGN KEY (`proyectoId`) REFERENCES `Proyecto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Documento` ADD CONSTRAINT `Documento_usuarioId_fkey` FOREIGN KEY (`usuarioId`) REFERENCES `Usuario`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 5: Aplicarla SOLO a la base de tests y regenerar el cliente.** El env se carga dentro de la subshell entre paréntesis, exactamente así, y nada más corre ahí:

```bash
( set -a; . ~/.config/prospectos/env; set +a; DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy 2>&1 | grep -vi "mysql://" | tail -5 )
npx prisma generate | tail -2
```
Expected: `1 migration … applied` (o «All migrations have been successfully applied») y `Generated Prisma Client`.

- [ ] **Step 6: Comprobar que la migración escrita a mano coincide con el esquema.**

```bash
( set -a; . ~/.config/prospectos/env; set +a; npx prisma migrate diff --from-url "$TEST_DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script 2>&1 | grep -vi "mysql://" | grep -iE "Documento|avisadoEn" ; echo "fin del diff" )
```
Expected: solo `fin del diff`. (El diff completo siempre trae `MODIFY … JSON` de las columnas Json: es el desencuentro conocido de Prisma con MariaDB, ver `CLAUDE.md`; no es de esta tarea. Lo que no puede aparecer es nada de `Documento` ni de `avisadoEn`.)

- [ ] **Step 7: `limpiarBase`** — en `tests/ayuda-db.ts`, la línea nueva va justo antes de `await prisma.proyecto.deleteMany();`:

```ts
  await prisma.documento.deleteMany(); // cuelga del proyecto y del usuario (pieza 5b)
```

- [ ] **Step 8: Verde**

Run: `PROSPECTOS_TEST_DB=1 npx vitest run tests/esquema.test.ts` → PASS. `npx tsc --noEmit` → limpio.

- [ ] **Step 9: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260919090000_documentos_avisos/migration.sql tests/ayuda-db.ts tests/esquema.test.ts
git commit -F - <<'EOF'
feat(documentos): esquema - Documento, y avisadoEn en hitos y cobros
EOF
```
(con tu línea `Co-Authored-By` al final del mensaje).

- [ ] **Step 10 (solo el controlador): aplicar la migración a producción.** Es aditiva (tabla nueva y dos columnas anulables): el código que corre hoy no la nota. `pm2 list` antes; no se reinicia nada.

```bash
( set -a; . ~/.config/prospectos/env; set +a; npx prisma migrate deploy 2>&1 | grep -vi "mysql://" | tail -4 )
curl -s -o /dev/null -w "%{http_code}\n" https://prospectos.neracosu.com/entrar
```

---

### Task 2: Contratos puros — mensajes, tipos de archivo y origen

**Files:**
- Modify: `src/lib/plantilla-mensaje.ts`
- Create: `src/lib/avisos-contrato.ts`, `src/lib/documentos-contrato.ts`, `src/lib/origen.ts`
- Test: `tests/plantilla-mensaje.test.ts` (existe: se le agrega), `tests/avisos-contrato.test.ts`, `tests/documentos-contrato.test.ts`, `tests/origen.test.ts`

**Interfaces:**
- Produces:
  - `armarMensaje(plantilla: string, valores: Record<string, string>): string`
  - `AVISO_POR_DEFECTO: { hito: string; version: string; cobro: string }`, `VARIABLE_OBLIGATORIA: { hito: "{hito}"; version: "{version}"; cobro: "{monto}" }`, `RENGLON_PORTAL_COBRO: string`
  - `quienRecibe(c: { nombre: string; contactoNombre: string }): string`
  - `mensajeAvisoHito(plantilla, d: { cliente; proyecto; enlace; hito }): string`
  - `mensajeAvisoVersion(plantilla, d: { cliente; proyecto; enlace; version; cambios: { tipo: string; texto: string }[] }): string`
  - `mensajeAvisoCobro(plantilla, d: { cliente; proyecto; enlace; concepto: Concepto; detalle: string; monto: number; vence: string }): string`
  - `TAMANO_MAXIMO`, `TIPOS`, `type TipoMime`, `ACEPTA`, `detectarTipo(bytes: Uint8Array): TipoMime | null`, `nombreVisible(propuesto: string, nombreArchivo: string): string`, `tamanoLegible(bytes: number): string`, `descripcionDocumento(d: { tipoMime: string; tamano: number }): string`, `siglaDocumento(tipoMime: string): string`, `problemaDeArchivo(a: { nombre: string; tamano: number }): string | null`, `disposicion(tipoMime: string, nombre: string): string`, `RUTA_DOCUMENTO: RegExp`
  - `mismoOrigen(headers: Headers): boolean`

- [ ] **Step 1: Tests que fallan.**

Agregar a `tests/plantilla-mensaje.test.ts` (importar `armarMensaje` junto a `rellenar`):

```ts
describe("armarMensaje", () => {
  const plantilla = "Buenas, {cliente}.\nYa quedó listo: {hito}.\nPuede verlo en su portal: {enlace}\nCualquier duda me escribe.";
  it("con enlace rellena todo", () => {
    expect(armarMensaje(plantilla, { cliente: "Ana", hito: "Recepción", enlace: "https://x.test/c/abc" }))
      .toBe("Buenas, Ana.\nYa quedó listo: Recepción.\nPuede verlo en su portal: https://x.test/c/abc\nCualquier duda me escribe.");
  });
  it("sin enlace quita ENTERO el renglon que lo lleva: no queda una frase colgando", () => {
    expect(armarMensaje(plantilla, { cliente: "Ana", hito: "Recepción", enlace: "" }))
      .toBe("Buenas, Ana.\nYa quedó listo: Recepción.\nCualquier duda me escribe.");
  });
  it("una plantilla de un solo renglon no se queda vacia: conserva el renglon y {enlace} sale vacio", () => {
    expect(armarMensaje("Hola {cliente}, mire {enlace}", { cliente: "Ana", enlace: "" })).toBe("Hola Ana, mire");
    expect(armarMensaje("{enlace}\n   ", { enlace: "" })).toBe("");
  });
  it("colapsa espacios de mas, recorta cada renglon y no deja mas de un renglon vacio seguido", () => {
    expect(armarMensaje("a  b   \n\n\n\nc {enlace}\nd", { enlace: "" })).toBe("a b\n\nd");
  });
  it("un valor con varios renglones entra tal cual y un valor con llaves no se vuelve a rellenar", () => {
    expect(armarMensaje("Cambios:\n{cambios}", { cambios: "• uno\n• {enlace}", enlace: "https://x" })).toBe("Cambios:\n• uno\n• {enlace}");
  });
});
```

`tests/avisos-contrato.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { AVISO_POR_DEFECTO, VARIABLE_OBLIGATORIA, RENGLON_PORTAL_COBRO, quienRecibe, mensajeAvisoHito, mensajeAvisoVersion, mensajeAvisoCobro } from "@/lib/avisos-contrato";

const base = { cliente: "Ana", proyecto: "PMS Hotel" };

describe("avisos al cliente", () => {
  it("los textos de fabrica llevan su variable obligatoria y el enlace en su propio renglon", () => {
    for (const tipo of ["hito", "version", "cobro"] as const) {
      expect(AVISO_POR_DEFECTO[tipo]).toContain(VARIABLE_OBLIGATORIA[tipo]);
      const conEnlace = AVISO_POR_DEFECTO[tipo].split("\n").filter((l) => l.includes("{enlace}"));
      expect(conEnlace).toHaveLength(1);
      expect(AVISO_POR_DEFECTO[tipo]).not.toMatch(/factura/i);
    }
    expect(RENGLON_PORTAL_COBRO).toContain("{enlace}");
    expect(RENGLON_PORTAL_COBRO).not.toContain("\n");
  });
  it("quienRecibe prefiere el contacto y cae al nombre del negocio", () => {
    expect(quienRecibe({ nombre: "Hotel X", contactoNombre: "Ana" })).toBe("Ana");
    expect(quienRecibe({ nombre: "Hotel X", contactoNombre: "" })).toBe("Hotel X");
  });
  it("hito: con y sin acceso al portal", () => {
    expect(mensajeAvisoHito(AVISO_POR_DEFECTO.hito, { ...base, enlace: "https://x.test/c/abc", hito: "Recepción y habitaciones" }))
      .toBe("Buenas, Ana. Ya quedó listo en PMS Hotel: Recepción y habitaciones.\nPuede ver el avance en su portal: https://x.test/c/abc\nCualquier duda me escribe por aquí.");
    expect(mensajeAvisoHito(AVISO_POR_DEFECTO.hito, { ...base, enlace: "", hito: "Recepción y habitaciones" }))
      .toBe("Buenas, Ana. Ya quedó listo en PMS Hotel: Recepción y habitaciones.\nCualquier duda me escribe por aquí.");
  });
  it("version: lista los cambios con su etiqueta, uno por renglon", () => {
    const cambios = [{ tipo: "nuevo", texto: "Reporte semanal" }, { tipo: "arreglo", texto: "Cierre de caja" }, { tipo: "raro", texto: "Otro" }];
    expect(mensajeAvisoVersion(AVISO_POR_DEFECTO.version, { ...base, enlace: "", version: "1.10.0", cambios }))
      .toBe("Buenas, Ana. Publicamos la versión 1.10.0 de PMS Hotel:\n• Nuevo: Reporte semanal\n• Arreglo: Cierre de caja\n• raro: Otro\nCualquier duda me escribe por aquí.");
  });
  it("cobro: concepto con su detalle, monto y fecha como se escriben en Venezuela", () => {
    expect(mensajeAvisoCobro(AVISO_POR_DEFECTO.cobro, { ...base, enlace: "https://x.test/c/abc", concepto: "extra", detalle: "Módulo de reportes", monto: 150.5, vence: "2026-10-05" }))
      .toBe("Buenas, Ana. Registré un cobro de PMS Hotel: Extra (Módulo de reportes) por $150,50, que vence el 05/10/2026.\nPuede verlo en su portal: https://x.test/c/abc\nCualquier duda me escribe por aquí.");
  });
});
```

`tests/documentos-contrato.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { TAMANO_MAXIMO, ACEPTA, RUTA_DOCUMENTO, detectarTipo, nombreVisible, tamanoLegible, descripcionDocumento, siglaDocumento, problemaDeArchivo, disposicion } from "@/lib/documentos-contrato";

const bytes = (...n: number[]) => new Uint8Array([...n, 0, 0, 0, 0, 0, 0, 0, 0]);

describe("documentos (contrato)", () => {
  it("el tipo sale de la firma de bytes, no del nombre", () => {
    expect(detectarTipo(new TextEncoder().encode("%PDF-1.7 resto"))).toBe("application/pdf");
    expect(detectarTipo(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(detectarTipo(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(detectarTipo(bytes(0x50, 0x4b, 0x03, 0x04))).toBe("application/zip");
    expect(detectarTipo(bytes(0x50, 0x4b, 0x05, 0x06))).toBe("application/zip"); // zip vacio
    expect(detectarTipo(bytes(0x4d, 0x5a, 0x90))).toBeNull();                     // .exe
    expect(detectarTipo(new TextEncoder().encode("<html><script>"))).toBeNull();
    expect(detectarTipo(new TextEncoder().encode(" %PDF-1.7"))).toBeNull();       // la firma va en el byte 0
    expect(detectarTipo(new Uint8Array())).toBeNull();
  });
  it("nombreVisible: lo que escribio Neri, o el nombre del archivo sin ruta ni extension; nunca vacio ni con caracteres de control", () => {
    expect(nombreVisible("  Contrato   firmado ", "x.pdf")).toBe("Contrato firmado");
    expect(nombreVisible("", "C:\\fotos\\plano piso 2.final.JPG")).toBe("plano piso 2.final");
    expect(nombreVisible("", "../../etc/passwd")).toBe("passwd");
    expect(nombreVisible("a\u0000b\u001fc\u007f", "x.pdf")).toBe("abc");
    expect(nombreVisible("", ".pdf")).toBe("Documento");
    expect(nombreVisible("x".repeat(200), "x.pdf")).toHaveLength(120);
  });
  it("tamanos como se leen en Venezuela (coma decimal)", () => {
    expect(tamanoLegible(900)).toBe("900 bytes");
    expect(tamanoLegible(860_160)).toBe("840 KB");
    expect(tamanoLegible(1_258_291)).toBe("1,2 MB");
    expect(tamanoLegible(TAMANO_MAXIMO)).toBe("10,0 MB");
    expect(descripcionDocumento({ tipoMime: "application/pdf", tamano: 1_258_291 })).toBe("PDF de 1,2 MB");
    expect(descripcionDocumento({ tipoMime: "image/png", tamano: 860_160 })).toBe("Imagen de 840 KB");
    expect(descripcionDocumento({ tipoMime: "otra/cosa", tamano: 10 })).toBe("Archivo de 10 bytes");
    expect(siglaDocumento("image/jpeg")).toBe("JPG");
    expect(siglaDocumento("otra/cosa")).toBe("DOC");
  });
  it("problemaDeArchivo: lo que se le dice a Neri ANTES de subir (por extension y peso; el servidor valida el contenido)", () => {
    expect(problemaDeArchivo({ nombre: "manual.PDF", tamano: 1000 })).toBeNull();
    expect(problemaDeArchivo({ nombre: "foto.jpeg", tamano: TAMANO_MAXIMO })).toBeNull();
    expect(problemaDeArchivo({ nombre: "video.mp4", tamano: 1000 })).toBe("Solo se aceptan PDF, JPG, PNG o ZIP.");
    expect(problemaDeArchivo({ nombre: "grande.zip", tamano: TAMANO_MAXIMO + 1 })).toBe("Pesa 10,0 MB y el máximo es 10 MB.");
    expect(problemaDeArchivo({ nombre: "video.mp4", tamano: 50_541_363 })).toBe("Pesa 48,2 MB y el máximo es 10 MB. Solo se aceptan PDF, JPG, PNG o ZIP.");
    expect(problemaDeArchivo({ nombre: "vacio.pdf", tamano: 0 })).toBe("El archivo está vacío.");
    expect(ACEPTA).toContain(".zip");
  });
  it("disposicion: PDF e imagenes en linea, ZIP descarga; el nombre no puede romper la cabecera", () => {
    expect(disposicion("application/pdf", "Manual de recepción")).toBe(`inline; filename="Manual de recepcion.pdf"; filename*=UTF-8''Manual%20de%20recepci%C3%B3n.pdf`);
    expect(disposicion("application/zip", "Respaldo.zip")).toBe(`attachment; filename="Respaldo.zip"; filename*=UTF-8''Respaldo.zip`);
    expect(disposicion("image/png", 'a"b\r\nc;d')).toBe(`inline; filename="a_b__c_d.png"; filename*=UTF-8''a%22b%0D%0Ac%3Bd.png`);
    expect(disposicion("otra/cosa", "x")).toBe(`attachment; filename="x"; filename*=UTF-8''x`);
  });
  it("RUTA_DOCUMENTO solo acepta documentos/<numero>/<uuid>.<ext conocida>", () => {
    expect(RUTA_DOCUMENTO.test("documentos/12/11111111-1111-4111-8111-111111111111.pdf")).toBe(true);
    for (const mala of ["documentos/12/../../recibos/2026/R-2026-0001.pdf", "/etc/passwd", "documentos/12/x.pdf", "documentos/a/11111111-1111-4111-8111-111111111111.pdf", "documentos/12/11111111-1111-4111-8111-111111111111.exe", "recibos/12/11111111-1111-4111-8111-111111111111.pdf"]) {
      expect(RUTA_DOCUMENTO.test(mala), mala).toBe(false);
    }
  });
});
```

`tests/origen.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mismoOrigen } from "@/lib/origen";

const h = (o: Record<string, string>) => new Headers(o);

describe("mismoOrigen", () => {
  it("detras de Apache manda X-Forwarded-Host; sin proxy, Host", () => {
    expect(mismoOrigen(h({ origin: "https://prospectos.neracosu.com", "x-forwarded-host": "prospectos.neracosu.com", host: "127.0.0.1:3013" }))).toBe(true);
    expect(mismoOrigen(h({ origin: "http://127.0.0.1:3014", host: "127.0.0.1:3014" }))).toBe(true);
  });
  it("otro sitio, sin Origin, o un Origin que no es URL: no", () => {
    expect(mismoOrigen(h({ origin: "https://malo.test", "x-forwarded-host": "prospectos.neracosu.com", host: "127.0.0.1:3013" }))).toBe(false);
    expect(mismoOrigen(h({ origin: "https://prospectos.neracosu.com.malo.test", "x-forwarded-host": "prospectos.neracosu.com" }))).toBe(false);
    expect(mismoOrigen(h({ host: "prospectos.neracosu.com" }))).toBe(false);
    expect(mismoOrigen(h({ origin: "null", host: "prospectos.neracosu.com" }))).toBe(false);
    expect(mismoOrigen(h({ origin: "https://prospectos.neracosu.com" }))).toBe(false);
  });
  it("si el proxy encadena varios hosts, vale el primero", () => {
    expect(mismoOrigen(h({ origin: "https://prospectos.neracosu.com", "x-forwarded-host": "prospectos.neracosu.com, interno.local" }))).toBe(true);
  });
});
```

- [ ] **Step 2: Verlos fallar**

Run: `npx vitest run tests/plantilla-mensaje.test.ts tests/avisos-contrato.test.ts tests/documentos-contrato.test.ts tests/origen.test.ts`
Expected: FAIL — no existen `armarMensaje` ni los tres módulos.

- [ ] **Step 3: `armarMensaje`** — al final de `src/lib/plantilla-mensaje.ts`:

```ts
// Arma un mensaje de WhatsApp desde una plantilla de Ajustes. El renglon que lleva {enlace} (el portal del
// cliente) se quita ENTERO cuando no hay enlace, para que no quede una frase colgando. Si al quitarlo no
// quedara nada que decir (plantilla de un solo renglon), se conserva y {enlace} sale vacio.
export function armarMensaje(plantilla: string, valores: Record<string, string>): string {
  const renglones = plantilla.split("\n");
  const sinPortal = renglones.filter((r) => !r.includes("{enlace}"));
  const usar = !valores.enlace && sinPortal.some((r) => r.trim() !== "") ? sinPortal : renglones;
  return usar
    .map((r) => rellenar(r, valores).replace(/[^\S\n]{2,}/g, " ").replace(/[^\S\n]+$/gm, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+$/, "");
}
```

- [ ] **Step 4: `src/lib/avisos-contrato.ts`**

```ts
// src/lib/avisos-contrato.ts — los tres avisos al cliente (pieza 5b). Puro: sin base ni node:.
// A los clientes se les trata de usted por WhatsApp, como en los mensajes de cobro.
import { armarMensaje } from "@/lib/plantilla-mensaje";
import { formatoUSD } from "@/lib/dinero";
import { fechaVisible } from "@/lib/fecha-caracas";
import { ETIQUETA_CONCEPTO, type Concepto } from "@/lib/cobros-contrato";
import { ETIQUETA_CAMBIO } from "@/lib/semver-contrato";

// Sin esta variable el aviso no dice de que habla: Ajustes no deja guardarlo.
export const VARIABLE_OBLIGATORIA = { hito: "{hito}", version: "{version}", cobro: "{monto}" } as const;
export type TipoAviso = keyof typeof VARIABLE_OBLIGATORIA;

// {enlace} va SIEMPRE en su propio renglon: armarMensaje lo quita entero si el cliente no tiene acceso.
export const AVISO_POR_DEFECTO: Record<TipoAviso, string> = {
  hito: "Buenas, {cliente}. Ya quedó listo en {proyecto}: {hito}.\nPuede ver el avance en su portal: {enlace}\nCualquier duda me escribe por aquí.",
  version: "Buenas, {cliente}. Publicamos la versión {version} de {proyecto}:\n{cambios}\nPuede verla en su portal: {enlace}\nCualquier duda me escribe por aquí.",
  cobro: "Buenas, {cliente}. Registré un cobro de {proyecto}: {concepto} por {monto}, que vence el {vence}.\nPuede verlo en su portal: {enlace}\nCualquier duda me escribe por aquí.",
};
// Renglon que se les suma a los textos de fabrica del recordatorio y del vencido (src/lib/configuracion.ts).
export const RENGLON_PORTAL_COBRO = "Puede ver el detalle en su portal: {enlace}";

type Base = { cliente: string; proyecto: string; enlace: string };

export function quienRecibe(c: { nombre: string; contactoNombre: string }): string {
  return c.contactoNombre || c.nombre;
}

export function mensajeAvisoHito(plantilla: string, d: Base & { hito: string }): string {
  return armarMensaje(plantilla, { cliente: d.cliente, proyecto: d.proyecto, hito: d.hito, enlace: d.enlace });
}

export function mensajeAvisoVersion(plantilla: string, d: Base & { version: string; cambios: { tipo: string; texto: string }[] }): string {
  const cambios = d.cambios.map((c) => `• ${ETIQUETA_CAMBIO[c.tipo as keyof typeof ETIQUETA_CAMBIO] ?? c.tipo}: ${c.texto}`).join("\n");
  return armarMensaje(plantilla, { cliente: d.cliente, proyecto: d.proyecto, version: d.version, cambios, enlace: d.enlace });
}

export function mensajeAvisoCobro(plantilla: string, d: Base & { concepto: Concepto; detalle: string; monto: number; vence: string }): string {
  const concepto = d.detalle ? `${ETIQUETA_CONCEPTO[d.concepto]} (${d.detalle})` : ETIQUETA_CONCEPTO[d.concepto];
  return armarMensaje(plantilla, { cliente: d.cliente, proyecto: d.proyecto, concepto, monto: formatoUSD(d.monto), vence: fechaVisible(d.vence), enlace: d.enlace });
}
```

- [ ] **Step 5: `src/lib/documentos-contrato.ts`**

```ts
// src/lib/documentos-contrato.ts — reglas de los documentos del cliente (pieza 5b). Puro: lo usan el servidor
// y el navegador. El tipo de un archivo se decide por su FIRMA de bytes; la extension y el type que mande
// el navegador solo sirven para avisarle a Neri antes de subir.
export const TAMANO_MAXIMO = 10 * 1024 * 1024;

export const TIPOS = {
  "application/pdf": { ext: "pdf", sigla: "PDF", etiqueta: "PDF", enLinea: true },
  "image/jpeg": { ext: "jpg", sigla: "JPG", etiqueta: "Imagen", enLinea: true },
  "image/png": { ext: "png", sigla: "PNG", etiqueta: "Imagen", enLinea: true },
  "application/zip": { ext: "zip", sigla: "ZIP", etiqueta: "ZIP", enLinea: false },
} as const;
export type TipoMime = keyof typeof TIPOS;
const esTipo = (mime: string): mime is TipoMime => Object.prototype.hasOwnProperty.call(TIPOS, mime);

export const ACEPTA = ".pdf,.jpg,.jpeg,.png,.zip,application/pdf,image/jpeg,image/png,application/zip";
const EXTENSIONES = /\.(pdf|jpe?g|png|zip)$/i;
// documentos/<clienteId>/<uuid>.<ext>: lo unico que se acepta leer del disco.
export const RUTA_DOCUMENTO = /^documentos\/\d+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png|zip)$/;

const FIRMAS: { mime: TipoMime; bytes: number[] }[] = [
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] },                   // %PDF-
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: "application/zip", bytes: [0x50, 0x4b, 0x03, 0x04] },
  { mime: "application/zip", bytes: [0x50, 0x4b, 0x05, 0x06] },                         // zip vacio
];

export function detectarTipo(bytes: Uint8Array): TipoMime | null {
  for (const f of FIRMAS) if (bytes.length >= f.bytes.length && f.bytes.every((b, i) => bytes[i] === b)) return f.mime;
  return null;
}

// Lo que ve el cliente: lo que escribio Neri o, si no escribio nada, el nombre del archivo sin ruta ni extension.
export function nombreVisible(propuesto: string, nombreArchivo: string): string {
  const limpiar = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  const delArchivo = (nombreArchivo.split(/[\\/]/).pop() ?? "").replace(/\.[^.]*$/, "");
  return (limpiar(propuesto) || limpiar(delArchivo) || "Documento").slice(0, 120);
}

export function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}

export function descripcionDocumento(d: { tipoMime: string; tamano: number }): string {
  return `${esTipo(d.tipoMime) ? TIPOS[d.tipoMime].etiqueta : "Archivo"} de ${tamanoLegible(d.tamano)}`;
}

export function siglaDocumento(tipoMime: string): string {
  return esTipo(tipoMime) ? TIPOS[tipoMime].sigla : "DOC";
}

// Validacion en linea, al elegir el archivo. El servidor repite el peso y decide el tipo por contenido.
export function problemaDeArchivo(a: { nombre: string; tamano: number }): string | null {
  if (a.tamano === 0) return "El archivo está vacío.";
  const problemas: string[] = [];
  if (a.tamano > TAMANO_MAXIMO) problemas.push(`Pesa ${tamanoLegible(a.tamano)} y el máximo es 10 MB.`);
  if (!EXTENSIONES.test(a.nombre)) problemas.push("Solo se aceptan PDF, JPG, PNG o ZIP.");
  return problemas.length ? problemas.join(" ") : null;
}

// Content-Disposition. El nombre lo escribio una persona: aqui no puede romper la cabecera.
export function disposicion(tipoMime: string, nombre: string): string {
  const tipo = esTipo(tipoMime) ? TIPOS[tipoMime] : null;
  const conExt = tipo && !nombre.toLowerCase().endsWith(`.${tipo.ext}`) ? `${nombre}.${tipo.ext}` : nombre;
  const ascii = conExt.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w .-]/g, "_");
  return `${tipo?.enLinea ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(conExt)}`;
}
```

- [ ] **Step 6: `src/lib/origen.ts`**

```ts
// src/lib/origen.ts — la comprobacion de origen que Next hace sola en las Server Actions, para los route
// handlers que escriben (la subida de documentos). Detras de Apache el host publico viene en X-Forwarded-Host.
export function mismoOrigen(headers: Headers): boolean {
  const origen = headers.get("origin");
  const esperado = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "").split(",")[0].trim();
  if (!origen || !esperado) return false;
  try { return new URL(origen).host === esperado; } catch { return false; }
}
```

- [ ] **Step 7: Verde**

Run: `npx vitest run tests/plantilla-mensaje.test.ts tests/avisos-contrato.test.ts tests/documentos-contrato.test.ts tests/origen.test.ts` → PASS. `npx tsc --noEmit` → limpio. `npx vitest run tests/instrumentation-grafo.test.ts` → PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/plantilla-mensaje.ts src/lib/avisos-contrato.ts src/lib/documentos-contrato.ts src/lib/origen.ts tests/plantilla-mensaje.test.ts tests/avisos-contrato.test.ts tests/documentos-contrato.test.ts tests/origen.test.ts
git commit -F - <<'EOF'
feat(documentos): contratos puros - armarMensaje, avisos al cliente, tipos de archivo por firma y origen
EOF
```

---

### Task 3: Archivos en disco — `archivos.ts` y `documentos.ts`

**Files:**
- Create: `src/lib/archivos.ts`, `src/lib/documentos.ts`
- Modify: `src/lib/recibos.ts` (usa `dirArchivos` compartido), `src/lib/pdf.ts` (reexporta `escribirAtomico`)
- Test: `tests/documentos.test.ts`

**Interfaces:**
- Consumes (Task 1): `prisma.documento`. (Task 2): `TAMANO_MAXIMO`, `TIPOS`, `RUTA_DOCUMENTO`, `detectarTipo`, `nombreVisible` de `@/lib/documentos-contrato`.
- Produces:
  - `src/lib/archivos.ts`: `DIR_PRODUCCION`, `dirArchivos(): string` (lanza `DIR_ARCHIVOS_DE_PRODUCCION` fuera de producción), `escribirAtomico(salida: string, bytes: Uint8Array): Promise<void>`
  - `src/lib/documentos.ts`:
    - `type DocumentoFila = { id: number; nombre: string; tipoMime: string; tamano: number; subidoEn: Date }`
    - `rutaDeDocumento(archivo: string): string` — absoluta; lanza `DOCUMENTO_INVALIDO`
    - `guardarDocumento(d: { proyectoId: number; nombre: string; nombreArchivo: string; bytes: Uint8Array; usuarioId: number }): Promise<{ id: number }>` — lanza `ARCHIVO_VACIO` | `ARCHIVO_GRANDE` | `TIPO_NO_PERMITIDO` | `PROYECTO_NO_EXISTE`
    - `quitarDocumento(id: number, usuarioId: number): Promise<{ proyectoId: number; quitado: boolean }>` — lanza `DOCUMENTO_NO_EXISTE`
    - `documentosDeProyecto(proyectoId: number): Promise<DocumentoFila[]>` — solo vigentes, el más nuevo primero
    - `documentoParaServir(id: number): Promise<{ nombre: string; tipoMime: string; archivo: string; quitado: boolean; clienteId: number } | null>`

- [ ] **Step 1: Test que falla** — `tests/documentos.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, sembrarCliente, sembrarProyecto } from "./ayuda-db";
import { TAMANO_MAXIMO } from "@/lib/documentos-contrato";
import { dirArchivos } from "@/lib/archivos";
import { guardarDocumento, quitarDocumento, documentosDeProyecto, documentoParaServir, rutaDeDocumento } from "@/lib/documentos";

const PDF = new TextEncoder().encode("%PDF-1.7 documento de prueba");
const EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
const contarArchivos = (dir: string): number => (existsSync(dir) ? readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).length : 0);

describe.runIf(DB_HABILITADA)("documentos en disco y en la base", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  let clienteId = 0;
  let proyectoId = 0;
  const raiz = () => path.join(dirArchivos(), "documentos");
  beforeAll(async () => {
    await limpiarBase();
    rmSync(raiz(), { recursive: true, force: true });
    ids = await sembrarBasico();
    const c = await sembrarCliente();
    clienteId = c.id;
    proyectoId = (await sembrarProyecto(c.id, ids.nichoId)).id;
  });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("guarda el archivo fuera del docroot, en la carpeta del cliente, con permisos 600, y deja fila y evento", async () => {
    const r = await guardarDocumento({ proyectoId, nombre: "", nombreArchivo: "Manual de recepción.pdf", bytes: PDF, usuarioId: ids.usuarioId });
    const d = await prisma.documento.findUniqueOrThrow({ where: { id: r.id } });
    expect(d).toMatchObject({ proyectoId, nombre: "Manual de recepción", tipoMime: "application/pdf", tamano: PDF.length, usuarioId: ids.usuarioId, quitadoEn: null });
    expect(d.archivo).toMatch(new RegExp(`^documentos/${clienteId}/[0-9a-f-]{36}\\.pdf$`));
    const ruta = rutaDeDocumento(d.archivo);
    expect(ruta.startsWith(raiz() + path.sep)).toBe(true);
    expect(statSync(ruta).mode & 0o777).toBe(0o600);
    expect(statSync(ruta).size).toBe(PDF.length);
    expect(await prisma.evento.count({ where: { proyectoId, tipo: "documento_subido", texto: "Manual de recepción", usuarioId: ids.usuarioId } })).toBe(1);
  });

  it("el tipo lo decide el contenido: un .exe llamado .pdf no entra, y no deja nada en disco ni en la base", async () => {
    const antes = { archivos: contarArchivos(raiz()), filas: await prisma.documento.count() };
    await expect(guardarDocumento({ proyectoId, nombre: "Factura", nombreArchivo: "factura.pdf", bytes: EXE, usuarioId: ids.usuarioId })).rejects.toThrow("TIPO_NO_PERMITIDO");
    await expect(guardarDocumento({ proyectoId, nombre: "x", nombreArchivo: "x.pdf", bytes: new Uint8Array(), usuarioId: ids.usuarioId })).rejects.toThrow("ARCHIVO_VACIO");
    const grande = new Uint8Array(TAMANO_MAXIMO + 1); grande.set(PDF);
    await expect(guardarDocumento({ proyectoId, nombre: "x", nombreArchivo: "x.pdf", bytes: grande, usuarioId: ids.usuarioId })).rejects.toThrow("ARCHIVO_GRANDE");
    await expect(guardarDocumento({ proyectoId: 999_999, nombre: "x", nombreArchivo: "x.pdf", bytes: PDF, usuarioId: ids.usuarioId })).rejects.toThrow("PROYECTO_NO_EXISTE");
    expect({ archivos: contarArchivos(raiz()), filas: await prisma.documento.count() }).toEqual(antes);
  });

  it("quitar no borra: la fila queda marcada, el archivo sigue en disco, y el segundo toque no duplica el evento", async () => {
    const { id } = await guardarDocumento({ proyectoId, nombre: "Plano", nombreArchivo: "plano.pdf", bytes: PDF, usuarioId: ids.usuarioId });
    const d = await prisma.documento.findUniqueOrThrow({ where: { id } });
    expect(await quitarDocumento(id, ids.usuarioId)).toEqual({ proyectoId, quitado: true });
    expect(await quitarDocumento(id, ids.usuarioId)).toEqual({ proyectoId, quitado: false });
    expect((await prisma.documento.findUniqueOrThrow({ where: { id } })).quitadoEn).not.toBeNull();
    expect(existsSync(rutaDeDocumento(d.archivo))).toBe(true);
    expect(await prisma.evento.count({ where: { proyectoId, tipo: "documento_quitado", texto: "Plano" } })).toBe(1);
    await expect(quitarDocumento(999_999, ids.usuarioId)).rejects.toThrow("DOCUMENTO_NO_EXISTE");
  });

  it("la lista del proyecto trae solo los vigentes, el mas nuevo primero; para servir se sabe de que cliente es y si esta quitado", async () => {
    const lista = await documentosDeProyecto(proyectoId);
    expect(lista.map((x) => x.nombre)).toEqual(["Manual de recepción"]);
    expect(Object.keys(lista[0]).sort()).toEqual(["id", "nombre", "subidoEn", "tamano", "tipoMime"]);
    const quitado = await prisma.documento.findFirstOrThrow({ where: { nombre: "Plano" } });
    expect(await documentoParaServir(quitado.id)).toMatchObject({ nombre: "Plano", quitado: true, clienteId });
    expect(await documentoParaServir(lista[0].id)).toMatchObject({ tipoMime: "application/pdf", quitado: false, clienteId });
    expect(await documentoParaServir(999_999)).toBeNull();
    expect(await documentoParaServir(-1)).toBeNull();
  });

  it("rutaDeDocumento no sale nunca de la carpeta de documentos", () => {
    for (const mala of ["documentos/1/../../recibos/2026/R-2026-0001.pdf", "/etc/passwd", "recibos/2026/R-2026-0001.pdf", ""]) {
      expect(() => rutaDeDocumento(mala), mala).toThrow("DOCUMENTO_INVALIDO");
    }
  });
});
```

- [ ] **Step 2: Verlo fallar**

Run: `PROSPECTOS_TEST_DB=1 npx vitest run tests/documentos.test.ts`
Expected: FAIL — no existen `@/lib/archivos` ni `@/lib/documentos`.

- [ ] **Step 3: `src/lib/archivos.ts`** (el guarda y la escritura atómica salen de `recibos.ts` y `pdf.ts`, sin cambiarles una coma):

```ts
// src/lib/archivos.ts — el directorio de archivos fuera del docroot y la escritura atomica. Lo comparten
// los recibos y los documentos del cliente: los dos guardan cosas que NO se regeneran nunca.
// Usa node: -> NO importarlo desde la cadena de src/instrumentation.ts (ver CLAUDE.md).
import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const DIR_PRODUCCION = "/home/neracosu/prospectos-archivos";

// Fuera de produccion (next dev, tests, scripts) jamas se escribe en el directorio real: el correlativo de la
// base de pruebas arranca bajo y pisaria recibos emitidos, y los tests borran <dir>/recibos y <dir>/documentos.
export function dirArchivos(): string {
  const dir = process.env.PROSPECTOS_DIR_ARCHIVOS ?? DIR_PRODUCCION;
  if (process.env.NODE_ENV !== "production" && path.resolve(dir) === DIR_PRODUCCION) throw new Error("DIR_ARCHIVOS_DE_PRODUCCION");
  return dir;
}

// Escritura atomica: nunca se debe leer un archivo a medio escribir. Pisa lo que hubiera.
export async function escribirAtomico(salida: string, bytes: Uint8Array): Promise<void> {
  await mkdir(path.dirname(salida), { recursive: true, mode: 0o700 });
  const temporal = `${salida}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporal, bytes, { mode: 0o600 });
    await rename(temporal, salida);
  } catch (err) {
    await rm(temporal, { force: true });
    throw err;
  }
}
```

- [ ] **Step 4: Que `pdf.ts` y `recibos.ts` usen lo compartido.**

En `src/lib/pdf.ts`: borrar la función `escribirAtomico` completa (con su comentario) y poner en su lugar:
```ts
// La escritura atomica vive en archivos.ts (la comparten recibos y documentos); se reexporta para no mover a quien ya la importa de aqui.
export { escribirAtomico } from "@/lib/archivos";
```
y quitar de la cabecera de `pdf.ts` **solo** los imports que queden sin uso después de eso (`randomUUID`, y de `node:fs/promises` los que ya no use nadie en el archivo; `path` se queda si el archivo lo sigue usando). `npx tsc --noEmit` dice cuáles sobran si el proyecto tiene `noUnusedLocals`; si no, revisarlo con `grep -n "randomUUID\|mkdir(\|rename(\|writeFile(\| rm(" src/lib/pdf.ts`.

En `src/lib/recibos.ts`: borrar `const DIR_PRODUCCION = …`, el comentario de dos líneas que le sigue y la función `dirArchivos()` entera, y agregar el import:
```ts
import { dirArchivos } from "@/lib/archivos";
```
`rutaDocumento` queda igual. Si `path` deja de usarse en otra parte del archivo no se toca: `rutaDocumento` lo sigue usando.

- [ ] **Step 5: `src/lib/documentos.ts`**

```ts
// src/lib/documentos.ts — documentos que Neri sube a un proyecto y el cliente ve en su portal (pieza 5b).
// El archivo va fuera del docroot: <dir>/documentos/<clienteId>/<uuid>.<ext>. No se regenera NUNCA y nada lo borra.
// Usa node: -> NO importarlo desde la cadena de src/instrumentation.ts (ver CLAUDE.md).
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { dirArchivos, escribirAtomico } from "@/lib/archivos";
import { TAMANO_MAXIMO, TIPOS, RUTA_DOCUMENTO, detectarTipo, nombreVisible } from "@/lib/documentos-contrato";

export type DocumentoFila = { id: number; nombre: string; tipoMime: string; tamano: number; subidoEn: Date };

// La ruta sale SIEMPRE de la base, pero igual se valida: de aqui no se lee nada que no sea documentos/<n>/<uuid>.<ext>.
export function rutaDeDocumento(archivo: string): string {
  if (!RUTA_DOCUMENTO.test(archivo)) throw new Error("DOCUMENTO_INVALIDO");
  const raiz = path.join(dirArchivos(), "documentos");
  const ruta = path.resolve(dirArchivos(), archivo);
  if (!ruta.startsWith(raiz + path.sep)) throw new Error("DOCUMENTO_INVALIDO");
  return ruta;
}

export async function guardarDocumento(d: { proyectoId: number; nombre: string; nombreArchivo: string; bytes: Uint8Array; usuarioId: number }): Promise<{ id: number }> {
  if (d.bytes.length === 0) throw new Error("ARCHIVO_VACIO");
  if (d.bytes.length > TAMANO_MAXIMO) throw new Error("ARCHIVO_GRANDE");
  const tipoMime = detectarTipo(d.bytes);
  if (!tipoMime) throw new Error("TIPO_NO_PERMITIDO");
  const proyecto = await prisma.proyecto.findUnique({ where: { id: d.proyectoId }, select: { clienteId: true } });
  if (!proyecto) throw new Error("PROYECTO_NO_EXISTE");
  const nombre = nombreVisible(d.nombre, d.nombreArchivo);
  const archivo = `documentos/${proyecto.clienteId}/${randomUUID()}.${TIPOS[tipoMime].ext}`;
  const ruta = rutaDeDocumento(archivo);
  // Primero el archivo, despues la fila: una fila sin archivo le daria al cliente un enlace roto.
  await escribirAtomico(ruta, d.bytes);
  try {
    // Fila y evento van juntos: un documento subido nunca queda sin su rastro.
    return await prisma.$transaction(async (tx) => {
      const fila = await tx.documento.create({ data: { proyectoId: d.proyectoId, nombre, archivo, tipoMime, tamano: d.bytes.length, usuarioId: d.usuarioId }, select: { id: true } });
      await tx.evento.create({ data: { proyectoId: d.proyectoId, usuarioId: d.usuarioId, tipo: "documento_subido", texto: nombre } });
      return fila;
    });
  } catch (err) {
    // La base no lo conoce: ese archivo no es de nadie. Es el unico rm de la pieza y solo toca lo que acaba de escribir.
    await rm(ruta, { force: true });
    throw err;
  }
}

export async function quitarDocumento(id: number, usuarioId: number): Promise<{ proyectoId: number; quitado: boolean }> {
  const d = await prisma.documento.findUnique({ where: { id }, select: { proyectoId: true, nombre: true } });
  if (!d) throw new Error("DOCUMENTO_NO_EXISTE");
  // Marca y evento van juntos; si dos toques llegaron a la vez, solo uno cuenta.
  const quitado = await prisma.$transaction(async (tx) => {
    const r = await tx.documento.updateMany({ where: { id, quitadoEn: null }, data: { quitadoEn: new Date() } });
    if (r.count === 0) return false;
    await tx.evento.create({ data: { proyectoId: d.proyectoId, usuarioId, tipo: "documento_quitado", texto: d.nombre } });
    return true;
  });
  return { proyectoId: d.proyectoId, quitado };
}

export async function documentosDeProyecto(proyectoId: number): Promise<DocumentoFila[]> {
  return prisma.documento.findMany({
    where: { proyectoId, quitadoEn: null },
    select: { id: true, nombre: true, tipoMime: true, tamano: true, subidoEn: true },
    orderBy: [{ subidoEn: "desc" }, { id: "desc" }],
  });
}

export async function documentoParaServir(id: number): Promise<{ nombre: string; tipoMime: string; archivo: string; quitado: boolean; clienteId: number } | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const d = await prisma.documento.findUnique({ where: { id }, select: { nombre: true, tipoMime: true, archivo: true, quitadoEn: true, proyecto: { select: { clienteId: true } } } });
  return d ? { nombre: d.nombre, tipoMime: d.tipoMime, archivo: d.archivo, quitado: d.quitadoEn !== null, clienteId: d.proyecto.clienteId } : null;
}
```

- [ ] **Step 6: Verde**

Run, una orden a la vez:
`PROSPECTOS_TEST_DB=1 npx vitest run tests/documentos.test.ts` → PASS.
`PROSPECTOS_TEST_DB=1 npx vitest run tests/recibos.test.ts tests/recibos-ruta.test.ts tests/recibos-acciones.test.ts tests/pdf.test.ts tests/entorno.test.ts` → PASS (no se les tocó nada: prueban que mover `dirArchivos` y `escribirAtomico` no cambió nada).
`npx vitest run tests/instrumentation-grafo.test.ts` → PASS. `npx tsc --noEmit` → limpio.

- [ ] **Step 7: Commit**

```bash
git add src/lib/archivos.ts src/lib/documentos.ts src/lib/recibos.ts src/lib/pdf.ts tests/documentos.test.ts
git commit -F - <<'EOF'
feat(documentos): guardar, quitar y leer documentos del cliente fuera del docroot; dirArchivos y escribirAtomico compartidos
EOF
```

---

### Task 4: Rutas — subir, quitar, servir, y la sesión vencida del cliente

**Files:**
- Create: `src/app/(panel)/proyectos/[id]/documentos/route.ts`, `src/acciones/documentos.ts`, `src/app/c/documentos/[id]/route.ts`
- Modify: `src/app/recibos/[archivo]/route.ts`
- Test: `tests/documentos-ruta.test.ts`; se agrega un caso a `tests/recibos-ruta.test.ts`

**Interfaces:**
- Consumes (Task 2): `TAMANO_MAXIMO`, `disposicion`, `mismoOrigen`. (Task 3): `guardarDocumento`, `quitarDocumento`, `documentoParaServir`, `rutaDeDocumento`. Existentes: `sesionActual()` de `@/lib/sesion`, `sesionCliente()` de `@/lib/sesion-cliente`, `ipCliente()` de `@/lib/ip`, `permitirIntento(clave, max, ventanaMs)` de `@/lib/rate-limit`, `CODIGO_VALIDO` de `@/lib/codigo`.
- Produces:
  - `POST /proyectos/<id>/documentos` — `multipart/form-data` con `archivo` (File) y `nombre` (texto, opcional). Responde JSON `{ ok: true, datos: { id } }` o `{ ok: false, mensaje }` con estado 401 · 403 · 400 · 404 · 413 · 415 · 500.
  - `quitarDocumentoDeProyecto(id: number): Promise<Resultado>` (Server Action, solo `dueno`).
  - `GET /c/documentos/<id>[?c=<código>]` — el archivo, o 404; sin ninguna sesión y con `c` bien formado, 307 a `/c/<c>`.
  - `GET /recibos/<archivo>?c=<código>` — sin ninguna sesión y con `c` bien formado, 307 a `/c/<c>` (antes siempre `/entrar`).

- [ ] **Step 1: Test que falla** — `tests/documentos-ruta.test.ts`:

```ts
import { vi } from "vitest";
vi.mock("@/lib/sesion", async () => {
  const { sesionFalsa } = await import("./ayuda-sesion");
  return {
    COOKIE_SESION: "pr_sesion", DIAS_SESION: 30,
    sesionActual: async () => sesionFalsa.actual,
    exigirSesion: async () => { if (!sesionFalsa.actual) throw new Error("REDIRECT:/entrar"); return sesionFalsa.actual; },
    exigirRol: async (rol: string) => { if (sesionFalsa.actual?.rol !== rol) throw new Error("REDIRECT:/hoy"); return sesionFalsa.actual; },
  };
});
vi.mock("@/lib/sesion-cliente", async () => {
  const { sesionClienteFalsa } = await import("./ayuda-sesion");
  return { COOKIE_CLIENTE: "sesion_cliente", sesionCliente: async () => sesionClienteFalsa.actual };
});
vi.mock("@/lib/ip", () => ({ ipCliente: async () => "10.9.8.7" }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { rmSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, sembrarCliente, sembrarProyecto } from "./ayuda-db";
import { sesionFalsa, sesionClienteFalsa } from "./ayuda-sesion";
import { dirArchivos } from "@/lib/archivos";
import { TAMANO_MAXIMO } from "@/lib/documentos-contrato";
import { _reiniciarIntentos } from "@/lib/rate-limit";
import { POST } from "@/app/(panel)/proyectos/[id]/documentos/route";
import { GET } from "@/app/c/documentos/[id]/route";
import { quitarDocumentoDeProyecto } from "@/acciones/documentos";

const PDF = "%PDF-1.7 contenido de prueba";
const ORIGEN = { origin: "http://prueba.test", host: "prueba.test" };
function subir(proyectoId: number | string, archivo: File | null, extra: { nombre?: string; headers?: Record<string, string> } = {}) {
  const fd = new FormData();
  if (archivo) fd.set("archivo", archivo);
  if (extra.nombre !== undefined) fd.set("nombre", extra.nombre);
  return POST(new Request(`http://prueba.test/proyectos/${proyectoId}/documentos`, { method: "POST", body: fd, headers: extra.headers ?? ORIGEN }), { params: Promise.resolve({ id: String(proyectoId) }) });
}
const pedir = (id: number | string, consulta = "") => GET(new Request(`http://prueba.test/c/documentos/${id}${consulta}`), { params: Promise.resolve({ id: String(id) }) });

describe.runIf(DB_HABILITADA)("documentos: subir, quitar y servir", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  let a: Awaited<ReturnType<typeof sembrarCliente>>;
  let b: Awaited<ReturnType<typeof sembrarCliente>>;
  let proyectoId = 0;
  let docId = 0;
  const comoDueno = () => { sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" }; sesionClienteFalsa.actual = null; };
  const comoCliente = (c: { id: number; codigo: string }) => { sesionFalsa.actual = null; sesionClienteFalsa.actual = { usuarioId: 1, clienteId: c.id, codigo: c.codigo, nombre: "Cliente" }; };

  beforeAll(async () => {
    await limpiarBase();
    rmSync(path.join(dirArchivos(), "documentos"), { recursive: true, force: true });
    ids = await sembrarBasico();
    a = await sembrarCliente({ nombre: "Hotel A" });
    b = await sembrarCliente({ nombre: "Farmacia B" });
    proyectoId = (await sembrarProyecto(a.id, ids.nichoId)).id;
  });
  beforeEach(() => { comoDueno(); _reiniciarIntentos(); });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("subir: solo el dueno, solo desde el mismo origen", async () => {
    const archivo = new File([PDF], "manual.pdf", { type: "application/pdf" });
    sesionFalsa.actual = null;
    expect((await subir(proyectoId, archivo)).status).toBe(401);
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
    expect((await subir(proyectoId, archivo)).status).toBe(403);
    comoCliente(a);
    expect((await subir(proyectoId, archivo)).status).toBe(401); // la sesion del portal no es sesion del panel
    comoDueno();
    expect((await subir(proyectoId, archivo, { headers: { origin: "https://malo.test", host: "prueba.test" } })).status).toBe(403);
    expect((await subir(proyectoId, archivo, { headers: { host: "prueba.test" } })).status).toBe(403);
    expect(await prisma.documento.count()).toBe(0);
  });

  it("subir: guarda, responde el id y usa el nombre que escribio Neri", async () => {
    const r = await subir(proyectoId, new File([PDF], "manual-v3-final.pdf", { type: "application/pdf" }), { nombre: "Manual de recepción" });
    expect(r.status).toBe(200);
    const cuerpo = await r.json();
    expect(cuerpo.ok).toBe(true);
    docId = cuerpo.datos.id;
    expect(await prisma.documento.findUniqueOrThrow({ where: { id: docId } })).toMatchObject({ proyectoId, nombre: "Manual de recepción", tipoMime: "application/pdf" });
  });

  it("subir: lo que no entra dice por que, en espanol, y no deja nada", async () => {
    const antes = await prisma.documento.count();
    const casos: [Response, number, RegExp][] = [
      [await subir(proyectoId, null), 400, /Elige un archivo/],
      [await subir(proyectoId, new File([], "vacio.pdf")), 400, /vacío/],
      [await subir(proyectoId, new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00])], "factura.pdf", { type: "application/pdf" })), 415, /PDF, JPG, PNG o ZIP/],
      [await subir(proyectoId, new File([new Uint8Array(TAMANO_MAXIMO + 1)], "grande.pdf")), 413, /10 MB/],
      [await subir(999_999, new File([PDF], "x.pdf")), 404, /proyecto no existe/],
      [await subir("abc", new File([PDF], "x.pdf")), 404, /proyecto no existe/],
      [await subir(proyectoId, new File([PDF], "x.pdf"), { headers: { ...ORIGEN, "content-length": String(50 * 1024 * 1024) } }), 413, /10 MB/],
    ];
    for (const [r, estado, texto] of casos) {
      expect(r.status).toBe(estado);
      const cuerpo = await r.json();
      expect(cuerpo.ok).toBe(false);
      expect(cuerpo.mensaje).toMatch(texto);
    }
    expect(await prisma.documento.count()).toBe(antes);
  });

  it("servir: el dueno y el cliente dueno del proyecto lo bajan, sin cache y con el nombre que ve el cliente", async () => {
    const r = await pedir(docId);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("content-disposition")).toBe(`inline; filename="Manual de recepcion.pdf"; filename*=UTF-8''Manual%20de%20recepci%C3%B3n.pdf`);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("x-robots-tag")).toBe("noindex");
    expect(await r.text()).toBe(PDF);
    comoCliente(a);
    const mio = await pedir(docId);
    expect(mio.status).toBe(200);
    expect(await mio.text()).toBe(PDF);
  });

  it("servir: lo ajeno, lo que no existe y un id raro le responden al cliente el MISMO 404; el prospectador, 403", async () => {
    comoCliente(b);
    const ajeno = await pedir(docId);
    const inexistente = await pedir(999_999);
    expect(ajeno.status).toBe(404);
    expect(inexistente.status).toBe(404);
    expect(await ajeno.text()).toBe(await inexistente.text());
    expect((await pedir("abc")).status).toBe(404);
    expect((await pedir("1.5")).status).toBe(404);
    sesionClienteFalsa.actual = null;
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
    expect((await pedir(docId)).status).toBe(403);
  });

  it("servir sin ninguna sesion: con ?c= bien formado vuelve al PIN del portal; sin el, 404 (no se revela de quien es)", async () => {
    sesionFalsa.actual = null; sesionClienteFalsa.actual = null;
    const conCodigo = await pedir(docId, `?c=${b.codigo}`);
    expect(conCodigo.status).toBe(307);
    expect(conCodigo.headers.get("location")).toBe(`/c/${b.codigo}`);
    expect((await pedir(docId)).status).toBe(404);
    expect((await pedir(docId, "?c=../../entrar")).status).toBe(404);
    expect((await pedir(docId, "?c=https://malo.test")).status).toBe(404);
  });

  it("servir: pasado el limite de 120 por minuto por IP, el cliente recibe 404; al dueno no se le cuenta", async () => {
    comoCliente(a);
    for (let i = 0; i < 120; i++) await pedir(999_999);
    expect((await pedir(docId)).status).toBe(404);
    comoDueno();
    expect((await pedir(docId)).status).toBe(200);
  });

  it("quitar: solo el dueno; despues el cliente recibe 404 y el dueno lo sigue viendo", async () => {
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
    await expect(quitarDocumentoDeProyecto(docId)).rejects.toThrow("REDIRECT:/hoy");
    comoDueno();
    expect(await quitarDocumentoDeProyecto(docId)).toEqual({ ok: true, datos: undefined });
    expect((await quitarDocumentoDeProyecto(999_999)).ok).toBe(false);
    expect((await pedir(docId)).status).toBe(200);
    comoCliente(a);
    expect((await pedir(docId)).status).toBe(404);
  });

  it("servir: si el archivo no esta en disco, 404 con una salida para el cliente y el error en el log", async () => {
    comoDueno();
    const r = await subir(proyectoId, new File([PDF], "se-pierde.pdf"));
    const { datos } = await r.json();
    rmSync(path.join(dirArchivos(), "documentos"), { recursive: true, force: true });
    comoCliente(a);
    const perdido = await pedir(datos.id);
    expect(perdido.status).toBe(404);
    expect(await perdido.text()).toContain("Escríbenos");
  });
});
```

Y en `tests/recibos-ruta.test.ts`, después del test «sin ninguna de las dos sesiones sigue mandando a /entrar»:

```ts
  it("sin ninguna sesion pero con ?c= bien formado (enlace del portal con la sesion vencida) vuelve al PIN del portal, no al del panel", async () => {
    sesionFalsa.actual = null;
    sesionClienteFalsa.actual = null;
    const codigo = "Ab3-_".repeat(5).slice(0, 22);
    const pedirCon = (consulta: string) => GET(new Request(`http://prueba.test/recibos/R-2026-0001.pdf${consulta}`), { params: Promise.resolve({ archivo: "R-2026-0001.pdf" }) });
    const r = await pedirCon(`?c=${codigo}`);
    expect(r.status).toBe(307);
    expect(r.headers.get("location")).toBe(`/c/${codigo}`);
    expect((await pedirCon("?c=//malo.test")).headers.get("location")).toBe("/entrar");
    expect((await pedirCon("")).headers.get("location")).toBe("/entrar");
  });
```

- [ ] **Step 2: Verlos fallar**

Run: `PROSPECTOS_TEST_DB=1 npx vitest run tests/documentos-ruta.test.ts tests/recibos-ruta.test.ts`
Expected: FAIL — no existen las rutas ni la acción; el caso nuevo de recibos recibe `/entrar`.

Si `_reiniciarIntentos` no existe con ese nombre en `src/lib/rate-limit.ts`, usar el que exporte ese archivo para tests (lo usa `tests/acceso-cliente.test.ts`); no crear otro.

- [ ] **Step 3: La subida** — `src/app/(panel)/proyectos/[id]/documentos/route.ts`:

```ts
import { revalidatePath } from "next/cache";
import { sesionActual } from "@/lib/sesion";
import { mismoOrigen } from "@/lib/origen";
import { TAMANO_MAXIMO } from "@/lib/documentos-contrato";
import { guardarDocumento } from "@/lib/documentos";

// POST /proyectos/<id>/documentos — sube un documento del cliente (pieza 5b). Es un route handler y no una
// Server Action porque el tope de cuerpo de las acciones es global: subirlo a 11 MB se lo abriria tambien a la
// entrada del portal, que no pide sesion. Aqui la sesion se valida ANTES de leer el cuerpo.
const MARGEN_MULTIPART = 64 * 1024;
const responder = (status: number, cuerpo: { ok: true; datos: { id: number } } | { ok: false; mensaje: string }) => Response.json(cuerpo, { status, headers: { "cache-control": "no-store" } });
const MENSAJES: Record<string, [number, string]> = {
  ARCHIVO_VACIO: [400, "El archivo está vacío."],
  ARCHIVO_GRANDE: [413, "El archivo pesa más de 10 MB."],
  TIPO_NO_PERMITIDO: [415, "Ese archivo no es un PDF, JPG, PNG o ZIP. Se revisa el contenido, no la extensión."],
  PROYECTO_NO_EXISTE: [404, "Ese proyecto no existe."],
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await sesionActual();
  if (!u) return responder(401, { ok: false, mensaje: "Tu sesión venció. Entra de nuevo y vuelve a subirlo." });
  if (u.rol !== "dueno") return responder(403, { ok: false, mensaje: "Solo el dueño sube documentos." });
  // Lo que Next hace solo en una Server Action: que la peticion venga de este mismo sitio.
  if (!mismoOrigen(req.headers)) return responder(403, { ok: false, mensaje: "La petición no vino de este sitio." });
  const proyectoId = Number((await ctx.params).id);
  if (!Number.isInteger(proyectoId) || proyectoId <= 0) return responder(404, { ok: false, mensaje: MENSAJES.PROYECTO_NO_EXISTE[1] });
  // Si el navegador declara un cuerpo enorme, se corta sin leerlo.
  if (Number(req.headers.get("content-length") ?? "0") > TAMANO_MAXIMO + MARGEN_MULTIPART) return responder(413, { ok: false, mensaje: MENSAJES.ARCHIVO_GRANDE[1] });
  let archivo: FormDataEntryValue | null = null;
  let nombre = "";
  try {
    const fd = await req.formData();
    archivo = fd.get("archivo");
    nombre = String(fd.get("nombre") ?? "");
  } catch { return responder(400, { ok: false, mensaje: "No se pudo leer el archivo. Intenta de nuevo." }); }
  if (!(archivo instanceof File)) return responder(400, { ok: false, mensaje: "Elige un archivo." });
  if (archivo.size > TAMANO_MAXIMO) return responder(413, { ok: false, mensaje: MENSAJES.ARCHIVO_GRANDE[1] });
  try {
    const r = await guardarDocumento({ proyectoId, nombre, nombreArchivo: archivo.name, bytes: new Uint8Array(await archivo.arrayBuffer()), usuarioId: u.id });
    revalidatePath(`/proyectos/${proyectoId}`);
    return responder(200, { ok: true, datos: { id: r.id } });
  } catch (err) {
    const conocido = MENSAJES[err instanceof Error ? err.message : ""];
    if (conocido) return responder(conocido[0], { ok: false, mensaje: conocido[1] });
    console.error("subir documento", proyectoId, err);
    return responder(500, { ok: false, mensaje: "No se pudo guardar el documento. Intenta de nuevo." });
  }
}
```

- [ ] **Step 4: Quitar** — `src/acciones/documentos.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirRol } from "@/lib/sesion";
import { quitarDocumento } from "@/lib/documentos";
import { fallo, exito, type Resultado } from "@/acciones/resultado";

// exigirRol("dueno") va FUERA del try/catch. Quitar no borra: el cliente deja de verlo y el archivo queda en disco.
export async function quitarDocumentoDeProyecto(id: number): Promise<Resultado> {
  const u = await exigirRol("dueno");
  const e = z.number().int().positive().safeParse(id);
  if (!e.success) return fallo("Ese documento no existe.");
  try {
    const r = await quitarDocumento(e.data, u.id);
    revalidatePath(`/proyectos/${r.proyectoId}`);
    return exito();
  } catch (err) {
    if (err instanceof Error && err.message === "DOCUMENTO_NO_EXISTE") return fallo("Ese documento no existe.");
    console.error("quitarDocumentoDeProyecto", err);
    return fallo("No se pudo quitar. Intenta de nuevo.");
  }
}
```

- [ ] **Step 5: Servir** — `src/app/c/documentos/[id]/route.ts`:

```ts
import { readFile } from "node:fs/promises";
import { sesionActual } from "@/lib/sesion";
import { sesionCliente } from "@/lib/sesion-cliente";
import { ipCliente } from "@/lib/ip";
import { permitirIntento } from "@/lib/rate-limit";
import { CODIGO_VALIDO } from "@/lib/codigo";
import { disposicion } from "@/lib/documentos-contrato";
import { documentoParaServir, rutaDeDocumento } from "@/lib/documentos";

const SIN_CACHE = { "cache-control": "private, no-store", "x-robots-tag": "noindex" };
const noEncontrado = (texto = "No encontrado") => new Response(texto, { status: 404, headers: SIN_CACHE });

// GET /c/documentos/<id> — el unico camino a un documento (pieza 5b). Entra el dueno, o el cliente dueno del
// proyecto. Para el cliente, lo ajeno, lo quitado y lo inexistente son EL MISMO 404: no hay forma de tantear ids.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await sesionActual();
  const cliente = u ? null : await sesionCliente();
  if (u && u.rol !== "dueno") return new Response("No tienes permiso para ver documentos.", { status: 403, headers: SIN_CACHE });
  // El limite de /c/* (120 por minuto por IP) tambien vale aqui; al dueno no se le cuenta.
  if (!u && !permitirIntento(`c:${await ipCliente()}`, 120, 60_000)) return noEncontrado();
  if (!u && !cliente) {
    // Sesion vencida: el enlace del portal trae ?c=<codigo>. El codigo lo puso quien pide, asi que volver a SU
    // pantalla de PIN no revela nada; sin el, 404 (decir de que cliente es el documento seria regalar su codigo).
    const c = new URL(req.url).searchParams.get("c") ?? "";
    return CODIGO_VALIDO.test(c) ? new Response(null, { status: 307, headers: { location: `/c/${c}`, ...SIN_CACHE } }) : noEncontrado();
  }
  const { id } = await ctx.params;
  const d = /^\d{1,9}$/.test(id) ? await documentoParaServir(Number(id)) : null;
  if (!d) return noEncontrado();
  if (cliente && (d.clienteId !== cliente.clienteId || d.quitado)) return noEncontrado();
  try {
    const bytes = await readFile(rutaDeDocumento(d.archivo));
    return new Response(bytes, { headers: { "content-type": d.tipoMime, "content-disposition": disposicion(d.tipoMime, d.nombre), ...SIN_CACHE } });
  } catch {
    // Un documento no se regenera: si el archivo no esta, se dice y se revisa a mano.
    console.error("documento sin archivo en disco", id);
    return noEncontrado(cliente ? "Documento no disponible. Escríbenos y te lo enviamos." : "Documento no disponible: el archivo no está en el servidor.");
  }
}
```

- [ ] **Step 6: La sesión vencida en los recibos** — en `src/app/recibos/[archivo]/route.ts`:

Agregar el import `import { CODIGO_VALIDO } from "@/lib/codigo";`, cambiar la firma a `export async function GET(req: Request, ctx: …)` (hoy el primer parámetro se llama `_req`) y reemplazar la línea del 307 por:

```ts
  if (!u && !cliente) {
    // Enlace del portal con la sesion vencida: trae ?c=<codigo> y vuelve al PIN del portal, no al del panel.
    const c = new URL(req.url).searchParams.get("c") ?? "";
    return new Response(null, { status: 307, headers: { location: CODIGO_VALIDO.test(c) ? `/c/${c}` : "/entrar", ...SIN_CACHE } });
  }
```
(el comentario de la `Location` relativa que ya estaba encima se conserva).

- [ ] **Step 7: Verde**

Run: `PROSPECTOS_TEST_DB=1 npx vitest run tests/documentos-ruta.test.ts tests/recibos-ruta.test.ts` → PASS. `npx tsc --noEmit` → limpio.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(panel)/proyectos/[id]/documentos/route.ts" src/acciones/documentos.ts "src/app/c/documentos/[id]/route.ts" "src/app/recibos/[archivo]/route.ts" tests/documentos-ruta.test.ts tests/recibos-ruta.test.ts
git commit -F - <<'EOF'
feat(documentos): subir (solo dueno, mismo origen), quitar y servir por /c/documentos; la sesion vencida del cliente vuelve a su PIN
EOF
```

---

> Nota de la Task 4, Step 1: el caso del `content-length` de 50 MB depende de que `Request` de Node deje fijar esa cabecera a mano. Si no la deja (el test recibe 200), ese caso se quita del arreglo `casos` y se dice en el reporte; el corte por `archivo.size` y por `guardarDocumento` ya cubre el peso real.

### Task 5: Avisos al cliente — plantillas, acciones y Ajustes

**Files:**
- Modify: `src/lib/configuracion.ts`, `src/lib/mensajes-cobro.ts`, `src/acciones/pendientes.ts`, `src/acciones/cobros.ts`, `src/acciones/versiones.ts`, `src/acciones/ajustes.ts`
- Test: `tests/avisos.test.ts` (nuevo). Sin tocar y en verde: `tests/cobros.test.ts`, `tests/versiones.test.ts`, `tests/pendientes-horas.test.ts`, `tests/ajustes.test.ts`, `tests/ajustes-cobros.test.ts`.

**Interfaces:**
- Consumes (Task 1): `Pendiente.avisadoEn`, `Cobro.avisadoEn`. (Task 2): `armarMensaje`, `AVISO_POR_DEFECTO`, `VARIABLE_OBLIGATORIA`, `RENGLON_PORTAL_COBRO`, `quienRecibe`, `mensajeAvisoHito`, `mensajeAvisoVersion`, `mensajeAvisoCobro`. Existentes: `enlaceSiTieneAcceso(clienteId): Promise<string>` (vacío si el cliente no puede entrar), `enlaceWhatsappCobro(whatsapp, mensaje): string | null`, `leerConfig`, `guardarConfig`, `CLAVES`.
- Produces:
  - `CLAVES.avisoHito = "mensaje_aviso_hito"`, `CLAVES.avisoVersion = "mensaje_aviso_version"`, `CLAVES.avisoCobro = "mensaje_aviso_cobro"` (con sus `DEFECTOS`)
  - `avisarHito(pendienteId: number): Promise<Resultado<{ href: string }>>` en `src/acciones/pendientes.ts`
  - `avisarCobro(cobroId: number): Promise<Resultado<{ href: string }>>` en `src/acciones/cobros.ts`
  - `guardarMensajesAviso(formData: FormData): Promise<Resultado>` en `src/acciones/ajustes.ts` — campos `hito`, `version`, `cobro`
  - `marcarAvisada` conserva su firma; el texto sale de `CLAVES.avisoVersion`.

- [ ] **Step 1: Test que falla** — `tests/avisos.test.ts`:

```ts
import { vi } from "vitest";
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
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, sembrarCliente, sembrarProyecto } from "./ayuda-db";
import { sesionFalsa } from "./ayuda-sesion";
import { leerConfig, guardarConfig, CLAVES } from "@/lib/configuracion";
import { AVISO_POR_DEFECTO } from "@/lib/avisos-contrato";
import { darAcceso } from "@/lib/acceso-cliente";
import { marcarPendiente, avisarHito } from "@/acciones/pendientes";
import { avisarCobro, registrarRecordatorio } from "@/acciones/cobros";
import { marcarAvisada } from "@/acciones/versiones";
import { guardarMensajesAviso, guardarUsuario, restablecerPin } from "@/acciones/ajustes";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const texto = (href: string) => decodeURIComponent(href.split("?text=")[1]);

describe.runIf(DB_HABILITADA)("avisos al cliente", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  let cliente: Awaited<ReturnType<typeof sembrarCliente>>;
  let proyectoId = 0;
  beforeAll(async () => {
    await limpiarBase();
    ids = await sembrarBasico();
    cliente = await sembrarCliente({ nombre: "Hotel Avisos", whatsapp: "584125550000" });
    proyectoId = (await sembrarProyecto(cliente.id, ids.nichoId, { nombre: "PMS Hotel" })).id;
  });
  beforeEach(() => { sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" }; });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("los tres avisos tienen texto de fabrica, y el recordatorio de cobro ya trae el renglon del portal", async () => {
    expect(await leerConfig(CLAVES.avisoHito)).toBe(AVISO_POR_DEFECTO.hito);
    expect(await leerConfig(CLAVES.avisoVersion)).toBe(AVISO_POR_DEFECTO.version);
    expect(await leerConfig(CLAVES.avisoCobro)).toBe(AVISO_POR_DEFECTO.cobro);
    for (const clave of [CLAVES.mensajeRecordatorio, CLAVES.mensajeVencido]) {
      const renglones = (await leerConfig(clave)).split("\n");
      expect(renglones.filter((r) => r.includes("{enlace}"))).toEqual(["Puede ver el detalle en su portal: {enlace}"]);
    }
  });

  it("avisarHito: solo el dueno, solo un hito cumplido y visible; abre WhatsApp, deja rastro y no se repite", async () => {
    const interno = await prisma.pendiente.create({ data: { proyectoId, texto: "Refactor interno", hecho: true, hechoEn: new Date(), visibleCliente: false, orden: 1 } });
    const hito = await prisma.pendiente.create({ data: { proyectoId, texto: "Recepción y habitaciones", visibleCliente: true, orden: 2 } });
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
    await expect(avisarHito(hito.id)).rejects.toThrow("REDIRECT:/hoy");
    sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" };
    expect((await avisarHito(interno.id)).ok).toBe(false);
    expect((await avisarHito(hito.id)).ok).toBe(false); // todavia no esta cumplido
    await marcarPendiente(hito.id, true);
    const r = await avisarHito(hito.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.datos.href).toMatch(/^https:\/\/wa\.me\/584125550000\?text=/);
    // El cliente todavia no tiene acceso al portal: el renglon del enlace no va.
    expect(texto(r.datos.href)).toBe("Buenas, Hotel Avisos. Ya quedó listo en PMS Hotel: Recepción y habitaciones.\nCualquier duda me escribe por aquí.");
    expect((await prisma.pendiente.findUniqueOrThrow({ where: { id: hito.id } })).avisadoEn).not.toBeNull();
    expect(await prisma.evento.count({ where: { proyectoId, tipo: "aviso_cliente", texto: "hito: Recepción y habitaciones" } })).toBe(1);
    const otra = await avisarHito(hito.id);
    expect(otra.ok).toBe(false);
    if (!otra.ok) expect(otra.mensaje).toContain("ya se avisó");
    expect(await prisma.evento.count({ where: { proyectoId, tipo: "aviso_cliente", texto: "hito: Recepción y habitaciones" } })).toBe(1);
  });

  it("desmarcar un hito le borra el aviso: al volver a cumplirlo se puede avisar otra vez, ya con el enlace del portal", async () => {
    const hito = await prisma.pendiente.findFirstOrThrow({ where: { proyectoId, texto: "Recepción y habitaciones" } });
    await marcarPendiente(hito.id, false);
    expect((await prisma.pendiente.findUniqueOrThrow({ where: { id: hito.id } })).avisadoEn).toBeNull();
    await marcarPendiente(hito.id, true);
    await darAcceso(cliente.id);
    const r = await avisarHito(hito.id);
    expect(r.ok).toBe(true);
    if (r.ok) expect(texto(r.datos.href)).toContain(`Puede ver el avance en su portal: http://localhost:3013/c/${cliente.codigo}`);
  });

  it("sin WhatsApp del cliente no se avisa ni se marca nada", async () => {
    const mudo = await sembrarCliente({ nombre: "Sin Celular", whatsapp: "" });
    const p = await sembrarProyecto(mudo.id, ids.nichoId);
    const hito = await prisma.pendiente.create({ data: { proyectoId: p.id, texto: "Hito mudo", hecho: true, hechoEn: new Date(), visibleCliente: true } });
    const cobro = await prisma.cobro.create({ data: { proyectoId: p.id, concepto: "extra", detalle: "Extra mudo", monto: "20.00", vence: "2026-10-01" } });
    const h = await avisarHito(hito.id);
    const c = await avisarCobro(cobro.id);
    expect(h.ok).toBe(false);
    expect(c.ok).toBe(false);
    if (!h.ok) expect(h.mensaje).toContain("WhatsApp");
    expect((await prisma.pendiente.findUniqueOrThrow({ where: { id: hito.id } })).avisadoEn).toBeNull();
    expect((await prisma.cobro.findUniqueOrThrow({ where: { id: cobro.id } })).avisadoEn).toBeNull();
    expect(await prisma.evento.count({ where: { proyectoId: p.id, tipo: "aviso_cliente" } })).toBe(0);
  });

  it("avisarCobro: cuotas y extras sin pagar; ni mensualidades, ni pagados, ni anulados, ni dos veces", async () => {
    const extra = await prisma.cobro.create({ data: { proyectoId, concepto: "extra", detalle: "Módulo de reportes", monto: "150.50", vence: "2026-10-05" } });
    const mensualidad = await prisma.cobro.create({ data: { proyectoId, concepto: "mensualidad", detalle: "Mensualidad de octubre 2026", mes: "2026-10", monto: "100.00", vence: "2026-10-05" } });
    const pagado = await prisma.cobro.create({ data: { proyectoId, concepto: "cuota", detalle: "Cuota 1", monto: "10.00", vence: "2026-09-01", pagadoEn: new Date(), canal: "zelle" } });
    const anulado = await prisma.cobro.create({ data: { proyectoId, concepto: "extra", detalle: "Anulado", monto: "10.00", vence: "2026-09-01", anuladoEn: new Date(), anuladoMotivo: "x" } });
    for (const c of [mensualidad, pagado, anulado]) expect((await avisarCobro(c.id)).ok, c.detalle).toBe(false);
    const r = await avisarCobro(extra.id);
    expect(r.ok).toBe(true);
    if (r.ok) expect(texto(r.datos.href)).toBe(`Buenas, Hotel Avisos. Registré un cobro de PMS Hotel: Extra (Módulo de reportes) por $150,50, que vence el 05/10/2026.\nPuede verlo en su portal: http://localhost:3013/c/${cliente.codigo}\nCualquier duda me escribe por aquí.`);
    expect((await avisarCobro(extra.id)).ok).toBe(false);
    expect(await prisma.evento.count({ where: { cobroId: extra.id, tipo: "aviso_cliente", texto: "cobro: Módulo de reportes" } })).toBe(1);
    // El recordatorio de siempre sigue andando y ahora trae el renglon del portal de fabrica.
    const rec = await registrarRecordatorio(mensualidad.id);
    expect(rec.ok).toBe(true);
    if (rec.ok) expect(texto(rec.datos.href)).toContain(`Puede ver el detalle en su portal: http://localhost:3013/c/${cliente.codigo}`);
  });

  it("el aviso de version sale de la plantilla de Ajustes", async () => {
    const v = await prisma.version.create({ data: { proyectoId, version: "2.0.0", fecha: "2026-09-17", cambios: { create: [{ tipo: "nuevo", texto: "Reporte semanal", orden: 0 }] } } });
    await guardarConfig(CLAVES.avisoVersion, "Salió la {version} de {proyecto}, {cliente}.\n{cambios}\nMírela aquí: {enlace}");
    const r = await marcarAvisada(v.id);
    expect(r.ok).toBe(true);
    if (r.ok) expect(texto(r.datos.href)).toBe(`Salió la 2.0.0 de PMS Hotel, Hotel Avisos.\n• Nuevo: Reporte semanal\nMírela aquí: http://localhost:3013/c/${cliente.codigo}`);
  });

  it("guardarMensajesAviso: solo el dueno; cada aviso lleva su variable; guarda los tres", async () => {
    const buenos = { hito: "Listo {hito} en {proyecto}.\n{enlace}", version: "Versión {version}:\n{cambios}\n{enlace}", cobro: "Cobro por {monto}, vence {vence}.\n{enlace}" };
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
    await expect(guardarMensajesAviso(fd(buenos))).rejects.toThrow("REDIRECT:/hoy");
    sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" };
    for (const malos of [{ ...buenos, hito: "Ya quedó listo, avise si lo ve." }, { ...buenos, version: "Publicamos una versión nueva." }, { ...buenos, cobro: "Le registré un cobro nuevo." }, { ...buenos, hito: "{hito}" }]) {
      const r = await guardarMensajesAviso(fd(malos));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.mensaje).toContain("{hito}");
    }
    expect((await guardarMensajesAviso(fd(buenos))).ok).toBe(true);
    expect(await leerConfig(CLAVES.avisoHito)).toBe(buenos.hito);
    expect(await leerConfig(CLAVES.avisoVersion)).toBe(buenos.version);
    expect(await leerConfig(CLAVES.avisoCobro)).toBe(buenos.cobro);
  });

  it("Ajustes solo toca cuentas del panel: la cuenta de un cliente no se vuelve prospectador ni recibe un PIN del panel", async () => {
    const cuenta = await prisma.usuario.findFirstOrThrow({ where: { clienteId: cliente.id } });
    const r = await guardarUsuario(fd({ id: String(cuenta.id), nombre: "Intruso", rol: "prospectador", metaDiaria: "5", activo: "on" }));
    expect(r.ok).toBe(false);
    const p = await restablecerPin(cuenta.id, "246813");
    expect(p.ok).toBe(false);
    expect(await prisma.usuario.findUniqueOrThrow({ where: { id: cuenta.id } })).toMatchObject({ rol: "cliente", nombre: cuenta.nombre, pinHash: cuenta.pinHash });
    // Una cuenta del panel se sigue pudiendo editar.
    expect((await guardarUsuario(fd({ id: String(ids.prospectadorId), nombre: "María José", rol: "prospectador", metaDiaria: "8", activo: "on" }))).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Verlo fallar**

Run: `PROSPECTOS_TEST_DB=1 npx vitest run tests/avisos.test.ts`
Expected: FAIL — no existen `avisarHito`, `avisarCobro`, `guardarMensajesAviso` ni `CLAVES.avisoHito`.

- [ ] **Step 3: Claves y textos de fábrica** — en `src/lib/configuracion.ts`:

Import nuevo: `import { AVISO_POR_DEFECTO, RENGLON_PORTAL_COBRO } from "@/lib/avisos-contrato";`

`CLAVES` gana tres entradas (después de `emisor`):
```ts
  avisoHito: "mensaje_aviso_hito",
  avisoVersion: "mensaje_aviso_version",
  avisoCobro: "mensaje_aviso_cobro",
```
y en `DEFECTOS` los dos mensajes de cobro quedan así y se suman los tres avisos:
```ts
  // El renglon del portal va solo: mensajeDeCobro lo quita entero si el cliente no tiene acceso (armarMensaje).
  [CLAVES.mensajeRecordatorio]: `Buenas, {cliente}. Le recuerdo el cobro de {concepto} de {proyecto} por {monto}, que vence el {vence}.\n${RENGLON_PORTAL_COBRO}\nCualquier duda me escribe por aquí. Gracias.`,
  [CLAVES.mensajeVencido]: `Buenas, {cliente}. Le escribo por el cobro de {concepto} de {proyecto} por {monto}, que venció el {vence}.\n${RENGLON_PORTAL_COBRO}\n¿Me confirma cuándo lo podemos regularizar? Gracias.`,
  [CLAVES.avisoHito]: AVISO_POR_DEFECTO.hito,
  [CLAVES.avisoVersion]: AVISO_POR_DEFECTO.version,
  [CLAVES.avisoCobro]: AVISO_POR_DEFECTO.cobro,
```

- [ ] **Step 4: `mensajeDeCobro` pasa por `armarMensaje`** — en `src/lib/mensajes-cobro.ts`, cambiar el import `rellenar` por `armarMensaje` y dejar el cuerpo de la función así (desaparecen el `const texto` y el bloque `.split("\n")…` que limpiaba los espacios: eso ya lo hace `armarMensaje`):

```ts
  const plantilla = c.estado === "vencido" ? plantillas.vencido : plantillas.recordatorio;
  const concepto = c.detalle ? `${ETIQUETA_CONCEPTO[c.concepto]} (${c.detalle})` : ETIQUETA_CONCEPTO[c.concepto];
  // {enlace} es el portal del cliente (pieza 5); sin acceso activo, armarMensaje quita entero el renglon que lo lleva.
  return armarMensaje(plantilla, { cliente: cliente.contactoNombre || cliente.nombre, proyecto: proyecto.nombre, monto: formatoUSD(c.monto), concepto, vence: fechaVisible(c.vence), enlace });
```

- [ ] **Step 5: `avisarHito`** — en `src/acciones/pendientes.ts`.

Imports nuevos:
```ts
import { leerConfig, CLAVES } from "@/lib/configuracion";
import { enlaceWhatsappCobro } from "@/lib/mensajes-cobro";
import { enlaceSiTieneAcceso } from "@/lib/acceso-cliente";
import { mensajeAvisoHito, quienRecibe } from "@/lib/avisos-contrato";
```
En `marcarPendiente`, el `data` del `updateMany` queda (desmarcar borra el aviso):
```ts
data: { hecho: e.data.hecho, hechoEn: e.data.hecho ? new Date() : null, ...(e.data.hecho ? {} : { avisadoEn: null }) }
```
Y al final del archivo:
```ts
// Aviso al cliente de un hito cumplido (pieza 5b). Como marcarAvisada de las versiones: se marca y se deja
// rastro en la misma transaccion, y un hito no se avisa dos veces (desmarcarlo le borra el aviso).
const HITO_YA_AVISADO = "HITO_YA_AVISADO";
export async function avisarHito(id: number): Promise<Resultado<{ href: string }>> {
  const u = await exigirRol("dueno");
  const e = Id.safeParse(id);
  if (!e.success) return fallo(ERROR);
  try {
    const p = await prisma.pendiente.findUnique({ where: { id: e.data }, include: { proyecto: { include: { cliente: true } } } });
    if (!p) return fallo("Ese pendiente ya no existe.");
    if (!p.hecho || !p.visibleCliente) return fallo("Solo se avisa un hito cumplido y visible al cliente.");
    const cliente = p.proyecto.cliente;
    // Sin WhatsApp no hay a quien avisar: se corta antes de marcar nada.
    if (!cliente.whatsapp) return fallo("El cliente no tiene WhatsApp cargado. Agrégalo en su ficha antes de avisar.");
    await prisma.$transaction(async (tx) => {
      const r = await tx.pendiente.updateMany({ where: { id: p.id, hecho: true, avisadoEn: null }, data: { avisadoEn: new Date() } });
      if (r.count === 0) throw new Error(HITO_YA_AVISADO);
      await tx.evento.create({ data: { proyectoId: p.proyectoId, usuarioId: u.id, tipo: "aviso_cliente", canal: "whatsapp", texto: `hito: ${p.texto}` } });
    });
    const mensaje = mensajeAvisoHito(await leerConfig(CLAVES.avisoHito), { cliente: quienRecibe(cliente), proyecto: p.proyecto.nombre, hito: p.texto, enlace: await enlaceSiTieneAcceso(p.proyecto.clienteId) });
    refrescar(p.proyectoId);
    // El whatsapp ya se valido arriba, asi que el enlace nunca sale nulo.
    return exito({ href: enlaceWhatsappCobro(cliente.whatsapp, mensaje)! });
  } catch (err) {
    if (err instanceof Error && err.message === HITO_YA_AVISADO) return fallo("Este hito ya se avisó.");
    console.error("avisarHito", err); return fallo(ERROR);
  }
}
```

- [ ] **Step 6: `avisarCobro`** — en `src/acciones/cobros.ts`. Import nuevo: `import { mensajeAvisoCobro, quienRecibe } from "@/lib/avisos-contrato";`. Al final del archivo:

```ts
// Aviso al cliente de un cobro que Neri registro a mano (pieza 5b): cuotas y extras sin pagar. Las mensualidades
// tienen su "Recordar" y los pagos su recibo por WhatsApp: aqui no entran.
const COBRO_YA_AVISADO = "COBRO_YA_AVISADO";
export async function avisarCobro(cobroId: number): Promise<Resultado<{ href: string }>> {
  const u = await exigirRol("dueno");
  const e = Id.safeParse(cobroId);
  if (!e.success) return fallo(ERROR);
  try {
    const c = await prisma.cobro.findUnique({ where: { id: e.data }, include: { proyecto: { include: { cliente: true } } } });
    if (!c) return fallo("Ese cobro no existe.");
    if (c.pagadoEn || c.anuladoEn) return fallo("Ese cobro ya está pagado o anulado.");
    if (c.concepto !== "cuota" && c.concepto !== "extra") return fallo("Solo se avisan las cuotas y los extras: las mensualidades tienen su recordatorio.");
    const cliente = c.proyecto.cliente;
    if (!cliente.whatsapp) return fallo("El cliente no tiene WhatsApp cargado. Agrégalo en su ficha antes de avisar.");
    await prisma.$transaction(async (tx) => {
      const r = await tx.cobro.updateMany({ where: { id: c.id, avisadoEn: null, pagadoEn: null, anuladoEn: null }, data: { avisadoEn: new Date() } });
      if (r.count === 0) throw new Error(COBRO_YA_AVISADO);
      await tx.evento.create({ data: { proyectoId: c.proyectoId, cobroId: c.id, usuarioId: u.id, tipo: "aviso_cliente", canal: "whatsapp", texto: `cobro: ${c.detalle}` } });
    });
    const mensaje = mensajeAvisoCobro(await leerConfig(CLAVES.avisoCobro), { cliente: quienRecibe(cliente), proyecto: c.proyecto.nombre, concepto: c.concepto as Concepto, detalle: c.detalle, monto: Number(c.monto), vence: c.vence, enlace: await enlaceSiTieneAcceso(c.proyecto.clienteId) });
    refrescar(c.proyectoId);
    return exito({ href: enlaceWhatsappCobro(cliente.whatsapp, mensaje)! });
  } catch (err) {
    if (err instanceof Error && err.message === COBRO_YA_AVISADO) return fallo("Este cobro ya se avisó.");
    console.error("avisarCobro", err); return fallo(ERROR);
  }
}
```

- [ ] **Step 7: La versión usa su plantilla** — en `src/acciones/versiones.ts`: quitar `ETIQUETA_CAMBIO` del import de `semver-contrato`, agregar

```ts
import { leerConfig, CLAVES } from "@/lib/configuracion";
import { mensajeAvisoVersion, quienRecibe } from "@/lib/avisos-contrato";
```
y en `marcarAvisada` reemplazar las cuatro líneas que arman `lineas`, `quien`, `enlace` y `mensaje` por:
```ts
    const mensaje = mensajeAvisoVersion(await leerConfig(CLAVES.avisoVersion), { cliente: quienRecibe(v.proyecto.cliente), proyecto: v.proyecto.nombre, version: v.version, cambios: v.cambios, enlace: await enlaceSiTieneAcceso(v.proyecto.clienteId) });
```

- [ ] **Step 8: Ajustes** — en `src/acciones/ajustes.ts`.

Import nuevo: `import { VARIABLE_OBLIGATORIA } from "@/lib/avisos-contrato";`. Constante (sin exportar) debajo de `MENSAJE_PIN`:
```ts
// Ajustes solo administra cuentas del panel. Las de rol "cliente" (pieza 5) se manejan desde la ficha del cliente.
const ROLES_PANEL = ["dueno", "prospectador"];
```
En `guardarUsuario`, el comentario de tres líneas «Reactivar una cuenta desactivada…» y el `prisma.usuario.update` se reemplazan por:
```ts
      // Reactivar no exige revisar pinEnUso: la unicidad del PIN es entre las cuentas del PANEL, activas o no
      // (ver src/lib/usuarios.ts). El where por rol impide tocar desde aqui la cuenta del portal de un cliente.
      const r = await prisma.usuario.updateMany({ where: { id: d.id, rol: { in: ROLES_PANEL } }, data: { nombre: d.nombre, rol: d.rol, metaDiaria: d.metaDiaria, activo } });
      if (r.count === 0) return fallo("Esa cuenta no existe.");
```
En `restablecerPin`, dentro del `try` y antes de `cambiarPin`:
```ts
    const cuenta = await prisma.usuario.findFirst({ where: { id: e.data.id, rol: { in: ROLES_PANEL } }, select: { id: true } });
    if (!cuenta) return fallo("Esa cuenta no existe.");
```
Y después de `guardarMensajesCobro`:
```ts
const avisoZ = (variable: string) => z.string().trim().min(10).max(1000).refine((s) => s.includes(variable), "variable");
const AvisosZ = z.object({ hito: avisoZ(VARIABLE_OBLIGATORIA.hito), version: avisoZ(VARIABLE_OBLIGATORIA.version), cobro: avisoZ(VARIABLE_OBLIGATORIA.cobro) });
export async function guardarMensajesAviso(formData: FormData): Promise<Resultado> {
  await exigirRol("dueno");
  const e = AvisosZ.safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("Cada aviso lleva su variable: {hito} en el de hitos, {version} en el de versiones y {monto} en el de cobros (entre 10 y 1000 caracteres).");
  try {
    await guardarConfig(CLAVES.avisoHito, e.data.hito);
    await guardarConfig(CLAVES.avisoVersion, e.data.version);
    await guardarConfig(CLAVES.avisoCobro, e.data.cobro);
    revalidatePath("/ajustes");
    return exito();
  } catch (err) { console.error("guardarMensajesAviso", err); return fallo(ERROR); }
}
```

- [ ] **Step 9: Verde**, una orden a la vez:

`PROSPECTOS_TEST_DB=1 npx vitest run tests/avisos.test.ts` → PASS.
`PROSPECTOS_TEST_DB=1 npx vitest run tests/cobros.test.ts tests/versiones.test.ts tests/pendientes-horas.test.ts tests/ajustes.test.ts tests/ajustes-cobros.test.ts tests/recibos-acciones.test.ts` → PASS. Si alguno compara **literalmente** el texto de fábrica viejo del recordatorio o del vencido, esa expectativa se actualiza al texto nuevo (y se dice en el reporte); cualquier otro fallo es un defecto del cambio, no del test.
`npx vitest run tests/instrumentation-grafo.test.ts` → PASS. `npx tsc --noEmit` → limpio.

- [ ] **Step 10: Commit**

```bash
git add src/lib/configuracion.ts src/lib/mensajes-cobro.ts src/acciones/pendientes.ts src/acciones/cobros.ts src/acciones/versiones.ts src/acciones/ajustes.ts tests/avisos.test.ts
git commit -F - <<'EOF'
feat(avisos): avisar al cliente de hitos y cobros, plantillas de aviso en Ajustes, y Ajustes solo toca cuentas del panel
EOF
```

---

### Task 6: El cliente ve sus documentos — consulta, pestaña y vigía de guardas

**Files:**
- Modify: `src/lib/portal.ts`, `src/app/c/[codigo]/proyecto/[id]/page.tsx`, `src/app/c/portal.css`
- Test: `tests/portal.test.ts` (se amplía), `tests/portal-guardas.test.ts` (nuevo, puro)

**Interfaces:**
- Consumes (Task 1): `prisma.documento`. (Task 2): `descripcionDocumento`, `siglaDocumento`, `TIPOS` de `@/lib/documentos-contrato`. (Task 4): `GET /c/documentos/<id>?c=<código>`, `GET /recibos/<archivo>?c=<código>`.
- Produces: `type DocumentoPortal = { id: number; nombre: string; sigla: string; descripcion: string; subidoEl: string; seDescarga: boolean }` y `ProyectoPortal.documentos: DocumentoPortal[]` (solo vigentes, el más nuevo primero).

- [ ] **Step 1: Tests que fallan.**

En `tests/portal.test.ts`, al final del `beforeAll` (después del `createMany` de cobros):
```ts
    await prisma.documento.createMany({ data: [
      { proyectoId: pms, nombre: "Manual de recepción", archivo: `documentos/${a.id}/11111111-1111-4111-8111-111111111111.pdf`, tipoMime: "application/pdf", tamano: 1_258_291, subidoEn: new Date("2026-09-12T16:00:00Z") },
      { proyectoId: pms, nombre: "Respaldo de tarifas", archivo: `documentos/${a.id}/22222222-2222-4222-8222-222222222222.zip`, tipoMime: "application/zip", tamano: 860_160, subidoEn: new Date("2026-09-14T16:00:00Z") },
      { proyectoId: pms, nombre: "SECRETO documento quitado", archivo: `documentos/${a.id}/33333333-3333-4333-8333-333333333333.pdf`, tipoMime: "application/pdf", tamano: 10, quitadoEn: new Date() },
      { proyectoId: deB, nombre: "SECRETO documento de B", archivo: `documentos/${b.id}/44444444-4444-4444-8444-444444444444.pdf`, tipoMime: "application/pdf", tamano: 10 },
    ] });
```
y un test nuevo antes del de «nada interno»:
```ts
  it("documentos: solo los vigentes de ESE proyecto, el mas nuevo primero, sin la ruta del archivo", async () => {
    const p = await proyectoPortal(a.id, pms, HOY);
    expect(p?.documentos).toEqual([
      { id: expect.any(Number), nombre: "Respaldo de tarifas", sigla: "ZIP", descripcion: "ZIP de 840 KB", subidoEl: "2026-09-14", seDescarga: true },
      { id: expect.any(Number), nombre: "Manual de recepción", sigla: "PDF", descripcion: "PDF de 1,2 MB", subidoEl: "2026-09-12", seDescarga: false },
    ]);
    expect(JSON.stringify(p)).not.toContain("documentos/");
    expect((await proyectoPortal(a.id, reservas, HOY))?.documentos).toEqual([]);
  });
```
(El test «nada interno» ya serializa `proyectoPortal` y prohíbe `SECRETO`: con el sembrado nuevo también vigila el documento quitado.)

`tests/portal-guardas.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Toda pagina o ruta bajo src/app/c/ exige la sesion del cliente. Las dos excepciones son la entrada (pide el
// PIN, no puede exigir sesion) y salir (solo borra la cookie). Una ruta nueva sin guarda hace fallar este test.
const RAIZ = path.join(process.cwd(), "src", "app", "c");
const SIN_GUARDA = ["[codigo]/page.tsx", "[codigo]/salir/route.ts"];

describe("guardas del portal", () => {
  const archivos = readdirSync(RAIZ, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /^(page\.tsx|route\.ts)$/.test(e.name))
    .map((e) => path.relative(RAIZ, path.join(e.parentPath, e.name)).split(path.sep).join("/"));

  it("encuentra las pantallas del portal (si esto da cero, el test dejo de mirar)", () => {
    expect(archivos).toContain("[codigo]/inicio/page.tsx");
    expect(archivos).toContain("documentos/[id]/route.ts");
    for (const excepcion of SIN_GUARDA) expect(archivos).toContain(excepcion);
  });

  it.each(archivos.filter((a) => !SIN_GUARDA.includes(a)))("%s exige la sesion del cliente", (archivo) => {
    expect(readFileSync(path.join(RAIZ, archivo), "utf8")).toMatch(/\b(exigirCliente|sesionCliente)\(/);
  });
});
```

- [ ] **Step 2: Verlos fallar**

Run: `PROSPECTOS_TEST_DB=1 npx vitest run tests/portal.test.ts` → FAIL (`documentos` no existe en el resultado). `npx vitest run tests/portal-guardas.test.ts` → PASS ya (las rutas de la Task 4 tienen su guarda): se confirma que **falla** quitándole a mano, sin guardar en git, la llamada `exigirCliente(codigo)` a `src/app/c/[codigo]/contacto/page.tsx`, corriendo el test, y devolviendo el archivo con `git checkout -- "src/app/c/[codigo]/contacto/page.tsx"`. Pegar las dos salidas en el reporte.

- [ ] **Step 3: La consulta** — en `src/lib/portal.ts`:

Import nuevo: `import { TIPOS, descripcionDocumento, siglaDocumento } from "@/lib/documentos-contrato";`

Tipo nuevo, encima de `ProyectoPortal`, y el campo en `ProyectoPortal`:
```ts
// La ruta del archivo en disco no sale nunca: el cliente lo pide por /c/documentos/<id>.
export type DocumentoPortal = { id: number; nombre: string; sigla: string; descripcion: string; subidoEl: string; seDescarga: boolean };
```
```ts
  documentos: DocumentoPortal[];
```
En el `select` de `proyectoPortal`, después de `cobros`:
```ts
      documentos: { where: { quitadoEn: null }, select: { id: true, nombre: true, tipoMime: true, tamano: true, subidoEn: true }, orderBy: [{ subidoEn: "desc" }, { id: "desc" }] },
```
y en el objeto que devuelve, después de `cobros: …`:
```ts
    documentos: p.documentos.map((d) => ({
      id: d.id, nombre: d.nombre, sigla: siglaDocumento(d.tipoMime), descripcion: descripcionDocumento(d), subidoEl: hoyCaracas(d.subidoEn),
      seDescarga: !(d.tipoMime in TIPOS && TIPOS[d.tipoMime as keyof typeof TIPOS].enLinea),
    })),
```

- [ ] **Step 4: La pestaña** — en `src/app/c/[codigo]/proyecto/[id]/page.tsx`:

El enlace del recibo gana `?c=` (sesión vencida → su PIN, no el del panel): `href={`/recibos/${c.reciboNumero}.pdf?c=${codigo}`}`.

El bloque `{t === "documentos" && ( … )}` se reemplaza entero por:
```tsx
      {t === "documentos" && (
        <>
          <section className="tarjeta">
            {!p.propuestaCodigo && p.documentos.length === 0
              ? <p style={{ margin: 0 }}>Todavía no hay documentos de este proyecto.</p>
              : (
                <ul className="documentos">
                  {p.propuestaCodigo && (
                    <li><a className="documento" href={`/p/${p.propuestaCodigo}`} target="_blank" rel="noopener">
                      <span className="documento__hoja" aria-hidden="true">WEB</span>
                      <span><span className="documento__nombre">La propuesta que aceptaste</span><small>Se abre en una pestaña nueva</small></span>
                    </a></li>
                  )}
                  {p.documentos.map((d) => (
                    <li key={d.id}><a className="documento" href={`/c/documentos/${d.id}?c=${codigo}`} target="_blank" rel="noopener">
                      <span className="documento__hoja" aria-hidden="true">{d.sigla}</span>
                      <span><span className="documento__nombre">{d.nombre}</span><small>{d.descripcion}, del {fechaVisible(d.subidoEl)}{d.seDescarga ? ". Se descarga a tu teléfono" : ""}</small></span>
                    </a></li>
                  ))}
                </ul>
              )}
          </section>
          <p className="portal__pie">¿Falta algún documento? Pídelo desde <a href={`/c/${codigo}/contacto`}>Contacto</a>.</p>
        </>
      )}
```

- [ ] **Step 5: CSS** — al final de `src/app/c/portal.css`, antes del bloque «Entrada con PIN» (copiado de `capturas/p5b-prototipo/nuevo.css`, sección del portal):

```css
/* Documentos: la fila entera es el enlace; la hoja dice el tipo con letras, no con un icono. */
.documentos { list-style: none; margin: 0; padding: 0; }
.documentos li { border-top: 1px solid var(--borde); }
.documentos li:first-child { border-top: 0; }
.documento { display: grid; grid-template-columns: 44px 1fr; gap: 14px; align-items: center; padding: 14px 0; min-height: 64px; text-decoration: none; }
.documentos li:first-child .documento { padding-top: 2px; }
.documentos li:last-child .documento { padding-bottom: 2px; }
.documento__hoja { position: relative; width: 44px; height: 54px; background: #e6ece8; color: var(--verde); clip-path: polygon(0 0, calc(100% - 13px) 0, 100% 13px, 100% 100%, 0 100%); display: flex; align-items: flex-end; justify-content: center; padding-bottom: 7px; font-family: var(--serif); font-weight: 600; font-size: 13px; }
.documento__hoja::before { content: ""; position: absolute; top: 0; right: 0; width: 13px; height: 13px; background: #c3cfc8; }
.documento__nombre { display: block; font-weight: 600; overflow-wrap: anywhere; }
.documento small { display: block; color: var(--tinta-suave); font-size: 14px; }
```

- [ ] **Step 6: Verde**

`PROSPECTOS_TEST_DB=1 npx vitest run tests/portal.test.ts` → PASS. `npx vitest run tests/portal-guardas.test.ts tests/portal-contrato.test.ts` → PASS. `npx tsc --noEmit` → limpio.

- [ ] **Step 7: Commit**

```bash
git add src/lib/portal.ts "src/app/c/[codigo]/proyecto/[id]/page.tsx" src/app/c/portal.css tests/portal.test.ts tests/portal-guardas.test.ts
git commit -F - <<'EOF'
feat(portal): el cliente ve y baja los documentos de su proyecto; vigia de que toda ruta de /c exija la sesion
EOF
```

---

### Task 7: Pantallas del panel — documentos, botones de aviso, Ajustes, y el recorrido

**Files:**
- Create: `src/componentes/TabDocumentos.tsx`
- Modify: `src/lib/proyectos.ts`, `src/app/(panel)/proyectos/[id]/page.tsx`, `src/componentes/TabPendientes.tsx`, `src/componentes/TabCobros.tsx`, `src/componentes/FormularioAjustesCobros.tsx`, `src/app/(panel)/ajustes/page.tsx`, `src/app/globals.css`, `scripts/verificar-flujo-portal.mts`
- Test: no hay test automático de pantalla: lo cubre el recorrido (lo corre el controlador en la Task 8). Aquí: `npx tsc --noEmit`, `npm test` y `npm run test:db` en verde.

**Interfaces:**
- Consumes (Task 2): `ACEPTA`, `problemaDeArchivo`, `descripcionDocumento`, `tamanoLegible`, `nombreVisible` de `@/lib/documentos-contrato` (puro: se puede importar en un componente de cliente). (Task 3): `documentosDeProyecto`, `type DocumentoFila`. (Task 4): `POST /proyectos/<id>/documentos` (campos `archivo`, `nombre`; responde `{ ok, datos | mensaje }`), `quitarDocumentoDeProyecto(id)`. (Task 5): `avisarHito(id)`, `avisarCobro(id)`, `guardarMensajesAviso(fd)`, `CLAVES.avisoHito|avisoVersion|avisoCobro`.
- Produces: `PendienteFila.avisado: boolean`, `CobroFila.avisado: boolean`; pestaña `?t=documentos` en `/proyectos/<id>`; capturas `capturas/p5-08-documentos.png` y `capturas/p5-09-panel-documentos.png`.

**Diseño:** `capturas/p5b-prototipo/panel.png` y `panel.html`. Las clases nuevas ya están probadas ahí a 390 px. Reglas de interacción que el código de abajo cumple y no se negocian: el archivo se valida **al elegirlo**, antes de subir (el botón queda apagado y el recuadro dice por qué); mientras sube, barra de progreso con porcentaje real (`XMLHttpRequest.upload.onprogress`; `fetch` no lo da) y el botón con `aria-disabled` para no perder el foco; al terminar, el formulario se vacía y la lista se refresca; si falla, el archivo elegido se conserva para reintentar; quitar es de dos pasos dentro de la fila, no un `confirm()` del navegador.

- [ ] **Step 1: Las filas saben si ya se avisó** — en `src/lib/proyectos.ts`: a `CobroFila` se le agrega `avisado: boolean` y a `PendienteFila` también `avisado: boolean`. En `fichaProyecto`, el objeto de cada cobro gana `avisado: c.avisadoEn !== null` y el de cada pendiente `avisado: x.avisadoEn !== null`.

- [ ] **Step 2: CSS del panel** — al final de `src/app/globals.css` (copiado de `capturas/p5b-prototipo/nuevo.css`, sección del panel):

```css
/* Pieza 5b: subir documentos. El selector nativo se tapa con un blanco grande para el dedo. */
.subida { position: relative; display: flex; flex-direction: column; gap: 2px; justify-content: center; min-height: 72px; padding: 12px 14px; border: 1px dashed var(--tinta-suave); border-radius: 10px; margin-bottom: 12px; }
.subida input[type=file] { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
.subida:focus-within { outline: 2px solid var(--verde); outline-offset: 2px; }
.subida--elegido { border-style: solid; border-color: var(--verde); }
.subida--error { border-style: solid; border-color: var(--rojo); }
.subida b { overflow-wrap: anywhere; }
.documento-fila { display: grid; grid-template-columns: 1fr auto; gap: 4px 8px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--borde); }
.documento-fila b { overflow-wrap: anywhere; }
```

- [ ] **Step 3: `src/componentes/TabDocumentos.tsx`**

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { DocumentoFila } from "@/lib/documentos";
import { ACEPTA, problemaDeArchivo, descripcionDocumento, tamanoLegible, nombreVisible } from "@/lib/documentos-contrato";
import { quitarDocumentoDeProyecto } from "@/acciones/documentos";

type Respuesta = { ok: true; datos: { id: number } } | { ok: false; mensaje: string } | null;

// Documentos que ve el cliente en su portal (pieza 5b). La subida va por XMLHttpRequest y no por una Server
// Action: es la unica forma de tener el porcentaje real, y el servidor la recibe en un route handler.
export function TabDocumentos({ proyectoId, documentos }: { proyectoId: number; documentos: DocumentoFila[] }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [nombre, setNombre] = useState("");
  const [progreso, setProgreso] = useState<number | null>(null);
  const [estado, setEstado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [vuelta, setVuelta] = useState(0); // cambia la key del <input type=file>: es la forma de vaciarlo
  const [porQuitar, setPorQuitar] = useState<number | null>(null);
  const [errorQuitar, setErrorQuitar] = useState("");
  const [quitando, empezar] = useTransition();
  const router = useRouter();
  const problema = archivo ? problemaDeArchivo({ nombre: archivo.name, tamano: archivo.size }) : null;
  const subiendo = progreso !== null;

  const elegir = (f: File | null) => { setArchivo(f); setEstado(null); setNombre(f ? nombreVisible("", f.name) : ""); };

  const subir = () => {
    if (!archivo || problema || subiendo) return; // aria-disabled no bloquea el clic: el guardia es este
    const fd = new FormData();
    fd.set("archivo", archivo);
    fd.set("nombre", nombre);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/proyectos/${proyectoId}/documentos`);
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgreso(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      const r = xhr.response as Respuesta;
      setProgreso(null);
      if (r?.ok) { setArchivo(null); setNombre(""); setVuelta((v) => v + 1); setEstado({ ok: true, texto: "Documento subido." }); router.refresh(); }
      else setEstado({ ok: false, texto: r?.mensaje ?? "No se pudo subir. Intenta de nuevo." });
    };
    xhr.onerror = () => { setProgreso(null); setEstado({ ok: false, texto: "Se cortó la conexión mientras subía. El archivo sigue elegido: intenta de nuevo." }); };
    setEstado(null);
    setProgreso(0);
    xhr.send(fd);
  };

  const quitar = (id: number) => empezar(async () => {
    const r = await quitarDocumentoDeProyecto(id);
    if (r.ok) { setPorQuitar(null); setErrorQuitar(""); router.refresh(); } else setErrorQuitar(r.mensaje);
  });

  return (
    <>
      <section className="tarjeta">
        <b>Documentos que ve el cliente</b>
        {documentos.length === 0 && <p className="suave" style={{ margin: "6px 0 0" }}>Todavía no le has subido ninguno.</p>}
        {documentos.map((d) => (
          <div key={d.id} className="documento-fila">
            <span><b>{d.nombre}</b><br /><span className="suave">{descripcionDocumento(d)}, subido el {d.subidoEn.toLocaleDateString("es-VE", { timeZone: "America/Caracas" })}</span></span>
            <span className="fila-botones" style={{ margin: 0 }}>
              <a className="boton mini" href={`/c/documentos/${d.id}`} target="_blank" rel="noopener">Ver</a>
              <button className="boton mini boton--peligro" onClick={() => { setErrorQuitar(""); setPorQuitar((a) => (a === d.id ? null : d.id)); }}>Quitar</button>
            </span>
            {porQuitar === d.id && (
              <div className="pregunta" style={{ gridColumn: "1 / -1" }}>
                <p style={{ margin: "0 0 8px" }}>El cliente deja de verlo en su portal. El archivo no se borra del servidor.</p>
                <div className="fila-botones">
                  <button className="boton boton--peligro" disabled={quitando} onClick={() => quitar(d.id)}>{quitando ? "Quitando…" : "Quitar documento"}</button>
                  <button className="boton" onClick={() => setPorQuitar(null)}>Conservar</button>
                </div>
                {errorQuitar && <p className="error" role="alert">{errorQuitar}</p>}
              </div>
            )}
          </div>
        ))}
      </section>
      <section className="tarjeta">
        <b>Subir un documento</b>
        <p className="suave" style={{ margin: "4px 0 10px" }}>PDF, JPG, PNG o ZIP, hasta 10 MB. El cliente lo ve apenas sube.</p>
        <label className={`subida${archivo ? (problema ? " subida--error" : " subida--elegido") : ""}`}>
          <input key={vuelta} type="file" accept={ACEPTA} disabled={subiendo} aria-label="Elegir archivo" onChange={(e) => elegir(e.target.files?.[0] ?? null)} />
          {archivo ? <b>{archivo.name}</b> : <b>Elegir archivo</b>}
          {!archivo && <span className="suave">Toca aquí para buscarlo en el teléfono</span>}
          {archivo && !problema && <span className="suave">{tamanoLegible(archivo.size)}. Toca para elegir otro</span>}
          {archivo && problema && <span className="error" role="alert">{problema}</span>}
        </label>
        {archivo && !problema && <label className="campo"><span>Nombre que verá el cliente</span><input value={nombre} maxLength={120} disabled={subiendo} onChange={(e) => setNombre(e.target.value)} /></label>}
        {subiendo && <div className="progreso" role="progressbar" aria-valuenow={progreso ?? 0} aria-valuemin={0} aria-valuemax={100} aria-label="Subida del documento"><i style={{ width: `${progreso ?? 0}%` }} /></div>}
        <p className={`estado-fila${estado && !estado.ok ? " estado-fila--error" : ""}`} role="status">{subiendo ? `Subiendo… ${progreso} %` : estado?.texto ?? ""}</p>
        <div className="fila-botones">
          <button className="boton boton--primario" disabled={!archivo || Boolean(problema)} aria-disabled={subiendo} onClick={subir}>{subiendo ? "Subiendo…" : "Subir documento"}</button>
        </div>
      </section>
    </>
  );
}
```

- [ ] **Step 4: La ficha del proyecto** — en `src/app/(panel)/proyectos/[id]/page.tsx`:

Imports nuevos: `import { documentosDeProyecto } from "@/lib/documentos";` y `import { TabDocumentos } from "@/componentes/TabDocumentos";`.
`PESTANAS`: entre `versiones` y `cliente` va `{ clave: "documentos", texto: "Documentos" }`.
`TEXTO_EVENTO` gana `documento_subido: "Documento subido", documento_quitado: "Documento quitado"`.
El `Promise.all` pide también los documentos:
```tsx
  const [p, tarifa, emisor, documentos] = await Promise.all([Number.isInteger(id) ? fichaProyecto(id, hoy) : null, leerTarifaHora(), leerEmisor(), Number.isInteger(id) && id > 0 ? documentosDeProyecto(id) : []]);
```
Debajo de la línea de `TabVersiones`:
```tsx
      {t === "documentos" && <TabDocumentos proyectoId={p.id} documentos={documentos} />}
```
Y en la pestaña Cliente, la frase vieja `<p className="suave">El acceso al portal del cliente llega en la pieza 5.</p>` se reemplaza por:
```tsx
          <p className="suave">El acceso al portal se envía desde la <Link href={`/clientes/${p.clienteId}`}>ficha del cliente</Link>.</p>
```

- [ ] **Step 5: «Avisar al cliente» en los hitos** — en `src/componentes/TabPendientes.tsx`:

Importar también `avisarHito`. Debajo de `const correr = …`:
```tsx
  // Igual que en TabVersiones: si window.open() vuelve bloqueado (comun en movil despues de un await), se deja el enlace a la vista.
  const [enlaceManual, setEnlaceManual] = useState<{ id: number; href: string } | null>(null);
  const avisar = (id: number) => empezar(async () => {
    const r = await avisarHito(id);
    if (r.ok) {
      const ventana = window.open(r.datos.href, "_blank", "noopener");
      setEnlaceManual(ventana ? null : { id, href: r.datos.href });
      setError("");
      router.refresh();
    } else setError(r.mensaje);
  });
```
El `pendientes.map` envuelve cada fila en un fragmento con `key` (importar `Fragment` de `react`) y le suma, **debajo** de la fila (a 390 px no cabe al lado de los otros cuatro botones), el renglón del aviso:
```tsx
      {pendientes.map((p, i) => (
        <Fragment key={p.id}>
          <div className="pendiente">
            …la fila de hoy, sin cambios, salvo que el <span> del texto queda asi:
            <span style={{ flex: 1 }}><span className={p.hecho ? "hecho" : ""}>{p.texto}</span>{p.fechaEstimada ? <span className="suave"> · {p.fechaEstimada}</span> : null}{p.avisado ? <span className="suave"> · avisado</span> : null}</span>
          </div>
          {p.hecho && p.visibleCliente && !p.avisado && (
            <div className="fila-botones" style={{ margin: "0 0 8px" }}><button className="boton mini" disabled={pendiente} onClick={() => avisar(p.id)}>Avisar al cliente</button></div>
          )}
          {enlaceManual?.id === p.id && <p className="suave">El navegador bloqueó la ventana: <a href={enlaceManual.href} target="_blank" rel="noopener">Abrir WhatsApp</a></p>}
        </Fragment>
      ))}
```
(«…la fila de hoy» es literalmente el `<div className="pendiente">` actual con su checkbox y sus cuatro botones; lo único que cambia adentro es ese `<span>`: el tachado ya no alcanza a «· avisado» ni a la fecha.)

- [ ] **Step 6: «Avisar al cliente» en los cobros** — en `src/componentes/TabCobros.tsx`:

Importar también `avisarCobro`. Debajo de `const recordar = …`:
```tsx
  const avisar = (id: number) => empezar(async () => {
    const r = await avisarCobro(id);
    if (r.ok) {
      const ventana = window.open(r.datos.href, "_blank");
      if (ventana) ventana.opener = null;
      setEnlaceManual(ventana ? null : { id, href: r.datos.href });
      setError("");
      router.refresh();
    } else setError(r.mensaje);
  });
```
En la fila de botones de un cobro sin pagar, entre «Recordar» y «Anular»:
```tsx
              {(c.concepto === "cuota" || c.concepto === "extra") && !c.avisado && <button className="boton mini" disabled={pendiente} onClick={() => avisar(c.id)}>Avisar al cliente</button>}
```
y en el renglón `suave` de la fila, después del `anulado: …`: `{c.avisado ? " · avisado al cliente" : ""}`.

- [ ] **Step 7: Ajustes** — en `src/componentes/FormularioAjustesCobros.tsx`:

Importar también `guardarMensajesAviso`. En `FormularioMensajesCobro`, la frase de ayuda queda:
```tsx
      <p className="suave">Variables: {"{cliente} {proyecto} {monto} {concepto} {vence} {enlace}"}. {"{enlace}"} es el portal del cliente: ponlo en su propio renglón, porque si ese cliente no tiene acceso activo ese renglón no se envía.</p>
```
Componente nuevo, debajo de `FormularioMensajesCobro`:
```tsx
export function FormularioMensajesAviso({ hito, version, cobro }: { hito: string; version: string; cobro: string }) {
  const { msj, pendiente, enviar } = useEnvio();
  return (
    <form className="tarjeta" action={(fd) => enviar(() => guardarMensajesAviso(fd))}>
      <b>Avisos al cliente</b>
      <p className="suave">Lo que se abre en WhatsApp con «Avisar al cliente». Variables de todos: {"{cliente} {proyecto} {enlace}"}. {"{enlace}"} va en su propio renglón: si el cliente no tiene acceso al portal, ese renglón no se envía.</p>
      <label className="campo"><span>Hito cumplido (lleva {"{hito}"})</span><textarea name="hito" rows={4} defaultValue={hito} /></label>
      <label className="campo"><span>Versión publicada (lleva {"{version}"}; {"{cambios}"} es la lista de cambios)</span><textarea name="version" rows={5} defaultValue={version} /></label>
      <label className="campo"><span>Cobro registrado (lleva {"{monto}"}; también {"{concepto}"} y {"{vence}"})</span><textarea name="cobro" rows={4} defaultValue={cobro} /></label>
      <button className="boton boton--primario" disabled={pendiente}>Guardar</button>
      {msj && <p className={msj.ok ? "suave" : "error"} role="status">{msj.texto}</p>}
    </form>
  );
}
```
En `src/app/(panel)/ajustes/page.tsx`: importar `FormularioMensajesAviso`; el `Promise.all` lee también `leerConfig(CLAVES.avisoHito)`, `leerConfig(CLAVES.avisoVersion)` y `leerConfig(CLAVES.avisoCobro)` (tres constantes nuevas: `avisoHito`, `avisoVersion`, `avisoCobro`); y debajo de `<FormularioMensajesCobro … />` va:
```tsx
      <FormularioMensajesAviso hito={avisoHito} version={avisoVersion} cobro={avisoCobro} />
```

- [ ] **Step 8: El recorrido** — `scripts/verificar-flujo-portal.mts`. Actualizar el comentario de cabecera (suma: documentos del cliente, subir y quitar desde el panel, sesión vencida).

(a) Debajo de `const PIN = "482915";`:
```ts
const PIN_PANEL = "739104"; // dueno temporal de este recorrido: se crea y se borra aqui
let duenoId = 0;
```
(b) Después del `writeFileSync` del recibo de prueba:
```ts
  // Documentos (pieza 5b): uno vigente con su archivo, uno quitado y uno de otro cliente.
  const archivoDoc = `documentos/${a.id}/${crypto.randomUUID()}.pdf`;
  mkdirSync(path.join(DIR, "documentos", String(a.id)), { recursive: true });
  writeFileSync(path.join(DIR, archivoDoc), "%PDF-1.4 manual de prueba del recorrido");
  const doc = await prisma.documento.create({ data: { proyectoId: pms.id, nombre: "Manual de recepción y cierre de caja", archivo: archivoDoc, tipoMime: "application/pdf", tamano: 39 } });
  await prisma.documento.create({ data: { proyectoId: pms.id, nombre: "QUITADO no debe verse", archivo: `documentos/${a.id}/${crypto.randomUUID()}.pdf`, tipoMime: "application/pdf", tamano: 10, quitadoEn: new Date() } });
  const docAjeno = await prisma.documento.create({ data: { proyectoId: ajeno.id, nombre: "Ajeno", archivo: `documentos/${otro.id}/${crypto.randomUUID()}.pdf`, tipoMime: "application/pdf", tamano: 10 } });
  duenoId = (await prisma.usuario.create({ data: { nombre: `Dueño ${marca}`, rol: "dueno", pinHash: await bcrypt.hash(PIN_PANEL, 10), metaDiaria: 0 } })).id;
```
(c) Entre el bloque «4. Avance y versiones» y el clic en «Contacto» (es decir, justo después del `sinScroll("versiones")`):
```ts
  // 4b. Documentos: la lista, bajar el propio; lo quitado y lo ajeno no existen
  await pg.getByRole("link", { name: "Documentos" }).click();
  await pg.getByText("Manual de recepción y cierre de caja").waitFor();
  if (await pg.getByText("QUITADO").count()) errores.push("se ve un documento quitado");
  await pg.screenshot({ path: "capturas/p5-08-documentos.png", fullPage: true });
  await sinScroll("documentos");
  const bajado = await ctx.request.get(`${BASE}/c/documentos/${doc.id}`);
  if (bajado.status() !== 200 || bajado.headers()["content-type"] !== "application/pdf") errores.push(`documento del cliente: ${bajado.status()}`);
  const docDeOtro = await ctx.request.get(`${BASE}/c/documentos/${docAjeno.id}`);
  if (docDeOtro.status() !== 404) errores.push(`documento ajeno deberia ser 404, fue ${docDeOtro.status()}`);

  // 4c. El dueno sube uno desde el panel (validacion al elegir, progreso, aviso) y el cliente lo ve; lo quita y deja de verlo
  const ctxPanel = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const panel = await ctxPanel.newPage();
  panel.on("pageerror", (e) => errores.push(`pageerror (panel): ${e.message}`));
  await panel.goto(`${BASE}/entrar`);
  for (const d of PIN_PANEL) await panel.getByRole("button", { name: d, exact: true }).click();
  await panel.waitForURL(/\/hoy$/);
  await panel.goto(`${BASE}/proyectos/${pms.id}?t=documentos`);
  await panel.getByText("Manual de recepción y cierre de caja").waitFor();
  await panel.setInputFiles("input[type=file]", { name: "video-recorrido.mp4", mimeType: "video/mp4", buffer: Buffer.from("no es un documento") });
  await panel.getByText("Solo se aceptan PDF, JPG, PNG o ZIP.").waitFor();
  if (!(await panel.getByRole("button", { name: "Subir documento" }).isDisabled())) errores.push("el boton de subir no se apago con un archivo que no entra");
  await panel.setInputFiles("input[type=file]", { name: "contrato-firmado.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 contrato de prueba del recorrido") });
  if ((await panel.getByLabel("Nombre que verá el cliente").inputValue()) !== "contrato-firmado") errores.push("el nombre no se propuso a partir del archivo");
  await panel.getByLabel("Nombre que verá el cliente").fill("Contrato firmado");
  await panel.screenshot({ path: "capturas/p5-09-panel-documentos.png", fullPage: true });
  const anchoPanel = await panel.evaluate(() => document.documentElement.scrollWidth);
  if (anchoPanel > 390) errores.push(`scroll horizontal en documentos del panel: ${anchoPanel}px`);
  await panel.getByRole("button", { name: "Subir documento" }).click();
  await panel.getByText("Documento subido.").waitFor();
  await panel.locator(".documento-fila", { hasText: "Contrato firmado" }).waitFor();
  await pg.reload();
  await pg.getByText("Contrato firmado").waitFor();
  await panel.locator(".documento-fila", { hasText: "Contrato firmado" }).getByRole("button", { name: "Quitar", exact: true }).click();
  await panel.getByRole("button", { name: "Quitar documento" }).click();
  await panel.locator(".documento-fila", { hasText: "Contrato firmado" }).waitFor({ state: "detached" });
  await pg.reload();
  await pg.getByText("Manual de recepción y cierre de caja").waitFor();
  if (await pg.getByText("Contrato firmado").count()) errores.push("el cliente sigue viendo un documento quitado");
  // Un .exe con nombre de PDF pasa la validacion del navegador y lo tiene que parar el servidor, por contenido.
  await panel.setInputFiles("input[type=file]", { name: "factura.pdf", mimeType: "application/pdf", buffer: Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]) });
  await panel.getByRole("button", { name: "Subir documento" }).click();
  await panel.getByText("Se revisa el contenido, no la extensión.").waitFor();
  await ctxPanel.close();
```
(d) Al final del bloque «6. Salir…», después de la comprobación `tras`:
```ts
  const vencida = await ctx.request.get(`${BASE}/c/documentos/${doc.id}?c=${a.codigo}`, { maxRedirects: 0 });
  if (vencida.status() !== 307 || vencida.headers()["location"] !== `/c/${a.codigo}`) errores.push(`con la sesion vencida el documento deberia volver al PIN del portal, fue ${vencida.status()} ${vencida.headers()["location"] ?? ""}`);
  const sinCodigo = await ctx.request.get(`${BASE}/c/documentos/${doc.id}`, { maxRedirects: 0 });
  if (sinCodigo.status() !== 404) errores.push(`sin sesion y sin codigo el documento deberia ser 404, fue ${sinCodigo.status()}`);
```
(e) En el `finally`, dentro del `for`, antes de `await prisma.cobro.deleteMany(…)`: `await prisma.documento.deleteMany({ where: { proyectoId: { in: pids } } });` y, después del `for`: `if (duenoId) await prisma.usuario.delete({ where: { id: duenoId } }).catch(() => {});`.

- [ ] **Step 9: Verde**, una orden a la vez: `npx tsc --noEmit` → limpio; `npm test` → PASS; `npm run test:db` → PASS. El script **no se corre aquí** (necesita el servidor del clon): lo corre el controlador.

- [ ] **Step 10: Commit**

```bash
git add src/componentes/TabDocumentos.tsx src/lib/proyectos.ts "src/app/(panel)/proyectos/[id]/page.tsx" src/componentes/TabPendientes.tsx src/componentes/TabCobros.tsx src/componentes/FormularioAjustesCobros.tsx "src/app/(panel)/ajustes/page.tsx" src/app/globals.css scripts/verificar-flujo-portal.mts
git commit -F - <<'EOF'
feat(documentos): pantallas del panel - subir y quitar documentos, avisar hitos y cobros, plantillas de aviso en Ajustes; recorrido ampliado
EOF
```

---

### Task 8 (solo el controlador): recorrido, revisión final, despliegue y documentación

- [ ] **Step 1: Recorrido en el clon.** `~/dev-clon-prospectos` en la rama `pieza-5b` (`git pull --ff-only origin pieza-5b`; si el esquema cambió, `npx prisma generate` en el clon). `cd` al clon **en orden aparte**; env en la misma shell con `DATABASE_URL="$TEST_DATABASE_URL"` y `PROSPECTOS_DIR_ARCHIVOS` a un directorio temporal del scratchpad, `unset NODE_ENV`; `nohup node node_modules/next/dist/bin/next dev -p 3014 -H 127.0.0.1 > log 2>&1 &`, `PID=$!`; `node_modules/.bin/tsx scripts/verificar-flujo-portal.mts` con `BASE_URL=http://127.0.0.1:3014`; `kill $PID $(pgrep -P $PID)`; comprobar `ss -ltnp | grep 3014` vacío y `pm2 list` sin reinicios nuevos. Expected: `PASS: recorrido del portal sin errores`. Mirar `capturas/p5-08-documentos.png` y `p5-09-panel-documentos.png` contra `capturas/p5b-prototipo/`.
- [ ] **Step 2: Revisión final de la rama** (modelo más capaz) con el paquete `review-package <plan> $(git merge-base main HEAD) HEAD`, los menores diferidos y los aparcados del libro. **Una** ronda de arreglos y **una** re-revisión acotada.
- [ ] **Step 3: `next build` en el clon** antes del build del despliegue (uno a la vez en el servidor).
- [ ] **Step 4: Fusionar y desplegar — con el ok de Neri.** `pm2 list`; `git checkout main && git merge --ff-only pieza-5b`; `npx tsc --noEmit`, `npm test`, `npm run test:db`; en subshell con el env: `npx prisma generate`, `npx prisma migrate deploy` (sin pendientes: la migración ya se aplicó en la Task 1), `npm run build`; `pm2 restart prospectos`. `npm ci` solo si cambió `package-lock.json` (este plan no agrega dependencias).
- [ ] **Step 5: Verificar.** 200 por el dominio; `pm2 list` (solo `prospectos` subió un reinicio); líneas `[mensualidades]` y `[revision]` en el log; `curl -sI https://prospectos.neracosu.com/c/documentos/1` → 404 con `X-Robots-Tag`; `ls -ld ~/prospectos-archivos` (el directorio `documentos/` nace con la primera subida real, en `700`).
- [ ] **Step 6: Documentación** — `CLAUDE.md`: fila 5 → «Implementada (5a y 5b)»; estado general; bloque «Pieza 5b» con: subida por route handler y por qué; `~/prospectos-archivos/documentos/` como **segundo directorio que no se regenera y necesita respaldo**; tipos por firma; quitar no borra; `armarMensaje` y la regla del renglón del `{enlace}`; aviso de cobro solo cuota/extra; `?c=` para la sesión vencida; `tests/portal-guardas.test.ts`; Ajustes solo toca cuentas del panel. Quitar de «Siguiente pieza» lo que ya se hizo; lo que sigue es la pasada de UX (sin aprobar). Commit en `main`.
- [ ] **Step 7: Memoria, respaldo del libro en `~/backups/prospectos-pieza5b-ledger-<fecha>.md`, borrar el workspace del plan.** Pendientes de Neri: probar una subida real de ~10 MB desde el teléfono (el tope de Apache/ModSecurity de este cPanel no se puede probar desde el clon) y decidir el respaldo de `~/prospectos-archivos/` (ahora son dos carpetas).

---

## Autorrevisión del plan contra la spec

| Requisito de la spec | Tarea |
|---|---|
| `Documento` con `proyectoId`, `nombre`, `archivo`, `tipoMime`, `tamano`, `subidoEn`, `usuarioId`; ruta fuera del docroot `documentos/<clienteId>/<uuid>.<ext>` | 1, 3 |
| Solo `dueno` sube; 10 MB; PDF/JPG/PNG/ZIP validado por contenido | 2, 3, 4 |
| Se sirven por `/c/documentos/<id>` con sesión del `clienteId` correcto o `dueno`; nunca por ruta directa | 4 |
| Pestaña Documentos: propuesta aceptada + archivos que Neri suba desde la ficha del proyecto | 6, 7 |
| «Avisar al cliente» al cumplir un hito visible, publicar una versión o registrar un cobro; plantillas `mensaje_aviso_hito/version/cobro` con sus variables y `{enlace}`; `Evento` `aviso_cliente`; sin correo ni push | 2, 5, 7 |
| `X-Robots-Tag: noindex` en `/c/documentos/*` | ya lo da `next.config.ts` (`/c/:path*`); la ruta además manda `x-robots-tag` propio (4) |
| El portal solo lee | 4 (la subida y el quitar exigen `dueno`), 6 (vigía de guardas) |
| Límite de peticiones por IP en `/c/*` | 4 |
| Aislamiento: documento del cliente B con sesión del A → 404 | 4 (test), 6 (test de consulta), 7 (recorrido) |
| Playwright a 390 px: abrir un documento | 7, 8 |

Fuera de este plan, a propósito: respaldo automático de `~/prospectos-archivos/` (decisión de Neri), vista previa de imágenes dentro del portal, varias subidas a la vez, y registrar qué documento abrió el cliente (la spec dice que no).
