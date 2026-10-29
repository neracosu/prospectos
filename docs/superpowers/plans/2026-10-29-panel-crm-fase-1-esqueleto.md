# Panel CRM — fase 1: esqueleto (navegación, inicio, solicitudes, ajustes, rutas)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el panel tenga estructura de CRM sin tocar datos: barra lateral en escritorio y barra inferior de cinco con «Más» en teléfono, cabecera de página, tabla base, un Inicio con cifras y «Hoy», las solicitudes en su propia sección, Ajustes en acordeón y rutas nuevas con redirecciones.

**Architecture:** Un contrato puro de navegación (`navegacion-contrato.ts`) alimenta dos componentes cliente (`BarraLateral`, `BarraInferior` con hoja «Más»). El layout del panel pasa a una rejilla con el primer breakpoint del proyecto (1024 px). `/inicio` reemplaza a `/hoy` con un contrato puro (`inicio-contrato.ts`) que mezcla seguimientos, cobros e hitos en una sola lista «Hoy»; el prospectador conserva la pantalla de hoy. `/solicitudes` saca las solicitudes de `/web`. Ajustes usa `<details>` nativos. Nada de esquema nuevo en esta fase.

**Tech Stack:** Next 15 App Router, React 19, Prisma 6 / MariaDB, Vitest (`npm test`, `npm run test:db`), TypeScript (`npm run tsc`), Playwright contra el clon `~/dev-clon-prospectos` (`next dev -p 3021`, base de tests).

**Spec:** `docs/superpowers/specs/2026-10-29-panel-crm-design.md` (secciones «Estructura y navegación», «Inicio», «Solicitudes», «Ajustes», «Cómo se hace → fase 1»).

## Global Constraints

- Sin librerías de interfaz; CSS propio en `src/app/globals.css` con los tokens actuales (`--fondo #121614`, `--panel`, `--superficie-2`, `--verde #5ed29c` solo para la acción principal y el dinero, Source Sans 3, cifras tabulares). Breakpoint único nuevo: `@media (min-width: 1024px)`.
- Todo sigue cabiendo a 390 px; objetivos táctiles de 44 px; foco visible; `prefers-reduced-motion` respetado.
- Español de Venezuela; el panel tutea a Neri; comentarios del código sin acentos; nada de «llamada» en textos al cliente.
- TDD con Vitest; los tests con base solo contra `neracosu_prospectos_test`. Nada se construye en el directorio servido salvo el build del despliegue; un build a la vez; `pm2 list` antes de `pm2 restart prospectos`; nunca `pkill`.
- Rutas nuevas de esta fase: `/inicio` (con `/hoy` → 308 a `/inicio`), `/solicitudes`. Rutas de fases siguientes (`/leads`, `/cobros`, `/directorio`) **no se crean todavía**: la navegación de esta fase apunta a lo que existe.
- Secciones de esta fase (valores exactos de `navegacion-contrato.ts`): dueño → Inicio `/inicio`, Prospectos `/prospectos`, Solicitudes `/solicitudes`, Proyectos `/proyectos`, Buscar `/buscar`, Web `/web`, Ajustes `/ajustes`; barra inferior del dueño: Inicio · Prospectos · Solicitudes · Proyectos · Más (Más abre: Buscar, Web, Ajustes). Prospectador → Inicio, Prospectos, Buscar, Mi PIN `/ajustes/mi-pin`; su barra: esos cuatro (sin «Más»).
- Cifras de Inicio del dueño, en este orden: «Leads activos» (prospectos con etapa `enviado`, `respondio` o `reunion`; en la fase 2 pasa a `esLead`), «Solicitudes sin atender», «Por cobrar este mes» con «vencido» en rojo debajo, «Personas en la web» (7 días). Cada cifra enlaza: `/prospectos?etapa=enviado`, `/solicitudes`, `/proyectos`, `/web`.
- Lista «Hoy» del dueño: seguimientos que tocan (prospectos con `proximoSeguimiento <= hoy` y etapa `enviado`/`respondio`/`reunion`), cobros no pagados ni anulados con `vence <= hoy + 7`, pendientes no hechos con `fechaEstimada <= hoy + 7`; ordenada por fecha ascendente; estado `vencido` (fecha < hoy), `hoy`, `proximo`.

