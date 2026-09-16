# Pieza 3 — Proyectos y cobros — diseño

**Fecha:** 2026-09-16 · **Dueño:** Neri Colón · **Estado:** aprobada en la sesión del 16-sep.
Depende de la pieza 1. Ver `2026-09-16-plataforma-vision-general.md`.

## Qué resuelve

Cuando un prospecto pasa a `ganado`, el panel deja de servir: no dice qué se le entregó, qué se le
cobró ni cuántas horas costó. Esta pieza lleva cada proyecto vendido hasta el cobro mensual, y además
registra los clientes que Neri ya tiene (el hotel de Valencia, Soporte Vipsoft) sin pasar por el
embudo.

Solo `dueno` entra a `/proyectos/*`. Cada server action valida el rol.

## Tablas

- **`Cliente`**: `nombre` (del negocio), `contactoNombre`, `whatsapp`, `email`, `rif` (para el
  recibo), `instagram`, `facebook`, `tiktok`, `prospectoId` (opcional; si vino del embudo), `codigo`
  (para el portal, pieza 5; 16 bytes aleatorios base64url), `creadoEn`.
- **`Proyecto`**: `clienteId`, `nombre` («PMS Hotel»), `nichoId`, `pagoUnico`, `mensualidad`,
  `horasCotizadas`, `fechaInicio`, `fechaEntregaEstimada`, `fechaEntregaReal`, `estado`
  (`en_construccion → entregado → activo → pausado | cerrado`), `diaCobroMensual` (1–28),
  `propuestaCodigo` (enlace a la propuesta aceptada, si existe), `creadoEn`.
- **`Cobro`**: `proyectoId`, `concepto` (`pago_unico`, `cuota`, `mensualidad`, `extra`), `detalle`
  («cuota 2 de 3», «octubre 2026»), `monto`, `moneda` (`USD`; si se cobra en bolívares se anota el
  equivalente en USD y el canal), `vence`, `pagadoEn` (nulo = pendiente), `canal` (`zelle`,
  `pago_movil`, `efectivo`, `binance`, `transferencia`, `otro`), `referencia`, `nota`, `anuladoEn`,
  `anuladoMotivo`, `reciboNumero`, `reciboGeneradoEn` (los dos últimos los llena la pieza 4).
- **`Pendiente`**: `proyectoId`, `texto`, `hecho`, `hechoEn`, `visibleCliente`, `orden`,
  `fechaEstimada` (opcional; con ella el portal lo muestra como hito con fecha).
- **`Horas`**: `proyectoId`, `fecha`, `horas` (decimal, mínimo 0.25), `descripcion`, `usuarioId`.
- **`Version`**: `proyectoId`, `version` (validada como SemVer `MAYOR.MENOR.PARCHE`, única por
  proyecto), `fecha`, `avisadoEn` (cuándo se avisó al cliente; nulo si no), `creadoEn`.
- **`Cambio`**: `versionId`, `tipo` (`nuevo`, `mejora`, `arreglo`), `texto`, `orden`.
- **`Evento`** (de la pieza 1) gana `proyectoId` opcional y los tipos `cobro_pagado`,
  `cobro_anulado`, `recordatorio`, `version_publicada`, `aviso_cliente`, `hito_cumplido`.
- **`Configuracion`** gana `mensaje_cobro_recordatorio`, `mensaje_cobro_vencido`, `datos_emisor`
  (nombre, RIF, WhatsApp, correo; los usa el recibo).

Nada se borra. Un cobro equivocado se anula con motivo; un proyecto que no va se pasa a `cerrado`.

## Cómo nacen los cobros

- Al crear el proyecto se elige **pago único completo** (un `Cobro` con `vence = fechaInicio`) o **en
  cuotas** (cuántas y en qué fechas; el panel propone partes iguales y se editan). Se generan de una
  vez.
- La **mensualidad se genera sola**: un cron **dentro de la app** (no del sistema; se dispara al
  arrancar y cada día a las 06:00 Caracas) crea el `Cobro` `mensualidad` del mes cuando el proyecto
  está `activo` y faltan 7 días o menos para `diaCobroMensual`. Es idempotente: no crea dos para el
  mismo proyecto y mes. En `pausado` y `cerrado` no genera.
- Un `extra` se crea a mano (trabajo fuera de alcance).
- En la primera activación solo se generan mensualidades que vencen desde hoy; el rescate de 60
  días aplica cuando ya existe alguna.

## Pantallas (390 px primero)

1. **`/proyectos`**
   - Arriba tres cifras del **mes de Caracas**: **cobrado · vencido · por cobrar**.
   - Lista de proyectos: nombre, cliente, estado, versión actual, semáforo (**rojo** cobro vencido,
     **amarillo** vence en 7 días, **verde** al día). Los `ganado` sin proyecto aparecen arriba con
     «falta crear proyecto».
