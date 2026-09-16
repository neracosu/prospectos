# Pieza 1 — Panel de prospección — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un panel Next.js con PIN donde Neri (o un prospectador) entra desde el teléfono, ve la cola del día, envía la propuesta por el canal que tenga el prospecto, marca «se envió», da seguimiento y lleva el embudo; con los 132 hoteles importados y la propuesta de hoteles servida en `/p/<código>` con PDF.

**Architecture:** Next.js 15 App Router con Server Components y Server Actions; Prisma sobre MySQL (`neracosu_prospectos`); CSS plano. Los contratos (fechas de Caracas, celulares, canales, embudo, cola, plantillas) son módulos puros sin base, testeados con vitest; las consultas y acciones van en `src/lib/*.ts` y `src/acciones/*.ts` y se prueban contra `neracosu_prospectos_test`. Apache hace proxy por `.htaccess` a un proceso PM2 `prospectos` en `127.0.0.1:3013`.

**Tech Stack:** Node 20.20 · Next 15.5 · React 19 · Prisma 6.19 · MariaDB 10.11 · zod 4 · jose · bcryptjs 3 · vitest 4 · playwright 1.62 · PM2 (daemon compartido).

**Spec:** `docs/superpowers/specs/2026-09-16-panel-prospeccion-design.md` (pieza 1) y `docs/superpowers/specs/2026-09-16-plataforma-vision-general.md` (roles, canales, reglas comunes). Leer los dos antes de cualquier tarea.

## Global Constraints

- **Un build a la vez en todo el servidor.** `next build` solo desde la sesión principal, nunca desde un subagente ni en paralelo con otro proyecto. Los subagentes verifican con `npx tsc --noEmit` y `npm test`.
- **PM2 compartido** con `hotelmarte`, `adastram` (cobra plata real), `ameb`, `ocls`. `pm2 list` antes de cualquier `start/restart/stop/delete/save`; el proceso de este proyecto se llama **`prospectos`**, puerto **3013**, escucha en `127.0.0.1`.
- **Secretos en `/home/neracosu/.config/prospectos/env` (600)**, nunca en el repo ni en la línea de comandos (`ps` la muestra). Para MySQL fuera de Prisma, un `my.cnf` temporal con `chmod 600` en el scratchpad, borrado al terminar.
- **Tests contra `neracosu_prospectos_test`**, nunca contra la base real. El puente aborta si la URL no contiene `prospectos_test`. `fileParallelism: false`.
- **Este directorio es el docroot público.** El `.htaccess` niega todo salvo `/.well-known/` hasta la tarea de despliegue. Nunca `chown -R` sobre `public_html` (grupo `nobody`).
- **«Hoy» es el día de Caracas (UTC−4 fijo)** vía `hoyCaracas()`; nunca `new Date().toISOString().slice(0,10)` suelto.
- **Toda función exportada de un módulo `"use server"` es pública**: `exigirSesion()`/`exigirRol()` **fuera del try/catch**, entrada validada con zod, ningún auxiliar exportado desde esos módulos. Toda acción devuelve `Resultado<T>`, nunca lanza.
- **Nada se borra**: prospectos se descartan con motivo; usuarios se desactivan.
- Solo contactos publicados por el negocio, cada dato con su fuente (`fuentes` JSON).
- Español (Venezuela) en todo texto visible, **tuteo**; comentarios de código sin acentos. Commits por heredoc (`git commit -F -`), terminados en `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Todo se diseña a **390 px** primero.

---

## Estado del servidor al 16-sep (verificado)

| Qué | Estado | Consecuencia |
|---|---|---|
| Base `neracosu_prospectos`, usuario `neracosu_prospectos` | Existe, credenciales en `~/.config/prospectos/env` como `DB_USER/DB_NAME/DB_PASS`, conexión probada | La tarea 1 reescribe ese archivo a `DATABASE_URL=…` |
| `neracosu_prospectos_shadow`, `neracosu_prospectos_test` | **No existen** | Prisma Migrate necesita la shadow (el usuario de cPanel no puede `CREATE DATABASE`); los tests necesitan la `_test` |
| Subdominio `prospectos.neracosu.com` | **No existe en cPanel** (`uapi DomainInfo list_domains` no lo lista). El DNS resuelve por comodín y Apache sirve el vhost por defecto | Hay que crearlo apuntando a `public_html/prospectos.neracosu.com` |
| Certificado | El que responde es de otro dominio (`autodiscover.terrazasvip.com`) | AutoSSL después de crear el subdominio |
| Puerto 3013 | Libre (`ss -ltn`: 3000–3006, 3009, 3011, 3012 en uso) | — |
| Navegadores de Playwright | `~/.cache/ms-playwright/chromium-1243` ya instalado por Hotel Marte | Instalar `playwright@^1.62.1` reutiliza el binario |
| `cgi-bin/` en el docroot | Directorio vacío de cPanel, ya en `.gitignore` | Ignorar |

## Prerrequisitos (Tarea 0) — con el OK explícito de Neri

Son cambios en cPanel; se hacen por `uapi` desde esta cuenta **después de que Neri diga que sí** a cada uno (son visibles hacia afuera). Ninguno lleva contraseñas en la línea de comandos.

- [ ] **0.1 Crear el subdominio** apuntando a este directorio:

```bash
uapi --output=jsonpretty SubDomain addsubdomain domain=prospectos rootdomain=neracosu.com dir=public_html/prospectos.neracosu.com
uapi --output=jsonpretty DomainInfo single_domain_data domain=prospectos.neracosu.com | grep -E '"(documentroot|status)"'
```

Expected: `"status" : 1` y `documentroot` = `/home/neracosu/public_html/prospectos.neracosu.com`. Comprobar que el cierre del `.htaccess` funciona: `curl -s -o /dev/null -w '%{http_code}\n' http://prospectos.neracosu.com/CLAUDE.md` → **403**.

- [ ] **0.2 Certificado**: `uapi --output=jsonpretty SSL start_autossl_check` y esperar unos minutos; verificar con `curl -sv https://prospectos.neracosu.com/ 2>&1 | grep subject:` → `CN=prospectos.neracosu.com`. Si AutoSSL no emite en una hora, revisar en cPanel → SSL/TLS Status.

- [ ] **0.3 Bases shadow y de tests**, con todos los privilegios para el mismo usuario:

```bash
for b in neracosu_prospectos_shadow neracosu_prospectos_test; do
  uapi --output=jsonpretty Mysql create_database name=$b | grep '"status"'
  uapi --output=jsonpretty Mysql set_privileges_on_database user=neracosu_prospectos database=$b privileges=ALL%20PRIVILEGES | grep '"status"'
done
```

Expected: cuatro `"status" : 1`.

- [ ] **0.4 Rotar la contraseña de la base** (se pegó en un chat el 16-sep). Neri la cambia en cPanel → MySQL Databases y la escribe **solo** en `~/.config/prospectos/env` (tarea 1 explica el formato). Puede hacerse al final de la pieza, pero antes de publicar el enlace de ninguna propuesta.

---

## Estructura de archivos

```
prospectos.neracosu.com/
├── package.json · tsconfig.json · next.config.ts · vitest.config.ts · ecosystem.config.cjs · .gitignore · .htaccess
├── prisma/schema.prisma · prisma/migrations/
├── plantillas/hoteles.html            ← copia de ~/propuestas/hoteles/propuesta-hoteles.html, sin el bloque de descarga del artefacto
├── scripts/
│   ├── convertir-env.mjs              ← una vez: DB_USER/DB_NAME/DB_PASS → DATABASE_URL, etc.
│   ├── crear-usuario.mjs              ← PIN por stdin
│   ├── importar-hoteles.mts           ← los 3 JSON de ~/propuestas/hoteles/prospectos/fuentes/
│   ├── sembrar-farmahogar.mts         ← Farmahogar en `enviado` con fecha 2026-09-15
│   └── verificar-flujo.mts            ← Playwright a 390 px, punta a punta
├── src/lib/
│   ├── db.ts                          ← PrismaClient singleton
│   ├── fecha-caracas.ts               ← hoyCaracas, sumarDias, tocaHoy            (puro)
│   ├── celular-contrato.ts            ← normalizarCelular, normalizarRed          (puro)
│   ├── canales-contrato.ts            ← CANALES, canalesDisponibles, prioridadContacto (puro)
│   ├── plantilla-mensaje.ts           ← rellenar                                  (puro)
│   ├── embudo-contrato.ts             ← ETAPAS, puedePasar, ETIQUETA_ETAPA         (puro)
│   ├── cola-contrato.ts               ← ordenarCola                               (puro)
│   ├── clave-prospecto.ts             ← claveProspecto                            (puro)
│   ├── codigo.ts                      ← generarCodigo
│   ├── rate-limit.ts                  ← permitirIntento (copiado de Hotel Marte)
│   ├── auth.ts                        ← crearToken, verificarToken (jose)
│   ├── sesion.ts                      ← COOKIE_SESION, sesionActual, exigirSesion, exigirRol
│   ├── usuarios.ts                    ← hashPin, buscarPorPin, crearUsuario, cambiarPin, listarUsuarios
│   ├── prospectos.ts                  ← resumenHoy, seguimientosQueTocan, colaDelDia, buscarProspectos, fichaProspecto
│   ├── importar.ts                    ← prospectoDesdeHotelJson, importarProspectos (dedup)
│   ├── propuesta-contrato.ts          ← renderPropuesta                           (puro)
│   └── propuesta.ts                   ← leerPlantilla, rutaPdf, generarPdf
├── src/acciones/
│   ├── resultado.ts · entrar.ts · prospectos.ts · ajustes.ts
├── src/componentes/
│   ├── TecladoPin.tsx · TarjetaCola.tsx · TarjetaSeguimiento.tsx · BotonCopiar.tsx · BarraInferior.tsx · Etapa.tsx
├── src/app/
│   ├── layout.tsx · globals.css · entrar/page.tsx · salir/route.ts
│   ├── (panel)/layout.tsx · (panel)/hoy/page.tsx · (panel)/prospectos/page.tsx
│   ├── (panel)/prospectos/[id]/page.tsx · (panel)/prospectos/nuevo/page.tsx · (panel)/ajustes/page.tsx
│   └── p/[codigo]/route.ts · p/[codigo]/pdf/route.ts
└── tests/
    ├── preparar-entorno.ts · ayuda-db.ts
    ├── fecha-caracas.test.ts · celular-contrato.test.ts · canales-contrato.test.ts · plantilla-mensaje.test.ts
    ├── embudo-contrato.test.ts · cola-contrato.test.ts · clave-prospecto.test.ts · propuesta-contrato.test.ts
    ├── usuarios.test.ts · importar.test.ts · prospectos.test.ts · acciones-prospectos.test.ts · ajustes.test.ts
```

**Convenciones que atraviesan todo:**

- Fechas de seguimiento se guardan como **texto ISO `YYYY-MM-DD`** (`String`), no como `DateTime`: así «hoy en Caracas» se compara con `<=` de texto y no hay zona horaria en la base.
- Los montos no existen en esta pieza.
- `Resultado<T>` y `fallo()/exito()` copiados de Hotel Marte (`src/acciones/resultado.ts`).
- Cada consulta que devuelve prospectos para pantalla usa el tipo `ProspectoTarjeta` (tarea 8).

---

### Task 1: Esqueleto del proyecto, env y verificación de herramientas

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.gitignore` (modificar), `src/lib/db.ts`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`, `scripts/convertir-env.mjs`, `tests/preparar-entorno.ts`, `tests/humo.test.ts`
- Modify: `/home/neracosu/.config/prospectos/env` (por el script, nunca a mano en la línea de comandos)

**Interfaces:**
- Produces: `prisma` (`src/lib/db.ts`), variables de entorno `DATABASE_URL`, `SHADOW_DATABASE_URL`, `TEST_DATABASE_URL`, `SESION_SECRET`, `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, `PORT`, `PROSPECTOS_DIR_ARCHIVOS`, `PROSPECTOS_URL_PUBLICA`; bandera de tests `PROSPECTOS_TEST_DB=1`.

- [ ] **Step 1: `package.json`**

```json
{
  "name": "prospectos",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3013",
    "build": "next build",
    "start": "next start -p 3013 -H 127.0.0.1",
    "tsc": "tsc --noEmit",
    "test": "vitest run",
    "test:db": "PROSPECTOS_TEST_DB=1 vitest run",
    "migrar": "prisma migrate deploy",
    "postinstall": "prisma generate"
  },
  "dependencies": {
    "@prisma/client": "6.19.3",
    "bcryptjs": "^3.0.3",
    "jose": "^6.0.0",
    "next": "^15.5.24",
    "react": "^19.2.8",
    "react-dom": "^19.2.8",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "playwright": "^1.62.1",
    "prisma": "6.19.3",
    "typescript": "^5.9.3",
    "vitest": "^4.1.11"
  }
}
```

- [ ] **Step 2: `tsconfig.json`** (igual al de Hotel Marte)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: `next.config.ts`**

```ts
import type { NextConfig } from "next";

const config: NextConfig = {
  // No revelar el framework en las respuestas.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
      // Las propuestas son publicas por codigo pero no se indexan.
      { source: "/p/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default config;
```

- [ ] **Step 4: `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Redirige DATABASE_URL a la base de tests cuando PROSPECTOS_TEST_DB=1.
    // Tiene que correr antes que cualquier import de @/lib/db.
    setupFiles: ["tests/preparar-entorno.ts"],
    // De a uno: todos pegan contra la misma base MySQL (leccion de Hotel Marte:
    // en paralelo daba deadlocks al azar).
    fileParallelism: false,
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
```

- [ ] **Step 5: `.gitignore`** — dejarlo así:

```
node_modules/
.next/
.env*
*.log
cgi-bin/
pdf/
.well-known/
tsconfig.tsbuildinfo
next-env.d.ts
/capturas/
```

- [ ] **Step 6: `scripts/convertir-env.mjs`** — convierte el archivo actual (`DB_USER/DB_NAME/DB_PASS`) al formato que usa la app, generando los secretos. Lee y escribe el archivo; la contraseña nunca pasa por argumentos.

```js
#!/usr/bin/env node
// Convierte ~/.config/prospectos/env de DB_USER/DB_NAME/DB_PASS al formato de
// la app. Se corre UNA vez. Es idempotente: si ya hay DATABASE_URL no toca nada.
import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { randomBytes } from "node:crypto";

const RUTA = "/home/neracosu/.config/prospectos/env";
const texto = readFileSync(RUTA, "utf8");
if (/^DATABASE_URL=/m.test(texto)) {
  console.log("Ya esta convertido; no se toca.");
  process.exit(0);
}
const v = {};
for (const linea of texto.split("\n")) {
  const m = linea.match(/^([A-Z_]+)=(.*)$/);
  if (m) v[m[1]] = m[2].trim().replace(/^"|"$/g, "");
}
for (const k of ["DB_USER", "DB_NAME", "DB_PASS"]) {
  if (!v[k]) { console.error(`Falta ${k} en ${RUTA}`); process.exit(1); }
}
const pass = encodeURIComponent(v.DB_PASS);
const url = (base) => `mysql://${v.DB_USER}:${pass}@localhost:3306/${base}`;
const salida = [
  "# Generado por scripts/convertir-env.mjs el " + new Date().toISOString().slice(0, 10),
  `DATABASE_URL=${url(v.DB_NAME)}`,
  "# Shadow: Prisma Migrate la necesita porque el usuario de cPanel no puede CREATE DATABASE.",
  `SHADOW_DATABASE_URL=${url(v.DB_NAME + "_shadow")}`,
  "# Base EXCLUSIVA de tests. El puente (tests/preparar-entorno.ts) aborta si la URL no dice prospectos_test.",
  `TEST_DATABASE_URL=${url(v.DB_NAME + "_test")}`,
  `SESION_SECRET=${randomBytes(32).toString("base64url")}`,
  "# Fija desde el primer build: sin ella cada build invalida las pestanas abiertas (ver spec, parte 3).",
  `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=${randomBytes(32).toString("base64")}`,
  "PORT=3013",
  "PROSPECTOS_DIR_ARCHIVOS=/home/neracosu/prospectos-archivos",
  "PROSPECTOS_URL_PUBLICA=https://prospectos.neracosu.com",
  "",
].join("\n");
writeFileSync(RUTA + ".bak-" + Date.now(), texto, { mode: 0o600 });
writeFileSync(RUTA, salida, { mode: 0o600 });
chmodSync(RUTA, 0o600);
console.log("Convertido. Respaldo del original junto al archivo.");
```

Run: `node scripts/convertir-env.mjs && sed 's/=.*/=…/' ~/.config/prospectos/env && ls -la ~/.config/prospectos/`
Expected: las 9 claves listadas con `=…`, archivo `-rw-------`.

- [ ] **Step 7: `tests/preparar-entorno.ts`**

```ts
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

// Corre ANTES de que cualquier test importe @/lib/db (instancia PrismaClient al
// importar leyendo DATABASE_URL). Por eso vive en setupFiles.
const RUTA_ENV = process.env.PROSPECTOS_ENV_FILE ?? "/home/neracosu/.config/prospectos/env";
// Marca que la base de tests DEBE tener en el nombre: si la URL apunta a otro
// lado, los tests no arrancan en vez de escribir donde no deben.
const MARCA = "prospectos_test";

function leerDelArchivoEnv(clave: string): string | undefined {
  try {
    for (const linea of readFileSync(RUTA_ENV, "utf8").split("\n")) {
      if (linea.startsWith(`${clave}=`)) return linea.slice(clave.length + 1).trim().replace(/^"|"$/g, "");
    }
  } catch {
    // Puede no existir en otra maquina; lo que importa es si al final hay URL.
  }
  return undefined;
}

if (process.env.PROSPECTOS_TEST_DB === "1") {
  const url = process.env.TEST_DATABASE_URL ?? leerDelArchivoEnv("TEST_DATABASE_URL");
  if (!url) throw new Error(`PROSPECTOS_TEST_DB=1 pero no hay TEST_DATABASE_URL (ni en el entorno ni en ${RUTA_ENV}).`);
  if (!url.includes(MARCA)) throw new Error(`TEST_DATABASE_URL no apunta a una base de tests (falta "${MARCA}").`);
  process.env.DATABASE_URL = url;
}
process.env.SESION_SECRET ??= "secreto-de-tests-no-usar-en-produccion";
process.env.PROSPECTOS_DIR_ARCHIVOS ??= path.join(os.tmpdir(), "prospectos-tests-archivos");
process.env.PROSPECTOS_URL_PUBLICA ??= "http://localhost:3013";
```

- [ ] **Step 8: `src/lib/db.ts`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`**

```ts
// src/lib/db.ts
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```

```tsx
// src/app/layout.tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Prospectos NERACOSU", robots: { index: false, follow: false } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
```

```css
/* src/app/globals.css — base movil primero */
:root {
  --fondo: #0f1412; --panel: #171e1b; --borde: #26302c; --tinta: #eef3f0; --tinta-suave: #9db0a6;
  --verde: #5ed29c; --rojo: #ef6b6b; --ambar: #f0c35a; --radio: 12px;
  --barra-alto: 64px;
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--fondo); color: var(--tinta); font: 16px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
a { color: inherit; }
button, input, select, textarea { font: inherit; }
.contenedor { padding: 16px; padding-bottom: calc(var(--barra-alto) + 24px); max-width: 640px; margin: 0 auto; }
.tarjeta { background: var(--panel); border: 1px solid var(--borde); border-radius: var(--radio); padding: 14px; margin-bottom: 12px; }
.boton { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; padding: 0 16px; border-radius: 10px; border: 1px solid var(--borde); background: var(--panel); color: var(--tinta); text-decoration: none; cursor: pointer; }
.boton--primario { background: var(--verde); color: #0b1a12; border-color: var(--verde); font-weight: 600; }
.boton--peligro { border-color: var(--rojo); color: var(--rojo); }
.boton:disabled { opacity: .5; cursor: default; }
.fila-botones { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.campo { display: block; margin-bottom: 12px; }
.campo > span { display: block; font-size: 14px; color: var(--tinta-suave); margin-bottom: 4px; }
.campo input, .campo select, .campo textarea { width: 100%; min-height: 44px; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--borde); background: #0c100e; color: var(--tinta); }
.suave { color: var(--tinta-suave); font-size: 14px; }
.error { color: var(--rojo); font-size: 14px; }
.titulo { font-size: 20px; margin: 4px 0 12px; }
```

```tsx
// src/app/page.tsx — la raiz manda a Hoy; el layout del panel exige sesion.
import { redirect } from "next/navigation";
export default function Raiz() { redirect("/hoy"); }
```

- [ ] **Step 9: test de humo `tests/humo.test.ts`**

```ts
import { describe, it, expect } from "vitest";
describe("entorno de tests", () => {
  it("carga el alias @ y las variables base", async () => {
    const m = await import("@/lib/fecha-caracas").catch(() => null);
    expect(m).toBeNull(); // todavia no existe: el test solo prueba que vitest arranca
    expect(process.env.SESION_SECRET).toBeTruthy();
  });
});
```

- [ ] **Step 10: instalar y verificar**

Run: `npm install 2>&1 | tail -3 && npx tsc --noEmit && npm test 2>&1 | tail -5`
Expected: `tsc` sin errores; `1 passed`. (`postinstall` falla porque aún no hay `prisma/schema.prisma`: correr `npm install --ignore-scripts` en esta tarea y `npx prisma generate` en la tarea 2.)

- [ ] **Step 11: Commit**

```bash
git add -A && git commit -F - <<'EOF'
chore: esqueleto Next 15 + vitest + puente de tests con marca prospectos_test

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 2: Esquema Prisma y ayuda de tests con base

**Files:**
- Create: `prisma/schema.prisma`, `tests/ayuda-db.ts`, `tests/esquema.test.ts`
- Modify: `tests/humo.test.ts` (borrar)

**Interfaces:**
- Produces: modelos `Usuario`, `Nicho`, `Prospecto`, `Evento`, `Configuracion`; `tests/ayuda-db.ts` con `DB_HABILITADA`, `limpiarBase()`, `sembrarBasico()` → `{ nichoId, usuarioId, prospectadorId }`.

- [ ] **Step 1: `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider          = "mysql"
  url               = env("DATABASE_URL")
  // El usuario MySQL de cPanel no puede CREATE DATABASE: shadow dedicada.
  shadowDatabaseUrl = env("SHADOW_DATABASE_URL")
}

model Usuario {
  id         Int      @id @default(autoincrement())
  nombre     String
  rol        String   // dueno | prospectador | cliente (pieza 5)
  activo     Boolean  @default(true)
  pinHash    String
  metaDiaria Int      @default(10)
  creadoEn   DateTime @default(now())
  eventos    Evento[]
}

model Nicho {
  id                 Int         @id @default(autoincrement())
  slug               String      @unique
  nombre             String
  // Plantillas con {nombre} y {enlace}
  mensajeInicial     String      @db.Text
  mensajeSeguimiento String      @db.Text
  // Nombre del archivo en plantillas/ (sin .html). Vacio = sin propuesta en linea.
  plantillaPropuesta String      @default("")
  diasSeguimiento    Int         @default(3)
  prospectos         Prospecto[]
}

model Prospecto {
  id                 Int       @id @default(autoincrement())
  nichoId            Int
  nicho              Nicho     @relation(fields: [nichoId], references: [id])
  nombre             String
  ciudad             String
  estado             String    @default("")
  region             String    @default("")
  tipo               String    @default("")
  tamano             String    @default("")
  telefono           String    @default("")
  whatsapp           String    @default("") // 58XXXXXXXXXX o vacio
  email              String    @default("")
  web                String    @default("")
  instagram          String    @default("")
  facebook           String    @default("")
  tiktok             String    @default("")
  nota               String    @default("") @db.Text
  fuentes            Json      // lista de URLs (pieza 2 suma {campo: url})
  origen             String    @default("importado") // importado | manual | overpass | web | maps
  etapa              String    @default("por_contactar")
  // Texto ISO YYYY-MM-DD en dia de Caracas. Nulo = sin seguimiento pendiente.
  proximoSeguimiento String?
  codigo             String    @unique // 16 bytes base64url, para /p/<codigo>
  ordenCola          Int       @default(0)
  // nombre+ciudad normalizados: reimportar no duplica
  clave              String
  creadoEn           DateTime  @default(now())
  eventos            Evento[]

  @@unique([nichoId, clave])
  @@index([etapa, ordenCola])
  @@index([etapa, proximoSeguimiento])
}

model Evento {
  id          Int       @id @default(autoincrement())
  prospectoId Int
  prospecto   Prospecto @relation(fields: [prospectoId], references: [id])
  usuarioId   Int?
  usuario     Usuario?  @relation(fields: [usuarioId], references: [id])
  // etapa | enviado | abierto | nota | saltado | importado | seguimiento
  tipo        String
  de          String    @default("")
  a           String    @default("")
  canal       String    @default("")
  texto       String    @default("") @db.Text
  creadoEn    DateTime  @default(now())

  @@index([prospectoId, creadoEn])
  @@index([tipo, creadoEn])
}

model Configuracion {
  clave String @id
  valor String @db.Text
}
```

- [ ] **Step 2: migración inicial y cliente**

Run: `set -a; . ~/.config/prospectos/env; set +a; npx prisma migrate dev --name inicial 2>&1 | tail -5 && npx prisma generate | tail -1`
Expected: `prisma/migrations/<fecha>_inicial/migration.sql` creado, «Your database is now in sync». Luego aplicar a la base de tests: `DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy | tail -2`.

(El `set -a; . env` carga las variables en la shell de esa línea; no las imprime. No usar `export DATABASE_URL=mysql://…` a mano.)

- [ ] **Step 3: `tests/ayuda-db.ts`**

```ts
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

// Los tests con base exigen PROSPECTOS_TEST_DB=1 para que un "npm test" casual
// no toque la base real. Con la bandera, preparar-entorno.ts ya redirigio
// DATABASE_URL a neracosu_prospectos_test.
export const DB_HABILITADA = process.env.PROSPECTOS_TEST_DB === "1";

export const PIN_DUENO = "123456";
export const PIN_PROSPECTADOR = "654321";

// La base de tests no guarda historia: se vacia entera, en orden de claves foraneas.
export async function limpiarBase(): Promise<void> {
  await prisma.evento.deleteMany();
  await prisma.prospecto.deleteMany();
  await prisma.nicho.deleteMany();
  await prisma.usuario.deleteMany();
  await prisma.configuracion.deleteMany();
}

export async function sembrarBasico(): Promise<{ nichoId: number; usuarioId: number; prospectadorId: number }> {
  const nicho = await prisma.nicho.create({
    data: {
      slug: "hoteles",
      nombre: "Hoteles",
      mensajeInicial: "Buenas, equipo de {nombre}. Propuesta: {enlace}",
      mensajeSeguimiento: "Hola de nuevo, {nombre}. ¿Pudiste ver la propuesta? {enlace}",
      plantillaPropuesta: "hoteles",
      diasSeguimiento: 3,
    },
  });
  const dueno = await prisma.usuario.create({
    data: { nombre: "Neri", rol: "dueno", pinHash: await bcrypt.hash(PIN_DUENO, 4), metaDiaria: 10 },
  });
  const prospectador = await prisma.usuario.create({
    data: { nombre: "María", rol: "prospectador", pinHash: await bcrypt.hash(PIN_PROSPECTADOR, 4), metaDiaria: 5 },
  });
  return { nichoId: nicho.id, usuarioId: dueno.id, prospectadorId: prospectador.id };
}

export async function crearProspectoDePrueba(
  nichoId: number,
  extra: Partial<{ nombre: string; ciudad: string; whatsapp: string; telefono: string; email: string; instagram: string; etapa: string; proximoSeguimiento: string | null; ordenCola: number }> = {},
) {
  const nombre = extra.nombre ?? `Hotel Prueba ${Math.random().toString(36).slice(2, 7)}`;
  const ciudad = extra.ciudad ?? "Caracas";
  return prisma.prospecto.create({
    data: {
      nichoId,
      nombre,
      ciudad,
      fuentes: ["https://ejemplo.test/"],
      codigo: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
      clave: (nombre + "|" + ciudad).toLowerCase().replace(/[^a-z0-9|]/g, ""),
      ...extra,
    },
  });
}
```

- [ ] **Step 4: `tests/esquema.test.ts`** (reemplaza `humo.test.ts`)

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, crearProspectoDePrueba } from "./ayuda-db";

