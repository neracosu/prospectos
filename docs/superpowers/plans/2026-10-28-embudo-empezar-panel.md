# Embudo /empezar — parte 1: el panel recibe el embudo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que `prospectos.neracosu.com` acepte las solicitudes del embudo (`type: "embudo"` con respuestas, calificación y origen), los eventos de paso, y los muestre en `/web` y en el correo de aviso, antes de que la landing exista.

**Architecture:** Se extiende lo que ya existe para la medición de la web (21-oct): `web-contrato.ts` (puro, validación y resumen), `web.ts` (Prisma), `correo.ts` (aviso), `/web/page.tsx` (vista). Tres columnas nuevas en `SolicitudWeb` por migración escrita a mano; un tipo de evento nuevo (`paso`). Todo compatible hacia atrás: la home sigue mandando lo de siempre y nada se rompe si los campos nuevos no vienen.

**Tech Stack:** Next 15 (App Router), Prisma 6.19 sobre MariaDB, Vitest (`npm test`; con base: `npm run test:db`), TypeScript (`npm run tsc`).

**Spec:** `/home/neracosu/public_html/docs/superpowers/specs/2026-10-28-embudo-empezar-design.md` (secciones «Datos», «Medición» y «Cómo se hace → Panel»).

## Global Constraints

- Migraciones **solo** con un `migration.sql` escrito a mano y `prisma migrate deploy`; nunca `migrate dev` ni `db push` (CLAUDE.md del panel). Nada de columnas `Json`: las respuestas van como texto.
- Un solo `next build`, en el directorio del panel, nunca en paralelo con otro build de la cuenta. Antes de `pm2 restart prospectos`: `pm2 list` y confirmar el nombre. Nunca `pm2 restart all`.
- Los tests de base pegan contra la base de pruebas (`PROSPECTOS_TEST_DB=1`), de a uno (`fileParallelism: false`).
- Español de Venezuela en todo texto visible; comentarios en el código sin acentos (como el resto del repo).
- Valores fijos del diseño: tipo de solicitud `"embudo"`; calificación `"demo"` o `"diagnostico"`; pasos `p1`, `p2`, `p3`, `p4`, `resultado`, `datos`, `enviado`; ruta de la landing medida como `/empezar.html` (medir.js agrega `.html`); origen `de=` ya viene normalizado por medir.js como `o` en la vista.

## Review Focus

1. Un cliente viejo (la home de hoy) manda la solicitud sin `respuestas`, `calificacion` ni `origen`: tiene que guardarse igual, con cadenas vacías. → Tarea 1, test «sin campos nuevos».
2. `respuestas` llega como objeto gigante o con claves raras: se guarda solo lo conocido, recortado a 400 caracteres, nunca falla por eso. → Tarea 1, test «respuestas raras».
3. Un evento `paso` con un detalle que no está en la lista (p. ej. `p9`) se descarta sin tocar la base. → Tarea 1, test «paso desconocido».
4. En `/web`, una solicitud de embudo sin respuestas legibles (JSON roto en la base) no tumba la página: se muestra sin el bloque de respuestas. → Tarea 4, test de `respuestasLegibles`.
5. El correo con una calificación o un origen con saltos de línea no inyecta cabeceras (ya hay `limpiarCabecera`; el asunto nuevo pasa por ahí). → Tarea 3, test «asunto del embudo limpio».

---

### Task 1: Contrato puro: solicitud de embudo y evento `paso`

**Files:**
- Modify: `src/lib/web-contrato.ts`
- Test: `tests/web-contrato.test.ts`