## Review Focus

1. Un dueño en escritorio a exactamente 1024 px: aparece la barra lateral y desaparece la inferior; a 1023 px, al revés. Ninguna de las dos se ve doble. → Tarea 2, recorrido a 1023 y 1024.
2. El prospectador nunca ve «Solicitudes», «Proyectos», «Web» ni «Ajustes» en ninguna barra ni en la hoja «Más», y `/inicio` le muestra su cola de hoy. → Tarea 1 (test del contrato) y Tarea 3 (test con base, rol prospectador).
3. Enlaces viejos siguen vivos: `/hoy`, `/` y `start_url` del manifiesto llevan a `/inicio`; `/web#solicitudes` llega a `/solicitudes`. → Tarea 6, recorrido.
4. La lista «Hoy» con un cobro sin fecha de vencimiento válida o un pendiente sin fecha no revienta: se omiten. → Tarea 3, test «fechas raras».
5. En Ajustes, guardar el formulario de un nicho no cierra los demás acordeones ni pierde el desplazamiento; el acordeón abierto se mantiene tras el refresco (`?abrir=nicho-3`). → Tarea 5, recorrido.

---

### Task 1: Contrato de navegación

**Files:**
- Create: `src/lib/navegacion-contrato.ts`
- Test: `tests/navegacion-contrato.test.ts`

**Interfaces:**
- Produces:
  - `export type Rol = "dueno" | "prospectador"`
  - `export type Seccion = { href: string; texto: string; icono: "inicio" | "prospectos" | "solicitudes" | "proyectos" | "buscar" | "web" | "ajustes" | "pin" }`
  - `export function seccionesPara(rol: Rol): Seccion[]` (barra lateral, en el orden de Global Constraints)
  - `export function barraPara(rol: Rol): { fijas: Seccion[]; mas: Seccion[] }` (dueño: 4 fijas + `mas` con 3; prospectador: 4 fijas y `mas` vacío)
  - `export function estaActiva(ruta: string, href: string): boolean` (`/prospectos/12` activa `/prospectos`; `/ajustes/mi-pin` activa `/ajustes/mi-pin` y NO `/ajustes` cuando ambas existen: la coincidencia más larga gana; `/inicio` solo exacta)
  - `export const RUTAS_VIEJAS: Record<string, string> = { "/hoy": "/inicio" }`

