# Colombia, etapa 1: cargar y contactar prospectos — diseño

**Fecha:** 2026-10-06 · **Dueño:** Neri Colón · **Estado:** implementada y en producción (6-oct).
Extiende la pieza 2 y el importador de Overture (`2026-10-05-importador-overture-design.md`).

## Qué resuelve

Neri va a trabajar también en Colombia (tiene cuentas y documentos allá). Overture trae en sus rubros unas 94.000
fichas colombianas, 60.000 con móvil. Esta etapa deja el panel listo para **traer esos negocios y escribirles**. Las
propuestas en versión Colombia son la etapa 2.

## Decisiones de Neri (5 y 6-oct)

- **Siete ciudades para arrancar:** Bogotá, Medellín, Cali, Barranquilla, Cartagena, Santa Marta y Cúcuta.
- **Mismos precios en dólares y misma temporada promocional** que en Venezuela.
- **El cobro en Colombia:** la plataforma con integración con Wompi; el registro en Wompi queda del lado del cliente
  si tiene Bancolombia.

## Qué cambia

- **Ciudades:** `CIUDADES` lleva `pais` (`VE` | `CO`) y las siete colombianas con centro y radio. Sirven para el
  directorio abierto y para OpenStreetMap. El selector las agrupa por país.
- **El país de un prospecto sale de su ciudad** (`paisDeCiudad`): no hay columna nueva en `Prospecto`. Ninguna
  ciudad colombiana se llama igual que una venezolana del panel, así que la clave de duplicado no cambia.
- **Teléfonos:** `normalizarCelular(texto, pais?)` reconoce el móvil colombiano (`3XX` más siete dígitos) con su
  prefijo `+57` y lo guarda como `57…`; sin prefijo solo si quien llama dice que es de Colombia. Un fijo no es
  celular. El comportamiento con números venezolanos no cambia.
- **Directorio por país:** `LugarOverture.pais`. Cada país se extrae (`extraer-overture.py <pub> co`), se carga y se
  reemplaza por separado: cargar Colombia no toca Venezuela, y el freno de «menos de la mitad» cuenta por país.
- **La carga guarda solo lo útil:** rubros con regla y lugares dentro de una ciudad del panel de ese país. De
  200.542 lugares colombianos quedan 49.233.
- **Mensaje propio para Colombia** (`src/lib/colombia-contrato.ts`): a un prospecto de una ciudad colombiana no se le
  manda la propuesta (está escrita para Venezuela) ni el mensaje del nicho. Lleva un mensaje sin enlace que habla de
  la plataforma con el cobro en línea integrado a Wompi, con el gancho de la temporada. La ficha no ofrece propuesta.

## Lo que no entra (etapa 2 y después)

- Las siete propuestas en versión Colombia (Wompi en vez de pago móvil, pesos, sin referencias fiscales venezolanas).
- La integración real con Wompi: hoy es lo que se ofrece, no algo construido.
- Recibos con datos fiscales colombianos.
- Filtro de país en `/prospectos`: los chips de ciudad ya separan Bogotá de Caracas.
- El nicho `hoteles` (de paso) en el directorio: sigue sin regla; en Colombia los moteles sí abundan y conviene
  revisarlo.

## Pruebas

Puras: ciudades y país, móviles `+57` (con y sin prefijo, fijos, venezolanos intactos), lugar de Bogotá a fila de
bandeja, validación por país, mensajes de Colombia. Con base: reemplazo por país, búsqueda en una ciudad colombiana.
El recorrido a 390 px del directorio pasa con el selector agrupado.
