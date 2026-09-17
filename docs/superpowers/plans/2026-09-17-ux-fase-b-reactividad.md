# Pasada de UX, Fase B (reactividad) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que cada toque del panel produzca un resultado visible al instante: respuesta optimista, aviso de
resultado con «Deshacer» donde se puede, «¿Se envió?» al volver de WhatsApp y sin doble viaje al servidor.

**Architecture:** la lógica que se puede probar sin navegador vive en contratos puros (`src/lib/*-contrato.ts`)
y en Server Actions nuevas con test contra la base; los componentes cliente usan `useOptimistic` dentro de la
misma transición que llama a la acción. Una sola línea flotante por panel (`ProveedorFlotante` en el layout)
anuncia resultados con `aria-live`. Las acciones ya llaman a `revalidatePath` de la ruta actual, así que la
respuesta de la acción trae el árbol nuevo: el `router.refresh()` de después es un segundo viaje y se quita.

**Tech Stack:** Next 15.5 (App Router, Server Actions), React 19.2 (`useOptimistic`, `useTransition`), Prisma
6 sobre MariaDB, Vitest, Playwright para el recorrido a 390 px. Sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-09-17-ux-panel-design.md`, Parte 2 (puntos 1 a 4). Los puntos 5 y 6
(esqueletos, validación en línea) y el service worker son la Fase C. Investigación:
`~/backups/prospectos-ux-investigacion-20260917.md`.

## Global Constraints

- Rama `ux-fase-b`, que sale de `ux-fase-a`. **No se fusiona ni se despliega sin que Neri vea la Fase A y dé el ok.**
- No cambia el esquema de la base: **cero migraciones**. `Evento.tipo` es texto libre; se agregan dos tipos.
- Nunca `next dev` ni `next build` en el docroot. Se prueba en `~/dev-clon-prospectos` (puerto 3014, base
  `neracosu_prospectos_test`, `PROSPECTOS_DIR_ARCHIVOS` temporal). Procesos se matan **solo por PID**.
- Un build a la vez en todo el servidor, nunca desde un subagente. Los subagentes verifican con `npx tsc --noEmit`.
- TDD para contratos y acciones. `npm test` y `npm run test:db` verdes antes de cerrar.
- Español (Venezuela), tuteo, en todo texto visible. Comentarios en el código sin acentos. Commits por heredoc.
- Un `prospectador` no ve montos: los avisos de Hoy y de Prospectos no llevan dinero.
- La cadena de imports de `src/instrumentation.ts` no se toca.
- Ningún gesto oculto; objetivos táctiles de 44 px; `prefers-reduced-motion` respetado (ya lo cubre `globals.css`).
- El portal del cliente (`src/app/c/`) no se toca.

## Decisiones tomadas en este plan (para que Neri las vea)

1. **«Deshacer» es una acción real en el servidor, no un envío demorado.** Demorar 4 s el guardado de un pago
   para poder cancelarlo pierde el pago si el teléfono cambia de app en ese rato. Se guarda al instante y se
   deshace con otra acción.
2. **Deshacer un pago es una regla nueva y estrecha** (`deshacerPago`): solo dentro de 60 s, solo si el cobro no
   tiene recibo ni está anulado. Deja rastro (`pago_deshecho`). Pasado ese minuto, el camino sigue siendo
   «Anular». Motivo: hoy un toque equivocado en una **mensualidad** solo se arregla anulándola, y el cron no la
   recrea.
3. **«Respondió», «¿Se envió? Sí» y «Descartar» no llevan Deshacer**: el embudo no retrocede (regla de la pieza 1).
4. **El aviso dura 4 s; con «Deshacer», 6 s.** El spec dice 4; con una mano, llegar al botón toma más.
5. **«¿Se envió?» sigue apareciendo al tocar el canal** y además **se resalta, se centra y enfoca «Sí» al volver**
   (`visibilitychange`). Si solo apareciera al volver, un `tel:` cancelado o un «copiar» nunca preguntaría.
   Si el navegador recargó la pestaña, la tarjeta lo recuerda 30 minutos por `sessionStorage`.
6. **De paso se arregla un detalle viejo:** al saltar con la cola corta, la tarjeta quedaba escondida hasta
   recargar aunque seguía en la cola. Ahora reaparece al final.

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/hoy-contrato.ts` (nuevo) | Sumar un ajuste optimista a las cifras de Hoy, sin negativos, y el % de la barra. Puro. |
| `src/lib/envio-pendiente-contrato.ts` (nuevo) | Serializar, leer y vencer el «quedó pendiente de confirmar» de `sessionStorage`. Puro. |
| `src/lib/optimista-contrato.ts` (nuevo) | Reductores puros de las listas: cobros, pendientes y filas de la bandeja. |
| `src/acciones/prospectos.ts` | `saltar` devuelve `ordenAnterior`; nueva `deshacerSalto`. |
| `src/acciones/cobros.ts` | Nueva `deshacerPago`. |
| `src/componentes/LineaFlotante.tsx` (nuevo) | `ProveedorFlotante` + `useFlotante()`: la línea de resultado con «Deshacer». |
| `src/componentes/ResumenHoy.tsx` (nuevo) | `ProveedorHoy`, `useAjusteHoy()` y la tarjeta de cifras de Hoy, en cliente. |
| `src/componentes/PreguntaEnvio.tsx` (nuevo) | El bloque «¿Se envió?» y el hook `useEnvioPendiente`. |
| `src/componentes/TarjetaCola.tsx`, `TarjetaSeguimiento.tsx`, `FichaAcciones.tsx` | Optimismo, avisos, pregunta compartida, sin `router.refresh()`. |
| `src/componentes/TabCobros.tsx`, `TabPendientes.tsx`, `Bandeja.tsx` | Lista optimista, avisos, Deshacer, sin `router.refresh()`. |
| `src/app/(panel)/layout.tsx`, `src/app/(panel)/hoy/page.tsx` | Montar los proveedores. |
| `src/app/globals.css` | `.flotante*`, `.pregunta--resaltada`, `.cobro--provisional`. |
| `src/app/(panel)/proyectos/[id]/page.tsx`, `prospectos/[id]/page.tsx` | Texto de los eventos nuevos en el historial. |
| `scripts/verificar-flujo-ux.mts` (nuevo) | Recorrido real a 390 px: instantáneo, Deshacer, recarga con pregunta pendiente. |

