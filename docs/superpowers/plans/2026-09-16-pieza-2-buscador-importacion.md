# Pieza 2 — Buscador e importación — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Llenar la base de prospectos desde el panel por cuatro caminos —Overpass (OpenStreetMap), leer la web del negocio, pegar/compartir un enlace de Google Maps, e importar Excel/CSV o filas pegadas— que desembocan en una bandeja de revisión donde nada entra sin que una persona lo apruebe.

**Architecture:** Mismos cimientos (Next.js 15 + Server Actions, Prisma/MySQL, CSS plano). Los parsers (tabla pegada/CSV, contactos en HTML, ficha de Maps, consulta y respuesta de Overpass) son módulos puros con fixtures; todas las peticiones salientes pasan por `red-segura.ts` (solo `http(s)`, sin IPs privadas, tiempo y tamaño acotados, 3 redirecciones); la bandeja vive en la tabla `Revision` y se aprueba fila por fila con `updateMany` condicionado. Overpass se consulta de a una, con 5 s entre consultas y caché de 7 días.

**Tech Stack:** Node 20 · Next 15.5 · Prisma 6.19 · zod 4 · vitest 4 · **exceljs 4.4** (plantilla y lectura `.xlsx`) · Playwright (recorrido final).

**Spec:** `docs/superpowers/specs/2026-09-16-buscador-importacion-design.md` (pieza 2) y `docs/superpowers/specs/2026-09-16-plataforma-vision-general.md`. Referencias de estilo en el repo: `src/acciones/cobros.ts` (acciones), `src/lib/importar.ts` (importador de la pieza 1), `tests/acciones-prospectos.test.ts` (mock de sesión), `src/componentes/TabCobros.tsx` (formularios cliente).

## Global Constraints

- **Solo datos que el negocio publicó**, cada dato con su fuente: `Prospecto.fuentes` (lista de URLs) más `Prospecto.fuentesPorCampo` (`{campo: url}`) nuevo en esta pieza. Ningún camino lee comentarios, perfiles personales ni listados de terceros.
- **Nada entra sin aprobación**: todo termina en la bandeja (`Revision`) con estado `nuevo | repetido | error` y decisión `pendiente | aprobado | completado | descartado`. Aprobar es por fila con `updateMany` condicionado a `decision = "pendiente"`; **nunca se pisa un dato existente** («completar» solo rellena huecos).
- **Clave de duplicado** = la de la pieza 1 (`claveProspecto(nombre, ciudad)`), sin quitar «hotel/farmacia/posada» al inicio: los 133 prospectos ya guardados usan esa clave y cambiarla obligaría a migrarlos. *(Desviación del spec, decidida en este plan.)*
- **Peticiones salientes solo por `src/lib/red-segura.ts`**: `http(s)` únicamente, sin `localhost` ni rangos privados (se resuelve el DNS y se comprueba cada salto), tiempo límite, tamaño máximo, máximo 3 redirecciones, `User-Agent: prospectos.neracosu.com (contacto: neracosu@gmail.com)`.
- **Overpass**: una consulta a la vez en el proceso, 5 s entre consultas, 60 s de tiempo límite, caché de 7 días en `BusquedaOsm` (única por nicho + área); Overpass caído → mensaje claro y la caché si existe.
- **Leer web**: una página por clic, 10 s, 2 MB, sin JavaScript; se sigue hasta 3 redirecciones si siguen siendo `http(s)`.
- **Maps**: una ficha por vez; `maps.app.goo.gl` se resuelve por redirección; si no se puede leer, se ofrece cargar a mano con el enlace como fuente. **Nunca búsqueda masiva.**
- **Importar**: columnas `nicho, nombre, ciudad, estado, tipo, tamano, telefono, whatsapp, email, web, instagram, facebook, tiktok, nota, fuente`; obligatorias `nicho, nombre, ciudad`; mapeo por **nombre** de columna (mayúsculas/acentos indiferentes), columna desconocida se ignora y se avisa; más de 5 000 filas → «pártelo».
- **WhatsApp** → `58XXXXXXXXXX` con `normalizarCelular`; lo que no normaliza queda en `telefono`.
- **Roles**: `dueno` y `prospectador` pueden buscar, leer webs, pegar Maps, importar y aprobar (`exigirSesion`, no `exigirRol`). Nadie borra prospectos.
- Toda acción `"use server"`: sesión fuera del try/catch, zod, sin helpers exportados, `Resultado`.
- Tests contra `neracosu_prospectos_test`; un build a la vez, solo desde la sesión principal; `pm2 list` antes de tocar PM2. Español (Venezuela), tuteo; comentarios sin acentos; commits por heredoc con `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. 390 px primero.

---

## Estructura de archivos

```
prisma/schema.prisma                    ← Nicho.etiquetaOsm, Prospecto.fuentesPorCampo, BusquedaOsm, Revision
src/lib/
  tabla-contrato.ts                     ← COLUMNAS, parsearTabla, mapearEncabezados, validarFila      (puro)
  contactos-web-contrato.ts             ← extraerContactos(html, urlBase)                              (puro)
  maps-contrato.ts                      ← esUrlMaps, extraerFichaMaps(html)                            (puro)
  overpass-contrato.ts                  ← CIUDADES, armarConsultaOverpass, prospectosDesdeOverpass     (puro)
  red-segura.ts                         ← descargar(url, opciones) con guardia SSRF
  overpass.ts                           ← buscarEnOverpass (cache + cola de 1 + 5 s)
  revision.ts                           ← crearLote, loteConDetalle, lotesRecientes (base)
  plantilla-importar.ts                 ← generarPlantillaXlsx, generarPlantillaCsv, leerXlsx (exceljs)
src/acciones/
  revision.ts                           ← aprobarFila, completarExistente, descartarFila, corregirFila, aprobarNuevos
  buscar.ts                             ← buscarOverpass, cargarMaps, importarTexto, importarArchivo, leerWebDeProspecto, aplicarSugerencia
src/app/(panel)/buscar/page.tsx         ← cuatro caminos + bandeja (pestañas por ?t=)
src/app/(panel)/buscar/plantilla/route.ts ← GET ?formato=xlsx|csv
src/app/manifest.ts                     ← PWA mínima con share_target GET → /buscar?t=maps&url=
src/componentes/
  Bandeja.tsx · FormOverpass.tsx · FormMaps.tsx · FormImportar.tsx · SugerenciasWeb.tsx
  BarraInferior.tsx (modificar: Buscar activo)
src/app/(panel)/prospectos/[id]/page.tsx (modificar: boton Leer web + sugerencias; fuentes por campo)
tests/
  tabla-contrato.test.ts · contactos-web-contrato.test.ts · maps-contrato.test.ts · overpass-contrato.test.ts
  red-segura.test.ts · revision.test.ts · buscar.test.ts · plantilla-importar.test.ts
  fixtures/maps-ficha.html · fixtures/web-negocio.html · fixtures/overpass.json
scripts/verificar-flujo-buscar.mts
```

**Convenciones:** `datos` de una fila de `Revision` es un `ProspectoEntrada` (de `src/lib/importar.ts`) más `fuentesPorCampo: Record<string,string>`; `origen` ∈ `overpass | web | maps | importado`; `Evento` `importado` con `usuarioId` al aprobar. Las fuentes por campo se guardan en `Prospecto.fuentesPorCampo` y la lista plana `fuentes` recibe las URLs únicas.

---

### Task 1: Esquema — etiquetas OSM, fuentes por campo, caché de Overpass y bandeja

**Files:**
- Modify: `prisma/schema.prisma`, `tests/ayuda-db.ts`, `tests/esquema.test.ts`, `scripts/sembrar-nichos.mjs`

**Interfaces:**
- Produces: `Nicho.etiquetaOsm Json` (lista de pares `[clave, valor]`), `Prospecto.fuentesPorCampo Json` (`{}`), modelos `BusquedaOsm` y `Revision`; `limpiarBase()` ampliado; `sembrarLote(origen, filas, usuarioId?)` en `tests/ayuda-db.ts`.

- [ ] **Step 1: schema**

```prisma
// Nicho: agregar
  // Etiquetas OSM del nicho: lista de pares [clave, valor], p. ej. [["tourism","hotel"],["tourism","motel"]]
  etiquetaOsm        Json        @default("[]")
  busquedasOsm       BusquedaOsm[]

// Prospecto: agregar
  // {campo: url} de donde salio cada dato (pieza 2). `fuentes` sigue siendo la lista plana de URLs.
  fuentesPorCampo    Json      @default("{}")

model BusquedaOsm {
  id           Int      @id @default(autoincrement())
  nichoId      Int
  nicho        Nicho    @relation(fields: [nichoId], references: [id])
  area         String   // slug de la ciudad (ver CIUDADES)
  consultadoEn DateTime @default(now())
  resultados   Json     // ProspectoEntrada[] ya mapeados
  @@unique([nichoId, area])
}

model Revision {
  id          Int      @id @default(autoincrement())
  lote        String   // uuid del lote
  origen      String   // overpass | web | maps | importado
  fila        Int
  datos       Json     // ProspectoEntrada + fuentesPorCampo
  // nuevo | repetido | error
  estado      String
  errores     Json     @default("[]") // lista de textos
  existenteId Int?
  existente   Prospecto? @relation(fields: [existenteId], references: [id])
  // pendiente | aprobado | completado | descartado
  decision    String   @default("pendiente")
  decididoPor Int?
  decididoEn  DateTime?
  usuarioId   Int?
  usuario     Usuario? @relation(fields: [usuarioId], references: [id])
  creadoEn    DateTime @default(now())
  @@index([lote, fila])
  @@index([decision, creadoEn])
}
// Prospecto: + revisiones Revision[] ; Usuario: + revisiones Revision[]
```

- [ ] **Step 2: migrar** — `set -a; . /home/neracosu/.config/prospectos/env; set +a; npx prisma migrate dev --create-only --name buscador`; leer el SQL (solo `CREATE TABLE`/`ADD COLUMN`/índices, ningún `DROP` salvo FK re-creadas); `npx prisma migrate dev`; `DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy`; `npx prisma generate`.

- [ ] **Step 3: `scripts/sembrar-nichos.mjs`** — `upsert` pasa a actualizar `etiquetaOsm`: hoteles `[["tourism","hotel"],["tourism","motel"],["tourism","guest_house"]]`, farmacias `[["amenity","pharmacy"]]`. Correr contra la base real (idempotente).

- [ ] **Step 4: `tests/ayuda-db.ts`** — `limpiarBase` borra `revision` y `busquedaOsm` **antes** de `prospecto`/`nicho`/`usuario`; agregar:

```ts
export async function sembrarLote(origen: string, filas: Record<string, unknown>[], usuarioId?: number): Promise<string> {
  const lote = "lote-" + Math.random().toString(36).slice(2);
  await prisma.revision.createMany({ data: filas.map((datos, i) => ({ lote, origen, fila: i + 1, datos, estado: "nuevo", usuarioId })) });
  return lote;
}
```

- [ ] **Step 5: test en `tests/esquema.test.ts`**

```ts
  it("una busqueda OSM es unica por nicho y area; la revision guarda datos JSON", async () => {
    const { nichoId, usuarioId } = await sembrarBasico();
    await prisma.busquedaOsm.create({ data: { nichoId, area: "caracas", resultados: [] } });
    await expect(prisma.busquedaOsm.create({ data: { nichoId, area: "caracas", resultados: [] } })).rejects.toThrow(/Unique/);
    const lote = await sembrarLote("importado", [{ nombre: "X", ciudad: "Y" }], usuarioId);
    const r = await prisma.revision.findFirstOrThrow({ where: { lote } });
    expect(r).toMatchObject({ estado: "nuevo", decision: "pendiente", fila: 1 });
    expect((r.datos as { nombre: string }).nombre).toBe("X");
  });
```

Run: `npm run test:db 2>&1 | tail -3 && npx tsc --noEmit`. Commit: `feat(buscar): esquema de etiquetas OSM, fuentes por campo, cache de Overpass y bandeja de revision`.

---

### Task 2: Contratos puros — tabla pegada/CSV, contactos en HTML, ficha de Maps, Overpass

**Files:**
- Create: `src/lib/tabla-contrato.ts`, `src/lib/contactos-web-contrato.ts`, `src/lib/maps-contrato.ts`, `src/lib/overpass-contrato.ts`, `tests/tabla-contrato.test.ts`, `tests/contactos-web-contrato.test.ts`, `tests/maps-contrato.test.ts`, `tests/overpass-contrato.test.ts`, `tests/fixtures/web-negocio.html`, `tests/fixtures/maps-ficha.html`, `tests/fixtures/overpass.json`

**Interfaces:**
- Consumes: `normalizarCelular`, `normalizarRed` (`@/lib/celular-contrato`); `ProspectoEntrada` (`@/lib/importar`).
- Produces:
  - `COLUMNAS = ["nicho","nombre","ciudad","estado","tipo","tamano","telefono","whatsapp","email","web","instagram","facebook","tiktok","nota","fuente"]`, `type Columna`, `OBLIGATORIAS = ["nicho","nombre","ciudad"]`.
  - `parsearTabla(texto: string): { filas: Record<Columna, string>[]; desconocidas: string[]; error?: string }` — detecta separador (tab, `;`, `,`), primera línea = encabezados, mapeo por nombre normalizado (sin acentos, minúsculas, `tamaño`→`tamano`, `whats app`→`whatsapp`), máx. 5 000 filas (`error: "Más de 5000 filas: pártelo."`), comillas CSV simples.
  - `validarFila(f: Record<Columna,string>): { entrada: ProspectoEntrada & { nicho: string; fuentesPorCampo: Record<string,string> }; errores: string[] }` — obligatorias, celular normalizado (whatsapp inválido → error «WhatsApp sin formato»; teléfono se deja tal cual), redes normalizadas, `fuente` → `fuentes: [fuente]` y `fuentesPorCampo` con esa URL para cada campo con dato.
  - `extraerContactos(html: string, urlBase: string): { emails: string[]; celulares: string[]; instagram: string[]; facebook: string[]; tiktok: string[] }` — únicos, sin `mailto:` de imágenes, `wa.me/58…` y `api.whatsapp.com/send?phone=…` y números venezolanos en texto; redes desde `href`; excluye enlaces a `instagram.com/p/…`, `facebook.com/sharer`, `tiktok.com/@…/video`.
  - `esUrlMaps(url: string): boolean` (`google.com/maps`, `maps.google.com`, `goo.gl/maps`, `maps.app.goo.gl`), `extraerFichaMaps(html: string): { nombre: string; direccion: string; telefono: string; web: string } | null` — `og:title` sin « - Google Maps», `og:description` como dirección; teléfono y web desde los patrones `"+58 …"` / `"http…"` si aparecen en el HTML inicial; `null` si no hay `og:title`.
  - `CIUDADES: { slug: string; nombre: string; estado: string; lat: number; lon: number; radioM: number }[]` (Caracas, Valencia, Maracay, Maracaibo, Barquisimeto, Puerto La Cruz–Barcelona, Mérida, San Cristóbal, Puerto Ordaz, Cumaná, Margarita (Porlamar), Los Teques, La Guaira), `ciudadPorSlug(slug)`.
  - `armarConsultaOverpass(etiquetas: [string,string][], ciudad): string` → QL `[out:json][timeout:60];( nwr["tourism"="hotel"](around:R,LAT,LON); … );out center tags;`.
  - `prospectosDesdeOverpass(json: unknown, ciudad, nicho: string): (ProspectoEntrada & { nicho: string; fuentesPorCampo: Record<string,string> })[]` — `name` obligatorio; `addr:*` → nota «Dirección: …»; `phone`/`contact:phone` → telefono + whatsapp normalizado; `website`/`contact:website`; `contact:instagram`/`contact:facebook`; fuente `https://www.openstreetmap.org/<type>/<id>` en `fuentes` y en cada campo.