2. **`/proyectos/[id]`** — cabecera con estado (botones para cambiarlo) y pestañas:
   - **Cobros**: lista ordenada por `vence`. Cada uno con **Marcar pagado** (pide fecha, canal,
     referencia), **Recordar** (abre WhatsApp con `mensaje_cobro_recordatorio` o
     `mensaje_cobro_vencido` según el caso; deja `Evento` `recordatorio`) y **Anular** (motivo).
     Botón **Agregar cobro** para extras y cuotas nuevas.
   - **Pendientes**: lista con casilla, interruptor «visible al cliente», `fechaEstimada` opcional,
     subir/bajar con botones (arrastrar no funciona bien en el teléfono). Arriba el % de avance
     visible (hechos / visibles).
   - **Horas**: formulario «fecha (hoy por defecto) · horas · qué hice» y abajo **cotizadas vs.
     reales**, con la diferencia en horas y en dólares a `TARIFA_HORA` (se lee de Configuración,
     valor inicial 17, igual que la calculadora del sitio).
   - **Versiones**: versión actual arriba; formulario con número, fecha y cambios (tipo + texto), y
     un área para **pegar el bloque de `CHANGELOG.md`** en Markdown: `### Nuevo / Mejora / Arreglo`
     seguidos de viñetas se convierten en cambios. Botón **Avisar al cliente** (WhatsApp con la
     versión y el enlace del portal; marca `avisadoEn`).
   - **Cliente**: datos de contacto, RIF, botones de canal, y (pieza 5) acceso al portal.
3. **`/proyectos/nuevo`** — desde `ganado` viene con el cliente cargado; a mano pide cliente primero
   (buscar uno existente o crearlo). Campos: nombre, nicho, pago único, mensualidad, horas cotizadas,
   fecha de inicio, entrega estimada, día de cobro, forma de pago (completo / cuotas).
4. **`/clientes`** y **`/clientes/[id]`** — lista corta y ficha; existen sobre todo para los clientes
   que no vinieron del embudo.

## Reglas

- **Una versión no se edita después de `avisadoEn`**: se corrige con otra versión. Antes de avisar sí
  se puede editar.
- **Recordar** no se dispara dos veces el mismo día (Caracas) para el mismo cobro: el botón lo dice y
  no abre WhatsApp.
- **Marcar pagado** usa `updateMany` condicionado a `pagadoEn IS NULL`: dos toques no escriben dos
  eventos.
- Al pasar a `entregado` se fija `fechaEntregaReal`; al pasar a `activo` arranca la generación de
  mensualidades. `pausado` congela; `cerrado` no genera más y no vuelve atrás sin motivo.
- El % de avance solo cuenta pendientes `visibleCliente`. Un proyecto sin pendientes visibles muestra
  «sin hitos publicados», no 0 %.
- Los montos se guardan como `DECIMAL(10,2)`. Nunca `float`.
- **`ganado` → «¿Crear proyecto?»**: al marcar `ganado` en la pieza 1, el panel ofrece crear el
  proyecto; si se pospone, Hoy lo recuerda.

## Mensajes de cobro

En Ajustes, con `{cliente}`, `{proyecto}`, `{monto}`, `{concepto}`, `{vence}` y `{enlace}` (el del
portal cuando exista la pieza 5; hasta entonces la variable se sustituye por vacío y se avisa en
Ajustes).

## Errores y bordes

- Un cobro con `vence` en el pasado y sin `pagadoEn` está **vencido**. Uno con `vence` en los próximos
  7 días está **por vencer**.
- Cambiar `diaCobroMensual` no toca cobros ya generados; aplica desde el mes siguiente.
- Si el cron falla un día, al siguiente genera lo que faltó (mira los últimos 60 días).
- Horas con fecha futura: se rechaza.

## Pruebas

- Contratos puros sin base: cálculo de vencido/por vencer, cifras del mes, % de avance, validación
  SemVer, parser de `CHANGELOG.md`, generación de cuotas, decisión del cron (qué mes toca).
- Con base (`_test`): idempotencia del cron y de Marcar pagado, `ganado` → proyecto, anulación con
  recibo (pieza 4), roles (un `prospectador` recibe 403 en toda acción de esta pieza).
- Playwright a 390 px: crear proyecto desde `ganado`, marcar pagado, publicar versión pegando
  Markdown, ver cifras del mes.

## Fuera de alcance

Gastos, impuestos, tasa BCV, cobros en bolívares con conversión, cronómetro de horas, asignar
pendientes a personas, fechas límite con alarmas, Gantt.