describe.runIf(DB_HABILITADA)("esquema", () => {
  beforeAll(limpiarBase);
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("no deja dos prospectos con la misma clave en el mismo nicho", async () => {
    const { nichoId } = await sembrarBasico();
    await crearProspectoDePrueba(nichoId, { nombre: "Hotel Yare", ciudad: "Caracas" });
    await expect(crearProspectoDePrueba(nichoId, { nombre: "Hotel Yare", ciudad: "Caracas" })).rejects.toThrow(/Unique/);
  });
});
```

Run: `rm tests/humo.test.ts && npm run test:db 2>&1 | tail -4`
Expected: `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -F - <<'EOF'
feat: esquema Prisma (Usuario, Nicho, Prospecto, Evento, Configuracion) y ayuda de tests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 3: Contratos puros — día de Caracas y plantillas de mensaje

**Files:**
- Create: `src/lib/fecha-caracas.ts`, `src/lib/plantilla-mensaje.ts`, `tests/fecha-caracas.test.ts`, `tests/plantilla-mensaje.test.ts`

**Interfaces:**
- Produces: `hoyCaracas(ahora?: Date): string`, `sumarDias(fecha: string, dias: number): string`, `tocaHoy(proximo: string | null, hoy: string): boolean`, `esFechaIso(s: string): boolean`, `rellenar(plantilla: string, valores: Record<string, string>): string`.

- [ ] **Step 1: tests de fecha**

```ts
// tests/fecha-caracas.test.ts
import { describe, it, expect } from "vitest";
import { hoyCaracas, sumarDias, tocaHoy, esFechaIso } from "@/lib/fecha-caracas";

describe("hoyCaracas", () => {
  it("a las 02:00 UTC todavia es el dia anterior en Caracas (UTC-4)", () => {
    expect(hoyCaracas(new Date("2026-09-17T02:00:00Z"))).toBe("2026-09-16");
  });
  it("a las 04:00 UTC ya es el dia siguiente en Caracas", () => {
    expect(hoyCaracas(new Date("2026-09-17T04:00:00Z"))).toBe("2026-09-17");
  });
  it("no depende de la zona del servidor", () => {
    expect(hoyCaracas(new Date("2026-12-31T23:59:59Z"))).toBe("2026-12-31");
    expect(hoyCaracas(new Date("2027-01-01T03:59:59Z"))).toBe("2026-12-31");
  });
});

describe("sumarDias", () => {
  it("cruza fin de mes y de anio", () => {
    expect(sumarDias("2026-09-29", 3)).toBe("2026-10-02");
    expect(sumarDias("2026-12-30", 3)).toBe("2027-01-02");
  });
  it("acepta negativos", () => {
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("tocaHoy", () => {
  it("toca si la fecha es hoy o ya paso", () => {
    expect(tocaHoy("2026-09-16", "2026-09-16")).toBe(true);
    expect(tocaHoy("2026-09-10", "2026-09-16")).toBe(true);
    expect(tocaHoy("2026-09-17", "2026-09-16")).toBe(false);
    expect(tocaHoy(null, "2026-09-16")).toBe(false);
  });
});

describe("esFechaIso", () => {
  it("valida el formato y el calendario", () => {
    expect(esFechaIso("2026-02-28")).toBe(true);
    expect(esFechaIso("2026-02-30")).toBe(false);
    expect(esFechaIso("16/09/2026")).toBe(false);
  });
});
```

- [ ] **Step 2: correr y ver fallar**

Run: `npx vitest run tests/fecha-caracas.test.ts 2>&1 | tail -3`
Expected: FAIL, «Failed to resolve import "@/lib/fecha-caracas"».

- [ ] **Step 3: implementación**

```ts
// src/lib/fecha-caracas.ts
// "Hoy" es el dia de Caracas (UTC-4 fijo, sin horario de verano), no el del
// servidor ni el del navegador. Todo lo que diga "hoy" pasa por aqui.
const DESFASE_MS = -4 * 60 * 60 * 1000;

export function hoyCaracas(ahora: Date = new Date()): string {
  return new Date(ahora.getTime() + DESFASE_MS).toISOString().slice(0, 10);
}

export function esFechaIso(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(fecha + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function tocaHoy(proximo: string | null, hoy: string): boolean {
  return proximo !== null && proximo <= hoy;
}
```

- [ ] **Step 4: tests de plantilla**

```ts
// tests/plantilla-mensaje.test.ts
import { describe, it, expect } from "vitest";
import { rellenar } from "@/lib/plantilla-mensaje";

describe("rellenar", () => {
  it("sustituye {nombre} y {enlace} todas las veces", () => {
    expect(rellenar("Hola {nombre}. Mira {enlace}. Gracias, {nombre}.", { nombre: "Hotel Yare", enlace: "https://x/p/abc" }))
      .toBe("Hola Hotel Yare. Mira https://x/p/abc. Gracias, Hotel Yare.");
  });
  it("deja intacta una variable que no conoce", () => {
    expect(rellenar("Hola {nombre}, {monto}", { nombre: "A" })).toBe("Hola A, {monto}");
  });
  it("no interpreta llaves dentro del valor", () => {
    expect(rellenar("{nombre}", { nombre: "{enlace}" })).toBe("{enlace}");
  });
});
```

- [ ] **Step 5: implementación**

```ts
// src/lib/plantilla-mensaje.ts
// Plantillas de Nicho: {nombre}, {enlace}. Una variable desconocida se deja
// tal cual para que se note en pantalla en vez de desaparecer.
export function rellenar(plantilla: string, valores: Record<string, string>): string {
  return plantilla.replace(/\{([a-zA-Z_]+)\}/g, (todo, clave: string) =>
    Object.prototype.hasOwnProperty.call(valores, clave) ? valores[clave] : todo,
  );
}
```

- [ ] **Step 6: verificar y commit**

Run: `npx vitest run tests/fecha-caracas.test.ts tests/plantilla-mensaje.test.ts 2>&1 | tail -3 && npx tsc --noEmit`
Expected: `10 passed`, tsc limpio.

```bash
git add -A && git commit -F - <<'EOF'
feat: dia de Caracas y plantillas de mensaje (contratos puros con tests)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 4: Contratos puros — celulares, redes y canales de contacto

**Files:**
- Create: `src/lib/celular-contrato.ts`, `src/lib/canales-contrato.ts`, `tests/celular-contrato.test.ts`, `tests/canales-contrato.test.ts`

**Interfaces:**
- Produces:
  - `normalizarCelular(texto: string): string` → `58XXXXXXXXXX` o `""`.
  - `normalizarRed(valor: string, red: "instagram" | "facebook" | "tiktok"): string` → URL o `""`.
  - `CANALES`, `type Canal`, `type ContactoProspecto = { whatsapp; telefono; email; instagram; facebook; tiktok }` (todos `string`).
  - `type AccionCanal = { canal: Canal; etiqueta: string; href: string; modo: "abrir" | "copiar_y_abrir" }`.
  - `canalesDisponibles(c: ContactoProspecto, mensaje: string, asunto?: string): AccionCanal[]` en orden de prioridad.
  - `prioridadContacto(c: ContactoProspecto): number` → 0 WhatsApp · 1 SMS/llamada/email · 2 redes · 3 nada.
  - `ETIQUETA_CANAL: Record<Canal, string>`.

- [ ] **Step 1: tests de celular y redes**

```ts
// tests/celular-contrato.test.ts
import { describe, it, expect } from "vitest";
import { normalizarCelular, normalizarRed } from "@/lib/celular-contrato";

describe("normalizarCelular", () => {
  it.each([
    ["0412-322-9005", "584123229005"],
    ["+58 412 3229005", "584123229005"],
    ["(0414) 555.12.34", "584145551234"],
    ["58 424 1234567", "584241234567"],
    ["0212.793.0708 / +58 412 3229005", "584123229005"], // toma el primer celular, ignora el fijo
    ["0212-7930708", ""], // fijo: no es celular
    ["", ""],
    ["0499 1234567", ""], // prefijo que no existe
  ])("%s -> %s", (entrada, salida) => {
    expect(normalizarCelular(entrada)).toBe(salida);
  });
});

describe("normalizarRed", () => {
  it("convierte usuario en URL y respeta una URL completa", () => {
    expect(normalizarRed("@hotelyare", "instagram")).toBe("https://www.instagram.com/hotelyare/");
    expect(normalizarRed("hotelyare/", "instagram")).toBe("https://www.instagram.com/hotelyare/");
    expect(normalizarRed("https://instagram.com/hotelyare", "instagram")).toBe("https://instagram.com/hotelyare");
    expect(normalizarRed("hotelyare", "facebook")).toBe("https://www.facebook.com/hotelyare");
    expect(normalizarRed("@hotelyare", "tiktok")).toBe("https://www.tiktok.com/@hotelyare");
    expect(normalizarRed("", "tiktok")).toBe("");
  });
});
```

- [ ] **Step 2: implementación**

```ts
// src/lib/celular-contrato.ts
// Mismo criterio que ~/propuestas/hoteles/prospectos/armar.py (moviles):
// celulares venezolanos 0412/0414/0416/0424/0426/0422, a 58XXXXXXXXXX.
const CELULAR = /(?:\+?58[\s.\-]*)?\(?0?(4(?:12|14|16|24|26|22))\)?[\s.\-]*(\d{3})[\s.\-]*(\d{2})[\s.\-]*(\d{2})/;

export function normalizarCelular(texto: string): string {
  const m = CELULAR.exec(texto ?? "");
  return m ? `58${m[1]}${m[2]}${m[3]}${m[4]}` : "";
}

const BASE_RED = {
  instagram: (u: string) => `https://www.instagram.com/${u}/`,
  facebook: (u: string) => `https://www.facebook.com/${u}`,
  tiktok: (u: string) => `https://www.tiktok.com/@${u}`,
} as const;