**Interfaces:**
- Produces:
  - `export const PASOS_EMBUDO = [{ id: "p1", nombre: "Respondieron la 1" }, { id: "p2", nombre: "Respondieron la 2" }, { id: "p3", nombre: "Respondieron la 3" }, { id: "p4", nombre: "Respondieron la 4" }, { id: "resultado", nombre: "Vieron su recomendación" }, { id: "datos", nombre: "Abrieron el formulario" }, { id: "enviado", nombre: "Dejaron sus datos" }] as const`
  - `TIPOS_EVENTO` pasa a `["vista", "clic", "seccion", "paso"]`; `normalizarEvento` acepta `t: "paso"` con `d` dentro de `PASOS_EMBUDO` y lo descarta si no.
  - `export const CALIFICACIONES = ["demo", "diagnostico"] as const`
  - `export const CLAVES_RESPUESTAS = ["rubro", "actual", "objetivo", "tamano", "sistema"] as const` (las cuatro respuestas más el sistema recomendado, tal como lo calculó la landing)
  - `SolicitudNormal` suma `respuestas: string` (JSON de un objeto con solo `CLAVES_RESPUESTAS`, valores recortados a 40 caracteres, `""` si no vino nada), `calificacion: "" | "demo" | "diagnostico"`, `origen: string` (misma limpieza que el origen de la vista: minúsculas, `[a-z0-9.-]`, 120).
  - `normalizarSolicitud` lee `o.respuestas` (objeto), `o.calificacion`, `o.origen`. Para `type === "embudo"` el mensaje puede venir vacío: se arma uno (`"Embudo /empezar"`) para que el mínimo de 5 caracteres no lo rechace.
  - `export function respuestasLegibles(json: string): { clave: string; valor: string }[]` (devuelve `[]` si el JSON no se puede leer; las claves en el orden de `CLAVES_RESPUESTAS`; los valores pasan por `NOMBRES_RESPUESTA` para verse en español: `rubro` → «Rubro», `actual` → «Hoy trabaja con», `objetivo` → «Quiere lograr», `tamano` → «Tamaño», `sistema` → «Sistema recomendado»).
  - `ResumenWeb` suma `empezar: { personas: number; pasos: { id: string; nombre: string; personas: number }[]; origenes: { nombre: string; personas: number; enviaron: number }[] }`: `personas` = sesiones con una vista de `/empezar.html`; `pasos` = cuántas de esas sesiones tienen cada evento `paso`; `origenes` = esas personas por `clasificarOrigen` de su primera vista, con cuántas llegaron a `enviado`.

- [ ] **Step 1: Escribir los tests que fallan** en `tests/web-contrato.test.ts`, dentro de los `describe` existentes o en uno nuevo `describe("embudo /empezar")`:

```ts
it("normalizarEvento acepta paso con un detalle conocido y descarta p9", () => {
  expect(normalizarEvento({ s: "sesion12345", t: "paso", r: "/empezar.html", d: "p1" })).toMatchObject({ tipo: "paso", detalle: "p1" });
  expect(normalizarEvento({ s: "sesion12345", t: "paso", r: "/empezar.html", d: "p9" })).toBeNull();
});
it("una solicitud de embudo guarda respuestas, calificacion y origen", () => {
  const r = normalizarSolicitud({ nombre: "Ana", phone: "04121234567", type: "embudo", message: "", respuestas: { rubro: "hoteles", actual: "manual", objetivo: "cobros", tamano: "1", sistema: "hoteles", extra: "x" }, calificacion: "demo", origen: "TikTok" });
  expect(r.ok).toBe(true);
  if (r.ok) {
    expect(JSON.parse(r.datos.respuestas)).toEqual({ rubro: "hoteles", actual: "manual", objetivo: "cobros", tamano: "1", sistema: "hoteles" });
    expect(r.datos.calificacion).toBe("demo");
    expect(r.datos.origen).toBe("tiktok");
    expect(r.datos.mensaje.length).toBeGreaterThanOrEqual(5);
  }
});
it("sin campos nuevos (la home de hoy) sigue pasando con cadenas vacias", () => {
  const r = normalizarSolicitud({ nombre: "Ana Pérez", email: "ana@hotel.com", type: "Software a Medida", message: "Necesito un sistema" });
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.datos).toMatchObject({ respuestas: "", calificacion: "", origen: "" });
});
it("respuestas raras no rompen: se recortan y una calificacion desconocida queda vacia", () => {
  const r = normalizarSolicitud({ nombre: "Ana", phone: "04121234567", type: "embudo", respuestas: { rubro: "x".repeat(500), tamano: 7 }, calificacion: "vip" });
  expect(r.ok).toBe(true);
  if (r.ok) { expect(r.datos.respuestas.length).toBeLessThanOrEqual(400); expect(r.datos.calificacion).toBe(""); }
});
it("respuestasLegibles traduce y tolera JSON roto", () => {
  expect(respuestasLegibles('{"rubro":"hoteles","tamano":"1"}')).toEqual([{ clave: "Rubro", valor: "hoteles" }, { clave: "Tamaño", valor: "1" }]);
  expect(respuestasLegibles("{no es json")).toEqual([]);
  expect(respuestasLegibles("")).toEqual([]);
});
it("resumirWeb arma el embudo de /empezar por paso y por origen", () => {
  const t = new Date("2026-10-28T12:00:00Z");
  const ev = (sesion: string, tipo: string, detalle = "", origen = "", ruta = "/empezar.html"): EventoParaResumen => ({ sesion, tipo, ruta, detalle, origen, movil: true, creadoEn: t });
  const r = resumirWeb([
    ev("aaaaaaaa", "vista", "", "tiktok"), ev("aaaaaaaa", "paso", "p1"), ev("aaaaaaaa", "paso", "p4"), ev("aaaaaaaa", "paso", "enviado"),
    ev("bbbbbbbb", "vista", "", "tiktok"), ev("bbbbbbbb", "paso", "p1"),
    ev("cccccccc", "vista", "", "", "/"),
  ], 1);
  expect(r.empezar.personas).toBe(2);
  expect(r.empezar.pasos.find((p) => p.id === "p1")?.personas).toBe(2);
  expect(r.empezar.pasos.find((p) => p.id === "enviado")?.personas).toBe(1);
  expect(r.empezar.origenes).toEqual([{ nombre: "TikTok", personas: 2, enviaron: 1 }]);
});
```

