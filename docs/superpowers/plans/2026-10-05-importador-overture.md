# Importador de Overture Maps (Venezuela) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que en `/buscar?t=osm` Neri elija nicho y ciudad, toque «Buscar en el directorio abierto» y reciba al
instante en la bandeja un lote con teléfono, WhatsApp, correo, web y Facebook sacados de Overture Maps.

**Architecture:** una tabla `LugarOverture` que se llena a mano con dos scripts (Python con `duckdb` extrae de S3 a
JSONL; un `.mts` valida y reemplaza la tabla en una transacción). El panel nunca sale a internet: la acción
`buscarOverture` lee la tabla por caja geográfica y categoría, y un contrato puro (`overture-contrato.ts`) decide a
qué nicho y a qué ciudad pertenece cada lugar y lo convierte en `EntradaValidada`. De ahí en adelante es la bandeja
de siempre (`crearLote`).

**Tech Stack:** Next 15.5, React 19, Prisma + MariaDB, zod, Vitest, Playwright; Python 3.10 + `duckdb` (solo para
extraer).

**Spec:** `docs/superpowers/specs/2026-10-05-importador-overture-design.md`

## Global Constraints

- **Se trabaja en el clon `~/dev-clon-prospectos`, rama `overture`** (sale de `main` del docroot, que es el `origin`
  del clon). En el docroot no se edita, no se corre `next dev` ni `next build`. Nada se fusiona ni se despliega sin
  el ok de Neri (Task 6).
- **Migraciones solo con `prisma migrate deploy`**; nunca `migrate dev` ni `db push`. La migración se escribe a mano
  y su sello es `20261005120000` (posterior a `20260919090000`). **Sin columnas `Json`** en la tabla nueva.
- **Tests contra `neracosu_prospectos_test`**, nunca contra la base real. `npm test` (pura) y `npm run test:db`
  (con base) antes de cada commit de tarea.
- `src/lib/overture.ts` y `src/lib/overture-contrato.ts` **no se importan desde la cadena de
  `src/instrumentation.ts`** (lo vigila `tests/instrumentation-grafo.test.ts`).
- **Ninguna petición saliente desde el panel.** La única salida a internet es `scripts/extraer-overture.py`, a mano.
- **Solo Venezuela, confianza ≥ 0,7.** Un lugar sin página de Facebook ni web no entra. El móvil va a `whatsapp`
  con `normalizarCelular`, igual que Overpass.
- Textos visibles en español (Venezuela), tuteo como el resto del panel; comentarios en el código sin acentos.
- **No escribir secuencias de escape unicode como texto** (barra invertida, `u`, cuatro dígitos): las herramientas
  las decodifican y quedan bytes crudos. Para caracteres de control se usa `\p{Cc}` con la bandera `u`.
- Commits por heredoc (`git commit -F -`), terminados en `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Un build a la vez en todo el servidor y nunca desde un subagente (los subagentes verifican con `npx tsc --noEmit`).
  Procesos: matar solo por PID.
- **Nunca un heredoc dentro de otro** al armar un comando: el primer terminador corta el de afuera y el shell
  ejecuta el resto del texto como órdenes (pasó al escribir este plan). Los archivos auxiliares se crean con la
  herramienta de escritura.
- Secretos: el env se carga con `set -a; . ~/.config/prospectos/env; set +a` dentro de un subshell; nunca en la
  línea de comandos.

## Review Focus

1. **Un negocio en el solape de dos ciudades** (Valencia y Guacara, Caracas y La Guaira): entra en una sola, la de
   centro más cercano. Test en Task 1.
2. **El mismo negocio dos veces en Overture** (dos ids, mismo nombre, misma ciudad): una fila nueva y la otra
   «Repetido en el mismo archivo», no dos prospectos. Test en Task 3.
3. **Tocar el botón dos veces con el mismo nicho y ciudad**: el segundo lote no trae nada nuevo que aprobar. Test en
   Task 3.
4. **Archivo de carga cortado o con renglones rotos**: se cuentan y se saltan; si quedan menos de la mitad de las
   filas que ya hay, no se reemplaza nada. Tests en Task 1 y Task 2.
5. **Datos sucios de la fuente**: teléfono fijo (no va a WhatsApp), correo de intermediario, nombre con saltos de
   línea o de más de 191 caracteres, web de más de 191 caracteres. Tests en Task 1.

---

### Task 0: Preparar el clon

**Files:** ninguno.

- [ ] **Step 1: Poner el clon al día y crear la rama**

```bash
git -C ~/dev-clon-prospectos status --short | head -5
git -C ~/dev-clon-prospectos fetch origin
git -C ~/dev-clon-prospectos checkout -B overture origin/main
git -C ~/dev-clon-prospectos log --oneline -1
```

Expected: el último commit es el del plan (`docs(plan): importador de Overture…`). Si `status` mostró cambios sin
guardar, parar y avisar: no se pisan.

- [ ] **Step 2: Dependencias y línea base**

```bash
cd ~/dev-clon-prospectos
npm ci 2>&1 | tail -2
npx prisma generate | tail -1
npx tsc --noEmit && echo TSC_OK
npm test 2>&1 | tail -4
npm run test:db 2>&1 | tail -4
```

Expected: `TSC_OK`; las dos suites en verde. Anotar los totales: son la línea base.

---

### Task 1: El contrato puro

**Files:**
- Create: `src/lib/overture-contrato.ts`
- Test: `tests/overture-contrato.test.ts`

**Interfaces:**
- Consumes: `CIUDADES`, `ciudadPorSlug`, `type Ciudad` de `@/lib/overpass-contrato`; `normalizarCelular`,
  `normalizarRed` de `@/lib/celular-contrato`; `type EntradaValidada` de `@/lib/tabla-contrato`.
- Produces:
  - `type LugarOverture = { id: string; nombre: string; categoriaBase: string; categoriaFina: string; lat: number; lon: number; direccion: string; telefonos: string; correos: string; webs: string; redes: string; confianza: number; publicacion: string }`
    (las cuatro listas son texto con un valor por renglón).
  - `type ReglaNicho = { bases: string[]; finas?: string[]; sinFinas?: string[] }`
  - `REGLAS_NICHO: Record<string, ReglaNicho>`, `SIN_EQUIVALENCIA: string[]`
  - `reglaDeNicho(slug: string): ReglaNicho | undefined`
  - `cajaDeCiudad(c: Ciudad): { latMin: number; latMax: number; lonMin: number; lonMax: number }`
  - `ciudadDeLugar(lat: number, lon: number): Ciudad | undefined`
  - `prospectosDesdeOverture(lugares: LugarOverture[], c: Ciudad, nicho: string, op: { soloContactables: boolean }): EntradaValidada[]`
  - `validarLugar(crudo: unknown, publicacion: string): LugarOverture | null`
  - `puedeReemplazar(actuales: number, nuevas: number): boolean`
  - `fechaDePublicacion(publicacion: string): string`

- [ ] **Step 1: Escribir los tests que fallan**

`tests/overture-contrato.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ciudadPorSlug } from "@/lib/overpass-contrato";
import {
  REGLAS_NICHO, SIN_EQUIVALENCIA, reglaDeNicho, cajaDeCiudad, ciudadDeLugar, prospectosDesdeOverture,
  validarLugar, puedeReemplazar, fechaDePublicacion, type LugarOverture,
} from "@/lib/overture-contrato";

const caracas = ciudadPorSlug("caracas")!;
const lugar = (extra: Partial<LugarOverture> = {}): LugarOverture => ({
  id: "a1", nombre: "Arepera Central", categoriaBase: "restaurant", categoriaFina: "venezuelan_restaurant",
  lat: 10.4806, lon: -66.9036, direccion: "Av. Urdaneta", telefonos: "+584141234567", correos: "arepera@gmail.com",
  webs: "", redes: "https://www.facebook.com/106177705403485", confianza: 0.9, publicacion: "2026-09-23.1", ...extra,
});
const uno = (extra: Partial<LugarOverture> = {}, nicho = "restaurantes-y-bares", soloContactables = true) =>
  prospectosDesdeOverture([lugar(extra)], caracas, nicho, { soloContactables });

describe("overture: de nicho a categorias", () => {
  it("cada nicho sembrado tiene regla o esta en la lista de sin equivalencia, nunca las dos", () => {
    const fuente = readFileSync(path.join(import.meta.dirname, "..", "scripts", "sembrar-nichos.mjs"), "utf8");
    const slugs = [...fuente.matchAll(/slug: "([a-z-]+)"/g)].map((m) => m[1]);
    expect(slugs.length).toBe(19);
    for (const s of slugs) expect([s, Boolean(REGLAS_NICHO[s]) !== SIN_EQUIVALENCIA.includes(s)]).toEqual([s, true]);
    expect(Object.keys(REGLAS_NICHO).filter((s) => !slugs.includes(s))).toEqual([]);
  });
  it("hoteles de paso y cosmeticos no tienen regla", () => {
    expect(reglaDeNicho("hoteles")).toBeUndefined();
    expect(reglaDeNicho("cosmeticos")).toBeUndefined();
    expect(reglaDeNicho("loquesea")).toBeUndefined();
  });
  it("una barberia es de peluquerias y no de spas; un spa al reves", () => {
    const barberia = { categoriaBase: "personal_or_beauty_service", categoriaFina: "barber" };
    const spa = { categoriaBase: "wellness_service", categoriaFina: "spa" };
    expect(uno(barberia, "peluquerias-y-barberias")).toHaveLength(1);
    expect(uno(barberia, "spas-y-estetica")).toHaveLength(0);
    expect(uno(spa, "spas-y-estetica")).toHaveLength(1);
    expect(uno(spa, "peluquerias-y-barberias")).toHaveLength(0);
  });
  it("una panaderia es de emprendimientos de comida y no de restaurantes; un motel no es de estadia", () => {
    const panaderia = { categoriaBase: "casual_eatery", categoriaFina: "bakery" };
    expect(uno(panaderia, "emprendimientos-comida")).toHaveLength(1);
    expect(uno(panaderia, "restaurantes-y-bares")).toHaveLength(0);
    expect(uno({ categoriaBase: "hotel", categoriaFina: "motel" }, "hoteles-estadia")).toHaveLength(0);
    expect(uno({ categoriaBase: "hotel", categoriaFina: "hotel" }, "hoteles-estadia")).toHaveLength(1);
  });
  it("un nicho sin regla no devuelve nada", () => {
    expect(uno({ categoriaBase: "hotel", categoriaFina: "motel" }, "hoteles")).toEqual([]);
  });
});

describe("overture: de coordenadas a ciudad", () => {
  it("la caja encierra el circulo de la ciudad", () => {
    const c = cajaDeCiudad(caracas);
    expect(c.latMin).toBeLessThan(caracas.lat); expect(c.latMax).toBeGreaterThan(caracas.lat);
    expect(c.lonMin).toBeLessThan(caracas.lon); expect(c.lonMax).toBeGreaterThan(caracas.lon);
    // 18 km son 0,162 grados de latitud
    expect(c.latMax - caracas.lat).toBeGreaterThan(0.16); expect(c.latMax - caracas.lat).toBeLessThan(0.165);
  });
  it("en el solape gana el centro mas cercano", () => {
    // Cubierto por Valencia (15 km) y por Guacara (7 km); Guacara queda a menos de 4 km.
    expect(ciudadDeLugar(10.215, -67.91)?.slug).toBe("guacara");
    // El centro de La Guaira esta dentro del radio de Caracas.
    expect(ciudadDeLugar(10.6031, -66.9354)?.slug).toBe("la-guaira");
    expect(ciudadDeLugar(10.4806, -66.9036)?.slug).toBe("caracas");
  });
  it("lejos de toda ciudad no pertenece a ninguna", () => {
    expect(ciudadDeLugar(6.0, -66.0)).toBeUndefined();
  });
  it("un lugar del solape solo sale al buscar su ciudad", () => {
    const l = lugar({ lat: 10.215, lon: -67.91 });
    const op = { soloContactables: true };
    expect(prospectosDesdeOverture([l], ciudadPorSlug("guacara")!, "restaurantes-y-bares", op)).toHaveLength(1);
    expect(prospectosDesdeOverture([l], ciudadPorSlug("valencia")!, "restaurantes-y-bares", op)).toHaveLength(0);
  });
});

