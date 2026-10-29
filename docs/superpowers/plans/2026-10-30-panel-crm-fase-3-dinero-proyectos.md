# Panel CRM, fase 3: dinero y proyectos — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sacar el dinero de dentro de cada proyecto: una sección `/cobros` propia, la tabla de proyectos, la ficha de proyecto a dos columnas con los formularios detrás de botones y el historial plegado, y `/web` con «Personas por día» en barras compactas.

**Architecture:** Mismo stack (Next 15 App Router, Prisma 6 sobre MariaDB, CSS propio en `globals.css`). Sin migración: todo sale de `Cobro`, `Proyecto` y `Pendiente` que ya existen. Lo puro (filtros de cobros, próximo cobro de un proyecto) va en contratos probados con Vitest; las consultas en `src/lib/`; las acciones de cobros existentes se reutilizan desde `/cobros` y revalidan también esa ruta. La sección «Cobros» entra en la navegación por contrato (`navegacion-contrato.ts`), que es la única fuente de la barra lateral y la inferior.

**Tech Stack:** Next 15, React 19 (`useOptimistic`, `useTransition`), Prisma 6, Vitest (`npm run test:db`), Playwright contra el clon `~/dev-clon-prospectos` en 3021 con la base de tests.

**Spec:** `docs/superpowers/specs/2026-10-29-panel-crm-design.md` (secciones «Clientes y proyectos», «Cobros», «Web», «Escritorio», «Teléfono», fase 3 de «Cómo se hace»).

## Global Constraints