`clasificarOrigen` tiene que devolver `"TikTok"` para `tiktok` (agregar la línea junto a Instagram y WhatsApp).

- [ ] **Step 2: Correr y ver que fallan**

Run: `cd /home/neracosu/public_html/prospectos.neracosu.com && npx vitest run tests/web-contrato.test.ts`
Expected: FAIL (`respuestasLegibles` no existe; `paso` se descarta; `empezar` undefined).

- [ ] **Step 3: Implementar en `src/lib/web-contrato.ts`** las constantes y funciones del bloque Interfaces. Las respuestas: `const limpiarRespuestas = (x: unknown): string` que toma solo `CLAVES_RESPUESTAS`, convierte cada valor a texto con `String(v).trim().slice(0, 40)`, descarta vacíos, y devuelve `""` si no queda nada o si `JSON.stringify` pasa de 400 (en ese caso recorta los valores a 20 y vuelve a intentar; si aún pasa, `""`). En `resumirWeb`, una `Persona` suma `pasos: Set<string>`; `empezar.personas` cuenta a quien tenga `/empezar.html` en `rutas`.

- [ ] **Step 4: Correr tests**

Run: `npx vitest run tests/web-contrato.test.ts && npm run tsc`
Expected: PASS, tsc sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/lib/web-contrato.ts tests/web-contrato.test.ts
git commit -m "feat(web): contrato del embudo /empezar: solicitud con respuestas y calificacion, evento paso, resumen por paso y origen"
```

---

### Task 2: Base de datos y consultas

**Files:**
- Modify: `prisma/schema.prisma` (modelo `SolicitudWeb`)
- Create: `prisma/migrations/20261029090000_embudo_empezar/migration.sql`
- Modify: `src/lib/web.ts` (`guardarSolicitud`, `SolicitudFila`, `listarSolicitudes`)
- Test: `tests/web.test.ts`

**Interfaces:**
- Consumes: `SolicitudNormal` con `respuestas`, `calificacion`, `origen` (Tarea 1).
- Produces: `SolicitudFila` suma `respuestas: string; calificacion: string; origen: string`. `EventoWeb.tipo` admite `paso` (sin cambio de esquema: es `VarChar(20)`; actualizar el comentario).

- [ ] **Step 1: Escribir el test que falla** en `tests/web.test.ts`, dentro del `describe.runIf(DB_HABILITADA)`:

```ts
it("guarda una solicitud de embudo con sus campos y la lista con ellos", async () => {
  const r = await postSolicitud(peticion("/api/web/solicitud", { nombre: "Luis", phone: "04141234567", type: "embudo", message: "", respuestas: { rubro: "comercio", actual: "web", objetivo: "cobros", tamano: "1", sistema: "cobros" }, calificacion: "demo", origen: "tiktok", sesion: "sesion12345", sitio: "" }));
  expect(r.status).toBe(200);
  const fila = (await listarSolicitudes()).find((s) => s.nombre === "Luis");
  expect(fila).toMatchObject({ tipo: "embudo", calificacion: "demo", origen: "tiktok" });
  expect(JSON.parse(fila!.respuestas)).toMatchObject({ rubro: "comercio" });
});
it("un evento paso se guarda y entra al resumen de /empezar", async () => {
  await postEvento(peticion("/api/web/evento", { s: "sesion77777", t: "vista", r: "/empezar", o: "tiktok", m: true }));
  await postEvento(peticion("/api/web/evento", { s: "sesion77777", t: "paso", r: "/empezar", d: "p1" }));
  const r = await resumenWeb(7);
  expect(r.empezar.personas).toBeGreaterThanOrEqual(1);
  expect(r.empezar.pasos.find((p) => p.id === "p1")!.personas).toBeGreaterThanOrEqual(1);
});
```

(Ojo: medir.js manda la ruta como `/empezar.html`; el test de arriba manda `/empezar` a propósito para fijar que el resumen cuente las dos formas: en `resumirWeb`, la condición es `ruta === "/empezar.html" || ruta === "/empezar"`. Agregar esa segunda forma también al test de la Tarea 1 si no está.)

- [ ] **Step 2: Correr y ver que falla**

Run: `npm run test:db -- tests/web.test.ts`
Expected: FAIL (Prisma rechaza `respuestas`: columna desconocida).

- [ ] **Step 3: Esquema y migración.** En `schema.prisma`, a `SolicitudWeb` agregar `respuestas String @default("") @db.VarChar(400)`, `calificacion String @default("") @db.VarChar(20)`, `origen String @default("") @db.VarChar(120)`. Escribir a mano:

```sql
ALTER TABLE `SolicitudWeb`
  ADD COLUMN `respuestas` VARCHAR(400) NOT NULL DEFAULT '',
  ADD COLUMN `calificacion` VARCHAR(20) NOT NULL DEFAULT '',
  ADD COLUMN `origen` VARCHAR(120) NOT NULL DEFAULT '';