- [ ] **Step 1: fixtures** — `tests/fixtures/web-negocio.html`: una página con `mailto:reservas@hotelx.com.ve`, un `href="https://wa.me/584121234567"`, un texto «Reservas: 0414-555.12.34», `href="https://www.instagram.com/hotelx/"`, `href="https://www.facebook.com/hotelx"`, `href="https://www.tiktok.com/@hotelx"`, y trampas: `href="https://www.instagram.com/p/abc/"`, `href="https://www.facebook.com/sharer/sharer.php?u=…"`, `<img src="foto@2x.png">`. `tests/fixtures/maps-ficha.html`: `<meta property="og:title" content="Hotel Yare - Google Maps">`, `<meta property="og:description" content="Av. Las Acacias, Sabana Grande, Caracas">`, y en un `<script>` el texto `"+58 212-7930708"` y `"https://www.hotelyare.com.ve/"`. `tests/fixtures/overpass.json`: respuesta con dos elementos (un `node` con `name`, `phone`, `website`, `addr:street`, `contact:instagram`; un `way` con `center` y solo `name`) y un tercero sin `name`.

- [ ] **Step 2: tests**

```ts
// tests/tabla-contrato.test.ts
import { describe, it, expect } from "vitest";
import { parsearTabla, validarFila } from "@/lib/tabla-contrato";

describe("parsearTabla", () => {
  it("lee TSV pegado desde Excel con encabezados en cualquier orden y mayusculas", () => {
    const r = parsearTabla("Nombre\tCiudad\tNICHO\tWhatsApp\tTamaño\nHotel A\tCaracas\thoteles\t0412 111 22 33\t20 hab.\n");
    expect(r.desconocidas).toEqual([]);
    expect(r.filas[0]).toMatchObject({ nombre: "Hotel A", ciudad: "Caracas", nicho: "hoteles", whatsapp: "0412 111 22 33", tamano: "20 hab." });
  });
  it("lee CSV con ; y con , y comillas; ignora columnas desconocidas y las reporta", () => {
    expect(parsearTabla('nombre;ciudad;nicho;color\n"Farmacia, La";Valencia;farmacias;rojo\n').filas[0]).toMatchObject({ nombre: "Farmacia, La", ciudad: "Valencia" });
    const r = parsearTabla("nombre,ciudad,nicho,color\nA,B,hoteles,rojo\n");
    expect(r.desconocidas).toEqual(["color"]);
    expect(r.filas[0].nombre).toBe("A");
  });
  it("rechaza mas de 5000 filas y tablas vacias", () => {
    const grande = "nombre\tciudad\tnicho\n" + "A\tB\thoteles\n".repeat(5001);
    expect(parsearTabla(grande).error).toMatch(/pártelo/);
    expect(parsearTabla("").error).toBeTruthy();
  });
});

describe("validarFila", () => {
  const base = { nicho: "hoteles", nombre: "Hotel A", ciudad: "Caracas", estado: "", tipo: "", tamano: "", telefono: "0212 555 1234", whatsapp: "", email: "", web: "", instagram: "@hotela", facebook: "", tiktok: "", nota: "", fuente: "https://hotela.com/contacto" };
  it("normaliza y arma las fuentes por campo", () => {
    const { entrada, errores } = validarFila(base);
    expect(errores).toEqual([]);
    expect(entrada).toMatchObject({ nicho: "hoteles", nombre: "Hotel A", whatsapp: "", telefono: "0212 555 1234", instagram: "https://www.instagram.com/hotela/", fuentes: ["https://hotela.com/contacto"] });
    expect(entrada.fuentesPorCampo).toEqual({ nombre: "https://hotela.com/contacto", ciudad: "https://hotela.com/contacto", telefono: "https://hotela.com/contacto", instagram: "https://hotela.com/contacto" });
  });
  it("marca errores: sin ciudad, whatsapp sin formato", () => {
    expect(validarFila({ ...base, ciudad: "" }).errores).toContain("Falta la ciudad");
    expect(validarFila({ ...base, whatsapp: "12345" }).errores).toContain("WhatsApp sin formato");
    expect(validarFila({ ...base, whatsapp: "+58 412 3229005" }).entrada.whatsapp).toBe("584123229005");
  });
});
```

```ts
// tests/contactos-web-contrato.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { extraerContactos } from "@/lib/contactos-web-contrato";

const html = readFileSync(path.join(import.meta.dirname, "fixtures", "web-negocio.html"), "utf8");
describe("extraerContactos", () => {
  it("saca correos, celulares (wa.me y en texto) y redes, ignorando trampas", () => {
    const c = extraerContactos(html, "https://hotelx.com.ve/");
    expect(c.emails).toEqual(["reservas@hotelx.com.ve"]);
    expect(c.celulares).toEqual(["584121234567", "584145551234"]);
    expect(c.instagram).toEqual(["https://www.instagram.com/hotelx/"]);
    expect(c.facebook).toEqual(["https://www.facebook.com/hotelx"]);
    expect(c.tiktok).toEqual(["https://www.tiktok.com/@hotelx"]);
  });
  it("con HTML vacio devuelve listas vacias", () => {
    expect(extraerContactos("", "https://x/")).toEqual({ emails: [], celulares: [], instagram: [], facebook: [], tiktok: [] });
  });
});
```

```ts
// tests/maps-contrato.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { esUrlMaps, extraerFichaMaps } from "@/lib/maps-contrato";

describe("maps", () => {
  it("reconoce las formas de URL de Maps", () => {
    for (const u of ["https://www.google.com/maps/place/Hotel+Yare/@10.5,-66.9,17z", "https://maps.google.com/?cid=123", "https://maps.app.goo.gl/AbCdEf", "https://goo.gl/maps/xyz"]) expect(esUrlMaps(u)).toBe(true);
    expect(esUrlMaps("https://www.google.com/search?q=hotel")).toBe(false);
    expect(esUrlMaps("javascript:alert(1)")).toBe(false);
  });
  it("lee la ficha desde los meta y el HTML inicial; null si no hay og:title", () => {
    const html = readFileSync(path.join(import.meta.dirname, "fixtures", "maps-ficha.html"), "utf8");
    expect(extraerFichaMaps(html)).toEqual({ nombre: "Hotel Yare", direccion: "Av. Las Acacias, Sabana Grande, Caracas", telefono: "+58 212-7930708", web: "https://www.hotelyare.com.ve/" });
    expect(extraerFichaMaps("<html><title>x</title></html>")).toBeNull();
  });
});
```

```ts
// tests/overpass-contrato.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CIUDADES, ciudadPorSlug, armarConsultaOverpass, prospectosDesdeOverpass } from "@/lib/overpass-contrato";

describe("overpass", () => {
  it("arma la consulta con around y todas las etiquetas del nicho", () => {
    const q = armarConsultaOverpass([["tourism", "hotel"], ["tourism", "motel"]], ciudadPorSlug("caracas")!);
    expect(q).toContain('[out:json][timeout:60]');
    expect(q).toContain('nwr["tourism"="hotel"](around:');
    expect(q).toContain('nwr["tourism"="motel"](around:');
    expect(q).toContain("out center tags;");
  });
  it("las ciudades tienen slug unico y coordenadas en Venezuela", () => {
    expect(new Set(CIUDADES.map((c) => c.slug)).size).toBe(CIUDADES.length);
    for (const c of CIUDADES) { expect(c.lat).toBeGreaterThan(0); expect(c.lat).toBeLessThan(13); expect(c.lon).toBeLessThan(-59); expect(c.lon).toBeGreaterThan(-74); }
  });
  it("mapea elementos a prospectos con fuente OSM por campo; ignora los sin nombre", () => {
    const json = JSON.parse(readFileSync(path.join(import.meta.dirname, "fixtures", "overpass.json"), "utf8"));
    const lista = prospectosDesdeOverpass(json, ciudadPorSlug("caracas")!, "hoteles");
    expect(lista).toHaveLength(2);
    expect(lista[0]).toMatchObject({ nicho: "hoteles", ciudad: "Caracas", estado: "Distrito Capital", whatsapp: "584121234567", web: "https://hotel-a.com", instagram: "https://www.instagram.com/hotela/" });
    expect(lista[0].fuentes).toEqual(["https://www.openstreetmap.org/node/1"]);
    expect(lista[0].fuentesPorCampo.telefono).toBe("https://www.openstreetmap.org/node/1");
    expect(lista[0].nota).toContain("Dirección:");
    expect(lista[1].fuentes).toEqual(["https://www.openstreetmap.org/way/2"]);
  });
});
```

- [ ] **Step 3: implementaciones**

```ts
// src/lib/tabla-contrato.ts
import { normalizarCelular, normalizarRed } from "@/lib/celular-contrato";
import type { ProspectoEntrada } from "@/lib/importar";

export const COLUMNAS = ["nicho", "nombre", "ciudad", "estado", "tipo", "tamano", "telefono", "whatsapp", "email", "web", "instagram", "facebook", "tiktok", "nota", "fuente"] as const;
export type Columna = (typeof COLUMNAS)[number];
export const OBLIGATORIAS: Columna[] = ["nicho", "nombre", "ciudad"];
const MAX_FILAS = 5000;

function normalizarEncabezado(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
}
const ALIAS: Record<string, Columna> = { whatsapp: "whatsapp", celular: "whatsapp", telefono: "telefono", tel: "telefono", correo: "email", email: "email", mail: "email", pagina: "web", sitio: "web", web: "web", ig: "instagram", fb: "facebook", tamano: "tamano", habitaciones: "tamano", notas: "nota", nota: "nota", fuente: "fuente", fuentes: "fuente", url: "fuente" };

function detectarSeparador(linea: string): string {
  const c = { "\t": (linea.match(/\t/g) ?? []).length, ";": (linea.match(/;/g) ?? []).length, ",": (linea.match(/,/g) ?? []).length };
  return c["\t"] >= 1 ? "\t" : c[";"] >= c[","] ? ";" : ",";
}

// CSV simple: comillas dobles envuelven un campo y "" es una comilla literal.
function partir(linea: string, sep: string): string[] {
  const salida: string[] = []; let campo = ""; let dentro = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (dentro) { if (ch === '"' && linea[i + 1] === '"') { campo += '"'; i++; } else if (ch === '"') dentro = false; else campo += ch; }
    else if (ch === '"') dentro = true;
    else if (ch === sep) { salida.push(campo); campo = ""; }
    else campo += ch;
  }
  salida.push(campo);
  return salida.map((s) => s.trim());
}

export function parsearTabla(texto: string): { filas: Record<Columna, string>[]; desconocidas: string[]; error?: string } {
  const lineas = texto.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim() !== "");
  if (lineas.length < 2) return { filas: [], desconocidas: [], error: "Pega al menos la fila de encabezados y una fila de datos." };
  if (lineas.length - 1 > MAX_FILAS) return { filas: [], desconocidas: [], error: "Más de 5000 filas: pártelo." };
  const sep = detectarSeparador(lineas[0]);
  const encabezados = partir(lineas[0], sep);
  const mapa: (Columna | null)[] = []; const desconocidas: string[] = [];
  for (const e of encabezados) {
    const n = normalizarEncabezado(e);
    const col = (COLUMNAS as readonly string[]).includes(n) ? (n as Columna) : ALIAS[n] ?? null;
    mapa.push(col); if (!col) desconocidas.push(e);
  }
  const filas = lineas.slice(1).map((l) => {
    const vals = partir(l, sep); const fila = Object.fromEntries(COLUMNAS.map((c) => [c, ""])) as Record<Columna, string>;
    mapa.forEach((col, i) => { if (col && vals[i] !== undefined && fila[col] === "") fila[col] = vals[i]; });
    return fila;
  });
  return { filas, desconocidas };
}

export type EntradaValidada = ProspectoEntrada & { nicho: string; fuentesPorCampo: Record<string, string> };

export function validarFila(f: Record<Columna, string>): { entrada: EntradaValidada; errores: string[] } {
  const errores: string[] = [];
  if (!f.nicho.trim()) errores.push("Falta el nicho");
  if (!f.nombre.trim()) errores.push("Falta el nombre");
  if (!f.ciudad.trim()) errores.push("Falta la ciudad");
  const whatsapp = f.whatsapp.trim() ? normalizarCelular(f.whatsapp) : "";
  if (f.whatsapp.trim() && !whatsapp) errores.push("WhatsApp sin formato");
  const fuente = f.fuente.trim();
  const entrada: EntradaValidada = {
    nicho: f.nicho.trim().toLowerCase(), nombre: f.nombre.trim(), ciudad: f.ciudad.trim(), estado: f.estado.trim(), tipo: f.tipo.trim(), tamano: f.tamano.trim(),
    telefono: f.telefono.trim(), whatsapp: whatsapp || normalizarCelular(f.telefono) || "", email: f.email.trim(), web: f.web.trim(),
    instagram: normalizarRed(f.instagram, "instagram"), facebook: normalizarRed(f.facebook, "facebook"), tiktok: normalizarRed(f.tiktok, "tiktok"),
    nota: f.nota.trim(), fuentes: fuente ? [fuente] : [], fuentesPorCampo: {},
  };
  if (fuente) for (const c of ["nombre", "ciudad", "estado", "tipo", "tamano", "telefono", "whatsapp", "email", "web", "instagram", "facebook", "tiktok"] as const) if (entrada[c]) entrada.fuentesPorCampo[c] = fuente;
  return { entrada, errores };
}
```