- [ ] **Step 1: Test que falla** (`tests/navegacion-contrato.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { seccionesPara, barraPara, estaActiva, RUTAS_VIEJAS } from "@/lib/navegacion-contrato";
describe("navegacion", () => {
  it("el dueno ve siete secciones en este orden", () => {
    expect(seccionesPara("dueno").map((s) => s.href)).toEqual(["/inicio", "/prospectos", "/solicitudes", "/proyectos", "/buscar", "/web", "/ajustes"]);
  });
  it("el prospectador ve cuatro y ninguna del dueno", () => {
    const h = seccionesPara("prospectador").map((s) => s.href);
    expect(h).toEqual(["/inicio", "/prospectos", "/buscar", "/ajustes/mi-pin"]);
    for (const x of ["/solicitudes", "/proyectos", "/web", "/ajustes"]) expect(h).not.toContain(x);
  });
  it("la barra del dueno son cuatro fijas y Mas con Buscar, Web y Ajustes", () => {
    const b = barraPara("dueno");
    expect(b.fijas.map((s) => s.texto)).toEqual(["Inicio", "Prospectos", "Solicitudes", "Proyectos"]);
    expect(b.mas.map((s) => s.href)).toEqual(["/buscar", "/web", "/ajustes"]);
    expect(barraPara("prospectador").mas).toEqual([]);
  });
  it("estaActiva: la coincidencia mas larga gana y /inicio es exacta", () => {
    expect(estaActiva("/prospectos/12", "/prospectos")).toBe(true);
    expect(estaActiva("/ajustes/mi-pin", "/ajustes")).toBe(false);
    expect(estaActiva("/ajustes/mi-pin", "/ajustes/mi-pin")).toBe(true);
    expect(estaActiva("/ajustes", "/ajustes")).toBe(true);
    expect(estaActiva("/iniciox", "/inicio")).toBe(false);
  });
  it("las rutas viejas llevan a las nuevas", () => { expect(RUTAS_VIEJAS["/hoy"]).toBe("/inicio"); });
});
```

- [ ] **Step 2: Correr y ver que falla.** Run: `npx vitest run tests/navegacion-contrato.test.ts`. Expected: FAIL (módulo no existe).
- [ ] **Step 3: Implementar** `src/lib/navegacion-contrato.ts`. Para `estaActiva`, `href === "/inicio"` exige igualdad; en el resto, `ruta === href || ruta.startsWith(href + "/")`, y cuando `href` es `/ajustes` y la ruta empieza por `/ajustes/mi-pin`, devuelve `false`.
- [ ] **Step 4: Correr.** Expected: PASS. `npm run tsc` limpio.
- [ ] **Step 5: Commit** (`git commit -F -` por heredoc): `feat(panel): contrato de navegacion por rol (secciones, barra con Mas, ruta activa)`

---

### Task 2: Barra lateral, barra inferior con «Más», cabecera de página y tabla base

**Files:**
- Create: `src/componentes/BarraLateral.tsx` (cliente), `src/componentes/HojaMas.tsx` (cliente), `src/componentes/CabeceraPagina.tsx` (servidor)
- Modify: `src/componentes/BarraInferior.tsx`, `src/app/(panel)/layout.tsx`, `src/app/globals.css`
- Create: `scripts/verificar-esqueleto.mts` (recorrido real contra el clon; se amplía en las tareas 3, 5 y 6)

**Interfaces:**
- Consumes: `seccionesPara`, `barraPara`, `estaActiva` (Tarea 1).
- Produces:
  - `<BarraLateral rol />`: `<nav className="lateral" aria-label="Secciones">` con el logotipo arriba («NERACOSU» con el punto en verde), un `Link.lateral__item` por sección (`aria-current="page"` en la activa) y abajo el nombre del usuario y «Salir» (`/salir`).
  - `<BarraInferior rol />`: las fijas de `barraPara` más, si `mas.length`, un botón «Más» (`aria-haspopup="dialog"`, `aria-expanded`) que abre `<HojaMas>`.
  - `<HojaMas secciones onCerrar />`: `<div role="dialog" aria-modal="true" aria-label="Más secciones" className="hoja">` sobre un velo; un `Link.hoja__item` por sección; cierra con Escape, con el velo y al navegar; devuelve el foco al botón.
  - `<CabeceraPagina titulo cifra? accion?>`: `<header className="cabecera-pagina"><h1>…</h1>{cifra && <span className="cabecera-pagina__cifra">}{accion}</header>`; `accion` es un nodo (normalmente `<Link className="boton boton--primario">`).
  - CSS: `.lateral` (oculta por defecto; desde 1024 px: `position: fixed; left: 0; top: 0; bottom: 0; width: 240px`), `.contenedor` desde 1024 px con `margin-left: 240px; max-width: 1280px; padding: 24px 32px`, `.barra` oculta desde 1024 px, `.hoja`/`.velo`, `.cabecera-pagina` (flex, título 24 px, pegajosa en escritorio), `.tabla` (`width: 100%; border-collapse: collapse`; `th` pegajoso, 14 px, `--tinta-suave`; `td` 48 px de alto; `.tabla .num { text-align: right }`), niveles de título `h1 24 / h2 18 / h3 15` dentro de `.contenedor`. En el teléfono, `.tabla` se muestra como filas: `thead` oculto, cada `tr` como bloque con `td` en línea (`data-label` para la etiqueta).

- [ ] **Step 1: Preparar el clon y el recorrido que falla.** En `~/dev-clon-prospectos`: `git fetch && git checkout main && git pull` (o la rama de trabajo), `npm ci`, y arrancar `DATABASE_URL="$TEST_DATABASE_URL" node_modules/.bin/next dev -p 3021` en segundo plano, anotando su PID. Escribir `scripts/verificar-esqueleto.mts` (misma cabecera y guardas que `scripts/capturas-panel.mts`: solo base de tests, `BASE_URL` del clon, dueño temporal con PIN, borra lo suyo al final) con estas comprobaciones, que registran en `errores`/`pasos`:
  - A 1280×800, en `/inicio`: `nav.lateral` visible con 7 enlaces, `nav.barra` oculta (`display: none`), `.cabecera-pagina h1` presente.
  - A 1024×800: igual que 1280. A 1023×800: `nav.lateral` oculta y `nav.barra` visible con 4 enlaces y un botón «Más».
  - A 390×844: tocar «Más» abre `[role=dialog]` con 3 enlaces (Buscar, Web, Ajustes); Escape lo cierra y el foco vuelve al botón; tocar «Web» navega a `/web` y la hoja no queda abierta.
  - Con un prospectador temporal: barra de 4 sin «Más»; lateral de 4; ningún enlace a `/solicitudes`, `/proyectos`, `/web`, `/ajustes` exacto.
  - Captura a 390 y 1280 de `/inicio` en `capturas/esqueleto/`.
  Run: `cd ~/dev-clon-prospectos && DATABASE_URL="$TEST_DATABASE_URL" BASE_URL=http://127.0.0.1:3021 npx tsx scripts/verificar-esqueleto.mts`. Expected: FAIL (no hay `nav.lateral`; `/inicio` da 404).
- [ ] **Step 2: Implementar** componentes, layout y CSS. El layout queda: `<ProveedorFlotante><BarraLateral rol/><main className="contenedor">{children}</main><BarraInferior rol/><RegistrarSW/></ProveedorFlotante>`. El nombre del usuario viene de `exigirSesion()` (ya devuelve `nombre`).
- [ ] **Step 3: Verificar en el clon** (copiar los cambios al clon con `git` — commit en el repo de trabajo y `git pull` en el clon — o `rsync -rlt --exclude node_modules --exclude .next`). Run el recorrido. Expected: pasan las comprobaciones de barras y hoja; las de `/inicio` siguen fallando hasta la Tarea 3 (dejar `/inicio` fuera del recorrido con una bandera `SIN_INICIO=1` hasta entonces, o aceptar esos fallos como esperados y anotarlo).
- [ ] **Step 4: `npm run tsc && npm test`.** Expected: limpio y en verde.
- [ ] **Step 5: Commit:** `feat(panel): barra lateral en escritorio, barra inferior con Mas, cabecera de pagina y tabla base`

---

### Task 3: Contrato e Inicio

**Files:**
- Create: `src/lib/inicio-contrato.ts`, `src/lib/inicio.ts`, `src/app/(panel)/inicio/page.tsx`, `src/componentes/CifrasInicio.tsx`
- Modify: `src/lib/proyectos.ts` (dos consultas nuevas)
- Test: `tests/inicio-contrato.test.ts`, `tests/inicio.test.ts` (con base)

**Interfaces:**
- Consumes: `seguimientosQueTocan(hoy)` y `resumenHoy(hoy)` de `@/lib/prospectos`; `resumenMes(hoy)` de `@/lib/proyectos`; `solicitudesSinAtender()`, `personasSemana()`, `listarSolicitudes(limite)` de `@/lib/web`; `hoyCaracas()`.
- Produces:
  - `inicio-contrato.ts`: `export type ItemHoy = { tipo: "seguimiento" | "cobro" | "hito"; id: string; titulo: string; sub: string; fecha: string; estado: "vencido" | "hoy" | "proximo"; href: string }`; `export function armarHoy(e: { hoy: string; seguimientos: { id: number; nombre: string; ciudad: string; proximoSeguimiento: string | null }[]; cobros: { id: number; proyectoId: number; proyectoNombre: string; concepto: string; monto: number; vence: string }[]; hitos: { id: number; proyectoId: number; proyectoNombre: string; texto: string; fechaEstimada: string | null }[] }): ItemHoy[]` (omite lo que no tenga fecha ISO válida `YYYY-MM-DD`; ordena por fecha y, a igual fecha, cobros antes que seguimientos antes que hitos); `export type CifrasInicio = { leadsActivos: number; conVencido: number; solicitudes: number; porCobrar: number; vencido: number; personasWeb: number }`; `export function estadoDe(fecha: string, hoy: string): ItemHoy["estado"]`.
  - `proyectos.ts`: `export async function cobrosQueVencen(hoy: string, dias = 7)` (no pagados, no anulados, `vence <= hoy+dias`, con `proyecto: { id, nombre }`) y `export async function hitosQueTocan(hoy: string, dias = 7)` (pendientes `hecho = false` con `fechaEstimada` no nula `<= hoy+dias`).
  - `inicio.ts`: `export async function datosInicio(hoy: string): Promise<{ cifras: CifrasInicio; hoyLista: ItemHoy[]; ultimas: SolicitudFila[] }>`.
  - `/inicio`: si el rol es `prospectador`, renderiza exactamente lo que hoy renderiza `/hoy` (mover ese cuerpo a `src/componentes/InicioProspectador.tsx` y reutilizarlo); si es `dueno`: `<CabeceraPagina titulo="Inicio" accion={<Link href="/prospectos/nuevo" className="boton boton--primario">Nuevo prospecto</Link>}/>`, `<CifrasInicio cifras/>` (cuatro tarjetas-enlace, 2×2 en teléfono, 4 en fila en escritorio), `<section>` «Hoy» (lista de `ItemHoy` en filas: título, sub, fecha con clase por estado, botón de la acción: WhatsApp del prospecto para seguimiento, «Ver cobro» para cobro, «Ver proyecto» para hito), vacío → «Nada pendiente. Las solicitudes nuevas están en Solicitudes.»; `<section>` «Últimas solicitudes» con hasta 3 y «Ver todas» → `/solicitudes`. La lista «Ganó y no tiene proyecto» desaparece de Inicio (queda en Proyectos).

- [ ] **Step 1: Tests que fallan.** `tests/inicio-contrato.test.ts`:

```ts
it("mezcla y ordena por fecha; a igual fecha, cobro antes que seguimiento antes que hito", () => {
  const r = armarHoy({ hoy: "2026-10-29",
    seguimientos: [{ id: 1, nombre: "Posada", ciudad: "Catia", proximoSeguimiento: "2026-10-29" }],
    cobros: [{ id: 9, proyectoId: 2, proyectoNombre: "Tienda", concepto: "mensualidad", monto: 100, vence: "2026-10-29" }],
    hitos: [{ id: 5, proyectoId: 2, proyectoNombre: "Tienda", texto: "Entregar", fechaEstimada: "2026-10-28" }] });
  expect(r.map((x) => x.tipo)).toEqual(["hito", "cobro", "seguimiento"]);
  expect(r[0].estado).toBe("vencido"); expect(r[1].estado).toBe("hoy");
  expect(r[1].href).toBe("/proyectos/2?t=cobros"); expect(r[2].href).toBe("/prospectos/1");
});
it("fechas raras se omiten sin reventar", () => {
  const r = armarHoy({ hoy: "2026-10-29", seguimientos: [{ id: 1, nombre: "A", ciudad: "", proximoSeguimiento: null }], cobros: [{ id: 1, proyectoId: 1, proyectoNombre: "P", concepto: "cuota", monto: 1, vence: "mañana" }], hitos: [{ id: 1, proyectoId: 1, proyectoNombre: "P", texto: "x", fechaEstimada: "" }] });
  expect(r).toEqual([]);
});
it("estadoDe", () => { expect(estadoDe("2026-10-28", "2026-10-29")).toBe("vencido"); expect(estadoDe("2026-10-29", "2026-10-29")).toBe("hoy"); expect(estadoDe("2026-11-02", "2026-10-29")).toBe("proximo"); });
```

`tests/inicio.test.ts` (con base, `describe.runIf(DB_HABILITADA)`, sembrando con `sembrarBasico` y creando un cobro que vence hoy y un pendiente con fecha): `datosInicio(hoy)` devuelve `cifras.leadsActivos` igual al conteo de etapas `enviado+respondio+reunion`, `hoyLista` con el cobro y el pendiente, y `ultimas.length <= 3`.

- [ ] **Step 2: Correr y ver que fallan.** Run: `npx vitest run tests/inicio-contrato.test.ts && npm run test:db -- tests/inicio.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implementar** contrato, consultas, `datosInicio`, la página y `CifrasInicio` (CSS `.cifras-inicio` 2×2 / 4 columnas desde 1024 px; la cifra en 26 px, el rótulo en 14 px suave; «vencido» en `--rojo` solo si > 0).
- [ ] **Step 4: Correr tests y tsc.** Expected: PASS.
- [ ] **Step 5: Ampliar el recorrido** (`verificar-esqueleto.mts`): con un cobro que vence hoy y un seguimiento vencido sembrados con la marca, `/inicio` del dueño muestra cuatro cifras-enlace, la lista «Hoy» con 2 filas en el orden cobro → seguimiento y la fila del seguimiento con un botón de WhatsApp; `/inicio` del prospectador muestra «Por contactar». Run el recorrido. Expected: PASS.
- [ ] **Step 6: Commit:** `feat(panel): Inicio con cifras y lista Hoy; el prospectador conserva su cola`

---

### Task 4: Solicitudes en su sección; Web solo medición

**Files:**
- Create: `src/app/(panel)/solicitudes/page.tsx`, `src/componentes/TarjetaSolicitud.tsx` (extraída de `web/page.tsx`, misma tarjeta de hoy)
- Modify: `src/app/(panel)/web/page.tsx` (quita el bloque de solicitudes; deja un enlace «Solicitudes» en la cabecera), `src/acciones/web.ts` (`revalidatePath("/solicitudes")` y `"/inicio"` además de `/web` y `/hoy`)
- Test: `tests/web.test.ts` (ajustar lo que mire `/hoy`), `scripts/verificar-esqueleto.mts`

**Interfaces:**
- Consumes: `listarSolicitudes`, `solicitudesSinAtender`, `marcarSolicitud`, `respuestasLegibles`, `clasificarOrigen`.
- Produces: `/solicitudes`: `<CabeceraPagina titulo="Solicitudes" cifra={`${nuevas} sin atender`}/>`, pestañas «Sin atender · Todas» (`?t=`), las tarjetas de hoy (`TarjetaSolicitud`), vacío → «Todavía no llega ninguna. Las que entren por la web y por /empezar aparecen aquí.». `/web`: cabecera «Web» con `accion` = enlace a `/solicitudes`, y solo las métricas.

- [ ] **Step 1: Recorrido que falla:** `/solicitudes` existe, lista una solicitud sembrada (vía `POST` directo a `guardarSolicitud` con la marca) con «Califica para demostración» si es de embudo, el botón «Atendida» funciona (optimista como hoy), y `/web` ya no contiene `#solicitudes` ni la tarjeta. Run. Expected: FAIL (404).
- [ ] **Step 2: Implementar.**
- [ ] **Step 3: Correr** `npm run test:db -- tests/web.test.ts`, `npm run tsc`, el recorrido. Expected: PASS.
- [ ] **Step 4: Commit:** `feat(panel): seccion Solicitudes; Web queda solo con la medicion`

---

### Task 5: Ajustes en acordeón

**Files:**
- Modify: `src/app/(panel)/ajustes/page.tsx`, `src/componentes/FormularioAjustes.tsx` (solo si hace falta pasar un `id` al formulario), `src/app/globals.css` (`.acordeon`, `.indice-ajustes`)
- Test: `scripts/verificar-esqueleto.mts`

**Interfaces:**
- Produces: la página queda `<CabeceraPagina titulo="Ajustes"/>`, un `<nav className="indice-ajustes">` con anclas (Usuarios, Mensajes por nicho, Cobros, Mi PIN; en escritorio a la izquierda del contenido, en teléfono como chips arriba), y cada bloque en `<details className="acordeon" id="…" open?>` con `<summary>`. Dentro de «Mensajes por nicho»: una lista de filas (nombre del nicho, días de seguimiento) y cada fila es a su vez un `<details>` con el `FormularioNicho` adentro. Qué va abierto: lo que diga `?abrir=<id>` (y al guardar, cada formulario redirige o revalida conservando `?abrir`), o nada.

- [ ] **Step 1: Recorrido que falla:** en `/ajustes` a 390: todos los `details.acordeon` cerrados; se ve el índice; abrir «Mensajes por nicho» muestra una fila por nicho y ningún `textarea` visible; abrir un nicho muestra sus dos `textarea`; con `?abrir=nicho-<id>` ese nicho llega abierto y solo ese. Run. Expected: FAIL.
- [ ] **Step 2: Implementar.** Los formularios de nicho añaden un `<input type="hidden" name="abrir" value="nicho-<id>">` y la acción `guardarNicho` revalida `/ajustes`; el `redirect` o el `router.refresh` conservan la consulta (si la acción hoy no redirige, no hace falta nada: `<details open>` sobrevive al refresco de RSC porque el atributo sale del servidor con `?abrir`).
- [ ] **Step 3: Correr** `npm test`, `npm run tsc`, el recorrido. Expected: PASS.
- [ ] **Step 4: Commit:** `feat(panel): Ajustes en acordeon con indice; un nicho a la vez`

---

### Task 6: Rutas, redirecciones y manifiesto

**Files:**
- Modify: `src/app/page.tsx` (→ `/inicio`), `src/app/(panel)/hoy/page.tsx` (queda solo `redirect("/inicio")` permanente: `import { permanentRedirect } from "next/navigation"`), `src/app/manifest.ts` (`start_url: "/inicio"`), `src/lib/sesion.ts` (donde redirija a `/hoy` tras entrar o por rol → `/inicio`), `src/app/entrar/page.tsx` si enlaza `/hoy`, `public/sw.js` (si lista `/hoy`: no; si cambia `/sin-conexion`, subir `VERSION`; aquí no cambia)
- Test: `tests/auth.test.ts` o `tests/portal-guardas.test.ts` donde se afirme `REDIRECT:/hoy` (pasa a `/inicio`), `scripts/verificar-esqueleto.mts`

- [ ] **Step 1: Tests que fallan:** `grep -rn "/hoy" tests src` y cambiar las afirmaciones a `/inicio` (ver que fallen antes de tocar `src`). Recorrido: `/hoy` → `/inicio` (308), `/` → `/inicio`, el manifiesto trae `start_url: "/inicio"`, `/web#solicitudes` abre `/web` (el ancla ya no existe: comprobar que la cabecera trae el enlace a Solicitudes).
- [ ] **Step 2: Implementar.**
- [ ] **Step 3: Correr** `npm test`, `npm run test:db` (toda la suite con base), `npm run tsc`, el recorrido completo. Expected: todo PASS.
- [ ] **Step 4: Commit:** `feat(panel): /inicio reemplaza a /hoy; rutas viejas redirigen; manifiesto`

---

### Task 7: Revisión visual, despliegue y notas

**Files:**
- Modify: `CLAUDE.md` (sección nueva «Panel CRM, fase 1»), `README` si lista rutas.

- [ ] **Step 1: Capturas** a 390 y 1280 de Inicio (dueño y prospectador), Prospectos, Solicitudes, Proyectos, Ajustes (cerrado y con un nicho abierto) en `capturas/esqueleto/`; mirarlas: sin solapes, sin dobles barras, títulos jerarquizados, foco visible al tabular por la barra lateral.
- [ ] **Step 2: Apagar el `next dev` del clon por su PID** (nunca `pkill`).
- [ ] **Step 3: Desplegar:** `pgrep -fa "next build"` vacío; `set -a; . ~/.config/prospectos/env; set +a; npx prisma migrate status` (sin migraciones pendientes en esta fase); `npm run build`; `pm2 list`; `pm2 restart prospectos`; `curl -s -o /dev/null -w "%{http_code}" https://prospectos.neracosu.com/entrar` → 200; `curl -sI https://prospectos.neracosu.com/hoy | grep -i location` → `/inicio`; contador de reinicios +1.
- [ ] **Step 4: Notas:** en `CLAUDE.md`, qué cambió (navegación por rol en `navegacion-contrato.ts`, breakpoint 1024, `/inicio`, `/solicitudes`, acordeón de Ajustes, recorrido `verificar-esqueleto.mts` con el clon en 3021) y que las fases 2-4 siguen en el diseño. Memoria del proyecto al día. Commit y `git push origin main`.