```

Aplicar a la base de pruebas con `PROSPECTOS_TEST_DB=1 npx prisma migrate deploy` (leer en `tests/preparar-entorno.ts` cómo se resuelve la URL de esa base) y `npx prisma generate`.

- [ ] **Step 4: `web.ts`.** `guardarSolicitud` ya pasa `data: d` completo: basta con que el tipo coincida. `SolicitudFila` y el `select` de `listarSolicitudes` suman las tres columnas.

- [ ] **Step 5: Correr tests**

Run: `npm run test:db -- tests/web.test.ts && npm run tsc`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261029090000_embudo_empezar src/lib/web.ts tests/web.test.ts
git commit -m "feat(web): columnas respuestas, calificacion y origen en SolicitudWeb; evento paso"
```

---

### Task 3: El correo de aviso cuenta el embudo

**Files:**
- Modify: `src/lib/correo.ts` (`armarCorreo`)
- Test: `tests/correo.test.ts`

**Interfaces:**
- Consumes: `respuestasLegibles` (Tarea 1), `SolicitudNormal` con los campos nuevos.

- [ ] **Step 1: Test que falla**

```ts
it("una solicitud de embudo lleva asunto propio, las respuestas y la calificacion", () => {
  const m = armarCorreo({ ...d, tipo: "embudo", mensaje: "Embudo /empezar", respuestas: '{"rubro":"hoteles","actual":"manual","objetivo":"cobros","tamano":"1","sistema":"hoteles"}', calificacion: "demo", origen: "tiktok" });
  expect(m).toMatch(/Subject: .*Embudo/);
  expect(m).toContain("Rubro: hoteles");
  expect(m).toContain("Califica para: demostracion con su marca");
  expect(m).toContain("Llego desde: TikTok");
});
it("sin calificacion ni origen no agrega lineas vacias", () => {
  const m = armarCorreo({ ...d, respuestas: "", calificacion: "", origen: "" });
  expect(m).not.toContain("Califica para");
  expect(m).not.toContain("Llego desde");
});
```

Actualizar el `d` del archivo con `respuestas: "", calificacion: "", origen: ""`.

- [ ] **Step 2: Correr y ver que falla.** Run: `npx vitest run tests/correo.test.ts`. Expected: FAIL.

- [ ] **Step 3: Implementar en `armarCorreo`.** Asunto: si `d.tipo === "embudo"`, `Embudo /empezar: ${nombre}` (+ ` · demo` si califica). Cuerpo: después de «Tipo de proyecto», las líneas `Llego desde: ${clasificarOrigen(d.origen)}` (solo si hay origen), `Califica para: demostracion con su marca` / `diagnostico por escrito` (solo si hay calificación), y un bloque «Respuestas:» con `respuestasLegibles(d.respuestas)` una por línea (`Clave: valor`), solo si hay alguna. Todo pasa por `limpiarCabecera` donde vaya a cabecera.

