# Panel CRM, fase 4: pulido — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar el rediseño del panel con la búsqueda global (Ctrl+K en escritorio, «Buscar» en la hoja «Más» del teléfono) que encuentra leads, directorio, clientes y proyectos, y el arrastre de tarjetas entre columnas del tablero de leads en escritorio. La prueba en el teléfono real queda para Neri.

**Architecture:** Un contrato puro (`busqueda-contrato.ts`: normalizar la consulta, ordenar y recortar resultados, qué columnas aceptan un arrastre) con tests Vitest; una Server Action `buscarGlobal(q)` que consulta por rol (el prospectador no alcanza leads ajenos, clientes ni proyectos); un componente cliente `BusquedaGlobal` montado en el layout del panel (diálogo con `role="dialog"`, Escape, foco devuelto, flechas y Enter); y el arrastre con la API nativa de HTML5 (`draggable`, `dragstart`, `dragover`, `drop`) sobre `TarjetaLead` y una envoltura cliente `ColumnaTablero`, que al soltar llama a `moverLead` (la misma acción de «Mover a») y deja que la revalidación mueva la tarjeta. Sin librerías.

**Tech Stack:** Next 15, React 19, Prisma 6, Vitest, Playwright contra el clon en 3021 con la base de tests.

**Spec:** `docs/superpowers/specs/2026-10-29-panel-crm-design.md` («Escritorio»: atajo global Ctrl+K; «Cómo se hace», fase 4: búsqueda global, arrastre en el tablero, prueba en el teléfono de Neri; decisión 3: sin arrastre hasta la fase 4).

## Global Constraints