describe("overture: de lugar a prospecto", () => {
  it("arma la entrada con la ciudad elegida y la pagina de Facebook como fuente de cada dato", () => {
    const [e] = uno();
    expect(e).toMatchObject({
      nicho: "restaurantes-y-bares", nombre: "Arepera Central", ciudad: "Caracas", estado: "Distrito Capital",
      tipo: "venezuelan_restaurant", telefono: "+584141234567", whatsapp: "584141234567", email: "arepera@gmail.com",
      facebook: "https://www.facebook.com/106177705403485", nota: "Dirección: Av. Urdaneta",
      fuentes: ["https://www.facebook.com/106177705403485"],
    });
    expect(e.fuentesPorCampo).toEqual({
      nombre: e.fuentes![0], ciudad: e.fuentes![0], tipo: e.fuentes![0], telefono: e.fuentes![0],
      whatsapp: e.fuentes![0], email: e.fuentes![0], facebook: e.fuentes![0],
    });
  });
  it("un telefono fijo no va a WhatsApp; el movil se busca entre todos", () => {
    expect(uno({ telefonos: "+582127930708" })[0]).toMatchObject({ telefono: "+582127930708", whatsapp: "" });
    expect(uno({ telefonos: "+582127930708\n+584241112233" })[0]).toMatchObject({ telefono: "+582127930708", whatsapp: "584241112233" });
  });
  it("descarta el correo de intermediario, el mal formado y el de mas de 120; toma el siguiente bueno", () => {
    expect(uno({ correos: "reservas@explore.partners" })[0].email).toBe("");
    expect(uno({ correos: "reservas@explore.partners\nno-es-correo\nHotel@Gmail.com" })[0].email).toBe("hotel@gmail.com");
    expect(uno({ correos: `${"a".repeat(120)}@gmail.com` })[0].email).toBe("");
  });
  it("sin Facebook usa la web como fuente; sin Facebook ni web no entra", () => {
    const [e] = uno({ redes: "", webs: "https://areperacentral.com.ve/" });
    expect(e.fuentes).toEqual(["https://areperacentral.com.ve/"]);
    expect(e.web).toBe("https://areperacentral.com.ve/");
    expect(uno({ redes: "", webs: "" })).toEqual([]);
    expect(uno({ redes: "https://twitter.com/arepera", webs: "" })).toEqual([]);
  });
  it("una web de mas de 191 caracteres o sin http no se toma", () => {
    expect(uno({ webs: `https://x.com/${"a".repeat(200)}\nhttps://corta.com/` })[0].web).toBe("https://corta.com/");
    expect(uno({ webs: "areperacentral.com.ve" })[0].web).toBe("");
  });
  it("la casilla quita lo que no tiene telefono ni correo; sin la casilla entra", () => {
    const mudo = { telefonos: "", correos: "" };
    expect(uno(mudo)).toEqual([]);
    expect(uno(mudo, "restaurantes-y-bares", false)).toHaveLength(1);
    expect(uno({ telefonos: "", correos: "a@b.co" })).toHaveLength(1);
  });
  it("saca el Instagram de las redes y ordena por confianza", () => {
    expect(uno({ redes: "https://www.facebook.com/arepera\nhttps://www.instagram.com/arepera/" })[0].instagram).toBe("https://www.instagram.com/arepera/");
    const r = prospectosDesdeOverture(
      [lugar({ id: "b", nombre: "Baja", confianza: 0.71 }), lugar({ id: "a", nombre: "Alta", confianza: 0.99 })],
      caracas, "restaurantes-y-bares", { soloContactables: true });
    expect(r.map((e) => e.nombre)).toEqual(["Alta", "Baja"]);
  });
});

describe("overture: carga", () => {
  const crudo = (extra: Record<string, unknown> = {}) => ({
    id: "08f2a", nombre: "Arepera Central", categoriaBase: "restaurant", categoriaFina: "venezuelan_restaurant",
    lat: 10.48, lon: -66.9, direccion: "Av. Urdaneta", telefonos: ["+584141234567", "+582127930708"],
    correos: ["a@gmail.com"], webs: [], redes: ["https://www.facebook.com/1"], confianza: 0.9, ...extra,
  });
  it("convierte un renglon valido y une las listas con un valor por renglon", () => {
    expect(validarLugar(crudo(), "2026-09-23.1")).toEqual({
      id: "08f2a", nombre: "Arepera Central", categoriaBase: "restaurant", categoriaFina: "venezuelan_restaurant",
      lat: 10.48, lon: -66.9, direccion: "Av. Urdaneta", telefonos: "+584141234567\n+582127930708",
      correos: "a@gmail.com", webs: "", redes: "https://www.facebook.com/1", confianza: 0.9, publicacion: "2026-09-23.1",
    });
  });
  it("rechaza lo que no tiene id, nombre, categoria o coordenadas dentro de Venezuela", () => {
    for (const malo of [null, "texto", 7, crudo({ id: "" }), crudo({ nombre: "  " }), crudo({ categoriaBase: null }),
      crudo({ lat: "10" }), crudo({ lat: 40.4, lon: -3.7 }), crudo({ lon: Number.NaN }), crudo({ confianza: "alta" })]) {
      expect(validarLugar(malo, "2026-09-23.1")).toBeNull();
    }
  });
  it("limpia saltos de linea del nombre, recorta a los anchos de la tabla y deja 5 valores por lista", () => {
    const l = validarLugar(crudo({
      nombre: `Arepera\nCentral ${"x".repeat(300)}`, direccion: "d".repeat(300), categoriaFina: null,
      telefonos: ["1", "2", "3", "4", "5", "6", 7, " "],
    }), "2026-09-23.1")!;
    expect(l.nombre.startsWith("Arepera Central x")).toBe(true);
    expect(l.nombre).toHaveLength(191);
    expect(l.direccion).toHaveLength(191);
    expect(l.categoriaFina).toBe("");
    expect(l.telefonos).toBe("1\n2\n3\n4\n5");
  });
  it("solo reemplaza si lo nuevo es al menos la mitad de lo que hay", () => {
    expect(puedeReemplazar(0, 1)).toBe(true);
    expect(puedeReemplazar(0, 0)).toBe(false);
    expect(puedeReemplazar(20000, 10000)).toBe(true);
    expect(puedeReemplazar(20000, 9999)).toBe(false);
  });
  it("escribe la fecha de la publicacion como en Venezuela", () => {
    expect(fechaDePublicacion("2026-09-23.1")).toBe("23/09/2026");
    expect(fechaDePublicacion("rara")).toBe("rara");
  });
});
```

- [ ] **Step 2: Correrlos y verlos fallar**

Run: `cd ~/dev-clon-prospectos && npx vitest run tests/overture-contrato.test.ts 2>&1 | tail -6`
Expected: FAIL, no encuentra `@/lib/overture-contrato`.

- [ ] **Step 3: Escribir el contrato**

`src/lib/overture-contrato.ts`:

```ts
// Reglas puras del directorio abierto (Overture Maps): a que nicho y a que ciudad pertenece cada lugar y como se
// convierte en una fila de la bandeja. Sin Prisma ni node: lo importan la accion, el script de carga y la pantalla.
import { normalizarCelular, normalizarRed } from "@/lib/celular-contrato";
import { CIUDADES, type Ciudad } from "@/lib/overpass-contrato";
import type { EntradaValidada } from "@/lib/tabla-contrato";

// Las cuatro listas van como texto con un valor por renglon: la tabla no lleva columnas Json a proposito.
export type LugarOverture = {
  id: string; nombre: string; categoriaBase: string; categoriaFina: string; lat: number; lon: number;
  direccion: string; telefonos: string; correos: string; webs: string; redes: string; confianza: number; publicacion: string;
};

// `bases` es basic_category de Overture. Donde la base es muy ancha se afina con taxonomy.primary:
// `finas` deja pasar solo esas y `sinFinas` las quita.
export type ReglaNicho = { bases: string[]; finas?: string[]; sinFinas?: string[] };
export const REGLAS_NICHO: Record<string, ReglaNicho> = {
  "hoteles-estadia": { bases: ["hotel", "lodging"], sinFinas: ["motel"] },
  "restaurantes-y-bares": { bases: ["restaurant", "casual_eatery", "fast_food_restaurant", "bar", "cafe", "coffee_shop"], sinFinas: ["bakery"] },
  "clinicas-y-consultorios": { bases: ["hospital", "health_care", "outpatient_care_facility", "diagnostics_imaging_or_lab_service", "medical_service", "primary_care_or_general_clinic", "vision_or_eye_care_clinic"] },
  odontologias: { bases: ["dental_clinic"] },
  farmacias: { bases: ["pharmacy_and_drug_store"] },
  "peluquerias-y-barberias": { bases: ["personal_or_beauty_service"], finas: ["barber", "hair_salon"] },
  "spas-y-estetica": { bases: ["personal_or_beauty_service", "wellness_service"], sinFinas: ["barber", "hair_salon"] },
  gimnasios: { bases: ["gym", "fitness_studio"] },
  "canchas-y-espacios": { bases: ["sport_or_fitness_facility", "sport_field", "sport_court", "sport_or_recreation_club"] },
  eventos: { bases: ["event_or_party_service", "event_venue"] },
  veterinarias: { bases: ["animal_or_pet_service"], finas: ["veterinarian"] },
  "licorerias-y-bodegones": { bases: ["food_and_beverage_store"], finas: ["liquor_store"] },
  "emprendimientos-comida": { bases: ["casual_eatery"], finas: ["bakery"] },
  "emprendimientos-moda": { bases: ["fashion_and_apparel_store"] },
  comercio: { bases: ["hardware_home_and_garden_store", "electronics_store", "convenience_store", "vehicle_parts_store"] },
  "talleres-y-autolavados": { bases: ["automotive_service"] },
  educacion: { bases: ["specialty_school"] },
};
// Nichos que el directorio no cubre: 4 moteles y 2 tiendas de cosmeticos en todo el pais (medido el 5-oct-2026).
export const SIN_EQUIVALENCIA = ["hoteles", "cosmeticos"];

export function reglaDeNicho(slug: string): ReglaNicho | undefined {
  return Object.hasOwn(REGLAS_NICHO, slug) ? REGLAS_NICHO[slug] : undefined;
}

function coincideNicho(r: ReglaNicho, l: Pick<LugarOverture, "categoriaBase" | "categoriaFina">): boolean {
  if (!r.bases.includes(l.categoriaBase)) return false;
  if (r.finas && !r.finas.includes(l.categoriaFina)) return false;
  return !r.sinFinas?.includes(l.categoriaFina);
}

const RADIO_TIERRA_M = 6_371_000;
const rad = (g: number) => (g * Math.PI) / 180;

function distanciaM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.sqrt(a));
}

// La caja que encierra el circulo de la ciudad: es lo que se le pide a la base. La distancia exacta va en codigo.
export function cajaDeCiudad(c: Ciudad): { latMin: number; latMax: number; lonMin: number; lonMax: number } {
  const dLat = (c.radioM / RADIO_TIERRA_M) * (180 / Math.PI);
  const dLon = dLat / Math.cos(rad(c.lat));
  return { latMin: c.lat - dLat, latMax: c.lat + dLat, lonMin: c.lon - dLon, lonMax: c.lon + dLon };
}