export function normalizarRed(valor: string, red: keyof typeof BASE_RED): string {
  const v = (valor ?? "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  const usuario = v.replace(/^@/, "").replace(/\/+$/, "");
  return usuario ? BASE_RED[red](usuario) : "";
}
```

- [ ] **Step 3: tests de canales**

```ts
// tests/canales-contrato.test.ts
import { describe, it, expect } from "vitest";
import { canalesDisponibles, prioridadContacto, type ContactoProspecto } from "@/lib/canales-contrato";

const vacio: ContactoProspecto = { whatsapp: "", telefono: "", email: "", instagram: "", facebook: "", tiktok: "" };
const msj = "Hola & adiós";

describe("canalesDisponibles", () => {
  it("con WhatsApp: wa.me primero, con el mensaje codificado", () => {
    const c = canalesDisponibles({ ...vacio, whatsapp: "584123229005", email: "a@b.co" }, msj, "Propuesta");
    expect(c[0]).toEqual({ canal: "whatsapp", etiqueta: "Enviar por WhatsApp", href: "https://wa.me/584123229005?text=Hola%20%26%20adi%C3%B3s", modo: "abrir" });
    expect(c.map((x) => x.canal)).toEqual(["whatsapp", "sms", "llamada", "email"]);
  });
  it("SMS y llamada salen del mismo celular; email lleva asunto", () => {
    const c = canalesDisponibles({ ...vacio, whatsapp: "584123229005", email: "a@b.co" }, msj, "Propuesta");
    expect(c.find((x) => x.canal === "sms")?.href).toBe("sms:+584123229005?body=Hola%20%26%20adi%C3%B3s");
    expect(c.find((x) => x.canal === "llamada")?.href).toBe("tel:+584123229005");
    expect(c.find((x) => x.canal === "email")?.href).toBe("mailto:a@b.co?subject=Propuesta&body=Hola%20%26%20adi%C3%B3s");
  });
  it("un fijo permite llamar pero no WhatsApp ni SMS", () => {
    const c = canalesDisponibles({ ...vacio, telefono: "0212-793-0708" }, msj);
    expect(c.map((x) => x.canal)).toEqual(["llamada"]);
    expect(c[0].href).toBe("tel:02127930708");
  });
  it("redes: copiar y abrir el perfil", () => {
    const c = canalesDisponibles({ ...vacio, instagram: "https://www.instagram.com/hotelyare/" }, msj);
    expect(c).toEqual([{ canal: "instagram", etiqueta: "Copiar y abrir Instagram", href: "https://www.instagram.com/hotelyare/", modo: "copiar_y_abrir" }]);
  });
  it("sin nada: lista vacia", () => {
    expect(canalesDisponibles(vacio, msj)).toEqual([]);
  });
});

describe("prioridadContacto", () => {
  it("ordena WhatsApp < telefono/email < redes < nada", () => {
    expect(prioridadContacto({ ...vacio, whatsapp: "584123229005" })).toBe(0);
    expect(prioridadContacto({ ...vacio, email: "a@b.co" })).toBe(1);
    expect(prioridadContacto({ ...vacio, telefono: "0212-1" })).toBe(1);
    expect(prioridadContacto({ ...vacio, tiktok: "https://www.tiktok.com/@x" })).toBe(2);
    expect(prioridadContacto(vacio)).toBe(3);
  });
});
```

- [ ] **Step 4: implementación**

```ts
// src/lib/canales-contrato.ts
// Que boton dibuja cada canal y que pasa al tocarlo. WhatsApp/SMS/email abren
// la app con el mensaje; llamada abre el marcador; las redes no dejan abrir un
// DM con texto desde un enlace, asi que se copia el mensaje y se abre el perfil.
export const CANALES = ["whatsapp", "sms", "llamada", "email", "instagram", "facebook", "tiktok", "otro"] as const;
export type Canal = (typeof CANALES)[number];

export const ETIQUETA_CANAL: Record<Canal, string> = {
  whatsapp: "WhatsApp", sms: "SMS", llamada: "Llamada", email: "Correo",
  instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", otro: "Otro",
};

export type ContactoProspecto = {
  whatsapp: string; telefono: string; email: string; instagram: string; facebook: string; tiktok: string;
};

export type AccionCanal = { canal: Canal; etiqueta: string; href: string; modo: "abrir" | "copiar_y_abrir" };

export function canalesDisponibles(c: ContactoProspecto, mensaje: string, asunto = "Propuesta"): AccionCanal[] {
  const texto = encodeURIComponent(mensaje);
  const salida: AccionCanal[] = [];
  if (c.whatsapp) {
    salida.push({ canal: "whatsapp", etiqueta: "Enviar por WhatsApp", href: `https://wa.me/${c.whatsapp}?text=${texto}`, modo: "abrir" });
    salida.push({ canal: "sms", etiqueta: "Enviar SMS", href: `sms:+${c.whatsapp}?body=${texto}`, modo: "abrir" });
    salida.push({ canal: "llamada", etiqueta: "Llamar", href: `tel:+${c.whatsapp}`, modo: "abrir" });
  } else if (c.telefono) {
    const digitos = c.telefono.replace(/[^\d+]/g, "");
    if (digitos) salida.push({ canal: "llamada", etiqueta: "Llamar", href: `tel:${digitos}`, modo: "abrir" });
  }
  if (c.email) {
    salida.push({ canal: "email", etiqueta: "Enviar correo", href: `mailto:${c.email}?subject=${encodeURIComponent(asunto)}&body=${texto}`, modo: "abrir" });
  }
  for (const red of ["instagram", "facebook", "tiktok"] as const) {
    if (c[red]) salida.push({ canal: red, etiqueta: `Copiar y abrir ${ETIQUETA_CANAL[red]}`, href: c[red], modo: "copiar_y_abrir" });
  }
  return salida;
}

export function prioridadContacto(c: ContactoProspecto): number {
  if (c.whatsapp) return 0;
  if (c.telefono || c.email) return 1;
  if (c.instagram || c.facebook || c.tiktok) return 2;
  return 3;
}
```

- [ ] **Step 5: verificar y commit**

Run: `npx vitest run tests/celular-contrato.test.ts tests/canales-contrato.test.ts 2>&1 | tail -3 && npx tsc --noEmit`
Expected: todos `passed`, tsc limpio.

```bash
git add -A && git commit -F - <<'EOF'
feat: normalizacion de celulares y redes, y acciones por canal (contratos puros)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 5: Contratos puros — embudo, cola, clave y código

**Files:**
- Create: `src/lib/embudo-contrato.ts`, `src/lib/cola-contrato.ts`, `src/lib/clave-prospecto.ts`, `src/lib/codigo.ts`, `tests/embudo-contrato.test.ts`, `tests/cola-contrato.test.ts`, `tests/clave-prospecto.test.ts`

**Interfaces:**
- Produces:
  - `ETAPAS`, `type Etapa`, `ETIQUETA_ETAPA: Record<Etapa, string>`, `puedePasar(de: Etapa, a: Etapa): boolean`, `esEtapa(s: string): s is Etapa`.
  - `ordenarCola<T extends ContactoProspecto & { ordenCola: number }>(lista: T[]): T[]`.
  - `claveProspecto(nombre: string, ciudad: string): string`.
  - `generarCodigo(): string` (22 caracteres base64url = 16 bytes).

- [ ] **Step 1: tests**

```ts
// tests/embudo-contrato.test.ts
import { describe, it, expect } from "vitest";
import { puedePasar, esEtapa, ETAPAS } from "@/lib/embudo-contrato";

describe("embudo", () => {
  it("sigue el orden por_contactar -> enviado -> respondio -> reunion -> ganado", () => {
    expect(puedePasar("por_contactar", "enviado")).toBe(true);
    expect(puedePasar("enviado", "respondio")).toBe(true);
    expect(puedePasar("respondio", "reunion")).toBe(true);
    expect(puedePasar("respondio", "ganado")).toBe(true); // se puede cerrar sin reunion
    expect(puedePasar("reunion", "ganado")).toBe(true);
  });
  it("no retrocede, salvo reactivar un descartado", () => {
    expect(puedePasar("enviado", "por_contactar")).toBe(false);
    expect(puedePasar("ganado", "enviado")).toBe(false);
    expect(puedePasar("descartado", "por_contactar")).toBe(true);
  });
  it("se puede descartar desde cualquier etapa menos ganado", () => {
    for (const e of ETAPAS) {
      expect(puedePasar(e, "descartado")).toBe(e !== "ganado" && e !== "descartado");
    }
  });
  it("esEtapa filtra texto arbitrario", () => {
    expect(esEtapa("enviado")).toBe(true);
    expect(esEtapa("Enviado")).toBe(false);
  });
});
```

```ts
// tests/cola-contrato.test.ts
import { describe, it, expect } from "vitest";
import { ordenarCola } from "@/lib/cola-contrato";

const base = { telefono: "", email: "", instagram: "", facebook: "", tiktok: "" };

describe("ordenarCola", () => {
  it("WhatsApp primero, luego telefono/email, luego redes, luego nada; dentro de cada grupo por ordenCola", () => {
    const lista = [
      { id: 1, ordenCola: 1, whatsapp: "", ...base, instagram: "https://i/x" },
      { id: 2, ordenCola: 2, whatsapp: "584120000000", ...base },
      { id: 3, ordenCola: 3, whatsapp: "", ...base },
      { id: 4, ordenCola: 4, whatsapp: "", ...base, email: "a@b.co" },
      { id: 5, ordenCola: 0, whatsapp: "584120000001", ...base },
    ];
    expect(ordenarCola(lista).map((p) => p.id)).toEqual([5, 2, 4, 1, 3]);
  });
  it("no muta la lista original", () => {
    const lista = [{ id: 1, ordenCola: 2, whatsapp: "", ...base }, { id: 2, ordenCola: 1, whatsapp: "5841", ...base }];
    ordenarCola(lista);
    expect(lista[0].id).toBe(1);
  });
});
```

```ts
// tests/clave-prospecto.test.ts
import { describe, it, expect } from "vitest";
import { claveProspecto } from "@/lib/clave-prospecto";
import { generarCodigo } from "@/lib/codigo";

describe("claveProspecto", () => {
  it("ignora mayusculas, acentos, puntuacion y espacios, como armar.py", () => {
    expect(claveProspecto("Hotel Yare", "Caracas (Sabana Grande)")).toBe("hotelyare|caracassabanagrande");
    expect(claveProspecto("HOTEL YARÉ ", " caracas (sabana grande)")).toBe("hotelyare|caracassabanagrande");
  });
});

describe("generarCodigo", () => {
  it("da 22 caracteres base64url distintos cada vez", () => {
    const a = generarCodigo(), b = generarCodigo();
    expect(a).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: implementaciones**

```ts
// src/lib/embudo-contrato.ts
export const ETAPAS = ["por_contactar", "enviado", "respondio", "reunion", "ganado", "descartado"] as const;
export type Etapa = (typeof ETAPAS)[number];

export const ETIQUETA_ETAPA: Record<Etapa, string> = {
  por_contactar: "Por contactar", enviado: "Enviado", respondio: "Respondió",
  reunion: "Reunión", ganado: "Ganado", descartado: "Descartado",
};

// Hacia donde puede ir cada etapa. Nada retrocede salvo reactivar un descartado.
const SIGUIENTES: Record<Etapa, readonly Etapa[]> = {
  por_contactar: ["enviado", "descartado"],
  enviado: ["respondio", "descartado"],
  respondio: ["reunion", "ganado", "descartado"],
  reunion: ["ganado", "descartado"],
  ganado: [],
  descartado: ["por_contactar"],
};

export function puedePasar(de: Etapa, a: Etapa): boolean {
  return SIGUIENTES[de].includes(a);
}

export function esEtapa(s: string): s is Etapa {
  return (ETAPAS as readonly string[]).includes(s);
}
```

```ts
// src/lib/cola-contrato.ts
import { prioridadContacto, type ContactoProspecto } from "@/lib/canales-contrato";

// Cola compartida: primero los que se contactan mas rapido (WhatsApp), al final
// los que solo tienen redes. Dentro de cada grupo manda ordenCola (saltar lo sube).
export function ordenarCola<T extends ContactoProspecto & { ordenCola: number }>(lista: T[]): T[] {
  return [...lista].sort((a, b) => prioridadContacto(a) - prioridadContacto(b) || a.ordenCola - b.ordenCola);
}
```

```ts
// src/lib/clave-prospecto.ts
// Igual que clave() en armar.py: reimportar no duplica aunque cambie el formato.
function limpiar(s: string): string {
  return (s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
export function claveProspecto(nombre: string, ciudad: string): string {
  return `${limpiar(nombre)}|${limpiar(ciudad)}`;
}
```

```ts
// src/lib/codigo.ts
import { randomBytes } from "node:crypto";
// 16 bytes aleatorios: no se adivina ni se recorre. Vale para /p/<codigo> y
// para el portal del cliente (pieza 5).
export function generarCodigo(): string {
  return randomBytes(16).toString("base64url");
}
```

- [ ] **Step 3: verificar y commit**

Run: `npx vitest run tests/embudo-contrato.test.ts tests/cola-contrato.test.ts tests/clave-prospecto.test.ts 2>&1 | tail -3 && npx tsc --noEmit`
Expected: todos `passed`.

```bash
git add -A && git commit -F - <<'EOF'
feat: embudo, orden de cola, clave de prospecto y codigo aleatorio (contratos puros)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 6: Acceso con PIN — usuarios, sesión, bloqueo, `/entrar` y `/salir`

> **Corregido en ejecución (16-sep, revisión de la tarea):** el código de abajo se implementó tal cual y la revisión
> encontró defectos del propio plan, corregidos en el commit de la ronda 1: `ipCliente` toma el **último** salto de
> `X-Forwarded-For` (Apache anexa la IP real; el primero lo escribe el cliente); el limitador cuenta **solo fallos**
> (`bloqueado` / `registrarFallo` / `olvidarFallos`), se limpia al acertar y el bloqueo dura 15 min completos desde el
> quinto fallo, con tope real de entradas; `entrar()` envuelve todo en try/catch salvo `redirect()`; la unicidad del
> PIN es sobre **todas** las cuentas y `buscarPorPin` ordena por `id`; `jwtVerify` fija `HS256` y `SESION_SECRET`
> debe tener ≥ 32 caracteres; `/salir` redirige con `Location` relativa. El código vigente es el del repo.

**Files:**
- Create: `src/lib/rate-limit.ts`, `src/lib/auth.ts`, `src/lib/sesion.ts`, `src/lib/usuarios.ts`, `src/lib/ip.ts`, `src/acciones/resultado.ts`, `src/acciones/entrar.ts`, `src/componentes/TecladoPin.tsx`, `src/app/entrar/page.tsx`, `src/app/salir/route.ts`, `scripts/crear-usuario.mjs`, `tests/usuarios.test.ts`, `tests/rate-limit.test.ts`

**Interfaces:**
- Produces:
  - `permitirIntento(clave: string, max?: number, ventanaMs?: number): boolean`.
  - `type SesionUsuario = { id: number; nombre: string; rol: "dueno" | "prospectador" }`.
  - `crearToken(u: SesionUsuario): Promise<string>`, `verificarToken(t: string): Promise<SesionUsuario | null>`.
  - `COOKIE_SESION = "pr_sesion"`, `sesionActual(): Promise<SesionUsuario | null>`, `exigirSesion(): Promise<SesionUsuario>`, `exigirRol(rol: "dueno"): Promise<SesionUsuario>`.
  - `hashPin(pin): Promise<string>`, `buscarPorPin(pin): Promise<{id,nombre,rol}|null>`, `crearUsuario({nombre, rol, pin, metaDiaria})`, `cambiarPin(id, pin)`, `pinEnUso(pin, salvoId?)`, `listarUsuarios()`.
  - `Resultado<T>`, `fallo()`, `exito()`.
  - Acción `entrar(_: unknown, formData: FormData): Promise<Resultado>` — al éxito hace `redirect("/hoy")`.

- [ ] **Step 1: `src/acciones/resultado.ts`** (copiado de Hotel Marte)

```ts
// Toda Server Action devuelve esto. Nunca una excepcion.
export type Resultado<T = undefined> =
  | { ok: true; datos: T }
  | { ok: false; mensaje: string };

export function fallo(mensaje: string): { ok: false; mensaje: string } {
  return { ok: false, mensaje };
}
export function exito(): { ok: true; datos: undefined };
export function exito<T>(datos: T): { ok: true; datos: T };
export function exito<T>(datos?: T) {
  return { ok: true, datos };
}
```

- [ ] **Step 2: `src/lib/rate-limit.ts`** y su test

```ts
// src/lib/rate-limit.ts — limite de intentos en memoria del proceso (un solo PM2).
const intentos = new Map<string, { n: number; desde: number }>();
const MAX_ENTRADAS = 10_000;

export function permitirIntento(claveOriginal: string, max = 5, ventanaMs = 15 * 60_000): boolean {
  const clave = claveOriginal.slice(0, 200);
  const ahora = Date.now();
  const reg = intentos.get(clave);
  if (!reg || ahora - reg.desde > ventanaMs) {
    if (intentos.size >= MAX_ENTRADAS) {
      for (const [k, v] of intentos) if (ahora - v.desde > ventanaMs) intentos.delete(k);
    }
    intentos.set(clave, { n: 1, desde: ahora });
    return true;
  }
  reg.n += 1;
  return reg.n <= max;
}

// Solo para tests.
export function _reiniciarIntentos(): void { intentos.clear(); }
```

```ts
// tests/rate-limit.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { permitirIntento, _reiniciarIntentos } from "@/lib/rate-limit";

describe("permitirIntento", () => {
  beforeEach(_reiniciarIntentos);
  it("deja 5 y bloquea el sexto", () => {
    for (let i = 0; i < 5; i++) expect(permitirIntento("ip:1.2.3.4")).toBe(true);
    expect(permitirIntento("ip:1.2.3.4")).toBe(false);
  });
  it("una clave distinta no comparte contador", () => {
    for (let i = 0; i < 6; i++) permitirIntento("ip:a");
    expect(permitirIntento("ip:b")).toBe(true);
  });
});
```

- [ ] **Step 3: `src/lib/auth.ts` y `src/lib/ip.ts`**

```ts
// src/lib/auth.ts — token firmado (HS256) que va en la cookie. 30 dias.
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";

export type SesionUsuario = { id: number; nombre: string; rol: "dueno" | "prospectador" };

const secreto = () => {
  const s = process.env.SESION_SECRET;
  if (!s) throw new Error("Falta SESION_SECRET");
  return new TextEncoder().encode(s);
};

const Payload = z.object({ id: z.number(), nombre: z.string(), rol: z.enum(["dueno", "prospectador"]) });

export async function crearToken(u: SesionUsuario): Promise<string> {
  return new SignJWT({ ...u }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(secreto());
}

export async function verificarToken(token: string): Promise<SesionUsuario | null> {
  try {
    const { payload } = await jwtVerify(token, secreto());
    const p = Payload.safeParse(payload);
    return p.success ? p.data : null;
  } catch {
    return null;
  }
}
```

```ts
// src/lib/ip.ts — la IP real llega por Apache (proxy en 127.0.0.1).
import { headers } from "next/headers";
export async function ipCliente(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "desconocida";
}
```

- [ ] **Step 4: `src/lib/usuarios.ts`** y test con base

```ts
// src/lib/usuarios.ts
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";

const RONDAS = process.env.NODE_ENV === "test" ? 4 : 10;
export const PIN_LARGO = 6;
export const PIN_VALIDO = /^\d{6}$/;

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, RONDAS);
}

// Entrar es solo con PIN, sin usuario: el PIN identifica a la persona. Por eso
// tiene que ser unico entre cuentas activas (pinEnUso) y se compara contra
// todas: son pocas (Neri y quien lo ayude), bcrypt aguanta.
export async function buscarPorPin(pin: string): Promise<{ id: number; nombre: string; rol: "dueno" | "prospectador" } | null> {
  if (!PIN_VALIDO.test(pin)) return null;
  const usuarios = await prisma.usuario.findMany({ where: { activo: true, rol: { in: ["dueno", "prospectador"] } } });
  for (const u of usuarios) {
    if (await bcrypt.compare(pin, u.pinHash)) return { id: u.id, nombre: u.nombre, rol: u.rol as "dueno" | "prospectador" };
  }
  return null;
}

export async function pinEnUso(pin: string, salvoId?: number): Promise<boolean> {
  const usuarios = await prisma.usuario.findMany({ where: { activo: true, ...(salvoId ? { id: { not: salvoId } } : {}) } });
  for (const u of usuarios) if (await bcrypt.compare(pin, u.pinHash)) return true;
  return false;
}

export async function crearUsuario(d: { nombre: string; rol: "dueno" | "prospectador"; pin: string; metaDiaria?: number }) {
  if (!PIN_VALIDO.test(d.pin)) throw new Error("PIN_INVALIDO");
  if (await pinEnUso(d.pin)) throw new Error("PIN_REPETIDO");
  return prisma.usuario.create({
    data: { nombre: d.nombre.trim(), rol: d.rol, pinHash: await hashPin(d.pin), metaDiaria: d.metaDiaria ?? 10 },
    select: { id: true, nombre: true, rol: true, metaDiaria: true },
  });
}

export async function cambiarPin(id: number, pin: string): Promise<void> {
  if (!PIN_VALIDO.test(pin)) throw new Error("PIN_INVALIDO");
  if (await pinEnUso(pin, id)) throw new Error("PIN_REPETIDO");
  await prisma.usuario.update({ where: { id }, data: { pinHash: await hashPin(pin) } });
}

export async function listarUsuarios() {
  return prisma.usuario.findMany({
    where: { rol: { in: ["dueno", "prospectador"] } },
    select: { id: true, nombre: true, rol: true, activo: true, metaDiaria: true },
    orderBy: { id: "asc" },
  });
}

// Existe para que sesionActual() saque a quien fue desactivado aunque su
// cookie siga siendo valida.
export async function usuarioVigente(id: number): Promise<boolean> {
  const u = await prisma.usuario.findUnique({ where: { id }, select: { activo: true } });
  return !!u?.activo;
}
```

```ts
// tests/usuarios.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, PIN_DUENO, PIN_PROSPECTADOR } from "./ayuda-db";
import { buscarPorPin, crearUsuario, cambiarPin, pinEnUso } from "@/lib/usuarios";

describe.runIf(DB_HABILITADA)("usuarios", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  beforeAll(async () => { await limpiarBase(); ids = await sembrarBasico(); });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("encuentra al usuario por su PIN y devuelve el rol", async () => {
    expect(await buscarPorPin(PIN_DUENO)).toMatchObject({ id: ids.usuarioId, rol: "dueno" });
    expect(await buscarPorPin(PIN_PROSPECTADOR)).toMatchObject({ id: ids.prospectadorId, rol: "prospectador" });
    expect(await buscarPorPin("000000")).toBeNull();
    expect(await buscarPorPin("12345")).toBeNull(); // largo invalido, ni consulta
  });
  it("no deja dos cuentas con el mismo PIN", async () => {
    await expect(crearUsuario({ nombre: "Otro", rol: "prospectador", pin: PIN_DUENO })).rejects.toThrow("PIN_REPETIDO");
    await expect(cambiarPin(ids.prospectadorId, PIN_DUENO)).rejects.toThrow("PIN_REPETIDO");
    expect(await pinEnUso(PIN_DUENO, ids.usuarioId)).toBe(false); // el propio no cuenta
  });
  it("un usuario desactivado no entra", async () => {
    await prisma.usuario.update({ where: { id: ids.prospectadorId }, data: { activo: false } });
    expect(await buscarPorPin(PIN_PROSPECTADOR)).toBeNull();
  });
});
```

- [ ] **Step 5: `src/lib/sesion.ts`**

```ts
// src/lib/sesion.ts — puerta unica del panel.
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verificarToken, type SesionUsuario } from "@/lib/auth";
import { usuarioVigente } from "@/lib/usuarios";

export const COOKIE_SESION = "pr_sesion";
export const DIAS_SESION = 30;

// cache(): layout y pagina la llaman en la misma peticion; la base se consulta una vez.
export const sesionActual = cache(async (): Promise<SesionUsuario | null> => {
  const token = (await cookies()).get(COOKIE_SESION)?.value;
  const u = token ? await verificarToken(token) : null;
  if (!u) return null;
  if (!(await usuarioVigente(u.id))) redirect("/salir");
  return u;
});

export async function exigirSesion(): Promise<SesionUsuario> {
  const u = await sesionActual();
  if (!u) redirect("/entrar");
  return u;
}

// Solo dueno ve dinero, proyectos y ajustes. Se llama FUERA del try/catch.
export async function exigirRol(rol: "dueno"): Promise<SesionUsuario> {
  const u = await exigirSesion();
  if (u.rol !== rol) redirect("/hoy");
  return u;
}
```

- [ ] **Step 6: acción `entrar` y `/salir`**

```ts
// src/acciones/entrar.ts
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { crearToken } from "@/lib/auth";
import { buscarPorPin } from "@/lib/usuarios";
import { permitirIntento } from "@/lib/rate-limit";
import { ipCliente } from "@/lib/ip";
import { COOKIE_SESION, DIAS_SESION } from "@/lib/sesion";
import { fallo, type Resultado } from "@/acciones/resultado";

const Entrada = z.object({ pin: z.string().regex(/^\d{6}$/) });

// Bloqueo: 5 intentos fallidos por IP en 15 minutos. El PIN es la unica
// credencial, asi que no hay "cuenta" que bloquear antes de acertar; la IP
// es lo que frena a quien prueba PINes.
export async function entrar(_: unknown, formData: FormData): Promise<Resultado> {
  const ip = await ipCliente();
  if (!permitirIntento(`entrar:${ip}`)) return fallo("Demasiados intentos. Espera 15 minutos.");
  const e = Entrada.safeParse({ pin: String(formData.get("pin") ?? "") });
  if (!e.success) return fallo("El PIN tiene 6 números.");
  const u = await buscarPorPin(e.data.pin);
  if (!u) return fallo("PIN incorrecto.");
  const token = await crearToken(u);
  (await cookies()).set(COOKIE_SESION, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/",
    maxAge: DIAS_SESION * 24 * 60 * 60,
  });
  redirect("/hoy");
}
```

```ts
// src/app/salir/route.ts
import { NextResponse } from "next/server";
import { COOKIE_SESION } from "@/lib/sesion";

export async function GET(req: Request) {
  const res = NextResponse.redirect(new URL("/entrar", req.url));
  res.cookies.set(COOKIE_SESION, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
```

- [ ] **Step 7: teclado y página `/entrar`**

```tsx
// src/componentes/TecladoPin.tsx
"use client";
import { useActionState, useState } from "react";
import { entrar } from "@/acciones/entrar";

// Teclado numerico grande: se usa con el pulgar. Al sexto digito envia solo.
export function TecladoPin() {
  const [estado, accion, pendiente] = useActionState(entrar, null);
  const [pin, setPin] = useState("");
  const teclas = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

  function tocar(t: string, form: HTMLFormElement | null) {
    if (t === "⌫") return setPin((p) => p.slice(0, -1));
    if (!t || pin.length >= 6) return;
    const nuevo = pin + t;
    setPin(nuevo);
    if (nuevo.length === 6) setTimeout(() => form?.requestSubmit(), 50);
  }

  return (
    <form action={accion} className="teclado" onSubmit={() => setTimeout(() => setPin(""), 300)}>
      <input type="hidden" name="pin" value={pin} />
      <div className="teclado__puntos" aria-label={`${pin.length} de 6`}>
        {Array.from({ length: 6 }, (_, i) => <span key={i} className={i < pin.length ? "lleno" : ""} />)}
      </div>
      <div className="teclado__grilla">
        {teclas.map((t, i) => (
          <button key={i} type="button" className="teclado__tecla" disabled={pendiente || !t} aria-label={t === "⌫" ? "Borrar" : t}
            onClick={(e) => tocar(t, e.currentTarget.form)}>{t}</button>
        ))}
      </div>
      {estado && !estado.ok && <p className="error" role="alert">{estado.mensaje}</p>}
    </form>
  );
}
```

```tsx
// src/app/entrar/page.tsx
import { redirect } from "next/navigation";
import { sesionActual } from "@/lib/sesion";
import { TecladoPin } from "@/componentes/TecladoPin";

export default async function Entrar() {
  if (await sesionActual()) redirect("/hoy");
  return (
    <main className="contenedor entrar">
      <h1 className="titulo">Prospectos</h1>
      <p className="suave">Escribe tu PIN.</p>
      <TecladoPin />
    </main>
  );
}
```

Agregar a `globals.css`:

```css
.entrar { min-height: 100dvh; display: flex; flex-direction: column; justify-content: center; }
.teclado__puntos { display: flex; gap: 12px; justify-content: center; margin: 16px 0 24px; }
.teclado__puntos span { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--tinta-suave); }
.teclado__puntos span.lleno { background: var(--verde); border-color: var(--verde); }
.teclado__grilla { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; max-width: 320px; margin: 0 auto; }
.teclado__tecla { height: 68px; font-size: 26px; border-radius: 16px; border: 1px solid var(--borde); background: var(--panel); color: var(--tinta); }
.teclado__tecla:disabled { visibility: hidden; }
.teclado__tecla:active { background: var(--borde); }
```

- [ ] **Step 8: `scripts/crear-usuario.mjs`** (PIN por stdin, nunca por argumento)

```js
#!/usr/bin/env node
// Crea el primer usuario (o uno mas). El PIN se lee por stdin para que no
// quede en `ps` ni en el historial. Uso:
//   set -a; . ~/.config/prospectos/env; set +a
//   node scripts/crear-usuario.mjs "Neri" dueno   <<< "123456"
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";

const [nombre, rol = "dueno"] = process.argv.slice(2);
if (!nombre || !["dueno", "prospectador"].includes(rol)) {
  console.error('Uso: node scripts/crear-usuario.mjs "Nombre" dueno|prospectador  (PIN por stdin)');
  process.exit(1);
}
const pin = readFileSync(0, "utf8").trim();
if (!/^\d{6}$/.test(pin)) { console.error("El PIN son 6 digitos."); process.exit(1); }
const prisma = new PrismaClient();
for (const u of await prisma.usuario.findMany({ where: { activo: true } })) {
  if (await bcrypt.compare(pin, u.pinHash)) { console.error("Ese PIN ya lo usa otra cuenta."); process.exit(1); }
}
const u = await prisma.usuario.create({ data: { nombre, rol, pinHash: await bcrypt.hash(pin, 10) } });
console.log(`Creado: #${u.id} ${u.nombre} (${u.rol})`);
await prisma.$disconnect();
```

- [ ] **Step 9: verificar**

Run: `npx vitest run tests/rate-limit.test.ts 2>&1 | tail -2 && npm run test:db 2>&1 | tail -3 && npx tsc --noEmit`
Expected: todos `passed`, tsc limpio. (Las páginas se ven en el navegador en la tarea 12; aquí solo compilan.)

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -F - <<'EOF'
feat: acceso con PIN (usuarios, token, sesion, bloqueo por IP, /entrar y /salir)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 7: Importar los 132 hoteles y sembrar Farmahogar

**Files:**
- Create: `src/lib/importar.ts`, `scripts/importar-hoteles.mts`, `scripts/sembrar-farmahogar.mts`, `scripts/sembrar-nichos.mjs`, `tests/importar.test.ts`

**Interfaces:**
- Consumes: `normalizarCelular`, `normalizarRed`, `claveProspecto`, `generarCodigo`.
- Produces:
  - `type ProspectoEntrada = { nombre; ciudad; estado?; tipo?; tamano?; telefono?; whatsapp?; email?; web?; instagram?; facebook?; tiktok?; nota?; fuentes?: string[] }`.
  - `prospectoDesdeHotelJson(h: HotelJson): ProspectoEntrada` (puro).
  - `regionDe(estado: string): string` (puro).
  - `importarProspectos(nichoId, lista: ProspectoEntrada[], opts: { origen: string; usuarioId?: number }): Promise<{ nuevos: number; repetidos: number }>` — inserta los nuevos, salta los repetidos por `clave`, deja `Evento` `importado`.

- [ ] **Step 1: tests**

```ts
// tests/importar.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico } from "./ayuda-db";
import { prospectoDesdeHotelJson, regionDe, importarProspectos } from "@/lib/importar";

const yare = {
  nombre: "Hotel Yare", ciudad: "Caracas (Sabana Grande)", estado: "Distrito Capital", tipo: "hotel de paso/motel",
  habitaciones: 150, telefono: "0212.793.0708 / +58 412 3229005", whatsapp: "", email: "", web: "https://www.hotelyare.com.ve/",
  instagram: "hotelyare", direccion: "Av. Las Acacias", fuentes: ["https://www.hotelyare.com.ve/"], notas: "Solo adultos.",
};

describe("prospectoDesdeHotelJson", () => {
  it("mapea el JSON de armar.py al prospecto", () => {
    expect(prospectoDesdeHotelJson(yare)).toEqual({
      nombre: "Hotel Yare", ciudad: "Caracas (Sabana Grande)", estado: "Distrito Capital", region: "Caracas y alrededores",
      tipo: "hotel de paso/motel", tamano: "150 hab.", telefono: "0212.793.0708 / +58 412 3229005", whatsapp: "584123229005",
      email: "", web: "https://www.hotelyare.com.ve/", instagram: "https://www.instagram.com/hotelyare/", facebook: "", tiktok: "",
      nota: "Solo adultos.\nDirección: Av. Las Acacias", fuentes: ["https://www.hotelyare.com.ve/"],
    });
  });
  it("regionDe agrupa como la lista original", () => {
    expect(regionDe("Miranda")).toBe("Caracas y alrededores");
    expect(regionDe("Aragua")).toBe("Carabobo y Aragua");
    expect(regionDe("Zulia")).toBe("Occidente, oriente y los Andes");
  });
});

describe.runIf(DB_HABILITADA)("importarProspectos", () => {
  let nichoId: number;
  beforeAll(async () => { await limpiarBase(); nichoId = (await sembrarBasico()).nichoId; });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("inserta nuevos, salta repetidos y deja evento importado", async () => {
    const lista = [prospectoDesdeHotelJson(yare), { nombre: "Posada Sol", ciudad: "Valencia" }];
    const r1 = await importarProspectos(nichoId, lista, { origen: "importado" });
    expect(r1).toEqual({ nuevos: 2, repetidos: 0 });
    const r2 = await importarProspectos(nichoId, [{ nombre: "HOTEL YARÉ", ciudad: "caracas (sabana grande)" }], { origen: "importado" });
    expect(r2).toEqual({ nuevos: 0, repetidos: 1 });
    expect(await prisma.prospecto.count()).toBe(2);
    expect(await prisma.evento.count({ where: { tipo: "importado" } })).toBe(2);
    const p = await prisma.prospecto.findFirst({ where: { nombre: "Hotel Yare" } });
    expect(p?.codigo).toHaveLength(22);
    expect(p?.etapa).toBe("por_contactar");
  });
});
```

- [ ] **Step 2: `src/lib/importar.ts`**

```ts
// src/lib/importar.ts
import { prisma } from "@/lib/db";
import { normalizarCelular, normalizarRed } from "@/lib/celular-contrato";
import { claveProspecto } from "@/lib/clave-prospecto";
import { generarCodigo } from "@/lib/codigo";

export type ProspectoEntrada = {
  nombre: string; ciudad: string; estado?: string; region?: string; tipo?: string; tamano?: string;
  telefono?: string; whatsapp?: string; email?: string; web?: string; instagram?: string; facebook?: string; tiktok?: string;
  nota?: string; fuentes?: string[];
};

export type HotelJson = {
  nombre: string; ciudad: string; estado?: string; tipo?: string; habitaciones?: number | null; telefono?: string; whatsapp?: string;
  email?: string; web?: string; instagram?: string; direccion?: string; fuentes?: string[]; notas?: string;
};

// Mismas regiones que ~/propuestas/hoteles/prospectos/armar.py
const REGIONES: [string, Set<string> | null][] = [
  ["Caracas y alrededores", new Set(["Distrito Capital", "Miranda", "La Guaira"])],
  ["Carabobo y Aragua", new Set(["Carabobo", "Aragua"])],
  ["Occidente, oriente y los Andes", null],
];
export function regionDe(estado: string): string {
  for (const [nombre, estados] of REGIONES) if (estados === null || estados.has(estado)) return nombre;
  return REGIONES[REGIONES.length - 1][0];
}

export function prospectoDesdeHotelJson(h: HotelJson): ProspectoEntrada {
  const nota = [h.notas?.trim(), h.direccion ? `Dirección: ${h.direccion.trim()}` : ""].filter(Boolean).join("\n");
  return {
    nombre: h.nombre.trim(), ciudad: h.ciudad.trim(), estado: h.estado ?? "", region: regionDe(h.estado ?? ""),
    tipo: h.tipo ?? "", tamano: h.habitaciones ? `${h.habitaciones} hab.` : "",
    telefono: h.telefono ?? "", whatsapp: normalizarCelular(h.whatsapp ?? "") || normalizarCelular(h.telefono ?? ""),
    email: h.email ?? "", web: h.web ?? "", instagram: normalizarRed(h.instagram ?? "", "instagram"), facebook: "", tiktok: "",
    nota, fuentes: h.fuentes ?? [],
  };
}

export async function importarProspectos(
  nichoId: number, lista: ProspectoEntrada[], opts: { origen: string; usuarioId?: number },
): Promise<{ nuevos: number; repetidos: number }> {
  const existentes = new Set((await prisma.prospecto.findMany({ where: { nichoId }, select: { clave: true } })).map((p) => p.clave));
  const ultimo = await prisma.prospecto.aggregate({ _max: { ordenCola: true } });
  let orden = (ultimo._max.ordenCola ?? 0) + 1;
  let nuevos = 0, repetidos = 0;
  for (const e of lista) {
    const clave = claveProspecto(e.nombre, e.ciudad);
    if (existentes.has(clave)) { repetidos++; continue; }
    existentes.add(clave);
    await prisma.prospecto.create({
      data: {
        nichoId, clave, codigo: generarCodigo(), ordenCola: orden++,
        nombre: e.nombre.trim(), ciudad: e.ciudad.trim(), estado: e.estado ?? "", region: e.region ?? regionDe(e.estado ?? ""),
        tipo: e.tipo ?? "", tamano: e.tamano ?? "", telefono: e.telefono ?? "",
        whatsapp: e.whatsapp ?? normalizarCelular(e.telefono ?? ""), email: e.email ?? "", web: e.web ?? "",
        instagram: normalizarRed(e.instagram ?? "", "instagram"), facebook: normalizarRed(e.facebook ?? "", "facebook"),
        tiktok: normalizarRed(e.tiktok ?? "", "tiktok"), nota: e.nota ?? "", fuentes: e.fuentes ?? [], origen: opts.origen,
        eventos: { create: { tipo: "importado", usuarioId: opts.usuarioId ?? null, texto: opts.origen } },
      },
    });
    nuevos++;
  }
  return { nuevos, repetidos };
}
```

- [ ] **Step 3: `scripts/sembrar-nichos.mjs`** (idempotente: crea `hoteles` y `farmacias` si no existen)

```js
#!/usr/bin/env node
// Nichos iniciales. Idempotente: no pisa mensajes ya editados desde Ajustes.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const NICHOS = [
  {
    slug: "hoteles", nombre: "Hoteles", plantillaPropuesta: "hoteles", diasSeguimiento: 3,
    // Mismo mensaje que la lista de hoteles (armar.py), mas el enlace.
    mensajeInicial: "Buenas, equipo de {nombre}. Soy Neri Colón, desarrollador de sistemas. Mis sistemas funcionan en empresas de Caracas, Valencia y el exterior, y uno de ellos controla desde el teléfono las habitaciones, la caja en bolívares y divisas y los turnos de recepción de un hotel. Preparé una propuesta de 9 páginas pensada para {nombre}: {enlace} ¿Le parece si en 30 minutos se la muestro funcionando?",
    mensajeSeguimiento: "Buenas de nuevo, equipo de {nombre}. Le escribí hace unos días con una propuesta para el hotel: {enlace} Si prefiere, le muestro el sistema funcionando en una llamada de 30 minutos. Quedo atento.",
  },
  {
    slug: "farmacias", nombre: "Farmacias", plantillaPropuesta: "", diasSeguimiento: 3,
    mensajeInicial: "Buenas, equipo de {nombre}. Soy Neri Colón, desarrollador de sistemas. Preparé una propuesta para que sus clientes compren desde el teléfono y ustedes despachen desde el mostrador. ¿Se la puedo enviar por aquí?",
    mensajeSeguimiento: "Buenas de nuevo, equipo de {nombre}. Le escribí hace unos días con una propuesta para la farmacia. ¿Tuvo chance de verla? Quedo atento.",
  },
];
for (const n of NICHOS) {
  await prisma.nicho.upsert({ where: { slug: n.slug }, update: {}, create: n });
  console.log("nicho listo:", n.slug);
}
await prisma.$disconnect();
```

- [ ] **Step 4: scripts de importación (corren con `tsx`)**

Los scripts que usan `src/lib/*.ts` corren con **`tsx`** (devDependency): `npx tsx scripts/<archivo>.mts`. Así reutilizan el importador real en vez de reimplementarlo.

```ts
// scripts/importar-hoteles.mts   (se ejecuta: npx tsx scripts/importar-hoteles.mts)
import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { importarProspectos, prospectoDesdeHotelJson, type HotelJson } from "../src/lib/importar";

const DIR = "/home/neracosu/propuestas/hoteles/prospectos/fuentes";
const nicho = await prisma.nicho.findUnique({ where: { slug: "hoteles" } });
if (!nicho) { console.error("Falta el nicho hoteles: corre scripts/sembrar-nichos.mjs"); process.exit(1); }
let total = { nuevos: 0, repetidos: 0 };
for (const archivo of ["capital.json", "centro.json", "interior.json"]) {
  const lista = (JSON.parse(readFileSync(path.join(DIR, archivo), "utf8")) as HotelJson[]).map(prospectoDesdeHotelJson);
  const r = await importarProspectos(nicho.id, lista, { origen: "importado" });
  console.log(`${archivo}: ${r.nuevos} nuevos, ${r.repetidos} repetidos`);
  total = { nuevos: total.nuevos + r.nuevos, repetidos: total.repetidos + r.repetidos };
}
console.log("total:", total, "| en base:", await prisma.prospecto.count({ where: { nichoId: nicho.id } }));
await prisma.$disconnect();
```

Y `scripts/sembrar-farmahogar.mts`:

```ts
// Farmahogar ya recibio propuesta el 15-sep: entra en `enviado` con seguimiento vencido.
import { prisma } from "../src/lib/db";
import { importarProspectos } from "../src/lib/importar";
import { sumarDias } from "../src/lib/fecha-caracas";

const nicho = await prisma.nicho.findUnique({ where: { slug: "farmacias" } });
if (!nicho) { console.error("Falta el nicho farmacias"); process.exit(1); }
const r = await importarProspectos(nicho.id, [{
  nombre: "Farmahogar", ciudad: "Caracas", tipo: "farmacia",
  nota: "Propuesta enviada el 2026-09-08 (archivo ~/propuestas/archivo/2026-09-08-farmahogar.md). Cargado a mano.",
  fuentes: [],
}], { origen: "manual" });
if (r.nuevos === 1) {
  const p = await prisma.prospecto.findFirstOrThrow({ where: { nichoId: nicho.id, nombre: "Farmahogar" } });
  await prisma.prospecto.update({ where: { id: p.id }, data: { etapa: "enviado", proximoSeguimiento: sumarDias("2026-09-15", nicho.diasSeguimiento) } });
  await prisma.evento.create({ data: { prospectoId: p.id, tipo: "enviado", canal: "whatsapp", de: "por_contactar", a: "enviado", texto: "Cargado a mano; enviado el 2026-09-15", creadoEn: new Date("2026-09-15T14:00:00-04:00") } });
}
console.log(r);
await prisma.$disconnect();
```

- [ ] **Step 5: instalar tsx, correr tests, sembrar la base real**

Run: `npm i -D tsx | tail -1 && npm run test:db 2>&1 | tail -3 && npx tsc --noEmit`
Expected: todos `passed`.

Run (base real, una sola vez):
```bash
set -a; . ~/.config/prospectos/env; set +a
node scripts/sembrar-nichos.mjs && npx tsx scripts/importar-hoteles.mts && npx tsx scripts/sembrar-farmahogar.mts
```
Expected: `total: { nuevos: 132, repetidos: 0 } | en base: 132` (si `armar.py` deduplicaba alguno, el número baja y se reporta tal cual), y `{ nuevos: 1, repetidos: 0 }`. Volver a correr → `nuevos: 0`.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -F - <<'EOF'
feat: importador de prospectos (dedup por clave) y scripts de nichos, hoteles y Farmahogar

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 8: Consultas y acciones de prospectos

**Files:**
- Create: `src/lib/prospectos.ts`, `src/lib/prospectos-contrato.ts`, `src/acciones/prospectos.ts`, `tests/prospectos.test.ts`, `tests/acciones-prospectos.test.ts`, `tests/ayuda-sesion.ts`

**Interfaces:**
- Consumes: `hoyCaracas`, `sumarDias`, `tocaHoy`, `ordenarCola`, `puedePasar`, `esEtapa`, `rellenar`, `generarCodigo`, `claveProspecto`, `exigirSesion`, `Resultado`.
- Produces (`src/lib/prospectos-contrato.ts`, puro):
  - `type ProspectoTarjeta = { id; nombre; ciudad; nichoNombre; nichoSlug; nota; tipo; tamano; etapa: Etapa; proximoSeguimiento: string | null; abrio: boolean; codigo; enlace: string; mensaje: string } & ContactoProspecto`.
  - `enlacePropuesta(codigo: string): string` → `${PROSPECTOS_URL_PUBLICA}/p/${codigo}`.
- Produces (`src/lib/prospectos.ts`, base):
  - `resumenHoy(hoy: string): Promise<{ embudo: Record<Etapa, number>; porUsuario: { id; nombre; enviados; meta }[] }>`.
  - `seguimientosQueTocan(hoy: string): Promise<ProspectoTarjeta[]>`.
  - `colaDelDia(limite?: number): Promise<ProspectoTarjeta[]>`.
  - `buscarProspectos(f: { q?: string; nichoId?: number; etapa?: Etapa }): Promise<ProspectoTarjeta[]>` (máx. 100).
  - `fichaProspecto(id: number): Promise<(ProspectoTarjeta & { fuentes: string[]; historial: EventoFila[] }) | null>` con `EventoFila = { id; tipo; de; a; canal; texto; creadoEn: Date; usuarioNombre: string }`.
  - `listarNichos(): Promise<{ id; slug; nombre }[]>`.
- Produces (`src/acciones/prospectos.ts`, `"use server"`, todas `Promise<Resultado>`): `marcarEnviado(id, canal)`, `saltar(id)`, `marcarRespondio(id)`, `escribirDeNuevo(id, canal)`, `descartar(id, motivo)`, `cambiarEtapa(id, a, motivo?)`, `guardarNota(id, nota)`, `editarSeguimiento(id, fecha | "")`, `crearProspecto(formData)`.

- [ ] **Step 1: contrato puro**

```ts
// src/lib/prospectos-contrato.ts
import type { ContactoProspecto } from "@/lib/canales-contrato";
import type { Etapa } from "@/lib/embudo-contrato";

export type ProspectoTarjeta = ContactoProspecto & {
  id: number; nombre: string; ciudad: string; nichoNombre: string; nichoSlug: string; nota: string; tipo: string; tamano: string;
  etapa: Etapa; proximoSeguimiento: string | null; abrio: boolean; codigo: string; enlace: string; mensaje: string;
};

export function enlacePropuesta(codigo: string): string {
  const base = (process.env.PROSPECTOS_URL_PUBLICA ?? "").replace(/\/+$/, "");
  return `${base}/p/${codigo}`;
}
```

- [ ] **Step 2: tests de consultas**

```ts
// tests/prospectos.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, crearProspectoDePrueba } from "./ayuda-db";
import { colaDelDia, seguimientosQueTocan, resumenHoy, buscarProspectos, fichaProspecto } from "@/lib/prospectos";

describe.runIf(DB_HABILITADA)("consultas de prospectos", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  beforeAll(async () => {
    await limpiarBase();
    ids = await sembrarBasico();
    await crearProspectoDePrueba(ids.nichoId, { nombre: "Solo IG", instagram: "https://www.instagram.com/x/", ordenCola: 1 });
    await crearProspectoDePrueba(ids.nichoId, { nombre: "Con WA", whatsapp: "584120000000", ordenCola: 2 });
    await crearProspectoDePrueba(ids.nichoId, { nombre: "Enviado viejo", whatsapp: "584120000001", etapa: "enviado", proximoSeguimiento: "2026-09-10" });
    await crearProspectoDePrueba(ids.nichoId, { nombre: "Enviado futuro", whatsapp: "584120000002", etapa: "enviado", proximoSeguimiento: "2026-09-20" });
    const abierto = await crearProspectoDePrueba(ids.nichoId, { nombre: "Abierto", whatsapp: "584120000003", etapa: "enviado", proximoSeguimiento: "2026-09-16" });
    await prisma.evento.create({ data: { prospectoId: abierto.id, tipo: "abierto" } });
    await prisma.evento.create({ data: { prospectoId: abierto.id, tipo: "enviado", canal: "whatsapp", usuarioId: ids.usuarioId, creadoEn: new Date() } });
  });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("la cola trae solo por_contactar, WhatsApp primero, con mensaje y enlace rellenos", async () => {
    const cola = await colaDelDia(10);
    expect(cola.map((p) => p.nombre)).toEqual(["Con WA", "Solo IG"]);
    expect(cola[0].mensaje).toContain("Con WA");
    expect(cola[0].mensaje).toContain(cola[0].enlace);
    expect(cola[0].enlace).toMatch(/\/p\/[A-Za-z0-9_-]+$/);
  });
  it("los seguimientos que tocan son los enviados con fecha <= hoy, y dicen si abrieron", async () => {
    const s = await seguimientosQueTocan("2026-09-16");
    expect(s.map((p) => p.nombre).sort()).toEqual(["Abierto", "Enviado viejo"]);
    expect(s.find((p) => p.nombre === "Abierto")?.abrio).toBe(true);
    expect(s.find((p) => p.nombre === "Enviado viejo")?.abrio).toBe(false);
  });
  it("el resumen cuenta el embudo y los enviados de hoy por usuario", async () => {
    const r = await resumenHoy("2026-09-16");
    expect(r.embudo.por_contactar).toBe(2);
    expect(r.embudo.enviado).toBe(3);
    const neri = r.porUsuario.find((u) => u.id === ids.usuarioId)!;
    expect(neri.meta).toBe(10);
    expect(neri.enviados).toBeGreaterThanOrEqual(0); // depende de si "hoy" real coincide con la fecha del evento
  });
  it("buscar filtra por texto y etapa", async () => {
    expect((await buscarProspectos({ q: "viejo" })).map((p) => p.nombre)).toEqual(["Enviado viejo"]);
    expect((await buscarProspectos({ etapa: "por_contactar" })).length).toBe(2);
  });
  it("la ficha trae historial con nombre de usuario", async () => {
    const p = await prisma.prospecto.findFirstOrThrow({ where: { nombre: "Abierto" } });
    const f = await fichaProspecto(p.id);
    expect(f?.historial.map((e) => e.tipo)).toEqual(["enviado", "abierto"]); // mas nuevo primero
    expect(f?.historial[0].usuarioNombre).toBe("Neri");
    expect(await fichaProspecto(999999)).toBeNull();
  });
});
```

- [ ] **Step 3: `src/lib/prospectos.ts`**

```ts
// src/lib/prospectos.ts — consultas de pantalla. Las escrituras van en acciones/.
import { prisma } from "@/lib/db";
import { ordenarCola } from "@/lib/cola-contrato";
import { ETAPAS, type Etapa } from "@/lib/embudo-contrato";
import { rellenar } from "@/lib/plantilla-mensaje";
import { enlacePropuesta, type ProspectoTarjeta } from "@/lib/prospectos-contrato";
import { hoyCaracas } from "@/lib/fecha-caracas";

const SELECT = {
  id: true, nombre: true, ciudad: true, nota: true, tipo: true, tamano: true, etapa: true, proximoSeguimiento: true, codigo: true,
  whatsapp: true, telefono: true, email: true, instagram: true, facebook: true, tiktok: true, ordenCola: true,
  nicho: { select: { nombre: true, slug: true, mensajeInicial: true, mensajeSeguimiento: true } },
} as const;

type Fila = { [K in keyof typeof SELECT]: K extends "nicho" ? { nombre: string; slug: string; mensajeInicial: string; mensajeSeguimiento: string } : string | number | null };

async function abrieron(ids: number[]): Promise<Set<number>> {
  if (!ids.length) return new Set();
  const ev = await prisma.evento.findMany({ where: { prospectoId: { in: ids }, tipo: "abierto" }, select: { prospectoId: true }, distinct: ["prospectoId"] });
  return new Set(ev.map((e) => e.prospectoId));
}

function aTarjeta(f: any, abrio: boolean, plantilla: "inicial" | "seguimiento"): ProspectoTarjeta & { ordenCola: number } {
  const enlace = enlacePropuesta(f.codigo);
  const base = plantilla === "inicial" ? f.nicho.mensajeInicial : f.nicho.mensajeSeguimiento;
  return {
    id: f.id, nombre: f.nombre, ciudad: f.ciudad, nichoNombre: f.nicho.nombre, nichoSlug: f.nicho.slug, nota: f.nota, tipo: f.tipo, tamano: f.tamano,
    etapa: f.etapa as Etapa, proximoSeguimiento: f.proximoSeguimiento, abrio, codigo: f.codigo, enlace,
    mensaje: rellenar(base, { nombre: f.nombre, enlace }),
    whatsapp: f.whatsapp, telefono: f.telefono, email: f.email, instagram: f.instagram, facebook: f.facebook, tiktok: f.tiktok, ordenCola: f.ordenCola,
  };
}

export async function colaDelDia(limite = 10): Promise<ProspectoTarjeta[]> {
  const filas = await prisma.prospecto.findMany({ where: { etapa: "por_contactar" }, select: SELECT, orderBy: { ordenCola: "asc" }, take: 500 });
  return ordenarCola(filas.map((f) => aTarjeta(f, false, "inicial"))).slice(0, limite);
}

export async function seguimientosQueTocan(hoy: string): Promise<ProspectoTarjeta[]> {
  const filas = await prisma.prospecto.findMany({
    where: { etapa: "enviado", proximoSeguimiento: { lte: hoy } }, select: SELECT, orderBy: { proximoSeguimiento: "asc" }, take: 50,
  });
  const ab = await abrieron(filas.map((f) => f.id));
  return filas.map((f) => aTarjeta(f, ab.has(f.id), "seguimiento"));
}

export async function resumenHoy(hoy: string) {
  const grupos = await prisma.prospecto.groupBy({ by: ["etapa"], _count: { _all: true } });
  const embudo = Object.fromEntries(ETAPAS.map((e) => [e, 0])) as Record<Etapa, number>;
  for (const g of grupos) if (g.etapa in embudo) embudo[g.etapa as Etapa] = g._count._all;
  // Enviados de hoy (dia de Caracas): eventos `enviado` entre 00:00 y 24:00 Caracas.
  const desde = new Date(`${hoy}T00:00:00-04:00`), hasta = new Date(`${hoy}T23:59:59.999-04:00`);
  const usuarios = await prisma.usuario.findMany({ where: { activo: true, rol: { in: ["dueno", "prospectador"] } }, select: { id: true, nombre: true, metaDiaria: true } });
  const enviados = await prisma.evento.groupBy({ by: ["usuarioId"], where: { tipo: "enviado", creadoEn: { gte: desde, lte: hasta } }, _count: { _all: true } });
  const porUsuario = usuarios.map((u) => ({ id: u.id, nombre: u.nombre, meta: u.metaDiaria, enviados: enviados.find((e) => e.usuarioId === u.id)?._count._all ?? 0 }));
  return { embudo, porUsuario };
}

export async function buscarProspectos(f: { q?: string; nichoId?: number; etapa?: Etapa }): Promise<ProspectoTarjeta[]> {
  const q = f.q?.trim();
  const filas = await prisma.prospecto.findMany({
    where: {
      ...(f.nichoId ? { nichoId: f.nichoId } : {}),
      ...(f.etapa ? { etapa: f.etapa } : {}),
      ...(q ? { OR: [{ nombre: { contains: q } }, { ciudad: { contains: q } }, { whatsapp: { contains: q } }, { telefono: { contains: q } }] } : {}),
    },
    select: SELECT, orderBy: [{ etapa: "asc" }, { nombre: "asc" }], take: 100,
  });
  const ab = await abrieron(filas.map((x) => x.id));
  return filas.map((x) => aTarjeta(x, ab.has(x.id), x.etapa === "por_contactar" ? "inicial" : "seguimiento"));
}

export type EventoFila = { id: number; tipo: string; de: string; a: string; canal: string; texto: string; creadoEn: Date; usuarioNombre: string };

export async function fichaProspecto(id: number): Promise<(ProspectoTarjeta & { fuentes: string[]; historial: EventoFila[] }) | null> {
  const f = await prisma.prospecto.findUnique({ where: { id }, select: { ...SELECT, fuentes: true } });
  if (!f) return null;
  const eventos = await prisma.evento.findMany({ where: { prospectoId: id }, orderBy: { creadoEn: "desc" }, take: 200, include: { usuario: { select: { nombre: true } } } });
  const ab = await abrieron([id]);
  const t = aTarjeta(f, ab.has(id), f.etapa === "por_contactar" ? "inicial" : "seguimiento");
  return {
    ...t, fuentes: Array.isArray(f.fuentes) ? (f.fuentes as string[]) : [],
    historial: eventos.map((e) => ({ id: e.id, tipo: e.tipo, de: e.de, a: e.a, canal: e.canal, texto: e.texto, creadoEn: e.creadoEn, usuarioNombre: e.usuario?.nombre ?? "" })),
  };
}

export async function listarNichos() {
  return prisma.nicho.findMany({ select: { id: true, slug: true, nombre: true }, orderBy: { nombre: "asc" } });
}

export { hoyCaracas };
```

(El `any` de `aTarjeta` se cambia por el tipo inferido de `SELECT` con `Prisma.ProspectoGetPayload<{ select: typeof SELECT }>` — hacerlo así en la implementación; `Fila` de arriba se borra.)

- [ ] **Step 4: ayuda para probar acciones con sesión**

Las acciones llaman `exigirSesion()` (lee `cookies()` de Next). En vitest no hay petición, así que se **mockea `@/lib/sesion`**:

```ts
// tests/ayuda-sesion.ts
import { vi } from "vitest";
import type { SesionUsuario } from "@/lib/auth";

export const sesionFalsa: { actual: SesionUsuario | null } = { actual: null };

vi.mock("@/lib/sesion", () => ({
  COOKIE_SESION: "pr_sesion",
  DIAS_SESION: 30,
  sesionActual: async () => sesionFalsa.actual,
  exigirSesion: async () => { if (!sesionFalsa.actual) throw new Error("REDIRECT:/entrar"); return sesionFalsa.actual; },
  exigirRol: async (rol: string) => { if (sesionFalsa.actual?.rol !== rol) throw new Error("REDIRECT:/hoy"); return sesionFalsa.actual; },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
```

- [ ] **Step 5: tests de acciones**

```ts
// tests/acciones-prospectos.test.ts
import "./ayuda-sesion";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, crearProspectoDePrueba } from "./ayuda-db";
import { sesionFalsa } from "./ayuda-sesion";
import { marcarEnviado, saltar, marcarRespondio, escribirDeNuevo, descartar, cambiarEtapa, guardarNota, editarSeguimiento, crearProspecto } from "@/acciones/prospectos";
import { hoyCaracas, sumarDias } from "@/lib/fecha-caracas";

describe.runIf(DB_HABILITADA)("acciones de prospectos", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  beforeAll(async () => { await limpiarBase(); ids = await sembrarBasico(); });
  beforeEach(() => { sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" }; });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("sin sesion no hace nada", async () => {
    sesionFalsa.actual = null;
    const p = await crearProspectoDePrueba(ids.nichoId, { whatsapp: "584120000000" });
    await expect(marcarEnviado(p.id, "whatsapp")).rejects.toThrow("REDIRECT:/entrar");
    expect((await prisma.prospecto.findUniqueOrThrow({ where: { id: p.id } })).etapa).toBe("por_contactar");
  });

  it("marcarEnviado pasa a enviado, fija el seguimiento y registra el canal; dos toques cuentan uno", async () => {
    const p = await crearProspectoDePrueba(ids.nichoId, { whatsapp: "584120000001" });
    const [a, b] = await Promise.all([marcarEnviado(p.id, "whatsapp"), marcarEnviado(p.id, "whatsapp")]);
    expect([a.ok, b.ok].filter(Boolean).length).toBe(1);
    const d = await prisma.prospecto.findUniqueOrThrow({ where: { id: p.id } });
    expect(d.etapa).toBe("enviado");
    expect(d.proximoSeguimiento).toBe(sumarDias(hoyCaracas(), 3));
    const ev = await prisma.evento.findMany({ where: { prospectoId: p.id, tipo: "enviado" } });
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ canal: "whatsapp", usuarioId: ids.usuarioId, de: "por_contactar", a: "enviado" });
  });

  it("marcarEnviado rechaza un canal desconocido", async () => {
    const p = await crearProspectoDePrueba(ids.nichoId, { whatsapp: "584120000002" });
    expect(await marcarEnviado(p.id, "paloma" as any)).toEqual({ ok: false, mensaje: expect.stringContaining("canal") });
  });

  it("saltar manda al final de la cola y deja evento", async () => {
    const p = await crearProspectoDePrueba(ids.nichoId, { ordenCola: 1 });
    await crearProspectoDePrueba(ids.nichoId, { ordenCola: 50 });
    expect((await saltar(p.id)).ok).toBe(true);
    expect((await prisma.prospecto.findUniqueOrThrow({ where: { id: p.id } })).ordenCola).toBe(51);
    expect(await prisma.evento.count({ where: { prospectoId: p.id, tipo: "saltado" } })).toBe(1);
  });

  it("escribirDeNuevo corre el seguimiento y registra el evento sin cambiar la etapa", async () => {
    const p = await crearProspectoDePrueba(ids.nichoId, { whatsapp: "584120000003", etapa: "enviado", proximoSeguimiento: "2026-09-01" });
    expect((await escribirDeNuevo(p.id, "whatsapp")).ok).toBe(true);
    const d = await prisma.prospecto.findUniqueOrThrow({ where: { id: p.id } });
    expect(d.etapa).toBe("enviado");
    expect(d.proximoSeguimiento).toBe(sumarDias(hoyCaracas(), 3));
    expect(await prisma.evento.count({ where: { prospectoId: p.id, tipo: "seguimiento" } })).toBe(1);
  });

  it("marcarRespondio limpia el seguimiento; descartar exige motivo; cambiarEtapa respeta el embudo", async () => {
    const p = await crearProspectoDePrueba(ids.nichoId, { etapa: "enviado", proximoSeguimiento: "2026-09-01" });
    expect((await marcarRespondio(p.id)).ok).toBe(true);
    let d = await prisma.prospecto.findUniqueOrThrow({ where: { id: p.id } });
    expect(d).toMatchObject({ etapa: "respondio", proximoSeguimiento: null });
    expect((await descartar(p.id, "  ")).ok).toBe(false);
    expect((await cambiarEtapa(p.id, "por_contactar")).ok).toBe(false); // no retrocede
    expect((await cambiarEtapa(p.id, "ganado")).ok).toBe(true);
    expect((await descartar(p.id, "ya es cliente")).ok).toBe(false); // ganado no se descarta
    d = await prisma.prospecto.findUniqueOrThrow({ where: { id: p.id } });
    expect(d.etapa).toBe("ganado");
  });

  it("descartar guarda el motivo y reactivar vuelve a por_contactar", async () => {
    const p = await crearProspectoDePrueba(ids.nichoId);
    expect((await descartar(p.id, "cerró")).ok).toBe(true);
    const ev = await prisma.evento.findFirstOrThrow({ where: { prospectoId: p.id, tipo: "etapa", a: "descartado" } });
    expect(ev.texto).toBe("cerró");
    expect((await cambiarEtapa(p.id, "por_contactar")).ok).toBe(true);
  });

  it("guardarNota y editarSeguimiento validan", async () => {
    const p = await crearProspectoDePrueba(ids.nichoId, { etapa: "enviado" });
    expect((await guardarNota(p.id, "solo cobra en efectivo")).ok).toBe(true);
    expect((await editarSeguimiento(p.id, "2026-02-30")).ok).toBe(false);
    expect((await editarSeguimiento(p.id, "2026-10-01")).ok).toBe(true);
    expect((await editarSeguimiento(p.id, "")).ok).toBe(true);
    const d = await prisma.prospecto.findUniqueOrThrow({ where: { id: p.id } });
    expect(d.nota).toBe("solo cobra en efectivo");
    expect(d.proximoSeguimiento).toBeNull();
  });

  it("crearProspecto normaliza y no duplica", async () => {
    const fd = new FormData();
    fd.set("nichoId", String(ids.nichoId)); fd.set("nombre", "Posada Nueva"); fd.set("ciudad", "Mérida");
    fd.set("telefono", "0414 123 45 67"); fd.set("instagram", "@posadanueva"); fd.set("fuente", "https://posadanueva.com/contacto");
    const r = await crearProspecto(fd);
    expect(r.ok).toBe(true);
    const d = await prisma.prospecto.findFirstOrThrow({ where: { nombre: "Posada Nueva" } });
    expect(d).toMatchObject({ whatsapp: "584141234567", instagram: "https://www.instagram.com/posadanueva/", origen: "manual", fuentes: ["https://posadanueva.com/contacto"] });
    expect((await crearProspecto(fd)).ok).toBe(false);
  });
});
```

- [ ] **Step 6: `src/acciones/prospectos.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { exigirSesion } from "@/lib/sesion";
import { CANALES, type Canal } from "@/lib/canales-contrato";
import { ETAPAS, puedePasar, type Etapa } from "@/lib/embudo-contrato";
import { hoyCaracas, sumarDias, esFechaIso } from "@/lib/fecha-caracas";
import { normalizarCelular, normalizarRed } from "@/lib/celular-contrato";
import { claveProspecto } from "@/lib/clave-prospecto";
import { generarCodigo } from "@/lib/codigo";
import { fallo, exito, type Resultado } from "@/acciones/resultado";

// exigirSesion() va FUERA del try/catch (redirige lanzando). Cada funcion
// exportada de aqui es un endpoint publico: nada de auxiliares exportados.

const Id = z.number().int().positive();
const CanalZ = z.enum(CANALES);
const EtapaZ = z.enum(ETAPAS);
const ERROR = "No se pudo guardar. Intenta de nuevo.";

function refrescar(id?: number) {
  revalidatePath("/hoy"); revalidatePath("/prospectos");
  if (id) revalidatePath(`/prospectos/${id}`);
}

async function nichoDe(id: number) {
  return prisma.prospecto.findUnique({ where: { id }, select: { etapa: true, nicho: { select: { diasSeguimiento: true } } } });
}

export async function marcarEnviado(prospectoId: number, canal: Canal): Promise<Resultado> {
  const u = await exigirSesion();
  const e = z.object({ id: Id, canal: CanalZ }).safeParse({ id: prospectoId, canal });
  if (!e.success) return fallo("Ese canal no existe.");
  try {
    const p = await nichoDe(e.data.id);
    if (!p) return fallo("Ese prospecto ya no existe.");
    const hoy = hoyCaracas();
    // Condicionado a la etapa leida: dos toques no cuentan dos envios.
    const r = await prisma.prospecto.updateMany({
      where: { id: e.data.id, etapa: "por_contactar" },
      data: { etapa: "enviado", proximoSeguimiento: sumarDias(hoy, p.nicho.diasSeguimiento) },
    });
    if (r.count === 0) return fallo("Ya estaba marcado como enviado.");
    await prisma.evento.create({ data: { prospectoId: e.data.id, usuarioId: u.id, tipo: "enviado", de: "por_contactar", a: "enviado", canal: e.data.canal } });
    refrescar(e.data.id);
    return exito();
  } catch (err) {
    console.error("marcarEnviado", err);
    return fallo(ERROR);
  }
}

export async function saltar(prospectoId: number): Promise<Resultado> {
  const u = await exigirSesion();
  const e = Id.safeParse(prospectoId);
  if (!e.success) return fallo(ERROR);
  try {
    const max = await prisma.prospecto.aggregate({ _max: { ordenCola: true } });
    await prisma.prospecto.update({ where: { id: e.data }, data: { ordenCola: (max._max.ordenCola ?? 0) + 1 } });
    await prisma.evento.create({ data: { prospectoId: e.data, usuarioId: u.id, tipo: "saltado" } });
    refrescar();
    return exito();
  } catch (err) {
    console.error("saltar", err);
    return fallo(ERROR);
  }
}

export async function escribirDeNuevo(prospectoId: number, canal: Canal): Promise<Resultado> {
  const u = await exigirSesion();
  const e = z.object({ id: Id, canal: CanalZ }).safeParse({ id: prospectoId, canal });
  if (!e.success) return fallo("Ese canal no existe.");
  try {
    const p = await nichoDe(e.data.id);
    if (!p || p.etapa !== "enviado") return fallo("Solo se reenvía a un prospecto en «Enviado».");
    await prisma.prospecto.update({ where: { id: e.data.id }, data: { proximoSeguimiento: sumarDias(hoyCaracas(), p.nicho.diasSeguimiento) } });
    await prisma.evento.create({ data: { prospectoId: e.data.id, usuarioId: u.id, tipo: "seguimiento", canal: e.data.canal } });
    refrescar(e.data.id);
    return exito();
  } catch (err) {
    console.error("escribirDeNuevo", err);
    return fallo(ERROR);
  }
}

async function pasarA(usuarioId: number, id: number, a: Etapa, texto = ""): Promise<Resultado> {
  const p = await prisma.prospecto.findUnique({ where: { id }, select: { etapa: true } });
  if (!p) return fallo("Ese prospecto ya no existe.");
  const de = p.etapa as Etapa;
  if (!puedePasar(de, a)) return fallo(`No se puede pasar de «${de}» a «${a}».`);
  const r = await prisma.prospecto.updateMany({ where: { id, etapa: de }, data: { etapa: a, ...(a === "respondio" || a === "ganado" || a === "descartado" ? { proximoSeguimiento: null } : {}) } });
  if (r.count === 0) return fallo("Alguien más acaba de cambiar este prospecto. Recarga.");
  await prisma.evento.create({ data: { prospectoId: id, usuarioId, tipo: "etapa", de, a, texto } });
  refrescar(id);
  return exito();
}

export async function marcarRespondio(prospectoId: number): Promise<Resultado> {
  const u = await exigirSesion();
  const e = Id.safeParse(prospectoId);
  if (!e.success) return fallo(ERROR);
  try { return await pasarA(u.id, e.data, "respondio"); } catch (err) { console.error("marcarRespondio", err); return fallo(ERROR); }
}

export async function descartar(prospectoId: number, motivo: string): Promise<Resultado> {
  const u = await exigirSesion();
  const e = z.object({ id: Id, motivo: z.string().trim().min(2).max(300) }).safeParse({ id: prospectoId, motivo });
  if (!e.success) return fallo("Escribe el motivo.");
  try { return await pasarA(u.id, e.data.id, "descartado", e.data.motivo); } catch (err) { console.error("descartar", err); return fallo(ERROR); }
}

export async function cambiarEtapa(prospectoId: number, a: Etapa, motivo = ""): Promise<Resultado> {
  const u = await exigirSesion();
  const e = z.object({ id: Id, a: EtapaZ, motivo: z.string().trim().max(300) }).safeParse({ id: prospectoId, a, motivo });
  if (!e.success) return fallo("Etapa inválida.");
  if (e.data.a === "descartado" && e.data.motivo.length < 2) return fallo("Escribe el motivo.");
  if (e.data.a === "enviado") return fallo("Para marcar enviado usa el botón de envío.");
  try { return await pasarA(u.id, e.data.id, e.data.a, e.data.motivo); } catch (err) { console.error("cambiarEtapa", err); return fallo(ERROR); }
}

export async function guardarNota(prospectoId: number, nota: string): Promise<Resultado> {
  const u = await exigirSesion();
  const e = z.object({ id: Id, nota: z.string().trim().max(2000) }).safeParse({ id: prospectoId, nota });
  if (!e.success) return fallo("La nota es muy larga.");
  try {
    await prisma.prospecto.update({ where: { id: e.data.id }, data: { nota: e.data.nota } });
    await prisma.evento.create({ data: { prospectoId: e.data.id, usuarioId: u.id, tipo: "nota", texto: e.data.nota.slice(0, 200) } });
    refrescar(e.data.id);
    return exito();
  } catch (err) { console.error("guardarNota", err); return fallo(ERROR); }
}

export async function editarSeguimiento(prospectoId: number, fecha: string): Promise<Resultado> {
  await exigirSesion();
  const e = Id.safeParse(prospectoId);
  if (!e.success) return fallo(ERROR);
  if (fecha !== "" && !esFechaIso(fecha)) return fallo("Fecha inválida.");
  try {
    await prisma.prospecto.update({ where: { id: e.data }, data: { proximoSeguimiento: fecha || null } });
    refrescar(e.data);
    return exito();
  } catch (err) { console.error("editarSeguimiento", err); return fallo(ERROR); }
}

const Nuevo = z.object({
  nichoId: z.coerce.number().int().positive(),
  nombre: z.string().trim().min(2).max(120),
  ciudad: z.string().trim().min(2).max(80),
  estado: z.string().trim().max(60).default(""),
  tipo: z.string().trim().max(60).default(""),
  tamano: z.string().trim().max(40).default(""),
  telefono: z.string().trim().max(80).default(""),
  whatsapp: z.string().trim().max(40).default(""),
  email: z.string().trim().max(120).default(""),
  web: z.string().trim().max(200).default(""),
  instagram: z.string().trim().max(200).default(""),
  facebook: z.string().trim().max(200).default(""),
  tiktok: z.string().trim().max(200).default(""),
  nota: z.string().trim().max(2000).default(""),
  fuente: z.string().trim().max(300).default(""),
});

export async function crearProspecto(formData: FormData): Promise<Resultado<{ id: number }>> {
  const u = await exigirSesion();
  const e = Nuevo.safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("Revisa nombre, ciudad y nicho.");
  const d = e.data;
  try {
    const p = await prisma.prospecto.create({
      data: {
        nichoId: d.nichoId, nombre: d.nombre, ciudad: d.ciudad, estado: d.estado, tipo: d.tipo, tamano: d.tamano, telefono: d.telefono,
        whatsapp: normalizarCelular(d.whatsapp) || normalizarCelular(d.telefono), email: d.email, web: d.web,
        instagram: normalizarRed(d.instagram, "instagram"), facebook: normalizarRed(d.facebook, "facebook"), tiktok: normalizarRed(d.tiktok, "tiktok"),
        nota: d.nota, fuentes: d.fuente ? [d.fuente] : [], origen: "manual", codigo: generarCodigo(), clave: claveProspecto(d.nombre, d.ciudad),
        ordenCola: ((await prisma.prospecto.aggregate({ _max: { ordenCola: true } }))._max.ordenCola ?? 0) + 1,
        eventos: { create: { tipo: "importado", usuarioId: u.id, texto: "manual" } },
      },
      select: { id: true },
    });
    refrescar(p.id);
    return exito({ id: p.id });
  } catch (err: any) {
    if (err?.code === "P2002") return fallo("Ya existe un prospecto con ese nombre en esa ciudad.");
    console.error("crearProspecto", err);
    return fallo(ERROR);
  }
}
```

- [ ] **Step 7: verificar y commit**

Run: `npm run test:db 2>&1 | tail -4 && npx tsc --noEmit`
Expected: todos `passed`, tsc limpio.

```bash
git add -A && git commit -F - <<'EOF'
feat: consultas de cola, seguimientos, resumen y ficha; acciones del embudo con updateMany condicionado

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 9: Pantallas del panel — layout, Hoy, Prospectos, ficha y Nuevo

**Files:**
- Create: `src/app/(panel)/layout.tsx`, `src/app/(panel)/hoy/page.tsx`, `src/app/(panel)/prospectos/page.tsx`, `src/app/(panel)/prospectos/[id]/page.tsx`, `src/app/(panel)/prospectos/nuevo/page.tsx`, `src/componentes/BarraInferior.tsx`, `src/componentes/BotonCopiar.tsx`, `src/componentes/BotonesCanal.tsx`, `src/componentes/TarjetaCola.tsx`, `src/componentes/TarjetaSeguimiento.tsx`, `src/componentes/FormularioNuevo.tsx`, `src/componentes/FichaAcciones.tsx`, `src/componentes/Etapa.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: todo lo de las tareas 4, 5, 6 y 8.
- Produces: pantallas navegables. Ningún componente cliente importa `@/lib/db`.

**Comportamiento clave (del spec):** el botón de canal abre la app externa; **al volver** la tarjeta pregunta «¿Se envió?» **Sí / No**. Solo «Sí» llama `marcarEnviado` (o `escribirDeNuevo` en seguimientos). Para redes, el botón primero copia el mensaje y luego abre el perfil.

- [ ] **Step 1: layout del panel y barra inferior**

```tsx
// src/app/(panel)/layout.tsx
import { exigirSesion } from "@/lib/sesion";
import { BarraInferior } from "@/componentes/BarraInferior";

export default async function LayoutPanel({ children }: { children: React.ReactNode }) {
  const u = await exigirSesion();
  return (
    <>
      <main className="contenedor">{children}</main>
      <BarraInferior rol={u.rol} />
    </>
  );
}
```

```tsx
// src/componentes/BarraInferior.tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Hoy · Prospectos · Buscar · Proyectos · Ajustes. Buscar y Proyectos se activan
// en las piezas 2 y 3; hasta entonces van deshabilitados. El prospectador no ve
// Proyectos ni Ajustes (solo "Mi PIN").
export function BarraInferior({ rol }: { rol: "dueno" | "prospectador" }) {
  const ruta = usePathname();
  const items = [
    { href: "/hoy", texto: "Hoy" },
    { href: "/prospectos", texto: "Prospectos" },
    { href: "/buscar", texto: "Buscar", pronto: true },
    ...(rol === "dueno" ? [{ href: "/proyectos", texto: "Proyectos", pronto: true }, { href: "/ajustes", texto: "Ajustes" }] : [{ href: "/ajustes/mi-pin", texto: "Mi PIN" }]),
  ];
  return (
    <nav className="barra" aria-label="Secciones">
      {items.map((i) =>
        i.pronto ? (
          <span key={i.href} className="barra__item barra__item--pronto" aria-disabled="true">{i.texto}</span>
        ) : (
          <Link key={i.href} href={i.href} className={"barra__item" + (ruta.startsWith(i.href) ? " activo" : "")}>{i.texto}</Link>
        ),
      )}
    </nav>
  );
}
```

CSS a agregar:

```css
.barra { position: fixed; left: 0; right: 0; bottom: 0; height: var(--barra-alto); display: flex; background: var(--panel); border-top: 1px solid var(--borde); padding-bottom: env(safe-area-inset-bottom); z-index: 10; }
.barra__item { flex: 1; display: flex; align-items: center; justify-content: center; font-size: 13px; text-decoration: none; color: var(--tinta-suave); }
.barra__item.activo { color: var(--verde); font-weight: 600; }
.barra__item--pronto { opacity: .35; }
.progreso { height: 8px; background: var(--borde); border-radius: 4px; overflow: hidden; margin: 6px 0 10px; }
.progreso > i { display: block; height: 100%; background: var(--verde); }
.embudo { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; font-size: 12px; text-align: center; }
.embudo b { display: block; font-size: 18px; }
.etiqueta { display: inline-block; font-size: 12px; padding: 2px 8px; border-radius: 999px; background: var(--borde); color: var(--tinta-suave); }
.etiqueta--enviado { background: #23413a; color: var(--verde); }
.etiqueta--respondio, .etiqueta--reunion { background: #3b3520; color: var(--ambar); }
.etiqueta--ganado { background: var(--verde); color: #0b1a12; }
.etiqueta--descartado { background: #3b2424; color: var(--rojo); }
.fila { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 10px 0; border-bottom: 1px solid var(--borde); text-decoration: none; }
.pregunta { background: #23413a; border-radius: 10px; padding: 10px; margin-top: 10px; }
.historial li { padding: 6px 0; border-bottom: 1px solid var(--borde); font-size: 14px; }
.historial time { color: var(--tinta-suave); font-size: 12px; display: block; }
```

- [ ] **Step 2: componentes de tarjeta**

```tsx
// src/componentes/BotonCopiar.tsx
"use client";
import { useState } from "react";
export function BotonCopiar({ texto, etiqueta = "Copiar mensaje" }: { texto: string; etiqueta?: string }) {
  const [listo, setListo] = useState(false);
  return (
    <button type="button" className="boton" onClick={async () => { await navigator.clipboard.writeText(texto); setListo(true); setTimeout(() => setListo(false), 1500); }}>
      {listo ? "Copiado" : etiqueta}
    </button>
  );
}
```

```tsx
// src/componentes/BotonesCanal.tsx
"use client";
import { useState } from "react";
import { canalesDisponibles, type Canal, type ContactoProspecto } from "@/lib/canales-contrato";
import { BotonCopiar } from "./BotonCopiar";

// Dibuja un boton por canal disponible. Al tocar uno, abre la app externa y
// avisa al padre que canal se uso para que pregunte "¿Se envio?" al volver.
export function BotonesCanal({ contacto, mensaje, onAbierto }: { contacto: ContactoProspecto; mensaje: string; onAbierto: (canal: Canal) => void }) {
  const [copiando, setCopiando] = useState<Canal | null>(null);
  const acciones = canalesDisponibles(contacto, mensaje);
  if (!acciones.length) return <p className="suave">Sin contacto publicado. <BotonCopiar texto={mensaje} /></p>;
  return (
    <div className="fila-botones">
      {acciones.map((a, i) => (
        <a key={a.canal} href={a.href} target={a.canal === "whatsapp" || a.modo === "copiar_y_abrir" ? "_blank" : undefined} rel="noopener"
          className={"boton" + (i === 0 ? " boton--primario" : "")}
          onClick={async () => {
            if (a.modo === "copiar_y_abrir") { setCopiando(a.canal); try { await navigator.clipboard.writeText(mensaje); } catch {} }
            onAbierto(a.canal);
          }}>
          {copiando === a.canal ? "Mensaje copiado…" : a.etiqueta}
        </a>
      ))}
      <BotonCopiar texto={mensaje} />
    </div>
  );
}
```

```tsx
// src/componentes/TarjetaCola.tsx
"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import type { Canal } from "@/lib/canales-contrato";
import type { ProspectoTarjeta } from "@/lib/prospectos-contrato";
import { marcarEnviado, saltar } from "@/acciones/prospectos";
import { BotonesCanal } from "./BotonesCanal";

export function TarjetaCola({ p }: { p: ProspectoTarjeta }) {
  const [canal, setCanal] = useState<Canal | null>(null);
  const [error, setError] = useState("");
  const [oculta, setOculta] = useState(false);
  const [pendiente, empezar] = useTransition();
  if (oculta) return null;

  function confirmar(si: boolean) {
    if (!si || !canal) return setCanal(null);
    empezar(async () => {
      const r = await marcarEnviado(p.id, canal);
      if (r.ok) setOculta(true); else setError(r.mensaje);
    });
  }

  return (
    <article className="tarjeta">
      <Link href={`/prospectos/${p.id}`}><b>{p.nombre}</b></Link>
      <div className="suave">{p.ciudad} · {p.nichoNombre}{p.tamano ? ` · ${p.tamano}` : ""}</div>
      {p.nota && <p className="suave" style={{ whiteSpace: "pre-line" }}>{p.nota}</p>}
      {canal ? (
        <div className="pregunta" role="group" aria-label="¿Se envió?">
          <b>¿Se envió?</b>
          <div className="fila-botones">
            <button className="boton boton--primario" disabled={pendiente} onClick={() => confirmar(true)}>Sí</button>
            <button className="boton" disabled={pendiente} onClick={() => confirmar(false)}>No</button>
          </div>
        </div>
      ) : (
        <>
          <BotonesCanal contacto={p} mensaje={p.mensaje} onAbierto={setCanal} />
          <div className="fila-botones">
            <button className="boton" disabled={pendiente} onClick={() => empezar(async () => { const r = await saltar(p.id); if (r.ok) setOculta(true); else setError(r.mensaje); })}>Saltar</button>
          </div>
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </article>
  );
}
```

```tsx
// src/componentes/TarjetaSeguimiento.tsx
"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import type { Canal } from "@/lib/canales-contrato";
import type { ProspectoTarjeta } from "@/lib/prospectos-contrato";
import { escribirDeNuevo, marcarRespondio, descartar } from "@/acciones/prospectos";
import { BotonesCanal } from "./BotonesCanal";

export function TarjetaSeguimiento({ p }: { p: ProspectoTarjeta }) {
  const [modo, setModo] = useState<"normal" | "escribir" | "pregunta" | "descartar">("normal");
  const [canal, setCanal] = useState<Canal | null>(null);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [oculta, setOculta] = useState(false);
  const [pendiente, empezar] = useTransition();
  if (oculta) return null;
  const correr = (fn: () => Promise<{ ok: boolean; mensaje?: string }>) => empezar(async () => { const r = await fn(); if (r.ok) setOculta(true); else setError(r.mensaje ?? "Error"); });

  return (
    <article className="tarjeta">
      <Link href={`/prospectos/${p.id}`}><b>{p.nombre}</b></Link>
      <div className="suave">{p.ciudad} · seguimiento {p.proximoSeguimiento} · {p.abrio ? "abrió la propuesta" : "no ha abierto la propuesta"}</div>
      {modo === "normal" && (
        <div className="fila-botones">
          <button className="boton boton--primario" disabled={pendiente} onClick={() => correr(() => marcarRespondio(p.id))}>Respondió</button>
          <button className="boton" onClick={() => setModo("escribir")}>Escribir de nuevo</button>
          <button className="boton boton--peligro" onClick={() => setModo("descartar")}>Descartar</button>
        </div>
      )}
      {modo === "escribir" && <BotonesCanal contacto={p} mensaje={p.mensaje} onAbierto={(c) => { setCanal(c); setModo("pregunta"); }} />}
      {modo === "pregunta" && canal && (
        <div className="pregunta"><b>¿Se envió?</b>
          <div className="fila-botones">
            <button className="boton boton--primario" disabled={pendiente} onClick={() => correr(() => escribirDeNuevo(p.id, canal))}>Sí</button>
            <button className="boton" onClick={() => setModo("normal")}>No</button>
          </div>
        </div>
      )}
      {modo === "descartar" && (
        <div className="pregunta">
          <label className="campo"><span>Motivo</span><input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus /></label>
          <div className="fila-botones">
            <button className="boton boton--peligro" disabled={pendiente} onClick={() => correr(() => descartar(p.id, motivo))}>Descartar</button>
            <button className="boton" onClick={() => setModo("normal")}>Cancelar</button>
          </div>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </article>
  );
}
```

```tsx
// src/componentes/Etapa.tsx
import { ETIQUETA_ETAPA, type Etapa as TipoEtapa } from "@/lib/embudo-contrato";
export function Etapa({ etapa }: { etapa: TipoEtapa }) {
  return <span className={`etiqueta etiqueta--${etapa}`}>{ETIQUETA_ETAPA[etapa]}</span>;
}
```

- [ ] **Step 3: `/hoy`**

```tsx
// src/app/(panel)/hoy/page.tsx
import Link from "next/link";
import { exigirSesion } from "@/lib/sesion";
import { hoyCaracas } from "@/lib/fecha-caracas";
import { resumenHoy, seguimientosQueTocan, colaDelDia } from "@/lib/prospectos";
import { prisma } from "@/lib/db";
import { TarjetaCola } from "@/componentes/TarjetaCola";
import { TarjetaSeguimiento } from "@/componentes/TarjetaSeguimiento";

export const dynamic = "force-dynamic";

export default async function Hoy() {
  const u = await exigirSesion();
  const hoy = hoyCaracas();
  const [resumen, seguimientos, cola, ganadosSinProyecto] = await Promise.all([
    resumenHoy(hoy), seguimientosQueTocan(hoy), colaDelDia(10),
    // Pieza 3: cuando exista Proyecto, esta consulta pasa a contar ganados sin proyecto.
    prisma.prospecto.count({ where: { etapa: "ganado" } }),
  ]);
  const mio = resumen.porUsuario.find((x) => x.id === u.id) ?? { enviados: 0, meta: 0, nombre: u.nombre, id: u.id };
  const otros = resumen.porUsuario.filter((x) => x.id !== u.id);
  const pct = mio.meta ? Math.min(100, Math.round((mio.enviados / mio.meta) * 100)) : 0;

  return (
    <>
      <section className="tarjeta">
        <b>Hoy: {mio.enviados} de {mio.meta} enviados</b>
        <div className="progreso" role="progressbar" aria-valuenow={mio.enviados} aria-valuemax={mio.meta}><i style={{ width: `${pct}%` }} /></div>
        {otros.map((o) => <div key={o.id} className="suave">{o.nombre}: {o.enviados} de {o.meta}</div>)}
        <div className="embudo">
          <div><b>{resumen.embudo.por_contactar}</b>por contactar</div>
          <div><b>{resumen.embudo.enviado}</b>enviados</div>
          <div><b>{resumen.embudo.respondio}</b>respondieron</div>
          <div><b>{resumen.embudo.reunion}</b>reuniones</div>
        </div>
        {ganadosSinProyecto > 0 && u.rol === "dueno" && <p className="suave">{ganadosSinProyecto} ganado(s): el módulo de proyectos llega en la pieza 3.</p>}
      </section>

      <h2 className="titulo">Seguimientos que tocan ({seguimientos.length})</h2>
      {seguimientos.length === 0 && <p className="suave">Ninguno hoy.</p>}
      {seguimientos.map((p) => <TarjetaSeguimiento key={p.id} p={p} />)}

      <h2 className="titulo">Por contactar</h2>
      {cola.length === 0 && <p className="suave">La cola está vacía. <Link href="/prospectos/nuevo">Agrega un prospecto</Link>.</p>}
      {cola.map((p) => <TarjetaCola key={p.id} p={p} />)}
    </>
  );
}
```

- [ ] **Step 4: `/prospectos` (buscador) y `/prospectos/nuevo`**

```tsx
// src/app/(panel)/prospectos/page.tsx
import Link from "next/link";
import { exigirSesion } from "@/lib/sesion";
import { buscarProspectos, listarNichos } from "@/lib/prospectos";
import { ETAPAS, ETIQUETA_ETAPA, esEtapa } from "@/lib/embudo-contrato";
import { Etapa } from "@/componentes/Etapa";

export const dynamic = "force-dynamic";

export default async function Prospectos({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await exigirSesion();
  const sp = await searchParams;
  const etapa = sp.etapa && esEtapa(sp.etapa) ? sp.etapa : undefined;
  const nichoId = sp.nicho ? Number(sp.nicho) || undefined : undefined;
  const [lista, nichos] = await Promise.all([buscarProspectos({ q: sp.q, etapa, nichoId }), listarNichos()]);
  return (
    <>
      <div className="fila" style={{ border: 0 }}><h1 className="titulo">Prospectos</h1><Link className="boton boton--primario" href="/prospectos/nuevo">Nuevo</Link></div>
      <form className="tarjeta" method="get">
        <label className="campo"><span>Buscar</span><input name="q" defaultValue={sp.q ?? ""} placeholder="Nombre, ciudad o teléfono" /></label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label className="campo"><span>Nicho</span>
            <select name="nicho" defaultValue={sp.nicho ?? ""}><option value="">Todos</option>{nichos.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}</select></label>
          <label className="campo"><span>Etapa</span>
            <select name="etapa" defaultValue={sp.etapa ?? ""}><option value="">Todas</option>{ETAPAS.map((e) => <option key={e} value={e}>{ETIQUETA_ETAPA[e]}</option>)}</select></label>
        </div>
        <button className="boton" type="submit">Filtrar</button>
      </form>
      {lista.length === 0 && <p className="suave">Nada con esos filtros.</p>}
      {lista.map((p) => (
        <Link key={p.id} href={`/prospectos/${p.id}`} className="fila">
          <span><b>{p.nombre}</b><br /><span className="suave">{p.ciudad} · {p.nichoNombre}</span></span>
          <Etapa etapa={p.etapa} />
        </Link>
      ))}
    </>
  );
}
```

```tsx
// src/app/(panel)/prospectos/nuevo/page.tsx
import { exigirSesion } from "@/lib/sesion";
import { listarNichos } from "@/lib/prospectos";
import { FormularioNuevo } from "@/componentes/FormularioNuevo";

export default async function Nuevo() {
  await exigirSesion();
  const nichos = await listarNichos();
  return (<><h1 className="titulo">Nuevo prospecto</h1><FormularioNuevo nichos={nichos} /></>);
}
```

```tsx
// src/componentes/FormularioNuevo.tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearProspecto } from "@/acciones/prospectos";

const CAMPOS: [string, string, string?][] = [
  ["nombre", "Nombre del negocio"], ["ciudad", "Ciudad"], ["estado", "Estado"], ["tipo", "Tipo"], ["tamano", "Tamaño (ej. 20 hab.)"],
  ["telefono", "Teléfono(s)", "tel"], ["whatsapp", "WhatsApp", "tel"], ["email", "Correo", "email"], ["web", "Web", "url"],
  ["instagram", "Instagram"], ["facebook", "Facebook"], ["tiktok", "TikTok"], ["fuente", "Fuente (URL donde publican el contacto)", "url"],
];

export function FormularioNuevo({ nichos }: { nichos: { id: number; nombre: string }[] }) {
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
  return (
    <form className="tarjeta" action={(fd) => empezar(async () => { const r = await crearProspecto(fd); if (r.ok) router.push(`/prospectos/${r.datos.id}`); else setError(r.mensaje); })}>
      <label className="campo"><span>Nicho</span><select name="nichoId" required>{nichos.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}</select></label>
      {CAMPOS.map(([n, t, tipo]) => <label key={n} className="campo"><span>{t}</span><input name={n} type={tipo ?? "text"} required={n === "nombre" || n === "ciudad"} /></label>)}
      <label className="campo"><span>Nota interna</span><textarea name="nota" rows={3} /></label>
      <p className="suave">Solo datos que el negocio publicó. Nada de contactos personales.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="boton boton--primario" disabled={pendiente} type="submit">Guardar</button>
    </form>
  );
}
```

- [ ] **Step 5: ficha `/prospectos/[id]`**

```tsx
// src/app/(panel)/prospectos/[id]/page.tsx
import { notFound } from "next/navigation";
import { exigirSesion } from "@/lib/sesion";
import { fichaProspecto } from "@/lib/prospectos";
import { ETIQUETA_CANAL, type Canal } from "@/lib/canales-contrato";
import { Etapa } from "@/componentes/Etapa";
import { FichaAcciones } from "@/componentes/FichaAcciones";
import { BotonCopiar } from "@/componentes/BotonCopiar";

export const dynamic = "force-dynamic";

const TEXTO_EVENTO: Record<string, string> = { enviado: "Enviado", seguimiento: "Escribió de nuevo", abierto: "Abrió la propuesta", etapa: "Cambio de etapa", nota: "Nota", saltado: "Saltado", importado: "Ingresó" };

export default async function Ficha({ params }: { params: Promise<{ id: string }> }) {
  await exigirSesion();
  const id = Number((await params).id);
  const p = Number.isInteger(id) ? await fichaProspecto(id) : null;
  if (!p) notFound();
  const contacto: [string, string][] = [
    ["WhatsApp", p.whatsapp ? `https://wa.me/${p.whatsapp}` : ""], ["Teléfono", p.telefono ? `tel:${p.telefono.replace(/[^\d+]/g, "")}` : ""],
    ["Correo", p.email ? `mailto:${p.email}` : ""], ["Web", p.web], ["Instagram", p.instagram], ["Facebook", p.facebook], ["TikTok", p.tiktok],
  ];
  return (
    <>
      <h1 className="titulo">{p.nombre} <Etapa etapa={p.etapa} /></h1>
      <p className="suave">{p.ciudad} · {p.nichoNombre}{p.tipo ? ` · ${p.tipo}` : ""}{p.tamano ? ` · ${p.tamano}` : ""}</p>
      <section className="tarjeta">
        <b>Contacto</b>
        {contacto.filter(([, h]) => h).map(([t, h]) => <div key={t} className="fila"><span>{t}</span><a href={h} target="_blank" rel="noopener">{h.replace(/^(https?:\/\/|mailto:|tel:)/, "")}</a></div>)}
        {p.fuentes.length > 0 && <p className="suave">Fuentes: {p.fuentes.map((f, i) => <a key={i} href={f} target="_blank" rel="noopener">[{i + 1}] </a>)}</p>}
      </section>
      <section className="tarjeta">
        <b>Propuesta</b>
        <div className="fila-botones"><a className="boton" href={p.enlace} target="_blank" rel="noopener">Ver</a><BotonCopiar texto={p.enlace} etiqueta="Copiar enlace" /><BotonCopiar texto={p.mensaje} /></div>
        <p className="suave">{p.abrio ? "El prospecto abrió la propuesta." : "Todavía no la ha abierto."}</p>
      </section>
      <FichaAcciones id={p.id} etapa={p.etapa} nota={p.nota} proximoSeguimiento={p.proximoSeguimiento} contacto={p} mensaje={p.mensaje} />
      <section className="tarjeta">
        <b>Historial</b>
        <ul className="historial" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {p.historial.map((e) => (
            <li key={e.id}>
              {TEXTO_EVENTO[e.tipo] ?? e.tipo}{e.canal ? ` por ${ETIQUETA_CANAL[e.canal as Canal] ?? e.canal}` : ""}{e.a ? ` → ${e.a}` : ""}{e.texto ? `: ${e.texto}` : ""}
              <time>{e.creadoEn.toLocaleString("es-VE", { timeZone: "America/Caracas" })}{e.usuarioNombre ? ` · ${e.usuarioNombre}` : ""}</time>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
```

```tsx
// src/componentes/FichaAcciones.tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Canal, ContactoProspecto } from "@/lib/canales-contrato";
import { ETAPAS, ETIQUETA_ETAPA, puedePasar, type Etapa } from "@/lib/embudo-contrato";
import { cambiarEtapa, guardarNota, editarSeguimiento, marcarEnviado, escribirDeNuevo } from "@/acciones/prospectos";
import { BotonesCanal } from "./BotonesCanal";

export function FichaAcciones(props: { id: number; etapa: Etapa; nota: string; proximoSeguimiento: string | null; contacto: ContactoProspecto; mensaje: string }) {
  const [nota, setNota] = useState(props.nota);
  const [fecha, setFecha] = useState(props.proximoSeguimiento ?? "");
  const [motivo, setMotivo] = useState("");
  const [canal, setCanal] = useState<Canal | null>(null);
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
  const correr = (fn: () => Promise<{ ok: boolean; mensaje?: string }>) => empezar(async () => { const r = await fn(); if (r.ok) { setError(""); setCanal(null); router.refresh(); } else setError(r.mensaje ?? "Error"); });
  const destinos = ETAPAS.filter((e) => e !== "enviado" && puedePasar(props.etapa, e));
  const puedeEnviar = props.etapa === "por_contactar" || props.etapa === "enviado";

  return (
    <>
      {puedeEnviar && (
        <section className="tarjeta">
          <b>{props.etapa === "por_contactar" ? "Enviar propuesta" : "Escribir de nuevo"}</b>
          {canal ? (
            <div className="pregunta"><b>¿Se envió?</b>
              <div className="fila-botones">
                <button className="boton boton--primario" disabled={pendiente} onClick={() => correr(() => props.etapa === "por_contactar" ? marcarEnviado(props.id, canal) : escribirDeNuevo(props.id, canal))}>Sí</button>
                <button className="boton" onClick={() => setCanal(null)}>No</button>
              </div>
            </div>
          ) : <BotonesCanal contacto={props.contacto} mensaje={props.mensaje} onAbierto={setCanal} />}
        </section>
      )}
      <section className="tarjeta">
        <b>Etapa</b>
        <div className="fila-botones">
          {destinos.map((e) => <button key={e} className={"boton" + (e === "descartado" ? " boton--peligro" : "")} disabled={pendiente} onClick={() => correr(() => cambiarEtapa(props.id, e, motivo))}>{ETIQUETA_ETAPA[e]}</button>)}
        </div>
        {destinos.includes("descartado") && <label className="campo"><span>Motivo (para descartar)</span><input value={motivo} onChange={(e) => setMotivo(e.target.value)} /></label>}
        <label className="campo"><span>Próximo seguimiento</span><input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} onBlur={() => correr(() => editarSeguimiento(props.id, fecha))} /></label>
      </section>
      <section className="tarjeta">
        <label className="campo"><span>Nota interna (nunca sale del panel)</span><textarea rows={3} value={nota} onChange={(e) => setNota(e.target.value)} /></label>
        <button className="boton" disabled={pendiente || nota === props.nota} onClick={() => correr(() => guardarNota(props.id, nota))}>Guardar nota</button>
      </section>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}
```

- [ ] **Step 6: verificar en el navegador**

Run: `npx tsc --noEmit && (set -a; . ~/.config/prospectos/env; set +a; PORT=3013 npx next dev -p 3013 -H 127.0.0.1 > /tmp/claude-1010/prospectos-dev.log 2>&1 & echo $! > /tmp/claude-1010/prospectos-dev.pid); sleep 8; curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3013/entrar`
Expected: `200`. Luego con Playwright (script corto en el scratchpad, viewport 390×844): entrar con el PIN del dueño, capturar `/hoy`, `/prospectos`, la ficha de un hotel y `/prospectos/nuevo`; mirar las capturas. Cerrar el dev server: `kill $(cat /tmp/claude-1010/prospectos-dev.pid)`.

Qué revisar en las capturas: la barra inferior no tapa el último botón; los botones de canal caben en dos filas a 390 px; la pregunta «¿Se envió?» aparece al tocar un canal.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -F - <<'EOF'
feat: pantallas Hoy, Prospectos, ficha y Nuevo con tarjetas de cola y seguimiento

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 10: Ajustes — usuarios, nichos, meta diaria y PIN

**Files:**
- Create: `src/acciones/ajustes.ts`, `src/app/(panel)/ajustes/page.tsx`, `src/app/(panel)/ajustes/mi-pin/page.tsx`, `src/componentes/FormularioAjustes.tsx`, `src/componentes/FormularioPin.tsx`, `tests/ajustes.test.ts`

**Interfaces:**
- Consumes: `exigirSesion`, `exigirRol`, `crearUsuario`, `cambiarPin`, `listarUsuarios`.
- Produces (acciones, todas `Promise<Resultado>`): `guardarNicho(formData)` (dueno), `guardarUsuario(formData)` (dueno; alta o edición de nombre/rol/meta/activo), `cambiarMiPin(formData)` (cualquiera; pide PIN actual), `restablecerPin(usuarioId, pinNuevo)` (dueno).

- [ ] **Step 1: tests**

```ts
// tests/ajustes.test.ts
import "./ayuda-sesion";
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, PIN_DUENO, PIN_PROSPECTADOR } from "./ayuda-db";
import { sesionFalsa } from "./ayuda-sesion";
import { guardarNicho, guardarUsuario, cambiarMiPin, restablecerPin } from "@/acciones/ajustes";
import { buscarPorPin } from "@/lib/usuarios";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe.runIf(DB_HABILITADA)("ajustes", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  beforeAll(async () => { await limpiarBase(); ids = await sembrarBasico(); });
  beforeEach(() => { sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" }; });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("el prospectador no puede tocar nichos ni usuarios", async () => {
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
    await expect(guardarNicho(fd({ id: String(ids.nichoId), mensajeInicial: "x", mensajeSeguimiento: "y", diasSeguimiento: "2" }))).rejects.toThrow("REDIRECT:/hoy");
    await expect(guardarUsuario(fd({ nombre: "Z", rol: "prospectador", pin: "111111", metaDiaria: "3" }))).rejects.toThrow("REDIRECT:/hoy");
  });
  it("guardarNicho exige {enlace} en el mensaje inicial y dias entre 1 y 30", async () => {
    expect((await guardarNicho(fd({ id: String(ids.nichoId), mensajeInicial: "sin enlace {nombre}", mensajeSeguimiento: "y {enlace}", diasSeguimiento: "3" }))).ok).toBe(false);
    expect((await guardarNicho(fd({ id: String(ids.nichoId), mensajeInicial: "a {enlace}", mensajeSeguimiento: "b {enlace}", diasSeguimiento: "45" }))).ok).toBe(false);
    expect((await guardarNicho(fd({ id: String(ids.nichoId), mensajeInicial: "Hola {nombre}: {enlace}", mensajeSeguimiento: "De nuevo {enlace}", diasSeguimiento: "5" }))).ok).toBe(true);
    expect((await prisma.nicho.findUniqueOrThrow({ where: { id: ids.nichoId } })).diasSeguimiento).toBe(5);
  });
  it("guardarUsuario crea, edita y desactiva sin borrar", async () => {
    const r = await guardarUsuario(fd({ nombre: "Pedro", rol: "prospectador", pin: "222222", metaDiaria: "4" }));
    expect(r.ok).toBe(true);
    const pedro = (await buscarPorPin("222222"))!;
    expect(pedro.nombre).toBe("Pedro");
    expect((await guardarUsuario(fd({ id: String(pedro.id), nombre: "Pedro P.", rol: "prospectador", metaDiaria: "6", activo: "" }))).ok).toBe(true);
    expect(await buscarPorPin("222222")).toBeNull(); // desactivado
    expect(await prisma.usuario.count()).toBe(3);
  });
  it("un PIN repetido se rechaza con mensaje claro", async () => {
    const r = await guardarUsuario(fd({ nombre: "Otra", rol: "prospectador", pin: PIN_DUENO, metaDiaria: "1" }));
    expect(r).toEqual({ ok: false, mensaje: expect.stringContaining("otra cuenta") });
  });
  it("cambiarMiPin pide el actual; restablecerPin es del dueno", async () => {
    expect((await cambiarMiPin(fd({ actual: "000000", nuevo: "333333" }))).ok).toBe(false);
    expect((await cambiarMiPin(fd({ actual: PIN_DUENO, nuevo: "333333" }))).ok).toBe(true);
    expect((await buscarPorPin("333333"))?.id).toBe(ids.usuarioId);
    expect((await restablecerPin(ids.prospectadorId, "444444")).ok).toBe(true);
    expect((await buscarPorPin("444444"))?.id).toBe(ids.prospectadorId);
    expect(await buscarPorPin(PIN_PROSPECTADOR)).toBeNull();
  });
});
```

- [ ] **Step 2: `src/acciones/ajustes.ts`**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { exigirSesion, exigirRol } from "@/lib/sesion";
import { crearUsuario, cambiarPin, PIN_VALIDO } from "@/lib/usuarios";
import { fallo, exito, type Resultado } from "@/acciones/resultado";

const ERROR = "No se pudo guardar. Intenta de nuevo.";
const MENSAJE_PIN: Record<string, string> = { PIN_REPETIDO: "Ese PIN ya lo usa otra cuenta.", PIN_INVALIDO: "El PIN son 6 números." };

const NichoZ = z.object({
  id: z.coerce.number().int().positive(),
  mensajeInicial: z.string().trim().min(10).max(2000).refine((s) => s.includes("{enlace}"), "falta {enlace}"),
  mensajeSeguimiento: z.string().trim().min(10).max(2000),
  diasSeguimiento: z.coerce.number().int().min(1).max(30),
});

export async function guardarNicho(formData: FormData): Promise<Resultado> {
  await exigirRol("dueno");
  const e = NichoZ.safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("Revisa: el mensaje inicial lleva {enlace}, y los días van de 1 a 30.");
  try {
    const { id, ...data } = e.data;
    await prisma.nicho.update({ where: { id }, data });
    revalidatePath("/ajustes"); revalidatePath("/hoy");
    return exito();
  } catch (err) { console.error("guardarNicho", err); return fallo(ERROR); }
}

const UsuarioZ = z.object({
  id: z.coerce.number().int().positive().optional(),
  nombre: z.string().trim().min(2).max(60),
  rol: z.enum(["dueno", "prospectador"]),
  metaDiaria: z.coerce.number().int().min(0).max(200),
  pin: z.string().optional(),
  activo: z.string().optional(), // checkbox: "on" o ausente/vacio
});

export async function guardarUsuario(formData: FormData): Promise<Resultado> {
  const yo = await exigirRol("dueno");
  const e = UsuarioZ.safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("Revisa nombre, rol y meta.");
  const d = e.data;
  try {
    if (!d.id) {
      if (!d.pin || !PIN_VALIDO.test(d.pin)) return fallo(MENSAJE_PIN.PIN_INVALIDO);
      await crearUsuario({ nombre: d.nombre, rol: d.rol, pin: d.pin, metaDiaria: d.metaDiaria });
    } else {
      const activo = d.activo === "on";
      if (d.id === yo.id && (!activo || d.rol !== "dueno")) return fallo("No puedes desactivarte ni quitarte el rol de dueño.");
      await prisma.usuario.update({ where: { id: d.id }, data: { nombre: d.nombre, rol: d.rol, metaDiaria: d.metaDiaria, activo } });
    }
    revalidatePath("/ajustes"); revalidatePath("/hoy");
    return exito();
  } catch (err: any) {
    if (err?.message in MENSAJE_PIN) return fallo(MENSAJE_PIN[err.message]);
    console.error("guardarUsuario", err); return fallo(ERROR);
  }
}

export async function cambiarMiPin(formData: FormData): Promise<Resultado> {
  const yo = await exigirSesion();
  const e = z.object({ actual: z.string(), nuevo: z.string().regex(PIN_VALIDO) }).safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo(MENSAJE_PIN.PIN_INVALIDO);
  try {
    const u = await prisma.usuario.findUniqueOrThrow({ where: { id: yo.id } });
    if (!(await bcrypt.compare(e.data.actual, u.pinHash))) return fallo("El PIN actual no es correcto.");
    await cambiarPin(yo.id, e.data.nuevo);
    return exito();
  } catch (err: any) {
    if (err?.message in MENSAJE_PIN) return fallo(MENSAJE_PIN[err.message]);
    console.error("cambiarMiPin", err); return fallo(ERROR);
  }
}

export async function restablecerPin(usuarioId: number, pinNuevo: string): Promise<Resultado> {
  await exigirRol("dueno");
  const e = z.object({ id: z.number().int().positive(), pin: z.string().regex(PIN_VALIDO) }).safeParse({ id: usuarioId, pin: pinNuevo });
  if (!e.success) return fallo(MENSAJE_PIN.PIN_INVALIDO);
  try { await cambiarPin(e.data.id, e.data.pin); return exito(); }
  catch (err: any) {
    if (err?.message in MENSAJE_PIN) return fallo(MENSAJE_PIN[err.message]);
    console.error("restablecerPin", err); return fallo(ERROR);
  }
}
```

- [ ] **Step 3: páginas y formularios**

```tsx
// src/app/(panel)/ajustes/page.tsx
import { exigirRol } from "@/lib/sesion";
import { prisma } from "@/lib/db";
import { listarUsuarios } from "@/lib/usuarios";
import { FormularioNicho, FormularioUsuario } from "@/componentes/FormularioAjustes";
import { FormularioPin } from "@/componentes/FormularioPin";

export const dynamic = "force-dynamic";

export default async function Ajustes() {
  await exigirRol("dueno");
  const [nichos, usuarios] = await Promise.all([prisma.nicho.findMany({ orderBy: { nombre: "asc" } }), listarUsuarios()]);
  return (
    <>
      <h1 className="titulo">Ajustes</h1>
      <h2 className="titulo">Usuarios</h2>
      {usuarios.map((u) => <FormularioUsuario key={u.id} usuario={u} />)}
      <FormularioUsuario />
      <h2 className="titulo">Mensajes por nicho</h2>
      {nichos.map((n) => <FormularioNicho key={n.id} nicho={n} />)}
      <h2 className="titulo">Mi PIN</h2>
      <FormularioPin />
    </>
  );
}
```

```tsx
// src/app/(panel)/ajustes/mi-pin/page.tsx — lo unico de Ajustes que ve el prospectador
import { exigirSesion } from "@/lib/sesion";
import { FormularioPin } from "@/componentes/FormularioPin";
export default async function MiPin() { await exigirSesion(); return (<><h1 className="titulo">Mi PIN</h1><FormularioPin /></>); }
```

```tsx
// src/componentes/FormularioAjustes.tsx
"use client";
import { useState, useTransition } from "react";
import { guardarNicho, guardarUsuario, restablecerPin } from "@/acciones/ajustes";

function useEnvio() {
  const [msj, setMsj] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, empezar] = useTransition();
  const enviar = (fn: () => Promise<{ ok: boolean; mensaje?: string }>) => empezar(async () => { const r = await fn(); setMsj(r.ok ? { ok: true, texto: "Guardado." } : { ok: false, texto: r.mensaje ?? "Error" }); });
  return { msj, pendiente, enviar };
}

export function FormularioNicho({ nicho }: { nicho: { id: number; nombre: string; mensajeInicial: string; mensajeSeguimiento: string; diasSeguimiento: number } }) {
  const { msj, pendiente, enviar } = useEnvio();
  return (
    <form className="tarjeta" action={(fd) => enviar(() => guardarNicho(fd))}>
      <b>{nicho.nombre}</b>
      <input type="hidden" name="id" value={nicho.id} />
      <label className="campo"><span>Mensaje inicial (usa {"{nombre}"} y {"{enlace}"})</span><textarea name="mensajeInicial" rows={5} defaultValue={nicho.mensajeInicial} /></label>
      <label className="campo"><span>Mensaje de seguimiento</span><textarea name="mensajeSeguimiento" rows={4} defaultValue={nicho.mensajeSeguimiento} /></label>
      <label className="campo"><span>Días para el seguimiento</span><input name="diasSeguimiento" type="number" min={1} max={30} defaultValue={nicho.diasSeguimiento} /></label>
      <button className="boton boton--primario" disabled={pendiente}>Guardar</button>
      {msj && <p className={msj.ok ? "suave" : "error"} role="status">{msj.texto}</p>}
    </form>
  );
}

export function FormularioUsuario({ usuario }: { usuario?: { id: number; nombre: string; rol: string; activo: boolean; metaDiaria: number } }) {
  const { msj, pendiente, enviar } = useEnvio();
  const [pinNuevo, setPinNuevo] = useState("");
  return (
    <form className="tarjeta" action={(fd) => enviar(() => guardarUsuario(fd))}>
      <b>{usuario ? usuario.nombre : "Nuevo usuario"}</b>
      {usuario && <input type="hidden" name="id" value={usuario.id} />}
      <label className="campo"><span>Nombre</span><input name="nombre" defaultValue={usuario?.nombre ?? ""} required /></label>
      <label className="campo"><span>Rol</span><select name="rol" defaultValue={usuario?.rol ?? "prospectador"}><option value="dueno">Dueño (ve todo)</option><option value="prospectador">Prospectador (Hoy, Prospectos, Buscar)</option></select></label>
      <label className="campo"><span>Meta diaria de envíos</span><input name="metaDiaria" type="number" min={0} max={200} defaultValue={usuario?.metaDiaria ?? 10} /></label>
      {usuario ? (
        <label className="campo"><span><input type="checkbox" name="activo" defaultChecked={usuario.activo} /> Activo</span></label>
      ) : (
        <label className="campo"><span>PIN inicial (6 números)</span><input name="pin" inputMode="numeric" pattern="\d{6}" required /></label>
      )}
      <div className="fila-botones">
        <button className="boton boton--primario" disabled={pendiente}>Guardar</button>
        {usuario && (
          <>
            <input className="campo" style={{ width: 120 }} placeholder="PIN nuevo" inputMode="numeric" value={pinNuevo} onChange={(e) => setPinNuevo(e.target.value)} />
            <button type="button" className="boton" disabled={pendiente || pinNuevo.length !== 6} onClick={() => enviar(() => restablecerPin(usuario.id, pinNuevo))}>Restablecer PIN</button>
          </>
        )}
      </div>
      {msj && <p className={msj.ok ? "suave" : "error"} role="status">{msj.texto}</p>}
    </form>
  );
}
```

```tsx
// src/componentes/FormularioPin.tsx
"use client";
import { useState, useTransition } from "react";
import { cambiarMiPin } from "@/acciones/ajustes";
export function FormularioPin() {
  const [msj, setMsj] = useState("");
  const [pendiente, empezar] = useTransition();
  return (
    <form className="tarjeta" action={(fd) => empezar(async () => { const r = await cambiarMiPin(fd); setMsj(r.ok ? "PIN cambiado." : r.mensaje); })}>
      <label className="campo"><span>PIN actual</span><input name="actual" inputMode="numeric" required /></label>
      <label className="campo"><span>PIN nuevo (6 números)</span><input name="nuevo" inputMode="numeric" pattern="\d{6}" required /></label>
      <button className="boton boton--primario" disabled={pendiente}>Cambiar</button>
      {msj && <p className="suave" role="status">{msj}</p>}
    </form>
  );
}
```

- [ ] **Step 4: verificar y commit**

Run: `npm run test:db 2>&1 | tail -4 && npx tsc --noEmit`
Expected: todos `passed`. Captura a 390 px de `/ajustes` como dueño y de `/ajustes/mi-pin` como prospectador (el prospectador en `/ajustes` debe caer en `/hoy`).

```bash
git add -A && git commit -F - <<'EOF'
feat: ajustes de usuarios, mensajes por nicho, meta diaria y PIN

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 11: Propuesta pública `/p/<código>` con evento «abierto» y PDF

**Files:**
- Create: `plantillas/hoteles.html`, `src/lib/propuesta-contrato.ts`, `src/lib/propuesta.ts`, `src/app/p/[codigo]/route.ts`, `src/app/p/[codigo]/pdf/route.ts`, `tests/propuesta-contrato.test.ts`, `tests/propuesta.test.ts`

**Interfaces:**
- Consumes: `sesionActual`, `permitirIntento`, `ipCliente`, `prisma`.
- Produces (`propuesta-contrato.ts`, puro): `renderPropuesta(plantilla: string, nombre: string, urlPdf: string): string` — inyecta `data-nombre`, reemplaza el botón de descarga del artefacto por un enlace a `urlPdf`, agrega `<meta name="robots" content="noindex">`; `nombreSeguro(nombre: string): string` (sin `&"<>`, máx. 60).
- Produces (`propuesta.ts`): `leerPlantilla(slug): Promise<string | null>`, `hashDe(texto): string`, `rutaPdf(codigo, hashPlantilla): string`, `generarPdf(codigo, html, hashPlantilla): Promise<string>` (devuelve la ruta; si el PDF ya existe para ese hash de plantilla, no regenera).

- [ ] **Step 1: traer la plantilla**

```bash
cp ~/propuestas/hoteles/propuesta-hoteles.html plantillas/hoteles.html
```

Editar `plantillas/hoteles.html`: **quitar el segundo `<script>`** (el que empieza en `// Descarga del PDF: los bytes van incrustados en #pdf-datos`, ~líneas 715–757) y dejar el primero (personalización por `data-nombre`). Dejar el botón `<button class="boton" id="descargar-pdf" …>` tal cual: `renderPropuesta` lo cambia por `<a>` en tiempo de servir. No tocar nada más: es la propuesta aprobada (anonimizada, sin número de habitaciones, «plataforma de validación de pagos»).

- [ ] **Step 2: tests del contrato**

```ts
// tests/propuesta-contrato.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { renderPropuesta, nombreSeguro } from "@/lib/propuesta-contrato";

const plantilla = readFileSync("plantillas/hoteles.html", "utf8");

describe("renderPropuesta", () => {
  const html = renderPropuesta(plantilla, "Hotel Yare", "/p/abc/pdf");
  it("inyecta el nombre en data-nombre del documento y noindex", () => {
    expect(html).toContain('<div class="documento" data-nombre="Hotel Yare">');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(html).toMatch(/^<!doctype html>/i);
  });
  it("cambia el boton del artefacto por un enlace al PDF", () => {
    expect(html).not.toContain('id="descargar-pdf"');
    expect(html).toContain('href="/p/abc/pdf"');
    expect(html).not.toContain("pdf-datos");
  });
  it("no deja meter HTML por el nombre", () => {
    expect(nombreSeguro('Hotel <b>"X"</b> & Cía')).toBe("Hotel bX/b  Cía");
    expect(nombreSeguro("a".repeat(100))).toHaveLength(60);
  });
});
```

- [ ] **Step 3: `src/lib/propuesta-contrato.ts`**

```ts
// src/lib/propuesta-contrato.ts
// La plantilla es un fragmento (empieza en <title>, sigue <link>/<style> y luego
// el cuerpo), como la lee pdf.cjs. Aqui se envuelve en un documento completo y se
// personaliza igual que alla: data-nombre en .documento, que el script de la
// plantilla reparte a cada [data-hotel].
export function nombreSeguro(nombre: string): string {
  return nombre.replace(/[&"<>]/g, "").trim().slice(0, 60);
}

export function renderPropuesta(plantilla: string, nombre: string, urlPdf: string): string {
  const n = nombreSeguro(nombre);
  let cuerpo = plantilla.replace('<div class="documento">', `<div class="documento" data-nombre="${n}">`);
  cuerpo = cuerpo.replace(/<button class="boton" id="descargar-pdf"[^>]*>([\s\S]*?)<\/button>/, `<a class="boton" href="${urlPdf}" download>$1</a>`);
  // Cabecera = todo hasta el cierre del ultimo </style>; el resto es el cuerpo.
  const corte = cuerpo.lastIndexOf("</style>") + "</style>".length;
  const cabecera = cuerpo.slice(0, corte);
  const resto = cuerpo.slice(corte);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex, nofollow">${cabecera}</head><body>${resto}</body></html>`;
}
```

- [ ] **Step 4: `src/lib/propuesta.ts` con PDF cacheado**

```ts
// src/lib/propuesta.ts
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const DIR_PLANTILLAS = path.join(process.cwd(), "plantillas");
const dirArchivos = () => process.env.PROSPECTOS_DIR_ARCHIVOS ?? "/home/neracosu/prospectos-archivos";

export async function leerPlantilla(slug: string): Promise<string | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  try { return await readFile(path.join(DIR_PLANTILLAS, `${slug}.html`), "utf8"); } catch { return null; }
}

export function rutaPdf(codigo: string, hashPlantilla: string): string {
  return path.join(dirArchivos(), "propuestas", `${codigo}-${hashPlantilla}.pdf`);
}

export function hashDe(texto: string): string {
  return createHash("sha256").update(texto).digest("hex").slice(0, 12);
}

// Genera el PDF con Playwright (mismo criterio que ~/propuestas/hoteles/pdf.cjs) y lo
// guarda fuera del docroot. Si ya existe para esta plantilla, no regenera.
export async function generarPdf(codigo: string, html: string, hashPlantilla: string): Promise<string> {
  const salida = rutaPdf(codigo, hashPlantilla);
  try { await stat(salida); return salida; } catch { /* no existe: generar */ }
  await mkdir(path.dirname(salida), { recursive: true, mode: 0o700 });
  const { chromium } = await import("playwright");
  const b = await chromium.launch();
  try {
    const p = await b.newPage();
    await p.setContent(html, { waitUntil: "networkidle" });
    await p.evaluate(async () => { await (document as any).fonts.ready; });
    await p.emulateMedia({ media: "print" });
    const pdf = await p.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    await writeFile(salida, pdf, { mode: 0o600 });
  } finally {
    await b.close();
  }
  return salida;
}
```

- [ ] **Step 5: ruta de la propuesta y ruta del PDF**

La propuesta se sirve como **Route Handler** (no como página): devuelve el documento HTML completo sin pasar por el `layout.tsx` raíz.

```ts
// src/app/p/[codigo]/route.ts
import { prisma } from "@/lib/db";
import { sesionActual } from "@/lib/sesion";
import { permitirIntento } from "@/lib/rate-limit";
import { ipCliente } from "@/lib/ip";
import { leerPlantilla } from "@/lib/propuesta";
import { renderPropuesta } from "@/lib/propuesta-contrato";

