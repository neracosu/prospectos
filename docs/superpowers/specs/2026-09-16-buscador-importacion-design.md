# Pieza 2 — Buscador e importación — diseño

**Fecha:** 2026-09-16 · **Dueño:** Neri Colón · **Estado:** aprobada en la sesión del 16-sep.
Depende de la pieza 1. Ver `2026-09-16-plataforma-vision-general.md`.

## Qué resuelve

Llenar la base de prospectos desde el panel, sin cuentas de pago, sin tarjeta y sin scraping masivo
de Google. Cuatro caminos que terminan en la misma **bandeja de revisión**: nada entra a la base sin
que una persona lo apruebe.

## Decisión sobre Google

Se descartó el scraping masivo de Google (búsquedas o Maps) por razones prácticas, no legales:
Google bloquea la IP en minutos, y **la IP del servidor es la misma de Adastram, Hotel Marte y AMEB**.
El HTML de Maps cambia sin aviso y el scraper se convierte en mantenimiento permanente. La API de
Places exige cuenta de Google Cloud con tarjeta y queda como **fuente futura** si Neri la activa;
el diseño deja el hueco (un `origen` más y un adaptador más), sin construirlo.

## Los cuatro caminos

**1. Overpass (OpenStreetMap).** Se elige nicho y ciudad o estado. El panel consulta la API pública
de Overpass con la etiqueta del nicho (`tourism=hotel`, `amenity=pharmacy`, `amenity=restaurant`,
`shop=*` según nicho; la etiqueta vive en `Nicho.etiquetaOsm`) dentro del área administrativa
elegida, y trae nombre, dirección, teléfono, web e Instagram cuando OSM los tiene. Fuente por dato: la
URL del nodo/way de OSM.

- Una consulta a la vez, con 5 s de espera entre consultas y `User-Agent` identificado
  (`prospectos.neracosu.com`), como pide la política de uso de Overpass.
- Cada búsqueda (nicho + área) se **cachea 7 días** en la tabla `BusquedaOsm` para no repetirla.
- Tiempo límite 60 s. Si Overpass no responde o devuelve error, se muestra el mensaje y no se cuelga
  la pantalla.

**2. Leer la web del negocio.** En cualquier prospecto con `web`, un botón **Leer web** descarga esa
única página (tiempo límite 10 s, máximo 2 MB, sin seguir enlaces, sin JavaScript) y busca correos,
números de WhatsApp (enlaces `wa.me` y números venezolanos), Instagram, Facebook y TikTok. Lo
encontrado aparece como **sugerido**, cada dato con la URL como fuente, y se confirma uno por uno. Lo
que ya tenía el prospecto no se pisa; solo se completan huecos.

**3. Compartir desde Maps.** Se pega un enlace de Google Maps (incluidos los cortos `maps.app.goo.gl`,
que el panel resuelve siguiendo la redirección) o se comparte desde Android con **Web Share Target**
(el panel se registra como PWA mínima con `manifest.json` para aparecer en el menú «Compartir»). El
panel lee **esa única ficha** y saca nombre, dirección, teléfono y web. Fuente: la URL de Maps.

- Una ficha por vez, nunca búsquedas. Tiempo límite 10 s.
- Si Google cambia el formato y deja de leerse, el panel avisa y ofrece cargarlo a mano con el
  enlace ya puesto como fuente. **No se convierte en búsqueda masiva.**

**4. Importar archivo o pegar.** Se descarga la **plantilla** (Excel `.xlsx` y CSV, mismas columnas)
y se sube llena, o se pegan filas desde Excel en un área de texto (separadas por tabulador; también
acepta CSV). Es el camino de los 132 hoteles y de los listados que Neri consiga por su cuenta.

Columnas de la plantilla, en este orden: `nicho, nombre, ciudad, estado, tipo, tamano, telefono,
whatsapp, email, web, instagram, facebook, tiktok, nota, fuente`. Obligatorias: `nicho`, `nombre`,
`ciudad`. La plantilla trae una fila de ejemplo y una hoja «Cómo llenar».

## Bandeja de revisión

Común a los cuatro caminos. Cada fila queda en uno de tres estados:

- **Nuevo**: entra tal cual.
- **Repetido**: ya existe (misma clave nicho + nombre + ciudad normalizados: minúsculas, sin
  acentos, sin puntuación, sin «hotel», «farmacia», «posada» al inicio). Se muestra al lado del
  existente con las diferencias resaltadas; se puede **completar** el existente con los datos
  nuevos que le falten, o **descartar** la fila. Nunca se pisa un dato existente.
- **Error**: falta nombre o ciudad, o teléfono/WhatsApp sin formato reconocible. Se corrige en línea
  o se descarta.

Se aprueba por fila o **Aprobar todos los nuevos**. Los aprobados entran como `por_contactar` con su
`origen` (`overpass`, `web`, `maps`, `importado`) y `fuentes` (JSON `{campo: url}`). Queda un
`Evento` `importado` por prospecto con `usuarioId`.

La bandeja se guarda en la tabla `Revision` (lote, fila, datos, estado, decisión) para que se pueda
cerrar el teléfono y seguir después. Los lotes aprobados o descartados se limpian a los 30 días.

## Tablas nuevas

- **`Nicho`** gana `etiquetaOsm` (JSON con las etiquetas que aplican).
- **`BusquedaOsm`**: `nichoId`, `area`, `consultadoEn`, `resultados` (JSON), única por nicho + área.
- **`Revision`**: `lote`, `origen`, `fila`, `datos` (JSON), `estado` (`nuevo`, `repetido`, `error`),
  `existenteId`, `decision` (`pendiente`, `aprobado`, `completado`, `descartado`), `usuarioId`,
  `creadoEn`.
- **`Prospecto`** gana `origen`, `facebook`, `tiktok` (la pieza 1 ya lo anota).

## Reglas

- **Solo datos que el negocio publicó.** Los cuatro caminos leen la ficha o la web del propio
  negocio. Ninguno lee comentarios, perfiles personales ni listados de terceros. Un listado externo
  con un número personal no entra: la regla es la misma aunque el archivo lo traiga Neri.
- Sin fuente no hay dato. La ficha del prospecto muestra la fuente de cada campo.
- `prospectador` puede buscar, leer webs, pegar Maps, importar y aprobar. Nadie borra prospectos.
- WhatsApp se normaliza a `58XXXXXXXXXX` (acepta `0412…`, `+58 412…`, `412…`); lo que no normaliza
  queda en `telefono` y el prospecto va al final de la cola.
- Las peticiones salientes (Overpass, webs, Maps) las hace el servidor, con tiempo límite y tamaño
  máximo, y **solo a `http(s)`**; se rechazan IPs privadas y `localhost` (evita que alguien use el
  panel para tocar la red interna del servidor).

## Errores y bordes

- Overpass caído: mensaje claro, se puede reintentar; la caché sirve lo anterior si existe.
- Web del negocio que redirige a Instagram o a un `linktr.ee`: se lee la página final si sigue
  siendo `http(s)` (máximo 3 redirecciones).
- Archivo con columnas en otro orden o con encabezados en mayúsculas: se mapean por nombre, no por
  posición. Columna desconocida: se ignora y se avisa.
- Archivo de más de 5 000 filas: se rechaza con el mensaje «pártelo».
- Dos personas aprobando el mismo lote: la aprobación es por fila con `updateMany` condicionado a
  `decision = 'pendiente'`.

## Pruebas

- Contratos puros: normalización de clave (nombre + ciudad), normalización de WhatsApp, parser de
  CSV/TSV pegado, mapeo de columnas, extractor de contactos de HTML, extractor de datos de Maps
  (con fixtures guardados; cuando Google cambie, el test avisa), armado de la consulta Overpass.
- Con base: dedup contra existentes, «completar» sin pisar, idempotencia de aprobar.
- Playwright a 390 px: importar la plantilla con una fila nueva, una repetida y una con error; pegar
  un enlace de Maps; aprobar.

## Fuera de alcance

Búsquedas masivas en Google, API de Places, adivinar redes por nombre, enriquecimiento con servicios
de terceros, lectura de PDF o imágenes, geolocalización por mapa.
