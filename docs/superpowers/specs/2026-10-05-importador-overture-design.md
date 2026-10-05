# Importador de Overture Maps (Venezuela) — diseño

**Fecha:** 2026-10-05 · **Dueño:** Neri Colón · **Estado:** implementada en la rama `overture` (5-oct); pendiente de despliegue.
Extiende la pieza 2 (`2026-09-16-buscador-importacion-design.md`). No cambia la bandeja ni la clave de duplicado.

## Qué resuelve

Al 5-oct el panel tiene 4.148 prospectos y 2.635 no tienen ningún canal de contacto. OpenStreetMap ya no
aporta: una búsqueda de clínicas en La Guaira devolvió 283 fichas y 0 nuevas. «Leer web» quedó agotada el
20-sep (0 campos llenados).

Overture Maps publica cada mes un conjunto abierto de lugares; en Venezuela el 98% viene de Meta, es decir,
de lo que cada negocio publicó en su página de Facebook. Medición del 5-oct sobre la publicación
`2026-09-23.1`, con confianza ≥ 0,7 y solo los rubros que el panel prospecta:

| | Venezuela |
|---|---|
| Fichas | 9.077 |
| Con teléfono | 7.418 |
| Con número móvil (`+584…`) | 4.212 |
| Con correo | 4.607 |
| Con teléfono o correo | 7.628 |

Cruce con la base real por nombre idéntico: 852 prospectos coinciden; 308 que hoy no tienen teléfono lo
ganarían si además coincide la ciudad (497 mirando solo el nombre).

**Éxito:** Neri elige nicho y ciudad, toca un botón y en menos de dos segundos tiene en la bandeja un lote
con teléfono, WhatsApp, correo, web y Facebook, cada dato con su fuente.

## Decisiones tomadas con Neri (5-oct)

- **Por nicho y ciudad, a pedido.** No se vuelca todo de una vez ni se hace un lote único de «completar».
- **Venezuela primero.** Colombia es otra pieza (campo de país, teléfonos `+57`, precios y datos del recibo).
- **El correo entra** como segundo canal.
- **No se raspa Facebook.** Solo el conjunto abierto de Overture.

## Lo que ve Neri

En `/buscar?t=osm` (pestaña «Mapa»), el mismo formulario de nicho y ciudad con dos botones:

- **Buscar en OpenStreetMap** (como hoy).
- **Buscar en el directorio abierto**, con una casilla **«Solo con teléfono o correo»** marcada de fábrica.

No se agrega una quinta pestaña: no cabe a 390 px, y así los selectores (que desde `6ed7d2a` conservan la
última elección) sirven a las dos fuentes. Debajo del segundo botón, un renglón dice de cuándo es el dato:
«Directorio del 23/09/2026».

El resultado es el `ResumenLote` de siempre, con «Se consultó: <nicho> · <ciudad> · Directorio abierto».
En la bandeja el origen se lee **«Directorio abierto»** (la ficha del prospecto no muestra el origen de ninguna
fuente; no se agregó).

Casos sin resultado, cada uno con su mensaje:

- El nicho no tiene equivalencia: el segundo botón sale apagado con «Este nicho no está en el directorio».
- La tabla está vacía: «El directorio no está cargado todavía».
- No hay fichas para esa combinación: «El directorio no tiene negocios de ese nicho en esa ciudad».

Lo usan los dos roles, igual que la búsqueda del mapa (`exigirSesion`).

## Datos

### Carga (fuera del panel, a mano)

Dos pasos, porque el archivo de Overture es Parquet en S3 y Node no lo lee sin una dependencia nativa:

1. `scripts/extraer-overture.py <publicacion>` (Python con `duckdb`, ya instalado para el usuario): lee
   `s3://overturemaps-us-west-2/release/<publicacion>/theme=places/type=place/*` con el filtro de caja de
   Venezuela, `addresses[1].country = 'VE'`, `confidence >= 0.7`, nombre no vacío y
   `operating_status` distinto de `permanently_closed`. Escribe `~/overture/ve-<publicacion>.jsonl` (600).
   Con `threads=3` y `memory_limit='2GB'`: el servidor es compartido.
2. `scripts/cargar-overture.mts <archivo> [--aplicar]` (env cargado): valida cada renglón, y con `--aplicar`
   reemplaza el contenido de la tabla **en una sola transacción** (borra lo anterior, inserta lo nuevo).
   Sin `--aplicar` solo cuenta: filas válidas, descartadas y por qué. Se niega a aplicar si el archivo trae
   menos de la mitad de las filas que hay en la tabla (una descarga cortada no vacía el directorio).

No es un cron. Se corre cuando Neri quiera refrescar; Overture publica una vez al mes.

### Tabla `LugarOverture`

Datos regenerables: no son prospectos y nada del panel depende de que existan.

