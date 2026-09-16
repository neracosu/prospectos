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
│   ├── importar-hoteles.mjs           ← los 3 JSON de ~/propuestas/hoteles/prospectos/fuentes/
│   ├── sembrar-farmahogar.mjs         ← Farmahogar en `enviado` con fecha 2026-09-15
│   └── verificar-flujo.mjs            ← Playwright a 390 px, punta a punta
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
│   └── p/[codigo]/page.tsx · p/[codigo]/pdf/route.ts
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
