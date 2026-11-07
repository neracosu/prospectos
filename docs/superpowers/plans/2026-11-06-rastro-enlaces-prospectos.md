# Rastro de enlaces a prospectos — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada enlace que se le manda a un prospecto (propuesta a medida, demo con su marca, `/p/<código>`) deje en su ficha una línea de tiempo por visitante (hora, aparato, lugar, páginas, duración, reenvíos) y una línea de resumen en la tarjeta del tablero.

**Architecture:** Dos fuentes que se funden en una tabla `VisitaEnlace`: un lector de los access-logs de Apache (`src/lib/rastro-lector.ts`, lo corre el cron en proceso aparte y el botón «Actualizar» en el panel) y un script público `public/rastro.js` que manda `inicio`/`fin`/`clic` a `POST /api/rastro/evento`. Lo puro (parser, clasificación de user-agents, visitante, fusión, resúmenes) vive en `src/lib/rastro-contrato.ts` con pruebas sin base. La geolocalización (DB-IP Lite `.mmdb`, 130 MB en memoria) ocurre **solo** en el script del cron.

**Tech Stack:** Next 15 (App Router, server actions), Prisma 6 + MySQL, Zod 4, Vitest 4, `mmdb-lib` 3 (nuevo, puro JS), `tsx` para scripts `.mts`, Node 20.

**Spec:** `docs/superpowers/specs/2026-11-06-rastro-enlaces-prospectos-design.md`

## Global Constraints

- Español de Venezuela en la interfaz; código y comentarios sin acentos (como el resto del repo). **Ni nombres ni URLs de prospectos reales** en código, pruebas, fixtures ni docs: hosts de prueba `demo-ejemplo.neracosu.com`, IPs de documentación `203.0.113.x` / `198.51.100.x`.
- Lo puro en `src/lib/rastro-contrato.ts` **sin importar** `next/*` ni `@/lib/db`. Las pruebas con base van con `describe.runIf(DB_HABILITADA)` y se corren con `npm run test:db`; las puras con `npm test`.
- Migración **a mano** en `prisma/migrations/20261107090000_rastro_enlaces/migration.sql` (formato de `20261031090000_fichas_correo`). `npx prisma migrate deploy` lo corre la sesión principal, no un subagente.
- El servidor está en hora de Los Ángeles. Toda hora visible va en `America/Caracas`. Las líneas de log traen su desfase (`-0800`): se respeta.
- Los access-logs viven en `/home/neracosu/access-logs/<host>-ssl_log` (vivo, se trunca a diario ~04:12 hora del servidor) y `/home/neracosu/logs/<host>-ssl_log-<Mes>-<Año>.gz` (mensual, gzip multi-miembro). Las rutas base son configurables por env (`RASTRO_DIR_LOGS`, `RASTRO_DIR_ARCHIVO`) para que las pruebas usen directorios temporales.
- El panel (rutas, acciones, páginas) **nunca** carga el `.mmdb`. Solo `scripts/rastro-leer.mts`.
- Un build a la vez y lo lanza la sesión principal. Los subagentes verifican con `npx tsc --noEmit` y `npm test`.
- `TOKEN` de enlace = `generarCodigo()` (22 base64url, `CODIGO_VALIDO`), igual que `EnvioCorreo.token`.
- Las visitas guardan la IP pero la interfaz **nunca** la muestra.

## Review Focus

1. Línea de log con comillas escapadas en el user-agent (`\"`) o truncada a la mitad: el parser devuelve `null` y el lector sigue con la siguiente, sin tirar la pasada. (Prueba en Task 2.)
2. Truncado del archivo vivo con el **mismo inode** y tamaño menor (lo que hace cPanel): el lector relee el `.gz` del mes y el vivo desde cero y **no duplica** ninguna visita. (Prueba en Task 5.)
3. Rutas con query string, con `index.html` y anidadas (`/demo/` y `/demo/panel/`): la visita cae en el enlace del prefijo más largo; `/demo/panel/?x=1` y `/demo/panel/index.html` son la misma página. (Prueba en Task 2.)
4. Un teléfono de prospecto que sale por la misma IP de operadora que el teléfono de Neri (CGNAT) pero con otro user-agent **no** es propio. Y la misma IP con el mismo UA sí. (Prueba en Task 4.)
5. `/api/rastro/evento` con token inexistente, cuerpo de 3 KB, `Origin` ajeno o UA de robot: no guarda nada y responde 404/400/403/204 respectivamente, nunca 500. (Prueba en Task 7.)
6. Sin archivo `.mmdb` o IP privada: la visita queda `geoPendiente = false`, `pais = ""` y la ficha dice «ubicación desconocida»; nunca «en unos minutos» para siempre. (Prueba en Task 6.)

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `prisma/schema.prisma`, `prisma/migrations/20261107090000_rastro_enlaces/migration.sql` | `EnlaceEnviado`, `VisitaEnlace`, `LecturaLog`; fila `candado_rastro` |
| `src/lib/rastro-contrato.ts` (nuevo, puro) | parser de línea *combined*, clasificación de UA, `visitanteDe`, `resumirAparato`, prefijos, fusión de la línea de tiempo, resúmenes, normalización del evento JS, etiqueta `<script>` |
| `src/lib/rastro.ts` (nuevo, base) | enlaces (registrar, listar, desactivar, obtener-o-crear `/p/`), visitas (insertar, listar por prospecto, resúmenes para el tablero), propios (listas, marcar), evento JS |
| `src/lib/rastro-lector.ts` (nuevo, base + fs) | leer archivos vivos y `.gz` con `LecturaLog`, huella, candado, importación hacia atrás |
| `src/lib/rastro-geo.ts` (nuevo) | `mmdb-lib`: resolver IP → país/ciudad/red; `geolocalizarPendientes` |
| `src/lib/sesion.ts` (modificar) | anotar el visitante (IP+UA) de cada sesión del panel, ≤ 1 vez por hora |
| `src/lib/propuesta-contrato.ts`, `src/app/p/[codigo]/route.ts` (modificar) | insertar `rastro.js` en `/p/` con el token del enlace `plantilla` |
| `src/app/api/rastro/evento/route.ts`, `src/app/api/rastro/cors.ts`, `public/rastro.js` (nuevos) | ruta pública y script del lado del prospecto |
| `src/acciones/rastro.ts` (nuevo) | `agregarEnlace`, `quitarEnlace`, `actualizarRastro`, `marcarVisitanteMio`, `guardarIpsPropias` |
| `src/componentes/RastroBloque.tsx` (servidor), `src/componentes/RastroAcciones.tsx` (cliente), `src/componentes/FormularioAjustesRastro.tsx` (cliente) | bloque de la ficha, botones, ajustes |
| `src/lib/leads.ts`, `src/componentes/TarjetaLead.tsx` (modificar) | línea `lead__rastro` en el tablero |
| `src/app/(panel)/leads/[id]/page.tsx`, `src/app/(panel)/prospectos/[id]/page.tsx`, `src/app/(panel)/ajustes/page.tsx` (modificar) | montar el bloque y los ajustes |
| `scripts/rastro-leer.mts`, `scripts/actualizar-geo.mts` (nuevos) | cron cada 10 min (+ `--importar`), descarga mensual del `.mmdb` |
| `tests/rastro-contrato.test.ts`, `tests/rastro.test.ts`, `tests/rastro-lector.test.ts`, `tests/rastro-geo.test.ts`, `tests/rastro-evento.test.ts`, `tests/propuesta-contrato.test.ts` (+casos) | pruebas |
| `CLAUDE.md` (modificar) | sección «Rastro de enlaces» |

---

### Task 1: Esquema y migración

**Files:**
- Modify: `prisma/schema.prisma` (después de `model EnvioCorreo`)
- Create: `prisma/migrations/20261107090000_rastro_enlaces/migration.sql`
- Modify: `tests/ayuda-db.ts:15-40` (`limpiarBase`)
- Test: `tests/esquema.test.ts`

**Interfaces:**
- Produces: modelos Prisma `EnlaceEnviado`, `VisitaEnlace`, `LecturaLog` con estos campos exactos:

```prisma
model EnlaceEnviado {
  id          Int       @id @default(autoincrement())
  prospectoId Int
  prospecto   Prospecto @relation(fields: [prospectoId], references: [id])
  etiqueta    String    @db.VarChar(40)
  host        String    @db.VarChar(120)
  prefijo     String    @db.VarChar(200)
  token       String    @unique @db.VarChar(22)
  origen      String    @db.VarChar(10)   // manual | plantilla
  activo      Boolean   @default(true)
  enviadoEn   DateTime
  creadoEn    DateTime  @default(now())
  visitas     VisitaEnlace[]
  @@unique([host, prefijo, prospectoId])
  @@index([prospectoId])
  @@index([host, activo])
}
model VisitaEnlace {
  id           Int           @id @default(autoincrement())
  enlaceId     Int
  enlace       EnlaceEnviado @relation(fields: [enlaceId], references: [id])
  fuente       String        @db.VarChar(3)   // log | js
  tipo         String        @db.VarChar(8)   // vista | reenvio | pdf | inicio | fin | clic
  visitante    String        @db.VarChar(16)
  ip           String        @db.VarChar(45)
  aparato      String        @default("") @db.VarChar(60)
  ua           String        @default("") @db.VarChar(300)
  pais         String        @default("") @db.VarChar(60)
  ciudad       String        @default("") @db.VarChar(80)
  red          String        @default("") @db.VarChar(10)  // "" | vpn | relay | hosting
  geoPendiente Boolean       @default(false)
  ruta         String        @default("") @db.VarChar(200)
  detalle      String        @default("") @db.VarChar(40)
  origen       String        @default("") @db.VarChar(120)
  segundos     Int?
  scroll       Int?
  propia       Boolean       @default(false)
  huella       String?       @unique @db.VarChar(16)
  ocurrioEn    DateTime
  creadoEn     DateTime      @default(now())
  @@index([enlaceId, ocurrioEn])
  @@index([ip])
  @@index([visitante])
}
model LecturaLog {
  archivo  String   @id @db.VarChar(300)
  inode    BigInt
  posicion BigInt
  leidoEn  DateTime @default(now())
}
```

- `Prospecto` gana `enlaces EnlaceEnviado[]`.

- [ ] **Step 1: Escribir la prueba en `tests/esquema.test.ts`**

```ts
it("un token de enlace es unico y una huella de visita tambien", async () => {
  const { nichoId } = await sembrarBasico();
  const p = await crearProspectoDePrueba(nichoId);
  const e = await prisma.enlaceEnviado.create({ data: { prospectoId: p.id, etiqueta: "Propuesta", host: "neracosu.com", prefijo: "/propuesta/x-1/", token: "a".repeat(22), origen: "manual", enviadoEn: new Date() } });
  await expect(prisma.enlaceEnviado.create({ data: { prospectoId: p.id, etiqueta: "Otra", host: "neracosu.com", prefijo: "/propuesta/y-2/", token: "a".repeat(22), origen: "manual", enviadoEn: new Date() } })).rejects.toThrow(/Unique/);
  const v = { enlaceId: e.id, fuente: "log", tipo: "vista", visitante: "0123456789abcdef", ip: "203.0.113.5", huella: "f".repeat(16), ocurrioEn: new Date() };
  await prisma.visitaEnlace.create({ data: v });
  await expect(prisma.visitaEnlace.create({ data: v })).rejects.toThrow(/Unique/);
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `PROSPECTOS_TEST_DB=1 npx vitest run tests/esquema.test.ts`
Expected: FAIL (`enlaceEnviado` no existe en el cliente Prisma).

- [ ] **Step 3: Agregar los tres modelos al `schema.prisma` y escribir la migración SQL a mano**

La migración crea las tres tablas (utf8mb4_unicode_ci, `DATETIME(3)`), las claves foráneas a `Prospecto`, los índices listados y termina con `INSERT IGNORE INTO Configuracion (clave, valor) VALUES ('candado_rastro', '1');`. Luego `npx prisma generate`.

- [ ] **Step 4: Agregar a `limpiarBase` (antes de `envioCorreo.deleteMany`)**: `visitaEnlace`, `enlaceEnviado`, `lecturaLog`.

- [ ] **Step 5: Aplicar la migración a la base de tests** (`DATABASE_URL=<TEST_DATABASE_URL> npx prisma migrate deploy`; la URL sale de `~/.config/prospectos/env`) y correr la prueba.

Run: `PROSPECTOS_TEST_DB=1 npx vitest run tests/esquema.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add prisma tests/ayuda-db.ts tests/esquema.test.ts
git commit -m "feat(rastro): esquema de enlaces enviados, visitas y lectura de logs"
```

---

### Task 2: Contrato puro: parser, clasificación, visitante, prefijos

**Files:**
- Create: `src/lib/rastro-contrato.ts`
- Test: `tests/rastro-contrato.test.ts`

**Interfaces (Produces):**

```ts
export type LineaLog = { ip: string; fecha: Date; metodo: string; ruta: string; estado: number; referer: string; ua: string };
export function parsearLinea(linea: string): LineaLog | null;              // formato combined; null si no cuadra
export type ClaseUa = { clase: "reenvio"; app: string } | { clase: "robot" } | { clase: "visita"; aparato: string; enApp: boolean };
export function clasificarUa(ua: string): ClaseUa;
export function resumirAparato(ua: string): string;                        // "iPhone · iOS 18.7 · Safari", "Android · Chrome", "Windows · Chrome 156", "Mac · Safari", "navegador dentro de una app" se agrega como sufijo " · en una app"
export function visitanteDe(ip: string, ua: string): string;               // sha256(`${ip}|${ua}`) → 16 hex
export function huellaDe(linea: string): string;                           // sha256(linea) → 16 hex
export function rutaPagina(ruta: string): string | null;                   // sin query ni fragmento; "/x/index.html" → "/x/"; null si es asset (css/js/png/jpg/webp/svg/json/woff2/ico/map/txt/xml)
export function esPdf(ruta: string): boolean;
export function descomponerUrl(url: string): { host: string; prefijo: string } | null; // https://a.neracosu.com/demo/panel/index.html?x → {host:"a.neracosu.com", prefijo:"/demo/panel/"}; null si el host no termina en neracosu.com
export function enlaceQueCoincide<T extends { prefijo: string }>(ruta: string, enlaces: T[]): T | null; // el prefijo mas largo que sea prefijo de la ruta
export const PATRON_P = /^\/p\/([A-Za-z0-9_-]{22})(\/pdf)?$/;
export function etiquetaScript(token: string, base = "https://prospectos.neracosu.com"): string; // `<script src="${base}/rastro.js?v=1" data-enlace="${token}" defer></script>`
```

Reglas de `clasificarUa` (del spec §2a): reenvío si el UA contiene (sin distinguir mayúsculas) `whatsapp`→`whatsapp`, `facebookexternalhit`|`facebot`→`facebook`, `telegrambot`→`telegram`, `twitterbot`→`twitter`, `slackbot`→`slack`, `discordbot`→`discord`, `linkedinbot`→`linkedin`, `instagram` **solo si** también trae `externalhit`→`instagram`, `imessage`|`applebot`… no: `iMessage`→`imessage`, cualquier otro con `preview`→`otro`. Robot si contiene `bot\b`, `crawl`, `spider`, `headlesschrome`, `curl`, `python-requests`, `go-http`, `atalaya-monitor`, `claudebot`, `getdomaindata`, `semrush`, `lighthouse`, o UA vacío. Lo demás es visita; `enApp` = iPhone/iPad sin `Safari/` en el UA, o Android con `; wv)`, o `Instagram`/`FBAN`/`FBAV`/`WhatsApp` en el UA de un navegador.

- [ ] **Step 1: Escribir `tests/rastro-contrato.test.ts` con estos casos** (IPs y hosts de documentación; UAs reales son públicos y están bien):

```ts
const L = (ip: string, fecha: string, req: string, estado: number, ref: string, ua: string) => `${ip} - - [${fecha}] "${req}" ${estado} 1234 "${ref}" "${ua}"`;
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.3 Mobile/15E148 Safari/604.1";
const IPHONE_APP = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36";

