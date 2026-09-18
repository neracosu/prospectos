# Pasada de UX, Fase C (carga, validación en línea, service worker) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que el panel no muestre nunca una pantalla en blanco (esqueletos al navegar, página de «sin conexión» con
señal débil) y que los formularios digan qué está mal en el campo, al salir de él, antes de ir al servidor.

**Architecture:** un `loading.tsx` en el grupo `(panel)` (esqueleto genérico, sin ruedas); un componente `Campo` que
valida al salir del campo con reglas puras que **copian** las de zod del servidor (`src/lib/validacion-contrato.ts`) y
usa `setCustomValidity` para que el envío nativo se bloquee y `onInvalid` muestre el mensaje pegado al campo; un
service worker clásico en `public/sw.js` con la decisión de ruteo en una función pura (`decidir`) que los tests leen,
registrado solo en producción y solo desde el layout del panel. **Nada se cachea salvo assets con hash y la página de
sin conexión**: ni HTML, ni RSC, ni `/c/*`, `/p/*`, `/recibos/*`.

**Tech Stack:** Next 15.5 (`loading.tsx`, `headers()`), React 19, Constraint Validation API, Service Worker API,
Vitest, Playwright (contra `next start` del clon: el SW solo existe en producción).

**Spec:** `docs/superpowers/specs/2026-09-17-ux-panel-design.md`, Parte 2 (5 y 6) y Parte 3 (service worker).

## Global Constraints

- Rama `ux-fase-c` (sale de `ux-fase-b` + `main`). **Nada se fusiona ni se despliega hasta que Neri lo vea.**
- Cero migraciones. El portal (`src/app/c/`) no se toca ni registra el service worker.
- La validación del navegador **nunca reemplaza** a la del servidor: copia sus reglas y sus topes (`TOPES`,
  `MONTO_TEXTO`, `esFechaIso`), y si difieren manda el servidor.
- `autocomplete` solo en datos del propio dueño (Ajustes → emisor). Los datos de prospectos y clientes van con
  `autoComplete="off"`: rellenar el teléfono de Neri en la ficha de un hotel es un dato falso.
- Los esqueletos son decorativos: `aria-hidden`, más un «Cargando…» solo para lectores (`role="status"`).
- `prefers-reduced-motion`: la regla global apaga animaciones; el esqueleto tiene que verse igual sin ellas.
- Español (Venezuela), tuteo; comentarios sin acentos; commits por heredoc; un build a la vez; procesos por PID.

## Decisiones

1. **El esqueleto aparece al instante, sin retraso de 1 s.** El spec dice «nada de indicador si tarda menos de 1 s»
   para ruedas; un bloque quieto del color de las tarjetas no molesta si dura 200 ms y sí evita el blanco.
2. **Cambiar de pestaña dentro de un proyecto (`?t=`) no muestra esqueleto**: React mantiene el contenido viejo
   durante la transición. Se comprueba con Playwright; si mostrara esqueleto, se saca `loading.tsx` de ese segmento.
3. **Validar al salir del campo, corregir al escribir.** El mensaje aparece en `blur` (o al enviar); una vez visible,
   se quita mientras se escribe y queda bien. Nunca aparece mientras se escribe la primera vez (NN/g).
4. **El mensaje va entre la etiqueta y el campo**, no debajo: con el teclado abierto lo de abajo no se ve.
5. **Sin conexión = página propia, honesta**: «Sin conexión. Todo pasa por el servidor: vuelve a intentar cuando tengas
   señal», con Reintentar. Sin prometer trabajo offline.
6. **El service worker se registra solo en producción** y solo desde el layout del panel. Su alcance es `/` (Next sirve
   `public/sw.js` en la raíz), pero `decidir` ignora `/c/`, `/p/`, `/recibos/`, `/api` y todo lo que no sea GET del
   mismo origen.

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/validacion-contrato.ts` (nuevo) | Reglas puras: `validar(regla, valor) → mensaje | ""`. |
| `src/componentes/Campo.tsx` (nuevo) | Etiqueta + mensaje + control; valida en blur/invalid; `setCustomValidity`. |
| `src/componentes/FormularioNuevo.tsx`, `FormularioCliente.tsx`, `FormularioProyecto.tsx`, `TabCobros.tsx`, `TabPendientes.tsx`, `FormularioAjustesCobros.tsx` | Usar `Campo`. |
| `src/app/(panel)/loading.tsx` (nuevo) | Esqueleto genérico. |
| `src/app/sin-conexion/page.tsx` (nuevo) | Página estática de sin conexión. |
| `public/sw.js` (nuevo) | Service worker; `decidir` puro. |
| `src/componentes/RegistrarSW.tsx` (nuevo) | Registro en producción. |
| `next.config.ts` | `Cache-Control: no-cache` para `/sw.js`. |
| `src/app/globals.css` | `.esqueleto*`, `.campo--error`, `.campo__error`. |
| `tests/validacion-contrato.test.ts`, `tests/sw.test.ts` | Tests puros. |
| `scripts/verificar-flujo-ux-c.mts` (nuevo) | Playwright contra `next start` del clon: esqueleto, validación, sin conexión. |

---

### Task 1: Reglas puras de validación (TDD)

```ts
export type Regla =
  | { tipo: "texto"; min?: number; max: number }
  | { tipo: "monto" }                       // MONTO_TEXTO: hasta 8 enteros y 2 decimales, coma o punto
  | { tipo: "fecha" }                       // esFechaIso
  | { tipo: "entero"; min: number; max: number }
  | { tipo: "correo" }
  | { tipo: "url" };