---

### Task 1: Contratos puros

**Files:** Create `src/lib/hoy-contrato.ts`, `src/lib/envio-pendiente-contrato.ts`, `src/lib/optimista-contrato.ts`;
Test `tests/hoy-contrato.test.ts`, `tests/envio-pendiente-contrato.test.ts`, `tests/optimista-contrato.test.ts`.

**Interfaces (produce):**

```ts
// hoy-contrato.ts
export type CifrasHoy = { enviados: number; meta: number; por_contactar: number; enviado: number; respondio: number; reunion: number };
export type AjusteHoy = Partial<Record<"enviados" | "por_contactar" | "enviado" | "respondio", number>>;
export const AJUSTE_ENVIO: AjusteHoy;      // enviados +1, por_contactar -1, enviado +1
export const AJUSTE_RESPONDIO: AjusteHoy;  // enviado -1, respondio +1
export const AJUSTE_DESCARTE_ENVIADO: AjusteHoy; // enviado -1
export function sumarAjustes(a: AjusteHoy, b: AjusteHoy): AjusteHoy;
export function invertir(a: AjusteHoy): AjusteHoy;
export function aplicarAjuste(base: CifrasHoy, ajuste: AjusteHoy): CifrasHoy; // nunca negativos
export function porcentajeDelDia(c: { enviados: number; meta: number }): number; // 0..100, meta 0 => 0
export function firmaCifras(c: CifrasHoy): string; // cambia cuando el servidor trae cifras nuevas

// envio-pendiente-contrato.ts
export const CLAVE_ENVIO_PENDIENTE = "pr:envio-pendiente";
export const VIGENCIA_ENVIO_MS = 30 * 60 * 1000;
export type EnvioPendiente = { prospectoId: number; canal: Canal; en: number };
export function serializarEnvio(e: EnvioPendiente): string;
export function leerEnvio(texto: string | null, ahora: number): EnvioPendiente | null; // null si roto, vencido, futuro o canal invalido

// optimista-contrato.ts
export type CambioCobro = { tipo: "pagado"; id: number; pagadoEn: Date; canal: string; referencia: string };
export type CobroOptimista = CobroFila & { provisional?: boolean };
export function aplicarCambioCobro(cobros: CobroOptimista[], c: CambioCobro): CobroOptimista[];
export type CambioPendiente = { tipo: "marcar"; id: number; hecho: boolean } | { tipo: "visible"; id: number } | { tipo: "mover"; id: number; direccion: "arriba" | "abajo" };
export function aplicarCambioPendiente(lista: PendienteFila[], c: CambioPendiente): PendienteFila[]; // desmarcar borra `avisado`, igual que el servidor
export type CambioFila = { id: number; decision: "aprobado" | "completado" | "descartado" };
export function aplicarDecision<T extends { id: number; decision: string; estado: string }>(lote: { pendientes: number; aprobables: number; filas: T[] } & Record<string, unknown>, c: CambioFila): typeof lote;
```