- [ ] **Step 4: Correr tests.** Run: `npx vitest run tests/correo.test.ts && npm run tsc`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/correo.ts tests/correo.test.ts
git commit -m "feat(web): el aviso por correo lleva las respuestas y la calificacion del embudo"
```

---

### Task 4: `/web` muestra el embudo y las respuestas

**Files:**
- Modify: `src/app/(panel)/web/page.tsx`
- Test: ninguno nuevo de página (se verifica con `tsc`, `next build` en el despliegue y a ojo); la lógica pura ya quedó probada en la Tarea 1.

**Interfaces:**
- Consumes: `r.empezar` del `ResumenWeb`, `SolicitudFila` con `respuestas`, `calificacion`, `origen`, `respuestasLegibles`, `clasificarOrigen`.

- [ ] **Step 1: Tarjeta de solicitud.** En cada `article`, si `s.tipo === "embudo"`: el `dd` de «Proyecto» dice «Embudo /empezar»; una etiqueta `etiqueta etiqueta--nuevo` con «Califica para demostración» o «Diagnóstico por escrito» según `calificacion`; una fila `dt` «Llegó desde» con `clasificarOrigen(s.origen)` si hay origen; y debajo del mensaje, un `dl className="datos"` con `respuestasLegibles(s.respuestas)` (clave → valor). Si `respuestasLegibles` devuelve `[]`, no se pinta nada.

- [ ] **Step 2: Sección nueva** después de «Del clic a la solicitud»:

```tsx
<section className="tarjeta">
  <h3 className="web-sub">Embudo de /empezar</h3>
  {r.empezar.personas === 0 ? <p className="suave">Nadie ha abierto /empezar en este periodo.</p> : (<>
    <p className="suave">De {r.empezar.personas} que la abrieron.</p>
    <Barras filas={r.empezar.pasos.map((p) => ({ nombre: p.nombre, n: p.personas, de: r.empezar.personas }))} />
    <h4 className="web-sub">Por dónde llegaron</h4>
    <Barras filas={r.empezar.origenes.map((o) => ({ nombre: `${o.nombre} · ${o.enviaron} dejaron datos`, n: o.personas, de: r.empezar.personas }))} />
  </>)}
</section>
```

- [ ] **Step 3: Verificar**

Run: `npm run tsc && npm test`
Expected: sin errores; todos los tests en verde.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(panel)/web/page.tsx"
git commit -m "feat(web): bloque del embudo /empezar y respuestas en cada solicitud"
```

---

### Task 5: Desplegar el panel

**Files:** ninguno nuevo.

- [ ] **Step 1: Confirmar que no hay otro build corriendo en la cuenta** (`pgrep -fa "next build"` vacío) y que el árbol está limpio (`git status`). Nota: en el árbol hay un `.htaccess` modificado que no es de este trabajo: no tocarlo ni incluirlo.

- [ ] **Step 2: Migrar y construir**

Run: `cd /home/neracosu/public_html/prospectos.neracosu.com && npx prisma migrate deploy && npm run build`
Expected: «1 migration applied» (o «already applied» si la base de pruebas es la misma) y build sin errores.

- [ ] **Step 3: Reiniciar solo el proceso del panel**

Run: `pm2 list | grep -E "prospectos|name"` y luego `pm2 restart prospectos`
Expected: `prospectos` online; el contador de reinicios sube en uno y no más.

- [ ] **Step 4: Verificar en vivo**

Run: `curl -s -o /dev/null -w "%{http_code}\n" https://prospectos.neracosu.com/entrar` → `200`. Mandar un evento de prueba: `curl -s -X POST https://prospectos.neracosu.com/api/web/evento -H "Origin: https://neracosu.com" -H "User-Agent: Mozilla/5.0 (Linux; Android 13) Chrome/120 Mobile" -H "Content-Type: text/plain" --data '{"s":"pruebaplan01","t":"paso","r":"/empezar.html","d":"p1"}'` → `{"ok":true}`. Abrir `/web` y ver la sección «Embudo de /empezar». Borrar el evento de prueba (`sesion = 'pruebaplan01'`) por Prisma o SQL.

- [ ] **Step 5: Commit del despliegue** (si quedó algo por commitear) y anotar en el CLAUDE.md del panel, en la sección de medición web, una línea: «Desde el 2026-10-29 acepta `type: "embudo"` (respuestas, calificación, origen) y el evento `paso`; se ve en /web».