export function validar(regla: Regla, valor: string, requerido: boolean): string; // "" = bien
```
Mensajes: «Este dato hace falta.», «Mínimo N letras.», «Máximo N letras.», «Escribe el monto sin punto de miles,
por ejemplo 150 o 150,50.», «Escribe una fecha válida.», «Tiene que ser un número entre A y B.», «Escribe un correo
válido.», «Escribe una dirección que empiece por http:// o https://.». Vacío y no requerido → "".

- [ ] Test → falla → implementar → pasa → commit.

### Task 2: `Campo` y los formularios

`Campo` recibe `{ etiqueta, nombre, regla?, requerido?, tipo?, control?: "input" | "select" | "textarea", children?
(opciones del select), ...props del control }`. Estado: `mensaje`. Handlers: `onBlur` valida y muestra; `onInput`
valida y actualiza `setCustomValidity` siempre, pero solo actualiza el mensaje visible si ya había uno; `onInvalid`
(`e.preventDefault()`) muestra el mensaje y, si es el primer `:invalid` del formulario, enfoca y centra el campo.
`aria-invalid`, `aria-describedby` al `<small id className="campo__error" role="alert">`. `TOPES` para nombre/ciudad/
estado. Los formularios conservan sus `name`, `defaultValue` y acciones.

- [ ] Implementar `Campo` + CSS; migrar los seis formularios; `tsc`; commit.

### Task 3: Esqueleto y sin conexión

- `src/app/(panel)/loading.tsx`: título + 3 tarjetas de bloques (`.esqueleto__bloque`), `aria-hidden`, y un
  `<p role="status" className="solo-lector">Cargando…</p>`.
- `src/app/sin-conexion/page.tsx`: estática; enlace «Reintentar» a `/hoy`.
- [ ] Implementar; commit.

### Task 4: Service worker (TDD sobre `decidir`)

`public/sw.js` (script clásico):
```js
var CACHE = "pr-estaticos-v1"; var SIN_CONEXION = "/sin-conexion"; var TOPE = 200;
function decidir(metodo, url, modo, origen) → "estatico" | "navegacion" | "ignorar"
```
- GET, mismo origen, ruta que empieza por `/_next/static/`, `/icono` o es `/manifest.webmanifest` → `estatico`
  (cache-first; al guardar, poda a `TOPE`).
- GET, mismo origen, `modo === "navigate"`, y la ruta NO empieza por `/c/`, `/p/`, `/recibos/`, `/api/`,
  `/sin-conexion` → `navegacion` (red; si falla, la página cacheada de sin conexión).
- Todo lo demás → `ignorar` (no `respondWith`).
- `install`: precachea `/sin-conexion`, `skipWaiting`. `activate`: borra cachés con otro nombre, `clients.claim`.
- Al final: `if (typeof self !== "undefined" && self.addEventListener) { …listeners… }` y `if (typeof module !== "undefined") module.exports = { decidir }`.
- `tests/sw.test.ts` carga el archivo con `new Function("module", "self", codigo)` y prueba `decidir`.
- `RegistrarSW.tsx` (`"use client"`): `useEffect` → si `process.env.NODE_ENV === "production"` y hay
  `navigator.serviceWorker`, `register("/sw.js")`; errores al `console.warn`. Montado en `src/app/(panel)/layout.tsx`.
- `next.config.ts`: `{ source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] }`.
- [ ] Test → implementar → commit.

### Task 5: Recorrido real y cierre

`scripts/verificar-flujo-ux-c.mts` contra `next start -p 3014` del clon (build previo, `NODE_ENV=production`,
`DATABASE_URL` de tests, `PROSPECTOS_DIR_ARCHIVOS` temporal):
1. Con la respuesta de `/prospectos` retenida 1,5 s, tocar «Prospectos» muestra `.esqueleto` antes de 300 ms.
2. Con la de `/proyectos/<id>?t=pendientes` retenida, cambiar de pestaña NO muestra `.esqueleto` y el contenido de
   cobros sigue a la vista.
3. `/prospectos/nuevo`: escribir «A» en nombre y salir → «Mínimo 2 letras.» pegado al campo; enviar con ciudad vacía
   → el foco cae en ciudad con «Este dato hace falta.»; corregir → el mensaje se va al escribir.
4. `/sw.js` responde 200 con `Cache-Control: no-cache`; tras cargar `/hoy`, `navigator.serviceWorker.ready`; con
   `context.setOffline(true)`, navegar a `/prospectos` muestra «Sin conexión»; `/c/abc` sin conexión NO muestra esa
   página (falla como siempre).
5. `/c/<codigo>` no registra ningún service worker cuando se abre en un contexto limpio.
- [ ] tsc, `npm test`, `npm run test:db`, build del clon, recorrido, capturas, revisión por subagente, `CLAUDE.md`, commit.