`optimista-contrato.ts` importa **solo tipos** de `@/lib/proyectos` (`import type`), para que el navegador no
arrastre Prisma.

- [ ] Escribir los tres tests (casos: ajuste que dejaría −1 queda en 0; meta 0 da 0 %; firma distinta al cambiar
  una cifra; envío vencido, del futuro, JSON roto, canal inventado y forma incompleta dan `null`; ida y vuelta de
  `serializarEnvio`; pagado marca `estado: "pagado"` y `provisional: true` y no toca las otras filas; marcar,
  desmarcar borra `avisado`; mover en el borde no cambia nada y devuelve la misma lista; decidir una fila
  `nuevo` baja `pendientes` y `aprobables`, una `repetido` solo `pendientes`, y una ya decidida no cambia nada).
- [ ] `npx vitest run tests/hoy-contrato.test.ts tests/envio-pendiente-contrato.test.ts tests/optimista-contrato.test.ts` → FALLA (módulos inexistentes).
- [ ] Implementar. → PASA.
- [ ] Commit `feat(ux): fase B - contratos puros de cifras de Hoy, envio pendiente y listas optimistas`.

### Task 2: `deshacerSalto` y `deshacerPago` (servidor, TDD contra la base)

**Files:** Modify `src/acciones/prospectos.ts`, `src/acciones/cobros.ts`, los dos `TEXTO_EVENTO`;
Test `tests/acciones-prospectos.test.ts`, `tests/cobros.test.ts`.

**Interfaces (produce):**

```ts
export async function saltar(prospectoId: number): Promise<Resultado<{ ordenAnterior: number }>>;
export async function deshacerSalto(prospectoId: number, ordenAnterior: number): Promise<Resultado>;
export async function deshacerPago(cobroId: number): Promise<Resultado>;
```

Reglas de `deshacerSalto`: sesión de panel; `ordenAnterior` entero ≥ 0; `updateMany` condicionado a
`etapa: "por_contactar"`; evento `salto_deshecho`; `refrescar()`. Si ya no está por contactar: «Ese prospecto ya
no está en la cola.»

Reglas de `deshacerPago`: solo `dueno`. Dentro de una transacción: el último evento `cobro_pagado` del cobro
tiene que existir y tener menos de `VENTANA_DESHACER_MS = 60_000`; si no, «Ya pasó el minuto para deshacer. Si el
pago está mal, anúlalo.» `updateMany` con `where: { id, pagadoEn: { not: null }, anuladoEn: null, reciboNumero: "" }`
y `data: { pagadoEn: null, canal: "", referencia: "", nota: "" }`; si `count === 0`: «Ese cobro ya tiene recibo o
está anulado: no se puede deshacer.» Evento `pago_deshecho` con el monto. El `updateMany` condicionado a
`reciboNumero: ""` y el de `generarRecibo` (condicionado a `pagadoEn: { not: null }`) se serializan por el candado
de fila: gana uno y el otro ve `count === 0`.

- [ ] Tests nuevos: `saltar` devuelve el orden que tenía; `deshacerSalto` lo repone y deja `salto_deshecho`;
  `deshacerSalto` sobre un enviado falla y no mueve nada; `deshacerPago` recién pagado deja `pagadoEn` nulo, canal
  y referencia vacíos y un evento `pago_deshecho`; con `reciboNumero` puesto falla y el pago sigue; con el evento
  `cobro_pagado` envejecido 2 minutos (update directo de `creadoEn`) falla; un `prospectador` no pasa
  (`REDIRECT:/hoy`); sobre un cobro nunca pagado falla.
