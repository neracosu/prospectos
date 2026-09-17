# Pasada de UX del panel — diseño

**Fecha:** 2026-09-17 · **Dueño:** Neri Colón · **Estado:** propuesta, pendiente de aprobar.
Investigación de respaldo: `~/backups/prospectos-ux-investigacion-20260917.md` (Apple HIG, Material 3,
WCAG 2.2, NN/g, React 19 / Next 15, con URLs).

## Qué es y para quién

Una herramienta que Neri (y un prospectador de confianza) usa **todos los días, desde el teléfono, con
una mano**, para mandar propuestas por WhatsApp y cobrar mensualidades. No es un producto para
terceros ni una landing: es una herramienta de trabajo. Su trabajo principal es **que cada toque
produzca un resultado visible al instante y sin dudas**: enviar, marcar, cobrar, recordar.

Lo que hay hoy salió del spec sin criterio visual deliberado ni patrones de reactividad: cada botón se
deshabilita mientras el servidor responde, el éxito se ve porque la página se refresca, no hay
validación en línea, ni aviso de resultado, ni respuesta optimista. Funciona, pero se siente lento y
uno nunca está seguro de si «pegó».

## Parte 1 — Sistema visual (tokens)

**Color.** La paleta actual (negro casi puro + verde neón) es el cliché número uno de las interfaces
generadas. El verde `#5ed29c` **se queda porque es la marca** (el punto del logotipo NERACOSU), pero
deja de ser el color de todo y pasa a ser el color de **la acción principal y del dinero que entra**.

| Token | Valor | Uso |
|---|---|---|
| `--fondo` | `#121614` | Fondo de página. No es negro puro; tiene un toque verde-gris cálido. |
| `--superficie` | `#1b211e` | Tarjetas. La elevación se marca por luminosidad, sin sombras. |
| `--superficie-2` | `#252c28` | Elementos sobre tarjetas (campos, chips, botones secundarios). |
| `--tinta` | `#eef3f0` / `--tinta-suave` `#a3b3aa` | Texto. La suave da ≥ 7:1 sobre `--fondo`. |
| `--marca` | `#5ed29c` | Botón principal de cada pantalla, cobrado, semáforo verde. Un solo uso por vista. |
| `--ambar` `#f0c35a` · `--rojo` `#ef6b6b` | Vence pronto / pendiente de confirmar · vencido, anular, error. |

**Tipografía.** Una sola familia: **Source Sans 3** (la misma de la propuesta en PDF que reciben los
hoteles: el panel y los documentos se ven de la misma casa), autoalojada con `next/font` (no depende de
Google con señal débil). Tamaños: 15 px base en tarjetas (hoy 16 px, muy grande para densidad), 20 px
títulos, 26 px para **el número del día** en Hoy. `font-variant-numeric: tabular-nums` en todo monto,
hora, fecha y versión: las columnas no «bailan».

**Estructura.** La barra inferior de 5 secciones se queda (es navegación, no acciones, como pide la
guía de Apple) con `safe-area-inset-bottom`. **La acción principal de cada pantalla vive en la zona del
pulgar**, abajo a la derecha, no arriba:

```
┌──────────────────────────────┐
│ Hoy: 3 de 10 enviados ▓▓▓░░░ │ ← el único elemento grande de la pantalla
│ 132 · 1 · 0 · 0              │
├──────────────────────────────┤
│ ▌Hotel Yare · Caracas        │ ← franja izquierda = estado (verde/ámbar/rojo)
│  nota corta…                 │
│  [Enviar por WhatsApp]  ···  │ ← una acción principal; el resto detrás de «···»
├──────────────────────────────┤
│  …                           │
├──────────────────────────────┤
│ Hoy  Prospectos  Buscar  …   │ ← barra fija, 5 secciones
└──────────────────────────────┘
```

Alineación: todo a la izquierda; los montos a la derecha y tabulares. Una tarjeta enseña **una**
acción principal en verde; las secundarias («Saltar», «Copiar», SMS, llamada) se agrupan detrás de un
botón «···» que despliega. Hoy cada tarjeta tiene 5–7 botones a la vista: el ojo no sabe dónde ir.