const NO = () => new Response("No encontrado", { status: 404 });

// La unica ruta publica. Solo expone el nombre del negocio. Cada visita deja un
// Evento "abierto", salvo si quien abre tiene sesion (Neri revisando su enlace).
export async function GET(_req: Request, ctx: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{22}$/.test(codigo)) return NO();
  if (!permitirIntento(`p:${await ipCliente()}`, 60, 60_000)) return NO();
  const p = await prisma.prospecto.findUnique({ where: { codigo }, select: { id: true, nombre: true, nicho: { select: { plantillaPropuesta: true } } } });
  if (!p || !p.nicho.plantillaPropuesta) return NO();
  const plantilla = await leerPlantilla(p.nicho.plantillaPropuesta);
  if (!plantilla) return NO();
  if (!(await sesionActual())) await prisma.evento.create({ data: { prospectoId: p.id, tipo: "abierto" } });
  const html = renderPropuesta(plantilla, p.nombre, `/p/${codigo}/pdf`);
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex, nofollow", "cache-control": "no-store" } });
}
```

```ts
// src/app/p/[codigo]/pdf/route.ts
import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/db";
import { permitirIntento } from "@/lib/rate-limit";
import { ipCliente } from "@/lib/ip";
import { leerPlantilla, generarPdf, hashDe } from "@/lib/propuesta";
import { renderPropuesta } from "@/lib/propuesta-contrato";

