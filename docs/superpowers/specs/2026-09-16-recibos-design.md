# Pieza 4 — Recibos de pago — diseño

**Fecha:** 2026-09-16 · **Dueño:** Neri Colón · **Estado:** aprobada en la sesión del 16-sep.
Depende de la pieza 3. Ver `2026-09-16-plataforma-vision-general.md`.

## Qué es y qué no es

Un PDF por cada `Cobro` pagado, generado con el mismo Playwright de las propuestas a partir de una
plantilla HTML dentro del repo (`plantillas/recibo.html`). Se titula **«Recibo de pago»** y nunca
«factura»: en Venezuela la factura es un documento fiscal con requisitos del SENIAT (numeración
autorizada, IVA), y este panel no la emite. Neri lo decidió así el 16-sep. Si un cliente exige
factura, se emite fuera del panel y aquí se guarda solo el número en `Cobro.nota`.

Solo `dueno` genera recibos.

## Contenido

- **Cabecera**: NERACOSU, nombre, RIF, WhatsApp y correo del emisor (de `Configuracion.datos_emisor`;
  si faltan, el botón dice «completa tus datos en Ajustes» y no genera).
- **Número**: `R-AAAA-NNNN`, correlativo por año, asignado al generar por primera vez, nunca
  reutilizado.
- **Cliente**: nombre del negocio, RIF si lo tiene, contacto.
- **Concepto**: proyecto + tipo + detalle («Mensualidad — octubre 2026», «Pago único — cuota 2 de
  3», «Extra — módulo de reportes»). Si es mensualidad y hay versiones con `fecha` dentro de ese mes,
  las lista: «Incluye v1.4.0 a v1.4.2».
- **Monto** en USD con dos decimales, **fecha de pago**, **canal**, **referencia**.
- **Pie**: «Este documento es un recibo de pago y no constituye factura fiscal.»

## Dónde vive

`~/prospectos-archivos/recibos/<año>/R-2026-0001.pdf`, fuera del docroot, permisos 600. Se genera
una vez y se guarda: **un recibo emitido no cambia**, aunque cambie la plantilla. `Cobro` guarda
`reciboNumero` y `reciboGeneradoEn`. Un contador por año vive en la tabla `Correlativo` (`serie`,
`anio`, `ultimo`).

## Cómo se usa

- En `/proyectos/[id]` → Cobros, cada cobro pagado tiene **Recibo**: la primera vez genera, después
  descarga (`/recibos/R-2026-0001.pdf`, solo con sesión `dueno` o, en la pieza 5, sesión de cliente
  del `clienteId` correcto).
- **Enviar por WhatsApp**: copia un mensaje con número, concepto y monto, y abre WhatsApp. El PDF lo
  adjunta Neri desde el teléfono (WhatsApp no adjunta por enlace) o el cliente lo baja del portal.
  Deja `Evento` `aviso_cliente`.
- **Anular** un cobro con recibo emitido no borra el PDF: genera una **nota de anulación**
  `R-2026-0001-A` que dice qué recibo anula, cuándo y por qué. El correlativo nunca queda con huecos
  sin explicar.

## Reglas

- El número se asigna en una **transacción con bloqueo** de la fila de `Correlativo`
  (`SELECT … FOR UPDATE`), para que dos clics no den dos recibos con el mismo número.
- Si Playwright falla, el cobro sigue pagado y sin número; el botón dice «no se pudo generar, intenta
  de nuevo» y el error va al log. El número se asigna **después** de que el PDF exista en disco,
  no antes, para no gastar correlativos en fallos.
- Un cobro anulado no puede generar recibo; uno pendiente tampoco.
- La plantilla se revisa en A4 y en el visor del teléfono (el cliente lo abre ahí).

## Pruebas

- Contratos puros: formato del número, texto del concepto, lista de versiones incluidas, HTML de la
  plantilla con datos de prueba (snapshot).
- Con base: correlativo bajo concurrencia (dos generaciones simultáneas → dos números distintos),
  fallo de PDF no consume número, anulación genera `-A`, `prospectador` recibe 403.
- Playwright: generar un recibo real en `_test` y comprobar que el PDF existe y pesa más de 10 KB.

## Fuera de alcance

Bolívares con tasa, IVA, retenciones, firma digital, envío por correo, plantillas por cliente,
recibos de cobros parciales (un cobro se paga completo o se parte en dos cobros antes).