describe("parsearLinea", () => {
  it("lee una linea combined y respeta el desfase horario", () => {
    const l = parsearLinea(L("203.0.113.5", "06/Nov/2026:09:08:32 -0800", "GET /factura/ HTTP/1.1", 200, "-", IPHONE))!;
    expect(l.ip).toBe("203.0.113.5"); expect(l.ruta).toBe("/factura/"); expect(l.estado).toBe(200); expect(l.referer).toBe("");
    expect(l.fecha.toISOString()).toBe("2026-11-06T17:08:32.000Z");
  });
  it("tolera comillas escapadas en el UA y devuelve null en una linea rota", () => {
    expect(parsearLinea(L("203.0.113.5", "06/Nov/2026:09:08:32 -0800", "GET / HTTP/1.1", 200, "-", 'Raro \\"X\\" Safari'))?.ua).toContain('"X"');
    expect(parsearLinea('203.0.113.5 - - [06/Nov/2026:09:08:32 -0800] "GET /fact')).toBeNull();
    expect(parsearLinea("")).toBeNull();
  });
});
describe("clasificarUa", () => {
  it("reenvio por app", () => {
    expect(clasificarUa("WhatsApp/2.23.20.0")).toEqual({ clase: "reenvio", app: "whatsapp" });
    expect(clasificarUa("facebookexternalhit/1.1")).toEqual({ clase: "reenvio", app: "facebook" });
    expect(clasificarUa("TelegramBot (like TwitterBot)")).toEqual({ clase: "reenvio", app: "telegram" });
  });
  it("robots y herramientas", () => {
    for (const ua of ["Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/151.0", "curl/7.81.0", "Mozilla/5.0 (compatible; Atalaya-monitor; favicon)", "Mozilla/5.0 AppleWebKit/537.36 (compatible; ClaudeBot/1.0)", ""]) expect(clasificarUa(ua).clase).toBe("robot");
  });
  it("visitas, con y sin app", () => {
    expect(clasificarUa(IPHONE)).toEqual({ clase: "visita", aparato: "iPhone · iOS 18.7 · Safari", enApp: false });
    expect(clasificarUa(IPHONE_APP)).toMatchObject({ clase: "visita", enApp: true });
    expect(resumirAparato(IPHONE_APP)).toBe("iPhone · iOS 18.7 · en una app");
    expect(resumirAparato(WIN)).toBe("Windows · Chrome 156");
  });
});
describe("visitante y huella", () => {
  it("son estables, de 16 hex, y cambian con el UA", () => {
    expect(visitanteDe("203.0.113.5", IPHONE)).toMatch(/^[0-9a-f]{16}$/);
    expect(visitanteDe("203.0.113.5", IPHONE)).toBe(visitanteDe("203.0.113.5", IPHONE));
    expect(visitanteDe("203.0.113.5", IPHONE)).not.toBe(visitanteDe("203.0.113.5", WIN));
    expect(huellaDe("a")).not.toBe(huellaDe("b"));
  });
});
describe("rutas y prefijos", () => {
  it("rutaPagina normaliza y descarta assets", () => {
    expect(rutaPagina("/demo/panel/index.html?x=1#y")).toBe("/demo/panel/");
    expect(rutaPagina("/factura")).toBe("/factura");
    expect(rutaPagina("/demo/panel.css")).toBeNull(); expect(rutaPagina("/favicon.ico")).toBeNull(); expect(rutaPagina("/assets/t.json")).toBeNull();
    expect(esPdf("/propuesta/x-1/Propuesta.pdf?e=abc")).toBe(true);
  });
  it("descomponerUrl y enlaceQueCoincide eligen el prefijo mas largo", () => {
    expect(descomponerUrl("https://demo-ejemplo.neracosu.com/demo/panel/index.html?x")).toEqual({ host: "demo-ejemplo.neracosu.com", prefijo: "/demo/panel/" });
    expect(descomponerUrl("https://neracosu.com/propuesta/x-1/")).toEqual({ host: "neracosu.com", prefijo: "/propuesta/x-1/" });
    expect(descomponerUrl("https://otro.com/a/")).toBeNull();
    const es = [{ prefijo: "/demo/" }, { prefijo: "/demo/panel/" }];
    expect(enlaceQueCoincide("/demo/panel/", es)).toBe(es[1]); expect(enlaceQueCoincide("/demo/factura/", es)).toBe(es[0]); expect(enlaceQueCoincide("/otra/", es)).toBeNull();
  });
  it("PATRON_P y etiquetaScript", () => {
    expect("/p/AAAAAAAAAAAAAAAAAAAAAA".match(PATRON_P)?.[1]).toBe("A".repeat(22));
    expect("/p/AAAAAAAAAAAAAAAAAAAAAA/pdf".match(PATRON_P)?.[2]).toBe("/pdf");
    expect(etiquetaScript("t".repeat(22))).toBe(`<script src="https://prospectos.neracosu.com/rastro.js?v=1" data-enlace="${"t".repeat(22)}" defer></script>`);
  });
});
```

- [ ] **Step 2: Correr y ver que falla** — `npx vitest run tests/rastro-contrato.test.ts` → FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `src/lib/rastro-contrato.ts`** con las firmas de arriba. El parser usa una sola expresión regular para *combined* con campos entre comillas que admiten `\"`; la fecha se arma con `Date.UTC` y el desfase `±hhmm`. `resumirAparato` saca SO (iPhone/iPad/Android/Windows/Mac/Linux), versión de iOS (`OS 18_7` → `18.7`) y navegador (Chrome N / Safari / Firefox / Edge / Samsung).

- [ ] **Step 4: Correr** — `npx vitest run tests/rastro-contrato.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git add src/lib/rastro-contrato.ts tests/rastro-contrato.test.ts && git commit -m "feat(rastro): contrato puro: parser de access-log, clasificacion de UA, visitante y prefijos"`

---

### Task 3: Contrato puro: línea de tiempo y resúmenes

**Files:**
- Modify: `src/lib/rastro-contrato.ts`
- Test: `tests/rastro-contrato.test.ts`

**Interfaces (Produces):**

```ts
export type VisitaFila = { id: number; enlaceId: number; etiqueta: string; fuente: "log" | "js"; tipo: string; visitante: string; aparato: string; pais: string; ciudad: string; red: string; geoPendiente: boolean; ruta: string; detalle: string; origen: string; segundos: number | null; scroll: number | null; propia: boolean; ocurrioEn: Date };
export type Apertura = { clase: "apertura" | "vuelta" | "reenvio" | "pdf" | "clic"; enlaceId: number; etiqueta: string; visitante: string; ruta: string; ocurrioEn: Date; segundos: number | null; scroll: number | null; origen: string; detalle: string; clics: string[] };
export type Visitante = { visitante: string; numero: number; aparato: string; lugar: string; red: string; propio: boolean };
export type LineaTiempo = { visitantes: Visitante[]; dias: { dia: string; filas: Apertura[] }[] };
export function armarLineaTiempo(visitas: VisitaFila[], o?: { conPropias?: boolean }): LineaTiempo;
export function textoLugar(v: { pais: string; ciudad: string; red: string; geoPendiente: boolean }): string; // "Venezuela, Caracas" | "Venezuela" | "desde una VPN" (red≠"") | "ubicación: en unos minutos" | "ubicación desconocida"
export type ResumenEnlace = { visitantes: number; aperturas: number; reenvios: number; pdfs: number };
export function resumirEnlace(visitas: VisitaFila[], enlaceId: number): ResumenEnlace;  // sin propias
export function textoResumenEnlace(r: ResumenEnlace): string; // "3 visitantes · 6 aperturas · reenviado 2 veces · PDF bajado 1 vez" | "Sin abrir"
export type DatosTarjeta = { etiqueta: string; enviadoEn: Date; ultimaApertura: Date | null; visitantes: number; reenvio: boolean };
export function resumenTarjeta(d: DatosTarjeta, ahora: Date): string; // "Vio la propuesta hace 2 h · la reenvió · 3 personas" | "Sin abrir · enviada hace 1 d"
export function haceCuanto(desde: Date, ahora: Date): string; // "hace 5 min" | "hace 2 h" | "hace 1 d" | "hace 3 sem"
```

Reglas de fusión (spec §4): una `vista` (log) y un `inicio` (js) del mismo visitante y misma ruta a ≤ 90 s son una apertura; un `fin` posterior del mismo visitante y ruta le pone `segundos`/`scroll`; los `clic` posteriores del mismo visitante y ruta (hasta la siguiente apertura) van en `clics`; recargas del mismo visitante y ruta a ≤ 60 s se funden; dos `reenvio` del mismo visitante y ruta a ≤ 60 s son uno; la segunda apertura de un mismo visitante a la misma ruta es `vuelta`. Visitantes numerados por orden de primera aparición en el conjunto (no por día). `dias` en `America/Caracas` (`YYYY-MM-DD`), más reciente primero; filas dentro del día, más reciente primero.

- [ ] **Step 1: Agregar al test**