**Principios.**
1. Un solo elemento audaz por pantalla (el contador del día en Hoy; el semáforo + monto en Proyectos).
2. Ningún gesto oculto: nada de deslizar para acciones; todo es un botón visible o un «···».
3. Los números se alinean; el dinero se lee sin contar ceros.
4. La voz es la del panel, en tuteo, y el botón dice lo que hace: «Marcar pagado» → «Pagado».

**Revisión contra el cliché:** el plan original que me salía era «fondo `#0f1412` + verde neón por
todos lados + tarjetas idénticas con el mismo radio». Cambié: fondo y superficies por luminosidad (no
sombras), verde solo en la acción principal, tipografía propia con tabulares, y la franja de estado
en el borde de la tarjeta en vez de una etiqueta más.

## Parte 2 — Reactividad y retroalimentación

Es la parte que más cambia cómo se siente. Ordenada por impacto:

1. **Respuesta optimista en los botones que se usan cien veces al día** («¿Se envió? Sí», «Marcar
   pagado», «Respondió», marcar pendiente, «Saltar»): con `useOptimistic` + `useActionState` la
   tarjeta cambia **al instante**; si el servidor falla, vuelve atrás y muestra el error en la misma
   tarjeta. Nada de esperar 1–2 s con el botón gris.
2. **Aviso de resultado** («Enviado a Hotel Yare», «Pagado $933,33») como una línea flotante abajo
   (sobre la barra) que se va sola en 4 s, anunciada con `aria-live`. Para lo reversible, el aviso
   trae **Deshacer** durante esos segundos (marcar pagado, saltar, marcar hecho). Para lo
   irreversible (anular un cobro, descartar) sigue la confirmación explícita, con el motivo.
3. **Volver de WhatsApp:** hoy la pregunta «¿Se envió?» aparece al tocar el botón. Pasa a aparecer
   **cuando la pestaña vuelve a primer plano** (`visibilitychange`), resaltada, con Sí/No listos. Si
   el navegador recargó la pestaña mientras estabas en WhatsApp, la tarjeta recuerda (en
   `sessionStorage`) que quedó pendiente y vuelve a preguntar.
4. **Sin refresco de página completa:** las listas se actualizan en el lugar (la tarjeta se va, el
   contador sube) en vez de `router.refresh()` de toda la vista.
5. **Carga:** esqueletos (no ruedas) en las listas mientras cargan; nada de indicador si tarda menos
   de 1 s.
6. **Formularios:** validación al salir del campo (no al escribir), mensaje pegado al campo y visible
   con el teclado abierto; montos con `inputmode="decimal"` y teléfonos con `inputmode="tel"`
   (ya está en la pieza 3; se extiende a todo); `autocomplete` donde aplique.

## Parte 3 — Accesibilidad y cuidado

- Objetivos táctiles reales de 44×44 px en **todo** (los «mini» de 36 px pasan a 44 de área táctil
  con el mismo tamaño visual).
- Anillo de foco visible con contraste ≥ 3:1 (WCAG 2.4.11) sobre el tema oscuro.
- `prefers-reduced-motion`: sin animaciones para quien lo pide.
- Un service worker mínimo (caché de assets, red para datos) para que con señal débil no se vea una
  pantalla en blanco. Sin prometer «offline»: todo pasa por el servidor.

## Alcance y orden

- **Fase A (una tarde):** tokens, tipografía, franja de estado, «···», tabulares, foco, reduced
  motion, objetivos táctiles. Es CSS y componentes; no toca acciones ni base.
- **Fase B (uno o dos días):** optimismo + avisos + deshacer + volver de WhatsApp + sin refresco
  completo, pantalla por pantalla: Hoy → ficha del prospecto → Proyectos (cobros, pendientes) →
  Bandeja de la pieza 2.
- **Fase C (medio día):** esqueletos, validación en línea, service worker.

Cada fase se revisa a 390 px con capturas y en tu teléfono antes de pasar a la siguiente. Nada de esto
cambia reglas de negocio ni la base de datos.

## Fuera de alcance

Rediseñar la propuesta en PDF, tema claro, íconos ilustrados, gestos de deslizar, notificaciones push,
modo offline real.
