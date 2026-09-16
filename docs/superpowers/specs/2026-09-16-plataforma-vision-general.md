# Plataforma NERACOSU de prospección y proyectos — visión general

**Fecha:** 2026-09-16 · **Dueño:** Neri Colón · **Estado:** aprobada en la sesión del 16-sep.

## Para qué existe

Neri necesita una herramienta propia que lo lleve de **conseguir** un prospecto a **cobrarle** cada
mes: buscar negocios por nicho, contactarlos, mandar la propuesta, dar seguimiento, cerrar, llevar el
proyecto vendido, cobrar y que el cliente vea qué se le ha hecho. Nada de eso lo resuelve un Trello o
un CRM genérico sin adaptarlo, y él prefiere construirlo a su medida.

**La herramienta no genera ingresos; los generan los mensajes enviados y los cobros hechos a tiempo.**
Por eso el orden de construcción prioriza enviar y cobrar antes que buscar.

## Una sola app, cinco piezas

Una app Next.js, una base MySQL (`neracosu_prospectos`), un proceso PM2 (`prospectos`, puerto 3013).
Las piezas son módulos que comparten sesión, prospectos y clientes. Cada una tiene su spec y su plan,
y **sale a producción cuando termina**, no al final de todo.

| # | Pieza | Spec | Qué resuelve |
|---|---|---|---|
| 1 | Panel de prospección | `2026-09-16-panel-prospeccion-design.md` | Entrar, cola del día, embudo, propuestas, seguimientos |
| 3 | Proyectos y cobros | `2026-09-16-proyectos-cobros-design.md` | Proyecto desde `ganado`, cobros, pendientes, horas, versiones |
| 2 | Buscador e importación | `2026-09-16-buscador-importacion-design.md` | Llenar la base desde Overpass, web del negocio, Maps y archivos |
| 4 | Recibos de pago | `2026-09-16-recibos-design.md` | PDF por cobro pagado, correlativo por año |
| 5 | Portal del cliente | `2026-09-16-portal-cliente-design.md` | `/c/<código>` con PIN: avance, versiones, cobros, documentos |

**Orden de construcción: 1 → 3 → 2 → 4 → 5.** Primero enviar a los 132 hoteles; después cobrar a los
clientes que ya existen; después llenar la base; luego recibos; el portal al final porque necesita
proyectos y recibos construidos. El hotel de Valencia es el primer cliente del portal.

## Roles

| Rol | Ve | No ve |
|---|---|---|
| `dueno` (Neri) | Todo | — |
| `prospectador` (persona de confianza que contacta mientras Neri programa) | Hoy, Prospectos, Buscar, notas internas de prospectos | Proyectos, cobros, horas, recibos, Ajustes |
| `cliente` | Su portal `/c/<código>` | El panel entero |

- `Usuario` lleva `rol` y `activo`. Cada `Evento` guarda `usuarioId`.
- La **meta diaria es por usuario**. La **cola es compartida, sin asignación**: quien abre Hoy toma
  el siguiente; un prospecto `enviado` no le vuelve a salir a nadie. Asignar por persona queda fuera
  hasta que haya dos prospectadores a la vez.
- Alta de usuarios desde Ajustes, solo `dueno`. Cada quien cambia su propio PIN.
- Toda server action valida sesión **y rol**, no solo sesión. Los montos nunca aparecen en una
  pantalla que un `prospectador` pueda abrir.

## Navegación (barra inferior, teléfono)

**Hoy · Prospectos · Buscar · Proyectos · Ajustes.** «Nuevo» pasa a ser un botón dentro de
Prospectos. El `prospectador` ve la barra sin Proyectos ni Ajustes (solo «Mi PIN»).

## Canales de contacto

`whatsapp · sms · llamada · email · instagram · facebook · tiktok · otro`. Valen para el `Evento` de
prospección y para los recordatorios de cobro.

| Canal | Botón | Qué pasa |
|---|---|---|
| WhatsApp | Enviar | Abre `wa.me` con el mensaje |
| SMS | Enviar | Abre `sms:` con el mensaje |
| Email | Enviar | Abre `mailto:` con asunto y cuerpo |
| Llamada | Llamar | Abre `tel:`; el mensaje queda en pantalla como guion |
| Instagram / Facebook / TikTok | Copiar y abrir | Copia el mensaje y abre el perfil; el DM lo pega la persona |

Al volver siempre aparece **«¿Se envió?» Sí / No**; el `Evento` guarda el canal. La cola ordena
primero WhatsApp, luego SMS/email, al final los que solo tienen redes. El panel **no guarda
credenciales** de ninguna red: cada quien usa su teléfono y su cuenta.

## Reglas comunes a todas las piezas

- **Solo datos que el negocio publicó**, cada dato con su fuente. Nada de contactos personales.
- **Nada se borra**: prospectos se descartan con motivo, cobros se anulan con motivo, accesos se
  desactivan. El historial (`Evento`) es la verdad.
- **«Hoy» y «este mes» son de Caracas** (UTC−4 fijo). Una sola función, con tests.
- **Los precios de proyecto viven en `neracosu.com/para/`**; el panel los copia, no los define.
- **Todo se diseña para 390 px** y se revisa con Playwright antes de cerrarlo.
- **TDD** contra `neracosu_prospectos_test`. **Un build a la vez** en el servidor, nunca desde un
  subagente. `pm2 list` antes de cualquier `start/restart/stop/delete/save`.
- Español (Venezuela) en todo texto visible; comentarios de código sin acentos.

## Fuera de alcance (de todas las piezas)

Integración con bancos o pagos en línea, facturación fiscal, tasa BCV, gastos e impuestos, búsquedas
masivas en Google, API de Places (fuente futura), permisos finos por usuario, app nativa, correo o
push automáticos, chat o tickets dentro del portal. Si alguna hace falta, se diseña aparte.