```ts
const t = (s: string) => new Date(`2026-11-06T${s}:00.000-04:00`);
const base = (x: Partial<VisitaFila>): VisitaFila => ({ id: 1, enlaceId: 1, etiqueta: "Demo · factura", fuente: "log", tipo: "vista", visitante: "v1", aparato: "iPhone · iOS 18 · Safari", pais: "Venezuela", ciudad: "Caracas", red: "", geoPendiente: false, ruta: "/factura/", detalle: "", origen: "", segundos: null, scroll: null, propia: false, ocurrioEn: t("13:08"), ...x });
describe("armarLineaTiempo", () => {
  it("funde log+js, pone duracion, cuenta vuelta y reenvio, numera visitantes", () => {
    const lt = armarLineaTiempo([
      base({ id: 1 }), base({ id: 2, fuente: "js", tipo: "inicio", origen: "instagram.com", ocurrioEn: t("13:08") }),
      base({ id: 3, fuente: "js", tipo: "fin", segundos: 130, scroll: 90, ocurrioEn: t("13:10") }),
      base({ id: 4, fuente: "js", tipo: "clic", detalle: "pdf", ocurrioEn: t("13:09") }),
      base({ id: 5, tipo: "reenvio", detalle: "whatsapp", ocurrioEn: t("13:11") }), base({ id: 6, tipo: "reenvio", detalle: "whatsapp", ocurrioEn: t("13:11") }),
      base({ id: 7, visitante: "v2", aparato: "iPhone · iOS 18.7 · Safari", red: "vpn", ocurrioEn: t("13:28") }),
      base({ id: 8, ocurrioEn: t("13:29") }),
      base({ id: 9, visitante: "neri", propia: true, ocurrioEn: t("11:45") }),
    ]);
    expect(lt.visitantes.map((v) => [v.numero, v.visitante])).toEqual([[1, "v1"], [2, "v2"]]);
    expect(lt.visitantes[1].lugar).toBe("desde una VPN");
    const f = lt.dias[0].filas; expect(lt.dias[0].dia).toBe("2026-11-06");
    expect(f.map((a) => a.clase)).toEqual(["vuelta", "apertura", "reenvio", "apertura"]);   // 13:29 v1, 13:28 v2, 13:11, 13:08
    const primera = f[3]; expect(primera.segundos).toBe(130); expect(primera.scroll).toBe(90); expect(primera.origen).toBe("instagram.com"); expect(primera.clics).toEqual(["pdf"]);
    expect(armarLineaTiempo([base({ id: 9, visitante: "neri", propia: true })], { conPropias: true }).dias[0].filas).toHaveLength(1);
  });
});
describe("resumenes", () => {
  it("enlace y tarjeta", () => {
    const vs = [base({ id: 1 }), base({ id: 2, tipo: "reenvio", detalle: "whatsapp", ocurrioEn: t("13:11") }), base({ id: 3, visitante: "v2", ocurrioEn: t("13:28") }), base({ id: 4, tipo: "pdf", ocurrioEn: t("13:30") }), base({ id: 5, propia: true, visitante: "n" })];
    expect(textoResumenEnlace(resumirEnlace(vs, 1))).toBe("2 visitantes · 2 aperturas · reenviado 1 vez · PDF bajado 1 vez");
    expect(textoResumenEnlace(resumirEnlace([], 1))).toBe("Sin abrir");
    const ahora = t("15:28");
    expect(resumenTarjeta({ etiqueta: "Propuesta", enviadoEn: t("12:00"), ultimaApertura: t("13:28"), visitantes: 3, reenvio: true }, ahora)).toBe("Vio la propuesta hace 2 h · la reenvió · 3 personas");
    expect(resumenTarjeta({ etiqueta: "Demo · factura", enviadoEn: new Date("2026-11-05T15:00:00-04:00"), ultimaApertura: null, visitantes: 0, reenvio: false }, ahora)).toBe("Sin abrir · enviada hace 1 d");
    expect(haceCuanto(t("15:23"), ahora)).toBe("hace 5 min");
  });
  it("textoLugar", () => {
    expect(textoLugar({ pais: "Venezuela", ciudad: "Caracas", red: "", geoPendiente: false })).toBe("Venezuela, Caracas");
    expect(textoLugar({ pais: "", ciudad: "", red: "", geoPendiente: true })).toBe("ubicación: en unos minutos");
    expect(textoLugar({ pais: "", ciudad: "", red: "", geoPendiente: false })).toBe("ubicación desconocida");
  });
});
```

`resumenTarjeta` usa la etiqueta en minúscula: «Vio la propuesta», «Vio la demo · factura»; si la etiqueta empieza por «Demo» dice «Vio la demo». Visitantes > 1 → «N personas».

- [ ] **Step 2: Correr y ver que falla.** — `npx vitest run tests/rastro-contrato.test.ts`
- [ ] **Step 3: Implementar** las funciones en `rastro-contrato.ts` (ordenar por `ocurrioEn` ascendente para fundir, luego invertir para mostrar).
- [ ] **Step 4: Correr** → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(rastro): linea de tiempo fundida (log+js) y resumenes de enlace y tarjeta"`

---

### Task 4: Capa de base: enlaces, visitas, propios, visitante de sesión

**Files:**
- Create: `src/lib/rastro.ts`
- Modify: `src/lib/configuracion.ts:5-15` (`CLAVES.rastroIpsPropias = "rastro_ips_propias"`, `CLAVES.rastroVisitantesSesion = "rastro_visitantes_sesion"`; defectos `"[]"` y `"{}"`)
- Modify: `src/lib/sesion.ts:12-18`
- Test: `tests/rastro.test.ts`

**Interfaces (Produces):**

```ts
export type EnlaceFila = { id: number; prospectoId: number; etiqueta: string; host: string; prefijo: string; token: string; origen: string; activo: boolean; enviadoEn: Date };
export async function registrarEnlace(d: { prospectoId: number; url: string; etiqueta: string; enviadoEn?: Date }): Promise<{ ok: true; enlace: EnlaceFila } | { ok: false; error: string }>; // errores: "URL no es de neracosu.com" | "Ese enlace ya esta registrado"
export async function listarEnlaces(prospectoId: number): Promise<EnlaceFila[]>;
export async function enlacesActivosPorHost(): Promise<Map<string, EnlaceFila[]>>;
export async function desactivarEnlace(id: number): Promise<void>;
export async function obtenerOCrearEnlacePlantilla(codigo: string): Promise<EnlaceFila | null>; // host prospectos.neracosu.com, prefijo /p/<codigo>; enviadoEn = primer Evento enviado del prospecto, o ahora; null si el codigo no existe
export type VisitaNueva = Omit<VisitaFila, "id" | "etiqueta" | "propia"> & { ip: string; ua: string; huella?: string };
export async function insertarVisitas(vs: VisitaNueva[], propios: Propios): Promise<number>; // decide `propia` con esPropia; createMany skipDuplicates; devuelve insertadas
export type Propios = { ips: Set<string>; visitantes: Set<string> };
export function esPropia(ip: string, visitante: string, p: Propios): boolean;
export async function cargarPropios(ahora?: Date): Promise<Propios>;       // lista manual + visitantes de sesion de los ultimos 30 dias
export async function anotarVisitanteSesion(ip: string, ua: string, ahora?: Date): Promise<void>; // JSON {visitante: iso}, <= 60 entradas (bota la mas vieja), no escribe si ya hay una de hace < 1 h
export async function marcarVisitantePropio(visitante: string): Promise<number>; // lo agrega a rastro_visitantes_sesion con fecha lejana (2099) y marca propia=true en sus visitas
export async function guardarIpsPropias(lista: string[]): Promise<void>;   // valida IPv4/IPv6 simples, reclasifica visitas de esas IPs
export async function leerIpsPropias(): Promise<string[]>;
export async function visitasDe(prospectoId: number, limite = 500): Promise<VisitaFila[]>;
export async function resumenesParaTablero(prospectoIds: number[], ahora?: Date): Promise<Map<number, string>>; // texto de resumenTarjeta del enlace mas reciente de cada prospecto; sin propias; una sola consulta groupBy + una de enlaces
export async function registrarEventoJs(e: EventoJsNormal, ip: string, ua: string): Promise<boolean>; // false si el token no existe o no esta activo
```

`EventoJsNormal` y `normalizarEventoJs(x: unknown): EventoJsNormal | null` van en `rastro-contrato.ts`:
`{ token: string; tipo: "inicio" | "fin" | "clic"; ruta: string; origen: string; segundos: number | null; scroll: number | null; detalle: string }` (ruta por `rutaPagina`, origen ≤ 120, segundos 0..86400, scroll 0..100, detalle `[a-z0-9-]{1,40}`).

`sesion.ts`: dentro de `sesionActual`, tras validar `u`, llamar `anotarVisitanteSesion(ipDesdeCabeceras(...), headers().get("user-agent") ?? "")` envuelto en `try/catch` y **sin `await` bloqueante del render** (`void anotar...().catch(() => {})`).