- [ ] `npm run test:db -- tests/acciones-prospectos.test.ts tests/cobros.test.ts` → FALLAN los nuevos.
- [ ] Implementar; agregar `salto_deshecho: "Salto deshecho"` y `pago_deshecho: "Pago deshecho"` a los `TEXTO_EVENTO`. → PASAN.
- [ ] Commit `feat(ux): fase B - deshacer un salto y deshacer un pago (60 s, sin recibo)`.

### Task 3: Línea flotante

**Files:** Create `src/componentes/LineaFlotante.tsx`; Modify `src/app/(panel)/layout.tsx`, `src/app/globals.css`.

```ts
export type AvisoFlotante = { texto: string; tono?: "ok" | "error"; deshacer?: () => Promise<{ ok: boolean; mensaje?: string }>; textoDeshecho?: string };
export function ProveedorFlotante({ children }: { children: ReactNode }): JSX.Element;
export function useFlotante(): (a: AvisoFlotante) => void; // fuera del proveedor no hace nada
```

Una sola línea a la vez (la nueva reemplaza a la anterior). La zona `<div className="flotante-zona" role="status"
aria-live="polite">` está **siempre** en el DOM (una región viva que nace con su contenido no se anuncia).
Fija sobre la barra: `bottom: calc(var(--barra-alto) + env(safe-area-inset-bottom) + 12px)`, ancho máximo 616 px,
`z-index: 11`. «Deshacer» es un botón de 44 px de alto; al tocarlo se corta el reloj, se corre la acción y la
línea pasa a `textoDeshecho` (por defecto «Deshecho») o al mensaje de error en rojo. 4 s sin Deshacer, 6 s con.

- [ ] Implementar componente y CSS; montar `ProveedorFlotante` en el layout del panel envolviendo `main`.
- [ ] `npx tsc --noEmit` limpio. Commit `feat(ux): fase B - linea flotante de resultado con Deshacer`.

### Task 4: Hoy al instante

**Files:** Create `src/componentes/ResumenHoy.tsx`, `src/componentes/PreguntaEnvio.tsx`; Modify
`src/app/(panel)/hoy/page.tsx`, `src/componentes/TarjetaCola.tsx`, `src/componentes/TarjetaSeguimiento.tsx`.

- `ProveedorHoy` guarda un `AjusteHoy` en estado; cuando cambia `firmaCifras` de lo que manda el servidor, lo pone
  en cero **durante el render** (no en un efecto: evita un cuadro con la cifra sumada dos veces).
  `useAjusteHoy()` devuelve `(a: AjusteHoy) => void`; fuera del proveedor no hace nada.
- `ResumenHoy` dibuja lo mismo que hoy dibuja la página (mismas clases), con las cifras ajustadas.
- `useEnvioPendiente(prospectoId)` → `{ canal, volvio, abrir(canal), cerrar() }`. `PreguntaEnvio` recibe
  `{ volvio, pendiente, onSi, onNo }`; al pasar `volvio` a `true` se centra (`scrollIntoView({ block: "center" })`)
  y enfoca «Sí»; clase `pregunta--resaltada`.
- `TarjetaCola`: `const [oculta, ocultar] = useOptimistic(false)`. «Sí»: dentro de la transición `ocultar(true)`,
  `ajustar(AJUSTE_ENVIO)`, `await marcarEnviado`; si falla, `ajustar(invertir(AJUSTE_ENVIO))` y el error en la
  tarjeta; si sale bien, `setHecha(true)` y aviso «Enviado a {nombre}». «Saltar»: `ocultar(true)`, `await saltar`;
  bien → aviso «Saltaste a {nombre}» con Deshacer → `deshacerSalto(id, ordenAnterior)`. **Saltar no pone `hecha`**:
  con la cola corta la tarjeta sigue en la lista, al final.
- `TarjetaSeguimiento`: igual; «Respondió» ajusta `AJUSTE_RESPONDIO`, «Descartar» `AJUSTE_DESCARTE_ENVIADO`.
- Se quita `useRouter`/`router.refresh()` de las dos tarjetas.

- [ ] Implementar. `npx tsc --noEmit` limpio. Commit `feat(ux): fase B - Hoy responde al instante; ¿Se envio? se resalta al volver de WhatsApp`.