// Los radios se solapan (Valencia y Guacara, Caracas y La Guaira). Un lugar es de UNA sola ciudad: la de centro
// mas cercano entre las que lo cubren. Si no, el mismo negocio entraria dos veces con ciudades distintas y la clave
// nombre|ciudad no lo veria como repetido.
export function ciudadDeLugar(lat: number, lon: number): Ciudad | undefined {
  let mejor: Ciudad | undefined;
  let menor = Infinity;
  for (const c of CIUDADES) {
    const d = distanciaM(lat, lon, c.lat, c.lon);
    if (d <= c.radioM && d < menor) { mejor = c; menor = d; }
  }
  return mejor;
}

const lineas = (t: string): string[] => (t ?? "").split("\n").map((s) => s.trim()).filter(Boolean);

const CORREO = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const MAX_EMAIL = 120; // el mismo tope que el alta manual y la importacion
// Correos que no son del negocio sino de un intermediario que administra su pagina.
const DOMINIOS_DESCARTADOS = ["explore.partners"];

function primerCorreo(lista: string[]): string {
  for (const c of lista) {
    const v = c.toLowerCase();
    if (v.length > MAX_EMAIL || !CORREO.test(v)) continue;
    if (DOMINIOS_DESCARTADOS.some((d) => v.endsWith(`@${d}`) || v.endsWith(`.${d}`))) continue;
    return v;
  }
  return "";
}

const MAX_WEB = 191; // TOPES.texto: una web mas larga dejaria la fila marcada como error por un dato secundario

// Mismo contrato que prospectosDesdeOverpass. La fuente de cada dato es la pagina de Facebook del negocio (de ahi
// lo saco Meta) o, si no tiene, su web. Sin ninguna de las dos el lugar no entra: no habria como sostener que el
// dato lo publico el propio negocio.
export function prospectosDesdeOverture(
  lugares: LugarOverture[], c: Ciudad, nicho: string, op: { soloContactables: boolean },
): EntradaValidada[] {
  const regla = reglaDeNicho(nicho);
  if (!regla) return [];
  const salida: EntradaValidada[] = [];
  for (const l of [...lugares].sort((a, b) => b.confianza - a.confianza)) {
    if (!coincideNicho(regla, l)) continue;
    if (ciudadDeLugar(l.lat, l.lon)?.slug !== c.slug) continue;
    const redes = lineas(l.redes);
    const facebook = redes.map((r) => normalizarRed(r, "facebook")).find(Boolean) ?? "";
    const instagram = redes.map((r) => normalizarRed(r, "instagram")).find(Boolean) ?? "";
    const web = lineas(l.webs).find((w) => /^https?:\/\//i.test(w) && w.length <= MAX_WEB) ?? "";
    const fuente = facebook || web;
    if (!fuente) continue;
    const telefonos = lineas(l.telefonos);
    const telefono = telefonos[0] ?? "";
    const whatsapp = telefonos.map(normalizarCelular).find(Boolean) ?? "";
    const email = primerCorreo(lineas(l.correos));
    if (op.soloContactables && !telefono && !whatsapp && !email) continue;
    const entrada: EntradaValidada = {
      nicho, nombre: l.nombre.trim(), ciudad: c.nombre, estado: c.estado, tipo: l.categoriaFina, tamano: "",
      telefono, whatsapp, email, web, instagram, facebook, tiktok: "",
      nota: l.direccion ? `Dirección: ${l.direccion}` : "", fuentes: [fuente], fuentesPorCampo: {},
    };
    for (const k of ["nombre", "ciudad", "tipo", "telefono", "whatsapp", "email", "web", "instagram", "facebook"] as const) {
      if (entrada[k]) entrada.fuentesPorCampo[k] = fuente;
    }
    salida.push(entrada);
  }
  return salida;
}

// --- Carga ------------------------------------------------------------------
const MAX_POR_LISTA = 5;
// \p{Cc} y no un rango escrito con escapes: ver "Trampa de herramienta" en el CLAUDE.md del proyecto.
const limpio = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/\p{Cc}+/gu, " ").trim().slice(0, max) : "");
const lista = (v: unknown): string =>
  Array.isArray(v) ? v.map((x) => limpio(x, 500)).filter(Boolean).slice(0, MAX_POR_LISTA).join("\n") : "";
const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

// Un renglon del JSONL que deja extraer-overture.py. Devuelve null si no sirve: el script lo cuenta y lo salta.
export function validarLugar(crudo: unknown, publicacion: string): LugarOverture | null {
  if (!crudo || typeof crudo !== "object") return null;
  const o = crudo as Record<string, unknown>;
  const id = limpio(o.id, 64), nombre = limpio(o.nombre, 191), categoriaBase = limpio(o.categoriaBase, 80);
  const lat = numero(o.lat), lon = numero(o.lon), confianza = numero(o.confianza);
  if (!id || !nombre || !categoriaBase || lat === null || lon === null || confianza === null) return null;
  // Venezuela, con holgura. Una fila de otro pais es un error del extractor, no un prospecto.
  if (lat < 0 || lat > 13 || lon < -74 || lon > -59) return null;
  return {
    id, nombre, categoriaBase, categoriaFina: limpio(o.categoriaFina, 80), lat, lon, direccion: limpio(o.direccion, 191),
    telefonos: lista(o.telefonos), correos: lista(o.correos), webs: lista(o.webs), redes: lista(o.redes), confianza, publicacion,
  };
}

// Una descarga cortada no puede vaciar el directorio: lo nuevo tiene que ser al menos la mitad de lo que hay.
export function puedeReemplazar(actuales: number, nuevas: number): boolean {
  return nuevas > 0 && nuevas * 2 >= actuales;
}

// "2026-09-23.1" -> "23/09/2026"
export function fechaDePublicacion(publicacion: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(publicacion);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : publicacion;
}
```

- [ ] **Step 4: Correr los tests y verlos pasar**

Run: `npx vitest run tests/overture-contrato.test.ts 2>&1 | tail -6 && npx tsc --noEmit && echo TSC_OK`
Expected: todos PASS y `TSC_OK`. Si el test de los 19 slugs falla, `scripts/sembrar-nichos.mjs` cambió: ajustar
`REGLAS_NICHO` o `SIN_EQUIVALENCIA`, no el test.

- [ ] **Step 5: Barrer bytes de control y hacer commit**

```bash
cd ~/dev-clon-prospectos
python3 - <<'EOF'
import re,sys
for p in ("src/lib/overture-contrato.ts","tests/overture-contrato.test.ts"):
    t=open(p,encoding="utf-8").read()
    malos=[hex(ord(c)) for c in t if (ord(c)<0x20 and c not in "\n\t") or ord(c)==0x7f or 0x300<=ord(c)<=0x36f]
    print(p, "limpio" if not malos else malos[:5])
    if malos: sys.exit(1)
EOF
git add src/lib/overture-contrato.ts tests/overture-contrato.test.ts
git commit -q -F - <<'EOF'
feat(overture): contrato puro del directorio abierto (nicho, ciudad, fila de bandeja, carga)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

Expected: los dos archivos `limpio`.

---

### Task 2: La tabla y su acceso

**Files:**
- Modify: `prisma/schema.prisma` (modelo nuevo al final)
- Create: `prisma/migrations/20261005120000_lugar_overture/migration.sql`
- Create: `src/lib/overture.ts`
- Modify: `tests/ayuda-db.ts` (`limpiarBase`)
- Test: `tests/overture.test.ts`

**Interfaces:**
- Consumes: `cajaDeCiudad`, `type LugarOverture`, `type ReglaNicho` de `@/lib/overture-contrato`; `type Ciudad` de
  `@/lib/overpass-contrato`; `prisma` de `@/lib/db`.
- Produces (en `src/lib/overture.ts`):
  - `lugaresDeOverture(regla: ReglaNicho, c: Ciudad): Promise<LugarOverture[]>`
  - `publicacionCargada(): Promise<string | null>`
  - `reemplazarLugares(lugares: LugarOverture[]): Promise<number>`

- [ ] **Step 1: Modelo y migración**

Al final de `prisma/schema.prisma`:

```prisma
// Directorio abierto (Overture Maps), solo Venezuela. Se regenera con scripts/cargar-overture.mts: no son
// prospectos y nada depende de que existan. Las listas van como texto, un valor por renglon (sin Json a proposito).
model LugarOverture {
  id            String @id @db.VarChar(64)
  nombre        String
  categoriaBase String @db.VarChar(80)
  categoriaFina String @default("") @db.VarChar(80)
  lat           Float
  lon           Float
  direccion     String @default("")
  telefonos     String @db.Text
  correos       String @db.Text
  webs          String @db.Text
  redes         String @db.Text
  confianza     Float
  publicacion   String @db.VarChar(20)

  @@index([categoriaBase])
}
```

`prisma/migrations/20261005120000_lugar_overture/migration.sql`:

```sql
-- CreateTable
CREATE TABLE `LugarOverture` (
    `id` VARCHAR(64) NOT NULL,
    `nombre` VARCHAR(191) NOT NULL,
    `categoriaBase` VARCHAR(80) NOT NULL,
    `categoriaFina` VARCHAR(80) NOT NULL DEFAULT '',
    `lat` DOUBLE NOT NULL,
    `lon` DOUBLE NOT NULL,
    `direccion` VARCHAR(191) NOT NULL DEFAULT '',
    `telefonos` TEXT NOT NULL,
    `correos` TEXT NOT NULL,
    `webs` TEXT NOT NULL,
    `redes` TEXT NOT NULL,
    `confianza` DOUBLE NOT NULL,
    `publicacion` VARCHAR(20) NOT NULL,

    INDEX `LugarOverture_categoriaBase_idx`(`categoriaBase`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

- [ ] **Step 2: Aplicarla a la base de tests y comprobar que el esquema coincide**

```bash
cd ~/dev-clon-prospectos
npx prisma generate | tail -1
( set -a; . ~/.config/prospectos/env; set +a; DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy 2>&1 | grep -vi "mysql://" | tail -4 )
( set -a; . ~/.config/prospectos/env; set +a; npx prisma migrate diff --from-url "$TEST_DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script 2>&1 | grep -vi "mysql://" | grep -i "LugarOverture"; echo "fin del diff" )
```

Expected: `migrate deploy` aplica `20261005120000_lugar_overture`. El `diff` filtrado por `LugarOverture` no imprime
nada antes de `fin del diff` (las líneas sobre columnas `JSON` de otras tablas son el desencuentro conocido de Prisma
con MariaDB y no cuentan).

- [ ] **Step 3: `limpiarBase` vacía la tabla nueva**

En `tests/ayuda-db.ts`, dentro de `limpiarBase`, después de `await prisma.busquedaOsm.deleteMany();`:

```ts
  await prisma.lugarOverture.deleteMany();
```

- [ ] **Step 4: Escribir los tests que fallan**

`tests/overture.test.ts`:

```ts
import { vi } from "vitest";
vi.mock("@/lib/sesion", async () => {
  const { sesionFalsa } = await import("./ayuda-sesion");
  return {
    COOKIE_SESION: "pr_sesion",
    DIAS_SESION: 30,
    sesionActual: async () => sesionFalsa.actual,
    exigirSesion: async () => { if (!sesionFalsa.actual) throw new Error("REDIRECT:/entrar"); return sesionFalsa.actual; },
    exigirRol: async (rol: string) => { if (sesionFalsa.actual?.rol !== rol) throw new Error("REDIRECT:/hoy"); return sesionFalsa.actual; },
  };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico } from "./ayuda-db";
import { sesionFalsa } from "./ayuda-sesion";
import { ciudadPorSlug } from "@/lib/overpass-contrato";
import { reglaDeNicho, type LugarOverture } from "@/lib/overture-contrato";
import { lugaresDeOverture, publicacionCargada, reemplazarLugares } from "@/lib/overture";

const caracas = ciudadPorSlug("caracas")!;
const PUB = "2026-09-23.1";
const lugar = (id: string, extra: Partial<LugarOverture> = {}): LugarOverture => ({
  id, nombre: `Arepera ${id}`, categoriaBase: "restaurant", categoriaFina: "venezuelan_restaurant",
  lat: 10.4806, lon: -66.9036, direccion: "", telefonos: "+584141234567", correos: "", webs: "",
  redes: `https://www.facebook.com/${id}`, confianza: 0.9, publicacion: PUB, ...extra,
});

describe.runIf(DB_HABILITADA)("directorio abierto: tabla", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  beforeAll(async () => { await limpiarBase(); ids = await sembrarBasico(); });
  beforeEach(async () => {
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
    await prisma.revision.deleteMany(); await prisma.lugarOverture.deleteMany();
  });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("sin cargar no hay publicacion; cargado, la dice", async () => {
    expect(await publicacionCargada()).toBeNull();
    expect(await reemplazarLugares([lugar("a"), lugar("b")])).toBe(2);
    expect(await publicacionCargada()).toBe(PUB);
  });

  it("reemplazar borra lo anterior y si falla a medias no cambia nada", async () => {
    await reemplazarLugares([lugar("a"), lugar("b")]);
    await reemplazarLugares([lugar("c", { publicacion: "2026-10-21.0" })]);
    expect((await prisma.lugarOverture.findMany()).map((l) => l.id)).toEqual(["c"]);
    // Dos filas con el mismo id revientan el createMany: la transaccion deja la tabla como estaba.
    await expect(reemplazarLugares([lugar("x"), lugar("x")])).rejects.toThrow();
    expect((await prisma.lugarOverture.findMany()).map((l) => l.id)).toEqual(["c"]);
  });

  it("trae solo la caja de la ciudad y las categorias de la regla", async () => {
    await reemplazarLugares([
      lugar("centro"),
      lugar("valencia", { lat: 10.162, lon: -68.0077 }),
      lugar("farmacia", { categoriaBase: "pharmacy_and_drug_store" }),
      lugar("emoji", { nombre: "Café 🌮 Ñandú" }),
    ]);
    const r = await lugaresDeOverture(reglaDeNicho("restaurantes-y-bares")!, caracas);
    expect(r.map((l) => l.id).sort()).toEqual(["centro", "emoji"]);
    expect(r.find((l) => l.id === "emoji")!.nombre).toBe("Café 🌮 Ñandú");
  });
});
```

- [ ] **Step 5: Correrlos y verlos fallar**

Run: `npx vitest run tests/overture.test.ts 2>&1 | tail -6; PROSPECTOS_TEST_DB=1 npx vitest run tests/overture.test.ts 2>&1 | tail -6`
Expected: la primera corrida salta el archivo (sin base); la segunda FALLA: no encuentra `@/lib/overture`.

- [ ] **Step 6: Escribir el acceso**

`src/lib/overture.ts`:

```ts
// Acceso a la tabla del directorio abierto (Overture Maps). Las reglas viven en overture-contrato.ts; aqui solo
// se lee y se reemplaza. No entra en la cadena de src/instrumentation.ts.
import { prisma } from "@/lib/db";
import type { Ciudad } from "@/lib/overpass-contrato";
import { cajaDeCiudad, type LugarOverture, type ReglaNicho } from "@/lib/overture-contrato";

// Trae la caja que encierra el circulo de la ciudad y las categorias base del nicho. El desempate entre ciudades
// y el filtro fino los hace prospectosDesdeOverture.
export async function lugaresDeOverture(regla: ReglaNicho, c: Ciudad): Promise<LugarOverture[]> {
  const caja = cajaDeCiudad(c);
  return prisma.lugarOverture.findMany({
    where: {
      categoriaBase: { in: regla.bases },
      lat: { gte: caja.latMin, lte: caja.latMax },
      lon: { gte: caja.lonMin, lte: caja.lonMax },
    },
  });
}

// La publicacion de Overture que esta cargada, o null si la tabla esta vacia. Toda la tabla es de una sola.
export async function publicacionCargada(): Promise<string | null> {
  const f = await prisma.lugarOverture.findFirst({ select: { publicacion: true } });
  return f?.publicacion ?? null;
}

const POR_TANDA = 1000;

// Borra todo e inserta lo nuevo en UNA transaccion: si algo falla, el directorio queda como estaba.
export async function reemplazarLugares(lugares: LugarOverture[]): Promise<number> {
  await prisma.$transaction(
    async (tx) => {
      await tx.lugarOverture.deleteMany();
      for (let i = 0; i < lugares.length; i += POR_TANDA) {
        await tx.lugarOverture.createMany({ data: lugares.slice(i, i + POR_TANDA) });
      }
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
  return lugares.length;
}
```

- [ ] **Step 7: Correr los tests y verlos pasar**

Run: `PROSPECTOS_TEST_DB=1 npx vitest run tests/overture.test.ts tests/instrumentation-grafo.test.ts 2>&1 | tail -6 && npx tsc --noEmit && echo TSC_OK`
Expected: PASS y `TSC_OK`.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261005120000_lugar_overture src/lib/overture.ts tests/ayuda-db.ts tests/overture.test.ts
git commit -q -F - <<'EOF'
feat(overture): tabla LugarOverture y su acceso (leer por caja y categoria, reemplazar en una transaccion)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: La acción `buscarOverture`

**Files:**
- Modify: `src/lib/revision.ts:11` (`ORIGENES`)
- Modify: `src/lib/revision-contrato.ts:6-11` (`ETIQUETA_ORIGEN`)
- Modify: `src/acciones/buscar.ts` (imports y acción nueva después de `buscarOverpass`)
- Modify: `prisma/schema.prisma` (solo los comentarios `// overpass | web | maps | importado` de `Revision.origen` y
  `Prospecto.origen`: sumarles `| overture`)
- Test: `tests/overture.test.ts` (bloque nuevo), `tests/revision-contrato.test.ts`

**Interfaces:**
- Consumes: de Task 1 `reglaDeNicho`, `prospectosDesdeOverture`; de Task 2 `lugaresDeOverture`, `publicacionCargada`,
  `reemplazarLugares`; de `src/acciones/buscar.ts` el auxiliar interno `loteDesdeEntradas(origen, entradas, erroresPorFila, usuarioId)`.
- Produces: `buscarOverture(formData: FormData): Promise<Resultado<{ lote: string; nuevos: number; repetidos: number; errores: number; publicacion: string }>>`.
  Campos del formulario: `nichoId` (número), `ciudad` (slug), `soloContactables` (`"on"` o ausente).
  Mensajes de fallo exactos: `"Elige nicho y ciudad."`, `"Este nicho no está en el directorio."`,
  `"El directorio no está cargado todavía."`, `"El directorio no tiene negocios de ese nicho en esa ciudad."`.

- [ ] **Step 1: Escribir los tests que fallan**

En `tests/revision-contrato.test.ts`, junto a los otros `expect(etiquetaOrigen(...))`:

```ts
    expect(etiquetaOrigen("overture")).toBe("Directorio abierto");
```

En `tests/overture.test.ts`, sumar a los imports:

```ts
import { buscarOverture } from "@/acciones/buscar";
import { claveProspecto } from "@/lib/clave-prospecto";
import { generarCodigo } from "@/lib/codigo";
```

y agregar al final del archivo:

```ts
describe.runIf(DB_HABILITADA)("directorio abierto: buscarOverture", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  let restaurantes: number;
  const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
  const buscar = (extra: Record<string, string> = {}) =>
    buscarOverture(fd({ nichoId: String(restaurantes), ciudad: "caracas", soloContactables: "on", ...extra }));
  const filasDe = (lote: string) => prisma.revision.findMany({ where: { lote }, orderBy: { fila: "asc" } });

  beforeAll(async () => {
    await limpiarBase(); ids = await sembrarBasico();
    restaurantes = (await prisma.nicho.create({ data: {
      slug: "restaurantes-y-bares", nombre: "Restaurantes y bares", mensajeInicial: "Hola {nombre}: {enlace}",
      mensajeSeguimiento: "Hola de nuevo {nombre}: {enlace}", plantillaPropuesta: "restaurantes-y-bares", diasSeguimiento: 3,
    } })).id;
  });
  beforeEach(async () => {
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
    await prisma.revision.deleteMany(); await prisma.prospecto.deleteMany(); await prisma.lugarOverture.deleteMany();
  });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("sin sesion no pasa", async () => {
    sesionFalsa.actual = null;
    await expect(buscar()).rejects.toThrow("REDIRECT:/entrar");
  });

  it("dice por que no hay nada: datos invalidos, nicho sin equivalencia, tabla vacia, combinacion sin fichas", async () => {
    expect(await buscar({ ciudad: "Caracas; DROP" })).toEqual({ ok: false, mensaje: "Elige nicho y ciudad." });
    expect(await buscar({ ciudad: "atlantida" })).toEqual({ ok: false, mensaje: "Elige nicho y ciudad." });
    expect(await buscar({ nichoId: "999999" })).toEqual({ ok: false, mensaje: "Elige nicho y ciudad." });
    expect(await buscar({ nichoId: String(ids.nichoId) })).toEqual({ ok: false, mensaje: "Este nicho no está en el directorio." });
    expect(await buscar()).toEqual({ ok: false, mensaje: "El directorio no está cargado todavía." });
    await reemplazarLugares([lugar("farmacia", { categoriaBase: "pharmacy_and_drug_store" })]);
    expect(await buscar()).toEqual({ ok: false, mensaje: "El directorio no tiene negocios de ese nicho en esa ciudad." });
    expect(await prisma.revision.count()).toBe(0);
  });

  it("crea un lote con origen overture, la publicacion y la fuente de cada dato", async () => {
    await reemplazarLugares([lugar("uno"), lugar("dos"), lugar("lejos", { lat: 10.162, lon: -68.0077 })]);
    const r = await buscar();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.datos).toMatchObject({ nuevos: 2, repetidos: 0, errores: 0, publicacion: PUB });
    const filas = await filasDe(r.datos.lote);
    expect(filas.map((f) => f.origen)).toEqual(["overture", "overture"]);
    expect(filas[0].usuarioId).toBe(ids.prospectadorId);
    const datos = filas[0].datos as { whatsapp: string; fuentes: string[]; fuentesPorCampo: Record<string, string> };
    expect(datos.whatsapp).toBe("584141234567");
    expect(datos.fuentesPorCampo.whatsapp).toBe(datos.fuentes[0]);
    expect(datos.fuentes[0]).toMatch(/^https:\/\/www\.facebook\.com\//);
  });

  it("la casilla sin marcar deja entrar lo que no tiene telefono ni correo", async () => {
    await reemplazarLugares([lugar("mudo", { telefonos: "", correos: "" }), lugar("habla")]);
    const con = await buscar();
    expect(con.ok && con.datos.nuevos).toBe(1);
    await prisma.revision.deleteMany();
    const f = fd({ nichoId: String(restaurantes), ciudad: "caracas" });
    const sin = await buscarOverture(f);
    expect(sin.ok && sin.datos.nuevos).toBe(2);
  });

  it("un prospecto que ya existe sin telefono queda como repetido por decidir; uno que ya lo tiene todo nace descartado", async () => {
    const existente = (nombre: string, extra: Record<string, string>) => prisma.prospecto.create({ data: {
      nichoId: restaurantes, nombre, ciudad: "Caracas", fuentes: ["https://ejemplo.test/"], codigo: generarCodigo(),
      clave: claveProspecto(nombre, "Caracas"), ...extra } });
    const falta = await existente("Arepera falta", {});
    // "Completa" es completa en TODO lo que la bandeja cuenta como aporte (CAMPOS_CONTACTO incluye estado y tipo).
    await existente("Arepera completa", { telefono: "+584141234567", whatsapp: "584141234567", facebook: "https://www.facebook.com/completa", estado: "Distrito Capital", tipo: "arepera" });
    await reemplazarLugares([lugar("falta"), lugar("completa")]);
    const r = await buscar();
    expect(r.ok && r.datos).toMatchObject({ nuevos: 0, repetidos: 2 });
    const filas = await filasDe((r as { datos: { lote: string } }).datos.lote);
    const porNombre = (n: string) => filas.find((f) => (f.datos as { nombre: string }).nombre === n)!;
    expect(porNombre("Arepera falta")).toMatchObject({ estado: "repetido", decision: "pendiente", existenteId: falta.id });
    expect(porNombre("Arepera completa")).toMatchObject({ estado: "repetido", decision: "descartado" });
  });

  it("el mismo negocio dos veces en el directorio da una fila nueva y una repetida", async () => {
    await reemplazarLugares([lugar("x1", { nombre: "Arepera Doble" }), lugar("x2", { nombre: "Arepera Doble" })]);
    const r = await buscar();
    expect(r.ok && r.datos).toMatchObject({ nuevos: 1, repetidos: 1 });
  });

  it("buscar dos veces lo mismo no deja nada nuevo que aprobar en el segundo lote", async () => {
    await reemplazarLugares([lugar("uno"), lugar("dos")]);
    const a = await buscar();
    const b = await buscar();
    expect(a.ok && a.datos.nuevos).toBe(2);
    expect(b.ok && b.datos).toMatchObject({ nuevos: 0, repetidos: 2 });
    const filas = await filasDe((b as { datos: { lote: string } }).datos.lote);
    expect(filas.every((f) => f.decision === "descartado")).toBe(true);
  });

  it("un nombre de mas de 120 caracteres entra marcado como error, no revienta", async () => {
    await reemplazarLugares([lugar("largo", { nombre: "A".repeat(150) })]);
    const r = await buscar();
    expect(r.ok && r.datos).toMatchObject({ nuevos: 0, errores: 1 });
  });
});
```

- [ ] **Step 2: Correrlos y verlos fallar**

Run: `PROSPECTOS_TEST_DB=1 npx vitest run tests/overture.test.ts tests/revision-contrato.test.ts 2>&1 | tail -8`
Expected: FAIL: `buscarOverture` no existe en `@/acciones/buscar` y `etiquetaOrigen("overture")` devuelve `"overture"`.

- [ ] **Step 3: Origen y etiqueta**

`src/lib/revision.ts`, línea 11:

```ts
export const ORIGENES = ["overpass", "web", "maps", "importado", "overture"] as const;
```

`src/lib/revision-contrato.ts`, dentro de `ETIQUETA_ORIGEN`, después de `web: "Lectura de web",`:

```ts
  overture: "Directorio abierto",
```

En `prisma/schema.prisma`, los dos comentarios que listan los orígenes pasan a terminar en `| overture`
(`Revision.origen` y `Prospecto.origen`). Es solo comentario: no hay migración.

- [ ] **Step 4: La acción**

En `src/acciones/buscar.ts`, cambiar el import de `overpass-contrato` y sumar dos:

```ts
import { ciudadPorNombre, ciudadPorSlug } from "@/lib/overpass-contrato";
import { reglaDeNicho, prospectosDesdeOverture } from "@/lib/overture-contrato";
import { lugaresDeOverture, publicacionCargada } from "@/lib/overture";
```

y, justo después del cierre de `buscarOverpass`:

```ts
// El directorio abierto (Overture Maps) ya esta en la base: aqui no hay red, ni cola, ni cache. Lo usan dueno y
// prospectador, igual que la busqueda del mapa.
export async function buscarOverture(formData: FormData): Promise<Resultado<Resumen & { publicacion: string }>> {
  const u = await exigirSesion();
  const e = z
    .object({
      nichoId: z.coerce.number().int().positive(),
      ciudad: z.string().regex(/^[a-z0-9-]{2,40}$/),
      soloContactables: z.string().optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("Elige nicho y ciudad.");
  try {
    const nicho = await prisma.nicho.findUnique({ where: { id: e.data.nichoId }, select: { slug: true } });
    const ciudad = ciudadPorSlug(e.data.ciudad);
    if (!nicho || !ciudad) return fallo("Elige nicho y ciudad.");
    const regla = reglaDeNicho(nicho.slug);
    if (!regla) return fallo("Este nicho no está en el directorio.");
    const publicacion = await publicacionCargada();
    if (!publicacion) return fallo("El directorio no está cargado todavía.");
    const entradas = prospectosDesdeOverture(await lugaresDeOverture(regla, ciudad), ciudad, nicho.slug, {
      soloContactables: e.data.soloContactables === "on",
    });
    if (!entradas.length) return fallo("El directorio no tiene negocios de ese nicho en esa ciudad.");
    const lote = await loteDesdeEntradas("overture", entradas, entradas.map(validarTopes), u.id);
    return exito({ ...lote, publicacion });
  } catch (err) {
    console.error("buscarOverture", err);
    return fallo(ERROR);
  }
}
```

- [ ] **Step 5: Correr todo y verlo pasar**

Run: `npx tsc --noEmit && echo TSC_OK; npm test 2>&1 | tail -4; npm run test:db 2>&1 | tail -4`
Expected: `TSC_OK`; las dos suites en verde, con los totales de la línea base más los tests nuevos.

- [ ] **Step 6: Commit**

```bash
git add src/lib/revision.ts src/lib/revision-contrato.ts src/acciones/buscar.ts prisma/schema.prisma tests/overture.test.ts tests/revision-contrato.test.ts
git commit -q -F - <<'EOF'
feat(overture): accion buscarOverture y origen «Directorio abierto» en la bandeja

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Los scripts de carga

**Files:**
- Create: `scripts/extraer-overture.py`
- Create: `scripts/cargar-overture.mts`
- Create: `tests/fixtures/overture-ve-2026-09-23.1.jsonl`

**Interfaces:**
- Consumes: de Task 1 `validarLugar`, `puedeReemplazar`; de Task 2 `reemplazarLugares`.
- Produces: `~/overture/ve-<publicacion>.jsonl` (600), un objeto por renglón con las claves `id`, `nombre`,
  `categoriaBase`, `categoriaFina`, `lat`, `lon`, `direccion`, `telefonos[]`, `correos[]`, `webs[]`, `redes[]`,
  `confianza`. El cargador saca la publicación del nombre del archivo.

- [ ] **Step 1: El extractor**

`scripts/extraer-overture.py`:

```python
#!/usr/bin/env python3
# scripts/extraer-overture.py — baja de Overture Maps los lugares de Venezuela con confianza >= 0.7 y los deja en
# ~/overture/ve-<publicacion>.jsonl (600), un objeto por renglon, listos para scripts/cargar-overture.mts.
# Es la UNICA salida a internet de esta pieza y se corre a mano. Necesita duckdb (pip3 install --user duckdb).
# Uso:  python3 scripts/extraer-overture.py 2026-09-23.1
# Las publicaciones: https://overturemaps-us-west-2.s3.amazonaws.com/?list-type=2&prefix=release/&delimiter=/
import json, os, re, sys
import duckdb

if len(sys.argv) != 2 or not re.fullmatch(r"\d{4}-\d{2}-\d{2}\.\d+", sys.argv[1]):
    sys.exit("Uso: extraer-overture.py <publicacion>   (por ejemplo 2026-09-23.1)")
pub = sys.argv[1]
carpeta = os.path.expanduser("~/overture")
os.makedirs(carpeta, mode=0o700, exist_ok=True)
destino = os.path.join(carpeta, f"ve-{pub}.jsonl")

c = duckdb.connect()
# El servidor es compartido con cuatro sitios en vivo: pocos hilos y memoria acotada.
c.execute(f"INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2'; SET threads=3; SET memory_limit='2GB'; SET temp_directory='{carpeta}/tmp'")
filas = c.execute(f"""
  SELECT id, names."primary", basic_category, taxonomy."primary", bbox.ymin, bbox.xmin, addresses[1].freeform,
         coalesce(phones, []), coalesce(emails, []), coalesce(websites, []), coalesce(socials, []), confidence
  FROM read_parquet('s3://overturemaps-us-west-2/release/{pub}/theme=places/type=place/*', hive_partitioning=0)
  WHERE bbox.xmin BETWEEN -73.5 AND -59.7 AND bbox.ymin BETWEEN 0.5 AND 12.3
    AND addresses[1].country = 'VE'
    AND confidence >= 0.7
    AND names."primary" IS NOT NULL
    AND basic_category IS NOT NULL
    AND coalesce(operating_status, '') <> 'permanently_closed'
""").fetchall()
claves = ["id", "nombre", "categoriaBase", "categoriaFina", "lat", "lon", "direccion", "telefonos", "correos", "webs", "redes", "confianza"]
tmp = destino + ".tmp"
with os.fdopen(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w", encoding="utf-8") as f:
    for fila in filas:
        f.write(json.dumps(dict(zip(claves, fila)), ensure_ascii=False) + "\n")
os.replace(tmp, destino)
print(f"{len(filas)} lugares -> {destino}")
```

- [ ] **Step 2: Un archivo de prueba**

`tests/fixtures/overture-ve-2026-09-23.1.jsonl` (cinco renglones; el cuarto está roto y el quinto repite el id del
primero):

```
{"id":"prueba-1","nombre":"Arepera Uno","categoriaBase":"restaurant","categoriaFina":"venezuelan_restaurant","lat":10.4806,"lon":-66.9036,"direccion":"Av. Urdaneta","telefonos":["+584141234567"],"correos":["uno@gmail.com"],"webs":[],"redes":["https://www.facebook.com/prueba1"],"confianza":0.93}
{"id":"prueba-2","nombre":"Farmacia Dos","categoriaBase":"pharmacy_and_drug_store","categoriaFina":"pharmacy","lat":10.162,"lon":-68.0077,"direccion":null,"telefonos":[],"correos":[],"webs":["https://farmaciados.com.ve/"],"redes":[],"confianza":0.81}
{"id":"prueba-3","nombre":"Hotel Madrid","categoriaBase":"hotel","categoriaFina":"hotel","lat":40.4,"lon":-3.7,"direccion":"","telefonos":[],"correos":[],"webs":[],"redes":[],"confianza":0.9}
{"id":"prueba-4","nombre":"Renglon cortado","categoriaBase":"rest
{"id":"prueba-1","nombre":"Arepera Uno (repetida)","categoriaBase":"restaurant","categoriaFina":"","lat":10.48,"lon":-66.9,"direccion":"","telefonos":[],"correos":[],"webs":[],"redes":[],"confianza":0.7}
```

- [ ] **Step 3: El cargador**

`scripts/cargar-overture.mts`:

```ts
// scripts/cargar-overture.mts — valida el JSONL que deja extraer-overture.py y, con --aplicar, REEMPLAZA la tabla
// LugarOverture en una sola transaccion. Sin --aplicar solo cuenta. Se niega a aplicar si lo nuevo es menos de la
// mitad de lo que ya hay (una descarga cortada no vacia el directorio).
// Uso (con el env cargado; DATABASE_URL decide la base):
//   npx tsx scripts/cargar-overture.mts ~/overture/ve-2026-09-23.1.jsonl [--aplicar]
import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { validarLugar, puedeReemplazar, type LugarOverture } from "../src/lib/overture-contrato";
import { reemplazarLugares } from "../src/lib/overture";

const args = process.argv.slice(2);
const archivo = args.find((a) => !a.startsWith("--"));
const aplicar = args.includes("--aplicar");
const m = archivo ? /ve-(\d{4}-\d{2}-\d{2}\.\d+)\.jsonl$/.exec(path.basename(archivo)) : null;
if (!archivo || !m) { console.error("Uso: cargar-overture.mts <ruta>/ve-<publicacion>.jsonl [--aplicar]"); process.exit(2); }
const publicacion = m[1];

const porId = new Map<string, LugarOverture>();
let ilegibles = 0, invalidos = 0, repetidos = 0;
for (const renglon of readFileSync(archivo, "utf8").split("\n")) {
  if (!renglon.trim()) continue;
  let crudo: unknown;
  try { crudo = JSON.parse(renglon); } catch { ilegibles++; continue; }
  const l = validarLugar(crudo, publicacion);
  if (!l) { invalidos++; continue; }
  // El primero gana: el extractor no deberia repetir ids, pero un id repetido reventaria la carga entera.
  if (porId.has(l.id)) { repetidos++; continue; }
  porId.set(l.id, l);
}
const lugares = [...porId.values()];
const actuales = await prisma.lugarOverture.count();
console.log(`Publicación ${publicacion}: ${lugares.length} válidas, ${ilegibles} ilegibles, ${invalidos} inválidas, ${repetidos} con id repetido.`);
console.log(`En la tabla hoy: ${actuales}.`);

let salida = 0;
if (!aplicar) {
  console.log("Sin --aplicar: no se escribió nada.");
} else if (!puedeReemplazar(actuales, lugares.length)) {
  console.error(`ALTO: ${lugares.length} filas nuevas son menos de la mitad de las ${actuales} que hay. No se reemplazó nada.`);
  salida = 1;
} else {
  console.log(`Reemplazadas: ahora hay ${await reemplazarLugares(lugares)} lugares.`);
}
await prisma.$disconnect();
process.exit(salida);
```

- [ ] **Step 4: Probarlo contra la base de tests**

```bash
cd ~/dev-clon-prospectos
( set -a; . ~/.config/prospectos/env; set +a; export DATABASE_URL="$TEST_DATABASE_URL"
  F=tests/fixtures/overture-ve-2026-09-23.1.jsonl
  node_modules/.bin/tsx scripts/cargar-overture.mts "$F"; echo "salida $?"
  node_modules/.bin/tsx scripts/cargar-overture.mts "$F" --aplicar; echo "salida $?"
  node_modules/.bin/tsx scripts/cargar-overture.mts "$F" --aplicar; echo "salida $?"
  node_modules/.bin/tsx scripts/cargar-overture.mts tests/fixtures/overpass.json; echo "salida $?" )
```

Expected, en orden:

```
Publicación 2026-09-23.1: 2 válidas, 1 ilegibles, 1 inválidas, 1 con id repetido.
En la tabla hoy: 0.
Sin --aplicar: no se escribió nada.
salida 0
Publicación 2026-09-23.1: 2 válidas, 1 ilegibles, 1 inválidas, 1 con id repetido.
En la tabla hoy: 0.
Reemplazadas: ahora hay 2 lugares.
salida 0
Publicación 2026-09-23.1: 2 válidas, 1 ilegibles, 1 inválidas, 1 con id repetido.
En la tabla hoy: 2.
Reemplazadas: ahora hay 2 lugares.
salida 0
Uso: cargar-overture.mts <ruta>/ve-<publicacion>.jsonl [--aplicar]
salida 2
```

Si «En la tabla hoy» no es 0 en la primera corrida, quedó algo de una suite anterior: correr
`npm run test:db -- tests/overture.test.ts` (su `afterAll` limpia) y repetir.

- [ ] **Step 5: El freno de la mitad, de verdad**

Los dos auxiliares van como archivos temporales en la raíz del clon (los imports relativos salen de ahí) y se borran
al terminar. **Crearlos con la herramienta de escritura, no con un heredoc dentro de otro.**

`tmp-sembrar-cuatro.mts`:

```ts
import { prisma } from "./src/lib/db";
const base = { categoriaBase: "restaurant", categoriaFina: "", lat: 10.48, lon: -66.9, direccion: "", telefonos: "", correos: "", webs: "", redes: "", confianza: 0.9, publicacion: "2026-09-23.1" };
await prisma.lugarOverture.deleteMany();
await prisma.lugarOverture.createMany({ data: ["a", "b", "c", "d"].map((id) => ({ ...base, id, nombre: id })) });
await prisma.$disconnect();
```

`tmp-contar-y-vaciar.mts`:

```ts
import { prisma } from "./src/lib/db";
console.log("quedan", await prisma.lugarOverture.count());
await prisma.lugarOverture.deleteMany();
await prisma.$disconnect();
```

```bash
cd ~/dev-clon-prospectos
( set -a; . ~/.config/prospectos/env; set +a; export DATABASE_URL="$TEST_DATABASE_URL"
  D=$(mktemp -d); head -1 tests/fixtures/overture-ve-2026-09-23.1.jsonl > "$D/ve-2026-10-21.0.jsonl"
  node_modules/.bin/tsx tmp-sembrar-cuatro.mts
  node_modules/.bin/tsx scripts/cargar-overture.mts "$D/ve-2026-10-21.0.jsonl" --aplicar; echo "salida $?"
  node_modules/.bin/tsx tmp-contar-y-vaciar.mts
  rm -r "$D" )
rm tmp-sembrar-cuatro.mts tmp-contar-y-vaciar.mts; git status --short
```

Expected: `ALTO: 1 filas nuevas son menos de la mitad de las 4 que hay. No se reemplazó nada.`, `salida 1`,
`quedan 4`, y `git status` sin los dos temporales.

- [ ] **Step 6: El extractor compila (no se corre aquí: sale a internet y se corre una vez, en la Task 6)**

Run: `python3 -m py_compile scripts/extraer-overture.py && python3 scripts/extraer-overture.py malo; echo "salida $?"`
Expected: `Uso: extraer-overture.py <publicacion>   (por ejemplo 2026-09-23.1)` y `salida 1`.

- [ ] **Step 7: Commit**

```bash
npx tsc --noEmit && echo TSC_OK
git add scripts/extraer-overture.py scripts/cargar-overture.mts tests/fixtures/overture-ve-2026-09-23.1.jsonl
git commit -q -F - <<'EOF'
feat(overture): scripts para extraer de Overture y cargar la tabla, con freno de descarga cortada

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: La pantalla

**Files:**
- Modify: `src/componentes/FormOverpass.tsx` (se reescribe entero)
- Modify: `src/app/(panel)/buscar/page.tsx` (imports, carga de datos y la línea que monta `FormOverpass`)
- Create: `scripts/verificar-flujo-overture.mts`

**Interfaces:**
- Consumes: de Task 3 `buscarOverture`; de Task 2 `publicacionCargada`; de Task 1 `reglaDeNicho`,
  `fechaDePublicacion`; `buscarOverpass` (existente).
- Produces: `FormOverpass` recibe una prop más:
  `directorio: { publicacion: string | null; sinNicho: number[] }` (`sinNicho` son los `id` de los nichos sin regla).

- [ ] **Step 1: Escribir el recorrido que falla**

`scripts/verificar-flujo-overture.mts`:

```ts
// scripts/verificar-flujo-overture.mts — recorrido real a 390 px de «Buscar en el directorio abierto»: que los dos
// botones quepan, que el lote se cree con la fuente a la vista, que los selectores no se reinicien y que un nicho
// sin equivalencia lo diga. Siembra lo suyo, entra con un dueno temporal y al terminar borra lo que creo.
// SOLO contra el servidor de desarrollo del clon con la base de tests.
// Uso (desde el clon, con su next dev en 3014):
//   DATABASE_URL="$TEST_DATABASE_URL" BASE_URL=http://127.0.0.1:3014 npx tsx scripts/verificar-flujo-overture.mts
import bcrypt from "bcryptjs";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { prisma } from "../src/lib/db";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3014";
if (!(process.env.DATABASE_URL ?? "").includes("prospectos_test")) { console.error("ALTO: DATABASE_URL no es la base de tests."); process.exit(2); }
if (/neracosu\.com|:3013(\/|$)/.test(BASE)) { console.error("ALTO: BASE_URL apunta a produccion. Usa el servidor de desarrollo del clon."); process.exit(2); }

const sello = Date.now();
const marca = `(PRUEBA) ${sello}`;
const PIN_PANEL = "582931";
const errores: string[] = [];
const pasos: string[] = [];
const revisar = (ok: boolean, que: string) => { (ok ? pasos : errores).push(que); };
const creado = { duenoId: 0, nichos: [] as number[], lugares: [] as string[] };
const nichoDe = async (slug: string, nombre: string) => {
  const ya = await prisma.nicho.findFirst({ where: { slug } });
  if (ya) return ya;
  const n = await prisma.nicho.create({ data: { slug, nombre, mensajeInicial: "Hola {nombre}: {enlace}", mensajeSeguimiento: "Hola de nuevo {nombre}: {enlace}", plantillaPropuesta: slug, diasSeguimiento: 3 } });
  creado.nichos.push(n.id);
  return n;
};

mkdirSync("capturas/overture", { recursive: true });
const b = await chromium.launch();
try {
  if (await prisma.lugarOverture.count()) throw new Error("la tabla LugarOverture de la base de tests no esta vacia; limpiala antes de correr esto");
  const restaurantes = await nichoDe("restaurantes-y-bares", "Restaurantes y bares");
  const hoteles = await nichoDe("hoteles", "Hoteles");
  const base = { categoriaBase: "restaurant", categoriaFina: "venezuelan_restaurant", lat: 10.2469, lon: -67.5958, direccion: "Av. Bolívar", correos: "", webs: "", confianza: 0.9, publicacion: "2026-09-23.1" };
  const lugares = [
    { ...base, id: `prueba-${sello}-1`, nombre: `Arepera Uno ${marca}`, telefonos: "+584141234567", redes: `https://www.facebook.com/prueba${sello}a` },
    { ...base, id: `prueba-${sello}-2`, nombre: `Arepera Dos ${marca}`, telefonos: "", correos: "dos@gmail.com", redes: `https://www.facebook.com/prueba${sello}b` },
    { ...base, id: `prueba-${sello}-3`, nombre: `Arepera Muda ${marca}`, telefonos: "", redes: `https://www.facebook.com/prueba${sello}c` },
  ];
  await prisma.lugarOverture.createMany({ data: lugares });
  creado.lugares = lugares.map((l) => l.id);
  const dueno = await prisma.usuario.create({ data: { nombre: `Dueño ${marca}`, rol: "dueno", pinHash: await bcrypt.hash(PIN_PANEL, 10), metaDiaria: 10 } });
  creado.duenoId = dueno.id;

  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
  await pg.goto(`${BASE}/entrar`);
  for (const d of PIN_PANEL) await pg.getByRole("button", { name: d, exact: true }).click();
  await pg.waitForURL(/\/hoy$/);

  await pg.goto(`${BASE}/buscar?t=osm`);
  const nicho = pg.locator('select[name="nichoId"]');
  const ciudad = pg.locator('select[name="ciudad"]');
  const osm = pg.getByRole("button", { name: "Buscar en OpenStreetMap" });
  const directorio = pg.getByRole("button", { name: "Buscar en el directorio abierto" });
  await directorio.waitFor();
  revisar(await osm.isVisible(), "el boton de OpenStreetMap sigue ahi");
  revisar((await pg.getByText("Directorio del 23/09/2026").count()) === 1, "dice de cuando es el directorio");
  const casilla = pg.getByRole("checkbox", { name: "Solo con teléfono o correo" });
  revisar(await casilla.isChecked(), "la casilla viene marcada");
  for (const boton of [osm, directorio]) {
    const caja = (await boton.boundingBox())!;
    revisar(caja.x >= 0 && caja.x + caja.width <= 390 && caja.height >= 44, `«${await boton.innerText()}» cabe y mide al menos 44 px de alto`);
  }
  await pg.screenshot({ path: "capturas/overture/01-formulario.png", fullPage: true });

  // Un nicho sin equivalencia: el boton se apaga y dice por que.
  await nicho.selectOption(String(hoteles.id));
  revisar(await directorio.isDisabled(), "con Hoteles (de paso) el boton del directorio se apaga");
  revisar((await pg.getByText("Este nicho no está en el directorio.").count()) === 1, "y dice por que");
  revisar(await osm.isEnabled(), "el de OpenStreetMap sigue activo");
  await pg.screenshot({ path: "capturas/overture/02-nicho-sin-directorio.png", fullPage: true });

  // La busqueda: con la casilla, dos de los tres.
  await nicho.selectOption(String(restaurantes.id));
  await ciudad.selectOption("maracay");
  await directorio.click();
  const resumen = pg.locator("section.tarjeta").filter({ hasText: "Se consultó" });
  await resumen.waitFor({ timeout: 10_000 });
  revisar((await resumen.innerText()).includes("Restaurantes y bares · Maracay · Directorio abierto"), "el resumen dice nicho, ciudad y fuente");
  revisar((await resumen.innerText()).includes("2 fichas encontradas"), "con la casilla entran las dos que tienen telefono o correo");
  revisar((await nicho.inputValue()) === String(restaurantes.id) && (await ciudad.inputValue()) === "maracay", "los selectores no se reinician");
  await pg.screenshot({ path: "capturas/overture/03-resumen.png", fullPage: true });
  const ancho = await pg.evaluate(() => document.documentElement.scrollWidth);
  revisar(ancho <= 390, `sin scroll horizontal a 390 px (${ancho}px)`);

  // En la bandeja el lote se llama «Directorio abierto».
  await resumen.getByRole("link", { name: "Revisar en la bandeja" }).click();
  await pg.waitForURL(/t=bandeja&lote=/);
  revisar((await pg.getByText("Directorio abierto").count()) >= 1, "la bandeja nombra el origen «Directorio abierto»");
  revisar((await pg.getByText(`Arepera Uno ${marca}`).count()) >= 1, "y trae la ficha");
  await pg.screenshot({ path: "capturas/overture/04-bandeja.png", fullPage: true });

  // De vuelta: recuerda donde iba. Sin la casilla entra la tercera (las otras dos ya estan pendientes).
  await pg.goto(`${BASE}/buscar?t=osm`);
  await directorio.waitFor();
  await pg.waitForFunction((v) => (document.querySelector('select[name="ciudad"]') as HTMLSelectElement | null)?.value === v, "maracay");
  revisar((await nicho.inputValue()) === String(restaurantes.id), "al volver de la bandeja recuerda el nicho");
  await casilla.uncheck();
  await directorio.click();
  await resumen.waitFor({ timeout: 10_000 });
  const texto = await resumen.innerText();
  revisar(/Nuevas\s*1/.test(texto) && /Ya estaban\s*2/.test(texto), "sin la casilla entra la que no tiene contacto y las otras dos ya estaban");
} catch (e) {
  errores.push(`excepcion: ${(e as Error).message}`);
} finally {
  await b.close();
  if (creado.duenoId) await prisma.revision.deleteMany({ where: { usuarioId: creado.duenoId } });
  await prisma.lugarOverture.deleteMany({ where: { id: { in: creado.lugares } } });
  if (creado.duenoId) await prisma.usuario.delete({ where: { id: creado.duenoId } }).catch((e) => errores.push(`LIMPIEZA: quedo el dueno temporal ${creado.duenoId}: ${(e as Error).message}`));
  for (const id of creado.nichos) await prisma.nicho.delete({ where: { id } }).catch((e) => errores.push(`LIMPIEZA: quedo el nicho ${id}: ${(e as Error).message}`));
  await prisma.$disconnect();
}
for (const p of pasos) console.log(`  ok  ${p}`);
console.log(errores.length ? `FALLA:\n- ${errores.join("\n- ")}` : `PASA: ${pasos.length} comprobaciones del directorio abierto`);
process.exit(errores.length ? 1 : 0);
```

- [ ] **Step 2: Levantar el servidor de desarrollo del clon y ver fallar el recorrido**

```bash
cd ~/dev-clon-prospectos
set -a; . ~/.config/prospectos/env; set +a
export DATABASE_URL="$TEST_DATABASE_URL" PROSPECTOS_DIR_ARCHIVOS="$(mktemp -d)"; unset NODE_ENV
nohup node node_modules/next/dist/bin/next dev -p 3014 -H 127.0.0.1 > "$PROSPECTOS_DIR_ARCHIVOS/dev.log" 2>&1 &
PID=$!; echo "PID $PID"
```

**Anotar el PID**: se usa al final de esta tarea. El `cd` va en una orden aparte y sin subshell, para que `$!` sea
node y no un envoltorio.

Run: `BASE_URL=http://127.0.0.1:3014 node_modules/.bin/tsx scripts/verificar-flujo-overture.mts`
Expected: FALLA con `excepcion: … Buscar en el directorio abierto …` (el botón todavía no existe).

- [ ] **Step 3: Reescribir el formulario**

`src/componentes/FormOverpass.tsx` completo:

```tsx
"use client";
import { useEffect, useState, useTransition } from "react";
import { buscarOverpass, buscarOverture } from "@/acciones/buscar";
import { fechaDePublicacion } from "@/lib/overture-contrato";
import { ResumenLote } from "./ResumenLote";

type Fuente = "osm" | "directorio";
type Salida = { lote: string; nuevos: number; repetidos: number; errores: number; consultado: string; aviso: string };

const CLAVE_ULTIMA = "pr:buscar-osm";
const NOMBRE_FUENTE: Record<Fuente, string> = { osm: "OpenStreetMap", directorio: "Directorio abierto" };

// Dos fuentes con el mismo nicho y la misma ciudad. OpenStreetMap sale a la red y tarda: hasta 90 s, mas 5 s de
// cola si hay otra consulta en vuelo; el boton se apaga y el texto de espera dice cuanto, porque una pantalla quieta
// durante minuto y medio parece rota. El directorio abierto (Overture Maps) ya esta en la base y responde al momento.
export function FormOverpass({
  nichos,
  ciudades,
  directorio,
}: {
  nichos: { id: number; nombre: string }[];
  ciudades: { slug: string; nombre: string }[];
  directorio: { publicacion: string | null; sinNicho: number[] };
}) {
  const [error, setError] = useState("");
  const [salida, setSalida] = useState<Salida | null>(null);
  const [enVuelo, setEnVuelo] = useState<Fuente | null>(null);
  const [pendiente, empezar] = useTransition();
  // Controlados: React vacia un formulario no controlado cuando termina su accion, y con
  // 19 nichos y muchas ciudades volver al primero de la lista hace perder por donde se iba.
  const [nichoId, setNichoId] = useState(nichos[0] ? String(nichos[0].id) : "");
  const [ciudad, setCiudad] = useState(ciudades[0]?.slug ?? "");

  // En un efecto y no en el estado inicial: el servidor no tiene localStorage y la hidratacion tiene que coincidir.
  // Lo recordado sobrevive a la ida a la bandeja y a cambiar de pestana.
  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem(CLAVE_ULTIMA) ?? "null");
      if (nichos.some((n) => String(n.id) === u?.nichoId)) setNichoId(u.nichoId);
      if (ciudades.some((c) => c.slug === u?.ciudad)) setCiudad(u.ciudad);
    } catch { /* sin localStorage o con algo ilegible solo se pierde el recuerdo */ }
  }, []);

  function recordar(n: string, c: string) {
    try { localStorage.setItem(CLAVE_ULTIMA, JSON.stringify({ nichoId: n, ciudad: c })); } catch {}
  }

  const motivoSinDirectorio = !directorio.publicacion
    ? "El directorio no está cargado todavía."
    : directorio.sinNicho.includes(Number(nichoId))
      ? "Este nicho no está en el directorio."
      : "";

  return (
    <>
      <form
        className="tarjeta"
        onSubmit={(e) => {
          // onSubmit y no action: al terminar una action React reinicia el formulario entero.
          e.preventDefault();
          const boton = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
          const fuente: Fuente = boton?.value === "directorio" ? "directorio" : "osm";
          const fd = new FormData(e.currentTarget);
          const nId = String(fd.get("nichoId") ?? "");
          const cSlug = String(fd.get("ciudad") ?? "");
          recordar(nId, cSlug);
          const n = nichos.find((x) => String(x.id) === nId)?.nombre ?? "";
          const c = ciudades.find((x) => x.slug === cSlug)?.nombre ?? "";
          const consultado = `${n} · ${c} · ${NOMBRE_FUENTE[fuente]}`;
          // Antes de empezar(): dentro de la transicion no se pintaria hasta que responda el servidor.
          setEnVuelo(fuente);
          empezar(async () => {
            setError("");
            setSalida(null);
            if (fuente === "directorio") {
              const r = await buscarOverture(fd);
              if (r.ok) setSalida({ ...r.datos, consultado, aviso: "" });
              else setError(r.mensaje);
            } else {
              const r = await buscarOverpass(fd);
              if (r.ok) {
                const d = r.datos.antiguedadDias;
                const aviso = !r.datos.desdeCache
                  ? ""
                  : d > 0
                    ? `Resultados de hace ${d} ${d === 1 ? "día" : "días"}: salieron de la consulta guardada.`
                    : "Resultados de hoy: salieron de la consulta guardada.";
                setSalida({ ...r.datos, consultado, aviso });
              } else setError(r.mensaje);
            }
            setEnVuelo(null);
          });
        }}
      >
        <b>Buscar en el mapa</b>
        <p className="suave">
          Trae los negocios del nicho con lo que cada uno publicó: nombre, dirección y, cuando existen, teléfono,
          correo, web y redes. Una ciudad por vez.
        </p>
        <label className="campo">
          <span>Nicho</span>
          <select
            name="nichoId"
            required
            value={nichoId}
            onChange={(e) => {
              setNichoId(e.target.value);
              recordar(e.target.value, ciudad);
            }}
          >
            {nichos.map((n) => (
              <option key={n.id} value={n.id}>
                {n.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Ciudad</span>
          <select
            name="ciudad"
            required
            value={ciudad}
            onChange={(e) => {
              setCiudad(e.target.value);
              recordar(nichoId, e.target.value);
            }}
          >
            {ciudades.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="boton boton--primario" disabled={pendiente} type="submit" name="fuente" value="osm">
          {enVuelo === "osm" ? "Consultando…" : "Buscar en OpenStreetMap"}
        </button>
        <p className="suave" role="status" aria-live="polite">
          {enVuelo === "osm"
            ? "Consultando OpenStreetMap: puede tardar hasta minuto y medio. No cierres esta pantalla."
            : "El resultado se guarda 7 días: la misma ciudad con el mismo nicho no se vuelve a consultar."}
        </p>
        <div className="fila-botones fila-botones--secundarias">
          <button className="boton" disabled={pendiente || Boolean(motivoSinDirectorio)} type="submit" name="fuente" value="directorio">
            {enVuelo === "directorio" ? "Buscando…" : "Buscar en el directorio abierto"}
          </button>
        </div>
        <label className="campo">
          <span>
            <input type="checkbox" name="soloContactables" defaultChecked /> Solo con teléfono o correo
          </span>
        </label>
        <p className="suave">
          {motivoSinDirectorio ||
            `Directorio del ${fechaDePublicacion(directorio.publicacion ?? "")}: lo que cada negocio publicó en su página de Facebook. Responde al momento.`}
        </p>
      </form>
      {salida && (
        <ResumenLote lote={salida.lote} nuevos={salida.nuevos} repetidos={salida.repetidos} errores={salida.errores}>
          <p className="suave">
            Se consultó: <b>{salida.consultado}</b>
          </p>
          {salida.aviso && <p className="aviso">{salida.aviso}</p>}
        </ResumenLote>
      )}
    </>
  );
}
```

Notas para quien lo implemente:
- El texto «Directorio del 23/09/2026» que busca el recorrido es el comienzo de ese párrafo; `getByText` casa por
  subcadena.
- La casilla es no controlada (`defaultChecked`): como el envío va por `onSubmit`, React ya no reinicia el formulario
  y conserva lo que el usuario marcó.
- `buscarOverpass` ignora `soloContactables` (zod descarta claves que no conoce).

- [ ] **Step 4: La página le pasa el directorio**

En `src/app/(panel)/buscar/page.tsx`, sumar a los imports:

```ts
import { publicacionCargada } from "@/lib/overture";
import { reglaDeNicho } from "@/lib/overture-contrato";
```

cambiar la carga de datos para que traiga la publicación solo en la pestaña del mapa:

```ts
  const [nichos, lotes, lote, publicacion] = await Promise.all([
    listarNichos(),
    t === "bandeja" && !pedido ? lotesRecientes() : Promise.resolve([]),
    t === "bandeja" && pedido ? loteConDetalle(pedido, { pagina }) : Promise.resolve(null),
    t === "osm" ? publicacionCargada() : Promise.resolve(null),
  ]);
```

y la línea que monta el formulario:

```tsx
      {t === "osm" && (
        <FormOverpass
          nichos={nichos}
          ciudades={CIUDADES.map((c) => ({ slug: c.slug, nombre: c.nombre }))}
          directorio={{ publicacion, sinNicho: nichos.filter((n) => !reglaDeNicho(n.slug)).map((n) => n.id) }}
        />
      )}
```

- [ ] **Step 5: Correr el recorrido y verlo pasar**

Run: `npx tsc --noEmit && echo TSC_OK; BASE_URL=http://127.0.0.1:3014 node_modules/.bin/tsx scripts/verificar-flujo-overture.mts`
Expected: `TSC_OK` y `PASA: 16 comprobaciones del directorio abierto`.

- [ ] **Step 6: Mirar las cuatro capturas**

Abrir con la herramienta de lectura `capturas/overture/01-formulario.png`, `02-nicho-sin-directorio.png`,
`03-resumen.png` y `04-bandeja.png`. Comprobar a ojo: los dos botones se distinguen (el de OpenStreetMap es el
principal), la casilla queda pegada a su botón, nada se corta a 390 px y el párrafo del directorio se lee. Si algo
se ve mal, corregir el marcado o `src/app/globals.css` y repetir el Step 5.

- [ ] **Step 7: Apagar el servidor de desarrollo, por PID**

```bash
kill $PID $(pgrep -P $PID); sleep 2; ss -ltnp | grep 3014; echo "puerto 3014 libre si no salio nada arriba"
pm2 list | grep -E "name|online|errored|stopped"
```

Expected: el puerto libre y los cinco procesos `online` con el mismo contador de reinicios que antes.
(`verificar-flujo-buscar.mts` no se corre aquí: pide un PIN real y sale a Overpass; la búsqueda de OpenStreetMap la
cubren los tests de `tests/buscar.test.ts`, que no cambian.)

- [ ] **Step 8: Suites completas y commit**

```bash
npm test 2>&1 | tail -4; npm run test:db 2>&1 | tail -4
git add src/componentes/FormOverpass.tsx "src/app/(panel)/buscar/page.tsx" scripts/verificar-flujo-overture.mts
git commit -q -F - <<'EOF'
feat(overture): boton «Buscar en el directorio abierto» en la pestana Mapa y su recorrido a 390 px

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Datos reales, notas y despliegue (con Neri)

**Files:**
- Modify: `docs/superpowers/specs/2026-10-05-importador-overture-design.md` (licencia y estado)
- Modify: `CLAUDE.md` (bloque nuevo dentro de «Pieza 2»)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: la rama `overture` lista para fusionar; tras el ok de Neri, la pieza en producción con la tabla cargada.

Esta tarea la hace la sesión principal, no un subagente: sale a internet, compila y toca producción.

- [ ] **Step 1: Extraer la publicación (única salida a internet)**

```bash
cd ~/dev-clon-prospectos && python3 scripts/extraer-overture.py 2026-09-23.1 && ls -la ~/overture/ && wc -l ~/overture/ve-2026-09-23.1.jsonl
```

Expected: `~21000 lugares -> /home/neracosu/overture/ve-2026-09-23.1.jsonl`, archivo `-rw-------`. Si hay una
publicación más nueva en el listado de S3, usar esa.

- [ ] **Step 2: Confirmar la licencia de la fuente `meta`**

```bash
python3 - <<'EOF'
import duckdb
c = duckdb.connect()
c.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2'; SET threads=3; SET memory_limit='2GB'")
print(c.execute("""
  SELECT s.dataset, s.license, count(*) FROM (
    SELECT unnest(sources) s FROM read_parquet('s3://overturemaps-us-west-2/release/2026-09-23.1/theme=places/type=place/*', hive_partitioning=0)
    WHERE bbox.xmin BETWEEN -73.5 AND -59.7 AND bbox.ymin BETWEEN 0.5 AND 12.3 AND addresses[1].country = 'VE' AND confidence >= 0.7
  ) GROUP BY 1, 2 ORDER BY 3 DESC
""").fetchall())
EOF
```

Anotar el resultado tal cual en el spec, bajo «Antes de cargar datos reales», punto 1. **Si la licencia de `meta` no
permite uso comercial o exige algo que el panel no cumple, parar aquí y hablar con Neri.**

- [ ] **Step 3: Carga de ensayo en la base de tests y muestra de 20 teléfonos para Neri**

Crear `tmp-muestra.mts` en la raíz del clon con la herramienta de escritura:

```ts
import { prisma } from "./src/lib/db";
import { ciudadPorSlug } from "./src/lib/overpass-contrato";
import { reglaDeNicho, prospectosDesdeOverture } from "./src/lib/overture-contrato";
import { lugaresDeOverture } from "./src/lib/overture";
const c = ciudadPorSlug("caracas")!;
for (const nicho of ["restaurantes-y-bares", "clinicas-y-consultorios"]) {
  const e = prospectosDesdeOverture(await lugaresDeOverture(reglaDeNicho(nicho)!, c), c, nicho, { soloContactables: true });
  console.log(`${nicho} en Caracas: ${e.length} fichas, ${e.filter((x) => x.whatsapp).length} con WhatsApp`);
  for (const x of e.filter((y) => y.whatsapp).slice(0, 10)) console.log(`${x.nombre} | ${x.whatsapp} | ${x.facebook}`);
}
await prisma.lugarOverture.deleteMany();
await prisma.$disconnect();
```

```bash
cd ~/dev-clon-prospectos
( set -a; . ~/.config/prospectos/env; set +a; export DATABASE_URL="$TEST_DATABASE_URL"
  node_modules/.bin/tsx scripts/cargar-overture.mts ~/overture/ve-2026-09-23.1.jsonl --aplicar
  node_modules/.bin/tsx tmp-muestra.mts )
rm tmp-muestra.mts
```

Expected: `Reemplazadas: ahora hay ~21000 lugares.` y dos bloques de diez líneas. La base de tests queda con la tabla
vacía otra vez.

Entregarle a Neri las 20 líneas para que pruebe a mano cuántos números siguen vivos. **Si son menos de la mitad, no
se despliega: se habla con Neri.**

- [ ] **Step 4: Notas en el spec y en `CLAUDE.md`**

En el spec: `**Estado:**` pasa a «implementada en la rama `overture`; pendiente de despliegue» y se anotan la
licencia (Step 2) y el resultado de la muestra (Step 3).

En `CLAUDE.md`, dentro del bloque «Pieza 2 (Buscador e importación)», después de la viñeta de Overpass:

```markdown
  - **Directorio abierto (Overture Maps, 5-oct):** segundo botón de la pestaña «Mapa», mismo nicho y ciudad. Lee la
    tabla `LugarOverture` (solo Venezuela, confianza ≥ 0,7): **el panel no sale a internet**, por eso responde al
    momento. Se llena a mano: `python3 scripts/extraer-overture.py <publicación>` (única salida a la red; deja
    `~/overture/ve-<publicación>.jsonl`) y luego `scripts/cargar-overture.mts <archivo> --aplicar` con el env
    cargado, que reemplaza la tabla en una transacción y **se niega si lo nuevo es menos de la mitad** de lo que hay.
    Overture publica una vez al mes. Reglas en `src/lib/overture-contrato.ts`: de nicho a categorías (`REGLAS_NICHO`;
    `hoteles` y `cosmeticos` no tienen: botón apagado), la ciudad **por distancia y no por nombre** (un lugar en el
    solape de dos radios es de la de centro más cercano), la fuente de cada dato es la página de Facebook del negocio
    y **sin Facebook ni web el lugar no entra**. Al agregar un nicho a `sembrar-nichos.mjs`, el test de los 19 slugs
    obliga a ponerlo en `REGLAS_NICHO` o en `SIN_EQUIVALENCIA`. Recorrido: `scripts/verificar-flujo-overture.mts`
    (⚠️ solo contra el clon y la base de tests, con `LugarOverture` vacía).
```

Commit:

```bash
git add docs/superpowers/specs/2026-10-05-importador-overture-design.md CLAUDE.md
git commit -q -F - <<'EOF'
docs(overture): licencia, muestra de telefonos y notas del directorio abierto

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

- [ ] **Step 5: Revisión de la rama y build en el clon**

Pedir la revisión de la rama completa (`superpowers:requesting-code-review`) y arreglar lo que salga. Después, **con
la certeza de que no hay otro build corriendo en el servidor** (`pgrep -af "next build"` sin más resultado que el
propio comando):

```bash
cd ~/dev-clon-prospectos && ( set -a; . ~/.config/prospectos/env; set +a; export DATABASE_URL="$TEST_DATABASE_URL"; npm run build 2>&1 | tail -6 )
```

Expected: el build termina con la tabla de rutas, sin errores.

- [ ] **Step 6: Mostrarle a Neri las capturas y pedir el ok para desplegar**

Enseñar `capturas/overture/01` a `04` y el resultado de la muestra de teléfonos. **Sin su ok no se sigue.**

- [ ] **Step 7: Fusionar y desplegar (con el ok)**

```bash
git -C ~/dev-clon-prospectos push origin overture
cd /home/neracosu/public_html/prospectos.neracosu.com
pm2 list | grep -E "name|online|errored|stopped"
git status --short | head -3
git merge --ff-only overture
npx tsc --noEmit && npm test 2>&1 | tail -3 && npm run test:db 2>&1 | tail -3
( set -a; . ~/.config/prospectos/env; set +a
  npx prisma generate | tail -1
  npx prisma migrate deploy 2>&1 | grep -vi "mysql://" | tail -4
  npm run build 2>&1 | tail -6 )
pm2 restart prospectos
```

Expected: `migrate deploy` aplica `20261005120000_lugar_overture`; el build termina bien. Anotar el contador de
reinicios de `prospectos` antes del restart: después debe ser ese más uno.

- [ ] **Step 8: Cargar el directorio en producción**

```bash
( set -a; . ~/.config/prospectos/env; set +a
  npx tsx scripts/cargar-overture.mts ~/overture/ve-2026-09-23.1.jsonl
  npx tsx scripts/cargar-overture.mts ~/overture/ve-2026-09-23.1.jsonl --aplicar )
```

Expected: la primera corrida cuenta sin escribir («En la tabla hoy: 0»); la segunda termina con
`Reemplazadas: ahora hay ~21000 lugares.`

- [ ] **Step 9: Verificar en producción**

```bash
curl -s -o /dev/null -w 'entrar: %{http_code}\n' https://prospectos.neracosu.com/entrar
curl -s -o /dev/null -w 'buscar sin sesion: %{http_code}\n' "https://prospectos.neracosu.com/buscar?t=osm"
pm2 list | grep -E "name|online|errored|stopped"
pm2 logs prospectos --lines 20 --nostream 2>&1 | grep -E "mensualidades|revision|rror" | tail -4
```

Expected: `200`, `307`, los cinco `online`, y las líneas `[mensualidades]` y `[revision]` del arranque. Pedirle a
Neri que busque un nicho y una ciudad desde su teléfono y confirme que el lote llega a la bandeja. `pm2 save` solo
con los cinco `online`. El push a GitHub, cuando Neri lo pida.