- [ ] **Step 1: Escribir `tests/rastro.test.ts`** (`describe.runIf(DB_HABILITADA)`, `limpiarBase` en `beforeEach`, `sembrarBasico` + `crearProspectoDePrueba`):

```ts
it("registra un enlace desde la URL, rechaza repetidos y hosts ajenos", async () => {
  const r = await registrarEnlace({ prospectoId: p.id, url: "https://demo-ejemplo.neracosu.com/factura/index.html", etiqueta: "Demo · factura" });
  expect(r.ok && r.enlace).toMatchObject({ host: "demo-ejemplo.neracosu.com", prefijo: "/factura/", origen: "manual", activo: true });
  expect(r.ok && r.enlace.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
  expect(await registrarEnlace({ prospectoId: p.id, url: "https://demo-ejemplo.neracosu.com/factura/", etiqueta: "Otra" })).toEqual({ ok: false, error: "Ese enlace ya esta registrado" });
  expect((await registrarEnlace({ prospectoId: p.id, url: "https://otro.com/x", etiqueta: "X" })).ok).toBe(false);
});
it("obtenerOCrearEnlacePlantilla crea una sola fila por codigo con enviadoEn del evento enviado", async () => {
  await prisma.evento.create({ data: { prospectoId: p.id, tipo: "enviado", canal: "whatsapp", creadoEn: new Date("2026-11-01T14:00:00Z") } });
  const a = (await obtenerOCrearEnlacePlantilla(p.codigo))!; const b = (await obtenerOCrearEnlacePlantilla(p.codigo))!;
  expect(a.id).toBe(b.id); expect(a.prefijo).toBe(`/p/${p.codigo}`); expect(a.origen).toBe("plantilla"); expect(a.enviadoEn.toISOString()).toBe("2026-11-01T14:00:00.000Z");
  expect(await obtenerOCrearEnlacePlantilla("x".repeat(22))).toBeNull();
});
it("esPropia: misma IP con otro UA no es propia (CGNAT); lista manual si lo es por IP", async () => {
  await anotarVisitanteSesion("198.51.100.7", UA_NERI);
  await guardarIpsPropias(["203.0.113.99"]);
  const pr = await cargarPropios();
  expect(esPropia("198.51.100.7", visitanteDe("198.51.100.7", UA_NERI), pr)).toBe(true);
  expect(esPropia("198.51.100.7", visitanteDe("198.51.100.7", UA_PROSPECTO), pr)).toBe(false);
  expect(esPropia("203.0.113.99", visitanteDe("203.0.113.99", UA_PROSPECTO), pr)).toBe(true);
});
it("anotarVisitanteSesion no escribe dos veces en una hora y tope de 60", async () => { /* 61 UAs distintos → 60 entradas; la misma IP+UA dos veces → una */ });
it("insertarVisitas salta huellas repetidas y marca propias; marcarVisitantePropio reclasifica", async () => {
  const e = (await registrarEnlace({ prospectoId: p.id, url: "https://demo-ejemplo.neracosu.com/factura/", etiqueta: "Demo" })) as { ok: true; enlace: EnlaceFila };
  const v = (huella: string, visitante = "v1"): VisitaNueva => ({ enlaceId: e.enlace.id, fuente: "log", tipo: "vista", visitante, ip: "203.0.113.5", ua: UA_PROSPECTO, aparato: "iPhone", pais: "", ciudad: "", red: "", geoPendiente: true, ruta: "/factura/", detalle: "", origen: "", segundos: null, scroll: null, huella, ocurrioEn: new Date() });
  expect(await insertarVisitas([v("h1"), v("h1"), v("h2", "v2")], { ips: new Set(), visitantes: new Set() })).toBe(2);
  expect(await marcarVisitantePropio("v2")).toBe(1);
  expect((await visitasDe(p.id)).map((x) => [x.visitante, x.propia])).toEqual(expect.arrayContaining([["v1", false], ["v2", true]]));
});
it("resumenesParaTablero devuelve una linea por prospecto sin contar propias", async () => { /* 2 aperturas (una propia), 1 reenvio → "Vio la demo hace … · la reenvió"; prospecto sin enlaces → ausente del Map */ });
it("registrarEventoJs guarda inicio/fin/clic y rechaza token desconocido", async () => { /* fuente js, visitante = visitanteDe(ip, ua), geoPendiente true */ });
```

- [ ] **Step 2: Correr y ver que falla.** — `PROSPECTOS_TEST_DB=1 npx vitest run tests/rastro.test.ts`
- [ ] **Step 3: Implementar `src/lib/rastro.ts`**, las claves en `configuracion.ts` y el enganche en `sesion.ts`. `insertarVisitas` usa `createMany({ skipDuplicates: true })` y cuenta con `count`. `resumenesParaTablero`: `groupBy` sobre `VisitaEnlace` por `enlaceId` con `_max.ocurrioEn` y filtros `propia: false, tipo: in [vista, inicio]`; otra consulta `findMany` para visitantes distintos (`distinct: ["enlaceId", "visitante"]`) y una para `reenvio`; luego `resumenTarjeta`.
- [ ] **Step 4: Correr** → PASS. También `npx vitest run tests/auth.test.ts tests/acciones-leads.test.ts` (sesión tocada) → PASS.
- [ ] **Step 5: Commit** — `git add src/lib/rastro.ts src/lib/rastro-contrato.ts src/lib/configuracion.ts src/lib/sesion.ts tests/rastro.test.ts && git commit -m "feat(rastro): enlaces, visitas, propios y visitante de sesion"`

---

### Task 5: Lector de access-logs (vivo + `.gz`, truncado, candado, `/p/` automático)

**Files:**
- Create: `src/lib/rastro-lector.ts`
- Test: `tests/rastro-lector.test.ts`

**Interfaces (Produces):**

```ts
export type OpcionesLector = { dirLogs?: string; dirArchivo?: string; hosts?: string[]; desdeCero?: boolean; soloPrefijo?: { host: string; prefijo: string } };
export type ResultadoLectura = { lineas: number; visitas: number; archivosReleidos: string[] };
export async function leerLogs(o?: OpcionesLector): Promise<ResultadoLectura>;         // con candado_rastro (SELECT … FOR UPDATE); hosts = enlacesActivosPorHost() ∪ {"prospectos.neracosu.com"}
export async function importarArchivados(o: { host: string; prefijo?: string; desde?: Date; dirArchivo?: string }): Promise<ResultadoLectura>; // todos los .gz del host
export function visitasDeLinea(l: LineaLog, enlacesDelHost: EnlaceFila[], crudo: string): VisitaNueva | null; // pura: aplica rutaPagina/esPdf/clasificarUa/enlaceQueCoincide; estado ∈ {200, 206, 304}; GET
export const DIR_LOGS_DEFECTO = "/home/neracosu/access-logs";
export const DIR_ARCHIVO_DEFECTO = "/home/neracosu/logs";
```

Comportamiento (spec §2a y §5): por host lee `${host}-ssl_log` y `${host}`; estado en `LecturaLog` por ruta completa; si `inode` distinto **o** tamaño < `posicion` → relee `${dirArchivo}/${host}-ssl_log-${Mes}-${Año}.gz` del mes en curso (nombre con mes en inglés abreviado: `Nov-2026`) y después el vivo desde 0; `.gz` con `zlib.createGunzip()` + `readline` (multi-miembro). Línea con `PATRON_P` en host `prospectos.neracosu.com` → `obtenerOCrearEnlacePlantilla(codigo)` (caché por pasada). `huella = huellaDe(crudo)`. Lotes de 500 con `insertarVisitas`.

- [ ] **Step 1: Escribir `tests/rastro-lector.test.ts`** (base de tests; `mkdtempSync` para `dirLogs` y `dirArchivo`; escribir líneas con el helper `L` de Task 2; host `demo-ejemplo.neracosu.com` con enlace `/factura/`):