### Task 5: Ficha del prospecto

**Files:** Modify `src/componentes/FichaAcciones.tsx`.

Usa `useEnvioPendiente` + `PreguntaEnvio`; avisos: «Marcado como enviado», «Seguimiento registrado», «Pasó a
«{etapa}»», «Nota guardada», «Seguimiento movido al dd/mm/aaaa» / «Seguimiento quitado». Sin `router.refresh()`.

- [ ] Implementar. `tsc` limpio. Commit `feat(ux): fase B - la ficha del prospecto avisa cada resultado`.

### Task 6: Cobros y pendientes

**Files:** Modify `src/componentes/TabCobros.tsx`, `src/componentes/TabPendientes.tsx`, `src/app/globals.css`.

- Cobros: `useOptimistic(cobros, aplicarCambioCobro)`. Al confirmar el pago: se cierra el formulario, la fila pasa
  a «Pagado» al instante; una fila `provisional` **no dibuja `AccionesRecibo`** (no se genera un recibo de un pago
  que el servidor todavía no confirmó). Bien → aviso «Pagado {monto}» con Deshacer → `deshacerPago(id)`,
  `textoDeshecho: "Pago deshecho"`. Mal → vuelve atrás sola, se reabre el formulario y se muestra el error.
- Pendientes: `useOptimistic(pendientes, aplicarCambioPendiente)`; la casilla ya no se deshabilita; el avance se
  recalcula con `porcentajeAvance` sobre la lista optimista. Marcar hecho → aviso «Hecho: {texto}» con Deshacer →
  `marcarPendiente(id, false)`. Desmarcar no ofrece Deshacer (borra el «avisado»). «Mostrar al cliente», «Subir»
  y «Bajar» también optimistas.
- Sin `router.refresh()` en ninguno de los dos.

- [ ] Implementar. `tsc` limpio. Commit `feat(ux): fase B - cobros y pendientes optimistas, con Deshacer`.

### Task 7: Bandeja

**Files:** Modify `src/componentes/Bandeja.tsx`.

`useOptimistic(lote, aplicarDecision)`: aprobar, completar y descartar marcan la ficha como decidida al instante
y bajan «N por decidir» y el botón «Aprobar las N nuevas». Avisos «Aprobado: {nombre}», «Completado: {nombre}»,
«Descartado: {nombre}». Si falla, vuelve atrás y el error sale en la ficha (ya existe). «Corregir» y «Aprobar
todas» quedan como están (no son de un toque). Sin `router.refresh()` en `correr`.

- [ ] Implementar. `tsc` limpio. Commit `feat(ux): fase B - la bandeja decide al instante`.

### Task 8: Recorrido real y cierre

**Files:** Create `scripts/verificar-flujo-ux.mts`; Modify `CLAUDE.md`.

El script usa las mismas guardas que `capturas-panel.mts` (base de tests, nunca el dominio ni el 3013), siembra
con la marca `(PRUEBA)`, entra con un dueño temporal y borra lo suyo. Comprueba a 390 px:

1. Hoy: «Sí» → la tarjeta desaparece, el número del día sube y sale «Enviado a …».
2. Hoy: «Saltar» → sale el aviso; «Deshacer» → la tarjeta vuelve **a la primera posición** de la cola.
3. Hoy: tocar el canal, recargar la página → la tarjeta vuelve a preguntar «¿Se envió?».
4. Cobros: «Marcar pagado» → «Confirmar» → «Pagado»; «Deshacer» → la fila vuelve a tener «Marcar pagado» y en la
   base `pagadoEn` es nulo.
5. Pendientes: marcar → «Hecho: …»; «Deshacer» → desmarcado en la base.
6. Ninguna petición GET con `_rsc` a la misma ruta justo después de una acción (el doble viaje que se quitó).

- [ ] En el clon: `git pull`, `npx tsc --noEmit`, `npm test`, `npm run test:db`, **build del clon**, `next dev -p 3014`
  por PID, `verificar-flujo-ux.mts`, `verificar-flujo-portal.mts` y `capturas-panel.mts capturas/ux-fase-b`.
- [ ] Revisión por un subagente (solo lectura + `tsc`), arreglos, y nota en `CLAUDE.md` con las trampas nuevas.
- [ ] Commit `docs: fase B de la pasada de UX`.