| Columna | Tipo | Nota |
|---|---|---|
| `id` | `VARCHAR(64)` PK | id de Overture |
| `nombre` | `VARCHAR(191)` | |
| `categoriaBase` | `VARCHAR(80)` | `basic_category` |
| `categoriaFina` | `VARCHAR(80)` | `taxonomy.primary` |
| `lat`, `lon` | `DOUBLE` | |
| `direccion` | `VARCHAR(191)` | `addresses[1].freeform`, recortada |
| `telefonos` | `TEXT` | uno por renglón |
| `correos` | `TEXT` | uno por renglón |
| `webs` | `TEXT` | uno por renglón |
| `redes` | `TEXT` | uno por renglón |
| `confianza` | `DOUBLE` | |
| `publicacion` | `VARCHAR(20)` | p. ej. `2026-09-23.1` |

Índice en `categoriaBase`. **Sin columnas `Json`**: las listas van como texto con un valor por renglón, para
no pisar la trampa de `DEFAULT` de Prisma con MariaDB. La migración lleva sello `20261005…` (posterior a
`20260919090000`) y se aplica con `prisma migrate deploy`.

Unas 21.000 filas. Entra en el respaldo diario; pesa pocos MB.

## Reglas (todas en `src/lib/overture-contrato.ts`, puro y con tests)

### De nicho a categorías

Una constante por `slug` de nicho, en código y no en la base (no hace falta otra columna `Json` en `Nicho`).
Cada regla es una lista de `categoriaBase` y, donde la base es muy ancha, de `categoriaFina`:

| Nicho | `categoriaBase` | `categoriaFina` |
|---|---|---|
| `hoteles-estadia` | `hotel`, `lodging` | todas menos `motel` |
| `restaurantes-y-bares` | `restaurant`, `casual_eatery`, `fast_food_restaurant`, `bar`, `cafe`, `coffee_shop` | todas menos `bakery` |
| `clinicas-y-consultorios` | `hospital`, `health_care`, `outpatient_care_facility`, `diagnostics_imaging_or_lab_service`, `medical_service`, `primary_care_or_general_clinic`, `vision_or_eye_care_clinic` | |
| `odontologias` | `dental_clinic` | |
| `farmacias` | `pharmacy_and_drug_store` | |
| `peluquerias-y-barberias` | `personal_or_beauty_service` | `barber`, `hair_salon` |
| `spas-y-estetica` | `personal_or_beauty_service`, `wellness_service` | todas menos `barber` y `hair_salon` |
| `gimnasios` | `gym`, `fitness_studio` | |
| `canchas-y-espacios` | `sport_or_fitness_facility`, `sport_field`, `sport_court`, `sport_or_recreation_club` | |
| `eventos` | `event_or_party_service`, `event_venue` | |
| `veterinarias` | `animal_or_pet_service` | `veterinarian` |
| `licorerias-y-bodegones` | `food_and_beverage_store` | `liquor_store` |
| `emprendimientos-comida` | `casual_eatery` | `bakery` |
| `emprendimientos-moda` | `fashion_and_apparel_store` | |
| `comercio` | `hardware_home_and_garden_store`, `electronics_store`, `convenience_store`, `vehicle_parts_store` | |
| `talleres-y-autolavados` | `automotive_service` | |
| `educacion` | `specialty_school` | |

**Sin equivalencia (botón apagado):** `hoteles` (de paso: Overture solo trae 4 moteles en todo el país) y
`cosmeticos` (2 fichas). Un test recorre los 19 slugs de `scripts/sembrar-nichos.mjs` y falla si aparece un
nicho que no esté ni en la tabla ni en la lista de «sin equivalencia».

### De coordenadas a ciudad

Por distancia, con el `lat`, `lon` y `radioM` que `CIUDADES` ya tiene para Overpass; **nunca por el nombre
de la localidad** (Overture usa municipios: «Vargas», «Caroní», «Libertador»).

Los radios se solapan (Valencia 15 km y Guacara 7 km). Un lugar pertenece a **una sola** ciudad: la de centro
más cercano entre las que lo cubren. Sin esto el mismo negocio entraría dos veces con ciudades distintas y
la clave `nombre|ciudad` no lo vería como repetido.

La consulta trae de la base la caja que encierra el círculo de la ciudad y las categorías del nicho; la
distancia exacta y el desempate se calculan en código.

### De lugar a prospecto

`prospectosDesdeOverture(lugares, ciudad, nicho)` devuelve `EntradaValidada[]`, el mismo contrato que
`prospectosDesdeOverpass`:

- **`nombre`**: el de Overture, recortado. `ciudad` y `estado`: los de la ciudad elegida.
- **`telefono`**: el primer teléfono. **`whatsapp`**: el primero que `normalizarCelular` acepte como móvil
  (misma regla que Overpass y que la importación por archivo).