```ts
it("primera pasada: guarda vistas, reenvios (206) y pdf; ignora assets, robots, 301 y otros prefijos", async () => {
  // 7 lineas: vista 200 /factura/, vista 304 /factura/index.html, reenvio 206 WhatsApp /factura/, 200 /demo/factura.css, 200 HeadlessChrome /factura/, 301 /factura, 200 /otra/
  const r = await leerLogs({ dirLogs, dirArchivo, hosts: ["demo-ejemplo.neracosu.com"] });
  expect(r.visitas).toBe(3);
  const vs = await prisma.visitaEnlace.findMany({ orderBy: { ocurrioEn: "asc" } });
  expect(vs.map((v) => v.tipo)).toEqual(["vista", "vista", "reenvio"]); expect(vs[2].detalle).toBe("whatsapp"); expect(vs[1].ruta).toBe("/factura/");
});
it("segunda pasada lee solo lo nuevo", async () => { /* appendFileSync 1 linea → visitas 1, lineas 1 */ });
it("truncado con el mismo inode: relee el .gz del mes y el vivo desde cero sin duplicar", async () => {
  // gz del mes con las 7 lineas de antes + 1 nueva (gzipSync de dos miembros concatenados); vivo truncado con 1 linea nueva distinta
  const r = await leerLogs({ dirLogs, dirArchivo, hosts: ["demo-ejemplo.neracosu.com"] });
  expect(r.archivosReleidos).toHaveLength(1); expect(await prisma.visitaEnlace.count()).toBe(3 + 1 + 1);
});
it("una linea rota no tira la pasada", async () => { /* linea "basura" entre dos buenas → 2 visitas */ });
it("/p/<codigo> crea el enlace plantilla y /p/<codigo>/pdf cuenta como pdf", async () => { /* host prospectos.neracosu.com */ });
it("importarArchivados recorre todos los .gz del host y respeta --desde", async () => {});
it("dos lecturas a la vez: la segunda espera el candado y no duplica", async () => { /* Promise.all([leerLogs(), leerLogs()]) → suma visitas = unicas */ });
```

- [ ] **Step 2: Correr y ver que falla.** — `PROSPECTOS_TEST_DB=1 npx vitest run tests/rastro-lector.test.ts`
- [ ] **Step 3: Implementar `src/lib/rastro-lector.ts`.** Leer el vivo con `fs.createReadStream({ start: posicion })` + `readline`; `statSync` para `ino`/`size`; `BigInt` en `LecturaLog`. El candado reutiliza el patrón de `correos.ts:199-201` con `candado_rastro` (y `INSERT IGNORE` de respaldo). El `.gz`: nombre del mes en inglés abreviado (`toLocaleString("en-US", { month: "short" })`).
- [ ] **Step 4: Correr** → PASS.
- [ ] **Step 5: Commit** — `git add src/lib/rastro-lector.ts tests/rastro-lector.test.ts && git commit -m "feat(rastro): lector de access-logs con truncado diario, gz del mes, candado y /p/ automatico"`

---

### Task 6: Geolocalización (`mmdb-lib`) y scripts del cron

**Files:**
- Create: `src/lib/rastro-geo.ts`, `scripts/rastro-leer.mts`, `scripts/actualizar-geo.mts`
- Modify: `package.json` (dependencia `mmdb-lib@^3.0.4`)
- Test: `tests/rastro-geo.test.ts`

**Interfaces (Produces):**

```ts
export type Lugar = { pais: string; ciudad: string; red: string };
export function abrirGeo(ruta?: string): ((ip: string) => Lugar | null) | null; // null si el archivo no existe; ruta por defecto `${HOME}/.config/prospectos/geo/dbip-city-lite.mmdb` (env RASTRO_MMDB)
export function lugarDesdeRegistro(r: unknown): Lugar;                        // pais = country.names.es ?? .en; ciudad = city.names.es ?? .en; red: "" (la lista de rangos queda vacia; funcion `redDeIp(ip)` exportada para crecer)
export function esIpPrivada(ip: string): boolean;                             // 10/8, 172.16/12, 192.168/16, 127/8, ::1, fc00::/7
export async function geolocalizarPendientes(limite = 2000, resolver?: ReturnType<typeof abrirGeo>): Promise<{ resueltas: number; sinDato: number }>; // sin resolver o IP privada → geoPendiente=false, pais=""
```

`scripts/rastro-leer.mts`: `node_modules/.bin/tsx scripts/rastro-leer.mts [--importar --enlace <id> [--desde AAAA-MM-DD] [--aplicar]] [--sin-geo]`. Sin flags: `leerLogs()` + `geolocalizarPendientes()`; imprime `[rastro] <fecha hh:mm Caracas>: N líneas, M visitas, K pendientes de lugar` **solo si** `M > 0` o `K > 0`; `process.exit(0)`. Con `--importar`: busca el enlace, llama `importarArchivados({ host, prefijo, desde })`; sin `--aplicar` envuelve en `prisma.$transaction` y hace rollback tras contar (o usa `dryRun` del lector: elegir lo más simple y documentarlo en la cabecera).

`scripts/actualizar-geo.mts`: baja `https://download.db-ip.com/free/dbip-city-lite-YYYY-MM.mmdb.gz` del mes actual (si 404, el anterior), descomprime a `*.mmdb.nuevo`, exige tamaño > 50 MB y que `abrirGeo` resuelva `8.8.8.8` a algo con país, renombra el anterior a `.anterior` y el nuevo al nombre final. Cabecera con la atribución CC BY 4.0.

- [ ] **Step 1: Escribir `tests/rastro-geo.test.ts`** (puro + base):

```ts
it("abrirGeo devuelve null sin archivo y lugarDesdeRegistro prefiere español", () => {
  expect(abrirGeo("/ruta/que/no/existe.mmdb")).toBeNull();
  expect(lugarDesdeRegistro({ country: { names: { en: "Venezuela", es: "Venezuela" } }, city: { names: { en: "Caracas" } } })).toEqual({ pais: "Venezuela", ciudad: "Caracas", red: "" });
  expect(esIpPrivada("192.168.1.4")).toBe(true); expect(esIpPrivada("203.0.113.5")).toBe(false);
});
it.runIf(DB_HABILITADA)("geolocalizarPendientes sin archivo cierra las pendientes como desconocidas; con resolver falso las llena", async () => {
  /* 2 visitas geoPendiente; resolver undefined → ambas geoPendiente=false, pais ""; luego 2 nuevas con resolver = () => ({pais:"Venezuela",ciudad:"Caracas",red:""}) → llenas */
});
```

- [ ] **Step 2: Correr y ver que falla.**
- [ ] **Step 3: `npm install mmdb-lib@^3.0.4`**, implementar `rastro-geo.ts` y los dos scripts.
- [ ] **Step 4: Correr** → PASS; `npx tsc --noEmit` limpio; `node_modules/.bin/tsx scripts/rastro-leer.mts --sin-geo` contra la base de tests (env `DATABASE_URL` de tests) termina sin error.
- [ ] **Step 5: Commit** — `git add package.json package-lock.json src/lib/rastro-geo.ts scripts/rastro-leer.mts scripts/actualizar-geo.mts tests/rastro-geo.test.ts && git commit -m "feat(rastro): geolocalizacion con DB-IP Lite en el proceso del cron y scripts de lectura e importacion"`

---

### Task 7: Ruta pública `/api/rastro/evento` y `public/rastro.js`

**Files:**
- Create: `src/app/api/rastro/evento/route.ts`, `src/app/api/rastro/cors.ts`, `public/rastro.js`
- Test: `tests/rastro-evento.test.ts`

**Interfaces:**
- Consumes: `normalizarEventoJs`, `registrarEventoJs`, `clasificarUa` (robot → 204), `ipDesdeCabeceras`, `permitirIntento`, `leerJson`/`preflight` (copiar el patrón de `src/app/api/web/cors.ts`; aquí `origenPermitido` acepta `https://neracosu.com`, `https://www.neracosu.com` y cualquier `https://*.neracosu.com`).
- Produces: `POST /api/rastro/evento` → 403 origen ajeno · 204 robot · 429 (120/min por IP) · 400 cuerpo inválido · 404 token desconocido · 204 guardado. `OPTIONS` → preflight.

`public/rastro.js` (≤ 3 KB, ES5, todo en `try`): lee `data-enlace` del propio `<script>` (`document.currentScript`); si `?soyyo=1` guarda `nc_soyyo=1` en `localStorage` (`?soyyo=0` lo quita) y si está puesto no manda nada; `navigator.webdriver` → no manda; `inicio` al cargar con `{token, t:"inicio", ruta: location.pathname, origen, ancho: innerWidth}` (origen como `medir.js`: `?de=`, `utm_source`, `fbclid`→`facebook`, host del referer si no termina en `neracosu.com`); cuenta segundos solo con `document.visibilityState === "visible"`; `scroll` máximo en % del documento; `fin` por `sendBeacon` en `pagehide` y en `visibilitychange→hidden` (una sola vez por ciclo visible→oculto; al volver a visible se reinicia la cuenta y puede mandar otro `fin`); `clic` en `a[data-rastro], button[data-rastro]` y por defecto en `a[href$=".pdf"]`, `a[href*="wa.me"]`, `a[href^="mailto:"]`, `a[href^="tel:"]` con detalle `pdf|whatsapp|correo|telefono`. Envío por `sendBeacon` con `Blob text/plain`, fallback `fetch keepalive`.