- Español de Venezuela en todo texto visible; el panel tutea a Neri; comentarios del código sin acentos.
- Teléfono primero: todo se revisa a 390 px; escritorio desde 1024 px (único breakpoint). Tablas con `.tabla` (filas apiladas con `data-label` en el teléfono, tabla desde 1024).
- Sin librerías de interfaz; CSS propio con los tokens de `globals.css`. Nada de tarjetas dentro de tarjetas.
- Nada se borra: los cobros se anulan con motivo. Las acciones de cobros existentes (`marcarPagado`, `deshacerPago`, `anularCobro`, `registrarRecordatorio`, `avisarCobro`) no cambian de regla; solo revalidan además `/cobros`.
- Un `prospectador` no entra a `/cobros` ni a `/proyectos` (`exigirRol("dueno")`), y nunca ve montos.
- Tests con base solo contra `neracosu_prospectos_test` (`env -u PROSPECTOS_URL_PUBLICA npm run test:db`). Recorridos Playwright solo contra el clon (`node node_modules/next/dist/bin/next dev -p 3021 -H 127.0.0.1` desde `~/dev-clon-prospectos`, sincronizado con `rsync -rlt`). Un build a la vez, nunca desde un subagente.
- Commits por heredoc (`git commit -F -`) con `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Rama `panel-crm-fase-3` desde `main`.

## Review Focus

1. Un cobro **anulado** no debe aparecer en «pendientes», «vencidos» ni «este mes», y sí en «pagados» solo si tenía pago (Task 1: `filtrarCobros` con anulado+pagado).
2. Marcar pagado desde `/cobros` y volver a `/proyectos/<id>?t=cobros`: la fila tiene que verse pagada sin recargar a mano (Task 2: `refrescar` revalida `/cobros`, `/proyectos/<id>`, `/inicio`).
3. Un proyecto **sin cobros pendientes** muestra «—» en «Próximo cobro», no una fecha vacía ni «Invalid Date» (Task 3: `proximoCobroDe` devuelve `null`).
4. En la ficha a dos columnas, los formularios de alta cerrados por defecto **no pierden lo escrito** al abrirse/cerrarse dentro de la misma pestaña, y cambiar de pestaña con `?t=` no muestra el esqueleto (Task 4: estado local `abierto` por pestaña; lo verifica el recorrido).
5. «Personas por día» con **un solo día** o con **cero** personas en todos: barras con altura 0 y sin división por cero (Task 5: `alturaBarra(n, max)` devuelve 0 si `max === 0`).

---

### Task 1: Contrato y consultas de cobros de todos los proyectos

**Files:**
- Modify: `src/lib/cobros-contrato.ts`
- Create: `src/lib/cobros.ts`
- Modify: `src/lib/proyectos.ts` (`CobroFila` suma `proyectoId` y `proyectoNombre`)
- Test: `tests/cobros-contrato.test.ts`, `tests/cobros-lista.test.ts` (nuevo, con base)

**Interfaces:**
- Produces: `FILTROS_COBROS = ["pendientes", "vencidos", "mes", "pagados"] as const`, `type FiltroCobros`, `ETIQUETA_FILTRO_COBROS: Record<FiltroCobros, string>` (Pendientes · Vencidos · Este mes · Pagados), `esFiltroCobros(s: string): s is FiltroCobros`, `filtrarCobros<T extends { vence: string; pagadoEn: Date | null; anuladoEn: Date | null }>(cobros: T[], filtro: FiltroCobros, hoy: string): T[]`, `ordenarCobros<T extends { vence: string; estado: EstadoCobro }>(cobros: T[]): T[]` (vencidos primero, luego por `vence` ascendente; pagados por `vence` descendente).
- Produces: `listarCobros(filtro: FiltroCobros, hoy: string): Promise<CobroFila[]>` en `src/lib/cobros.ts` (hasta 300 filas; `recordadoHoy` igual que `fichaProyecto`), `cifrasCobros(hoy)` = `resumenMes(hoy)` reexportado con nombre claro.
- `CobroFila` (en `proyectos.ts`) gana `proyectoId: number; proyectoNombre: string` (Task 2 lo pinta; `fichaProyecto` los rellena con el propio proyecto).

- [ ] **Step 1: Prueba pura en rojo** (`tests/cobros-contrato.test.ts`, añadir):

```ts
describe("filtrarCobros y ordenarCobros (fase 3)", () => {
  const hoy = "2026-10-30";
  const c = (vence: string, extra: Partial<{ pagadoEn: Date | null; anuladoEn: Date | null }> = {}) => ({ vence, pagadoEn: null, anuladoEn: null, ...extra });
  const vencido = c("2026-10-20"), esteMes = c("2026-10-31"), proximo = c("2026-11-05");
  const pagado = c("2026-10-01", { pagadoEn: new Date("2026-10-02T12:00:00-04:00") });
  const anulado = c("2026-10-10", { anuladoEn: new Date() });
  const anuladoPagado = c("2026-10-10", { pagadoEn: new Date(), anuladoEn: new Date() });
  const todos = [vencido, esteMes, proximo, pagado, anulado, anuladoPagado];
  it("pendientes = sin pagar ni anular, de cualquier fecha", () => expect(filtrarCobros(todos, "pendientes", hoy)).toEqual([vencido, esteMes, proximo]));
  it("vencidos = pendientes con vence < hoy", () => expect(filtrarCobros(todos, "vencidos", hoy)).toEqual([vencido]));
  it("mes = pendientes que vencen en el mes de hoy, vencidos incluidos", () => expect(filtrarCobros(todos, "mes", hoy)).toEqual([vencido, esteMes]));
  it("pagados = con pagadoEn y sin anular", () => expect(filtrarCobros(todos, "pagados", hoy)).toEqual([pagado]));
  it("ordenarCobros: vencidos primero y luego por fecha; pagados del mas reciente al mas viejo", () => {
    const filas = [{ vence: "2026-11-05", estado: "por_vencer" as const }, { vence: "2026-10-20", estado: "vencido" as const }, { vence: "2026-10-31", estado: "pendiente" as const }];
    expect(ordenarCobros(filas).map((f) => f.vence)).toEqual(["2026-10-20", "2026-10-31", "2026-11-05"]);
    const pagados = [{ vence: "2026-09-05", estado: "pagado" as const }, { vence: "2026-10-05", estado: "pagado" as const }];
    expect(ordenarCobros(pagados).map((f) => f.vence)).toEqual(["2026-10-05", "2026-09-05"]);
  });
  it("esFiltroCobros acepta solo los cuatro", () => { expect(esFiltroCobros("mes")).toBe(true); expect(esFiltroCobros("todo")).toBe(false); });
});
```

- [ ] **Step 2: Correr** `npx vitest run tests/cobros-contrato.test.ts` — Expected: FAIL, `filtrarCobros is not a function` (import roto).
- [ ] **Step 3: Implementar** en `cobros-contrato.ts` las cinco exportaciones del bloque Interfaces. `mes` usa `mesDe(c.vence) === mesDe(hoy)` **o** `c.vence < hoy`.
- [ ] **Step 4: Correr** el mismo test — Expected: PASS; `npm test` sigue en verde.
- [ ] **Step 5: Prueba con base en rojo** (`tests/cobros-lista.test.ts`, mismo `vi.mock` de sesión que `tests/cobros.test.ts`): siembra cliente + dos proyectos («PMS Hotel», «Tienda») con `sembrarProyecto` y tres cobros a mano (`prisma.cobro.create`: uno vencido en el proyecto 1, uno pagado en el 2, uno anulado en el 2). Asserts: `listarCobros("vencidos", hoy)` trae uno con `proyectoNombre === "PMS Hotel"` y `estado === "vencido"`; `listarCobros("pagados", hoy)` trae uno con `proyectoNombre === "Tienda"`; `listarCobros("pendientes", hoy)` no trae el anulado; `(await fichaProyecto(p1.id, hoy))!.cobros[0].proyectoNombre === "PMS Hotel"`.
- [ ] **Step 6: Correr** `env -u PROSPECTOS_URL_PUBLICA npm run test:db -- tests/cobros-lista.test.ts` — Expected: FAIL (módulo `@/lib/cobros` no existe).
- [ ] **Step 7: Implementar** `src/lib/cobros.ts`: `findMany` con `where` según filtro (`pendientes`: `pagadoEn: null, anuladoEn: null`; `vencidos`: además `vence: { lt: hoy }`; `mes`: además `vence: { lte: finDeMes(hoy) }`; `pagados`: `pagadoEn: { not: null }, anuladoEn: null`), `include proyecto { nombre }`, `take: 300`, y luego `ordenarCobros` sobre filas mapeadas igual que en `fichaProyecto` (extraer de `proyectos.ts` una función `aCobroFila(c, hoy, recordadosHoy, proyectoId, proyectoNombre)` y usarla en los dos sitios).
- [ ] **Step 8: Correr** `env -u PROSPECTOS_URL_PUBLICA npm run test:db -- tests/cobros-lista.test.ts tests/clientes-proyectos.test.ts tests/cobros.test.ts` — Expected: PASS.
- [ ] **Step 9: Commit** `feat(cobros): contrato de filtros y consulta de cobros de todos los proyectos`.

---

### Task 2: Sección `/cobros` y la navegación

**Files:**
- Modify: `src/lib/navegacion-contrato.ts`, `src/componentes/Icono.tsx`, `tests/navegacion-contrato.test.ts`
- Create: `src/app/(panel)/cobros/page.tsx`, `src/componentes/TablaCobros.tsx`
- Modify: `src/acciones/cobros.ts` (`refrescar` añade `revalidatePath("/cobros")`), `src/componentes/CifrasInicio.tsx` (cifra «Por cobrar» → `/cobros`), `src/lib/inicio-contrato.ts` (ítem cobro → `href: "/cobros"`), `tests/inicio-contrato.test.ts`, `src/app/globals.css`
- Test: `tests/navegacion-contrato.test.ts`, `tests/inicio-contrato.test.ts`

**Interfaces:**
- Consumes: `listarCobros`, `cifrasCobros`, `FILTROS_COBROS`, `ETIQUETA_FILTRO_COBROS`, `esFiltroCobros` (Task 1); `AccionesRecibo`, `MasAcciones`, `Campo`, `aplicarCambioCobro`, acciones de `@/acciones/cobros`.
- Produces: sección `S.cobros = { href: "/cobros", texto: "Cobros", icono: "cobros" }`; dueño: `[inicio, leads, solicitudes, cobros, proyectos, directorio, web, ajustes]`, barra inferior fijas = las cuatro primeras, «Más» = `[/proyectos, /directorio, /web, /ajustes]`. `TablaCobros({ cobros, hoy, emisorListo, filtro })` client: tabla `.tabla` (Vence · Proyecto · Concepto · Monto · Estado · acciones) con las mismas acciones de `TabCobros` por fila (Marcar pagado con formulario en línea, Recordar, Avisar, Anular con motivo, recibo) y `useOptimistic` con `aplicarCambioCobro`.

- [ ] **Step 1: Tests en rojo**: en `tests/navegacion-contrato.test.ts` cambiar las expectativas: fijas `["Inicio", "Leads", "Solicitudes", "Cobros"]`, `mas` `["/proyectos", "/directorio", "/web", "/ajustes"]`; `estaActiva("/cobros", "/cobros") === true` y `estaActiva("/cobros", "/proyectos") === false`. En `tests/inicio-contrato.test.ts` el ítem cobro espera `href: "/cobros"`.
- [ ] **Step 2: Correr** `npx vitest run tests/navegacion-contrato.test.ts tests/inicio-contrato.test.ts` — Expected: FAIL en las tres aserciones nuevas.
- [ ] **Step 3: Implementar** contrato de navegación, icono `cobros` (`"M3 6h18v12H3zM3 10h18M7 15h3"`: tarjeta con banda), `href: "/cobros"` en `armarHoy` para cobros (el botón de Inicio pasa a decir «Ver cobro» y abre `/cobros`), `CifrasInicio` «Por cobrar» → `/cobros`.
- [ ] **Step 4: Correr** los dos tests — Expected: PASS.
- [ ] **Step 5: Página `/cobros`**: `exigirRol("dueno")`; `?f=` con `esFiltroCobros` (por defecto `pendientes`); `CabeceraPagina titulo="Cobros"` con `cifra` = «N cobros»; tres cifras con `.cifras-inicio` de tres columnas (`.cifras-inicio--tres`): «Por cobrar este mes» (`porCobrar`, enlace `?f=mes`), «Vencido» (rojo, `?f=vencidos`), «Cobrado este mes» (`cobrado`, `?f=pagados`); chips `.pestanas` con los cuatro filtros y su cuenta; `TablaCobros`. Vacío: «Nada {etiqueta en minúscula}. Los cobros nacen en cada proyecto (pago único, cuotas) y el cron crea las mensualidades.»
- [ ] **Step 6: `TablaCobros`**: copiar de `TabCobros` la lógica de `pagar`, `recordar`, `avisar`, `anular` y `enlaceManual` (sin «Agregar cobro»: eso sigue en el proyecto); cada `<tr data-id>` con `td[data-label]`; la columna Proyecto es `<Link href="/proyectos/<id>?t=cobros">`; los formularios en línea van en una `<tr className="tabla__detalle">` debajo de la fila con `colSpan={6}`. Monto con `td.num` y `cifra__dinero`. Clases de estado por fila: `cobro-fila--vencido|por_vencer|pagado|anulado` (borde izquierdo como `.cobro`).
- [ ] **Step 7: CSS**: `.cifras-inicio--tres { grid-template-columns: repeat(3, 1fr) }` (teléfono: `1fr 1fr` y la tercera a lo ancho, `grid-column: 1 / -1`); `.tabla__detalle td { display: block; padding: 0 0 10px }`; en ≥1024 `.tabla__detalle > td { display: table-cell }` y `.tabla .pregunta { margin: 0 0 8px }`; `.cobro-fila--vencido td:first-child { box-shadow: inset 3px 0 0 var(--rojo) }` (y ámbar/verde).
- [ ] **Step 8: `refrescar`** en `src/acciones/cobros.ts` añade `revalidatePath("/cobros")`. `npm run tsc` — Expected: sin errores.
- [ ] **Step 9: Correr** `env -u PROSPECTOS_URL_PUBLICA npm run test:db -- tests/cobros.test.ts tests/navegacion-contrato.test.ts tests/inicio-contrato.test.ts tests/inicio.test.ts` — Expected: PASS.
- [ ] **Step 10: Commit** `feat(cobros): seccion /cobros con cifras, filtros y tabla de todos los proyectos; Cobros en la barra`.

---

### Task 3: Tabla de proyectos

**Files:**
- Modify: `src/lib/proyectos-contrato.ts`, `src/lib/proyectos.ts`, `src/app/(panel)/proyectos/page.tsx`, `src/app/globals.css`
- Test: `tests/proyectos-contrato.test.ts`, `tests/clientes-proyectos.test.ts`

**Interfaces:**
- Produces: `proximoCobroDe(cobros: { vence: string; pagadoEn: Date | null; anuladoEn: Date | null }[]): string | null` en `proyectos-contrato.ts` (el `vence` más chico entre los no pagados ni anulados; `null` si no hay). `ProyectoResumen` gana `nichoNombre: string; mensualidad: number; proximoCobro: string | null`. `listarProyectos(hoy, estado?: EstadoProyecto)` filtra por estado si se pasa.

- [ ] **Step 1: Test puro en rojo** (`tests/proyectos-contrato.test.ts`): `proximoCobroDe([])` → `null`; con `[{vence:"2026-11-05"}, {vence:"2026-10-20", pagadoEn: new Date()}, {vence:"2026-10-01", anuladoEn: new Date()}, {vence:"2026-10-25"}]` → `"2026-10-25"`.
- [ ] **Step 2: Correr** `npx vitest run tests/proyectos-contrato.test.ts` — Expected: FAIL (`proximoCobroDe` no existe).
- [ ] **Step 3: Implementar** `proximoCobroDe`. **Step 4:** correr — Expected: PASS.
- [ ] **Step 5: Test con base en rojo** (`tests/clientes-proyectos.test.ts`, en «listarProyectos trae semaforo…»): tras sembrar, `lista[0].nichoNombre` es el nombre del nicho sembrado, `lista[0].mensualidad === 100`, `lista[0].proximoCobro` es el `vence` del cobro pendiente sembrado (o `null` si el test no siembra cobros: entonces sembrar uno con `prisma.cobro.create`); `listarProyectos(hoy, "cerrado")` devuelve `[]`.
- [ ] **Step 6: Correr** `env -u PROSPECTOS_URL_PUBLICA npm run test:db -- tests/clientes-proyectos.test.ts` — Expected: FAIL (propiedades `undefined`).
- [ ] **Step 7: Implementar** en `listarProyectos`: `select` añade `nicho { nombre }`, `mensualidad`, y `cobros` ya trae `vence/pagadoEn/anuladoEn`; `where: estado ? { estado } : {}`.
- [ ] **Step 8: Correr** el test — Expected: PASS.
- [ ] **Step 9: Página `/proyectos`** como tabla: `CabeceraPagina titulo="Proyectos"` con `cifra` = «N proyectos» y `accion` «Nuevo proyecto» (`/proyectos/nuevo`); debajo de la cabecera, si `ganados.length > 0`, un aviso `.aviso` («N ganados sin proyecto: nombre · Crear proyecto», uno por línea, botón `boton mini`); chips `.pestanas` con «Todos» y los cinco estados (`?estado=`), más un último chip «Clientes» que es `Link` a `/clientes` (pestaña secundaria del spec); tabla `.tabla` con columnas Proyecto (semáforo + nombre, enlace a la ficha) · Cliente · Nicho · Estado (`EstadoProyecto`) · Mensualidad (`num`) · Próximo cobro (`num`, `fechaVisible` o «—») · Avance (`num`, «N %» o «—»). Las tres cifras de dinero **salen** de esta página (viven en `/cobros`); `resumenMes` deja de importarse aquí. Vacío: el texto actual.
- [ ] **Step 10: CSS** `.aviso { background: #3b3520; color: var(--ambar); border-radius: var(--radio); padding: 10px 14px; margin-bottom: 12px; font-size: 14px }` y `.aviso .boton { margin-left: 8px }`.
- [ ] **Step 11: `npm run tsc`** — Expected: limpio. **Commit** `feat(proyectos): tabla de proyectos con filtro por estado, proximo cobro y aviso de ganados sin proyecto`.

---

### Task 4: Ficha de proyecto a dos columnas, formularios detrás de botones, historial plegado

**Files:**
- Modify: `src/app/(panel)/proyectos/[id]/page.tsx`, `src/componentes/TabPendientes.tsx`, `src/componentes/TabHoras.tsx`, `src/app/globals.css`
- Test: recorrido de la Task 5 (no hay lógica pura nueva); `npm run tsc`.

**Interfaces:**
- Consumes: clases `.ficha`, `.ficha__historial`, `.historial-plegado` de la ficha del lead (ya en `globals.css`).
- Produces: en `[id]/page.tsx` el `<div className="ficha">` con la columna izquierda = `CabeceraPagina` (título con semáforo y estado, `cifra` = «cliente · nicho · pago único + mensualidad/mes · día N · vN · N %», `accion` = nada) + `Pestanas` + pestaña activa; columna derecha = `<aside className="ficha__historial">` con «Resumen» (`AccionesProyecto`, que ya trae «Editar proyecto» y el estado detrás de «···», y el bloque Cliente actual con sus botones de canal) y debajo «Historial» (`ul.historial`); en el teléfono el mismo resumen va arriba de las pestañas como `<details className="historial-plegado"><summary>Resumen e historial</summary>…</details>`. La pestaña «Cliente» desaparece de `PESTANAS` (su contenido vive en el resumen); `?t=cliente` cae en `cobros`.
- `TabPendientes`: el formulario «Nuevo pendiente» solo se ve tras tocar `<button className="boton">Nuevo pendiente</button>` (estado `nuevo`, como en `TabCobros`). `TabHoras`: igual con «Registrar horas». Al guardar con éxito el formulario se cierra.

- [ ] **Step 1: Implementar** la ficha según Interfaces; `.ficha__historial h2` ya está; añadir `.ficha__resumen { margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid var(--borde) }`.
- [ ] **Step 2: Implementar** los dos formularios detrás de botón. En `TabHoras` el `router.refresh()` se queda (las acciones de horas no revalidan la ruta: no es de esta fase).
- [ ] **Step 3: `npm run tsc`** — Expected: limpio. `npm test` — Expected: verde (nada puro cambió).
- [ ] **Step 4: Commit** `feat(proyectos): ficha a dos columnas con resumen e historial a la derecha; pendientes y horas detras de un boton`.

---

### Task 5: `/web` solo medición con barras compactas, recorrido real y documentación

**Files:**
- Modify: `src/lib/web-contrato.ts` (añadir `alturaBarra`), `src/app/(panel)/web/page.tsx`, `src/app/globals.css`
- Create: `scripts/verificar-dinero.mts`
- Modify: `CLAUDE.md` (sección «Panel CRM, fase 3»)
- Test: `tests/web-contrato.test.ts`, recorrido

**Interfaces:**
- Produces: `alturaBarra(n: number, max: number): number` (0 a 100, entero; 0 si `max <= 0`). Markup de «Personas por día»: `<ol className="web-dias-barras" aria-label="Personas por día">` con un `<li style={{ "--h": pct }} title="dd/mm · N">` por día (etiqueta visible cada 7 días: `<span>`), sin lista de 90 renglones. `scripts/verificar-dinero.mts` (mismo arnés que `verificar-leads.mts`: siembra con marca `(PRUEBA)`, dueño temporal, borra todo al final) con estas comprobaciones: a 1280 `/cobros` muestra tres cifras y la tabla con el cobro vencido sembrado; `?f=pagados` trae el pagado y no el vencido; «Marcar pagado» desde `/cobros` deja la fila pagada en la base y en `/proyectos/<id>?t=cobros` sin `reload` manual; la lateral marca Cobros; `/proyectos` es `table.tabla` con la fila del proyecto, «Próximo cobro» con fecha y el chip `?estado=activo` filtra; `/proyectos/<id>` tiene `.ficha` con `.ficha__historial` visible a 1280 y `details.historial-plegado` cerrado a 390; en `?t=pendientes` el `form` no está hasta tocar «Nuevo pendiente»; en `?t=horas` igual con «Registrar horas»; a 390 la barra inferior lleva «Cobros» y `/cobros` apila las filas (`td` con `::before` de `data-label`: `getComputedStyle(td,'::before').content !== 'none'`); `/web` tiene `.web-dias-barras` y ningún `.web-dias li`; prospectador en `/cobros` → redirige a `/inicio`.

- [ ] **Step 1: Test puro en rojo** (`tests/web-contrato.test.ts`): `alturaBarra(5, 10) === 50`, `alturaBarra(3, 0) === 0`, `alturaBarra(7, 7) === 100`, `alturaBarra(1, 3) === 33`.
- [ ] **Step 2: Correr** `npx vitest run tests/web-contrato.test.ts` — Expected: FAIL. **Step 3:** implementar. **Step 4:** correr — Expected: PASS.
- [ ] **Step 5: `/web`**: reemplazar `ul.web-dias` por el `ol.web-dias-barras`; CSS: `.web-dias-barras { display: flex; align-items: flex-end; gap: 2px; height: 72px; list-style: none; margin: 0; padding: 0 }`, `.web-dias-barras li { flex: 1 1 0; min-width: 2px; height: calc(var(--h) * 1%); background: var(--verde); border-radius: 2px 2px 0 0; position: relative }`, `.web-dias-barras li span { position: absolute; top: 100%; left: 0; font-size: 11px; color: var(--tinta-suave); white-space: nowrap }` y `margin-bottom: 20px` en el `ol`. Un día con 0 personas lleva `min-height: 1px` y `opacity: .3`.
- [ ] **Step 6: Recorrido**: escribir `scripts/verificar-dinero.mts`; sincronizar el clon (`rsync -rlt --exclude node_modules --exclude .next --exclude .git src scripts tests public prisma package.json ~/dev-clon-prospectos/`), levantar `next dev -p 3021` desde el clon con la base de tests (PID guardado en el scratchpad), correr `bash -c 'set -a; . ~/.config/prospectos/env; set +a; DATABASE_URL="$TEST_DATABASE_URL" BASE_URL=http://127.0.0.1:3021 npx tsx scripts/verificar-dinero.mts <scratchpad>/capturas-dinero'` — Expected: `N bien, 0 mal` y revisar las capturas de 390 y 1280.
- [ ] **Step 7: Suite completa** `env -u PROSPECTOS_URL_PUBLICA npm run test:db` — Expected: todo en verde.
- [ ] **Step 8: CLAUDE.md**: sección «Panel CRM, fase 3: dinero y proyectos (desde el 2026-10-30)» con: `/cobros` y sus filtros (`filtrarCobros`), `CobroFila` con proyecto, `refrescar` revalida `/cobros`, Cobros en la barra (fijas Inicio · Leads · Solicitudes · Cobros), tabla de proyectos y `proximoCobroDe`, ficha a dos columnas (pestaña Cliente absorbida por el resumen), formularios detrás de botón, barras de `/web`, recorrido `verificar-dinero.mts`. Marcar en «fase 2» que la fase 3 ya no está pendiente.
- [ ] **Step 9: Commit** `feat(web,docs): personas por dia en barras compactas; recorrido verificar-dinero; CLAUDE.md fase 3`.