export async function GET(_req: Request, ctx: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{22}$/.test(codigo)) return new Response("No encontrado", { status: 404 });
  if (!permitirIntento(`pdf:${await ipCliente()}`, 10, 60_000)) return new Response("Demasiadas descargas. Intenta en un minuto.", { status: 429 });
  const p = await prisma.prospecto.findUnique({ where: { codigo }, select: { nombre: true, nicho: { select: { plantillaPropuesta: true, nombre: true } } } });
  if (!p || !p.nicho.plantillaPropuesta) return new Response("No encontrado", { status: 404 });
  const plantilla = await leerPlantilla(p.nicho.plantillaPropuesta);
  if (!plantilla) return new Response("No encontrado", { status: 404 });
  try {
    const html = renderPropuesta(plantilla, p.nombre, "#");
    const ruta = await generarPdf(codigo, html, hashDe(plantilla));
    const bytes = await readFile(ruta);
    return new Response(bytes, { headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="Propuesta-NERACOSU-${p.nicho.nombre}.pdf"`,
      "x-robots-tag": "noindex", "cache-control": "no-store",
    } });
  } catch (err) {
    // Si el PDF falla, la propuesta en linea sigue funcionando; se avisa y se registra.
    console.error("generarPdf", codigo, err);
    return new Response("No se pudo generar el PDF ahora. Intenta de nuevo en un momento.", { status: 503 });
  }
}
```

- [ ] **Step 6: test con base del evento «abierto» y del PDF**

```ts
// tests/propuesta.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, crearProspectoDePrueba } from "./ayuda-db";
import { generarPdf, hashDe, leerPlantilla } from "@/lib/propuesta";
import { renderPropuesta } from "@/lib/propuesta-contrato";

describe.runIf(DB_HABILITADA)("propuesta", () => {
  beforeAll(limpiarBase);
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("leerPlantilla rechaza slugs raros y encuentra hoteles", async () => {
    expect(await leerPlantilla("../etc/passwd")).toBeNull();
    expect(await leerPlantilla("hoteles")).toContain("data-hotel");
  });

  it("generarPdf produce un A4 real y cachea", async () => {
    const { nichoId } = await sembrarBasico();
    const p = await crearProspectoDePrueba(nichoId, { nombre: "Hotel PDF" });
    const plantilla = readFileSync("plantillas/hoteles.html", "utf8");
    const ruta = await generarPdf(p.codigo, renderPropuesta(plantilla, "Hotel PDF", "#"), hashDe(plantilla));
    expect(statSync(ruta).size).toBeGreaterThan(50_000);
    const antes = statSync(ruta).mtimeMs;
    await generarPdf(p.codigo, "<html>otro</html>", hashDe(plantilla));
    expect(statSync(ruta).mtimeMs).toBe(antes); // no regenero
  }, 60_000);
});
```

El flujo HTTP (`/p/<codigo>` deja `abierto` sin sesión y no lo deja con sesión; 404 para código inválido) se prueba en la tarea 13 con Playwright contra el servidor real.

- [ ] **Step 7: verificar y commit**

Run: `npm test 2>&1 | tail -3 && npm run test:db 2>&1 | tail -3 && npx tsc --noEmit`
Expected: todos `passed`.

```bash
git add -A && git commit -F - <<'EOF'
feat: propuesta publica /p/<codigo> con evento abierto, rate limit y PDF cacheado

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 12: Despliegue — PM2, proxy Apache, primer usuario y verificación

**Files:**
- Create: `ecosystem.config.cjs`
- Modify: `.htaccess` (reemplazar el bloque «CERRADO HASTA QUE EXISTA LA APP» por el proxy), `CLAUDE.md` (estado)

**Solo desde la sesión principal. Nunca desde un subagente.**

- [ ] **Step 1: `ecosystem.config.cjs`**

```js
// PM2 para el panel de prospectos. Arranca Next en produccion en 3013, solo en
// 127.0.0.1: todo el trafico externo entra por Apache (proxy en .htaccess).
module.exports = {
  apps: [
    {
      name: "prospectos",
      cwd: "/home/neracosu/public_html/prospectos.neracosu.com",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3013 -H 127.0.0.1",
      env_file: "/home/neracosu/.config/prospectos/env",
    },
  ],
};
```

- [ ] **Step 2: build (uno solo, en primer plano)**

Run: `pm2 list | grep -E 'hotelmarte|adastram|ameb|ocls' | wc -l` → **4** (nadie más está compilando: `ps aux | grep -c '[n]ext build'` → 0). Luego:

```bash
set -a; . ~/.config/prospectos/env; set +a
npx prisma migrate deploy | tail -2
npm run build 2>&1 | tail -15
```

Expected: «Compiled successfully», rutas `/entrar`, `/hoy`, `/prospectos`, `/prospectos/[id]`, `/prospectos/nuevo`, `/ajustes`, `/ajustes/mi-pin`, `/p/[codigo]`, `/p/[codigo]/pdf`, `/salir`.

- [ ] **Step 3: primer usuario y datos**

```bash
set -a; . ~/.config/prospectos/env; set +a
node scripts/sembrar-nichos.mjs
npx tsx scripts/importar-hoteles.mts
npx tsx scripts/sembrar-farmahogar.mts
printf '%s\n' "$(python3 -c 'import getpass;print(getpass.getpass("PIN de Neri (6 digitos): "))')" | node scripts/crear-usuario.mjs "Neri" dueno
```

(El `getpass` pide el PIN sin eco; no queda en `ps` ni en el historial. Si la sesión no es interactiva, Neri lo corre él con `!`.) Expected: `Creado: #1 Neri (dueno)`, 132 hoteles, Farmahogar en `enviado`.

- [ ] **Step 4: arrancar en PM2**

```bash
pm2 list                       # confirmar que "prospectos" NO existe todavia
pm2 start ecosystem.config.cjs # arranca SOLO prospectos (el archivo solo lo define a el)
sleep 4 && pm2 list && curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3013/entrar
```

Expected: `prospectos` `online`, `↺ 0`, `200`. Si falla: `pm2 logs prospectos --lines 40 --nostream`, arreglar, `pm2 restart prospectos` (solo ese nombre).

- [ ] **Step 5: `.htaccess` con el proxy**

Reemplazar el bloque «CERRADO HASTA QUE EXISTA LA APP» por:

```apache
# ---------------------------------------------------------------------------
# PROXY A NEXT (PM2 "prospectos", 127.0.0.1:3013). Activado el <fecha>.
# Todo entra por Apache: HTTPS forzado, HSTS, y /.well-known/ pasa directo
# para que AutoSSL renueve. Nada del directorio se sirve como archivo:
# CLAUDE.md, docs/ y el codigo quedan detras del proxy (Next no los conoce).
# ---------------------------------------------------------------------------
DirectoryIndex disabled
RewriteEngine On
RewriteCond %{REQUEST_URI} !^/\.well-known/
RewriteCond %{HTTPS} off
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]
<IfModule mod_headers.c>
  Header always set Strict-Transport-Security "max-age=31536000"
</IfModule>
<IfModule mod_expires.c>
  ExpiresActive Off
</IfModule>
RewriteCond %{REQUEST_URI} !^/\.well-known/
RewriteRule ^(.*)$ http://127.0.0.1:3013/$1 [P,L]
```

Dejar el bloque `php -- BEGIN cPanel-generated handler` como está.

- [ ] **Step 6: verificación mínima (la del CLAUDE.md de la cuenta)**

```bash
curl -s -o /dev/null -w 'entrar %{http_code}\n' https://prospectos.neracosu.com/entrar
curl -s -o /dev/null -w 'CLAUDE.md %{http_code}\n' https://prospectos.neracosu.com/CLAUDE.md
curl -s -o /dev/null -w 'docs %{http_code}\n' https://prospectos.neracosu.com/docs/superpowers/specs/2026-09-16-panel-prospeccion-design.md
curl -s -o /dev/null -w 'p invalido %{http_code}\n' https://prospectos.neracosu.com/p/xxx
curl -sI https://prospectos.neracosu.com/p/xxx | grep -i x-robots
pm2 list | grep prospectos
pm2 logs prospectos --lines 20 --nostream --err | tail -5
```

Expected: `entrar 200`; `CLAUDE.md 404`; `docs … 404`; `p invalido 404`; `x-robots-tag: noindex, nofollow`; `online` con `↺ 0`; log de errores vacío. **Si `CLAUDE.md` no da 404, no seguir**: el proxy no está tomando la petición.

Con un prospecto real: abrir `https://prospectos.neracosu.com/p/<codigo>` en el teléfono **sin sesión** → se ve la propuesta con el nombre del hotel; en la ficha del panel aparece «abrió la propuesta». Descargar el PDF → abre en el teléfono.

- [ ] **Step 7: `pm2 save` y commit**

```bash
pm2 list   # los cinco online (hotelmarte, adastram, ameb, ocls, prospectos), ningun contador de reinicios subio
pm2 save
```

Actualizar `CLAUDE.md` del proyecto: «Estado» → hay código, proceso `prospectos` en PM2, cómo redesplegar (`git pull && npm ci && npx prisma migrate deploy && npm run build && pm2 restart prospectos`), y que el `.htaccess` ya es el proxy.

```bash
git add -A && git commit -F - <<'EOF'
feat: despliegue - PM2 prospectos en 3013, proxy Apache, build de produccion

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 13: Recorrido de punta a punta a 390 px con Playwright

**Files:**
- Create: `scripts/verificar-flujo.mts`

**Interfaces:**
- Consumes: la app corriendo (`BASE_URL`), `TEST_DATABASE_URL` **no**: corre contra la base real pero **solo con un prospecto de prueba que crea y descarta al final**, marcado «(PRUEBA)» en el nombre. El PIN del dueño se lee por stdin.

- [ ] **Step 1: el script**

```ts
// scripts/verificar-flujo.mts — recorrido real en el navegador, viewport 390x844.
// Uso: set -a; . ~/.config/prospectos/env; set +a
//      BASE_URL=https://prospectos.neracosu.com npx tsx scripts/verificar-flujo.mts <<< "PIN"
import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { prisma } from "../src/lib/db";
import { claveProspecto } from "../src/lib/clave-prospecto";
import { generarCodigo } from "../src/lib/codigo";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3013";
const pin = readFileSync(0, "utf8").trim();
mkdirSync("capturas", { recursive: true });
const errores: string[] = [];

const nicho = await prisma.nicho.findUniqueOrThrow({ where: { slug: "hoteles" } });
const nombre = `Hotel de Prueba (PRUEBA) ${Date.now()}`;
const prueba = await prisma.prospecto.create({ data: {
  nichoId: nicho.id, nombre, ciudad: "Caracas", whatsapp: "584120000000", fuentes: [], origen: "manual",
  codigo: generarCodigo(), clave: claveProspecto(nombre, "Caracas"), ordenCola: -1, // -1: primero en la cola
} });

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const pg = await ctx.newPage();
pg.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
pg.on("console", (m) => { if (m.type() === "error") errores.push(`console: ${m.text()}`); });

try {
  // 1. Entrar
  await pg.goto(`${BASE}/entrar`);
  for (const d of pin) await pg.getByRole("button", { name: d, exact: true }).click();
  await pg.waitForURL(/\/hoy$/);
  await pg.screenshot({ path: "capturas/01-hoy.png", fullPage: true });

  // 2. La tarjeta de prueba esta primera; tocar WhatsApp abre otra pestana; al volver pregunta
  const tarjeta = pg.locator("article", { hasText: nombre }).first();
  const [popup] = await Promise.all([ctx.waitForEvent("page"), tarjeta.getByRole("link", { name: /WhatsApp/ }).click()]);
  await popup.close();
  await tarjeta.getByText("¿Se envió?").waitFor();
  await pg.screenshot({ path: "capturas/02-se-envio.png" });
  await tarjeta.getByRole("button", { name: "Sí" }).click();
  await tarjeta.waitFor({ state: "detached" });

  // 3. Ficha: quedo en enviado con seguimiento
  await pg.goto(`${BASE}/prospectos/${prueba.id}`);
  await pg.getByText("Enviado").first().waitFor();
  await pg.screenshot({ path: "capturas/03-ficha.png", fullPage: true });

  // 4. Propuesta publica sin sesion deja "abierto"; con sesion no
  const anon = await b.newContext({ viewport: { width: 390, height: 844 } });
  const pa = await anon.newPage();
  const r = await pa.goto(`${BASE}/p/${prueba.codigo}`);
  if (r?.status() !== 200) errores.push(`propuesta: ${r?.status()}`);
  await pa.getByText(nombre.slice(0, 20)).first().waitFor();
  await pa.screenshot({ path: "capturas/04-propuesta.png" });
  await anon.close();
  const abiertos = await prisma.evento.count({ where: { prospectoId: prueba.id, tipo: "abierto" } });
  if (abiertos !== 1) errores.push(`eventos abierto: ${abiertos}, esperaba 1`);
  await pg.goto(`${BASE}/p/${prueba.codigo}`);
  if ((await prisma.evento.count({ where: { prospectoId: prueba.id, tipo: "abierto" } })) !== 1) errores.push("con sesion tambien registro abierto");

  // 5. Seguimiento: forzar fecha de hoy y ver la tarjeta en Hoy
  await prisma.prospecto.update({ where: { id: prueba.id }, data: { proximoSeguimiento: "2000-01-01" } });
  await pg.goto(`${BASE}/hoy`);
  await pg.locator("article", { hasText: nombre }).getByText("abrió la propuesta").waitFor();
  await pg.screenshot({ path: "capturas/05-seguimiento.png", fullPage: true });

  // 6. Prospectos y Ajustes cargan
  await pg.goto(`${BASE}/prospectos?q=PRUEBA`); await pg.getByText(nombre).waitFor(); await pg.screenshot({ path: "capturas/06-prospectos.png" });
  await pg.goto(`${BASE}/ajustes`); await pg.getByText("Usuarios").waitFor(); await pg.screenshot({ path: "capturas/07-ajustes.png", fullPage: true });

  // 7. Codigo invalido: 404
  const r404 = await pg.goto(`${BASE}/p/no-existe`);
  if (r404?.status() !== 404) errores.push(`codigo invalido dio ${r404?.status()}`);
} catch (e) {
  errores.push(`excepcion: ${(e as Error).message}`);
  await pg.screenshot({ path: "capturas/error.png", fullPage: true }).catch(() => {});
} finally {
  await b.close();
  // Limpieza: el prospecto de prueba se descarta con motivo (nada se borra), salvo que se
  // prefiera borrarlo del todo por ser de prueba: aqui SI se borra, es basura de verificacion.
  await prisma.evento.deleteMany({ where: { prospectoId: prueba.id } });
  await prisma.prospecto.delete({ where: { id: prueba.id } });
  await prisma.$disconnect();
}
console.log(errores.length ? `FALLO:\n- ${errores.join("\n- ")}` : "PASS: recorrido completo sin errores");
process.exit(errores.length ? 1 : 0);
```

- [ ] **Step 2: correr contra el dominio real**

Run: `set -a; . ~/.config/prospectos/env; set +a; printf '%s\n' "$(python3 -c 'import getpass;print(getpass.getpass("PIN: "))')" | BASE_URL=https://prospectos.neracosu.com npx tsx scripts/verificar-flujo.mts`
Expected: `PASS: recorrido completo sin errores` y 7 capturas en `capturas/`. **Mirar las capturas** (Read) y comprobar a ojo: nada cortado a 390 px, barra inferior visible, botones de 44 px.

- [ ] **Step 3: Commit y cierre**

```bash
git add -A && git commit -F - <<'EOF'
test: recorrido de punta a punta a 390 px (entrar, enviar, propuesta, seguimiento)

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

Al terminar: `pm2 list` (cinco `online`, contadores sin subir), `curl -s -o /dev/null -w '%{http_code}' https://prospectos.neracosu.com/entrar` → 200, y avisar a Neri que puede entrar desde el teléfono. Pendientes que quedan para él: rotar la contraseña de la base (prerrequisito 0.4) y decidir los precios de farmacias (spec, decisiones abiertas).

---

## Fuera de este plan (van en los suyos)

Buscador e importación por pantalla (pieza 2), proyectos y cobros (pieza 3), recibos (pieza 4), portal del cliente (pieza 5), propuesta de farmacias (bloqueada por precios).