```ts
// src/lib/contactos-web-contrato.ts
import { normalizarCelular } from "@/lib/celular-contrato";

const unicos = (xs: string[]) => [...new Set(xs)];

// Lee UNA pagina publicada por el negocio y saca lo que el mismo publico.
export function extraerContactos(html: string, urlBase: string): { emails: string[]; celulares: string[]; instagram: string[]; facebook: string[]; tiktok: string[] } {
  if (!html) return { emails: [], celulares: [], instagram: [], facebook: [], tiktok: [] };
  const emails = unicos([...html.matchAll(/(?:mailto:)?([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g)].map((m) => m[1].toLowerCase()).filter((e) => !/\.(png|jpe?g|gif|svg|webp)$/i.test(e)));
  const celulares: string[] = [];
  for (const m of html.matchAll(/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)\+?(\d{10,13})/g)) { const c = normalizarCelular(m[1]); if (c) celulares.push(c); }
  const texto = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, " ");
  for (const m of texto.matchAll(/(?:\+?58[\s.\-]*)?\(?0?4(?:12|14|16|24|26|22)\)?[\s.\-]*\d{3}[\s.\-]*\d{2}[\s.\-]*\d{2}/g)) { const c = normalizarCelular(m[0]); if (c) celulares.push(c); }
  const hrefs = [...html.matchAll(/href=["']([^"']+)["']/gi)].map((m) => { try { return new URL(m[1], urlBase).toString(); } catch { return ""; } }).filter(Boolean);
  const instagram = unicos(hrefs.filter((h) => /^https?:\/\/(www\.)?instagram\.com\/[A-Za-z0-9_.]+\/?$/.test(h) && !/\/(p|reel|explore)\//.test(h)));
  const facebook = unicos(hrefs.filter((h) => /^https?:\/\/(www\.|m\.)?facebook\.com\/[A-Za-z0-9_.]+\/?$/.test(h) && !/sharer|share\.php|login/.test(h)));
  const tiktok = unicos(hrefs.filter((h) => /^https?:\/\/(www\.)?tiktok\.com\/@[A-Za-z0-9_.]+\/?$/.test(h)));
  return { emails, celulares: unicos(celulares), instagram, facebook, tiktok };
}
```

```ts
// src/lib/maps-contrato.ts
// Google Maps: solo UNA ficha por vez, leida de los meta del HTML inicial. Si Google cambia el
// formato, extraerFichaMaps devuelve null y el panel ofrece cargar a mano con el enlace como fuente.
export function esUrlMaps(url: string): boolean {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return false;
    const h = u.hostname.toLowerCase();
    return (h.endsWith("google.com") && u.pathname.startsWith("/maps")) || h === "maps.google.com" || h === "maps.app.goo.gl" || (h === "goo.gl" && u.pathname.startsWith("/maps"));
  } catch { return false; }
}

function meta(html: string, prop: string): string {
  const m = html.match(new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']*)["']`, "i")) ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${prop}["']`, "i"));
  return m ? m[1].replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"') : "";
}

export function extraerFichaMaps(html: string): { nombre: string; direccion: string; telefono: string; web: string } | null {
  const titulo = meta(html, "og:title");
  if (!titulo) return null;
  const nombre = titulo.replace(/\s*[-–·]\s*Google Maps\s*$/i, "").trim();
  const direccion = meta(html, "og:description").trim();
  const tel = html.match(/"(\+58[\d\s().-]{7,20})"/);
  const web = html.match(/"(https?:\/\/(?!(?:www\.)?google\.|maps\.|schema\.org|gstatic|ggpht|googleusercontent)[^"\s]+\.[a-z]{2,}[^"\s]*)"/i);
  return { nombre, direccion, telefono: tel ? tel[1].trim() : "", web: web ? web[1] : "" };
}
```

```ts
// src/lib/overpass-contrato.ts
import { normalizarCelular, normalizarRed } from "@/lib/celular-contrato";
import type { EntradaValidada } from "@/lib/tabla-contrato";

export type Ciudad = { slug: string; nombre: string; estado: string; lat: number; lon: number; radioM: number };
export const CIUDADES: Ciudad[] = [
  { slug: "caracas", nombre: "Caracas", estado: "Distrito Capital", lat: 10.4806, lon: -66.9036, radioM: 18000 },
  { slug: "la-guaira", nombre: "La Guaira", estado: "La Guaira", lat: 10.6031, lon: -66.9354, radioM: 12000 },
  { slug: "los-teques", nombre: "Los Teques", estado: "Miranda", lat: 10.3444, lon: -67.0428, radioM: 8000 },
  { slug: "valencia", nombre: "Valencia", estado: "Carabobo", lat: 10.162, lon: -68.0077, radioM: 15000 },
  { slug: "maracay", nombre: "Maracay", estado: "Aragua", lat: 10.2469, lon: -67.5958, radioM: 12000 },
  { slug: "maracaibo", nombre: "Maracaibo", estado: "Zulia", lat: 10.6427, lon: -71.6125, radioM: 18000 },
  { slug: "barquisimeto", nombre: "Barquisimeto", estado: "Lara", lat: 10.0678, lon: -69.3474, radioM: 12000 },
  { slug: "barcelona-plc", nombre: "Barcelona – Puerto La Cruz", estado: "Anzoátegui", lat: 10.1667, lon: -64.6833, radioM: 15000 },
  { slug: "merida", nombre: "Mérida", estado: "Mérida", lat: 8.5897, lon: -71.1561, radioM: 10000 },
  { slug: "san-cristobal", nombre: "San Cristóbal", estado: "Táchira", lat: 7.7669, lon: -72.225, radioM: 10000 },
  { slug: "puerto-ordaz", nombre: "Puerto Ordaz", estado: "Bolívar", lat: 8.2973, lon: -62.7112, radioM: 15000 },
  { slug: "cumana", nombre: "Cumaná", estado: "Sucre", lat: 10.4534, lon: -64.1675, radioM: 10000 },
  { slug: "porlamar", nombre: "Porlamar (Margarita)", estado: "Nueva Esparta", lat: 10.9577, lon: -63.8497, radioM: 15000 },
];
export function ciudadPorSlug(slug: string): Ciudad | undefined { return CIUDADES.find((c) => c.slug === slug); }

export function armarConsultaOverpass(etiquetas: [string, string][], c: Ciudad): string {
  const partes = etiquetas.map(([k, v]) => `nwr["${k}"="${v}"](around:${c.radioM},${c.lat},${c.lon});`).join("\n  ");
  return `[out:json][timeout:60];\n(\n  ${partes}\n);\nout center tags;`;
}

type Elemento = { type: string; id: number; tags?: Record<string, string> };

export function prospectosDesdeOverpass(json: unknown, c: Ciudad, nicho: string): EntradaValidada[] {
  const elementos = ((json as { elements?: Elemento[] })?.elements ?? []).filter((e) => e.tags?.name);
  return elementos.map((e) => {
    const t = e.tags!; const fuente = `https://www.openstreetmap.org/${e.type}/${e.id}`;
    const telefono = t.phone ?? t["contact:phone"] ?? ""; const web = t.website ?? t["contact:website"] ?? "";
    const direccion = [t["addr:street"], t["addr:housenumber"], t["addr:suburb"]].filter(Boolean).join(" ");
    const entrada: EntradaValidada = {
      nicho, nombre: t.name.trim(), ciudad: c.nombre, estado: c.estado, tipo: t.tourism ?? t.amenity ?? t.shop ?? "", tamano: t.rooms ? `${t.rooms} hab.` : "",
      telefono, whatsapp: normalizarCelular(t["contact:whatsapp"] ?? "") || normalizarCelular(telefono), email: t.email ?? t["contact:email"] ?? "", web,
      instagram: normalizarRed(t["contact:instagram"] ?? "", "instagram"), facebook: normalizarRed(t["contact:facebook"] ?? "", "facebook"), tiktok: normalizarRed(t["contact:tiktok"] ?? "", "tiktok"),
      nota: direccion ? `Dirección: ${direccion}` : "", fuentes: [fuente], fuentesPorCampo: {},
    };
    for (const k of ["nombre", "ciudad", "tipo", "tamano", "telefono", "whatsapp", "email", "web", "instagram", "facebook", "tiktok"] as const) if (entrada[k]) entrada.fuentesPorCampo[k] = fuente;
    return entrada;
  });
}
```

(Ajustar los fixtures para que las aserciones sean exactas: en `overpass.json` el `node` 1 lleva `phone: "+58 412 1234567"`, `website: "https://hotel-a.com"`, `contact:instagram: "hotela"`, `addr:street: "Av. Principal"`; el `way` 2 solo `name`.)

- [ ] **Step 4: verificar y commit** — `npx vitest run tests/tabla-contrato.test.ts tests/contactos-web-contrato.test.ts tests/maps-contrato.test.ts tests/overpass-contrato.test.ts && npx tsc --noEmit`. Commit: `feat(buscar): parsers de tabla, contactos web, ficha de Maps y Overpass (contratos puros con fixtures)`.

---

### Task 3: Red segura — descargas salientes con guardia SSRF

**Files:**
- Create: `src/lib/red-segura.ts`, `tests/red-segura.test.ts`

**Interfaces:**
- Produces: `descargar(url: string, o?: { maxBytes?: number; timeoutMs?: number; maxRedirecciones?: number; metodo?: "GET" | "HEAD" | "POST"; cuerpo?: string; contentType?: string }): Promise<{ ok: true; estado: number; urlFinal: string; texto: string } | { ok: false; motivo: string }>` — defaults 2 MB, 10 s, 3 redirecciones; `esUrlPermitida(url: string): Promise<{ ok: true; url: URL } | { ok: false; motivo: string }>` (solo `http:`/`https:`, sin `localhost`, sin nombres sin punto, resuelve DNS con `dns.promises.lookup` y rechaza IPv4 privadas/loopback/link-local/metadata `169.254.*`, `10.*`, `172.16-31.*`, `192.168.*`, `127.*`, `0.*`, `100.64-127.*` y cualquier IPv6 que no sea global); `USER_AGENT`.
- Redirecciones se siguen a mano (`redirect: "manual"`) para pasar cada salto por `esUrlPermitida`.
- Test con un servidor `http` local en `127.0.0.1`: debe ser **rechazado** por la guardia (IP privada) — y para probar el camino feliz se inyecta un resolvedor: `descargar(url, { _resolver: async () => "93.184.216.34" })` (opción interna, solo tests) que permite pasar la guardia y golpear el servidor local por `Host`. Simplificación: exponer `_lookupParaTests` como parámetro opcional del módulo (una función `(host) => Promise<string>`), documentado como solo para tests.

- [ ] **Step 1: tests**

```ts
// tests/red-segura.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { esUrlPermitida, descargar } from "@/lib/red-segura";

let servidor: http.Server; let puerto = 0;
beforeAll(async () => {
  servidor = http.createServer((req, res) => {
    if (req.url === "/redir") { res.writeHead(302, { Location: "/final" }); return res.end(); }
    if (req.url === "/bucle") { res.writeHead(302, { Location: "/bucle" }); return res.end(); }
    if (req.url === "/grande") { res.writeHead(200, { "content-type": "text/html" }); return res.end("x".repeat(3 * 1024 * 1024)); }
    if (req.url === "/lento") { return setTimeout(() => { res.writeHead(200); res.end("tarde"); }, 3000); }
    if (req.url === "/privado") { res.writeHead(302, { Location: "http://127.0.0.1:" + puerto + "/final" }); return res.end(); }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end("<html>hola " + req.url + "</html>");
  });
  await new Promise<void>((r) => servidor.listen(0, "127.0.0.1", () => { puerto = (servidor.address() as { port: number }).port; r(); }));
});
afterAll(() => new Promise<void>((r) => servidor.close(() => r())));

const publica = { _lookupParaTests: async () => "127.0.0.1" }; // simula que "ejemplo.test" resuelve a nuestro servidor
const url = (p: string) => `http://ejemplo.test:${puerto}${p}`;

describe("esUrlPermitida", () => {
  it("rechaza esquemas raros, localhost y privadas", async () => {
    for (const u of ["ftp://x.com/", "file:///etc/passwd", "http://localhost/", "http://127.0.0.1/", "http://10.0.0.1/", "http://192.168.1.1/", "http://169.254.169.254/", "http://intranet/"]) {
      const r = await esUrlPermitida(u);
      expect(r.ok, u).toBe(false);
    }
  });
});

describe("descargar", () => {
  it("baja una pagina publica (con resolvedor inyectado) y sigue una redireccion relativa", async () => {
    const r = await descargar(url("/redir"), { ...publica });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.texto).toContain("hola /final"); expect(r.urlFinal).toBe(url("/final")); }
  });
  it("corta a maxBytes, corta por tiempo y corta los bucles de redireccion", async () => {
    const g = await descargar(url("/grande"), { ...publica, maxBytes: 1024 });
    expect(g.ok && g.texto.length <= 1024).toBe(true);
    const l = await descargar(url("/lento"), { ...publica, timeoutMs: 500 });
    expect(l.ok).toBe(false);
    const b = await descargar(url("/bucle"), { ...publica });
    expect(b).toEqual({ ok: false, motivo: expect.stringContaining("redirecciones") });
  });
  it("una redireccion hacia una IP privada se rechaza aunque el origen sea publico", async () => {
    const r = await descargar(url("/privado"), { ...publica, _lookupParaTests: async (h: string) => (h === "ejemplo.test" ? "93.184.216.34" : h) });
    // la primera URL "resuelve" a una IP publica ficticia pero el servidor esta en 127.0.0.1: para este test
    // solo importa que el salto a 127.0.0.1 se rechace; la conexion al primer host no se intenta realmente
    expect(r.ok).toBe(false);
  });
  it("sin resolvedor inyectado, un host que resuelve a 127.0.0.1 se rechaza", async () => {
    const r = await descargar(`http://127.0.0.1:${puerto}/final`);
    expect(r).toEqual({ ok: false, motivo: expect.stringContaining("privada") });
  });
});
```

(El tercer caso es difícil de probar de punta a punta sin red; si al implementarlo la conexión al host ficticio falla antes que la guardia del segundo salto, cambiar la aserción a `expect(r.ok).toBe(false)` con motivo cualquiera y dejar un test **unitario** directo de `esUrlPermitida("http://127.0.0.1:1/x")` → rechazado. El objetivo es que quede probado que cada salto pasa por la guardia: se puede probar exportando `_esSaltoPermitido` — decisión del implementador, explicada en el reporte.)

- [ ] **Step 2: implementación**

```ts
// src/lib/red-segura.ts — TODA peticion saliente del panel pasa por aqui.
// Solo http(s), sin localhost ni IPs privadas (se resuelve el DNS y se revisa cada salto),
// con tope de tiempo y de bytes. Evita que el panel se use para tocar la red interna del servidor.
import dns from "node:dns";
import net from "node:net";

export const USER_AGENT = "prospectos.neracosu.com (contacto: neracosu@gmail.com)";
type Opciones = { maxBytes?: number; timeoutMs?: number; maxRedirecciones?: number; metodo?: "GET" | "HEAD" | "POST"; cuerpo?: string; contentType?: string; _lookupParaTests?: (host: string) => Promise<string> };

function ipPrivada(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
  }
  const v6 = ip.toLowerCase();
  return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80") || v6.startsWith("::ffff:");
}

export async function esUrlPermitida(url: string, lookup?: (host: string) => Promise<string>): Promise<{ ok: true; url: URL } | { ok: false; motivo: string }> {
  let u: URL;
  try { u = new URL(url); } catch { return { ok: false, motivo: "URL inválida" }; }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, motivo: "Solo se aceptan direcciones http(s)" };
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || !host.includes(".") || net.isIP(host)) {
    if (net.isIP(host) && !ipPrivada(host)) return { ok: true, url: u };
    return { ok: false, motivo: "Dirección privada o local no permitida" };
  }
  try {
    const ip = lookup ? await lookup(host) : (await dns.promises.lookup(host)).address;
    if (ipPrivada(ip)) return { ok: false, motivo: "Dirección privada o local no permitida" };
  } catch { return { ok: false, motivo: "No se pudo resolver el dominio" }; }
  return { ok: true, url: u };
}