- [ ] **Step 1: Escribir `tests/rastro-evento.test.ts`** (igual que `tests/web.test.ts`: `new Request("http://127.0.0.1:3013/api/rastro/evento", { method: "POST", headers: { origin, "content-type": "text/plain", "user-agent": UA, "x-forwarded-for": "203.0.113.5" }, body })`):

```ts
it("guarda inicio, fin y clic con el visitante de IP+UA", async () => { /* 3 POST → 3 filas fuente js, mismo visitante, geoPendiente true */ });
it("403 con Origin ajeno, 204 sin guardar con UA de robot, 400 con cuerpo invalido o de 3 KB, 404 con token desconocido", async () => {});
it("acepta Origin de cualquier subdominio https de neracosu.com y responde el preflight", async () => {});
it("429 al pasar 120 eventos en un minuto desde la misma IP", async () => { /* _reiniciarIntentos() antes */ });
```

- [ ] **Step 2: Correr y ver que falla.**
- [ ] **Step 3: Implementar** la ruta, el `cors.ts` propio y `public/rastro.js`.
- [ ] **Step 4: Correr** → PASS. Comprobar el tamaño: `wc -c public/rastro.js` ≤ 3072.
- [ ] **Step 5: Commit** — `git add src/app/api/rastro public/rastro.js tests/rastro-evento.test.ts && git commit -m "feat(rastro): ruta publica de eventos y rastro.js para propuestas y demos"`

---

### Task 8: `/p/<código>` registra el enlace plantilla e inserta el script

**Files:**
- Modify: `src/lib/propuesta-contrato.ts:104-133` (`ExtraPropuesta` gana `scriptRastro?: string`; se concatena antes de `</body>`, después de `SCRIPT_DESCARGA`)
- Modify: `src/app/p/[codigo]/route.ts` (en `GET`, tras `encontrarProspecto`: `const enlace = await obtenerOCrearEnlacePlantilla(codigo)`; `extra.scriptRastro = enlace ? etiquetaScript(enlace.token, process.env.PROSPECTOS_URL_PUBLICA ?? "https://prospectos.neracosu.com") : ""`; envuelto en `try/catch` que deja `""` y hace `console.error`)
- Test: `tests/propuesta-contrato.test.ts` (+1 caso), `tests/propuesta.test.ts` o `tests/rastro.test.ts` (+1 caso de ruta)

- [ ] **Step 1: Pruebas**

```ts
it("renderPropuesta inserta el script de rastro antes de </body> y no lo inserta si viene vacio", () => {
  const html = renderPropuesta(PLANTILLA_MINIMA, "Negocio", "/p/x/pdf", { scriptRastro: '<script src="https://prospectos.neracosu.com/rastro.js?v=1" data-enlace="t" defer></script>' });
  expect(html).toMatch(/rastro\.js\?v=1" data-enlace="t" defer><\/script><\/body>/);
  expect(renderPropuesta(PLANTILLA_MINIMA, "Negocio", "/p/x/pdf")).not.toContain("rastro.js");
});
it.runIf(DB_HABILITADA)("GET /p/<codigo> crea el enlace plantilla una sola vez y el HTML lleva su token", async () => { /* 2 GET con UA de telefono → 1 EnlaceEnviado, html.includes(token) */ });
```

- [ ] **Step 2: Correr y ver que falla.** — `npx vitest run tests/propuesta-contrato.test.ts` y el de base.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Correr** → PASS. Correr además `PROSPECTOS_TEST_DB=1 npx vitest run tests/propuesta.test.ts tests/correos.test.ts` (nada se rompe).
- [ ] **Step 5: Commit** — `git commit -am "feat(rastro): /p/<codigo> registra su enlace y lleva rastro.js"`

---

### Task 9: Acciones del panel

**Files:**
- Create: `src/acciones/rastro.ts`
- Test: `tests/acciones-rastro.test.ts`

**Interfaces (Produces):**

```ts
"use server";
export async function agregarEnlace(prospectoId: number, formData: FormData): Promise<Resultado<{ id: number; etiqueta: string; script: string }>>; // campos url, etiqueta, enviadoEn (opcional, ISO fecha); exigirSesion; refresca ficha; tras registrar: leerLogs({ hosts: [host], desdeCero: true, soloPrefijo }) sin esperar geo
export async function quitarEnlace(id: number): Promise<Resultado>;                 // desactivar; solo dueno
export async function actualizarRastro(prospectoId: number): Promise<Resultado<{ visitas: number }>>; // leerLogs({ hosts: hosts del prospecto ∪ prospectos.neracosu.com }); exigirSesion
export async function marcarVisitanteMio(prospectoId: number, visitante: string): Promise<Resultado<{ reclasificadas: number }>>; // solo dueno
export async function guardarIpsPropiasAccion(formData: FormData): Promise<Resultado>; // campo "ips", una por linea; solo dueno; revalida /ajustes
export async function importarArchivadosAccion(enlaceId: number): Promise<Resultado<{ visitas: number }>>; // «Cargar tambien lo archivado»; solo dueno
```

Zod: `url` ≤ 300 y `https://`, `etiqueta` 2..40, `visitante` `/^[0-9a-f]{16}$/`. `refrescar(id)` como en `acciones/leads.ts:24-27`.

- [ ] **Step 1: Escribir `tests/acciones-rastro.test.ts`** con `vi.mock("@/lib/sesion")` + `sesionFalsa` (patrón de `tests/acciones-leads.test.ts`), `RASTRO_DIR_LOGS` apuntando a un directorio temporal:

```ts
it("agregarEnlace devuelve la etiqueta <script> con el token y lee el log del host de una vez", async () => {});
it("agregarEnlace rechaza URL ajena y etiqueta corta con mensaje", async () => {});
it("quitarEnlace, marcarVisitanteMio y guardarIpsPropiasAccion exigen dueno", async () => { /* prospectador → ok:false */ });
it("actualizarRastro devuelve cuantas visitas nuevas entraron", async () => {});
```

- [ ] **Step 2: Correr y ver que falla.**
- [ ] **Step 3: Implementar `src/acciones/rastro.ts`.**
- [ ] **Step 4: Correr** → PASS.
- [ ] **Step 5: Commit** — `git add src/acciones/rastro.ts tests/acciones-rastro.test.ts && git commit -m "feat(rastro): acciones de enlaces, actualizar, es mio e IPs propias"`

---

### Task 10: Bloque «Lo que hicieron con lo enviado» en las dos fichas y ajustes

**Files:**
- Create: `src/componentes/RastroBloque.tsx` (servidor), `src/componentes/RastroAcciones.tsx` (cliente), `src/componentes/FormularioAjustesRastro.tsx` (cliente)
- Modify: `src/app/(panel)/leads/[id]/page.tsx` (montar `<RastroBloque prospectoId={p.id} propuestaUrl={p.propuestaUrl} rol={u.rol} />` justo antes de `<details className="acordeon historial-plegado">`), `src/app/(panel)/prospectos/[id]/page.tsx` (antes del historial, línea ~66), `src/app/(panel)/ajustes/page.tsx` (sección «Rastro de enlaces» con `<FormularioAjustesRastro ips={await leerIpsPropias()} />`)
- Modify: `src/app/globals.css` (clases `.rastro`, `.rastro__enlace`, `.rastro__dia`, `.rastro__fila`, `.rastro__visitante`, `.rastro__reenvio` resaltado con `var(--ambar)`, lista en 390 px)
- Test: `scripts/verificar-flujo-rastro.mts` (recorrido con Playwright contra el clon, patrón de `scripts/verificar-flujo-web.mts`)

**Interfaces:**
- Consumes: `listarEnlaces`, `visitasDe`, `armarLineaTiempo`, `textoLugar`, `resumirEnlace`, `textoResumenEnlace`, `etiquetaScript`, acciones de Task 9, `BotonCopiar`, `useFlotante`.