- **`email`**: el primer correo con forma válida cuyo dominio no esté en la lista de descarte. La lista
  arranca con `explore.partners` (80 direcciones de un intermediario, no del negocio).
- **`web`**: la primera. **`facebook`**, **`instagram`**: de `redes`, por `normalizarRed`.
- **`tipo`**: `categoriaFina`. **`nota`**: `Dirección: …` si la hay.
- **Fuente**: la página de Facebook del negocio; si no tiene, su web. `fuentes` lleva esa URL y
  `fuentesPorCampo` la repite por cada campo lleno. **Un lugar sin Facebook ni web no entra**: no habría cómo
  sostener que el dato lo publicó el propio negocio.
- Con la casilla marcada se descartan los que quedan sin `telefono`, `whatsapp` ni `email`.

El orden del lote es por confianza descendente.

## Flujo en el servidor

`buscarOverture(formData)` en `src/acciones/buscar.ts`, copia de la forma de `buscarOverpass`:

1. `exigirSesion()` fuera del `try`. Valida `nichoId`, `ciudad` (slug) y `soloContactables` con zod.
2. Resuelve el nicho y sus categorías; resuelve la ciudad con `ciudadPorSlug`.
3. `lugaresDeOverture(...)` en `src/lib/overture.ts` (el único archivo de la pieza que toca Prisma).
4. `prospectosDesdeOverture` → `validarTopes` → `loteDesdeEntradas("overture", …)`.
5. Devuelve el resumen y la `publicacion`. `revalidatePath("/buscar")`.

`"overture"` se suma a `ORIGENES` (`src/lib/revision.ts`) y a `ETIQUETA_ORIGEN`
(`src/lib/revision-contrato.ts`). `Prospecto.origen` es texto: no hay migración por eso.

**No hay petición saliente**: el panel solo lee su propia base. No hay caché ni cola.

Todo lo demás es lo que la bandeja ya hace: «Ya existe» ofrece completar solo campos vacíos, lo que no
aporta nace descartado, lo que ya está pendiente en otro lote también.

`src/lib/overture.ts` y `overture-contrato.ts` **no entran en la cadena de `src/instrumentation.ts`**.

## Errores

- Renglón ilegible o sin id, nombre o coordenadas en la carga: se cuenta y se salta; el script lo informa.
- Nombre de más de 120 caracteres: la fila entra a la bandeja marcada como error (`validarTopes`), como hoy.
- Fallo de base en la acción: mensaje genérico y `console.error("buscarOverture", err)`.

## Pruebas

- **Puras (`tests/overture-contrato.test.ts`)**: equivalencias de los 19 nichos; desempate de ciudad con un
  punto entre Valencia y Guacara; teléfono fijo que no va a WhatsApp; correo descartado por dominio; lugar
  sin Facebook ni web que no entra; la casilla; `fuentesPorCampo`.
- **Con base (`npm run test:db`)**: `lugaresDeOverture` filtra por caja y categoría; `buscarOverture` crea el
  lote con origen `overture`; un prospecto existente sin teléfono queda como «Ya existe» con algo que aportar.
- **Carga**: `cargar-overture.mts` sin `--aplicar` no escribe; el freno de «menos de la mitad».
- **Recorrido a 390 px** en el clon (`next dev -p 3014`, base de tests con lugares sembrados): los dos
  botones caben, el apagado se explica, el resumen dice la fuente y los selectores no se reinician.

## Antes de cargar datos reales

1. Confirmar la licencia de la fuente `meta` dentro de Overture (el campo `sources[].license` de cada fila) y
   dejarla anotada en este spec.
   **Hecho el 5-oct** sobre `2026-09-23.1` (Venezuela, confianza ≥ 0,7): `meta` 19.567 filas con
   `CDLA-Permissive-2.0`; `Microsoft`, `PinMeTo` y la capa `Overture` igual; `Foursquare` 817 con `Apache-2.0`;
   `AllThePlaces` 289 con `CC0-1.0`. Todas permiten el uso comercial.
2. Probar a mano 20 teléfonos de una ciudad para saber cuántos siguen vivos. Si son menos de la mitad, se
   habla con Neri antes de desplegar.
   **Muestra entregada a Neri el 5-oct** (10 restaurantes y 10 clínicas de Caracas); resultado pendiente.
   Carga de ensayo: 20.524 lugares; en las 22 ciudades del panel y los 17 nichos con equivalencia salen 5.879
   fichas con teléfono o correo, 3.278 de ellas con WhatsApp.

## Lo que no entra

- Colombia y cualquier otro país.
- Actualización automática o cron de carga.
- Cruce flexible de nombres: la clave de duplicado sigue siendo la de la pieza 1.
- Un lote único para completar a los existentes sin elegir nicho y ciudad.
- Ciudades fuera de `CIUDADES`. Agregar una ciudad es agregarla ahí, como para Overpass.