export async function descargar(url: string, o: Opciones = {}): Promise<{ ok: true; estado: number; urlFinal: string; texto: string } | { ok: false; motivo: string }> {
  const maxBytes = o.maxBytes ?? 2 * 1024 * 1024, timeoutMs = o.timeoutMs ?? 10_000, maxRedir = o.maxRedirecciones ?? 3;
  let actual = url;
  for (let salto = 0; salto <= maxRedir; salto++) {
    const g = await esUrlPermitida(actual, o._lookupParaTests);
    if (!g.ok) return g;
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(g.url, { method: o.metodo ?? "GET", redirect: "manual", signal: ctrl.signal, body: o.cuerpo, headers: { "user-agent": USER_AGENT, accept: "text/html,application/json;q=0.9,*/*;q=0.5", ...(o.contentType ? { "content-type": o.contentType } : {}) } });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        if (salto === maxRedir) return { ok: false, motivo: "Demasiadas redirecciones" };
        actual = new URL(res.headers.get("location")!, g.url).toString();
        continue;
      }
      const lector = res.body?.getReader(); if (!lector) return { ok: true, estado: res.status, urlFinal: g.url.toString(), texto: "" };
      const partes: Uint8Array[] = []; let total = 0;
      while (true) { const { done, value } = await lector.read(); if (done) break; total += value.length; partes.push(value); if (total >= maxBytes) { await lector.cancel(); break; } }
      const texto = Buffer.concat(partes).subarray(0, maxBytes).toString("utf8");
      return { ok: true, estado: res.status, urlFinal: g.url.toString(), texto };
    } catch (err) {
      return { ok: false, motivo: ctrl.signal.aborted ? "Tiempo de espera agotado" : `No se pudo conectar (${(err as Error).message})` };
    } finally { clearTimeout(t); }
  }
  return { ok: false, motivo: "Demasiadas redirecciones" };
}
```

- [ ] **Step 3: verificar y commit** — `npx vitest run tests/red-segura.test.ts && npx tsc --noEmit`. Commit: `feat(buscar): descargas salientes con guardia SSRF, tiempo y tamano acotados`.

---

### Task 4: Bandeja de revisión — lotes, dedup, aprobar/completar/descartar/corregir

**Files:**
- Create: `src/lib/revision.ts`, `src/acciones/revision.ts`, `tests/revision.test.ts`

**Interfaces:**
- Consumes: `claveProspecto`, `generarCodigo`, `normalizarCelular`, `normalizarRed`, `EntradaValidada` (T2), `exigirSesion`, `Resultado`.
- Produces (`src/lib/revision.ts`):
  - `type FilaRevision = { id; lote; origen; fila; datos: EntradaValidada; estado: "nuevo" | "repetido" | "error"; errores: string[]; existenteId: number | null; existente: { id; nombre; ciudad; telefono; whatsapp; email; web; instagram; facebook; tiktok } | null; decision: "pendiente" | "aprobado" | "completado" | "descartado" }`.
  - `crearLote(origen: string, entradas: { entrada: EntradaValidada; errores: string[] }[], usuarioId: number): Promise<{ lote: string; nuevos: number; repetidos: number; errores: number }>` — resuelve `nicho` (slug) → `nichoId` (slug desconocido = error «Nicho desconocido»), calcula `clave`, busca existentes por `(nichoId, clave)` y también repetidos **dentro del mismo lote** (segunda aparición = `repetido` con `existenteId` null y error «Repetido en el mismo archivo»), guarda `Revision`.
  - `loteConDetalle(lote: string): Promise<{ lote; origen; creadoEn; filas: FilaRevision[] }|null>`, `lotesRecientes(): Promise<{ lote; origen; creadoEn; pendientes: number; total: number }[]>` (últimos 20), `limpiarLotesViejos(dias = 30)`.
- Produces (`src/acciones/revision.ts`, todas `Promise<Resultado>`, con `exigirSesion`): `aprobarFila(id)` (solo `estado nuevo` y `decision pendiente`; crea el `Prospecto` con `origen` del lote, `fuentes`, `fuentesPorCampo`, `Evento importado` con `usuarioId`, todo en `$transaction`, `updateMany` condicionado; si al crear salta `P2002` → marca `repetido`), `completarExistente(id)` (solo `repetido` con `existenteId`; rellena en el existente **solo los campos vacíos**, suma fuentes, `Evento nota` «Completado desde <origen>», marca `completado`), `descartarFila(id)`, `corregirFila(id, formData)` (edita `datos`, revalida, recalcula estado nuevo/repetido/error), `aprobarNuevos(lote)` (aprueba todas las `nuevo` pendientes del lote, una por una, devuelve cuántas).

- [ ] **Step 1: tests**

```ts
// tests/revision.test.ts
import { vi } from "vitest";
vi.mock("@/lib/sesion", async () => {
  const { sesionFalsa } = await import("./ayuda-sesion");
  return {
    COOKIE_SESION: "pr_sesion", DIAS_SESION: 30,
    sesionActual: async () => sesionFalsa.actual,
    exigirSesion: async () => { if (!sesionFalsa.actual) throw new Error("REDIRECT:/entrar"); return sesionFalsa.actual; },
    exigirRol: async (rol: string) => { if (sesionFalsa.actual?.rol !== rol) throw new Error("REDIRECT:/hoy"); return sesionFalsa.actual; },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, crearProspectoDePrueba } from "./ayuda-db";
import { sesionFalsa } from "./ayuda-sesion";
import { crearLote, loteConDetalle, lotesRecientes } from "@/lib/revision";
import { aprobarFila, completarExistente, descartarFila, corregirFila, aprobarNuevos } from "@/acciones/revision";
import { validarFila } from "@/lib/tabla-contrato";

const fila = (o: Partial<Record<string, string>>) => validarFila({ nicho: "hoteles", nombre: "", ciudad: "", estado: "", tipo: "", tamano: "", telefono: "", whatsapp: "", email: "", web: "", instagram: "", facebook: "", tiktok: "", nota: "", fuente: "https://f.test/", ...o });
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe.runIf(DB_HABILITADA)("bandeja de revision", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  let lote: string;
  beforeAll(async () => {
    await limpiarBase(); ids = await sembrarBasico();
    await crearProspectoDePrueba(ids.nichoId, { nombre: "Hotel Existente", ciudad: "Caracas", whatsapp: "", email: "" });
  });
  beforeEach(() => { sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" }; });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("crearLote clasifica nuevo / repetido (base y mismo lote) / error", async () => {
    const r = await crearLote("importado", [
      fila({ nombre: "Hotel Nuevo", ciudad: "Caracas", whatsapp: "0412 111 11 11" }),
      fila({ nombre: "HOTEL EXISTENTE", ciudad: "caracas", email: "info@existente.com" }),
      fila({ nombre: "Sin Ciudad", ciudad: "" }),
      fila({ nombre: "Hotel Nuevo", ciudad: "Caracas" }), // repetido dentro del lote
      fila({ nicho: "raro", nombre: "Otro", ciudad: "Valencia" }),
    ], ids.prospectadorId);
    expect(r).toMatchObject({ nuevos: 1, repetidos: 2, errores: 2 });
    lote = r.lote;
    const d = (await loteConDetalle(lote))!;
    expect(d.filas.map((f) => f.estado)).toEqual(["nuevo", "repetido", "error", "repetido", "error"]);
    expect(d.filas[1].existente?.nombre).toBe("Hotel Existente");
    expect(d.filas[3].errores).toContain("Repetido en el mismo archivo");
    expect(d.filas[4].errores).toContain("Nicho desconocido");
    expect((await lotesRecientes())[0]).toMatchObject({ lote, pendientes: 5, total: 5 });
  });

  it("aprobarFila crea el prospecto con fuentes y evento; dos toques, uno", async () => {
    const d = (await loteConDetalle(lote))!;
    const [a, b] = await Promise.all([aprobarFila(d.filas[0].id), aprobarFila(d.filas[0].id)]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const p = await prisma.prospecto.findFirstOrThrow({ where: { nombre: "Hotel Nuevo" } });
    expect(p).toMatchObject({ origen: "importado", whatsapp: "584121111111", etapa: "por_contactar", fuentes: ["https://f.test/"] });
    expect((p.fuentesPorCampo as Record<string, string>).whatsapp).toBe("https://f.test/");
    expect(await prisma.evento.count({ where: { prospectoId: p.id, tipo: "importado", usuarioId: ids.prospectadorId } })).toBe(1);
    expect((await loteConDetalle(lote))!.filas[0].decision).toBe("aprobado");
    expect((await aprobarFila(d.filas[1].id)).ok).toBe(false); // repetido no se aprueba
  });

  it("completarExistente rellena solo huecos y suma la fuente", async () => {
    const d = (await loteConDetalle(lote))!;
    expect((await completarExistente(d.filas[1].id)).ok).toBe(true);
    const e = await prisma.prospecto.findFirstOrThrow({ where: { nombre: "Hotel Existente" } });
    expect(e.email).toBe("info@existente.com");
    expect(e.nombre).toBe("Hotel Existente"); // no se piso el nombre
    expect(e.fuentes).toContain("https://f.test/");
    expect(await prisma.evento.count({ where: { prospectoId: e.id, tipo: "nota" } })).toBe(1);
    expect((await completarExistente(d.filas[1].id)).ok).toBe(false); // ya decidido
  });

  it("corregirFila revalida y cambia el estado; descartar y aprobarNuevos", async () => {
    const d = (await loteConDetalle(lote))!;
    expect((await corregirFila(d.filas[2].id, fd({ ciudad: "Mérida" }))).ok).toBe(true);
    let d2 = (await loteConDetalle(lote))!;
    expect(d2.filas[2].estado).toBe("nuevo");
    expect((await descartarFila(d.filas[3].id)).ok).toBe(true);
    const r = await aprobarNuevos(lote);
    expect(r.ok && r.datos.aprobadas).toBe(1); // solo "Sin Ciudad" corregida
    d2 = (await loteConDetalle(lote))!;
    expect(d2.filas.map((f) => f.decision)).toEqual(["aprobado", "completado", "aprobado", "descartado", "pendiente"]);
  });

  it("sin sesion nada se aprueba", async () => {
    sesionFalsa.actual = null;
    await expect(descartarFila(1)).rejects.toThrow("REDIRECT:/entrar");
  });
});
```

- [ ] **Step 2: `src/lib/revision.ts`**

```ts
// src/lib/revision.ts — lotes de la bandeja. Nada entra a Prospecto sin pasar por aqui.
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { claveProspecto } from "@/lib/clave-prospecto";
import type { EntradaValidada } from "@/lib/tabla-contrato";

export type Estado = "nuevo" | "repetido" | "error";
export type Decision = "pendiente" | "aprobado" | "completado" | "descartado";
export type ExistenteResumen = { id: number; nombre: string; ciudad: string; telefono: string; whatsapp: string; email: string; web: string; instagram: string; facebook: string; tiktok: string };
export type FilaRevision = { id: number; lote: string; origen: string; fila: number; datos: EntradaValidada; estado: Estado; errores: string[]; existenteId: number | null; existente: ExistenteResumen | null; decision: Decision };

const SELECT_EXISTENTE = { id: true, nombre: true, ciudad: true, telefono: true, whatsapp: true, email: true, web: true, instagram: true, facebook: true, tiktok: true } as const;

// Clasifica una entrada contra la base y contra las claves ya vistas en el lote.
export async function clasificar(entrada: EntradaValidada, errores: string[], vistas: Set<string>): Promise<{ estado: Estado; errores: string[]; existenteId: number | null }> {
  const errs = [...errores];
  const nicho = await prisma.nicho.findUnique({ where: { slug: entrada.nicho }, select: { id: true } });
  if (!nicho) errs.push("Nicho desconocido");
  if (errs.length) return { estado: "error", errores: errs, existenteId: null };
  const clave = `${nicho!.id}|${claveProspecto(entrada.nombre, entrada.ciudad)}`;
  if (vistas.has(clave)) return { estado: "repetido", errores: ["Repetido en el mismo archivo"], existenteId: null };
  vistas.add(clave);
  const existente = await prisma.prospecto.findUnique({ where: { nichoId_clave: { nichoId: nicho!.id, clave: claveProspecto(entrada.nombre, entrada.ciudad) } }, select: { id: true } });
  return existente ? { estado: "repetido", errores: [], existenteId: existente.id } : { estado: "nuevo", errores: [], existenteId: null };
}

export async function crearLote(origen: string, entradas: { entrada: EntradaValidada; errores: string[] }[], usuarioId: number): Promise<{ lote: string; nuevos: number; repetidos: number; errores: number }> {
  const lote = randomUUID(); const vistas = new Set<string>();
  const cuenta = { nuevos: 0, repetidos: 0, errores: 0 };
  const filas = [];
  for (let i = 0; i < entradas.length; i++) {
    const c = await clasificar(entradas[i].entrada, entradas[i].errores, vistas);
    cuenta[c.estado === "nuevo" ? "nuevos" : c.estado === "repetido" ? "repetidos" : "errores"]++;
    filas.push({ lote, origen, fila: i + 1, datos: entradas[i].entrada as object, estado: c.estado, errores: c.errores, existenteId: c.existenteId, usuarioId });
  }
  if (filas.length) await prisma.revision.createMany({ data: filas });
  return { lote, ...cuenta };
}

export async function loteConDetalle(lote: string): Promise<{ lote: string; origen: string; creadoEn: Date; filas: FilaRevision[] } | null> {
  const filas = await prisma.revision.findMany({ where: { lote }, orderBy: { fila: "asc" }, include: { existente: { select: SELECT_EXISTENTE } } });
  if (!filas.length) return null;
  return { lote, origen: filas[0].origen, creadoEn: filas[0].creadoEn, filas: filas.map((f) => ({ id: f.id, lote: f.lote, origen: f.origen, fila: f.fila, datos: f.datos as EntradaValidada, estado: f.estado as Estado, errores: (f.errores as string[]) ?? [], existenteId: f.existenteId, existente: f.existente, decision: f.decision as Decision })) };
}

export async function lotesRecientes(): Promise<{ lote: string; origen: string; creadoEn: Date; pendientes: number; total: number }[]> {
  const grupos = await prisma.revision.groupBy({ by: ["lote", "origen"], _count: { _all: true }, _min: { creadoEn: true }, orderBy: { _min: { creadoEn: "desc" } }, take: 20 });
  const pendientes = await prisma.revision.groupBy({ by: ["lote"], where: { decision: "pendiente", lote: { in: grupos.map((g) => g.lote) } }, _count: { _all: true } });
  return grupos.map((g) => ({ lote: g.lote, origen: g.origen, creadoEn: g._min.creadoEn!, total: g._count._all, pendientes: pendientes.find((p) => p.lote === g.lote)?._count._all ?? 0 }));
}

// Los lotes ya decididos se limpian a los 30 dias (los pendientes se quedan).
export async function limpiarLotesViejos(dias = 30): Promise<number> {
  const antes = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  const r = await prisma.revision.deleteMany({ where: { decision: { not: "pendiente" }, creadoEn: { lt: antes } } });
  return r.count;
}
```

- [ ] **Step 3: `src/acciones/revision.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { exigirSesion } from "@/lib/sesion";
import { generarCodigo } from "@/lib/codigo";
import { claveProspecto } from "@/lib/clave-prospecto";
import { regionDe } from "@/lib/importar";
import { validarFila, COLUMNAS, type Columna, type EntradaValidada } from "@/lib/tabla-contrato";
import { clasificar } from "@/lib/revision";
import { fallo, exito, type Resultado } from "@/acciones/resultado";

// exigirSesion() FUERA del try/catch: dueno y prospectador aprueban. Nadie borra prospectos.
const ERROR = "No se pudo guardar. Intenta de nuevo.";
const Id = z.number().int().positive();
const refrescar = () => { revalidatePath("/buscar"); revalidatePath("/hoy"); revalidatePath("/prospectos"); };
const CAMPOS_CONTACTO = ["telefono", "whatsapp", "email", "web", "instagram", "facebook", "tiktok", "estado", "tipo", "tamano", "nota"] as const;

export async function aprobarFila(id: number): Promise<Resultado> {
  const u = await exigirSesion();
  const e = Id.safeParse(id);
  if (!e.success) return fallo(ERROR);
  try {
    const r = await prisma.revision.findUnique({ where: { id: e.data } });
    if (!r) return fallo("Esa fila ya no existe.");
    if (r.estado !== "nuevo") return fallo("Solo se aprueban filas nuevas; las repetidas se completan o se descartan.");
    const d = r.datos as EntradaValidada;
    const nicho = await prisma.nicho.findUnique({ where: { slug: d.nicho }, select: { id: true } });
    if (!nicho) return fallo("Nicho desconocido.");
    const max = await prisma.prospecto.aggregate({ _max: { ordenCola: true } });
    await prisma.$transaction(async (tx) => {
      const tomada = await tx.revision.updateMany({ where: { id: r.id, decision: "pendiente" }, data: { decision: "aprobado", decididoPor: u.id, decididoEn: new Date() } });
      if (tomada.count === 0) throw new Error("YA_DECIDIDA");
      const p = await tx.prospecto.create({ data: {
        nichoId: nicho.id, nombre: d.nombre, ciudad: d.ciudad, estado: d.estado ?? "", region: regionDe(d.estado ?? ""), tipo: d.tipo ?? "", tamano: d.tamano ?? "", telefono: d.telefono ?? "",
        whatsapp: d.whatsapp ?? "", email: d.email ?? "", web: d.web ?? "", instagram: d.instagram ?? "", facebook: d.facebook ?? "", tiktok: d.tiktok ?? "", nota: d.nota ?? "",
        fuentes: d.fuentes ?? [], fuentesPorCampo: d.fuentesPorCampo ?? {}, origen: r.origen, codigo: generarCodigo(), clave: claveProspecto(d.nombre, d.ciudad), ordenCola: (max._max.ordenCola ?? 0) + 1,
        eventos: { create: { tipo: "importado", usuarioId: u.id, texto: r.origen } },
      }, select: { id: true } });
      return p.id;
    });
    refrescar();
    return exito();
  } catch (err) {
    if (err instanceof Error && err.message === "YA_DECIDIDA") return fallo("Esa fila ya se decidió.");
    if (typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002") {
      // Alguien lo creo entre la clasificacion y la aprobacion: pasa a repetido.
      await prisma.revision.update({ where: { id }, data: { estado: "repetido", decision: "pendiente", decididoPor: null, decididoEn: null } }).catch(() => {});
      return fallo("Ese prospecto ya existe: la fila pasó a «repetido».");
    }
    console.error("aprobarFila", err); return fallo(ERROR);
  }
}

export async function completarExistente(id: number): Promise<Resultado> {
  const u = await exigirSesion();
  const e = Id.safeParse(id);
  if (!e.success) return fallo(ERROR);
  try {
    const r = await prisma.revision.findUnique({ where: { id: e.data } });
    if (!r || r.estado !== "repetido" || !r.existenteId) return fallo("Esa fila no tiene un existente que completar.");
    const d = r.datos as EntradaValidada;
    const ex = await prisma.prospecto.findUnique({ where: { id: r.existenteId } });
    if (!ex) return fallo("El prospecto existente ya no está.");
    // Solo huecos: nunca se pisa un dato existente.
    const data: Record<string, unknown> = {}; const fpc = { ...((ex.fuentesPorCampo as Record<string, string>) ?? {}) }; const llenados: string[] = [];
    for (const c of CAMPOS_CONTACTO) { const nuevo = (d[c] ?? "").toString(); if (nuevo && !(ex[c] ?? "").toString()) { data[c] = nuevo; if (d.fuentesPorCampo?.[c]) fpc[c] = d.fuentesPorCampo[c]; llenados.push(c); } }
    const fuentes = [...new Set([...((ex.fuentes as string[]) ?? []), ...(d.fuentes ?? [])])];
    await prisma.$transaction(async (tx) => {
      const tomada = await tx.revision.updateMany({ where: { id: r.id, decision: "pendiente" }, data: { decision: "completado", decididoPor: u.id, decididoEn: new Date() } });
      if (tomada.count === 0) throw new Error("YA_DECIDIDA");
      await tx.prospecto.update({ where: { id: ex.id }, data: { ...data, fuentes, fuentesPorCampo: fpc } });
      await tx.evento.create({ data: { prospectoId: ex.id, usuarioId: u.id, tipo: "nota", texto: `Completado desde ${r.origen}: ${llenados.join(", ") || "sin campos nuevos"}` } });
    });
    refrescar();
    return exito();
  } catch (err) {
    if (err instanceof Error && err.message === "YA_DECIDIDA") return fallo("Esa fila ya se decidió.");
    console.error("completarExistente", err); return fallo(ERROR);
  }
}

export async function descartarFila(id: number): Promise<Resultado> {
  const u = await exigirSesion();
  const e = Id.safeParse(id);
  if (!e.success) return fallo(ERROR);
  try {
    const r = await prisma.revision.updateMany({ where: { id: e.data, decision: "pendiente" }, data: { decision: "descartado", decididoPor: u.id, decididoEn: new Date() } });
    if (r.count === 0) return fallo("Esa fila ya se decidió.");
    refrescar(); return exito();
  } catch (err) { console.error("descartarFila", err); return fallo(ERROR); }
}

export async function corregirFila(id: number, formData: FormData): Promise<Resultado> {
  await exigirSesion();
  const e = Id.safeParse(id);
  if (!e.success) return fallo(ERROR);
  try {
    const r = await prisma.revision.findUnique({ where: { id: e.data } });
    if (!r || r.decision !== "pendiente") return fallo("Esa fila ya se decidió.");
    const d = r.datos as EntradaValidada;
    const fila = Object.fromEntries(COLUMNAS.map((c) => [c, String(formData.get(c) ?? (c === "fuente" ? (d.fuentes?.[0] ?? "") : (d as Record<string, unknown>)[c] ?? ""))])) as Record<Columna, string>;
    const { entrada, errores } = validarFila(fila);
    const c = await clasificar(entrada, errores, new Set());
    await prisma.revision.update({ where: { id: r.id }, data: { datos: entrada as object, estado: c.estado, errores: c.errores, existenteId: c.existenteId } });
    refrescar(); return exito();
  } catch (err) { console.error("corregirFila", err); return fallo(ERROR); }
}

export async function aprobarNuevos(lote: string): Promise<Resultado<{ aprobadas: number }>> {
  await exigirSesion();
  const e = z.string().min(8).max(64).safeParse(lote);
  if (!e.success) return fallo(ERROR);
  try {
    const filas = await prisma.revision.findMany({ where: { lote: e.data, estado: "nuevo", decision: "pendiente" }, select: { id: true } });
    let aprobadas = 0;
    for (const f of filas) { const r = await aprobarFila(f.id); if (r.ok) aprobadas++; }
    return exito({ aprobadas });
  } catch (err) { console.error("aprobarNuevos", err); return fallo(ERROR); }
}
```

(`corregirFila` con `nicho` fuera del formulario toma el de `datos`. Los campos del formulario de corrección son los mismos `COLUMNAS`.)

- [ ] **Step 4: verificar y commit** — `npm run test:db && npx tsc --noEmit`. Commit: `feat(buscar): bandeja de revision - lotes, dedup, aprobar/completar/descartar/corregir`.

---

### Task 5: Fuentes — Overpass con caché y cola, Maps, importar texto/archivo, plantilla, leer web

**Files:**
- Create: `src/lib/overpass.ts`, `src/lib/plantilla-importar.ts`, `src/acciones/buscar.ts`, `src/app/(panel)/buscar/plantilla/route.ts`, `tests/buscar.test.ts`, `tests/plantilla-importar.test.ts`
- Modify: `package.json` (`exceljs`)

**Interfaces:**
- Consumes: `descargar` (T3), `armarConsultaOverpass`, `prospectosDesdeOverpass`, `ciudadPorSlug`, `CIUDADES` (T2), `parsearTabla`, `validarFila`, `COLUMNAS` (T2), `extraerContactos`, `esUrlMaps`, `extraerFichaMaps` (T2), `crearLote` (T4), `exigirSesion`, `Resultado`.
- Produces (`overpass.ts`): `buscarEnOverpass(nichoId: number, slugCiudad: string, opts?: { descargar?: typeof descargar; ahora?: Date }): Promise<{ ok: true; entradas: EntradaValidada[]; desdeCache: boolean } | { ok: false; motivo: string }>` — caché `BusquedaOsm` 7 días; cola de UNA consulta a la vez en el proceso con 5 s entre consultas (promesa encadenada + `setTimeout`, timer `unref`); `POST https://overpass-api.de/api/interpreter` con `data=<QL>` (`application/x-www-form-urlencoded`), 60 s, 8 MB.
- Produces (`plantilla-importar.ts`): `generarPlantillaXlsx(): Promise<Buffer>` (hoja «Prospectos» con encabezados `COLUMNAS` + una fila de ejemplo; hoja «Cómo llenar» con una línea por columna), `generarPlantillaCsv(): string`, `leerXlsx(buf: Buffer): Promise<string>` → TSV (primera hoja, celdas como texto) para reutilizar `parsearTabla`.
- Produces (`acciones/buscar.ts`, todas con `exigirSesion`):
  - `buscarOverpass(formData)` (`nichoId`, `ciudad` slug) → `Resultado<{ lote: string; nuevos; repetidos; errores; desdeCache: boolean }>` (crea un lote `overpass`; si no hay resultados, `fallo("Overpass no devolvió negocios de ese nicho en esa ciudad.")`).
  - `cargarMaps(formData)` (`url`) → `Resultado<{ lote: string } | { manual: true; url: string }>` — resuelve cortos, descarga (10 s, 2 MB), `extraerFichaMaps`; si `null` → `exito({ manual: true, url })` para que la UI abra el alta a mano con la fuente puesta; si hay ficha → lote `maps` de una fila con `nicho` del formulario (`nichoId`) y fuente = URL final.
  - `importarTexto(formData)` (`texto`) y `importarArchivo(formData)` (`archivo` File `.xlsx`/`.csv`/`.txt`, máx. 5 MB) → `Resultado<{ lote; nuevos; repetidos; errores; desconocidas: string[] }>`.
  - `leerWebDeProspecto(prospectoId)` → `Resultado<{ sugerencias: { campo: "email" | "whatsapp" | "instagram" | "facebook" | "tiktok"; valor: string; fuente: string }[] }>` — solo campos vacíos del prospecto; deja `Evento nota` «Leí la web: N sugerencias».
  - `aplicarSugerencia(prospectoId, campo, valor, fuente)` → `Resultado` — solo si el campo sigue vacío (`updateMany` condicionado a `campo: ""`), agrega la fuente a `fuentes` y `fuentesPorCampo`, `Evento nota` «<campo> desde la web».
- `route.ts`: `GET /buscar/plantilla?formato=xlsx|csv` con sesión (redirige a `/entrar` sin ella), `content-disposition: attachment; filename="plantilla-prospectos.xlsx"`.

- [ ] **Step 1: instalar** — `npm i exceljs@^4.4.0 | tail -1` (y `@types` no hacen falta: exceljs trae tipos).

- [ ] **Step 2: tests**

```ts
// tests/plantilla-importar.test.ts
import { describe, it, expect } from "vitest";
import { generarPlantillaXlsx, generarPlantillaCsv, leerXlsx } from "@/lib/plantilla-importar";
import { parsearTabla, COLUMNAS } from "@/lib/tabla-contrato";

describe("plantilla", () => {
  it("el CSV trae las columnas en orden y una fila de ejemplo", () => {
    const csv = generarPlantillaCsv();
    expect(csv.split("\n")[0]).toBe(COLUMNAS.join(";"));
    expect(parsearTabla(csv).filas[0].nombre).toBeTruthy();
  });
  it("el xlsx se genera y se vuelve a leer como TSV", async () => {
    const buf = await generarPlantillaXlsx();
    expect(buf.length).toBeGreaterThan(2000);
    const tsv = await leerXlsx(buf);
    const r = parsearTabla(tsv);
    expect(r.desconocidas).toEqual([]);
    expect(r.filas[0]).toMatchObject({ nicho: "hoteles" });
  });
});
```

```ts
// tests/buscar.test.ts
import { vi } from "vitest";
vi.mock("@/lib/sesion", async () => {
  const { sesionFalsa } = await import("./ayuda-sesion");
  return {
    COOKIE_SESION: "pr_sesion", DIAS_SESION: 30,
    sesionActual: async () => sesionFalsa.actual,
    exigirSesion: async () => { if (!sesionFalsa.actual) throw new Error("REDIRECT:/entrar"); return sesionFalsa.actual; },
    exigirRol: async (rol: string) => { if (sesionFalsa.actual?.rol !== rol) throw new Error("REDIRECT:/hoy"); return sesionFalsa.actual; },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
// La red se simula: el modulo red-segura se reemplaza por una funcion controlada por cada test.
const red = { respuesta: async (url: string): Promise<{ ok: true; estado: number; urlFinal: string; texto: string } | { ok: false; motivo: string }> => ({ ok: false, motivo: "sin red en tests" }) };
vi.mock("@/lib/red-segura", () => ({ descargar: (url: string) => red.respuesta(url), esUrlPermitida: async (u: string) => ({ ok: true, url: new URL(u) }), USER_AGENT: "test" }));

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, crearProspectoDePrueba } from "./ayuda-db";
import { sesionFalsa } from "./ayuda-sesion";
import { buscarOverpass, cargarMaps, importarTexto, importarArchivo, leerWebDeProspecto, aplicarSugerencia } from "@/acciones/buscar";
import { generarPlantillaXlsx } from "@/lib/plantilla-importar";
import { loteConDetalle } from "@/lib/revision";

const fixture = (n: string) => readFileSync(path.join(import.meta.dirname, "fixtures", n), "utf8");
const fd = (o: Record<string, string | Blob>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe.runIf(DB_HABILITADA)("fuentes", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  beforeAll(async () => {
    await limpiarBase(); ids = await sembrarBasico();
    await prisma.nicho.update({ where: { id: ids.nichoId }, data: { etiquetaOsm: [["tourism", "hotel"]] } });
  });
  beforeEach(() => { sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" }; });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("buscarOverpass crea un lote desde la respuesta y la segunda vez sale de la cache", async () => {
    let llamadas = 0;
    red.respuesta = async () => { llamadas++; return { ok: true, estado: 200, urlFinal: "https://overpass-api.de/api/interpreter", texto: fixture("overpass.json") }; };
    const a = await buscarOverpass(fd({ nichoId: String(ids.nichoId), ciudad: "caracas" }));
    expect(a.ok).toBe(true);
    if (a.ok) { expect(a.datos.nuevos).toBe(2); expect(a.datos.desdeCache).toBe(false); }
    const b = await buscarOverpass(fd({ nichoId: String(ids.nichoId), ciudad: "caracas" }));
    expect(b.ok && b.datos.desdeCache).toBe(true);
    expect(llamadas).toBe(1);
    expect(await prisma.busquedaOsm.count()).toBe(1);
    const d = (await loteConDetalle((a as { datos: { lote: string } }).datos.lote))!;
    expect(d.origen).toBe("overpass");
    expect(d.filas[0].datos.fuentes?.[0]).toMatch(/openstreetmap\.org\/node\/1/);
  });

  it("buscarOverpass avisa cuando Overpass no responde y cuando la ciudad no existe", async () => {
    red.respuesta = async () => ({ ok: false, motivo: "Tiempo de espera agotado" });
    expect(await buscarOverpass(fd({ nichoId: String(ids.nichoId), ciudad: "valencia" }))).toEqual({ ok: false, mensaje: expect.stringContaining("Overpass") });
    expect((await buscarOverpass(fd({ nichoId: String(ids.nichoId), ciudad: "narnia" }))).ok).toBe(false);
  });

  it("cargarMaps lee la ficha y arma un lote de una fila; sin og:title ofrece carga manual", async () => {
    red.respuesta = async (url) => ({ ok: true, estado: 200, urlFinal: "https://www.google.com/maps/place/Hotel+Yare/", texto: url.includes("fail") ? "<html></html>" : fixture("maps-ficha.html") });
    const r = await cargarMaps(fd({ nichoId: String(ids.nichoId), url: "https://maps.app.goo.gl/AbCdEf" }));
    expect(r.ok).toBe(true);
    if (r.ok && "lote" in r.datos) {
      const d = (await loteConDetalle(r.datos.lote))!;
      expect(d.origen).toBe("maps");
      expect(d.filas[0].datos).toMatchObject({ nombre: "Hotel Yare", web: "https://www.hotelyare.com.ve/", nicho: "hoteles" });
      expect(d.filas[0].datos.fuentes?.[0]).toBe("https://www.google.com/maps/place/Hotel+Yare/");
      expect(d.filas[0].datos.ciudad).toBe("Caracas"); // de og:description, ultima parte
    } else throw new Error("esperaba lote");
    const m = await cargarMaps(fd({ nichoId: String(ids.nichoId), url: "https://www.google.com/maps/place/fail" }));
    expect(m.ok && "manual" in m.datos && m.datos.manual).toBe(true);
    expect((await cargarMaps(fd({ nichoId: String(ids.nichoId), url: "https://www.google.com/search?q=x" }))).ok).toBe(false);
  });

  it("importarTexto e importarArchivo (xlsx) crean lotes y reportan columnas desconocidas", async () => {
    const t = await importarTexto(fd({ texto: "nombre\tciudad\tnicho\tcolor\nHotel Pegado\tCaracas\thoteles\tazul\n" }));
    expect(t.ok).toBe(true);
    if (t.ok) { expect(t.datos.nuevos).toBe(1); expect(t.datos.desconocidas).toEqual(["color"]); }
    const buf = await generarPlantillaXlsx();
    const archivo = new File([buf], "plantilla.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = await importarArchivo(fd({ archivo }));
    expect(a.ok && a.datos.nuevos).toBe(1); // la fila de ejemplo
    expect((await importarTexto(fd({ texto: "" }))).ok).toBe(false);
  });

  it("leerWebDeProspecto sugiere solo campos vacios y aplicarSugerencia no pisa", async () => {
    const p = await crearProspectoDePrueba(ids.nichoId, { nombre: "Hotel Web", whatsapp: "584129999999", email: "", instagram: "", web: "https://hotelx.com.ve/" } as never);
    red.respuesta = async () => ({ ok: true, estado: 200, urlFinal: "https://hotelx.com.ve/", texto: fixture("web-negocio.html") });
    const r = await leerWebDeProspecto(p.id);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.datos.sugerencias.map((s) => s.campo)).toEqual(expect.arrayContaining(["email", "instagram"]));
      expect(r.datos.sugerencias.some((s) => s.campo === "whatsapp")).toBe(false); // ya lo tenia
      expect(r.datos.sugerencias[0].fuente).toBe("https://hotelx.com.ve/");
    }
    expect((await aplicarSugerencia(p.id, "email", "reservas@hotelx.com.ve", "https://hotelx.com.ve/")).ok).toBe(true);
    expect((await aplicarSugerencia(p.id, "email", "otro@x.com", "https://hotelx.com.ve/")).ok).toBe(false); // ya no esta vacio
    const d = await prisma.prospecto.findUniqueOrThrow({ where: { id: p.id } });
    expect(d.email).toBe("reservas@hotelx.com.ve");
    expect((d.fuentesPorCampo as Record<string, string>).email).toBe("https://hotelx.com.ve/");
    expect(d.fuentes).toContain("https://hotelx.com.ve/");
    const sinWeb = await crearProspectoDePrueba(ids.nichoId, { nombre: "Sin Web" });
    expect((await leerWebDeProspecto(sinWeb.id)).ok).toBe(false);
  });
});
```

(`crearProspectoDePrueba` de la pieza 1 no admite `web` ni `email` en su tipo `extra` — el test lo fuerza con `as never`; si molesta, ampliar el tipo del helper en `tests/ayuda-db.ts` para incluir `web`, `email`, `instagram`. `cargarMaps` deduce `ciudad` de la dirección: la última parte separada por coma que coincida con alguna `CIUDADES[].nombre`, o «Caracas» si el `og:description` contiene «Caracas»; si no deduce, `ciudad: ""` → la fila queda en error y se corrige en la bandeja.)

- [ ] **Step 3: `src/lib/overpass.ts`**

```ts
// src/lib/overpass.ts — Overpass con cache de 7 dias y UNA consulta a la vez (politica de uso de Overpass).
import { prisma } from "@/lib/db";
import { descargar as descargarReal } from "@/lib/red-segura";
import { armarConsultaOverpass, prospectosDesdeOverpass, ciudadPorSlug } from "@/lib/overpass-contrato";
import type { EntradaValidada } from "@/lib/tabla-contrato";

const ENDPOINT = "https://overpass-api.de/api/interpreter";
const CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const ESPERA_MS = 5000;
let cola: Promise<void> = Promise.resolve();
let ultimaConsulta = 0;

// Serializa: cada consulta espera a la anterior y deja 5 s entre una y otra.
function turno(): Promise<() => void> {
  return new Promise((resolver) => {
    const anterior = cola;
    let liberar!: () => void;
    cola = new Promise<void>((r) => { liberar = r; });
    anterior.then(() => {
      const falta = Math.max(0, ultimaConsulta + ESPERA_MS - Date.now());
      const t = setTimeout(() => resolver(() => { ultimaConsulta = Date.now(); liberar(); }), falta);
      t.unref();
    });
  });
}

export async function buscarEnOverpass(nichoId: number, slugCiudad: string, opts: { descargar?: typeof descargarReal; ahora?: Date } = {}): Promise<{ ok: true; entradas: EntradaValidada[]; desdeCache: boolean } | { ok: false; motivo: string }> {
  const ciudad = ciudadPorSlug(slugCiudad);
  if (!ciudad) return { ok: false, motivo: "Ciudad desconocida." };
  const nicho = await prisma.nicho.findUnique({ where: { id: nichoId }, select: { slug: true, etiquetaOsm: true } });
  if (!nicho) return { ok: false, motivo: "Nicho desconocido." };
  const etiquetas = (nicho.etiquetaOsm as [string, string][]) ?? [];
  if (!etiquetas.length) return { ok: false, motivo: "Ese nicho no tiene etiquetas de OpenStreetMap configuradas." };
  const ahora = opts.ahora ?? new Date();
  const cache = await prisma.busquedaOsm.findUnique({ where: { nichoId_area: { nichoId, area: ciudad.slug } } });
  if (cache && ahora.getTime() - cache.consultadoEn.getTime() < CACHE_MS) return { ok: true, entradas: cache.resultados as EntradaValidada[], desdeCache: true };
  const descargar = opts.descargar ?? descargarReal;
  const liberar = await turno();
  try {
    const r = await descargar(ENDPOINT, { metodo: "POST", cuerpo: "data=" + encodeURIComponent(armarConsultaOverpass(etiquetas, ciudad)), contentType: "application/x-www-form-urlencoded", timeoutMs: 60_000, maxBytes: 8 * 1024 * 1024 });
    if (!r.ok) return cache ? { ok: true, entradas: cache.resultados as EntradaValidada[], desdeCache: true } : { ok: false, motivo: `Overpass no respondió (${r.motivo}). Intenta en un rato.` };
    let json: unknown;
    try { json = JSON.parse(r.texto); } catch { return { ok: false, motivo: "Overpass devolvió una respuesta que no se pudo leer. Intenta en un rato." }; }
    const entradas = prospectosDesdeOverpass(json, ciudad, nicho.slug);
    await prisma.busquedaOsm.upsert({ where: { nichoId_area: { nichoId, area: ciudad.slug } }, update: { resultados: entradas as object[], consultadoEn: ahora }, create: { nichoId, area: ciudad.slug, resultados: entradas as object[], consultadoEn: ahora } });
    return { ok: true, entradas, desdeCache: false };
  } finally { liberar(); }
}
```

- [ ] **Step 4: `src/lib/plantilla-importar.ts`**

```ts
// src/lib/plantilla-importar.ts — plantilla Excel/CSV y lectura de xlsx a TSV.
import ExcelJS from "exceljs";
import { COLUMNAS } from "@/lib/tabla-contrato";

const EJEMPLO: Record<(typeof COLUMNAS)[number], string> = { nicho: "hoteles", nombre: "Hotel Ejemplo", ciudad: "Caracas", estado: "Distrito Capital", tipo: "hotel urbano", tamano: "20 hab.", telefono: "0212 555 12 34", whatsapp: "0412 555 12 34", email: "reservas@hotelejemplo.com", web: "https://hotelejemplo.com", instagram: "@hotelejemplo", facebook: "", tiktok: "", nota: "Solo lo que el negocio publica", fuente: "https://hotelejemplo.com/contacto" };
const AYUDA: Record<(typeof COLUMNAS)[number], string> = { nicho: "hoteles o farmacias (como esta en Ajustes)", nombre: "Obligatorio", ciudad: "Obligatorio", estado: "Estado de Venezuela", tipo: "Tipo de negocio, libre", tamano: "Ej. 20 hab.", telefono: "Fijo o celular, como lo publica el negocio", whatsapp: "Celular 0412/0414/0416/0424/0426/0422", email: "Correo publicado", web: "https://...", instagram: "@usuario o URL", facebook: "usuario o URL", tiktok: "@usuario o URL", nota: "Nota interna (nunca sale del panel)", fuente: "URL donde el negocio publica estos datos" };

export function generarPlantillaCsv(): string {
  return COLUMNAS.join(";") + "\n" + COLUMNAS.map((c) => EJEMPLO[c]).join(";") + "\n";
}

export async function generarPlantillaXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const hoja = wb.addWorksheet("Prospectos");
  hoja.addRow([...COLUMNAS]); hoja.addRow(COLUMNAS.map((c) => EJEMPLO[c]));
  hoja.getRow(1).font = { bold: true }; hoja.columns.forEach((col) => { col.width = 22; });
  const ayuda = wb.addWorksheet("Cómo llenar");
  ayuda.addRow(["Columna", "Qué va"]); ayuda.getRow(1).font = { bold: true };
  for (const c of COLUMNAS) ayuda.addRow([c, AYUDA[c]]);
  ayuda.getColumn(1).width = 14; ayuda.getColumn(2).width = 60;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

// Primera hoja a TSV, celdas como texto, para reutilizar parsearTabla.
export async function leerXlsx(buf: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const hoja = wb.worksheets[0];
  if (!hoja) return "";
  const lineas: string[] = [];
  hoja.eachRow((fila) => {
    const celdas: string[] = [];
    for (let i = 1; i <= fila.cellCount; i++) { const v = fila.getCell(i).value; celdas.push(v === null || v === undefined ? "" : typeof v === "object" && "text" in (v as object) ? String((v as { text: string }).text) : typeof v === "object" && "result" in (v as object) ? String((v as { result: unknown }).result ?? "") : String(v)); }
    lineas.push(celdas.map((c) => c.replace(/\t|\n/g, " ")).join("\t"));
  });
  return lineas.join("\n") + "\n";
}
```

- [ ] **Step 5: `src/acciones/buscar.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { exigirSesion } from "@/lib/sesion";
import { descargar } from "@/lib/red-segura";
import { buscarEnOverpass } from "@/lib/overpass";
import { parsearTabla, validarFila, COLUMNAS, type EntradaValidada } from "@/lib/tabla-contrato";
import { extraerContactos } from "@/lib/contactos-web-contrato";
import { esUrlMaps, extraerFichaMaps } from "@/lib/maps-contrato";
import { CIUDADES } from "@/lib/overpass-contrato";
import { leerXlsx } from "@/lib/plantilla-importar";
import { crearLote } from "@/lib/revision";
import { normalizarCelular } from "@/lib/celular-contrato";
import { fallo, exito, type Resultado } from "@/acciones/resultado";

// exigirSesion() FUERA del try/catch: buscar e importar lo hacen dueno y prospectador.
const ERROR = "No se pudo completar. Intenta de nuevo.";
const refrescar = () => revalidatePath("/buscar");
type Resumen = { lote: string; nuevos: number; repetidos: number; errores: number };

async function loteDesdeEntradas(origen: string, entradas: EntradaValidada[], erroresPorFila: string[][], usuarioId: number): Promise<Resumen> {
  const r = await crearLote(origen, entradas.map((entrada, i) => ({ entrada, errores: erroresPorFila[i] ?? [] })), usuarioId);
  refrescar();
  return r;
}

export async function buscarOverpass(formData: FormData): Promise<Resultado<Resumen & { desdeCache: boolean }>> {
  const u = await exigirSesion();
  const e = z.object({ nichoId: z.coerce.number().int().positive(), ciudad: z.string().regex(/^[a-z0-9-]+$/) }).safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("Elige nicho y ciudad.");
  try {
    const r = await buscarEnOverpass(e.data.nichoId, e.data.ciudad);
    if (!r.ok) return fallo(r.motivo);
    if (!r.entradas.length) return fallo("Overpass no devolvió negocios de ese nicho en esa ciudad.");
    const lote = await loteDesdeEntradas("overpass", r.entradas, [], u.id);
    return exito({ ...lote, desdeCache: r.desdeCache });
  } catch (err) { console.error("buscarOverpass", err); return fallo(ERROR); }
}

function ciudadDesdeDireccion(direccion: string): { ciudad: string; estado: string } {
  const partes = direccion.split(",").map((s) => s.trim());
  for (const p of partes.reverse()) { const c = CIUDADES.find((x) => x.nombre.toLowerCase().startsWith(p.toLowerCase().split(" ")[0]) && p.length > 3); if (c) return { ciudad: c.nombre, estado: c.estado }; }
  if (/caracas/i.test(direccion)) return { ciudad: "Caracas", estado: "Distrito Capital" };
  return { ciudad: "", estado: "" };
}

export async function cargarMaps(formData: FormData): Promise<Resultado<{ lote: string } | { manual: true; url: string }>> {
  const u = await exigirSesion();
  const e = z.object({ nichoId: z.coerce.number().int().positive(), url: z.string().trim().url().max(2000) }).safeParse(Object.fromEntries(formData));
  if (!e.success || !esUrlMaps(e.data.url)) return fallo("Pega un enlace de Google Maps (google.com/maps, maps.app.goo.gl…).");
  try {
    const nicho = await prisma.nicho.findUnique({ where: { id: e.data.nichoId }, select: { slug: true } });
    if (!nicho) return fallo("Nicho desconocido.");
    // Una sola ficha, una sola descarga (los cortos se resuelven siguiendo la redireccion).
    const r = await descargar(e.data.url, { timeoutMs: 10_000, maxBytes: 2 * 1024 * 1024 });
    if (!r.ok) return fallo(`No se pudo leer el enlace (${r.motivo}).`);
    const ficha = extraerFichaMaps(r.texto);
    if (!ficha) return exito({ manual: true, url: r.urlFinal });
    const { ciudad, estado } = ciudadDesdeDireccion(ficha.direccion);
    const fuente = r.urlFinal;
    const entrada: EntradaValidada = { nicho: nicho.slug, nombre: ficha.nombre, ciudad, estado, tipo: "", tamano: "", telefono: ficha.telefono, whatsapp: normalizarCelular(ficha.telefono), email: "", web: ficha.web, instagram: "", facebook: "", tiktok: "", nota: ficha.direccion ? `Dirección: ${ficha.direccion}` : "", fuentes: [fuente], fuentesPorCampo: {} };
    for (const k of ["nombre", "ciudad", "telefono", "whatsapp", "web"] as const) if (entrada[k]) entrada.fuentesPorCampo[k] = fuente;
    const errores = ciudad ? [] : ["Falta la ciudad"];
    const lote = await loteDesdeEntradas("maps", [entrada], [errores], u.id);
    return exito({ lote: lote.lote });
  } catch (err) { console.error("cargarMaps", err); return fallo(ERROR); }
}

async function importarDesdeTexto(texto: string, usuarioId: number): Promise<Resultado<Resumen & { desconocidas: string[] }>> {
  const t = parsearTabla(texto);
  if (t.error) return fallo(t.error);
  const validadas = t.filas.map(validarFila);
  const lote = await loteDesdeEntradas("importado", validadas.map((v) => v.entrada), validadas.map((v) => v.errores), usuarioId);
  return exito({ ...lote, desconocidas: t.desconocidas });
}

export async function importarTexto(formData: FormData): Promise<Resultado<Resumen & { desconocidas: string[] }>> {
  const u = await exigirSesion();
  const e = z.object({ texto: z.string().max(2_000_000) }).safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("El texto es demasiado grande.");
  try { return await importarDesdeTexto(e.data.texto, u.id); } catch (err) { console.error("importarTexto", err); return fallo(ERROR); }
}

export async function importarArchivo(formData: FormData): Promise<Resultado<Resumen & { desconocidas: string[] }>> {
  const u = await exigirSesion();
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return fallo("Sube un archivo .xlsx, .csv o .txt.");
  if (archivo.size > 5 * 1024 * 1024) return fallo("El archivo pesa más de 5 MB: pártelo.");
  try {
    const buf = Buffer.from(await archivo.arrayBuffer());
    const esXlsx = archivo.name.toLowerCase().endsWith(".xlsx") || buf.subarray(0, 2).toString("binary") === "PK";
    const texto = esXlsx ? await leerXlsx(buf) : buf.toString("utf8").replace(/^﻿/, "");
    return await importarDesdeTexto(texto, u.id);
  } catch (err) { console.error("importarArchivo", err); return fallo("No se pudo leer el archivo. ¿Es un .xlsx o .csv válido?"); }
}

const CAMPOS_WEB = ["email", "whatsapp", "instagram", "facebook", "tiktok"] as const;
type CampoWeb = (typeof CAMPOS_WEB)[number];

export async function leerWebDeProspecto(prospectoId: number): Promise<Resultado<{ sugerencias: { campo: CampoWeb; valor: string; fuente: string }[] }>> {
  const u = await exigirSesion();
  const e = z.number().int().positive().safeParse(prospectoId);
  if (!e.success) return fallo(ERROR);
  try {
    const p = await prisma.prospecto.findUnique({ where: { id: e.data }, select: { web: true, email: true, whatsapp: true, instagram: true, facebook: true, tiktok: true } });
    if (!p) return fallo("Ese prospecto no existe.");
    if (!p.web) return fallo("Este prospecto no tiene web cargada.");
    const url = /^https?:\/\//i.test(p.web) ? p.web : `https://${p.web}`;
    const r = await descargar(url, { timeoutMs: 10_000, maxBytes: 2 * 1024 * 1024 });
    if (!r.ok) return fallo(`No se pudo leer la web (${r.motivo}).`);
    const c = extraerContactos(r.texto, r.urlFinal);
    const sugerencias: { campo: CampoWeb; valor: string; fuente: string }[] = [];
    const agregar = (campo: CampoWeb, valores: string[]) => { if (!p[campo]) for (const v of valores) sugerencias.push({ campo, valor: v, fuente: r.urlFinal }); };
    agregar("email", c.emails); agregar("whatsapp", c.celulares); agregar("instagram", c.instagram); agregar("facebook", c.facebook); agregar("tiktok", c.tiktok);
    await prisma.evento.create({ data: { prospectoId: e.data, usuarioId: u.id, tipo: "nota", texto: `Leí la web: ${sugerencias.length} sugerencia(s)` } });
    return exito({ sugerencias });
  } catch (err) { console.error("leerWebDeProspecto", err); return fallo(ERROR); }
}

