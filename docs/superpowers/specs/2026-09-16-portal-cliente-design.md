# Pieza 5 — Portal del cliente — diseño

**Fecha:** 2026-09-16 · **Dueño:** Neri Colón · **Estado:** aprobada en la sesión del 16-sep.
Depende de las piezas 3 y 4. Ver `2026-09-16-plataforma-vision-general.md`.

## Qué resuelve

Que el cliente vea por su cuenta cómo va su proyecto, qué versión tiene, qué le han hecho, qué pagó y
qué debe, sin preguntarle a Neri por WhatsApp. Es la respuesta a «¿y qué le han hecho a mi sistema?»
y lo que justifica la mensualidad mes a mes.

## Acceso: por cliente, no por proyecto

**Un cliente con varios proyectos entra una sola vez y los ve todos.** El código y el PIN son de
`Cliente`, no de `Proyecto` (Neri, 16-sep).

- URL `/c/<código>`; `código` = `Cliente.codigo` (16 bytes aleatorios base64url).
- **PIN de 6 dígitos**, generado desde la ficha del cliente con **Enviar acceso**: abre WhatsApp con
  el enlace en un mensaje y, tras volver, ofrece un segundo mensaje con el PIN. Van separados a
  propósito: si el cliente reenvía el chat, no va todo junto.
- El PIN se guarda con hash en `Usuario` (rol `cliente`, `clienteId`). Bloqueo de 5 intentos / 15
  minutos por cuenta y por IP, igual que el panel.
- Cookie **`sesion_cliente`**, distinta de la del panel, `httpOnly`, `secure`, `sameSite=lax`, 30
  días. Tener sesión de cliente no da acceso al panel ni al revés.
- Desde la ficha: **Regenerar PIN** (invalida el anterior y las sesiones abiertas) y **Desactivar
  acceso** (`Usuario.activo = false`). Ninguno borra nada.

## Pantallas (390 px primero; el cliente también entra desde el teléfono)

1. **`/c/<código>`** — pide PIN con teclado numérico. Si el acceso está desactivado: «Acceso
   desactivado. Escríbele a Neri» con botón de WhatsApp, sin pedir PIN.
2. **Inicio** — nombre del negocio, tarjetas de sus proyectos (estado, versión actual, % de avance).
   Si hay cobro vencido o por vencer en 7 días, aviso arriba con **Ver cobros**.
3. **Proyecto** — pestañas:
   - **Avance**: % (solo pendientes `visibleCliente`) y lista de hitos con fecha estimada y real.
     Sin pendientes visibles: «Sin hitos publicados todavía».
   - **Versiones**: la actual arriba; historial del más nuevo al más viejo, cada cambio con su tipo
     (nuevo · mejora · arreglo) y texto.
   - **Cobros**: precio acordado, mensualidad, día de cobro; **pagados** (fecha, canal, **Descargar
     recibo** si existe) y **pendientes** (monto, vence, vencido en rojo). Sin botón de pagar: el pago
     sigue por WhatsApp/Zelle como hoy.
   - **Documentos**: la propuesta aceptada (enlace a `/p/<código>` si `propuestaCodigo` existe) y los
     archivos que Neri suba desde la ficha del proyecto.
4. **Contacto** — WhatsApp de Neri y nombre de quien atiende (de `Configuracion.datos_emisor`).

## Qué no ve, por diseño

**Horas trabajadas, tarifa por hora, pendientes internos, notas, otros clientes, el panel.** El precio
está cerrado; mostrar horas contra un monto fijo invita a discutir cada hora y expone el margen.
Cada consulta filtra por el `clienteId` de la sesión: ninguna URL del portal recibe un id de
proyecto que no se valide contra ese cliente.

## Documentos

- **`Documento`**: `proyectoId`, `nombre`, `archivo` (ruta fuera del docroot:
  `~/prospectos-archivos/documentos/<clienteId>/<uuid>.<ext>`), `tipoMime`, `tamano`, `subidoEn`,
  `usuarioId`.
- Solo `dueno` sube. Límite 10 MB; solo PDF, JPG, PNG y ZIP (se valida por contenido, no por
  extensión).
- Se sirven por `/c/documentos/<id>` con sesión de cliente del `clienteId` correcto, o con sesión
  `dueno`. Nunca por ruta directa.

## Avisos

En el panel, al cumplir un hito visible, publicar una versión o registrar un cobro, aparece **Avisar
al cliente**: abre WhatsApp con el mensaje (plantillas en Ajustes: `mensaje_aviso_hito`,
`mensaje_aviso_version`, `mensaje_aviso_cobro`, con `{cliente}`, `{proyecto}`, `{version}`,
`{hito}`, `{monto}`, `{enlace}`) y el enlace del portal. Deja `Evento` `aviso_cliente`. Sin correo ni
push.

## Reglas

- `noindex` en la página y `X-Robots-Tag: noindex` en todo `/c/*` y `/c/documentos/*`.
- El portal **solo lee**; no hay ninguna server action que escriba desde sesión de cliente, salvo
  entrar y salir.
- Límite de peticiones por IP en `/c/*` (mismo mecanismo que `/p/*`).
- Cada entrada del cliente deja `Evento` `portal_abierto` en el cliente (para que Neri sepa si lo
  usa). No se registra qué pestaña abrió.
- Primer cliente en usarlo: el hotel de Valencia.

## Errores y bordes

- Cliente sin proyectos activos: ve los cerrados con su historial; no ve pantalla vacía.
- Recibo cuyo PDF no existe en disco (borrado a mano): «recibo no disponible, escríbele a Neri»; el
  error va al log.
- Código válido pero cliente sin `Usuario` (acceso nunca enviado): misma pantalla que desactivado.

## Pruebas

- Contratos puros: % de avance con solo visibles, orden de versiones, estado de cobro (vencido/por
  vencer).
- Con base: aislamiento entre clientes (sesión del cliente A pidiendo proyecto/documento/recibo del B
  → 404), regenerar PIN invalida sesión, acceso desactivado, bloqueo por intentos.
- Playwright a 390 px: entrar con PIN, ver dos proyectos, bajar un recibo, abrir un documento.

## Fuera de alcance

Pagos en línea, tickets o chat, varios usuarios por cliente, notificaciones automáticas, edición de
datos por el cliente, idioma distinto del español.