- Español de Venezuela; el panel tutea a Neri; comentarios sin acentos. Sin librerías de interfaz.
- El prospectador **no ve montos** ni leads que no sean del directorio (`fuenteLead = "directorio"`), ni clientes ni proyectos: la búsqueda global respeta exactamente las mismas reglas que `/leads` y `/directorio`.
- `moverLead` no cambia: el arrastre es otra forma de llamarla. A «Descartado» **no se arrastra** (exige motivo): sigue por «Mover a…».
- El arrastre es solo para puntero (escritorio ≥ 1024 px). En el teléfono no se dibuja ni se escucha nada nuevo.
- Tests con base solo contra `neracosu_prospectos_test`; recorridos solo contra el clon. Un build a la vez. Rama `panel-crm-fase-4` desde `main`. Commits por heredoc con `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. Una consulta de un carácter o de solo espacios **no dispara** ninguna búsqueda (Task 1: `normalizarConsulta` devuelve `""`).
2. El prospectador que busca el nombre de un lead de la web **no lo ve** ni como «directorio» (Task 1: test con base `buscarGlobal` como prospectador).
3. Abrir el diálogo con Ctrl+K mientras el foco está en un `<input>` de otro formulario, escribir, Escape: **el foco vuelve** a ese input y lo escrito en él no cambia (Task 2: el recorrido lo comprueba).
4. Soltar una tarjeta **en su propia columna** o en una columna no permitida (p. ej. Ganado → Nuevo) no llama a la acción ni deja la tarjeta oculta (Task 3: `puedeSoltar` + recorrido).
5. Dos arrastres seguidos antes de que responda el servidor: la segunda tarjeta no «salta» de vuelta cuando llega la revalidación de la primera (Task 3: estado `pendientes` por id, no uno global).

---

### Task 1: Contrato y acción de búsqueda global

**Files:**
- Create: `src/lib/busqueda-contrato.ts`, `src/acciones/busqueda.ts`
- Test: `tests/busqueda-contrato.test.ts` (puro), `tests/busqueda.test.ts` (con base, `vi.mock` de sesión como `tests/acciones-leads.test.ts`)

**Interfaces:**
- Produces: `type TipoResultado = "lead" | "directorio" | "cliente" | "proyecto"`; `type ResultadoBusqueda = { tipo: TipoResultado; id: number; titulo: string; sub: string; href: string }`; `ETIQUETA_TIPO: Record<TipoResultado, string>` (Lead · Directorio · Cliente · Proyecto); `normalizarConsulta(q: string): string` (trim, colapsa espacios, mínimo 2 caracteres o devuelve `""`, máximo 80); `ordenarResultados(q: string, lista: ResultadoBusqueda[]): ResultadoBusqueda[]` (primero los que **empiezan** por la consulta sin importar mayúsculas ni acentos, luego los que la contienen; dentro de cada grupo por tipo en el orden lead, proyecto, cliente, directorio y luego por título; tope 20); `TOPE_RESULTADOS = 20`.
- Produces: `buscarGlobal(q: string): Promise<Resultado<ResultadoBusqueda[]>>` en `src/acciones/busqueda.ts` (`"use server"`, `exigirSesion`): leads (`esLead: true`, dueño todos / prospectador solo `fuenteLead: "directorio"`; `nombre|ciudad|whatsapp|instagram|email contains`, `take 10`, `href: /leads/<id>`, `sub: etiqueta de etapa de lead · nicho`), directorio (`esLead: false`, `take 10`, `href: /prospectos/<id>`, `sub: ciudad · nicho`), y solo dueño: clientes (`nombre|contactoNombre|rif contains`, `take 5`, `href: /clientes/<id>`) y proyectos (`nombre contains`, `take 5`, `href: /proyectos/<id>`, `sub: cliente · estado`). Devuelve `ordenarResultados`. Consulta vacía tras normalizar → `exito([])`.

- [ ] **Step 1: Test puro en rojo** (`tests/busqueda-contrato.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { normalizarConsulta, ordenarResultados, TOPE_RESULTADOS, type ResultadoBusqueda } from "@/lib/busqueda-contrato";
const r = (tipo: ResultadoBusqueda["tipo"], titulo: string, id = 1): ResultadoBusqueda => ({ tipo, id, titulo, sub: "", href: "/" });
describe("normalizarConsulta", () => {
  it("recorta, colapsa espacios y exige dos caracteres", () => {
    expect(normalizarConsulta("  hotel   alto ")).toBe("hotel alto");
    expect(normalizarConsulta(" a ")).toBe("");
    expect(normalizarConsulta("   ")).toBe("");
    expect(normalizarConsulta("x".repeat(100))).toHaveLength(80);
  });
});
describe("ordenarResultados", () => {
  it("los que empiezan por la consulta van primero, sin acentos ni mayusculas; luego por tipo y titulo; tope 20", () => {
    const lista = [r("directorio", "Panadería Alto Mar"), r("cliente", "Álto Mar C.A."), r("lead", "Hotel Alto Mar"), r("proyecto", "alto mar web"), r("lead", "Altos del Mar")];
    expect(ordenarResultados("alto", lista).map((x) => x.titulo)).toEqual(["Altos del Mar", "alto mar web", "Álto Mar C.A.", "Hotel Alto Mar", "Panadería Alto Mar"]);
    const muchos = Array.from({ length: 30 }, (_, i) => r("directorio", `Negocio ${i}`, i));
    expect(ordenarResultados("negocio", muchos)).toHaveLength(TOPE_RESULTADOS);
  });
});
```

- [ ] **Step 2: Correr** `npx vitest run tests/busqueda-contrato.test.ts` — Expected: FAIL (módulo no existe).
- [ ] **Step 3: Implementar** el contrato (quitar acentos con `normalize("NFD").replace(/\p{M}/gu, "")`).
- [ ] **Step 4: Correr** — Expected: PASS.
- [ ] **Step 5: Test con base en rojo** (`tests/busqueda.test.ts`): siembra `sembrarBasico`, un lead `web` «Boutique Alma», un lead `directorio` «Hotel Cola», un directorio «Tienda Directorio» (ciudad Caracas), un cliente «Alma C.A.» con `sembrarCliente` y un proyecto «Alma tienda» con `sembrarProyecto`. Como dueño: `buscarGlobal("alma")` trae tipos `["lead", "proyecto", "cliente"]` en ese orden; `buscarGlobal("a")` → `[]`. Como prospectador: `buscarGlobal("alma")` → `[]`; `buscarGlobal("hotel")` → un `lead` «Hotel Cola»; `buscarGlobal("tienda")` → un `directorio`.
- [ ] **Step 6: Correr** `env -u PROSPECTOS_URL_PUBLICA npm run test:db -- tests/busqueda.test.ts` — Expected: FAIL (`@/acciones/busqueda` no existe).
- [ ] **Step 7: Implementar** `buscarGlobal`. **Step 8:** correr — Expected: PASS.
- [ ] **Step 9: Commit** `feat(busqueda): contrato y accion de busqueda global por rol`.

---

### Task 2: Diálogo de búsqueda (Ctrl+K, barra lateral y hoja «Más»)

**Files:**
- Create: `src/componentes/BusquedaGlobal.tsx`
- Modify: `src/app/(panel)/layout.tsx`, `src/componentes/BarraLateral.tsx`, `src/componentes/BarraInferior.tsx`, `src/componentes/HojaMas.tsx`, `src/componentes/Icono.tsx` (icono `buscar`: `"M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14M20 20l-4-4"`), `src/app/globals.css`
- Test: recorrido de la Task 4; `npm run tsc`.

**Interfaces:**
- Consumes: `buscarGlobal`, `ETIQUETA_TIPO`, `normalizarConsulta`.
- Produces: `BusquedaGlobal` exporta el componente y un evento global: `window.dispatchEvent(new CustomEvent("nc:buscar"))` lo abre (así la barra lateral y la hoja «Más» no necesitan estado compartido). Dentro: `role="dialog" aria-modal="true" aria-label="Buscar en el panel"`, un `<input type="search" placeholder="Leads, directorio, clientes, proyectos…" autoFocus>`, resultados en `<ul role="listbox">` con `<li role="option" aria-selected>`; flechas mueven la selección, Enter abre el `href` (`router.push`), Escape cierra; **al cerrar devuelve el foco** al elemento activo antes de abrir. Consulta con `normalizarConsulta` y 200 ms de espera (`setTimeout` cancelado al escribir); respuesta vieja que llega después de una nueva se descarta (contador de petición). Vacío: «Nada con “q”.» Atajo: `keydown` global con `(e.ctrlKey || e.metaKey) && e.key === "k"` → `preventDefault` y abrir. `BarraLateral`: botón «Buscar» con `<kbd>Ctrl K</kbd>` encima de las secciones. `HojaMas`: prop `onBuscar?: () => void`; si viene, primer ítem «Buscar» (botón) antes de las secciones; `BarraInferior` la pasa y cierra la hoja al tocarla.

- [ ] **Step 1: Implementar** el componente, el montaje en el layout y los dos disparadores.
- [ ] **Step 2: CSS**: `.busqueda` (fixed, `inset: 0`, velo reutilizado `.velo`), `.busqueda__caja` (ancho máx 560, arriba a 12 vh en escritorio; en el teléfono pegada arriba a lo ancho), `.busqueda__input` (48 px), `.busqueda__lista li[aria-selected="true"]` resaltada, `.busqueda__tipo` (etiqueta pequeña), `.lateral__buscar` (como `.lateral__item`, con `kbd` a la derecha).
- [ ] **Step 3: `npm run tsc`** — Expected: limpio. `npm test` — Expected: verde.
- [ ] **Step 4: Commit** `feat(busqueda): dialogo global con Ctrl+K, boton en la lateral y en la hoja Mas`.

---

### Task 3: Arrastre en el tablero de leads

**Files:**
- Modify: `src/lib/leads-contrato.ts` (`puedeSoltar`), `src/componentes/TarjetaLead.tsx`, `src/app/(panel)/leads/page.tsx`, `src/app/globals.css`
- Create: `src/componentes/ColumnaTablero.tsx`
- Test: `tests/leads-contrato.test.ts`

**Interfaces:**
- Produces: `puedeSoltar(de: Etapa, a: Etapa): boolean` = `de !== a && a !== "descartado" && puedePasarLead(de, a)`. `TarjetaLead` gana `arrastrable?: boolean` (por defecto `false`; `/leads` lo pone en `true`): `draggable`, `onDragStart` escribe `text/plain` = `${id}:${etapa}` y `effectAllowed = "move"`, clase `lead--arrastrando` mientras dura. `ColumnaTablero({ etapa, children })` client: envuelve `tablero__lista`; en `dragover` lee el dato, si `puedeSoltar(de, etapa)` → `preventDefault`, `dropEffect = "move"` y clase `tablero__lista--recibe`; en `drop` → `moverLead(id, etapa)` dentro de `useTransition`, guarda el id en un `Set` `pendientes` (atributo `data-pendiente` para el CSS: la tarjeta de origen se atenúa hasta que llega la revalidación) y, si falla, `useFlotante` con el mensaje. Nada de esto se monta si `window.matchMedia("(pointer: coarse)")` es verdadero.

- [ ] **Step 1: Test puro en rojo** (`tests/leads-contrato.test.ts`): `puedeSoltar("por_contactar", "enviado") === true`, `puedeSoltar("enviado", "enviado") === false`, `puedeSoltar("por_contactar", "descartado") === false`, `puedeSoltar("ganado", "por_contactar") === false`.
- [ ] **Step 2: Correr** `npx vitest run tests/leads-contrato.test.ts` — Expected: FAIL. **Step 3:** implementar. **Step 4:** correr — Expected: PASS.
- [ ] **Step 5: Implementar** `ColumnaTablero`, la prop en `TarjetaLead` y el montaje en `/leads`. CSS: `.lead[draggable="true"] { cursor: grab }`, `.lead--arrastrando { opacity: .5 }`, `.tablero__lista--recibe { outline: 2px dashed var(--verde); outline-offset: -4px }`, `[data-pendiente] .lead { opacity: .4; pointer-events: none }` solo para el id pendiente (usar `.lead--pendiente`).
- [ ] **Step 6: `npm run tsc`** — Expected: limpio. **Commit** `feat(leads): arrastrar tarjetas entre columnas del tablero (escritorio)`.

---

### Task 4: Recorrido real y documentación

**Files:**
- Create: `scripts/verificar-pulido.mts`
- Modify: `CLAUDE.md` (sección «Panel CRM, fase 4»)

- [ ] **Step 1: Recorrido** (mismo arnés que `verificar-leads.mts`; siembra leads «Boutique Alma» (web, Nuevo), «Hotel Cola» (directorio, enviado), directorio «Tienda Directorio», cliente y proyecto «Alma tienda»; dueño y prospectador temporales): a 1280 como dueño, en `/inicio` con el foco en un input cualquiera (usar `/leads/nuevo`, escribir «x» en nombre), `Control+k` abre `[role=dialog][aria-label="Buscar en el panel"]`; escribir «alma» → aparecen un lead, un proyecto y un cliente en ese orden; `ArrowDown` + `Enter` abre `/proyectos/<id>`; volver a `/leads/nuevo`, abrir con el botón de la lateral, Escape → el foco está en `input[name=nombre]` y su valor sigue siendo «x»; en `/leads`, `dragTo` de la tarjeta «Boutique Alma» a la columna `enviado` → la tarjeta queda en Propuesta enviada y en la base `etapa === "enviado"`; `dragTo` de «Hotel Cola» (enviado) a la columna `por_contactar` (no permitido: enviado no vuelve a Nuevo) → sigue en enviado y sin llamada (la base no cambia); a 390 como dueño, «Más» → «Buscar» abre el diálogo y «tienda» trae el directorio; como prospectador a 390, «Más» no existe: la búsqueda no se ofrece en su barra y `Control+k` sí abre y «alma» no trae nada, «hotel» trae «Hotel Cola».
- [ ] **Step 2: Correr** contra el clon — Expected: `N bien, 0 mal`; mirar las capturas.
- [ ] **Step 3: Suite completa** `env -u PROSPECTOS_URL_PUBLICA npm run test:db` — Expected: verde.
- [ ] **Step 4: CLAUDE.md**: sección «Panel CRM, fase 4: pulido» (búsqueda global por rol, evento `nc:buscar`, Ctrl+K, arrastre solo con puntero fino y nunca a Descartado, recorrido). Quitar «Pendiente (fase 4)» de la sección de la fase 3. Anotar que la prueba en el teléfono real la hace Neri.
- [ ] **Step 5: Commit** `feat(docs): recorrido verificar-pulido y CLAUDE.md fase 4`.