export async function aplicarSugerencia(prospectoId: number, campo: string, valor: string, fuente: string): Promise<Resultado> {
  const u = await exigirSesion();
  const e = z.object({ id: z.number().int().positive(), campo: z.enum(CAMPOS_WEB), valor: z.string().trim().min(3).max(200), fuente: z.string().url().max(2000) }).safeParse({ id: prospectoId, campo, valor, fuente });
  if (!e.success) return fallo("Sugerencia inválida.");
  const d = e.data;
  const v = d.campo === "whatsapp" ? normalizarCelular(d.valor) : d.valor;
  if (!v) return fallo("Ese celular no tiene formato venezolano.");
  try {
    const p = await prisma.prospecto.findUnique({ where: { id: d.id }, select: { fuentes: true, fuentesPorCampo: true } });
    if (!p) return fallo("Ese prospecto no existe.");
    const fuentes = [...new Set([...((p.fuentes as string[]) ?? []), d.fuente])];
    const fpc = { ...((p.fuentesPorCampo as Record<string, string>) ?? {}), [d.campo]: d.fuente };
    const r = await prisma.$transaction(async (tx) => {
      const t = await tx.prospecto.updateMany({ where: { id: d.id, [d.campo]: "" }, data: { [d.campo]: v, fuentes, fuentesPorCampo: fpc } });
      if (t.count === 1) await tx.evento.create({ data: { prospectoId: d.id, usuarioId: u.id, tipo: "nota", texto: `${d.campo} desde la web: ${v}` } });
      return t.count;
    });
    if (r === 0) return fallo("Ese campo ya tiene un dato: no se pisa.");
    revalidatePath(`/prospectos/${d.id}`);
    return exito();
  } catch (err) { console.error("aplicarSugerencia", err); return fallo(ERROR); }
}
```

Y la ruta de la plantilla:

```ts
// src/app/(panel)/buscar/plantilla/route.ts
import { redirect } from "next/navigation";
import { sesionActual } from "@/lib/sesion";
import { generarPlantillaXlsx, generarPlantillaCsv } from "@/lib/plantilla-importar";