`RastroBloque` (server component, `async`): `<section className="tarjeta rastro">` con `<b>Lo que hicieron con lo enviado</b>`; sin enlaces → «Nada registrado todavía.» + `RastroAcciones` (formulario «Agregar enlace»: URL, etiqueta; si `propuestaUrl` descompone a un host nuestro y no está registrada, botón «Seguir este enlace» que la prellena); por enlace: etiqueta, URL corta (`host + prefijo`), «enviado el dd/mm», `textoResumenEnlace`, `BotonCopiar` con la etiqueta `<script>` («Copiar etiqueta para la página»), «Cargar lo archivado» y «Quitar» (solo dueño); línea de tiempo (`armarLineaTiempo(visitas, { conPropias })`, `conPropias` por `?mias=1` en la URL de la página): por día `<h3>` «Hoy», «Ayer» o `fechaVisible`, filas `hora · Visitante N (aparato · lugar la primera vez en el día) · acción` con los textos del spec §7 («Abrió *Demo · factura* · 2 min 10 s · bajó hasta el 90 % · venía de instagram.com», «Volvió a …», «**Reenvió** … por WhatsApp», «Bajó el PDF», «Tocó WhatsApp»); botón «Es mío» por visitante (solo dueño); pie «Ubicación aproximada por IP · DB-IP». Botones «Actualizar» y «Mostrar las mías / Ocultar las mías» (enlace que agrega/quita `?mias=1`).

- [ ] **Step 1: Escribir `scripts/verificar-flujo-rastro.mts`** (recorrido, no unit test): siembra un prospecto lead con un enlace y 6 visitas (2 visitantes, 1 reenvío, 1 propia), entra como dueño, abre `/leads/<id>`, y comprueba: texto «2 visitantes · 3 aperturas · reenviado 1 vez», una fila con «Reenvió», ninguna fila de la propia; con `?mias=1` aparece; a 390 px el bloque no desborda (`scrollWidth <= 390`); en `/ajustes` existe «Rastro de enlaces» y guarda una IP. Imprime ✓/✗ y sale con código ≠ 0 si falla.
- [ ] **Step 2: Implementar los componentes, montar en las tres páginas y el CSS.**
- [ ] **Step 3: `npx tsc --noEmit`** limpio y `npm test` en verde.
- [ ] **Step 4: Correr el recorrido contra el clon** (lo lanza la sesión principal: clon en el puerto 3021 con base de tests, ver `CLAUDE.md` «Medición de neracosu.com»): `node_modules/.bin/tsx scripts/verificar-flujo-rastro.mts` → todo ✓.
- [ ] **Step 5: Commit** — `git add src/componentes/Rastro*.tsx src/componentes/FormularioAjustesRastro.tsx 'src/app/(panel)' src/app/globals.css scripts/verificar-flujo-rastro.mts && git commit -m "feat(rastro): bloque en las fichas, ajustes de IPs propias y recorrido"`

---

### Task 11: Línea en la tarjeta del tablero

**Files:**
- Modify: `src/lib/leads.ts:9-13` (`LeadTarjeta.rastro: string`), `:55-67` (`listarLeads`: tras `findMany`, `const rastro = await resumenesParaTablero(filas.map((f) => f.id))` y `aTarjeta(x, hoy, rastro.get(x.id) ?? "")`), `listarDescartados`, `fichaLead` igual
- Modify: `src/componentes/TarjetaLead.tsx:48-53` (después de `lead__paso`: `{lead.rastro && <div className={`lead__rastro suave${/reenvi/.test(lead.rastro) ? " lead__rastro--reenvio" : ""}`}>{lead.rastro}</div>}`)
- Modify: `src/app/globals.css` (`.lead__rastro { font-size: 13px; }`, `.lead__rastro--reenvio { color: var(--ambar); }`)
- Test: `tests/leads.test.ts` o el que ya pruebe `listarLeads` (+1 caso)

- [ ] **Step 1: Prueba**

```ts
it("listarLeads trae la linea de rastro del lead con enlace y vacia para el que no tiene", async () => {
  /* lead A con enlace + 1 vista no propia hace 2 h + 1 reenvio → /^Vio la propuesta hace 2 h · la reenvió$/ ; lead B sin enlaces → "" */
});
```

- [ ] **Step 2: Correr y ver que falla.** · **Step 3: Implementar.** · **Step 4: Correr** → PASS; `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `git commit -am "feat(rastro): la tarjeta del tablero dice que paso con lo enviado"`

---

### Task 12: Documentación del repo y pruebas completas

**Files:**
- Modify: `CLAUDE.md` (sección nueva «Rastro de enlaces a prospectos (desde el 2026-11-0X)» arriba de «Sin nombres de proyectos…»: qué es, tablas, las dos fuentes, el cron, `?soyyo=1`, IPs propias, el `.mmdb` fuera del repo, la línea del crontab, el `--importar`, y la trampa del truncado diario; enlazar spec y plan)

- [ ] **Step 1: Escribir la sección.**
- [ ] **Step 2: `npm test` y `PROSPECTOS_TEST_DB=1 npm test`** en verde; `npx tsc --noEmit` limpio.
- [ ] **Step 3: Commit** — `git add CLAUDE.md && git commit -m "docs(rastro): como funciona el rastro de enlaces y como se opera"`

---

### Task 13: Despliegue y carga hacia atrás (la hace la sesión principal, no un subagente)

**Files (fuera del repo del panel):**
- Modify: `/home/neracosu/public_html/.htaccess:96` (`script-src` suma `https://prospectos.neracosu.com`)
- Modify: `~/propuestas/<carpeta>/publicar-web.py` de las dos propuestas publicadas (constante `RASTRO_SCRIPT = '<script …data-enlace="<token>" defer></script>'` insertada antes de `</body>`; el `<a id="descargar-pdf">` gana `data-rastro="pdf"`)
- Modify: `~/jamesbark-demo/src/factura/index.html` y `src/panel/index.html` (etiqueta antes de `</body>`, un token por página)
- Crontab, `~/.config/prospectos/geo/`

- [ ] **Step 1: Pausar el automático de correos en Ajustes.** `npx prisma migrate deploy` con el env de producción. `npm run build`. `pm2 restart prospectos --update-env` (confirmar antes con `pm2 list` el nombre). Comprobar `curl -sI https://prospectos.neracosu.com/entrar` → 200 y `pm2 list` sin subir reinicios. Reanudar correos.
- [ ] **Step 2: `mkdir -p ~/.config/prospectos/geo && node_modules/.bin/tsx scripts/actualizar-geo.mts`** (con el env cargado). Comprobar que el `.mmdb` pesa > 50 MB.
- [ ] **Step 3: Ajustes › Rastro: cargar las dos IPs propias de Neri** (casa y VPN; están en la memoria del proyecto, no en el repo).
- [ ] **Step 4: Registrar los enlaces** en las fichas: las dos propuestas a medida (etiqueta «Propuesta») y las dos páginas de la demo de la tienda de ropa («Demo · factura», «Demo · panel»). Copiar cada etiqueta `<script>`.
- [ ] **Step 5: Pegar las etiquetas** en los dos `publicar-web.py` y en los dos HTML de la demo; `.htaccess`; republicar (`python3 publicar-web.py` en cada propuesta; `./publicar.sh` en la demo). Verificar con `curl -s <url> | grep -c rastro.js` → 1 en las cuatro páginas, y que la CSP no bloquee (consola de Chromium headless sin errores de CSP).
- [ ] **Step 6: Importar hacia atrás**: `node_modules/.bin/tsx scripts/rastro-leer.mts --importar --enlace <id> --aplicar` por cada uno de los cuatro enlaces y para `prospectos.neracosu.com` (los `/p/`). **Criterio de hecho 1:** la ficha de la tienda de ropa muestra el 6-nov tres visitantes no propios, dos «Reenvió … por WhatsApp» (13:11 y 13:35 hora de Caracas) y las visitas de Neri solo con «Mostrar las mías».
- [ ] **Step 7: Crontab** (`crontab -e`): `*/10 * * * * bash -c 'set -a; . ~/.config/prospectos/env; set +a; cd ~/public_html/prospectos.neracosu.com && node_modules/.bin/tsx scripts/rastro-leer.mts >> ~/.config/prospectos/rastro.log 2>&1'` y `20 4 3 * * bash -c '… scripts/actualizar-geo.mts >> ~/.config/prospectos/geo.log 2>&1'`.
- [ ] **Step 8: Criterios 2, 3 y 4 del spec** con el teléfono de Neri: abrir una propuesta publicada → en ≤ 10 min aparece con aparato y lugar; pegar el enlace en un WhatsApp propio → «Reenvió»; abrir desde el PC con sesión → solo con «Mostrar las mías».
- [ ] **Step 9: `git push`** del panel; actualizar la memoria del proyecto.