export async function GET(req: Request) {
  if (!(await sesionActual())) redirect("/entrar");
  const formato = new URL(req.url).searchParams.get("formato") === "csv" ? "csv" : "xlsx";
  if (formato === "csv") return new Response("﻿" + generarPlantillaCsv(), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="plantilla-prospectos.csv"' } });
  const buf = await generarPlantillaXlsx();
  return new Response(new Uint8Array(buf), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": 'attachment; filename="plantilla-prospectos.xlsx"' } });
}
```

- [ ] **Step 6: verificar y commit** — `npm test && npm run test:db && npx tsc --noEmit`. Commit: `feat(buscar): Overpass con cache y cola, Maps de una ficha, importar texto/xlsx/csv, plantilla y leer web`.

---

### Task 6: Pantallas — `/buscar` con los cuatro caminos y la bandeja, Leer web en la ficha, PWA con compartir

**Files:**
- Create: `src/app/(panel)/buscar/page.tsx`, `src/app/manifest.ts`, `src/componentes/Bandeja.tsx`, `src/componentes/FormOverpass.tsx`, `src/componentes/FormMaps.tsx`, `src/componentes/FormImportar.tsx`, `src/componentes/SugerenciasWeb.tsx`
- Modify: `src/componentes/BarraInferior.tsx` (Buscar deja de ser «pronto», visible para ambos roles), `src/app/(panel)/prospectos/[id]/page.tsx` (botón Leer web + fuentes por campo), `src/app/globals.css`, `src/app/(panel)/prospectos/nuevo/page.tsx` y `src/componentes/FormularioNuevo.tsx` (aceptar `?fuente=&nombre=&web=&telefono=&nota=` prellenados desde «cargar a mano» de Maps)

**Interfaces:**
- Consumes: todo lo de T2–T5. Pestañas por `?t=osm|maps|importar|bandeja` (server-rendered); un lote se abre con `?t=bandeja&lote=<uuid>`.
- Produces: pantallas navegables a 390 px. Ningún componente cliente importa `@/lib/db`.

- [ ] **Step 1: `/buscar`**

```tsx
// src/app/(panel)/buscar/page.tsx
import Link from "next/link";
import { exigirSesion } from "@/lib/sesion";
import { listarNichos } from "@/lib/prospectos";
import { lotesRecientes, loteConDetalle } from "@/lib/revision";
import { CIUDADES } from "@/lib/overpass-contrato";
import { Pestanas } from "@/componentes/Pestanas";
import { FormOverpass } from "@/componentes/FormOverpass";
import { FormMaps } from "@/componentes/FormMaps";
import { FormImportar } from "@/componentes/FormImportar";
import { Bandeja } from "@/componentes/Bandeja";

export const dynamic = "force-dynamic";
const PESTANAS = [{ clave: "osm", texto: "Mapa (OSM)" }, { clave: "maps", texto: "Google Maps" }, { clave: "importar", texto: "Pegar / subir" }, { clave: "bandeja", texto: "Bandeja" }];

export default async function Buscar({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await exigirSesion();
  const sp = await searchParams;
  const t = PESTANAS.some((p) => p.clave === sp.t) ? sp.t! : sp.url ? "maps" : "bandeja";
  const [nichos, lotes, lote] = await Promise.all([listarNichos(), lotesRecientes(), sp.lote ? loteConDetalle(sp.lote) : null]);
  return (
    <>
      <h1 className="titulo">Buscar prospectos</h1>
      <p className="suave">Solo datos que el negocio publicó, cada uno con su fuente. Nada entra sin que lo apruebes en la bandeja.</p>
      <Pestanas base="/buscar" activa={t} items={PESTANAS} />
      {t === "osm" && <FormOverpass nichos={nichos} ciudades={CIUDADES.map((c) => ({ slug: c.slug, nombre: c.nombre }))} />}
      {t === "maps" && <FormMaps nichos={nichos} urlInicial={sp.url ?? sp.text ?? ""} />}
      {t === "importar" && <FormImportar />}
      {t === "bandeja" && (
        lote ? <Bandeja lote={lote} /> : (
          <section className="tarjeta">
            <b>Lotes recientes</b>
            {lotes.length === 0 && <p className="suave">Todavía no hay lotes. Busca en el mapa, pega un enlace de Maps o importa un archivo.</p>}
            {lotes.map((l) => <Link key={l.lote} href={`/buscar?t=bandeja&lote=${l.lote}`} className="fila"><span><b>{l.origen}</b> · {l.creadoEn.toLocaleString("es-VE", { timeZone: "America/Caracas" })}</span><span className="etiqueta">{l.pendientes} de {l.total} por decidir</span></Link>)}
          </section>
        )
      )}
    </>
  );
}
```

- [ ] **Step 2: formularios de los caminos**

```tsx
// src/componentes/FormOverpass.tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buscarOverpass } from "@/acciones/buscar";

export function FormOverpass({ nichos, ciudades }: { nichos: { id: number; nombre: string }[]; ciudades: { slug: string; nombre: string }[] }) {
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
  return (
    <form className="tarjeta" action={(fd) => empezar(async () => { const r = await buscarOverpass(fd); if (r.ok) router.push(`/buscar?t=bandeja&lote=${r.datos.lote}`); else setError(r.mensaje); })}>
      <p className="suave">Busca negocios del nicho en OpenStreetMap (datos abiertos). Trae nombre, dirección y, cuando existen, teléfono, web e Instagram. Una ciudad por vez; el resultado se guarda 7 días.</p>
      <label className="campo"><span>Nicho</span><select name="nichoId">{nichos.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}</select></label>
      <label className="campo"><span>Ciudad</span><select name="ciudad">{ciudades.map((c) => <option key={c.slug} value={c.slug}>{c.nombre}</option>)}</select></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="boton boton--primario" disabled={pendiente}>{pendiente ? "Buscando… (puede tardar un minuto)" : "Buscar en el mapa"}</button>
    </form>
  );
}
```

```tsx
// src/componentes/FormMaps.tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cargarMaps } from "@/acciones/buscar";

export function FormMaps({ nichos, urlInicial }: { nichos: { id: number; nombre: string }[]; urlInicial: string }) {
  const [error, setError] = useState("");
  const [manual, setManual] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
  return (
    <form className="tarjeta" action={(fd) => empezar(async () => {
      const r = await cargarMaps(fd);
      if (!r.ok) return setError(r.mensaje);
      if ("manual" in r.datos) setManual(r.datos.url); else router.push(`/buscar?t=bandeja&lote=${r.datos.lote}`);
    })}>
      <p className="suave">Pega el enlace de <b>una</b> ficha de Google Maps (o compártela desde el teléfono a esta app). Se lee esa ficha y nada más.</p>
      <label className="campo"><span>Nicho</span><select name="nichoId">{nichos.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}</select></label>
      <label className="campo"><span>Enlace de Google Maps</span><input name="url" type="url" defaultValue={urlInicial} placeholder="https://maps.app.goo.gl/…" required /></label>
      {error && <p className="error" role="alert">{error}</p>}
      {manual && <p className="pregunta">No se pudo leer la ficha (Google cambia el formato seguido). <a className="boton mini" href={`/prospectos/nuevo?fuente=${encodeURIComponent(manual)}`}>Cargarlo a mano con el enlace como fuente</a></p>}
      <button className="boton boton--primario" disabled={pendiente}>{pendiente ? "Leyendo…" : "Leer la ficha"}</button>
    </form>
  );
}
```

```tsx
// src/componentes/FormImportar.tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importarTexto, importarArchivo } from "@/acciones/buscar";

export function FormImportar() {
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
  const ir = (r: { ok: true; datos: { lote: string; desconocidas: string[] } } | { ok: false; mensaje: string }) => {
    if (!r.ok) return setError(r.mensaje);
    if (r.datos.desconocidas.length) setAviso(`Columnas ignoradas: ${r.datos.desconocidas.join(", ")}`);
    router.push(`/buscar?t=bandeja&lote=${r.datos.lote}`);
  };
  return (
    <>
      <section className="tarjeta">
        <b>Plantilla</b>
        <p className="suave">Descárgala, llénala con datos que el negocio publica (y de dónde), y súbela.</p>
        <div className="fila-botones"><a className="boton" href="/buscar/plantilla?formato=xlsx">Excel (.xlsx)</a><a className="boton" href="/buscar/plantilla?formato=csv">CSV</a></div>
      </section>
      <form className="tarjeta" action={(fd) => empezar(async () => ir(await importarArchivo(fd)))}>
        <b>Subir archivo</b>
        <label className="campo"><span>.xlsx, .csv o .txt (máx. 5 MB, 5.000 filas)</span><input name="archivo" type="file" accept=".xlsx,.csv,.txt,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required /></label>
        <button className="boton boton--primario" disabled={pendiente}>Subir</button>
      </form>
      <form className="tarjeta" action={(fd) => empezar(async () => ir(await importarTexto(fd)))}>
        <b>O pega filas desde Excel</b>
        <label className="campo"><span>Primera fila = encabezados (nombre, ciudad, nicho, …)</span><textarea name="texto" rows={6} placeholder={"nombre\tciudad\tnicho\twhatsapp\nHotel X\tCaracas\thoteles\t0412 555 12 34"} /></label>
        <button className="boton boton--primario" disabled={pendiente}>Revisar</button>
      </form>
      {aviso && <p className="suave">{aviso}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}
```

- [ ] **Step 3: la bandeja**

```tsx
// src/componentes/Bandeja.tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FilaRevision } from "@/lib/revision";
import { COLUMNAS } from "@/lib/tabla-contrato";
import { aprobarFila, completarExistente, descartarFila, corregirFila, aprobarNuevos } from "@/acciones/revision";

const ETIQUETA: Record<string, string> = { nuevo: "Nuevo", repetido: "Repetido", error: "Error", pendiente: "Por decidir", aprobado: "Aprobado", completado: "Completado", descartado: "Descartado" };
const CAMPOS_MOSTRAR = ["telefono", "whatsapp", "email", "web", "instagram", "facebook", "tiktok"] as const;

export function Bandeja({ lote }: { lote: { lote: string; origen: string; creadoEn: Date; filas: FilaRevision[] } }) {
  const [editando, setEditando] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
  const correr = (fn: () => Promise<{ ok: boolean; mensaje?: string }>) => empezar(async () => { const r = await fn(); if (r.ok) { setError(""); setEditando(null); router.refresh(); } else setError(r.mensaje ?? "Error"); });
  const pendientes = lote.filas.filter((f) => f.decision === "pendiente");
  const nuevos = pendientes.filter((f) => f.estado === "nuevo").length;
  return (
    <>
      <section className="tarjeta">
        <b>Lote {lote.origen}</b> <span className="suave">· {lote.filas.length} filas · {pendientes.length} por decidir</span>
        <div className="fila-botones">
          {nuevos > 0 && <button className="boton boton--primario" disabled={pendiente} onClick={() => correr(() => aprobarNuevos(lote.lote))}>Aprobar los {nuevos} nuevos</button>}
          <a className="boton" href="/buscar?t=bandeja">Otros lotes</a>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
      </section>
      {lote.filas.map((f) => (
        <article key={f.id} className="tarjeta">
          <div className="fila" style={{ border: 0, padding: 0 }}>
            <span><b>{f.datos.nombre || "(sin nombre)"}</b><br /><span className="suave">{f.datos.ciudad || "(sin ciudad)"} · {f.datos.nicho}</span></span>
            <span><span className={`etiqueta etiqueta--${f.estado}`}>{ETIQUETA[f.estado]}</span> <span className="etiqueta">{ETIQUETA[f.decision]}</span></span>
          </div>
          {f.errores.length > 0 && <p className="error">{f.errores.join(" · ")}</p>}
          <p className="suave">{CAMPOS_MOSTRAR.filter((c) => f.datos[c]).map((c) => `${c}: ${f.datos[c]}`).join(" · ") || "sin contacto"}</p>
          {f.datos.fuentes?.[0] && <p className="suave">Fuente: <a href={f.datos.fuentes[0]} target="_blank" rel="noopener">{f.datos.fuentes[0]}</a></p>}
          {f.existente && (
            <p className="pregunta">Ya existe: <b>{f.existente.nombre}</b> ({f.existente.ciudad}). Le falta: {CAMPOS_MOSTRAR.filter((c) => !f.existente![c] && f.datos[c]).join(", ") || "nada que completar"}.</p>
          )}
          {f.decision === "pendiente" && editando !== f.id && (
            <div className="fila-botones">
              {f.estado === "nuevo" && <button className="boton mini boton--primario" disabled={pendiente} onClick={() => correr(() => aprobarFila(f.id))}>Aprobar</button>}
              {f.estado === "repetido" && f.existenteId && <button className="boton mini boton--primario" disabled={pendiente} onClick={() => correr(() => completarExistente(f.id))}>Completar el existente</button>}
              <button className="boton mini" onClick={() => setEditando(f.id)}>Corregir</button>
              <button className="boton mini boton--peligro" disabled={pendiente} onClick={() => correr(() => descartarFila(f.id))}>Descartar</button>
            </div>
          )}
          {editando === f.id && (
            <form className="pregunta" action={(fd) => correr(() => corregirFila(f.id, fd))}>
              {COLUMNAS.filter((c) => c !== "nicho").map((c) => <label key={c} className="campo"><span>{c}</span><input name={c} defaultValue={c === "fuente" ? (f.datos.fuentes?.[0] ?? "") : String(f.datos[c] ?? "")} /></label>)}
              <div className="fila-botones"><button className="boton boton--primario" disabled={pendiente}>Guardar y revalidar</button><button type="button" className="boton" onClick={() => setEditando(null)}>Cancelar</button></div>
            </form>
          )}
        </article>
      ))}
    </>
  );
}
```

CSS: `.etiqueta--nuevo { background: #23413a; color: var(--verde); } .etiqueta--repetido { background: #3b3520; color: var(--ambar); } .etiqueta--error { background: #3b2424; color: var(--rojo); }`.

- [ ] **Step 4: Leer web en la ficha + fuentes por campo**

```tsx
// src/componentes/SugerenciasWeb.tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { leerWebDeProspecto, aplicarSugerencia } from "@/acciones/buscar";

type S = { campo: string; valor: string; fuente: string };
export function SugerenciasWeb({ prospectoId, tieneWeb }: { prospectoId: number; tieneWeb: boolean }) {
  const [sug, setSug] = useState<S[] | null>(null);
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
  if (!tieneWeb) return null;
  return (
    <section className="tarjeta">
      <div className="fila-botones">
        <button className="boton" disabled={pendiente} onClick={() => empezar(async () => { const r = await leerWebDeProspecto(prospectoId); if (r.ok) setSug(r.datos.sugerencias); else setError(r.mensaje); })}>{pendiente ? "Leyendo la web…" : "Leer web"}</button>
      </div>
      {sug && sug.length === 0 && <p className="suave">La web no publica nada que falte aquí.</p>}
      {sug?.map((s, i) => (
        <div key={i} className="fila"><span><b>{s.campo}</b>: {s.valor}<br /><span className="suave">{s.fuente}</span></span>
          <button className="boton mini boton--primario" disabled={pendiente} onClick={() => empezar(async () => { const r = await aplicarSugerencia(prospectoId, s.campo, s.valor, s.fuente); if (r.ok) { setSug((x) => x?.filter((_, j) => j !== i) ?? null); router.refresh(); } else setError(r.mensaje); })}>Confirmar</button></div>
      ))}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
```

En `src/app/(panel)/prospectos/[id]/page.tsx`: renderizar `<SugerenciasWeb prospectoId={p.id} tieneWeb={!!p.web} />` debajo del bloque de contacto, y al lado de cada dato de contacto, si `fuentesPorCampo[campo]` existe, un enlace `↗` a esa URL (agregar `fuentesPorCampo` al `select` de `fichaProspecto` en `src/lib/prospectos.ts` y al tipo devuelto). En `FormularioNuevo.tsx`: leer `useSearchParams()` (o recibir `valoresIniciales` desde la página) para prellenar `fuente`, `nombre`, `web`, `telefono`, `nota` cuando vienen en la URL.

- [ ] **Step 5: PWA mínima con compartir**

```ts
// src/app/manifest.ts — para que el panel aparezca en "Compartir" de Android y reciba un enlace de Maps.
import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Prospectos NERACOSU", short_name: "Prospectos", start_url: "/hoy", display: "standalone", background_color: "#0f1412", theme_color: "#5ed29c",
    icons: [{ src: "/icono.svg", sizes: "any", type: "image/svg+xml" }],
    // Web Share Target por GET: el enlace compartido llega en ?url= (o ?text= en algunas apps)
    share_target: { action: "/buscar", method: "GET", params: { url: "url", text: "text", title: "title" } },
  } as MetadataRoute.Manifest;
}
```

Crear `public/icono.svg` (círculo verde `#5ed29c` con una «N» blanca, 64×64). En `src/app/layout.tsx` agregar `manifest: "/manifest.webmanifest"` a `metadata`. El `.htaccess` ya proxya todo a Next, así que `/manifest.webmanifest` y `/icono.svg` salen de Next sin tocar Apache.

- [ ] **Step 6: barra** — `BarraInferior.tsx`: quitar `pronto: true` de Buscar (ambos roles lo ven).

- [ ] **Step 7: verificar en el navegador a 390 px** — `next dev` en el puerto **3014** con `DATABASE_URL="$TEST_DATABASE_URL"` (nunca la base real desde el navegador), sembrar con `sembrarBasico()` + un prospecto con `web`, PIN `123456`. Con Playwright: `/buscar` en las cuatro pestañas; pegar una tabla de 3 filas (una nueva, una repetida del sembrado, una sin ciudad) → bandeja con los tres estados; corregir la de error; aprobar los nuevos; completar la repetida; `/buscar/plantilla?formato=xlsx` responde `200` con `content-disposition`; la ficha del prospecto con web muestra «Leer web» (sin red en dev no hace falta pulsarlo). Capturas a `capturas/p2-*.png`; mirarlas; corregir lo que se corte. Cerrar el dev server (`pkill -f "next dev -p 3014"`) y `limpiarBase()` en la base de tests.

- [ ] **Step 8: Commit** — `feat(buscar): pantalla de busqueda con cuatro caminos y bandeja, leer web en la ficha, PWA con compartir`.

---

### Task 7: Despliegue y recorrido de punta a punta

**Files:**
- Create: `scripts/verificar-flujo-buscar.mts`
- Modify: `CLAUDE.md`, `docs/superpowers/specs/2026-09-16-buscador-importacion-design.md` (estado + desviación de la clave)

**Solo desde la sesión principal.**

- [ ] **Step 1: build y reinicio**

```bash
ps aux | grep -c '[n]ext build'   # 0
pm2 list | grep prospectos         # online, anotar el contador
set -a; . /home/neracosu/.config/prospectos/env; set +a
npx prisma generate | tail -1 && npx prisma migrate deploy | tail -1   # "No pending migrations" (T1 ya migro)
npm run build 2>&1 | tail -25      # rutas nuevas: /buscar, /buscar/plantilla, /manifest.webmanifest
pm2 restart prospectos && sleep 6 && pm2 list | grep prospectos   # online, contador +1
pm2 logs prospectos --lines 30 --nostream | grep -E "mensualidades|Error" | tail -3
for r in /entrar /buscar /manifest.webmanifest /icono.svg; do printf '%-24s %s\n' $r "$(curl -s -o /dev/null -w '%{http_code}' https://prospectos.neracosu.com$r)"; done
# /entrar 200, /buscar 307 (sin sesion), manifest 200, icono 200
```

- [ ] **Step 2: recorrido real** (`scripts/verificar-flujo-buscar.mts`, misma forma que `verificar-flujo-proyectos.mts`: PIN por stdin, 390×844, contra `BASE_URL`): entrar; `/buscar?t=importar`; pegar `nombre\tciudad\tnicho\twhatsapp\nHotel (PRUEBA) <ts>\tCaracas\thoteles\t0412 000 00 00\nHotel Yare\tCaracas (Sabana Grande)\thoteles\t\nSin Ciudad (PRUEBA)\t\thoteles\t` → esperar la bandeja → comprobar tres etiquetas (Nuevo, Repetido, Error) → **Corregir** la de error con ciudad «Mérida» → **Aprobar los nuevos** → comprobar en la base 2 prospectos `(PRUEBA)` con `origen: "importado"` y su `Evento importado` → descartar la repetida (Hotel Yare **no** debe cambiar) → captura de cada paso → **limpieza**: borrar los prospectos `(PRUEBA)` con sus eventos y las filas `Revision` del lote. Además `page.request.get(/buscar/plantilla?formato=xlsx)` → 200 y `content-type` de xlsx. Expected: `PASS`.

- [ ] **Step 3: docs, `pm2 save`, commit** — `CLAUDE.md`: pieza 2 en producción, `/buscar` y `/buscar/plantilla`, PWA/manifest, regla «nada entra sin bandeja», Overpass 1 a la vez/5 s/caché 7 días, red segura (toda descarga por `red-segura.ts`), siguiente = pieza 4. Spec: `**Estado:** implementada…` y la nota de que la clave de duplicado es la de la pieza 1 (sin quitar «hotel/farmacia/posada»). `pm2 list` (cinco `online`) → `pm2 save`. Commit `feat(buscar): despliegue de la pieza 2 y recorrido de punta a punta`.

Al terminar, avisar a Neri: para que «Compartir» desde Google Maps muestre el panel, tiene que **instalar la app** desde Chrome (menú → «Agregar a pantalla principal») una vez.

---

## Fuera de este plan

API de Places, búsquedas masivas en Google, adivinar redes por nombre, lectura de PDF/imágenes, geolocalización por mapa, recibos (pieza 4), portal (pieza 5).
