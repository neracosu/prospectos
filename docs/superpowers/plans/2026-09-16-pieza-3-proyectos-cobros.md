# Pieza 3 — Proyectos y cobros — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Neri lleve cada proyecto vendido hasta el cobro mensual desde el teléfono: clientes, proyectos con pago único o cuotas, mensualidades que se generan solas, cobros marcados a mano con canal, pendientes con % de avance, horas cotizadas vs. reales, y versiones SemVer con changelog pegado desde Markdown.

**Architecture:** Mismos cimientos de la pieza 1: Next.js 15 App Router + Server Actions, Prisma/MySQL, CSS plano. Nuevas tablas `Cliente`, `Proyecto`, `Cobro`, `Pendiente`, `Horas`, `Version`, `Cambio`; `Evento` se extiende con `proyectoId`/`cobroId`. Los contratos (estado de un cobro, cifras del mes, cuotas, qué mensualidad toca, SemVer, parser de changelog, % de avance, transiciones de proyecto) son módulos puros con tests; las escrituras van en `src/acciones/*.ts` con `updateMany` condicionado donde un doble toque duele. El cron de mensualidades vive **dentro de la app** (`src/instrumentation.ts`), se dispara al arrancar y cada día a las 06:00 de Caracas, y es idempotente.

**Tech Stack:** Node 20 · Next 15.5 · React 19 · Prisma 6.19 (`Decimal(10,2)` para dinero) · zod 4 · vitest 4 · playwright 1.62 · PM2 compartido.

**Spec:** `docs/superpowers/specs/2026-09-16-proyectos-cobros-design.md` (pieza 3) y `docs/superpowers/specs/2026-09-16-plataforma-vision-general.md` (roles, canales, reglas comunes). Leer los dos antes de cualquier tarea. El código de la pieza 1 está en `main` y es la referencia de estilo: `src/acciones/prospectos.ts` (acciones), `src/lib/prospectos.ts` (consultas), `tests/acciones-prospectos.test.ts` (mock de sesión), `src/componentes/FichaAcciones.tsx` (formularios cliente).

## Global Constraints

- **Solo `dueno`** entra a `/proyectos/*`, `/clientes/*` y a toda acción de esta pieza: `exigirRol("dueno")` **fuera del try/catch**. Un `prospectador` nunca ve montos (ni en Hoy, ni en Prospectos).
- **Toda función exportada de un módulo `"use server"` es pública**: zod en cada entrada, ningún auxiliar exportado, devuelve `Resultado`, nunca lanza (salvo `redirect`).
- **Nada se borra**: cobros se anulan con motivo; proyectos se cierran; clientes se quedan. Excepción explícita: un `Pendiente` (ítem de lista de tareas) sí se puede eliminar.
- **Dinero en `DECIMAL(10,2)`**, nunca `float`; en memoria se maneja como `number` con dos decimales redondeados por `redondear2`; los formularios lo reciben como texto `"1500"`/`"1500.50"` validado por zod.
- **Fechas de negocio** (`fechaInicio`, `vence`, `fecha` de horas y versiones, `fechaEstimada`) son texto ISO `YYYY-MM-DD` en día de Caracas, como en la pieza 1; los instantes (`pagadoEn`, `anuladoEn`, `hechoEn`, `avisadoEn`, `creadoEn`) son `DateTime`. «Hoy» y «este mes» salen de `hoyCaracas()`.
- **Marcar pagado** con `updateMany` condicionado a `pagadoEn IS NULL` y `anuladoEn IS NULL`: dos toques, un evento.
- **Recordar** no se dispara dos veces el mismo día de Caracas para el mismo cobro.
- **Mensualidades**: solo con proyecto `activo`, cuando faltan 7 días o menos para `diaCobroMensual`; idempotente por proyecto + mes; el cron mira 60 días atrás para recuperar días perdidos.
- **Una versión no se edita después de `avisadoEn`**; SemVer `MAYOR.MENOR.PARCHE`, única por proyecto.
- **% de avance** solo con pendientes `visibleCliente`; sin visibles → `null` («sin hitos publicados»), no 0.
- **Horas** mínimo 0.25, sin fecha futura; `TARIFA_HORA` viene de `Configuracion` (`tarifa_hora`, inicial `17`).
- Los precios de proyecto **viven en `neracosu.com/para/`**: el panel los copia en cada proyecto, no los define. Mensajes de cobro con `{cliente}`, `{proyecto}`, `{monto}`, `{concepto}`, `{vence}`, `{enlace}` (vacío hasta la pieza 5).
- **Tests contra `neracosu_prospectos_test`** (`npm run test:db`), `fileParallelism: false`; mock de sesión copiado de `tests/acciones-prospectos.test.ts` al **tope de cada archivo** de test de acciones.
- **Un build a la vez en el servidor**, solo desde la sesión principal; subagentes verifican con `npx tsc --noEmit`, `npm test`, `npm run test:db`. `pm2 list` antes de cualquier `start/restart/stop/delete/save`; el proceso es `prospectos`.
- Español (Venezuela), **tuteo** en el panel; los mensajes al cliente van de «usted»; comentarios de código sin acentos. Commits por heredoc terminados en `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Todo a **390 px** primero.

---

## Estructura de archivos

```
prisma/schema.prisma                      ← + Cliente, Proyecto, Cobro, Pendiente, Horas, Version, Cambio; Evento.proyectoId/cobroId
prisma/migrations/<fecha>_proyectos/
src/instrumentation.ts                    ← arranca el cron de mensualidades (solo runtime nodejs)
src/lib/
  dinero.ts                               ← redondear2, formatoUSD, esMontoTexto              (puro)
  cobros-contrato.ts                      ← ESTADOS_COBRO, estadoCobro, cifrasDelMes, generarCuotas, mesDe, mensualidadesQueTocan (puro)
  proyectos-contrato.ts                   ← ESTADOS_PROYECTO, puedePasarProyecto, ETIQUETA_ESTADO, porcentajeAvance, semaforo (puro)
  semver-contrato.ts                      ← esSemver, compararSemver, parsearChangelog, TIPOS_CAMBIO (puro)
  configuracion.ts                        ← leerConfig(clave, defecto), guardarConfig, CLAVES (base)
  clientes.ts                             ← crearClienteDesdeProspecto, listarClientes, fichaCliente (base)
  proyectos.ts                            ← listarProyectos, fichaProyecto, ganadosSinProyecto, resumenMes (base)
  mensualidades.ts                        ← generarMensualidades(hoy) idempotente + programarCron (base)
src/acciones/
  clientes.ts                             ← crearCliente, editarCliente
  proyectos.ts                            ← crearProyecto, cambiarEstadoProyecto, editarProyecto
  cobros.ts                               ← marcarPagado, anularCobro, agregarCobro, registrarRecordatorio
  pendientes.ts                           ← agregarPendiente, marcarPendiente, alternarVisible, moverPendiente, eliminarPendiente
  horas.ts                                ← registrarHoras, eliminarHoras
  versiones.ts                            ← publicarVersion, editarVersion, marcarAvisada
  ajustes.ts (modificar)                  ← guardarMensajesCobro, guardarDatosEmisor, guardarTarifa
src/componentes/
  Semaforo.tsx · Pestanas.tsx · EstadoProyecto.tsx
  FormularioProyecto.tsx · FormularioCliente.tsx
  TabCobros.tsx · TabPendientes.tsx · TabHoras.tsx · TabVersiones.tsx
  FormularioAjustesCobros.tsx
  FichaAcciones.tsx (modificar)           ← «¿Crear proyecto?» tras ganado
  BarraInferior.tsx (modificar)           ← Proyectos activo
src/app/(panel)/
  proyectos/page.tsx · proyectos/nuevo/page.tsx · proyectos/[id]/page.tsx
  clientes/page.tsx · clientes/[id]/page.tsx · clientes/nuevo/page.tsx
  hoy/page.tsx (modificar)                ← ganados sin proyecto con enlace
  ajustes/page.tsx (modificar)            ← mensajes de cobro, emisor, tarifa
tests/
  ayuda-db.ts (modificar)                 ← limpiarBase con las tablas nuevas; sembrarCliente, sembrarProyecto
  dinero.test.ts · cobros-contrato.test.ts · proyectos-contrato.test.ts · semver-contrato.test.ts
  clientes-proyectos.test.ts · cobros.test.ts · mensualidades.test.ts · pendientes-horas.test.ts · versiones.test.ts · ajustes-cobros.test.ts
scripts/verificar-flujo-proyectos.mts    ← Playwright a 390 px contra el dominio
```

**Convenciones que atraviesan todo:**

- `Evento` de proyecto: `prospectoId` pasa a opcional; `proyectoId` y `cobroId` opcionales. Tipos nuevos: `proyecto_creado`, `proyecto_estado`, `cobro_pagado`, `cobro_anulado`, `cobro_agregado`, `recordatorio`, `hito_cumplido`, `version_publicada`, `aviso_cliente`, `horas`.
- Montos: en la base `Prisma.Decimal`; al leer, `Number(x)`; al escribir, `new Prisma.Decimal(texto)`.
- Cada consulta de pantalla devuelve tipos planos (`ProyectoResumen`, `CobroFila`, …) definidos en el módulo que los produce; los componentes cliente importan solo `type`.
- Semáforo por proyecto: `rojo` si tiene cobro vencido, `amarillo` si vence en ≤ 7 días, `verde` si no.

---

### Task 1: Esquema — tablas de la pieza 3, migración y ayuda de tests

**Files:**
- Modify: `prisma/schema.prisma`, `tests/ayuda-db.ts`, `tests/esquema.test.ts`
- Create: `prisma/migrations/<fecha>_proyectos/` (la genera Prisma)

**Interfaces:**
- Produces: modelos `Cliente`, `Proyecto`, `Cobro`, `Pendiente`, `Horas`, `Version`, `Cambio`; `Evento.prospectoId?`, `Evento.proyectoId?`, `Evento.cobroId?`; en `tests/ayuda-db.ts`: `limpiarBase()` ampliado, `sembrarCliente(extra?)`, `sembrarProyecto(clienteId, nichoId, extra?)` → filas creadas.

- [ ] **Step 1: agregar al `prisma/schema.prisma`** (dejar lo existente; en `Evento` cambiar `prospectoId Int` por `prospectoId Int?` y `prospecto Prospecto?`, y añadir las dos relaciones)

```prisma
model Cliente {
  id             Int        @id @default(autoincrement())
  nombre         String
  contactoNombre String     @default("")
  whatsapp       String     @default("") // 58XXXXXXXXXX o vacio
  email          String     @default("")
  rif            String     @default("")
  instagram      String     @default("")
  facebook       String     @default("")
  tiktok         String     @default("")
  prospectoId    Int?       @unique
  prospecto      Prospecto? @relation(fields: [prospectoId], references: [id])
  // Para el portal (pieza 5): 16 bytes base64url. Se genera al crear el cliente.
  codigo         String     @unique
  creadoEn       DateTime   @default(now())
  proyectos      Proyecto[]
}

model Proyecto {
  id                   Int         @id @default(autoincrement())
  clienteId            Int
  cliente              Cliente     @relation(fields: [clienteId], references: [id])
  nombre               String
  nichoId              Int
  nicho                Nicho       @relation(fields: [nichoId], references: [id])
  pagoUnico            Decimal     @db.Decimal(10, 2)
  mensualidad          Decimal     @db.Decimal(10, 2)
  horasCotizadas       Decimal     @default(0) @db.Decimal(8, 2)
  // Fechas de negocio: texto ISO YYYY-MM-DD en dia de Caracas (como Prospecto.proximoSeguimiento)
  fechaInicio          String
  fechaEntregaEstimada String?
  fechaEntregaReal     String?
  // en_construccion -> entregado -> activo -> pausado | cerrado
  estado               String      @default("en_construccion")
  diaCobroMensual      Int         @default(1)
  propuestaCodigo      String      @default("")
  creadoEn             DateTime    @default(now())
  cobros               Cobro[]
  pendientes           Pendiente[]
  horas                Horas[]
  versiones            Version[]
  eventos              Evento[]

  @@index([estado])
}

model Cobro {
  id               Int       @id @default(autoincrement())
  proyectoId       Int
  proyecto         Proyecto  @relation(fields: [proyectoId], references: [id])
  // pago_unico | cuota | mensualidad | extra
  concepto         String
  detalle          String    @default("")
  monto            Decimal   @db.Decimal(10, 2)
  moneda           String    @default("USD")
  vence            String    // YYYY-MM-DD
  pagadoEn         DateTime?
  // zelle | pago_movil | efectivo | binance | transferencia | otro
  canal            String    @default("")
  referencia       String    @default("")
  nota             String    @default("") @db.Text
  anuladoEn        DateTime?
  anuladoMotivo    String    @default("")
  // Mensualidad: "YYYY-MM" del mes que cubre; unico por proyecto (idempotencia del cron)
  mes              String?
  reciboNumero     String    @default("")
  reciboGeneradoEn DateTime?
  creadoEn         DateTime  @default(now())
  eventos          Evento[]

  @@unique([proyectoId, mes])
  @@index([proyectoId, vence])
  @@index([vence, pagadoEn])
}

model Pendiente {
  id             Int       @id @default(autoincrement())
  proyectoId     Int
  proyecto       Proyecto  @relation(fields: [proyectoId], references: [id])
  texto          String
  hecho          Boolean   @default(false)
  hechoEn        DateTime?
  visibleCliente Boolean   @default(false)
  orden          Int       @default(0)
  fechaEstimada  String?
  creadoEn       DateTime  @default(now())

  @@index([proyectoId, orden])
}

model Horas {
  id          Int      @id @default(autoincrement())
  proyectoId  Int
  proyecto    Proyecto @relation(fields: [proyectoId], references: [id])
  fecha       String   // YYYY-MM-DD
  horas       Decimal  @db.Decimal(6, 2)
  descripcion String   @default("")
  usuarioId   Int?
  usuario     Usuario? @relation(fields: [usuarioId], references: [id])
  creadoEn    DateTime @default(now())

  @@index([proyectoId, fecha])
}

model Version {
  id         Int       @id @default(autoincrement())
  proyectoId Int
  proyecto   Proyecto  @relation(fields: [proyectoId], references: [id])
  version    String    // MAYOR.MENOR.PARCHE
  fecha      String    // YYYY-MM-DD
  avisadoEn  DateTime?
  creadoEn   DateTime  @default(now())
  cambios    Cambio[]

  @@unique([proyectoId, version])
}

model Cambio {
  id        Int     @id @default(autoincrement())
  versionId Int
  version   Version @relation(fields: [versionId], references: [id])
  // nuevo | mejora | arreglo
  tipo      String
  texto     String
  orden     Int     @default(0)
}
```

Y en los modelos existentes:

```prisma
// Evento: prospectoId pasa a opcional y se agregan proyecto/cobro
  prospectoId Int?
  prospecto   Prospecto? @relation(fields: [prospectoId], references: [id])
  proyectoId  Int?
  proyecto    Proyecto?  @relation(fields: [proyectoId], references: [id])
  cobroId     Int?
  cobro       Cobro?     @relation(fields: [cobroId], references: [id])
  // tipos nuevos: proyecto_creado | proyecto_estado | cobro_pagado | cobro_anulado | cobro_agregado |
  // recordatorio | hito_cumplido | version_publicada | aviso_cliente | horas
  @@index([proyectoId, creadoEn])
// Usuario: + horas Horas[]
// Nicho:   + proyectos Proyecto[]
// Prospecto: + cliente Cliente?
```

- [ ] **Step 2: migrar la base real y la de tests**

Run: `set -a; . /home/neracosu/.config/prospectos/env; set +a; npx prisma migrate dev --name proyectos 2>&1 | tail -4 && npx prisma generate | tail -1 && DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy | tail -2`
Expected: una migración nueva aplicada en las dos bases. Prisma avisará que `Evento.prospectoId` pasa a nullable: es lo esperado, sin pérdida de datos.

- [ ] **Step 3: ampliar `tests/ayuda-db.ts`**

```ts
// limpiarBase: agregar ANTES de evento.deleteMany() nada; el orden completo queda asi
export async function limpiarBase(): Promise<void> {
  await prisma.evento.deleteMany();
  await prisma.cambio.deleteMany();
  await prisma.version.deleteMany();
  await prisma.horas.deleteMany();
  await prisma.pendiente.deleteMany();
  await prisma.cobro.deleteMany();
  await prisma.proyecto.deleteMany();
  await prisma.cliente.deleteMany();
  await prisma.prospecto.deleteMany();
  await prisma.nicho.deleteMany();
  await prisma.usuario.deleteMany();
  await prisma.configuracion.deleteMany();
}

export async function sembrarCliente(extra: Partial<{ nombre: string; whatsapp: string; rif: string; prospectoId: number }> = {}) {
  return prisma.cliente.create({
    data: { nombre: extra.nombre ?? `Cliente Prueba ${Math.random().toString(36).slice(2, 7)}`, whatsapp: extra.whatsapp ?? "584120000000", rif: extra.rif ?? "J-12345678-9",
      prospectoId: extra.prospectoId, codigo: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) },
  });
}

export async function sembrarProyecto(clienteId: number, nichoId: number, extra: Partial<{ nombre: string; estado: string; pagoUnico: string; mensualidad: string; horasCotizadas: string; fechaInicio: string; diaCobroMensual: number }> = {}) {
  return prisma.proyecto.create({
    data: { clienteId, nichoId, nombre: extra.nombre ?? "PMS Hotel", estado: extra.estado ?? "en_construccion",
      pagoUnico: extra.pagoUnico ?? "2800.00", mensualidad: extra.mensualidad ?? "100.00", horasCotizadas: extra.horasCotizadas ?? "160",
      fechaInicio: extra.fechaInicio ?? "2026-09-01", diaCobroMensual: extra.diaCobroMensual ?? 5 },
  });
}
```

- [ ] **Step 4: test de esquema** (agregar a `tests/esquema.test.ts`)

```ts
  it("una mensualidad es unica por proyecto y mes; un cliente por prospecto", async () => {
    const { nichoId } = await sembrarBasico();
    const c = await sembrarCliente();
    const p = await sembrarProyecto(c.id, nichoId);
    await prisma.cobro.create({ data: { proyectoId: p.id, concepto: "mensualidad", monto: "100.00", vence: "2026-10-05", mes: "2026-10" } });
    await expect(prisma.cobro.create({ data: { proyectoId: p.id, concepto: "mensualidad", monto: "100.00", vence: "2026-10-05", mes: "2026-10" } })).rejects.toThrow(/Unique/);
    const pr = await crearProspectoDePrueba(nichoId);
    await sembrarCliente({ prospectoId: pr.id });
    await expect(sembrarCliente({ prospectoId: pr.id })).rejects.toThrow(/Unique/);
    // Un evento de proyecto no necesita prospecto
    await prisma.evento.create({ data: { proyectoId: p.id, tipo: "proyecto_creado" } });
  });
```

Run: `npm run test:db 2>&1 | tail -4 && npx tsc --noEmit`
Expected: todo `passed` (los tests de la pieza 1 siguen verdes: `limpiarBase` borra en el orden correcto).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -F - <<'EOF'
feat(proyectos): esquema de clientes, proyectos, cobros, pendientes, horas y versiones

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 2: Contratos puros — dinero, estado de cobro, cifras del mes, cuotas y mensualidades

**Files:**
- Create: `src/lib/dinero.ts`, `src/lib/cobros-contrato.ts`, `tests/dinero.test.ts`, `tests/cobros-contrato.test.ts`

**Interfaces:**
- Consumes: `sumarDias`, `esFechaIso` de `@/lib/fecha-caracas`.
- Produces (`dinero.ts`): `redondear2(n: number): number`, `formatoUSD(n: number): string` («$1.500,00»), `MONTO_TEXTO = /^\d{1,8}([.,]\d{1,2})?$/`, `montoDesdeTexto(s: string): number | null`.
- Produces (`cobros-contrato.ts`):
  - `type EstadoCobro = "pagado" | "anulado" | "vencido" | "por_vencer" | "pendiente"`, `ETIQUETA_COBRO`.
  - `estadoCobro(c: { vence: string; pagadoEn: Date | null; anuladoEn: Date | null }, hoy: string): EstadoCobro` (por vencer = `vence` en `[hoy, hoy+7]`).
  - `mesDe(fecha: string): string` → `"YYYY-MM"`.
  - `cifrasDelMes(cobros: { monto: number; vence: string; pagadoEn: Date | null; anuladoEn: Date | null }[], mes: string, hoy: string): { cobrado: number; vencido: number; porCobrar: number }` — `cobrado` = pagados cuyo `pagadoEn` cae en ese mes (Caracas); `vencido` = no pagados, no anulados, `vence < hoy` (de cualquier mes: lo vencido se arrastra); `porCobrar` = no pagados, no anulados, `vence >= hoy` y `mesDe(vence) === mes`.
  - `generarCuotas(total: number, n: number, primera: string, cadaDias?: number): { detalle: string; monto: number; vence: string }[]` — partes iguales a 2 decimales, la última absorbe el redondeo; `cadaDias` por defecto 30.
  - `venceMensualidad(mes: string, dia: number): string` — `dia` 1–28.
  - `mensualidadesQueTocan(p: { estado: string; diaCobroMensual: number; fechaInicio: string }, hoy: string, existentes: string[]): { mes: string; vence: string }[]` — meses cuyo vencimiento cae en `[hoy − 60, hoy + 7]`, no anteriores a `fechaInicio`, no en `existentes`, solo si `estado === "activo"`.
  - `CANALES_COBRO`, `type CanalCobro`, `ETIQUETA_CANAL_COBRO`, `CONCEPTOS`, `type Concepto`, `ETIQUETA_CONCEPTO`.

- [ ] **Step 1: tests**

```ts
// tests/dinero.test.ts
import { describe, it, expect } from "vitest";
import { redondear2, formatoUSD, montoDesdeTexto } from "@/lib/dinero";

describe("dinero", () => {
  it("redondea a 2 decimales sin errores binarios", () => {
    expect(redondear2(1.005)).toBe(1.01);
    expect(redondear2(2800 / 3)).toBe(933.33);
  });
  it("formatea al estilo venezolano", () => {
    expect(formatoUSD(1500)).toBe("$1.500,00");
    expect(formatoUSD(0.5)).toBe("$0,50");
    expect(formatoUSD(1234567.891)).toBe("$1.234.567,89");
  });
  it("lee montos de texto con punto o coma", () => {
    expect(montoDesdeTexto("1500")).toBe(1500);
    expect(montoDesdeTexto("1500,50")).toBe(1500.5);
    expect(montoDesdeTexto("1.500")).toBe(1.5); // un punto es decimal, no miles
    expect(montoDesdeTexto("abc")).toBeNull();
    expect(montoDesdeTexto("-5")).toBeNull();
    expect(montoDesdeTexto("0")).toBe(0);
  });
});
```

```ts
// tests/cobros-contrato.test.ts
import { describe, it, expect } from "vitest";
import { estadoCobro, cifrasDelMes, generarCuotas, mesDe, venceMensualidad, mensualidadesQueTocan } from "@/lib/cobros-contrato";

const hoy = "2026-09-16";
const base = { pagadoEn: null as Date | null, anuladoEn: null as Date | null };

describe("estadoCobro", () => {
  it("clasifica por fecha y por pago", () => {
    expect(estadoCobro({ ...base, vence: "2026-09-10" }, hoy)).toBe("vencido");
    expect(estadoCobro({ ...base, vence: "2026-09-16" }, hoy)).toBe("por_vencer");
    expect(estadoCobro({ ...base, vence: "2026-09-23" }, hoy)).toBe("por_vencer");
    expect(estadoCobro({ ...base, vence: "2026-09-24" }, hoy)).toBe("pendiente");
    expect(estadoCobro({ ...base, vence: "2026-09-10", pagadoEn: new Date() }, hoy)).toBe("pagado");
    expect(estadoCobro({ ...base, vence: "2026-09-10", anuladoEn: new Date() }, hoy)).toBe("anulado");
  });
});

describe("cifrasDelMes", () => {
  const cobros = [
    { monto: 100, vence: "2026-09-05", pagadoEn: new Date("2026-09-05T10:00:00-04:00"), anuladoEn: null },
    { monto: 200, vence: "2026-08-05", pagadoEn: new Date("2026-09-01T10:00:00-04:00"), anuladoEn: null }, // pagado en septiembre aunque vencia en agosto
    { monto: 300, vence: "2026-08-20", pagadoEn: null, anuladoEn: null }, // vencido, se arrastra
    { monto: 400, vence: "2026-09-25", pagadoEn: null, anuladoEn: null }, // por cobrar este mes
    { monto: 500, vence: "2026-10-05", pagadoEn: null, anuladoEn: null }, // mes siguiente: no cuenta
    { monto: 600, vence: "2026-09-10", pagadoEn: null, anuladoEn: new Date() }, // anulado: no cuenta
    { monto: 700, vence: "2026-09-30", pagadoEn: new Date("2026-08-31T23:59:00-04:00"), anuladoEn: null }, // pagado en agosto
  ];
  it("suma cobrado, vencido y por cobrar del mes de Caracas", () => {
    expect(cifrasDelMes(cobros, "2026-09", hoy)).toEqual({ cobrado: 300, vencido: 300, porCobrar: 400 });
  });
  it("mesDe recorta la fecha", () => { expect(mesDe("2026-09-16")).toBe("2026-09"); });
});

describe("generarCuotas", () => {
  it("parte en partes iguales y la ultima absorbe el redondeo", () => {
    expect(generarCuotas(2800, 3, "2026-09-01")).toEqual([
      { detalle: "Cuota 1 de 3", monto: 933.33, vence: "2026-09-01" },
      { detalle: "Cuota 2 de 3", monto: 933.33, vence: "2026-10-01" },
      { detalle: "Cuota 3 de 3", monto: 933.34, vence: "2026-10-31" },
    ]);
  });
  it("una sola cuota es el pago unico completo", () => {
    expect(generarCuotas(2800, 1, "2026-09-01")).toEqual([{ detalle: "Pago único", monto: 2800, vence: "2026-09-01" }]);
  });
});

describe("mensualidades", () => {
  it("venceMensualidad arma la fecha con el dia de cobro", () => {
    expect(venceMensualidad("2026-10", 5)).toBe("2026-10-05");
    expect(venceMensualidad("2026-02", 28)).toBe("2026-02-28");
  });
  it("toca la del mes que vence en 7 dias o menos y recupera las perdidas de 60 dias atras", () => {
    const p = { estado: "activo", diaCobroMensual: 20, fechaInicio: "2026-08-01" }; // julio queda fuera por fechaInicio
    expect(mensualidadesQueTocan(p, "2026-09-16", [])).toEqual([
      { mes: "2026-08", vence: "2026-08-20" }, // perdida (dentro de 60 dias)
      { mes: "2026-09", vence: "2026-09-20" }, // en 4 dias
    ]);
    expect(mensualidadesQueTocan(p, "2026-09-16", ["2026-08"])).toEqual([{ mes: "2026-09", vence: "2026-09-20" }]);
    expect(mensualidadesQueTocan(p, "2026-09-12", ["2026-08"])).toEqual([]); // faltan 8 dias
  });
  it("no genera antes de fechaInicio ni fuera de activo", () => {
    expect(mensualidadesQueTocan({ estado: "activo", diaCobroMensual: 5, fechaInicio: "2026-09-10" }, "2026-09-16", [])).toEqual([]);
    expect(mensualidadesQueTocan({ estado: "activo", diaCobroMensual: 5, fechaInicio: "2026-09-01" }, "2026-09-30", [])).toEqual([{ mes: "2026-09", vence: "2026-09-05" }, { mes: "2026-10", vence: "2026-10-05" }]);
    expect(mensualidadesQueTocan({ estado: "pausado", diaCobroMensual: 5, fechaInicio: "2026-01-01" }, "2026-09-16", [])).toEqual([]);
  });
});
```

(El caso «no genera antes de fechaInicio»: con inicio el 10-sep y día 5, la de septiembre vence el 5-sep, antes del inicio → no; la de octubre vence el 5-oct, a 19 días → todavía no. Resultado vacío. Se deja escrito así para que se lea el porqué.)

- [ ] **Step 2: correr y ver fallar**

Run: `npx vitest run tests/dinero.test.ts tests/cobros-contrato.test.ts 2>&1 | tail -3`
Expected: FAIL por módulos inexistentes.

- [ ] **Step 3: implementación**

```ts
// src/lib/dinero.ts
// Dinero en memoria: number con 2 decimales. En la base: DECIMAL(10,2).
export function redondear2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function formatoUSD(n: number): string {
  const [ent, dec] = redondear2(n).toFixed(2).split(".");
  return `$${ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
}

export const MONTO_TEXTO = /^\d{1,8}([.,]\d{1,2})?$/;

export function montoDesdeTexto(s: string): number | null {
  const t = s.trim();
  if (!MONTO_TEXTO.test(t)) return null;
  return redondear2(Number(t.replace(",", ".")));
}
```

```ts
// src/lib/cobros-contrato.ts
import { sumarDias } from "@/lib/fecha-caracas";
import { redondear2 } from "@/lib/dinero";

export const CONCEPTOS = ["pago_unico", "cuota", "mensualidad", "extra"] as const;
export type Concepto = (typeof CONCEPTOS)[number];
export const ETIQUETA_CONCEPTO: Record<Concepto, string> = { pago_unico: "Pago único", cuota: "Cuota", mensualidad: "Mensualidad", extra: "Extra" };

export const CANALES_COBRO = ["zelle", "pago_movil", "efectivo", "binance", "transferencia", "otro"] as const;
export type CanalCobro = (typeof CANALES_COBRO)[number];
export const ETIQUETA_CANAL_COBRO: Record<CanalCobro, string> = { zelle: "Zelle", pago_movil: "Pago móvil", efectivo: "Efectivo", binance: "Binance", transferencia: "Transferencia", otro: "Otro" };

export type EstadoCobro = "pagado" | "anulado" | "vencido" | "por_vencer" | "pendiente";
export const ETIQUETA_COBRO: Record<EstadoCobro, string> = { pagado: "Pagado", anulado: "Anulado", vencido: "Vencido", por_vencer: "Por vencer", pendiente: "Pendiente" };

const DIAS_AVISO = 7;

export function estadoCobro(c: { vence: string; pagadoEn: Date | null; anuladoEn: Date | null }, hoy: string): EstadoCobro {
  if (c.anuladoEn) return "anulado";
  if (c.pagadoEn) return "pagado";
  if (c.vence < hoy) return "vencido";
  if (c.vence <= sumarDias(hoy, DIAS_AVISO)) return "por_vencer";
  return "pendiente";
}

export function mesDe(fecha: string): string {
  return fecha.slice(0, 7);
}

// Mes de Caracas de un instante: se corre 4 horas y se recorta.
function mesCaracas(d: Date): string {
  return new Date(d.getTime() - 4 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

export function cifrasDelMes(
  cobros: { monto: number; vence: string; pagadoEn: Date | null; anuladoEn: Date | null }[], mes: string, hoy: string,
): { cobrado: number; vencido: number; porCobrar: number } {
  let cobrado = 0, vencido = 0, porCobrar = 0;
  for (const c of cobros) {
    if (c.anuladoEn) continue;
    if (c.pagadoEn) { if (mesCaracas(c.pagadoEn) === mes) cobrado += c.monto; continue; }
    if (c.vence < hoy) vencido += c.monto;
    else if (mesDe(c.vence) === mes) porCobrar += c.monto;
  }
  return { cobrado: redondear2(cobrado), vencido: redondear2(vencido), porCobrar: redondear2(porCobrar) };
}

export function generarCuotas(total: number, n: number, primera: string, cadaDias = 30): { detalle: string; monto: number; vence: string }[] {
  if (n <= 1) return [{ detalle: "Pago único", monto: redondear2(total), vence: primera }];
  const parte = Math.floor((total / n) * 100) / 100;
  const cuotas = [];
  let acumulado = 0;
  for (let i = 1; i <= n; i++) {
    const monto = i === n ? redondear2(total - acumulado) : parte;
    acumulado = redondear2(acumulado + monto);
    cuotas.push({ detalle: `Cuota ${i} de ${n}`, monto, vence: sumarDias(primera, cadaDias * (i - 1)) });
  }
  return cuotas;
}

export function venceMensualidad(mes: string, dia: number): string {
  return `${mes}-${String(dia).padStart(2, "0")}`;
}

function mesSiguiente(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
}

// Que mensualidades hay que crear hoy: las que vencen entre hoy-60 y hoy+7, del proyecto activo,
// no antes de fechaInicio y que no existan ya. Idempotente por construccion.
export function mensualidadesQueTocan(
  p: { estado: string; diaCobroMensual: number; fechaInicio: string }, hoy: string, existentes: string[],
): { mes: string; vence: string }[] {
  if (p.estado !== "activo") return [];
  const desde = sumarDias(hoy, -60), hasta = sumarDias(hoy, DIAS_AVISO);
  const salida = [];
  let mes = mesDe(desde);
  const tope = mesDe(hasta);
  while (mes <= tope) {
    const vence = venceMensualidad(mes, p.diaCobroMensual);
    if (vence >= desde && vence <= hasta && vence >= p.fechaInicio && !existentes.includes(mes)) salida.push({ mes, vence });
    mes = mesSiguiente(mes);
  }
  return salida;
}
```

- [ ] **Step 4: verificar y commit**

Run: `npx vitest run tests/dinero.test.ts tests/cobros-contrato.test.ts 2>&1 | tail -3 && npx tsc --noEmit`
Expected: todos `passed`.

```bash
git add -A && git commit -F - <<'EOF'
feat(proyectos): contratos de dinero, estado de cobro, cifras del mes, cuotas y mensualidades

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 3: Contratos puros — estados de proyecto, semáforo, % de avance, SemVer y parser de changelog

**Files:**
- Create: `src/lib/proyectos-contrato.ts`, `src/lib/semver-contrato.ts`, `tests/proyectos-contrato.test.ts`, `tests/semver-contrato.test.ts`

**Interfaces:**
- Produces (`proyectos-contrato.ts`): `ESTADOS_PROYECTO = ["en_construccion","entregado","activo","pausado","cerrado"]`, `type EstadoProyecto`, `ETIQUETA_ESTADO`, `puedePasarProyecto(de, a): boolean`, `esEstadoProyecto(s): s is EstadoProyecto`, `porcentajeAvance(pendientes: { hecho: boolean; visibleCliente: boolean }[]): number | null`, `type Semaforo = "rojo" | "amarillo" | "verde"`, `semaforo(estados: EstadoCobro[]): Semaforo`.
- Produces (`semver-contrato.ts`): `esSemver(s): boolean`, `compararSemver(a, b): number`, `TIPOS_CAMBIO = ["nuevo","mejora","arreglo"]`, `type TipoCambio`, `ETIQUETA_CAMBIO`, `parsearChangelog(md: string): { tipo: TipoCambio; texto: string }[]`.

- [ ] **Step 1: tests**

```ts
// tests/proyectos-contrato.test.ts
import { describe, it, expect } from "vitest";
import { puedePasarProyecto, porcentajeAvance, semaforo, ESTADOS_PROYECTO } from "@/lib/proyectos-contrato";

describe("estados de proyecto", () => {
  it("en_construccion -> entregado -> activo -> pausado <-> activo; cerrado desde cualquiera", () => {
    expect(puedePasarProyecto("en_construccion", "entregado")).toBe(true);
    expect(puedePasarProyecto("entregado", "activo")).toBe(true);
    expect(puedePasarProyecto("activo", "pausado")).toBe(true);
    expect(puedePasarProyecto("pausado", "activo")).toBe(true);
    expect(puedePasarProyecto("en_construccion", "activo")).toBe(true); // un cliente viejo entra directo como activo
    for (const e of ESTADOS_PROYECTO) expect(puedePasarProyecto(e, "cerrado")).toBe(e !== "cerrado");
    expect(puedePasarProyecto("cerrado", "activo")).toBe(false);
    expect(puedePasarProyecto("activo", "en_construccion")).toBe(false);
  });
});

describe("porcentajeAvance", () => {
  it("solo cuenta visibles; sin visibles es null", () => {
    expect(porcentajeAvance([])).toBeNull();
    expect(porcentajeAvance([{ hecho: true, visibleCliente: false }])).toBeNull();
    expect(porcentajeAvance([{ hecho: true, visibleCliente: true }, { hecho: false, visibleCliente: true }, { hecho: true, visibleCliente: false }])).toBe(50);
    expect(porcentajeAvance([{ hecho: true, visibleCliente: true }, { hecho: true, visibleCliente: true }, { hecho: false, visibleCliente: true }])).toBe(67);
  });
});

describe("semaforo", () => {
  it("rojo si hay vencido, amarillo si hay por vencer, verde si no", () => {
    expect(semaforo(["pagado", "vencido", "por_vencer"])).toBe("rojo");
    expect(semaforo(["pagado", "por_vencer"])).toBe("amarillo");
    expect(semaforo(["pagado", "pendiente", "anulado"])).toBe("verde");
    expect(semaforo([])).toBe("verde");
  });
});
```

```ts
// tests/semver-contrato.test.ts
import { describe, it, expect } from "vitest";
import { esSemver, compararSemver, parsearChangelog } from "@/lib/semver-contrato";

describe("semver", () => {
  it("valida MAYOR.MENOR.PARCHE sin prefijos", () => {
    expect(esSemver("1.4.2")).toBe(true);
    expect(esSemver("0.0.1")).toBe(true);
    expect(esSemver("v1.4.2")).toBe(false);
    expect(esSemver("1.4")).toBe(false);
    expect(esSemver("01.4.2")).toBe(false);
  });
  it("compara numericamente", () => {
    expect(compararSemver("1.10.0", "1.9.9")).toBeGreaterThan(0);
    expect(compararSemver("1.4.2", "1.4.2")).toBe(0);
    expect(["1.10.0", "1.2.0", "1.9.9"].sort(compararSemver)).toEqual(["1.2.0", "1.9.9", "1.10.0"]);
  });
});

describe("parsearChangelog", () => {
  it("convierte un bloque de CHANGELOG.md en cambios", () => {
    const md = `## [1.4.2] - 2026-09-10
### Nuevo
- Reporte de ocupación por día
- Exportar a Excel
### Mejora
* Búsqueda más rápida en reservas
### Arreglo
- El cierre de caja no sumaba propinas

### Otra cosa
- se ignora
`;
    expect(parsearChangelog(md)).toEqual([
      { tipo: "nuevo", texto: "Reporte de ocupación por día" },
      { tipo: "nuevo", texto: "Exportar a Excel" },
      { tipo: "mejora", texto: "Búsqueda más rápida en reservas" },
      { tipo: "arreglo", texto: "El cierre de caja no sumaba propinas" },
    ]);
  });
  it("acepta encabezados en ingles y sin nivel fijo, y vinetas sin encabezado van como mejora", () => {
    expect(parsearChangelog("#### Added\n- a\n## Fixed\n- b\n")).toEqual([{ tipo: "nuevo", texto: "a" }, { tipo: "arreglo", texto: "b" }]);
    expect(parsearChangelog("- suelto")).toEqual([{ tipo: "mejora", texto: "suelto" }]);
    expect(parsearChangelog("")).toEqual([]);
  });
});
```

- [ ] **Step 2: implementación**

```ts
// src/lib/proyectos-contrato.ts
import type { EstadoCobro } from "@/lib/cobros-contrato";

export const ESTADOS_PROYECTO = ["en_construccion", "entregado", "activo", "pausado", "cerrado"] as const;
export type EstadoProyecto = (typeof ESTADOS_PROYECTO)[number];
export const ETIQUETA_ESTADO: Record<EstadoProyecto, string> = {
  en_construccion: "En construcción", entregado: "Entregado", activo: "Activo", pausado: "Pausado", cerrado: "Cerrado",
};

const SIGUIENTES: Record<EstadoProyecto, readonly EstadoProyecto[]> = {
  en_construccion: ["entregado", "activo", "cerrado"],
  entregado: ["activo", "cerrado"],
  activo: ["pausado", "cerrado"],
  pausado: ["activo", "cerrado"],
  cerrado: [],
};
export function puedePasarProyecto(de: EstadoProyecto, a: EstadoProyecto): boolean {
  return SIGUIENTES[de].includes(a);
}
export function esEstadoProyecto(s: string): s is EstadoProyecto {
  return (ESTADOS_PROYECTO as readonly string[]).includes(s);
}

// % de avance visible al cliente. null = sin hitos publicados (no es 0 %).
export function porcentajeAvance(pendientes: { hecho: boolean; visibleCliente: boolean }[]): number | null {
  const visibles = pendientes.filter((p) => p.visibleCliente);
  if (!visibles.length) return null;
  return Math.round((visibles.filter((p) => p.hecho).length / visibles.length) * 100);
}

export type Semaforo = "rojo" | "amarillo" | "verde";
export function semaforo(estados: EstadoCobro[]): Semaforo {
  if (estados.includes("vencido")) return "rojo";
  if (estados.includes("por_vencer")) return "amarillo";
  return "verde";
}
```

```ts
// src/lib/semver-contrato.ts
export const TIPOS_CAMBIO = ["nuevo", "mejora", "arreglo"] as const;
export type TipoCambio = (typeof TIPOS_CAMBIO)[number];
export const ETIQUETA_CAMBIO: Record<TipoCambio, string> = { nuevo: "Nuevo", mejora: "Mejora", arreglo: "Arreglo" };

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export function esSemver(s: string): boolean {
  return SEMVER.test(s);
}
export function compararSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

// Encabezados que se reconocen (espanol e ingles, Keep a Changelog).
const TIPO_POR_ENCABEZADO: Record<string, TipoCambio> = {
  nuevo: "nuevo", nuevos: "nuevo", agregado: "nuevo", added: "nuevo",
  mejora: "mejora", mejoras: "mejora", cambiado: "mejora", changed: "mejora",
  arreglo: "arreglo", arreglos: "arreglo", corregido: "arreglo", fixed: "arreglo",
};

// Convierte el bloque pegado de CHANGELOG.md en cambios. Las vinetas bajo un
// encabezado desconocido se ignoran; las vinetas sin encabezado son "mejora".
export function parsearChangelog(md: string): { tipo: TipoCambio; texto: string }[] {
  const salida: { tipo: TipoCambio; texto: string }[] = [];
  let tipo: TipoCambio | null = "mejora";
  for (const linea of md.split(/\r?\n/)) {
    const enc = linea.match(/^#{1,6}\s+(.+?)\s*$/);
    if (enc) { tipo = TIPO_POR_ENCABEZADO[enc[1].trim().toLowerCase()] ?? null; continue; }
    const vineta = linea.match(/^\s*[-*+]\s+(.+?)\s*$/);
    if (vineta && tipo) salida.push({ tipo, texto: vineta[1] });
  }
  return salida;
}
```

- [ ] **Step 3: verificar y commit**

Run: `npx vitest run tests/proyectos-contrato.test.ts tests/semver-contrato.test.ts 2>&1 | tail -3 && npx tsc --noEmit`
Expected: todos `passed`.

```bash
git add -A && git commit -F - <<'EOF'
feat(proyectos): estados de proyecto, semaforo, avance, SemVer y parser de changelog

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 4: Configuración, clientes y proyectos — consultas y acciones

**Files:**
- Create: `src/lib/configuracion.ts`, `src/lib/clientes.ts`, `src/lib/proyectos.ts`, `src/acciones/clientes.ts`, `src/acciones/proyectos.ts`, `tests/clientes-proyectos.test.ts`
- Modify: `src/app/(panel)/hoy/page.tsx:14-17` (contar ganados sin proyecto con la consulta nueva)

**Interfaces:**
- Consumes: `generarCuotas`, `estadoCobro`, `cifrasDelMes`, `mesDe` (T2); `puedePasarProyecto`, `esEstadoProyecto`, `semaforo`, `porcentajeAvance`, `EstadoProyecto` (T3); `montoDesdeTexto` (T2); `normalizarCelular`, `normalizarRed`; `generarCodigo`; `hoyCaracas`, `esFechaIso`; `exigirRol`; `Resultado`.
- Produces (`configuracion.ts`): `CLAVES = { tarifaHora: "tarifa_hora", mensajeRecordatorio: "mensaje_cobro_recordatorio", mensajeVencido: "mensaje_cobro_vencido", emisor: "datos_emisor" }`, `DEFECTOS: Record<string,string>`, `leerConfig(clave): Promise<string>` (devuelve el defecto si no existe), `guardarConfig(clave, valor)`, `leerTarifaHora(): Promise<number>`, `type DatosEmisor = { nombre; rif; whatsapp; email }`, `leerEmisor(): Promise<DatosEmisor>`.
- Produces (`clientes.ts`): `type ClienteFila = { id; nombre; contactoNombre; whatsapp; email; rif; instagram; facebook; tiktok; prospectoId: number | null; proyectos: number }`, `listarClientes(q?): Promise<ClienteFila[]>`, `fichaCliente(id): Promise<(ClienteFila & { proyectosLista: { id; nombre; estado }[] }) | null>`, `clienteDesdeProspecto(prospectoId): Promise<{ id } >` (crea si no existe, copiando contacto; idempotente por `prospectoId` único).
- Produces (`proyectos.ts`): `type ProyectoResumen = { id; nombre; clienteId; clienteNombre; estado: EstadoProyecto; versionActual: string; semaforo: Semaforo; avance: number | null }`, `listarProyectos(hoy): Promise<ProyectoResumen[]>`, `ganadosSinProyecto(): Promise<{ id; nombre; ciudad }[]>`, `resumenMes(hoy): Promise<{ cobrado; vencido; porCobrar }>`, `type CobroFila = { id; concepto: Concepto; detalle; monto: number; vence; estado: EstadoCobro; pagadoEn: Date | null; canal; referencia; nota; anuladoMotivo; recordadoHoy: boolean }`, `type ProyectoFicha = ProyectoResumen & { nichoNombre; pagoUnico: number; mensualidad: number; horasCotizadas: number; fechaInicio; fechaEntregaEstimada: string | null; fechaEntregaReal: string | null; diaCobroMensual: number; propuestaCodigo; cliente: ClienteFila; cobros: CobroFila[]; pendientes: PendienteFila[]; horas: HorasFila[]; horasReales: number; versiones: VersionFila[]; historial: EventoProyecto[] }`, con `PendienteFila = { id; texto; hecho; visibleCliente; orden; fechaEstimada: string | null }`, `HorasFila = { id; fecha; horas: number; descripcion; usuarioNombre }`, `VersionFila = { id; version; fecha; avisadoEn: Date | null; cambios: { id; tipo: TipoCambio; texto }[] }`, `EventoProyecto = { id; tipo; texto; creadoEn: Date; usuarioNombre }`; `fichaProyecto(id, hoy): Promise<ProyectoFicha | null>`.
- Produces (acciones `clientes.ts`): `crearCliente(formData): Promise<Resultado<{ id }>>`, `editarCliente(formData): Promise<Resultado>`.
- Produces (acciones `proyectos.ts`): `crearProyecto(formData): Promise<Resultado<{ id }>>` — campos `clienteId` **o** `prospectoId` (si viene `prospectoId`, se crea/obtiene el cliente), `nombre`, `nichoId`, `pagoUnico`, `mensualidad`, `horasCotizadas`, `fechaInicio`, `fechaEntregaEstimada?`, `diaCobroMensual`, `formaPago: "completo" | "cuotas"`, `cuotas?` (2–12), `propuestaCodigo?`; genera los `Cobro` del pago único; `cambiarEstadoProyecto(id, a, motivo?)`, `editarProyecto(formData)` (nombre, mensualidad, horasCotizadas, fechaEntregaEstimada, diaCobroMensual).

- [ ] **Step 1: tests**

```ts
// tests/clientes-proyectos.test.ts
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
import { DB_HABILITADA, limpiarBase, sembrarBasico, crearProspectoDePrueba, sembrarCliente, sembrarProyecto } from "./ayuda-db";
import { sesionFalsa } from "./ayuda-sesion";
import { crearProyecto, cambiarEstadoProyecto, editarProyecto } from "@/acciones/proyectos";
import { crearCliente } from "@/acciones/clientes";
import { listarProyectos, ganadosSinProyecto, fichaProyecto, resumenMes } from "@/lib/proyectos";
import { clienteDesdeProspecto, listarClientes } from "@/lib/clientes";
import { leerTarifaHora, guardarConfig, CLAVES } from "@/lib/configuracion";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe.runIf(DB_HABILITADA)("clientes y proyectos", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  beforeAll(async () => { await limpiarBase(); ids = await sembrarBasico(); });
  beforeEach(() => { sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" }; });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("el prospectador no entra a nada de esta pieza", async () => {
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
    await expect(crearCliente(fd({ nombre: "X" }))).rejects.toThrow("REDIRECT:/hoy");
    await expect(crearProyecto(fd({ nombre: "X" }))).rejects.toThrow("REDIRECT:/hoy");
    await expect(cambiarEstadoProyecto(1, "activo")).rejects.toThrow("REDIRECT:/hoy");
  });

  it("configuracion devuelve defectos y guarda", async () => {
    expect(await leerTarifaHora()).toBe(17);
    await guardarConfig(CLAVES.tarifaHora, "20");
    expect(await leerTarifaHora()).toBe(20);
    await guardarConfig(CLAVES.tarifaHora, "17");
  });

  it("clienteDesdeProspecto copia el contacto y es idempotente", async () => {
    const pr = await crearProspectoDePrueba(ids.nichoId, { nombre: "Hotel Ganado", whatsapp: "584121111111", email: "h@g.co", instagram: "https://www.instagram.com/hg/", etapa: "ganado" });
    const a = await clienteDesdeProspecto(pr.id);
    const b = await clienteDesdeProspecto(pr.id);
    expect(a.id).toBe(b.id);
    const c = await prisma.cliente.findUniqueOrThrow({ where: { id: a.id } });
    expect(c).toMatchObject({ nombre: "Hotel Ganado", whatsapp: "584121111111", email: "h@g.co", instagram: "https://www.instagram.com/hg/", prospectoId: pr.id });
    expect(c.codigo).toHaveLength(22);
  });

  it("ganadosSinProyecto lista al ganado hasta que se le crea proyecto; crearProyecto en cuotas genera los cobros", async () => {
    const pr = await prisma.prospecto.findFirstOrThrow({ where: { nombre: "Hotel Ganado" } });
    expect((await ganadosSinProyecto()).map((g) => g.id)).toContain(pr.id);
    const r = await crearProyecto(fd({ prospectoId: String(pr.id), nombre: "PMS Hotel", nichoId: String(ids.nichoId), pagoUnico: "2800", mensualidad: "100", horasCotizadas: "160", fechaInicio: "2026-09-01", diaCobroMensual: "5", formaPago: "cuotas", cuotas: "3" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((await ganadosSinProyecto()).map((g) => g.id)).not.toContain(pr.id);
    const cobros = await prisma.cobro.findMany({ where: { proyectoId: r.datos.id }, orderBy: { vence: "asc" } });
    expect(cobros.map((c) => [c.concepto, c.detalle, Number(c.monto), c.vence])).toEqual([
      ["cuota", "Cuota 1 de 3", 933.33, "2026-09-01"], ["cuota", "Cuota 2 de 3", 933.33, "2026-10-01"], ["cuota", "Cuota 3 de 3", 933.34, "2026-10-31"],
    ]);
    expect(await prisma.evento.count({ where: { proyectoId: r.datos.id, tipo: "proyecto_creado" } })).toBe(1);
  });

  it("crearProyecto completo genera un solo cobro y valida montos y fechas", async () => {
    const c = await sembrarCliente({ nombre: "Cliente Directo" });
    expect((await crearProyecto(fd({ clienteId: String(c.id), nombre: "Tienda", nichoId: String(ids.nichoId), pagoUnico: "abc", mensualidad: "80", horasCotizadas: "100", fechaInicio: "2026-09-01", diaCobroMensual: "10", formaPago: "completo" }))).ok).toBe(false);
    expect((await crearProyecto(fd({ clienteId: String(c.id), nombre: "Tienda", nichoId: String(ids.nichoId), pagoUnico: "2500", mensualidad: "80", horasCotizadas: "100", fechaInicio: "2026-02-30", diaCobroMensual: "10", formaPago: "completo" }))).ok).toBe(false);
    expect((await crearProyecto(fd({ clienteId: String(c.id), nombre: "Tienda", nichoId: String(ids.nichoId), pagoUnico: "2500", mensualidad: "80", horasCotizadas: "100", fechaInicio: "2026-09-01", diaCobroMensual: "31", formaPago: "completo" }))).ok).toBe(false);
    const r = await crearProyecto(fd({ clienteId: String(c.id), nombre: "Tienda", nichoId: String(ids.nichoId), pagoUnico: "2500", mensualidad: "80", horasCotizadas: "100", fechaInicio: "2026-09-01", diaCobroMensual: "10", formaPago: "completo" }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cobros = await prisma.cobro.findMany({ where: { proyectoId: r.datos.id } });
    expect(cobros).toHaveLength(1);
    expect(cobros[0]).toMatchObject({ concepto: "pago_unico", detalle: "Pago único", vence: "2026-09-01" });
    expect(Number(cobros[0].monto)).toBe(2500);
  });

  it("cambiarEstadoProyecto respeta el orden, fija fechaEntregaReal y deja evento", async () => {
    const p = await prisma.proyecto.findFirstOrThrow({ where: { nombre: "Tienda" } });
    expect((await cambiarEstadoProyecto(p.id, "pausado")).ok).toBe(false); // desde en_construccion no
    expect((await cambiarEstadoProyecto(p.id, "entregado")).ok).toBe(true);
    let d = await prisma.proyecto.findUniqueOrThrow({ where: { id: p.id } });
    expect(d.estado).toBe("entregado");
    expect(d.fechaEntregaReal).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((await cambiarEstadoProyecto(p.id, "activo")).ok).toBe(true);
    expect((await cambiarEstadoProyecto(p.id, "cerrado", "")).ok).toBe(false); // cerrar pide motivo
    expect((await cambiarEstadoProyecto(p.id, "cerrado", "terminó el contrato")).ok).toBe(true);
    d = await prisma.proyecto.findUniqueOrThrow({ where: { id: p.id } });
    expect(d.estado).toBe("cerrado");
    expect(await prisma.evento.count({ where: { proyectoId: p.id, tipo: "proyecto_estado" } })).toBe(3);
  });

  it("listarProyectos trae semaforo y resumenMes suma; fichaProyecto arma todo", async () => {
    const hoy = "2026-09-16";
    const lista = await listarProyectos(hoy);
    const pms = lista.find((p) => p.nombre === "PMS Hotel")!;
    expect(pms.semaforo).toBe("rojo"); // cuota 1 vencio el 2026-09-01
    expect(pms.clienteNombre).toBe("Hotel Ganado");
    expect(pms.versionActual).toBe("");
    const m = await resumenMes(hoy);
    expect(m.cobrado).toBe(0);
    expect(m.vencido).toBe(933.33 + 2500); // cuota 1 de PMS + pago unico de Tienda (vence 09-01)
    const f = await fichaProyecto(pms.id, hoy);
    expect(f?.cobros.map((c) => c.estado)).toEqual(["vencido", "pendiente", "pendiente"]);
    expect(f?.cliente.nombre).toBe("Hotel Ganado");
    expect(f?.avance).toBeNull();
    expect(f?.horasReales).toBe(0);
    expect(await fichaProyecto(999999, hoy)).toBeNull();
  });

  it("editarProyecto cambia lo editable y crearCliente normaliza", async () => {
    const p = await prisma.proyecto.findFirstOrThrow({ where: { nombre: "PMS Hotel" } });
    expect((await editarProyecto(fd({ id: String(p.id), nombre: "PMS Hotel v2", mensualidad: "120", horasCotizadas: "170", fechaEntregaEstimada: "2026-11-30", diaCobroMensual: "7" }))).ok).toBe(true);
    const d = await prisma.proyecto.findUniqueOrThrow({ where: { id: p.id } });
    expect(d).toMatchObject({ nombre: "PMS Hotel v2", diaCobroMensual: 7, fechaEntregaEstimada: "2026-11-30" });
    expect(Number(d.mensualidad)).toBe(120);
    const r = await crearCliente(fd({ nombre: "Farmacia Sol", contactoNombre: "Ana", whatsapp: "0414 555 12 34", rif: "j-1234", instagram: "@farmasol" }));
    expect(r.ok).toBe(true);
    const cl = (await listarClientes("sol"))[0];
    expect(cl).toMatchObject({ nombre: "Farmacia Sol", whatsapp: "584145551234", instagram: "https://www.instagram.com/farmasol/", rif: "J-1234" });
  });
});
```

- [ ] **Step 2: `src/lib/configuracion.ts`**

```ts
// src/lib/configuracion.ts — clave/valor con defectos. Solo el dueno escribe.
import { prisma } from "@/lib/db";

export const CLAVES = {
  tarifaHora: "tarifa_hora",
  mensajeRecordatorio: "mensaje_cobro_recordatorio",
  mensajeVencido: "mensaje_cobro_vencido",
  emisor: "datos_emisor",
} as const;

export const DEFECTOS: Record<string, string> = {
  [CLAVES.tarifaHora]: "17",
  [CLAVES.mensajeRecordatorio]: "Buenas, {cliente}. Le recuerdo el cobro de {concepto} de {proyecto} por {monto}, que vence el {vence}. Cualquier duda me escribe por aquí. Gracias.",
  [CLAVES.mensajeVencido]: "Buenas, {cliente}. Le escribo por el cobro de {concepto} de {proyecto} por {monto}, que venció el {vence}. ¿Me confirma cuándo lo podemos regularizar? Gracias.",
  [CLAVES.emisor]: JSON.stringify({ nombre: "Neri Colón", rif: "", whatsapp: "", email: "" }),
};

export async function leerConfig(clave: string): Promise<string> {
  const fila = await prisma.configuracion.findUnique({ where: { clave } });
  return fila?.valor ?? DEFECTOS[clave] ?? "";
}

export async function guardarConfig(clave: string, valor: string): Promise<void> {
  await prisma.configuracion.upsert({ where: { clave }, update: { valor }, create: { clave, valor } });
}

export async function leerTarifaHora(): Promise<number> {
  const n = Number(await leerConfig(CLAVES.tarifaHora));
  return Number.isFinite(n) && n > 0 ? n : 17;
}

export type DatosEmisor = { nombre: string; rif: string; whatsapp: string; email: string };
export async function leerEmisor(): Promise<DatosEmisor> {
  try { return { nombre: "", rif: "", whatsapp: "", email: "", ...JSON.parse(await leerConfig(CLAVES.emisor)) }; }
  catch { return { nombre: "Neri Colón", rif: "", whatsapp: "", email: "" }; }
}
```

- [ ] **Step 3: `src/lib/clientes.ts`**

```ts
// src/lib/clientes.ts
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { generarCodigo } from "@/lib/codigo";

export type ClienteFila = {
  id: number; nombre: string; contactoNombre: string; whatsapp: string; email: string; rif: string;
  instagram: string; facebook: string; tiktok: string; prospectoId: number | null; proyectos: number;
};

const SELECT = { id: true, nombre: true, contactoNombre: true, whatsapp: true, email: true, rif: true, instagram: true, facebook: true, tiktok: true, prospectoId: true, _count: { select: { proyectos: true } } } as const;
type Fila = Prisma.ClienteGetPayload<{ select: typeof SELECT }>;
const aFila = ({ _count, ...c }: Fila): ClienteFila => ({ ...c, proyectos: _count.proyectos });

export async function listarClientes(q?: string): Promise<ClienteFila[]> {
  const t = q?.trim();
  const filas = await prisma.cliente.findMany({ where: t ? { OR: [{ nombre: { contains: t } }, { contactoNombre: { contains: t } }, { rif: { contains: t } }] } : {}, select: SELECT, orderBy: { nombre: "asc" }, take: 100 });
  return filas.map(aFila);
}

export async function fichaCliente(id: number): Promise<(ClienteFila & { proyectosLista: { id: number; nombre: string; estado: string }[] }) | null> {
  const c = await prisma.cliente.findUnique({ where: { id }, select: { ...SELECT, proyectos: { select: { id: true, nombre: true, estado: true }, orderBy: { creadoEn: "desc" } } } });
  if (!c) return null;
  const { proyectos, ...resto } = c;
  return { ...aFila(resto), proyectosLista: proyectos };
}

// Crea el cliente a partir del prospecto ganado (o lo devuelve si ya existe).
// Copia el contacto publicado; la nota interna del prospecto NO se copia.
export async function clienteDesdeProspecto(prospectoId: number): Promise<{ id: number }> {
  const existente = await prisma.cliente.findUnique({ where: { prospectoId }, select: { id: true } });
  if (existente) return existente;
  const p = await prisma.prospecto.findUniqueOrThrow({ where: { id: prospectoId } });
  try {
    return await prisma.cliente.create({
      data: { nombre: p.nombre, whatsapp: p.whatsapp, email: p.email, instagram: p.instagram, facebook: p.facebook, tiktok: p.tiktok, prospectoId, codigo: generarCodigo() },
      select: { id: true },
    });
  } catch (err) {
    // Carrera: otro lo creo primero. prospectoId es unico, asi que se relee.
    const otra = await prisma.cliente.findUnique({ where: { prospectoId }, select: { id: true } });
    if (otra) return otra;
    throw err;
  }
}
```

- [ ] **Step 4: `src/lib/proyectos.ts`**

```ts
// src/lib/proyectos.ts — consultas de pantalla de proyectos.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { estadoCobro, cifrasDelMes, mesDe, type Concepto, type EstadoCobro } from "@/lib/cobros-contrato";
import { semaforo, porcentajeAvance, type EstadoProyecto, type Semaforo } from "@/lib/proyectos-contrato";
import { compararSemver, type TipoCambio } from "@/lib/semver-contrato";
import { redondear2 } from "@/lib/dinero";
import type { ClienteFila } from "@/lib/clientes";

export type ProyectoResumen = { id: number; nombre: string; clienteId: number; clienteNombre: string; estado: EstadoProyecto; versionActual: string; semaforo: Semaforo; avance: number | null };
export type CobroFila = { id: number; concepto: Concepto; detalle: string; monto: number; vence: string; estado: EstadoCobro; pagadoEn: Date | null; canal: string; referencia: string; nota: string; anuladoMotivo: string; recordadoHoy: boolean };
export type PendienteFila = { id: number; texto: string; hecho: boolean; visibleCliente: boolean; orden: number; fechaEstimada: string | null };
export type HorasFila = { id: number; fecha: string; horas: number; descripcion: string; usuarioNombre: string };
export type VersionFila = { id: number; version: string; fecha: string; avisadoEn: Date | null; cambios: { id: number; tipo: TipoCambio; texto: string }[] };
export type EventoProyecto = { id: number; tipo: string; texto: string; creadoEn: Date; usuarioNombre: string };
export type ProyectoFicha = ProyectoResumen & {
  nichoNombre: string; pagoUnico: number; mensualidad: number; horasCotizadas: number; fechaInicio: string; fechaEntregaEstimada: string | null; fechaEntregaReal: string | null;
  diaCobroMensual: number; propuestaCodigo: string; cliente: ClienteFila; cobros: CobroFila[]; pendientes: PendienteFila[]; horas: HorasFila[]; horasReales: number; versiones: VersionFila[]; historial: EventoProyecto[];
};

function versionActualDe(versiones: { version: string }[]): string {
  return [...versiones].sort((a, b) => compararSemver(b.version, a.version))[0]?.version ?? "";
}

export async function listarProyectos(hoy: string): Promise<ProyectoResumen[]> {
  const filas = await prisma.proyecto.findMany({
    select: { id: true, nombre: true, clienteId: true, estado: true, cliente: { select: { nombre: true } }, versiones: { select: { version: true } },
      cobros: { select: { vence: true, pagadoEn: true, anuladoEn: true } }, pendientes: { select: { hecho: true, visibleCliente: true } } },
    orderBy: [{ estado: "asc" }, { nombre: "asc" }],
  });
  return filas.map((p) => ({
    id: p.id, nombre: p.nombre, clienteId: p.clienteId, clienteNombre: p.cliente.nombre, estado: p.estado as EstadoProyecto,
    versionActual: versionActualDe(p.versiones), semaforo: semaforo(p.cobros.map((c) => estadoCobro(c, hoy))), avance: porcentajeAvance(p.pendientes),
  }));
}

export async function ganadosSinProyecto(): Promise<{ id: number; nombre: string; ciudad: string }[]> {
  return prisma.prospecto.findMany({ where: { etapa: "ganado", OR: [{ cliente: { is: null } }, { cliente: { proyectos: { none: {} } } }] }, select: { id: true, nombre: true, ciudad: true }, orderBy: { nombre: "asc" } });
}

export async function resumenMes(hoy: string): Promise<{ cobrado: number; vencido: number; porCobrar: number }> {
  const cobros = await prisma.cobro.findMany({ select: { monto: true, vence: true, pagadoEn: true, anuladoEn: true } });
  return cifrasDelMes(cobros.map((c) => ({ ...c, monto: Number(c.monto) })), mesDe(hoy), hoy);
}

export async function fichaProyecto(id: number, hoy: string): Promise<ProyectoFicha | null> {
  const p = await prisma.proyecto.findUnique({
    where: { id },
    include: {
      nicho: { select: { nombre: true } },
      cliente: { select: { id: true, nombre: true, contactoNombre: true, whatsapp: true, email: true, rif: true, instagram: true, facebook: true, tiktok: true, prospectoId: true, _count: { select: { proyectos: true } } } },
      cobros: { orderBy: { vence: "asc" } },
      pendientes: { orderBy: { orden: "asc" } },
      horas: { orderBy: { fecha: "desc" }, include: { usuario: { select: { nombre: true } } } },
      versiones: { include: { cambios: { orderBy: { orden: "asc" } } } },
      eventos: { orderBy: { creadoEn: "desc" }, take: 100, include: { usuario: { select: { nombre: true } } } },
    },
  });
  if (!p) return null;
  const desde = new Date(`${hoy}T00:00:00-04:00`);
  const recordadosHoy = new Set((await prisma.evento.findMany({ where: { proyectoId: id, tipo: "recordatorio", creadoEn: { gte: desde } }, select: { cobroId: true } })).map((e) => e.cobroId));
  const cobros: CobroFila[] = p.cobros.map((c) => ({
    id: c.id, concepto: c.concepto as Concepto, detalle: c.detalle, monto: Number(c.monto), vence: c.vence, estado: estadoCobro(c, hoy), pagadoEn: c.pagadoEn,
    canal: c.canal, referencia: c.referencia, nota: c.nota, anuladoMotivo: c.anuladoMotivo, recordadoHoy: recordadosHoy.has(c.id),
  }));
  const versiones: VersionFila[] = [...p.versiones].sort((a, b) => compararSemver(b.version, a.version)).map((v) => ({ id: v.id, version: v.version, fecha: v.fecha, avisadoEn: v.avisadoEn, cambios: v.cambios.map((c) => ({ id: c.id, tipo: c.tipo as TipoCambio, texto: c.texto })) }));
  const { _count, ...cl } = p.cliente;
  return {
    id: p.id, nombre: p.nombre, clienteId: p.clienteId, clienteNombre: p.cliente.nombre, estado: p.estado as EstadoProyecto, versionActual: versiones[0]?.version ?? "",
    semaforo: semaforo(cobros.map((c) => c.estado)), avance: porcentajeAvance(p.pendientes), nichoNombre: p.nicho.nombre,
    pagoUnico: Number(p.pagoUnico), mensualidad: Number(p.mensualidad), horasCotizadas: Number(p.horasCotizadas), fechaInicio: p.fechaInicio,
    fechaEntregaEstimada: p.fechaEntregaEstimada, fechaEntregaReal: p.fechaEntregaReal, diaCobroMensual: p.diaCobroMensual, propuestaCodigo: p.propuestaCodigo,
    cliente: { ...cl, proyectos: _count.proyectos }, cobros,
    pendientes: p.pendientes.map((x) => ({ id: x.id, texto: x.texto, hecho: x.hecho, visibleCliente: x.visibleCliente, orden: x.orden, fechaEstimada: x.fechaEstimada })),
    horas: p.horas.map((h) => ({ id: h.id, fecha: h.fecha, horas: Number(h.horas), descripcion: h.descripcion, usuarioNombre: h.usuario?.nombre ?? "" })),
    horasReales: redondear2(p.horas.reduce((s, h) => s + Number(h.horas), 0)), versiones,
    historial: p.eventos.map((e) => ({ id: e.id, tipo: e.tipo, texto: e.texto, creadoEn: e.creadoEn, usuarioNombre: e.usuario?.nombre ?? "" })),
  };
}
```

(`Prisma` se importa solo si hace falta para tipos; si no, quitar el import.)

- [ ] **Step 5: acciones `src/acciones/clientes.ts` y `src/acciones/proyectos.ts`**

```ts
// src/acciones/clientes.ts
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { exigirRol } from "@/lib/sesion";
import { normalizarCelular, normalizarRed } from "@/lib/celular-contrato";
import { generarCodigo } from "@/lib/codigo";
import { fallo, exito, type Resultado } from "@/acciones/resultado";

// exigirRol("dueno") va FUERA del try/catch. Solo el dueno ve clientes.
const ERROR = "No se pudo guardar. Intenta de nuevo.";
const ClienteZ = z.object({
  id: z.coerce.number().int().positive().optional(),
  nombre: z.string().trim().min(2).max(120),
  contactoNombre: z.string().trim().max(80).default(""),
  whatsapp: z.string().trim().max(40).default(""),
  email: z.string().trim().max(120).default(""),
  rif: z.string().trim().max(20).default(""),
  instagram: z.string().trim().max(200).default(""),
  facebook: z.string().trim().max(200).default(""),
  tiktok: z.string().trim().max(200).default(""),
});
function datosDe(d: z.infer<typeof ClienteZ>) {
  return { nombre: d.nombre, contactoNombre: d.contactoNombre, whatsapp: normalizarCelular(d.whatsapp), email: d.email, rif: d.rif.toUpperCase(),
    instagram: normalizarRed(d.instagram, "instagram"), facebook: normalizarRed(d.facebook, "facebook"), tiktok: normalizarRed(d.tiktok, "tiktok") };
}

export async function crearCliente(formData: FormData): Promise<Resultado<{ id: number }>> {
  await exigirRol("dueno");
  const e = ClienteZ.safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("Revisa el nombre del cliente.");
  try {
    const c = await prisma.cliente.create({ data: { ...datosDe(e.data), codigo: generarCodigo() }, select: { id: true } });
    revalidatePath("/clientes");
    return exito({ id: c.id });
  } catch (err) { console.error("crearCliente", err); return fallo(ERROR); }
}

export async function editarCliente(formData: FormData): Promise<Resultado> {
  await exigirRol("dueno");
  const e = ClienteZ.safeParse(Object.fromEntries(formData));
  if (!e.success || !e.data.id) return fallo("Revisa el nombre del cliente.");
  try {
    await prisma.cliente.update({ where: { id: e.data.id }, data: datosDe(e.data) });
    revalidatePath("/clientes"); revalidatePath(`/clientes/${e.data.id}`); revalidatePath("/proyectos");
    return exito();
  } catch (err) { console.error("editarCliente", err); return fallo(ERROR); }
}
```

```ts
// src/acciones/proyectos.ts
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { exigirRol } from "@/lib/sesion";
import { esFechaIso, hoyCaracas } from "@/lib/fecha-caracas";
import { MONTO_TEXTO, montoDesdeTexto } from "@/lib/dinero";
import { generarCuotas } from "@/lib/cobros-contrato";
import { ESTADOS_PROYECTO, puedePasarProyecto, type EstadoProyecto } from "@/lib/proyectos-contrato";
import { clienteDesdeProspecto } from "@/lib/clientes";
import { fallo, exito, type Resultado } from "@/acciones/resultado";

// exigirRol("dueno") va FUERA del try/catch. Cada export es un endpoint publico.
const ERROR = "No se pudo guardar. Intenta de nuevo.";
const Monto = z.string().trim().regex(MONTO_TEXTO);
const Fecha = z.string().trim().refine(esFechaIso, "fecha");
const Id = z.number().int().positive();

function refrescar(id?: number) {
  revalidatePath("/proyectos"); revalidatePath("/hoy"); revalidatePath("/clientes");
  if (id) revalidatePath(`/proyectos/${id}`);
}

const NuevoZ = z.object({
  clienteId: z.coerce.number().int().positive().optional(),
  prospectoId: z.coerce.number().int().positive().optional(),
  nombre: z.string().trim().min(2).max(120),
  nichoId: z.coerce.number().int().positive(),
  pagoUnico: Monto, mensualidad: Monto, horasCotizadas: Monto,
  fechaInicio: Fecha,
  fechaEntregaEstimada: z.string().trim().optional().transform((s) => (s ? s : undefined)).refine((s) => !s || esFechaIso(s), "fecha"),
  diaCobroMensual: z.coerce.number().int().min(1).max(28),
  formaPago: z.enum(["completo", "cuotas"]),
  cuotas: z.coerce.number().int().min(2).max(12).optional(),
  propuestaCodigo: z.string().trim().max(30).default(""),
}).refine((d) => d.clienteId || d.prospectoId, "cliente").refine((d) => d.formaPago !== "cuotas" || d.cuotas, "cuotas");

export async function crearProyecto(formData: FormData): Promise<Resultado<{ id: number }>> {
  const u = await exigirRol("dueno");
  const e = NuevoZ.safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("Revisa nombre, montos (números con hasta 2 decimales), fechas y día de cobro (1 a 28).");
  const d = e.data;
  try {
    const clienteId = d.clienteId ?? (await clienteDesdeProspecto(d.prospectoId!)).id;
    const cuotas = generarCuotas(montoDesdeTexto(d.pagoUnico)!, d.formaPago === "cuotas" ? d.cuotas! : 1, d.fechaInicio);
    const p = await prisma.proyecto.create({
      data: {
        clienteId, nombre: d.nombre, nichoId: d.nichoId, pagoUnico: new Prisma.Decimal(d.pagoUnico.replace(",", ".")), mensualidad: new Prisma.Decimal(d.mensualidad.replace(",", ".")),
        horasCotizadas: new Prisma.Decimal(d.horasCotizadas.replace(",", ".")), fechaInicio: d.fechaInicio, fechaEntregaEstimada: d.fechaEntregaEstimada ?? null,
        diaCobroMensual: d.diaCobroMensual, propuestaCodigo: d.propuestaCodigo,
        cobros: { create: cuotas.map((c) => ({ concepto: cuotas.length === 1 ? "pago_unico" : "cuota", detalle: c.detalle, monto: new Prisma.Decimal(c.monto.toFixed(2)), vence: c.vence })) },
        eventos: { create: { tipo: "proyecto_creado", usuarioId: u.id, texto: d.formaPago === "cuotas" ? `${cuotas.length} cuotas` : "pago único" } },
      },
      select: { id: true },
    });
    refrescar(p.id);
    return exito({ id: p.id });
  } catch (err) { console.error("crearProyecto", err); return fallo(ERROR); }
}

export async function cambiarEstadoProyecto(proyectoId: number, a: EstadoProyecto, motivo = ""): Promise<Resultado> {
  const u = await exigirRol("dueno");
  const e = z.object({ id: Id, a: z.enum(ESTADOS_PROYECTO), motivo: z.string().trim().max(300) }).safeParse({ id: proyectoId, a, motivo });
  if (!e.success) return fallo("Estado inválido.");
  if (e.data.a === "cerrado" && e.data.motivo.length < 2) return fallo("Escribe por qué se cierra.");
  try {
    const p = await prisma.proyecto.findUnique({ where: { id: e.data.id }, select: { estado: true } });
    if (!p) return fallo("Ese proyecto no existe.");
    const de = p.estado as EstadoProyecto;
    if (!puedePasarProyecto(de, e.data.a)) return fallo(`No se puede pasar de «${de}» a «${e.data.a}».`);
    const r = await prisma.proyecto.updateMany({ where: { id: e.data.id, estado: de }, data: { estado: e.data.a, ...(e.data.a === "entregado" ? { fechaEntregaReal: hoyCaracas() } : {}) } });
    if (r.count === 0) return fallo("Alguien más acaba de cambiar este proyecto. Recarga.");
    await prisma.evento.create({ data: { proyectoId: e.data.id, usuarioId: u.id, tipo: "proyecto_estado", texto: `${de} → ${e.data.a}${e.data.motivo ? `: ${e.data.motivo}` : ""}` } });
    refrescar(e.data.id);
    return exito();
  } catch (err) { console.error("cambiarEstadoProyecto", err); return fallo(ERROR); }
}

const EditarZ = z.object({
  id: z.coerce.number().int().positive(), nombre: z.string().trim().min(2).max(120), mensualidad: Monto, horasCotizadas: Monto,
  fechaEntregaEstimada: z.string().trim().optional().transform((s) => (s ? s : undefined)).refine((s) => !s || esFechaIso(s), "fecha"),
  diaCobroMensual: z.coerce.number().int().min(1).max(28),
});
export async function editarProyecto(formData: FormData): Promise<Resultado> {
  await exigirRol("dueno");
  const e = EditarZ.safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("Revisa nombre, montos, fecha y día de cobro (1 a 28).");
  const d = e.data;
  try {
    // Cambiar diaCobroMensual no toca cobros ya generados (aplica desde el mes siguiente).
    await prisma.proyecto.update({ where: { id: d.id }, data: { nombre: d.nombre, mensualidad: new Prisma.Decimal(d.mensualidad.replace(",", ".")), horasCotizadas: new Prisma.Decimal(d.horasCotizadas.replace(",", ".")), fechaEntregaEstimada: d.fechaEntregaEstimada ?? null, diaCobroMensual: d.diaCobroMensual } });
    refrescar(d.id);
    return exito();
  } catch (err) { console.error("editarProyecto", err); return fallo(ERROR); }
}
```

- [ ] **Step 6: Hoy usa la consulta nueva** — en `src/app/(panel)/hoy/page.tsx` reemplazar `prisma.prospecto.count({ where: { etapa: "ganado" } })` por `ganadosSinProyecto()` (importar de `@/lib/proyectos`) y mostrar, solo a `dueno`, una línea por ganado con enlace `Crear proyecto` → `/proyectos/nuevo?prospecto=<id>`.

- [ ] **Step 7: verificar y commit**

Run: `npm run test:db 2>&1 | tail -4 && npx tsc --noEmit`
Expected: todos `passed`.

```bash
git add -A && git commit -F - <<'EOF'
feat(proyectos): configuracion, clientes desde ganado, crear proyecto con cuotas, estados y ficha

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 5: Cobros — marcar pagado, anular, agregar y recordar

**Files:**
- Create: `src/acciones/cobros.ts`, `src/lib/mensajes-cobro.ts`, `tests/cobros.test.ts`

**Interfaces:**
- Consumes: `CANALES_COBRO`, `CONCEPTOS`, `ETIQUETA_CONCEPTO`, `estadoCobro` (T2); `formatoUSD`, `MONTO_TEXTO` (T2); `rellenar` (`@/lib/plantilla-mensaje`); `leerConfig`, `CLAVES` (T4); `hoyCaracas`, `esFechaIso`; `exigirRol`; `Resultado`.
- Produces (`mensajes-cobro.ts`): `mensajeDeCobro(c: { concepto: Concepto; detalle: string; monto: number; vence: string; estado: EstadoCobro }, proyecto: { nombre: string }, cliente: { nombre: string; contactoNombre: string }, plantillas: { recordatorio: string; vencido: string }): string` (puro; usa `vencido` si el estado es `vencido`, `{enlace}` → `""`), `enlaceWhatsappCobro(whatsapp: string, mensaje: string): string | null` (`https://wa.me/<num>?text=…` o `null` sin celular).
- Produces (acciones): `marcarPagado(formData)` (`cobroId`, `pagadoEn` fecha ISO ≤ hoy, `canal`, `referencia`, `nota`) → `Resultado`; `anularCobro(cobroId, motivo)`; `agregarCobro(formData)` (`proyectoId`, `concepto` ∈ `cuota|extra`, `detalle`, `monto`, `vence`); `registrarRecordatorio(cobroId)` → `Resultado<{ href: string }>` (deja `Evento` `recordatorio`; `fallo` si ya se recordó hoy o el cliente no tiene WhatsApp).

- [ ] **Step 1: tests**

```ts
// tests/cobros.test.ts
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
import { DB_HABILITADA, limpiarBase, sembrarBasico, sembrarCliente, sembrarProyecto } from "./ayuda-db";
import { sesionFalsa } from "./ayuda-sesion";
import { marcarPagado, anularCobro, agregarCobro, registrarRecordatorio } from "@/acciones/cobros";
import { mensajeDeCobro, enlaceWhatsappCobro } from "@/lib/mensajes-cobro";
import { hoyCaracas, sumarDias } from "@/lib/fecha-caracas";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe("mensajeDeCobro", () => {
  const plantillas = { recordatorio: "Hola {cliente}: {concepto} de {proyecto} por {monto} vence el {vence}. {enlace}", vencido: "{cliente}, venció el {vence}: {monto}" };
  it("rellena y usa la plantilla de vencido cuando toca; {enlace} queda vacio", () => {
    const c = { concepto: "mensualidad" as const, detalle: "octubre 2026", monto: 100, vence: "2026-10-05", estado: "por_vencer" as const };
    expect(mensajeDeCobro(c, { nombre: "PMS" }, { nombre: "Hotel X", contactoNombre: "Ana" }, plantillas)).toBe("Hola Ana: Mensualidad (octubre 2026) de PMS por $100,00 vence el 05/10/2026.");
    expect(mensajeDeCobro({ ...c, estado: "vencido" }, { nombre: "PMS" }, { nombre: "Hotel X", contactoNombre: "" }, plantillas)).toBe("Hotel X, venció el 05/10/2026: $100,00");
  });
  it("enlaceWhatsappCobro codifica y devuelve null sin celular", () => {
    expect(enlaceWhatsappCobro("584121234567", "Hola & adiós")).toBe("https://wa.me/584121234567?text=Hola%20%26%20adi%C3%B3s");
    expect(enlaceWhatsappCobro("", "x")).toBeNull();
  });
});

describe.runIf(DB_HABILITADA)("acciones de cobros", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  let proyectoId: number;
  beforeAll(async () => {
    await limpiarBase(); ids = await sembrarBasico();
    const c = await sembrarCliente({ nombre: "Hotel Cobros", whatsapp: "584129999999" });
    proyectoId = (await sembrarProyecto(c.id, ids.nichoId, { estado: "activo" })).id;
  });
  beforeEach(() => { sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" }; });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("el prospectador no toca cobros", async () => {
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
    await expect(anularCobro(1, "x")).rejects.toThrow("REDIRECT:/hoy");
  });

  it("agregarCobro valida y crea; pago_unico y mensualidad no se agregan a mano", async () => {
    expect((await agregarCobro(fd({ proyectoId: String(proyectoId), concepto: "mensualidad", detalle: "x", monto: "10", vence: "2026-10-01" }))).ok).toBe(false);
    expect((await agregarCobro(fd({ proyectoId: String(proyectoId), concepto: "extra", detalle: "Reportes", monto: "10,5x", vence: "2026-10-01" }))).ok).toBe(false);
    const r = await agregarCobro(fd({ proyectoId: String(proyectoId), concepto: "extra", detalle: "Módulo de reportes", monto: "350", vence: "2026-10-01" }));
    expect(r.ok).toBe(true);
    const c = await prisma.cobro.findFirstOrThrow({ where: { proyectoId, concepto: "extra" } });
    expect(Number(c.monto)).toBe(350);
    expect(await prisma.evento.count({ where: { cobroId: c.id, tipo: "cobro_agregado" } })).toBe(1);
  });

  it("marcarPagado: dos toques cuentan uno; valida fecha y canal", async () => {
    const c = await prisma.cobro.findFirstOrThrow({ where: { proyectoId, concepto: "extra" } });
    const hoy = hoyCaracas();
    expect((await marcarPagado(fd({ cobroId: String(c.id), pagadoEn: sumarDias(hoy, 1), canal: "zelle", referencia: "", nota: "" }))).ok).toBe(false); // futuro
    expect((await marcarPagado(fd({ cobroId: String(c.id), pagadoEn: hoy, canal: "paloma", referencia: "", nota: "" }))).ok).toBe(false);
    const [a, b] = await Promise.all([
      marcarPagado(fd({ cobroId: String(c.id), pagadoEn: hoy, canal: "zelle", referencia: "Z-123", nota: "" })),
      marcarPagado(fd({ cobroId: String(c.id), pagadoEn: hoy, canal: "zelle", referencia: "Z-123", nota: "" })),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    const d = await prisma.cobro.findUniqueOrThrow({ where: { id: c.id } });
    expect(d.pagadoEn).not.toBeNull();
    expect(d.canal).toBe("zelle");
    expect(await prisma.evento.count({ where: { cobroId: c.id, tipo: "cobro_pagado" } })).toBe(1);
  });

  it("anularCobro exige motivo, no anula uno pagado, y un anulado no se paga", async () => {
    const pagado = await prisma.cobro.findFirstOrThrow({ where: { proyectoId, concepto: "extra" } });
    expect((await anularCobro(pagado.id, "error")).ok).toBe(false);
    const r = await agregarCobro(fd({ proyectoId: String(proyectoId), concepto: "cuota", detalle: "Cuota extra", monto: "100", vence: "2026-12-01" }));
    expect(r.ok).toBe(true);
    const c = await prisma.cobro.findFirstOrThrow({ where: { proyectoId, detalle: "Cuota extra" } });
    expect((await anularCobro(c.id, " ")).ok).toBe(false);
    expect((await anularCobro(c.id, "se acordó otra cosa")).ok).toBe(true);
    expect((await marcarPagado(fd({ cobroId: String(c.id), pagadoEn: hoyCaracas(), canal: "efectivo", referencia: "", nota: "" }))).ok).toBe(false);
    expect((await prisma.cobro.findUniqueOrThrow({ where: { id: c.id } })).anuladoMotivo).toBe("se acordó otra cosa");
  });

  it("registrarRecordatorio devuelve el enlace de WhatsApp una vez por dia", async () => {
    const r = await agregarCobro(fd({ proyectoId: String(proyectoId), concepto: "extra", detalle: "Soporte", monto: "40", vence: "2026-01-01" })); // vencido
    expect(r.ok).toBe(true);
    const c = await prisma.cobro.findFirstOrThrow({ where: { proyectoId, detalle: "Soporte" } });
    const a = await registrarRecordatorio(c.id);
    expect(a.ok).toBe(true);
    if (a.ok) { expect(a.datos.href).toMatch(/^https:\/\/wa\.me\/584129999999\?text=/); expect(decodeURIComponent(a.datos.href)).toContain("venció"); }
    const b = await registrarRecordatorio(c.id);
    expect(b).toEqual({ ok: false, mensaje: expect.stringContaining("hoy") });
    expect(await prisma.evento.count({ where: { cobroId: c.id, tipo: "recordatorio" } })).toBe(1);
  });

  it("registrarRecordatorio sin WhatsApp del cliente falla con mensaje claro", async () => {
    const c2 = await sembrarCliente({ nombre: "Sin Cel", whatsapp: "" });
    const p2 = await sembrarProyecto(c2.id, ids.nichoId, { estado: "activo" });
    await agregarCobro(fd({ proyectoId: String(p2.id), concepto: "extra", detalle: "x", monto: "1", vence: "2026-12-01" }));
    const c = await prisma.cobro.findFirstOrThrow({ where: { proyectoId: p2.id } });
    expect(await registrarRecordatorio(c.id)).toEqual({ ok: false, mensaje: expect.stringContaining("WhatsApp") });
  });
});
```

- [ ] **Step 2: `src/lib/mensajes-cobro.ts`**

```ts
// src/lib/mensajes-cobro.ts — arma el mensaje de cobro (puro).
import { rellenar } from "@/lib/plantilla-mensaje";
import { formatoUSD } from "@/lib/dinero";
import { ETIQUETA_CONCEPTO, type Concepto, type EstadoCobro } from "@/lib/cobros-contrato";

function fechaLarga(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export function mensajeDeCobro(
  c: { concepto: Concepto; detalle: string; monto: number; vence: string; estado: EstadoCobro },
  proyecto: { nombre: string }, cliente: { nombre: string; contactoNombre: string },
  plantillas: { recordatorio: string; vencido: string },
): string {
  const plantilla = c.estado === "vencido" ? plantillas.vencido : plantillas.recordatorio;
  const concepto = c.detalle ? `${ETIQUETA_CONCEPTO[c.concepto]} (${c.detalle})` : ETIQUETA_CONCEPTO[c.concepto];
  // {enlace} es el portal del cliente (pieza 5); hasta entonces va vacio.
  return rellenar(plantilla, { cliente: cliente.contactoNombre || cliente.nombre, proyecto: proyecto.nombre, monto: formatoUSD(c.monto), concepto, vence: fechaLarga(c.vence), enlace: "" }).replace(/\s+$/, "").replace(/\s{2,}/g, " ");
}

export function enlaceWhatsappCobro(whatsapp: string, mensaje: string): string | null {
  return whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(mensaje)}` : null;
}
```

- [ ] **Step 3: `src/acciones/cobros.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { exigirRol } from "@/lib/sesion";
import { hoyCaracas, esFechaIso } from "@/lib/fecha-caracas";
import { MONTO_TEXTO } from "@/lib/dinero";
import { CANALES_COBRO, estadoCobro, type Concepto } from "@/lib/cobros-contrato";
import { leerConfig, CLAVES } from "@/lib/configuracion";
import { mensajeDeCobro, enlaceWhatsappCobro } from "@/lib/mensajes-cobro";
import { fallo, exito, type Resultado } from "@/acciones/resultado";

// exigirRol("dueno") va FUERA del try/catch. Nada se borra: los cobros se anulan con motivo.
const ERROR = "No se pudo guardar. Intenta de nuevo.";
const Id = z.number().int().positive();
function refrescar(proyectoId: number) { revalidatePath("/proyectos"); revalidatePath(`/proyectos/${proyectoId}`); revalidatePath("/hoy"); }

const PagoZ = z.object({
  cobroId: z.coerce.number().int().positive(),
  pagadoEn: z.string().trim().refine(esFechaIso, "fecha"),
  canal: z.enum(CANALES_COBRO),
  referencia: z.string().trim().max(80).default(""),
  nota: z.string().trim().max(500).default(""),
});

export async function marcarPagado(formData: FormData): Promise<Resultado> {
  const u = await exigirRol("dueno");
  const e = PagoZ.safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("Revisa la fecha y el canal.");
  const d = e.data;
  if (d.pagadoEn > hoyCaracas()) return fallo("La fecha de pago no puede ser futura.");
  try {
    const c = await prisma.cobro.findUnique({ where: { id: d.cobroId }, select: { proyectoId: true, monto: true } });
    if (!c) return fallo("Ese cobro no existe.");
    // Mediodia de Caracas del dia elegido: el mes de Caracas del pago queda bien en cifrasDelMes.
    const r = await prisma.cobro.updateMany({ where: { id: d.cobroId, pagadoEn: null, anuladoEn: null }, data: { pagadoEn: new Date(`${d.pagadoEn}T12:00:00-04:00`), canal: d.canal, referencia: d.referencia, nota: d.nota } });
    if (r.count === 0) return fallo("Ese cobro ya estaba pagado o anulado.");
    await prisma.evento.create({ data: { proyectoId: c.proyectoId, cobroId: d.cobroId, usuarioId: u.id, tipo: "cobro_pagado", texto: `${Number(c.monto).toFixed(2)} por ${d.canal}${d.referencia ? ` (${d.referencia})` : ""}` } });
    refrescar(c.proyectoId);
    return exito();
  } catch (err) { console.error("marcarPagado", err); return fallo(ERROR); }
}

export async function anularCobro(cobroId: number, motivo: string): Promise<Resultado> {
  const u = await exigirRol("dueno");
  const e = z.object({ id: Id, motivo: z.string().trim().min(2).max(300) }).safeParse({ id: cobroId, motivo });
  if (!e.success) return fallo("Escribe el motivo.");
  try {
    const c = await prisma.cobro.findUnique({ where: { id: e.data.id }, select: { proyectoId: true } });
    if (!c) return fallo("Ese cobro no existe.");
    const r = await prisma.cobro.updateMany({ where: { id: e.data.id, pagadoEn: null, anuladoEn: null }, data: { anuladoEn: new Date(), anuladoMotivo: e.data.motivo } });
    if (r.count === 0) return fallo("Un cobro pagado no se anula (ni uno ya anulado).");
    await prisma.evento.create({ data: { proyectoId: c.proyectoId, cobroId: e.data.id, usuarioId: u.id, tipo: "cobro_anulado", texto: e.data.motivo } });
    refrescar(c.proyectoId);
    return exito();
  } catch (err) { console.error("anularCobro", err); return fallo(ERROR); }
}

const NuevoZ = z.object({
  proyectoId: z.coerce.number().int().positive(),
  concepto: z.enum(["cuota", "extra"]), // pago_unico nace con el proyecto; mensualidad la genera el cron
  detalle: z.string().trim().min(2).max(120),
  monto: z.string().trim().regex(MONTO_TEXTO),
  vence: z.string().trim().refine(esFechaIso, "fecha"),
});
export async function agregarCobro(formData: FormData): Promise<Resultado> {
  const u = await exigirRol("dueno");
  const e = NuevoZ.safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("Revisa concepto (cuota o extra), detalle, monto y fecha.");
  const d = e.data;
  try {
    const c = await prisma.cobro.create({ data: { proyectoId: d.proyectoId, concepto: d.concepto, detalle: d.detalle, monto: new Prisma.Decimal(d.monto.replace(",", ".")), vence: d.vence }, select: { id: true } });
    await prisma.evento.create({ data: { proyectoId: d.proyectoId, cobroId: c.id, usuarioId: u.id, tipo: "cobro_agregado", texto: `${d.concepto}: ${d.detalle}` } });
    refrescar(d.proyectoId);
    return exito();
  } catch (err) { console.error("agregarCobro", err); return fallo(ERROR); }
}

// Devuelve el enlace de WhatsApp con el mensaje y deja rastro. Una vez por dia de Caracas por cobro.
export async function registrarRecordatorio(cobroId: number): Promise<Resultado<{ href: string }>> {
  const u = await exigirRol("dueno");
  const e = Id.safeParse(cobroId);
  if (!e.success) return fallo(ERROR);
  try {
    const c = await prisma.cobro.findUnique({ where: { id: e.data }, include: { proyecto: { include: { cliente: true } } } });
    if (!c) return fallo("Ese cobro no existe.");
    if (c.pagadoEn || c.anuladoEn) return fallo("Ese cobro ya está pagado o anulado.");
    const hoy = hoyCaracas();
    const desde = new Date(`${hoy}T00:00:00-04:00`);
    if (await prisma.evento.findFirst({ where: { cobroId: c.id, tipo: "recordatorio", creadoEn: { gte: desde } }, select: { id: true } })) return fallo("Ya se recordó hoy. Mañana de nuevo.");
    const mensaje = mensajeDeCobro({ concepto: c.concepto as Concepto, detalle: c.detalle, monto: Number(c.monto), vence: c.vence, estado: estadoCobro(c, hoy) }, c.proyecto, c.proyecto.cliente,
      { recordatorio: await leerConfig(CLAVES.mensajeRecordatorio), vencido: await leerConfig(CLAVES.mensajeVencido) });
    const href = enlaceWhatsappCobro(c.proyecto.cliente.whatsapp, mensaje);
    if (!href) return fallo("El cliente no tiene WhatsApp cargado. Agrégalo en su ficha o copia el mensaje.");
    await prisma.evento.create({ data: { proyectoId: c.proyectoId, cobroId: c.id, usuarioId: u.id, tipo: "recordatorio", canal: "whatsapp", texto: c.detalle } });
    refrescar(c.proyectoId);
    return exito({ href });
  } catch (err) { console.error("registrarRecordatorio", err); return fallo(ERROR); }
}
```

- [ ] **Step 4: verificar y commit**

Run: `npm run test:db 2>&1 | tail -4 && npx tsc --noEmit`
Expected: todos `passed`.

```bash
git add -A && git commit -F - <<'EOF'
feat(proyectos): cobros - marcar pagado idempotente, anular con motivo, agregar y recordar por WhatsApp

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 6: Mensualidades automáticas — generador idempotente y cron dentro de la app

**Files:**
- Create: `src/lib/mensualidades.ts`, `src/instrumentation.ts`, `tests/mensualidades.test.ts`

**Interfaces:**
- Consumes: `mensualidadesQueTocan`, `mesDe` (T2); `hoyCaracas`.
- Produces: `generarMensualidades(hoy?: string): Promise<{ creadas: number; proyectos: number }>` (idempotente; recorre proyectos `activo`, crea `Cobro` `mensualidad` con `mes`, `detalle` «Mensualidad de octubre 2026», `vence`, y un `Evento` `cobro_agregado` con `texto: "mensualidad <mes>"`); `programarCron(): void` (corre una vez al arrancar y luego calcula el próximo 06:00 de Caracas; nunca dos timers).
- `src/instrumentation.ts`: `export async function register()` — solo en `process.env.NEXT_RUNTIME === "nodejs"` y **no** durante `next build` (`process.env.NEXT_PHASE !== "phase-production-build"`), importa dinámicamente `@/lib/mensualidades` y llama `programarCron()`.

- [ ] **Step 1: tests**

```ts
// tests/mensualidades.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, sembrarCliente, sembrarProyecto } from "./ayuda-db";
import { generarMensualidades, proximoDisparoMs } from "@/lib/mensualidades";

describe("proximoDisparoMs", () => {
  it("apunta a las 06:00 de Caracas siguientes", () => {
    // 2026-09-16 05:00 Caracas = 09:00Z -> falta 1 h
    expect(proximoDisparoMs(new Date("2026-09-16T09:00:00Z"))).toBe(60 * 60 * 1000);
    // 2026-09-16 06:00:01 Caracas -> manana a las 06:00 (menos 1 s)
    expect(proximoDisparoMs(new Date("2026-09-16T10:00:01Z"))).toBe(24 * 60 * 60 * 1000 - 1000);
  });
});

describe.runIf(DB_HABILITADA)("generarMensualidades", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  let activo: number, pausado: number;
  beforeAll(async () => {
    await limpiarBase(); ids = await sembrarBasico();
    const c = await sembrarCliente();
    activo = (await sembrarProyecto(c.id, ids.nichoId, { nombre: "Activo", estado: "activo", fechaInicio: "2026-08-01", diaCobroMensual: 20, mensualidad: "120.00" })).id;
    pausado = (await sembrarProyecto(c.id, ids.nichoId, { nombre: "Pausado", estado: "pausado", fechaInicio: "2026-08-01", diaCobroMensual: 20 })).id;
  });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("crea las que tocan, con monto de la mensualidad, y es idempotente", async () => {
    const r1 = await generarMensualidades("2026-09-16");
    expect(r1).toEqual({ creadas: 2, proyectos: 1 }); // agosto (perdida) y septiembre (en 4 dias)
    const cobros = await prisma.cobro.findMany({ where: { proyectoId: activo }, orderBy: { vence: "asc" } });
    expect(cobros.map((c) => [c.concepto, c.mes, c.vence, Number(c.monto), c.detalle])).toEqual([
      ["mensualidad", "2026-08", "2026-08-20", 120, "Mensualidad de agosto 2026"],
      ["mensualidad", "2026-09", "2026-09-20", 120, "Mensualidad de septiembre 2026"],
    ]);
    const r2 = await generarMensualidades("2026-09-16");
    expect(r2).toEqual({ creadas: 0, proyectos: 1 });
    expect(await prisma.cobro.count({ where: { proyectoId: pausado } })).toBe(0);
    expect(await prisma.evento.count({ where: { proyectoId: activo, tipo: "cobro_agregado" } })).toBe(2);
  });

  it("dos corridas simultaneas no duplican (unico proyecto+mes)", async () => {
    await Promise.all([generarMensualidades("2026-10-15"), generarMensualidades("2026-10-15")]);
    expect(await prisma.cobro.count({ where: { proyectoId: activo, mes: "2026-10" } })).toBe(1);
  });
});
```

- [ ] **Step 2: implementación**

```ts
// src/lib/mensualidades.ts
// Genera el cobro de mensualidad de cada proyecto activo cuando faltan 7 dias o
// menos para su dia de cobro. Idempotente: (proyectoId, mes) es unico en la base.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hoyCaracas } from "@/lib/fecha-caracas";
import { mensualidadesQueTocan } from "@/lib/cobros-contrato";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
function nombreMes(mes: string): string {
  const [a, m] = mes.split("-");
  return `${MESES[Number(m) - 1]} ${a}`;
}

export async function generarMensualidades(hoy = hoyCaracas()): Promise<{ creadas: number; proyectos: number }> {
  const proyectos = await prisma.proyecto.findMany({ where: { estado: "activo" }, select: { id: true, estado: true, diaCobroMensual: true, fechaInicio: true, mensualidad: true, cobros: { where: { concepto: "mensualidad" }, select: { mes: true } } } });
  let creadas = 0;
  for (const p of proyectos) {
    const existentes = p.cobros.map((c) => c.mes).filter((m): m is string => !!m);
    for (const { mes, vence } of mensualidadesQueTocan(p, hoy, existentes)) {
      try {
        const c = await prisma.cobro.create({ data: { proyectoId: p.id, concepto: "mensualidad", detalle: `Mensualidad de ${nombreMes(mes)}`, monto: p.mensualidad, vence, mes }, select: { id: true } });
        await prisma.evento.create({ data: { proyectoId: p.id, cobroId: c.id, tipo: "cobro_agregado", texto: `mensualidad ${mes}` } });
        creadas++;
      } catch (err) {
        // P2002: otra corrida lo creo primero. Es exactamente el caso idempotente.
        if (!(typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002")) throw err;
      }
    }
  }
  return { creadas, proyectos: proyectos.length };
}

// Milisegundos hasta las proximas 06:00 de Caracas (UTC-4 fijo => 10:00Z).
export function proximoDisparoMs(ahora = new Date()): number {
  const objetivo = new Date(ahora);
  objetivo.setUTCHours(10, 0, 0, 0);
  if (objetivo.getTime() <= ahora.getTime()) objetivo.setUTCDate(objetivo.getUTCDate() + 1);
  return objetivo.getTime() - ahora.getTime();
}

let programado = false;
export function programarCron(): void {
  if (programado) return;
  programado = true;
  const correr = () => generarMensualidades().then((r) => { if (r.creadas) console.log(`[mensualidades] ${r.creadas} creadas`); }).catch((e) => console.error("[mensualidades]", e));
  const siguiente = () => { const t = setTimeout(() => { correr().finally(siguiente); }, proximoDisparoMs()); t.unref(); };
  correr().finally(siguiente);
}
```

```ts
// src/instrumentation.ts — arranca el cron de mensualidades con el servidor.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { programarCron } = await import("@/lib/mensualidades");
  programarCron();
}
```

- [ ] **Step 3: verificar y commit**

Run: `npm run test:db 2>&1 | tail -4 && npx tsc --noEmit`
Expected: todos `passed`. (`next dev`/`next start` cargan `src/instrumentation.ts` solos en Next 15; nada que configurar.)

```bash
git add -A && git commit -F - <<'EOF'
feat(proyectos): mensualidades automaticas idempotentes y cron a las 06:00 de Caracas

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 7: Pendientes y horas

**Files:**
- Create: `src/acciones/pendientes.ts`, `src/acciones/horas.ts`, `tests/pendientes-horas.test.ts`

**Interfaces:**
- Consumes: `hoyCaracas`, `esFechaIso`; `leerTarifaHora` (T4); `MONTO_TEXTO`; `exigirRol`.
- Produces (`pendientes.ts`): `agregarPendiente(formData)` (`proyectoId`, `texto`, `visibleCliente?`, `fechaEstimada?`) → `Resultado<{ id }>`; `marcarPendiente(id, hecho: boolean)` (fija `hechoEn`; deja `Evento` `hito_cumplido` solo si `visibleCliente` y `hecho`); `alternarVisible(id)`; `moverPendiente(id, direccion: "arriba" | "abajo")` (intercambia `orden` con el vecino); `eliminarPendiente(id)` (única eliminación permitida de la pieza).
- Produces (`horas.ts`): `registrarHoras(formData)` (`proyectoId`, `fecha` ≤ hoy, `horas` ≥ 0.25 en pasos de 0.25, `descripcion`) → `Resultado`; `eliminarHoras(id)` (solo el mismo día de Caracas en que se registró; después queda).

- [ ] **Step 1: tests**

```ts
// tests/pendientes-horas.test.ts
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
import { DB_HABILITADA, limpiarBase, sembrarBasico, sembrarCliente, sembrarProyecto } from "./ayuda-db";
import { sesionFalsa } from "./ayuda-sesion";
import { agregarPendiente, marcarPendiente, alternarVisible, moverPendiente, eliminarPendiente } from "@/acciones/pendientes";
import { registrarHoras, eliminarHoras } from "@/acciones/horas";
import { fichaProyecto } from "@/lib/proyectos";
import { hoyCaracas, sumarDias } from "@/lib/fecha-caracas";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe.runIf(DB_HABILITADA)("pendientes y horas", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  let proyectoId: number;
  beforeAll(async () => {
    await limpiarBase(); ids = await sembrarBasico();
    const c = await sembrarCliente();
    proyectoId = (await sembrarProyecto(c.id, ids.nichoId, { horasCotizadas: "10" })).id;
  });
  beforeEach(() => { sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" }; });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("pendientes: agregar, ordenar, marcar (con evento solo si visible), alternar y eliminar", async () => {
    const a = await agregarPendiente(fd({ proyectoId: String(proyectoId), texto: "Módulo de reservas", visibleCliente: "on", fechaEstimada: "2026-10-15" }));
    const b = await agregarPendiente(fd({ proyectoId: String(proyectoId), texto: "Refactorizar cron" }));
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    let f = (await fichaProyecto(proyectoId, hoyCaracas()))!;
    expect(f.pendientes.map((p) => p.texto)).toEqual(["Módulo de reservas", "Refactorizar cron"]);
    expect(f.avance).toBe(0);
    expect((await moverPendiente(b.datos.id, "arriba")).ok).toBe(true);
    f = (await fichaProyecto(proyectoId, hoyCaracas()))!;
    expect(f.pendientes.map((p) => p.texto)).toEqual(["Refactorizar cron", "Módulo de reservas"]);
    expect((await marcarPendiente(b.datos.id, true)).ok).toBe(true); // interno: sin evento
    expect((await marcarPendiente(a.datos.id, true)).ok).toBe(true); // visible: evento hito_cumplido
    expect(await prisma.evento.count({ where: { proyectoId, tipo: "hito_cumplido" } })).toBe(1);
    f = (await fichaProyecto(proyectoId, hoyCaracas()))!;
    expect(f.avance).toBe(100);
    expect((await alternarVisible(b.datos.id)).ok).toBe(true);
    f = (await fichaProyecto(proyectoId, hoyCaracas()))!;
    expect(f.avance).toBe(100); // los dos visibles y hechos
    expect((await eliminarPendiente(b.datos.id)).ok).toBe(true);
    expect(await prisma.pendiente.count({ where: { proyectoId } })).toBe(1);
    expect((await agregarPendiente(fd({ proyectoId: String(proyectoId), texto: "x" }))).ok).toBe(false); // muy corto
  });

  it("horas: valida fecha y pasos de 0.25, suma en la ficha y solo se borra el mismo dia", async () => {
    const hoy = hoyCaracas();
    expect((await registrarHoras(fd({ proyectoId: String(proyectoId), fecha: sumarDias(hoy, 1), horas: "2", descripcion: "x" }))).ok).toBe(false);
    expect((await registrarHoras(fd({ proyectoId: String(proyectoId), fecha: hoy, horas: "0.1", descripcion: "x" }))).ok).toBe(false);
    expect((await registrarHoras(fd({ proyectoId: String(proyectoId), fecha: hoy, horas: "2.3", descripcion: "x" }))).ok).toBe(false);
    expect((await registrarHoras(fd({ proyectoId: String(proyectoId), fecha: hoy, horas: "2.5", descripcion: "Reservas" }))).ok).toBe(true);
    expect((await registrarHoras(fd({ proyectoId: String(proyectoId), fecha: "2026-09-01", horas: "8", descripcion: "Base de datos" }))).ok).toBe(true);
    const f = (await fichaProyecto(proyectoId, hoy))!;
    expect(f.horasReales).toBe(10.5);
    expect(f.horasCotizadas).toBe(10);
    expect(f.horas[0].usuarioNombre).toBe("Neri");
    const vieja = await prisma.horas.findFirstOrThrow({ where: { proyectoId, fecha: "2026-09-01" } });
    await prisma.horas.update({ where: { id: vieja.id }, data: { creadoEn: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } });
    expect((await eliminarHoras(vieja.id)).ok).toBe(false);
    const deHoy = await prisma.horas.findFirstOrThrow({ where: { proyectoId, fecha: hoy } });
    expect((await eliminarHoras(deHoy.id)).ok).toBe(true);
    expect(await prisma.evento.count({ where: { proyectoId, tipo: "horas" } })).toBe(2);
  });
});
```

- [ ] **Step 2: implementación**

```ts
// src/acciones/pendientes.ts
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { exigirRol } from "@/lib/sesion";
import { esFechaIso } from "@/lib/fecha-caracas";
import { fallo, exito, type Resultado } from "@/acciones/resultado";

// exigirRol("dueno") FUERA del try/catch. Un pendiente es un item de lista: es lo unico
// de la pieza que si se elimina.
const ERROR = "No se pudo guardar. Intenta de nuevo.";
const Id = z.number().int().positive();
const refrescar = (proyectoId: number) => { revalidatePath(`/proyectos/${proyectoId}`); revalidatePath("/proyectos"); };

const NuevoZ = z.object({
  proyectoId: z.coerce.number().int().positive(),
  texto: z.string().trim().min(2).max(200),
  visibleCliente: z.string().optional(),
  fechaEstimada: z.string().trim().optional().transform((s) => (s ? s : undefined)).refine((s) => !s || esFechaIso(s), "fecha"),
});
export async function agregarPendiente(formData: FormData): Promise<Resultado<{ id: number }>> {
  await exigirRol("dueno");
  const e = NuevoZ.safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("Escribe el pendiente (2 a 200 letras) y una fecha válida si la pones.");
  const d = e.data;
  try {
    const max = await prisma.pendiente.aggregate({ where: { proyectoId: d.proyectoId }, _max: { orden: true } });
    const p = await prisma.pendiente.create({ data: { proyectoId: d.proyectoId, texto: d.texto, visibleCliente: d.visibleCliente === "on", fechaEstimada: d.fechaEstimada ?? null, orden: (max._max.orden ?? 0) + 1 }, select: { id: true } });
    refrescar(d.proyectoId);
    return exito({ id: p.id });
  } catch (err) { console.error("agregarPendiente", err); return fallo(ERROR); }
}

export async function marcarPendiente(id: number, hecho: boolean): Promise<Resultado> {
  const u = await exigirRol("dueno");
  const e = z.object({ id: Id, hecho: z.boolean() }).safeParse({ id, hecho });
  if (!e.success) return fallo(ERROR);
  try {
    const p = await prisma.pendiente.findUnique({ where: { id: e.data.id } });
    if (!p) return fallo("Ese pendiente ya no existe.");
    const r = await prisma.pendiente.updateMany({ where: { id: p.id, hecho: !e.data.hecho }, data: { hecho: e.data.hecho, hechoEn: e.data.hecho ? new Date() : null } });
    if (r.count === 1 && e.data.hecho && p.visibleCliente) await prisma.evento.create({ data: { proyectoId: p.proyectoId, usuarioId: u.id, tipo: "hito_cumplido", texto: p.texto } });
    refrescar(p.proyectoId);
    return exito();
  } catch (err) { console.error("marcarPendiente", err); return fallo(ERROR); }
}

export async function alternarVisible(id: number): Promise<Resultado> {
  await exigirRol("dueno");
  const e = Id.safeParse(id);
  if (!e.success) return fallo(ERROR);
  try {
    const p = await prisma.pendiente.findUnique({ where: { id: e.data } });
    if (!p) return fallo("Ese pendiente ya no existe.");
    await prisma.pendiente.update({ where: { id: p.id }, data: { visibleCliente: !p.visibleCliente } });
    refrescar(p.proyectoId);
    return exito();
  } catch (err) { console.error("alternarVisible", err); return fallo(ERROR); }
}

export async function moverPendiente(id: number, direccion: "arriba" | "abajo"): Promise<Resultado> {
  await exigirRol("dueno");
  const e = z.object({ id: Id, direccion: z.enum(["arriba", "abajo"]) }).safeParse({ id, direccion });
  if (!e.success) return fallo(ERROR);
  try {
    const p = await prisma.pendiente.findUnique({ where: { id: e.data.id } });
    if (!p) return fallo("Ese pendiente ya no existe.");
    const vecino = await prisma.pendiente.findFirst({
      where: { proyectoId: p.proyectoId, orden: e.data.direccion === "arriba" ? { lt: p.orden } : { gt: p.orden } },
      orderBy: { orden: e.data.direccion === "arriba" ? "desc" : "asc" },
    });
    if (!vecino) return exito(); // ya esta en el extremo
    await prisma.$transaction([
      prisma.pendiente.update({ where: { id: p.id }, data: { orden: vecino.orden } }),
      prisma.pendiente.update({ where: { id: vecino.id }, data: { orden: p.orden } }),
    ]);
    refrescar(p.proyectoId);
    return exito();
  } catch (err) { console.error("moverPendiente", err); return fallo(ERROR); }
}

export async function eliminarPendiente(id: number): Promise<Resultado> {
  await exigirRol("dueno");
  const e = Id.safeParse(id);
  if (!e.success) return fallo(ERROR);
  try {
    const p = await prisma.pendiente.findUnique({ where: { id: e.data }, select: { proyectoId: true } });
    if (!p) return exito();
    await prisma.pendiente.delete({ where: { id: e.data } });
    refrescar(p.proyectoId);
    return exito();
  } catch (err) { console.error("eliminarPendiente", err); return fallo(ERROR); }
}
```

```ts
// src/acciones/horas.ts
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { exigirRol } from "@/lib/sesion";
import { hoyCaracas, esFechaIso } from "@/lib/fecha-caracas";
import { fallo, exito, type Resultado } from "@/acciones/resultado";

// Horas: control interno del dueno. Nunca salen al portal del cliente (pieza 5).
const ERROR = "No se pudo guardar. Intenta de nuevo.";
const HORAS = /^\d{1,3}([.,](25|5|50|75|0|00))?$/; // pasos de 0.25

const NuevoZ = z.object({
  proyectoId: z.coerce.number().int().positive(),
  fecha: z.string().trim().refine(esFechaIso, "fecha"),
  horas: z.string().trim().regex(HORAS),
  descripcion: z.string().trim().min(1).max(300),
});
export async function registrarHoras(formData: FormData): Promise<Resultado> {
  const u = await exigirRol("dueno");
  const e = NuevoZ.safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("Horas en pasos de 0,25 (0,25 · 0,5 · 0,75 · 1 …), fecha válida y qué hiciste.");
  const d = e.data;
  const horas = Number(d.horas.replace(",", "."));
  if (horas < 0.25) return fallo("Mínimo 0,25 horas.");
  if (d.fecha > hoyCaracas()) return fallo("La fecha no puede ser futura.");
  try {
    await prisma.horas.create({ data: { proyectoId: d.proyectoId, fecha: d.fecha, horas: new Prisma.Decimal(horas.toFixed(2)), descripcion: d.descripcion, usuarioId: u.id } });
    await prisma.evento.create({ data: { proyectoId: d.proyectoId, usuarioId: u.id, tipo: "horas", texto: `${horas} h: ${d.descripcion}` } });
    revalidatePath(`/proyectos/${d.proyectoId}`);
    return exito();
  } catch (err) { console.error("registrarHoras", err); return fallo(ERROR); }
}

// Solo se borra el mismo dia de Caracas en que se registro (error de tipeo). Despues queda.
export async function eliminarHoras(id: number): Promise<Resultado> {
  await exigirRol("dueno");
  const e = z.number().int().positive().safeParse(id);
  if (!e.success) return fallo(ERROR);
  try {
    const h = await prisma.horas.findUnique({ where: { id: e.data } });
    if (!h) return exito();
    const desde = new Date(`${hoyCaracas()}T00:00:00-04:00`);
    if (h.creadoEn < desde) return fallo("Solo se borra el mismo día que se registró.");
    await prisma.horas.delete({ where: { id: e.data } });
    revalidatePath(`/proyectos/${h.proyectoId}`);
    return exito();
  } catch (err) { console.error("eliminarHoras", err); return fallo(ERROR); }
}
```

- [ ] **Step 3: verificar y commit**

Run: `npm run test:db 2>&1 | tail -4 && npx tsc --noEmit`
Expected: todos `passed`.

```bash
git add -A && git commit -F - <<'EOF'
feat(proyectos): pendientes con avance visible y horas cotizadas vs reales

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 8: Versiones SemVer con changelog

**Files:**
- Create: `src/acciones/versiones.ts`, `tests/versiones.test.ts`

**Interfaces:**
- Consumes: `esSemver`, `compararSemver`, `parsearChangelog`, `TIPOS_CAMBIO` (T3); `esFechaIso`, `hoyCaracas`; `exigirRol`; `fichaProyecto` (T4, para los tests).
- Produces: `publicarVersion(formData)` (`proyectoId`, `version`, `fecha`, y **o** `cambios` como JSON `[{tipo,texto}]` **o** `markdown` para parsear) → `Resultado<{ id }>`; debe ser mayor que la versión actual del proyecto; `editarVersion(formData)` (mismos campos + `id`; solo si `avisadoEn` es nulo; reemplaza los cambios); `marcarAvisada(id)` → `Resultado<{ href: string | null }>` (fija `avisadoEn`, deja `Evento` `aviso_cliente`, devuelve el enlace de WhatsApp al cliente con «Publicamos la versión X de <proyecto>: …» o `null` si no hay celular).

- [ ] **Step 1: tests**

```ts
// tests/versiones.test.ts
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
import { DB_HABILITADA, limpiarBase, sembrarBasico, sembrarCliente, sembrarProyecto } from "./ayuda-db";
import { sesionFalsa } from "./ayuda-sesion";
import { publicarVersion, editarVersion, marcarAvisada } from "@/acciones/versiones";
import { fichaProyecto } from "@/lib/proyectos";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe.runIf(DB_HABILITADA)("versiones", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  let proyectoId: number;
  beforeAll(async () => {
    await limpiarBase(); ids = await sembrarBasico();
    const c = await sembrarCliente({ nombre: "Hotel Versiones", whatsapp: "584127777777" });
    proyectoId = (await sembrarProyecto(c.id, ids.nichoId, { estado: "activo" })).id;
  });
  beforeEach(() => { sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" }; });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("publica desde markdown, exige semver creciente y unico", async () => {
    const md = "### Nuevo\n- Reporte de ocupación\n### Arreglo\n- Cierre de caja";
    expect((await publicarVersion(fd({ proyectoId: String(proyectoId), version: "v1.0.0", fecha: "2026-09-10", markdown: md }))).ok).toBe(false);
    expect((await publicarVersion(fd({ proyectoId: String(proyectoId), version: "1.0.0", fecha: "2026-09-10", markdown: "" }))).ok).toBe(false); // sin cambios
    const r = await publicarVersion(fd({ proyectoId: String(proyectoId), version: "1.0.0", fecha: "2026-09-10", markdown: md }));
    expect(r.ok).toBe(true);
    expect((await publicarVersion(fd({ proyectoId: String(proyectoId), version: "1.0.0", fecha: "2026-09-11", markdown: md }))).ok).toBe(false); // repetida
    expect((await publicarVersion(fd({ proyectoId: String(proyectoId), version: "0.9.0", fecha: "2026-09-11", markdown: md }))).ok).toBe(false); // menor
    const f = (await fichaProyecto(proyectoId, "2026-09-16"))!;
    expect(f.versionActual).toBe("1.0.0");
    expect(f.versiones[0].cambios.map((c) => [c.tipo, c.texto])).toEqual([["nuevo", "Reporte de ocupación"], ["arreglo", "Cierre de caja"]]);
    expect(await prisma.evento.count({ where: { proyectoId, tipo: "version_publicada" } })).toBe(1);
  });

  it("publica desde JSON de cambios y ordena numericamente", async () => {
    const r = await publicarVersion(fd({ proyectoId: String(proyectoId), version: "1.10.0", fecha: "2026-09-12", cambios: JSON.stringify([{ tipo: "mejora", texto: "Búsqueda más rápida" }]) }));
    expect(r.ok).toBe(true);
    await publicarVersion(fd({ proyectoId: String(proyectoId), version: "1.10.1", fecha: "2026-09-13", cambios: JSON.stringify([{ tipo: "arreglo", texto: "Tilde" }]) }));
    const f = (await fichaProyecto(proyectoId, "2026-09-16"))!;
    expect(f.versiones.map((v) => v.version)).toEqual(["1.10.1", "1.10.0", "1.0.0"]);
    expect((await publicarVersion(fd({ proyectoId: String(proyectoId), version: "2.0.0", fecha: "2026-09-13", cambios: JSON.stringify([{ tipo: "raro", texto: "x" }]) }))).ok).toBe(false);
  });

  it("editar solo antes de avisar; avisar fija avisadoEn y devuelve el enlace", async () => {
    const v = await prisma.version.findFirstOrThrow({ where: { proyectoId, version: "1.10.1" } });
    expect((await editarVersion(fd({ id: String(v.id), proyectoId: String(proyectoId), version: "1.10.1", fecha: "2026-09-14", cambios: JSON.stringify([{ tipo: "arreglo", texto: "Tilde en reportes" }]) }))).ok).toBe(true);
    const a = await marcarAvisada(v.id);
    expect(a.ok).toBe(true);
    if (a.ok) { expect(a.datos.href).toMatch(/^https:\/\/wa\.me\/584127777777\?text=/); expect(decodeURIComponent(a.datos.href!)).toContain("1.10.1"); }
    expect((await marcarAvisada(v.id)).ok).toBe(false); // ya avisada
    expect((await editarVersion(fd({ id: String(v.id), proyectoId: String(proyectoId), version: "1.10.1", fecha: "2026-09-14", cambios: JSON.stringify([{ tipo: "arreglo", texto: "otra" }]) }))).ok).toBe(false);
    const d = await prisma.version.findUniqueOrThrow({ where: { id: v.id }, include: { cambios: true } });
    expect(d.avisadoEn).not.toBeNull();
    expect(d.cambios[0].texto).toBe("Tilde en reportes");
    expect(await prisma.evento.count({ where: { proyectoId, tipo: "aviso_cliente" } })).toBe(1);
  });
});
```

- [ ] **Step 2: implementación**

```ts
// src/acciones/versiones.ts
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { exigirRol } from "@/lib/sesion";
import { esFechaIso } from "@/lib/fecha-caracas";
import { esSemver, compararSemver, parsearChangelog, TIPOS_CAMBIO, ETIQUETA_CAMBIO } from "@/lib/semver-contrato";
import { fallo, exito, type Resultado } from "@/acciones/resultado";

// exigirRol("dueno") FUERA del try/catch. Una version avisada al cliente no se edita: se corrige con otra.
const ERROR = "No se pudo guardar. Intenta de nuevo.";
const CambioZ = z.object({ tipo: z.enum(TIPOS_CAMBIO), texto: z.string().trim().min(2).max(300) });
const BaseZ = z.object({
  proyectoId: z.coerce.number().int().positive(),
  version: z.string().trim().refine(esSemver, "semver"),
  fecha: z.string().trim().refine(esFechaIso, "fecha"),
  cambios: z.string().optional(),
  markdown: z.string().optional(),
});

// Cambios: vienen como JSON (formulario) o como bloque de CHANGELOG.md pegado.
function cambiosDe(d: { cambios?: string; markdown?: string }): z.infer<typeof CambioZ>[] | null {
  if (d.cambios) {
    try { const r = z.array(CambioZ).min(1).safeParse(JSON.parse(d.cambios)); return r.success ? r.data : null; } catch { return null; }
  }
  const parseados = parsearChangelog(d.markdown ?? "");
  const r = z.array(CambioZ).min(1).safeParse(parseados);
  return r.success ? r.data : null;
}

const refrescar = (proyectoId: number) => { revalidatePath(`/proyectos/${proyectoId}`); revalidatePath("/proyectos"); };

export async function publicarVersion(formData: FormData): Promise<Resultado<{ id: number }>> {
  const u = await exigirRol("dueno");
  const e = BaseZ.safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("La versión va como MAYOR.MENOR.PARCHE (ej. 1.4.2) y la fecha en formato válido.");
  const cambios = cambiosDe(e.data);
  if (!cambios) return fallo("Agrega al menos un cambio (nuevo, mejora o arreglo).");
  const d = e.data;
  try {
    const actual = await prisma.version.findMany({ where: { proyectoId: d.proyectoId }, select: { version: true } });
    const mayor = actual.map((v) => v.version).sort(compararSemver).at(-1);
    if (mayor && compararSemver(d.version, mayor) <= 0) return fallo(`La versión debe ser mayor que la actual (${mayor}).`);
    const v = await prisma.version.create({ data: { proyectoId: d.proyectoId, version: d.version, fecha: d.fecha, cambios: { create: cambios.map((c, i) => ({ ...c, orden: i })) } }, select: { id: true } });
    await prisma.evento.create({ data: { proyectoId: d.proyectoId, usuarioId: u.id, tipo: "version_publicada", texto: d.version } });
    refrescar(d.proyectoId);
    return exito({ id: v.id });
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002") return fallo("Esa versión ya existe en este proyecto.");
    console.error("publicarVersion", err); return fallo(ERROR);
  }
}

export async function editarVersion(formData: FormData): Promise<Resultado> {
  await exigirRol("dueno");
  const e = BaseZ.extend({ id: z.coerce.number().int().positive() }).safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("La versión va como MAYOR.MENOR.PARCHE y la fecha en formato válido.");
  const cambios = cambiosDe(e.data);
  if (!cambios) return fallo("Agrega al menos un cambio.");
  const d = e.data;
  try {
    const v = await prisma.version.findUnique({ where: { id: d.id }, select: { avisadoEn: true, proyectoId: true } });
    if (!v || v.proyectoId !== d.proyectoId) return fallo("Esa versión no existe.");
    if (v.avisadoEn) return fallo("Esta versión ya se avisó al cliente: corrígela publicando otra.");
    await prisma.$transaction([
      prisma.cambio.deleteMany({ where: { versionId: d.id } }),
      prisma.version.update({ where: { id: d.id }, data: { version: d.version, fecha: d.fecha, cambios: { create: cambios.map((c, i) => ({ ...c, orden: i })) } } }),
    ]);
    refrescar(d.proyectoId);
    return exito();
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002") return fallo("Esa versión ya existe en este proyecto.");
    console.error("editarVersion", err); return fallo(ERROR);
  }
}

export async function marcarAvisada(versionId: number): Promise<Resultado<{ href: string | null }>> {
  const u = await exigirRol("dueno");
  const e = z.number().int().positive().safeParse(versionId);
  if (!e.success) return fallo(ERROR);
  try {
    const v = await prisma.version.findUnique({ where: { id: e.data }, include: { cambios: { orderBy: { orden: "asc" } }, proyecto: { include: { cliente: true } } } });
    if (!v) return fallo("Esa versión no existe.");
    const r = await prisma.version.updateMany({ where: { id: v.id, avisadoEn: null }, data: { avisadoEn: new Date() } });
    if (r.count === 0) return fallo("Esta versión ya se avisó.");
    await prisma.evento.create({ data: { proyectoId: v.proyectoId, usuarioId: u.id, tipo: "aviso_cliente", texto: `versión ${v.version}` } });
    const lineas = v.cambios.map((c) => `• ${ETIQUETA_CAMBIO[c.tipo as keyof typeof ETIQUETA_CAMBIO] ?? c.tipo}: ${c.texto}`).join("\n");
    const quien = v.proyecto.cliente.contactoNombre || v.proyecto.cliente.nombre;
    const mensaje = `Buenas, ${quien}. Publicamos la versión ${v.version} de ${v.proyecto.nombre}:\n${lineas}\nCualquier duda me escribe por aquí.`;
    const href = v.proyecto.cliente.whatsapp ? `https://wa.me/${v.proyecto.cliente.whatsapp}?text=${encodeURIComponent(mensaje)}` : null;
    refrescar(v.proyectoId);
    return exito({ href });
  } catch (err) { console.error("marcarAvisada", err); return fallo(ERROR); }
}
```

- [ ] **Step 3: verificar y commit**

Run: `npm run test:db 2>&1 | tail -4 && npx tsc --noEmit`
Expected: todos `passed`.

```bash
git add -A && git commit -F - <<'EOF'
feat(proyectos): versiones SemVer con changelog pegado y aviso al cliente

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 9: Ajustes — mensajes de cobro, datos del emisor y tarifa por hora

**Files:**
- Modify: `src/acciones/ajustes.ts`, `src/app/(panel)/ajustes/page.tsx`
- Create: `src/componentes/FormularioAjustesCobros.tsx`, `tests/ajustes-cobros.test.ts`

**Interfaces:**
- Consumes: `leerConfig`, `guardarConfig`, `leerEmisor`, `leerTarifaHora`, `CLAVES` (T4); `exigirRol`.
- Produces (en `src/acciones/ajustes.ts`): `guardarMensajesCobro(formData)` (`recordatorio`, `vencido`; 10–1000 caracteres; ambos deben llevar `{monto}` y `{vence}`), `guardarDatosEmisor(formData)` (`nombre` 2–80, `rif` ≤ 20 en mayúsculas, `whatsapp` normalizado, `email` ≤ 120), `guardarTarifa(formData)` (`tarifa` número 1–500).

- [ ] **Step 1: tests**

```ts
// tests/ajustes-cobros.test.ts
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
import { DB_HABILITADA, limpiarBase, sembrarBasico } from "./ayuda-db";
import { sesionFalsa } from "./ayuda-sesion";
import { guardarMensajesCobro, guardarDatosEmisor, guardarTarifa } from "@/acciones/ajustes";
import { leerConfig, leerEmisor, leerTarifaHora, CLAVES } from "@/lib/configuracion";

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };

describe.runIf(DB_HABILITADA)("ajustes de cobros", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  beforeAll(async () => { await limpiarBase(); ids = await sembrarBasico(); });
  beforeEach(() => { sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" }; });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("solo el dueno", async () => {
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
    await expect(guardarTarifa(fd({ tarifa: "20" }))).rejects.toThrow("REDIRECT:/hoy");
  });
  it("mensajes exigen {monto} y {vence}", async () => {
    expect((await guardarMensajesCobro(fd({ recordatorio: "Hola {cliente}, paga {monto}", vencido: "Venció {vence}" }))).ok).toBe(false);
    expect((await guardarMensajesCobro(fd({ recordatorio: "Hola {cliente}: {monto} vence {vence}", vencido: "Venció el {vence}: {monto}" }))).ok).toBe(true);
    expect(await leerConfig(CLAVES.mensajeVencido)).toBe("Venció el {vence}: {monto}");
  });
  it("emisor normaliza y tarifa valida rango", async () => {
    expect((await guardarDatosEmisor(fd({ nombre: "Neri Colón", rif: "v-12345678-9", whatsapp: "0412 322 9005", email: "neracosu@gmail.com" }))).ok).toBe(true);
    expect(await leerEmisor()).toEqual({ nombre: "Neri Colón", rif: "V-12345678-9", whatsapp: "584123229005", email: "neracosu@gmail.com" });
    expect((await guardarTarifa(fd({ tarifa: "0" }))).ok).toBe(false);
    expect((await guardarTarifa(fd({ tarifa: "22.5" }))).ok).toBe(true);
    expect(await leerTarifaHora()).toBe(22.5);
  });
});
```

- [ ] **Step 2: acciones (agregar al final de `src/acciones/ajustes.ts`, con los imports nuevos arriba: `guardarConfig`, `CLAVES` de `@/lib/configuracion`, `normalizarCelular` de `@/lib/celular-contrato`)**

```ts
const MensajesZ = z.object({
  recordatorio: z.string().trim().min(10).max(1000).refine((s) => s.includes("{monto}") && s.includes("{vence}"), "variables"),
  vencido: z.string().trim().min(10).max(1000).refine((s) => s.includes("{monto}") && s.includes("{vence}"), "variables"),
});
export async function guardarMensajesCobro(formData: FormData): Promise<Resultado> {
  await exigirRol("dueno");
  const e = MensajesZ.safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("Los dos mensajes llevan {monto} y {vence} (y entre 10 y 1000 caracteres).");
  try {
    await guardarConfig(CLAVES.mensajeRecordatorio, e.data.recordatorio);
    await guardarConfig(CLAVES.mensajeVencido, e.data.vencido);
    revalidatePath("/ajustes");
    return exito();
  } catch (err) { console.error("guardarMensajesCobro", err); return fallo(ERROR); }
}

const EmisorZ = z.object({ nombre: z.string().trim().min(2).max(80), rif: z.string().trim().max(20).default(""), whatsapp: z.string().trim().max(40).default(""), email: z.string().trim().max(120).default("") });
export async function guardarDatosEmisor(formData: FormData): Promise<Resultado> {
  await exigirRol("dueno");
  const e = EmisorZ.safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("Revisa el nombre (2 a 80 letras).");
  try {
    await guardarConfig(CLAVES.emisor, JSON.stringify({ nombre: e.data.nombre, rif: e.data.rif.toUpperCase(), whatsapp: normalizarCelular(e.data.whatsapp), email: e.data.email }));
    revalidatePath("/ajustes");
    return exito();
  } catch (err) { console.error("guardarDatosEmisor", err); return fallo(ERROR); }
}

export async function guardarTarifa(formData: FormData): Promise<Resultado> {
  await exigirRol("dueno");
  const e = z.object({ tarifa: z.coerce.number().min(1).max(500) }).safeParse(Object.fromEntries(formData));
  if (!e.success) return fallo("La tarifa va entre 1 y 500 dólares por hora.");
  try {
    await guardarConfig(CLAVES.tarifaHora, String(e.data.tarifa));
    revalidatePath("/ajustes");
    return exito();
  } catch (err) { console.error("guardarTarifa", err); return fallo(ERROR); }
}
```

- [ ] **Step 3: formulario y página**

```tsx
// src/componentes/FormularioAjustesCobros.tsx
"use client";
import { useState, useTransition } from "react";
import { guardarMensajesCobro, guardarDatosEmisor, guardarTarifa } from "@/acciones/ajustes";
import type { DatosEmisor } from "@/lib/configuracion";

function useEnvio() {
  const [msj, setMsj] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendiente, empezar] = useTransition();
  const enviar = (fn: () => Promise<{ ok: boolean; mensaje?: string }>) => empezar(async () => { const r = await fn(); setMsj(r.ok ? { ok: true, texto: "Guardado." } : { ok: false, texto: r.mensaje ?? "Error" }); });
  return { msj, pendiente, enviar };
}

export function FormularioMensajesCobro({ recordatorio, vencido }: { recordatorio: string; vencido: string }) {
  const { msj, pendiente, enviar } = useEnvio();
  return (
    <form className="tarjeta" action={(fd) => enviar(() => guardarMensajesCobro(fd))}>
      <b>Mensajes de cobro</b>
      <p className="suave">Variables: {"{cliente} {proyecto} {monto} {concepto} {vence} {enlace}"}. {"{enlace}"} queda vacío hasta que exista el portal del cliente.</p>
      <label className="campo"><span>Recordatorio (antes de vencer)</span><textarea name="recordatorio" rows={4} defaultValue={recordatorio} /></label>
      <label className="campo"><span>Vencido</span><textarea name="vencido" rows={4} defaultValue={vencido} /></label>
      <button className="boton boton--primario" disabled={pendiente}>Guardar</button>
      {msj && <p className={msj.ok ? "suave" : "error"} role="status">{msj.texto}</p>}
    </form>
  );
}

export function FormularioEmisor({ emisor }: { emisor: DatosEmisor }) {
  const { msj, pendiente, enviar } = useEnvio();
  return (
    <form className="tarjeta" action={(fd) => enviar(() => guardarDatosEmisor(fd))}>
      <b>Datos del emisor (para los recibos)</b>
      <label className="campo"><span>Nombre</span><input name="nombre" defaultValue={emisor.nombre} required /></label>
      <label className="campo"><span>RIF</span><input name="rif" defaultValue={emisor.rif} /></label>
      <label className="campo"><span>WhatsApp</span><input name="whatsapp" inputMode="tel" defaultValue={emisor.whatsapp} /></label>
      <label className="campo"><span>Correo</span><input name="email" type="email" defaultValue={emisor.email} /></label>
      <button className="boton boton--primario" disabled={pendiente}>Guardar</button>
      {msj && <p className={msj.ok ? "suave" : "error"} role="status">{msj.texto}</p>}
    </form>
  );
}

export function FormularioTarifa({ tarifa }: { tarifa: number }) {
  const { msj, pendiente, enviar } = useEnvio();
  return (
    <form className="tarjeta" action={(fd) => enviar(() => guardarTarifa(fd))}>
      <b>Tarifa por hora</b>
      <p className="suave">La misma que usa la calculadora de neracosu.com. Sirve para comparar horas cotizadas y reales.</p>
      <label className="campo"><span>Dólares por hora</span><input name="tarifa" type="number" step="0.5" min={1} max={500} defaultValue={tarifa} /></label>
      <button className="boton boton--primario" disabled={pendiente}>Guardar</button>
      {msj && <p className={msj.ok ? "suave" : "error"} role="status">{msj.texto}</p>}
    </form>
  );
}
```

En `src/app/(panel)/ajustes/page.tsx`, después de «Mensajes por nicho» y antes de «Mi PIN», agregar la sección **Cobros** con los tres formularios, leyendo `leerConfig(CLAVES.mensajeRecordatorio)`, `leerConfig(CLAVES.mensajeVencido)`, `leerEmisor()` y `leerTarifaHora()` en el `Promise.all` de la página.

- [ ] **Step 4: verificar y commit**

Run: `npm run test:db 2>&1 | tail -4 && npx tsc --noEmit`
Expected: todos `passed`.

```bash
git add -A && git commit -F - <<'EOF'
feat(proyectos): ajustes de mensajes de cobro, datos del emisor y tarifa por hora

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 10: Pantallas — Proyectos, Nuevo, ficha con pestañas, Clientes, barra y ganchos en Hoy/ficha de prospecto

**Files:**
- Create: `src/componentes/Semaforo.tsx`, `src/componentes/EstadoProyecto.tsx`, `src/componentes/Pestanas.tsx`, `src/componentes/FormularioProyecto.tsx`, `src/componentes/FormularioCliente.tsx`, `src/componentes/TabCobros.tsx`, `src/componentes/TabPendientes.tsx`, `src/componentes/TabHoras.tsx`, `src/componentes/TabVersiones.tsx`, `src/componentes/AccionesProyecto.tsx`, `src/app/(panel)/proyectos/page.tsx`, `src/app/(panel)/proyectos/nuevo/page.tsx`, `src/app/(panel)/proyectos/[id]/page.tsx`, `src/app/(panel)/clientes/page.tsx`, `src/app/(panel)/clientes/nuevo/page.tsx`, `src/app/(panel)/clientes/[id]/page.tsx`
- Modify: `src/componentes/BarraInferior.tsx` (Proyectos deja de ser «pronto»), `src/componentes/FichaAcciones.tsx` (tras `ganado`, enlace «Crear proyecto»), `src/app/globals.css`

**Interfaces:**
- Consumes: todo lo de T2–T9. Las pestañas se eligen por `?t=cobros|pendientes|horas|versiones|cliente` (server-rendered, sin estado cliente de pestaña).
- Produces: pantallas navegables a 390 px. Ningún componente cliente importa `@/lib/db`.

- [ ] **Step 1: componentes chicos y CSS**

```tsx
// src/componentes/Semaforo.tsx
import type { Semaforo as Tipo } from "@/lib/proyectos-contrato";
const TEXTO: Record<Tipo, string> = { rojo: "Cobro vencido", amarillo: "Vence pronto", verde: "Al día" };
export function Semaforo({ valor }: { valor: Tipo }) {
  return <span className={`semaforo semaforo--${valor}`} title={TEXTO[valor]} aria-label={TEXTO[valor]} />;
}
```

```tsx
// src/componentes/EstadoProyecto.tsx
import { ETIQUETA_ESTADO, type EstadoProyecto as Tipo } from "@/lib/proyectos-contrato";
export function EstadoProyecto({ estado }: { estado: Tipo }) {
  return <span className={`etiqueta etiqueta--proyecto-${estado}`}>{ETIQUETA_ESTADO[estado]}</span>;
}
```

```tsx
// src/componentes/Pestanas.tsx — enlaces con ?t=, sin estado cliente.
import Link from "next/link";
export function Pestanas({ base, activa, items }: { base: string; activa: string; items: { clave: string; texto: string }[] }) {
  return (
    <nav className="pestanas" aria-label="Secciones del proyecto">
      {items.map((i) => <Link key={i.clave} href={`${base}?t=${i.clave}`} className={"pestanas__item" + (i.clave === activa ? " activa" : "")} aria-current={i.clave === activa ? "page" : undefined}>{i.texto}</Link>)}
    </nav>
  );
}
```

CSS a agregar en `globals.css`:

```css
.semaforo { display: inline-block; width: 12px; height: 12px; border-radius: 50%; margin-right: 6px; }
.semaforo--rojo { background: var(--rojo); } .semaforo--amarillo { background: var(--ambar); } .semaforo--verde { background: var(--verde); }
.etiqueta--proyecto-activo { background: #23413a; color: var(--verde); }
.etiqueta--proyecto-pausado, .etiqueta--proyecto-en_construccion { background: #3b3520; color: var(--ambar); }
.etiqueta--proyecto-cerrado { background: #3b2424; color: var(--rojo); }
.cifras { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; text-align: center; }
.cifras b { display: block; font-size: 18px; }
.cifras .vencido b { color: var(--rojo); }
.pestanas { display: flex; gap: 4px; overflow-x: auto; margin: 0 -16px 12px; padding: 0 16px; scrollbar-width: none; }
.pestanas__item { flex: 0 0 auto; padding: 10px 14px; border-radius: 999px; border: 1px solid var(--borde); color: var(--tinta-suave); text-decoration: none; font-size: 14px; min-height: 44px; display: inline-flex; align-items: center; }
.pestanas__item.activa { background: var(--verde); color: #0b1a12; border-color: var(--verde); font-weight: 600; }
.cobro { display: grid; grid-template-columns: 1fr auto; gap: 4px 8px; padding: 10px 0; border-bottom: 1px solid var(--borde); }
.cobro__monto { font-weight: 600; }
.etiqueta--vencido { background: #3b2424; color: var(--rojo); } .etiqueta--por_vencer { background: #3b3520; color: var(--ambar); } .etiqueta--pagado { background: #23413a; color: var(--verde); } .etiqueta--anulado { opacity: .6; }
.pendiente { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--borde); }
.pendiente input[type=checkbox] { width: 24px; height: 24px; }
.pendiente .hecho { text-decoration: line-through; color: var(--tinta-suave); }
.mini { min-height: 36px; padding: 0 10px; font-size: 13px; }
.cambio--nuevo::before { content: "＋ "; color: var(--verde); } .cambio--mejora::before { content: "↑ "; color: var(--ambar); } .cambio--arreglo::before { content: "✓ "; color: var(--tinta-suave); }
```

- [ ] **Step 2: lista `/proyectos` y `/clientes`**

```tsx
// src/app/(panel)/proyectos/page.tsx
import Link from "next/link";
import { exigirRol } from "@/lib/sesion";
import { hoyCaracas } from "@/lib/fecha-caracas";
import { listarProyectos, ganadosSinProyecto, resumenMes } from "@/lib/proyectos";
import { formatoUSD } from "@/lib/dinero";
import { Semaforo } from "@/componentes/Semaforo";
import { EstadoProyecto } from "@/componentes/EstadoProyecto";

export const dynamic = "force-dynamic";

export default async function Proyectos() {
  await exigirRol("dueno");
  const hoy = hoyCaracas();
  const [lista, ganados, mes] = await Promise.all([listarProyectos(hoy), ganadosSinProyecto(), resumenMes(hoy)]);
  return (
    <>
      <div className="fila" style={{ border: 0 }}><h1 className="titulo">Proyectos</h1><Link className="boton boton--primario" href="/proyectos/nuevo">Nuevo</Link></div>
      <section className="tarjeta cifras">
        <div><b>{formatoUSD(mes.cobrado)}</b>cobrado este mes</div>
        <div className="vencido"><b>{formatoUSD(mes.vencido)}</b>vencido</div>
        <div><b>{formatoUSD(mes.porCobrar)}</b>por cobrar</div>
      </section>
      {ganados.length > 0 && (
        <section className="tarjeta">
          <b>Ganados sin proyecto</b>
          {ganados.map((g) => <div key={g.id} className="fila"><span>{g.nombre} · <span className="suave">{g.ciudad}</span></span><Link className="boton mini" href={`/proyectos/nuevo?prospecto=${g.id}`}>Crear proyecto</Link></div>)}
        </section>
      )}
      {lista.length === 0 && <p className="suave">Todavía no hay proyectos. <Link href="/proyectos/nuevo">Crea el primero</Link> (los clientes que ya tienes entran a mano).</p>}
      {lista.map((p) => (
        <Link key={p.id} href={`/proyectos/${p.id}`} className="fila">
          <span><Semaforo valor={p.semaforo} /><b>{p.nombre}</b><br /><span className="suave">{p.clienteNombre}{p.versionActual ? ` · v${p.versionActual}` : ""}{p.avance !== null ? ` · ${p.avance} %` : ""}</span></span>
          <EstadoProyecto estado={p.estado} />
        </Link>
      ))}
      <p className="suave" style={{ marginTop: 16 }}><Link href="/clientes">Ver clientes</Link></p>
    </>
  );
}
```

```tsx
// src/app/(panel)/clientes/page.tsx
import Link from "next/link";
import { exigirRol } from "@/lib/sesion";
import { listarClientes } from "@/lib/clientes";

export const dynamic = "force-dynamic";

export default async function Clientes({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await exigirRol("dueno");
  const sp = await searchParams;
  const lista = await listarClientes(sp.q);
  return (
    <>
      <div className="fila" style={{ border: 0 }}><h1 className="titulo">Clientes</h1><Link className="boton boton--primario" href="/clientes/nuevo">Nuevo</Link></div>
      <form className="tarjeta" method="get"><label className="campo"><span>Buscar</span><input name="q" defaultValue={sp.q ?? ""} placeholder="Nombre, contacto o RIF" /></label><button className="boton" type="submit">Filtrar</button></form>
      {lista.length === 0 && <p className="suave">Sin clientes con ese filtro.</p>}
      {lista.map((c) => <Link key={c.id} href={`/clientes/${c.id}`} className="fila"><span><b>{c.nombre}</b><br /><span className="suave">{c.contactoNombre || "—"} · {c.proyectos} proyecto(s)</span></span></Link>)}
    </>
  );
}
```

- [ ] **Step 3: formularios de cliente y proyecto, y páginas `nuevo`**

```tsx
// src/componentes/FormularioCliente.tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearCliente, editarCliente } from "@/acciones/clientes";
import type { ClienteFila } from "@/lib/clientes";

const CAMPOS: [keyof ClienteFila, string, string?][] = [["nombre", "Nombre del negocio"], ["contactoNombre", "Persona de contacto"], ["whatsapp", "WhatsApp", "tel"], ["email", "Correo", "email"], ["rif", "RIF"], ["instagram", "Instagram"], ["facebook", "Facebook"], ["tiktok", "TikTok"]];

export function FormularioCliente({ cliente }: { cliente?: ClienteFila }) {
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
  return (
    <form className="tarjeta" action={(fd) => empezar(async () => {
      const r = cliente ? await editarCliente(fd) : await crearCliente(fd);
      if (r.ok) { router.push(cliente ? `/clientes/${cliente.id}` : `/clientes/${(r as { datos: { id: number } }).datos.id}`); router.refresh(); } else setError(r.mensaje);
    })}>
      {cliente && <input type="hidden" name="id" value={cliente.id} />}
      {CAMPOS.map(([n, t, tipo]) => <label key={n} className="campo"><span>{t}</span><input name={n} type={tipo ?? "text"} defaultValue={cliente ? String(cliente[n] ?? "") : ""} required={n === "nombre"} /></label>)}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="boton boton--primario" disabled={pendiente} type="submit">Guardar</button>
    </form>
  );
}
```

```tsx
// src/componentes/FormularioProyecto.tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearProyecto } from "@/acciones/proyectos";

type Props = { nichos: { id: number; nombre: string }[]; clientes: { id: number; nombre: string }[]; prospecto?: { id: number; nombre: string; nichoId: number; codigo: string } };

export function FormularioProyecto({ nichos, clientes, prospecto }: Props) {
  const [error, setError] = useState("");
  const [formaPago, setFormaPago] = useState<"completo" | "cuotas">("completo");
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
  const hoy = new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
  return (
    <form className="tarjeta" action={(fd) => empezar(async () => { const r = await crearProyecto(fd); if (r.ok) { router.push(`/proyectos/${r.datos.id}`); router.refresh(); } else setError(r.mensaje); })}>
      {prospecto ? (
        <><input type="hidden" name="prospectoId" value={prospecto.id} /><input type="hidden" name="propuestaCodigo" value={prospecto.codigo} /><p><b>Cliente:</b> {prospecto.nombre} <span className="suave">(desde el embudo)</span></p></>
      ) : (
        <label className="campo"><span>Cliente</span><select name="clienteId" required><option value="">Elige…</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
      )}
      <label className="campo"><span>Nombre del proyecto</span><input name="nombre" required placeholder="PMS Hotel" /></label>
      <label className="campo"><span>Nicho</span><select name="nichoId" defaultValue={prospecto?.nichoId ?? nichos[0]?.id}>{nichos.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}</select></label>
      <p className="suave">Los precios salen de neracosu.com/para/. Aquí solo se copian.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <label className="campo"><span>Pago único (USD)</span><input name="pagoUnico" inputMode="decimal" required placeholder="2800" /></label>
        <label className="campo"><span>Mensualidad (USD)</span><input name="mensualidad" inputMode="decimal" required placeholder="100" /></label>
        <label className="campo"><span>Horas cotizadas</span><input name="horasCotizadas" inputMode="decimal" required placeholder="160" /></label>
        <label className="campo"><span>Día de cobro (1–28)</span><input name="diaCobroMensual" type="number" min={1} max={28} defaultValue={5} required /></label>
        <label className="campo"><span>Inicio</span><input name="fechaInicio" type="date" defaultValue={hoy} required /></label>
        <label className="campo"><span>Entrega estimada</span><input name="fechaEntregaEstimada" type="date" /></label>
      </div>
      <label className="campo"><span>Forma de pago del pago único</span>
        <select name="formaPago" value={formaPago} onChange={(e) => setFormaPago(e.target.value as "completo" | "cuotas")}><option value="completo">Completo al inicio</option><option value="cuotas">En cuotas (cada 30 días)</option></select></label>
      {formaPago === "cuotas" && <label className="campo"><span>Cuántas cuotas (2–12)</span><input name="cuotas" type="number" min={2} max={12} defaultValue={3} /></label>}
      {error && <p className="error" role="alert">{error}</p>}
      <button className="boton boton--primario" disabled={pendiente} type="submit">Crear proyecto</button>
    </form>
  );
}
```

```tsx
// src/app/(panel)/proyectos/nuevo/page.tsx
import { exigirRol } from "@/lib/sesion";
import { prisma } from "@/lib/db";
import { listarNichos } from "@/lib/prospectos";
import { listarClientes } from "@/lib/clientes";
import { FormularioProyecto } from "@/componentes/FormularioProyecto";

export const dynamic = "force-dynamic";

export default async function NuevoProyecto({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await exigirRol("dueno");
  const sp = await searchParams;
  const prospectoId = Number(sp.prospecto) || 0;
  const [nichos, clientes, prospecto] = await Promise.all([
    listarNichos(), listarClientes(),
    prospectoId ? prisma.prospecto.findUnique({ where: { id: prospectoId, etapa: "ganado" }, select: { id: true, nombre: true, nichoId: true, codigo: true } }) : null,
  ]);
  return (<><h1 className="titulo">Nuevo proyecto</h1><FormularioProyecto nichos={nichos} clientes={clientes.map((c) => ({ id: c.id, nombre: c.nombre }))} prospecto={prospecto ?? undefined} /></>);
}
```

```tsx
// src/app/(panel)/clientes/nuevo/page.tsx
import { exigirRol } from "@/lib/sesion";
import { FormularioCliente } from "@/componentes/FormularioCliente";
export const dynamic = "force-dynamic";
export default async function NuevoCliente() { await exigirRol("dueno"); return (<><h1 className="titulo">Nuevo cliente</h1><FormularioCliente /></>); }
```

```tsx
// src/app/(panel)/clientes/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirRol } from "@/lib/sesion";
import { fichaCliente } from "@/lib/clientes";
import { FormularioCliente } from "@/componentes/FormularioCliente";
import { EstadoProyecto } from "@/componentes/EstadoProyecto";
import type { EstadoProyecto as Tipo } from "@/lib/proyectos-contrato";

export const dynamic = "force-dynamic";

export default async function Cliente({ params }: { params: Promise<{ id: string }> }) {
  await exigirRol("dueno");
  const id = Number((await params).id);
  const c = Number.isInteger(id) ? await fichaCliente(id) : null;
  if (!c) notFound();
  return (
    <>
      <h1 className="titulo">{c.nombre}</h1>
      <section className="tarjeta"><b>Proyectos</b>
        {c.proyectosLista.length === 0 && <p className="suave">Ninguno todavía.</p>}
        {c.proyectosLista.map((p) => <Link key={p.id} href={`/proyectos/${p.id}`} className="fila"><span>{p.nombre}</span><EstadoProyecto estado={p.estado as Tipo} /></Link>)}
        <div className="fila-botones"><Link className="boton" href="/proyectos/nuevo">Nuevo proyecto</Link></div>
      </section>
      <FormularioCliente cliente={c} />
    </>
  );
}
```

- [ ] **Step 4: ficha del proyecto con pestañas**

```tsx
// src/app/(panel)/proyectos/[id]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirRol } from "@/lib/sesion";
import { hoyCaracas } from "@/lib/fecha-caracas";
import { fichaProyecto } from "@/lib/proyectos";
import { leerTarifaHora } from "@/lib/configuracion";
import { formatoUSD } from "@/lib/dinero";
import { Semaforo } from "@/componentes/Semaforo";
import { EstadoProyecto } from "@/componentes/EstadoProyecto";
import { Pestanas } from "@/componentes/Pestanas";
import { AccionesProyecto } from "@/componentes/AccionesProyecto";
import { TabCobros } from "@/componentes/TabCobros";
import { TabPendientes } from "@/componentes/TabPendientes";
import { TabHoras } from "@/componentes/TabHoras";
import { TabVersiones } from "@/componentes/TabVersiones";
import { canalesDisponibles } from "@/lib/canales-contrato";

export const dynamic = "force-dynamic";
const PESTANAS = [{ clave: "cobros", texto: "Cobros" }, { clave: "pendientes", texto: "Pendientes" }, { clave: "horas", texto: "Horas" }, { clave: "versiones", texto: "Versiones" }, { clave: "cliente", texto: "Cliente" }];
const TEXTO_EVENTO: Record<string, string> = { proyecto_creado: "Proyecto creado", proyecto_estado: "Estado", cobro_pagado: "Cobro pagado", cobro_anulado: "Cobro anulado", cobro_agregado: "Cobro agregado", recordatorio: "Recordatorio enviado", hito_cumplido: "Hito cumplido", version_publicada: "Versión publicada", aviso_cliente: "Aviso al cliente", horas: "Horas" };

export default async function Proyecto({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  await exigirRol("dueno");
  const id = Number((await params).id);
  const hoy = hoyCaracas();
  const [p, tarifa] = await Promise.all([Number.isInteger(id) ? fichaProyecto(id, hoy) : null, leerTarifaHora()]);
  if (!p) notFound();
  const t = (await searchParams).t ?? "cobros";
  const base = `/proyectos/${p.id}`;
  return (
    <>
      <h1 className="titulo"><Semaforo valor={p.semaforo} />{p.nombre} <EstadoProyecto estado={p.estado} /></h1>
      <p className="suave"><Link href={`/clientes/${p.clienteId}`}>{p.clienteNombre}</Link> · {p.nichoNombre} · {formatoUSD(p.pagoUnico)} + {formatoUSD(p.mensualidad)}/mes · día {p.diaCobroMensual}{p.versionActual ? ` · v${p.versionActual}` : ""}{p.avance !== null ? ` · ${p.avance} %` : ""}</p>
      <AccionesProyecto proyecto={{ id: p.id, nombre: p.nombre, estado: p.estado, mensualidad: p.mensualidad, horasCotizadas: p.horasCotizadas, fechaEntregaEstimada: p.fechaEntregaEstimada, diaCobroMensual: p.diaCobroMensual }} />
      <Pestanas base={base} activa={t} items={PESTANAS} />
      {t === "cobros" && <TabCobros proyectoId={p.id} cobros={p.cobros} hoy={hoy} />}
      {t === "pendientes" && <TabPendientes proyectoId={p.id} pendientes={p.pendientes} avance={p.avance} />}
      {t === "horas" && <TabHoras proyectoId={p.id} horas={p.horas} cotizadas={p.horasCotizadas} reales={p.horasReales} tarifa={tarifa} hoy={hoy} />}
      {t === "versiones" && <TabVersiones proyectoId={p.id} versiones={p.versiones} hoy={hoy} />}
      {t === "cliente" && (
        <section className="tarjeta">
          <b>{p.cliente.nombre}</b> <span className="suave">{p.cliente.contactoNombre}</span>
          {p.cliente.rif && <div className="suave">RIF {p.cliente.rif}</div>}
          <div className="fila-botones">
            {canalesDisponibles({ ...p.cliente, telefono: "" }, `Buenas, ${p.cliente.contactoNombre || p.cliente.nombre}.`).map((a) => <a key={a.canal} className="boton" href={a.href} target="_blank" rel="noopener">{a.etiqueta}</a>)}
            <Link className="boton" href={`/clientes/${p.clienteId}`}>Editar cliente</Link>
          </div>
          {p.propuestaCodigo && <p className="suave">Propuesta aceptada: <a href={`/p/${p.propuestaCodigo}`} target="_blank" rel="noopener">ver</a></p>}
          <p className="suave">El acceso al portal del cliente llega en la pieza 5.</p>
        </section>
      )}
      <section className="tarjeta">
        <b>Historial</b>
        <ul className="historial" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {p.historial.map((e) => <li key={e.id}>{TEXTO_EVENTO[e.tipo] ?? e.tipo}{e.texto ? `: ${e.texto}` : ""}<time>{e.creadoEn.toLocaleString("es-VE", { timeZone: "America/Caracas" })}{e.usuarioNombre ? ` · ${e.usuarioNombre}` : ""}</time></li>)}
        </ul>
      </section>
    </>
  );
}
```

```tsx
// src/componentes/AccionesProyecto.tsx — cambiar estado y editar lo editable.
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ESTADOS_PROYECTO, ETIQUETA_ESTADO, puedePasarProyecto, type EstadoProyecto } from "@/lib/proyectos-contrato";
import { cambiarEstadoProyecto, editarProyecto } from "@/acciones/proyectos";

type P = { id: number; nombre: string; estado: EstadoProyecto; mensualidad: number; horasCotizadas: number; fechaEntregaEstimada: string | null; diaCobroMensual: number };

export function AccionesProyecto({ proyecto }: { proyecto: P }) {
  const [motivo, setMotivo] = useState("");
  const [editando, setEditando] = useState(false);
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
  const correr = (fn: () => Promise<{ ok: boolean; mensaje?: string }>) => empezar(async () => { const r = await fn(); if (r.ok) { setError(""); setEditando(false); router.refresh(); } else setError(r.mensaje ?? "Error"); });
  const destinos = ESTADOS_PROYECTO.filter((e) => puedePasarProyecto(proyecto.estado, e));
  return (
    <section className="tarjeta">
      <div className="fila-botones">
        {destinos.map((e) => <button key={e} className={"boton mini" + (e === "cerrado" ? " boton--peligro" : "")} disabled={pendiente} onClick={() => correr(() => cambiarEstadoProyecto(proyecto.id, e, motivo))}>{ETIQUETA_ESTADO[e]}</button>)}
        <button className="boton mini" onClick={() => setEditando((v) => !v)}>{editando ? "Cancelar" : "Editar"}</button>
      </div>
      {destinos.includes("cerrado") && <label className="campo"><span>Motivo (solo para cerrar)</span><input value={motivo} onChange={(e) => setMotivo(e.target.value)} /></label>}
      {editando && (
        <form action={(fd) => correr(() => editarProyecto(fd))}>
          <input type="hidden" name="id" value={proyecto.id} />
          <label className="campo"><span>Nombre</span><input name="nombre" defaultValue={proyecto.nombre} required /></label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label className="campo"><span>Mensualidad (USD)</span><input name="mensualidad" inputMode="decimal" defaultValue={proyecto.mensualidad} /></label>
            <label className="campo"><span>Horas cotizadas</span><input name="horasCotizadas" inputMode="decimal" defaultValue={proyecto.horasCotizadas} /></label>
            <label className="campo"><span>Entrega estimada</span><input name="fechaEntregaEstimada" type="date" defaultValue={proyecto.fechaEntregaEstimada ?? ""} /></label>
            <label className="campo"><span>Día de cobro</span><input name="diaCobroMensual" type="number" min={1} max={28} defaultValue={proyecto.diaCobroMensual} /></label>
          </div>
          <p className="suave">Cambiar el día de cobro no toca las mensualidades ya generadas.</p>
          <button className="boton boton--primario" disabled={pendiente}>Guardar</button>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
```

- [ ] **Step 5: pestañas Cobros, Pendientes, Horas y Versiones** (componentes cliente; reciben datos planos)

```tsx
// src/componentes/TabCobros.tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CobroFila } from "@/lib/proyectos";
import { CANALES_COBRO, ETIQUETA_CANAL_COBRO, ETIQUETA_CONCEPTO, ETIQUETA_COBRO } from "@/lib/cobros-contrato";
import { formatoUSD } from "@/lib/dinero";
import { marcarPagado, anularCobro, agregarCobro, registrarRecordatorio } from "@/acciones/cobros";

export function TabCobros({ proyectoId, cobros, hoy }: { proyectoId: number; cobros: CobroFila[]; hoy: string }) {
  const [abierto, setAbierto] = useState<{ id: number; modo: "pagar" | "anular" } | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
  const correr = (fn: () => Promise<{ ok: boolean; mensaje?: string }>) => empezar(async () => { const r = await fn(); if (r.ok) { setError(""); setAbierto(null); setNuevo(false); router.refresh(); } else setError(r.mensaje ?? "Error"); });
  const recordar = (id: number) => empezar(async () => {
    const r = await registrarRecordatorio(id);
    if (r.ok) { window.open(r.datos.href, "_blank", "noopener"); router.refresh(); } else setError(r.mensaje);
  });
  return (
    <section className="tarjeta">
      {cobros.length === 0 && <p className="suave">Sin cobros.</p>}
      {cobros.map((c) => (
        <div key={c.id} className="cobro">
          <span><b>{ETIQUETA_CONCEPTO[c.concepto]}</b>{c.detalle ? ` · ${c.detalle}` : ""}<br /><span className="suave">vence {c.vence}{c.pagadoEn ? ` · pagado ${c.pagadoEn.toLocaleDateString("es-VE", { timeZone: "America/Caracas" })} por ${c.canal}${c.referencia ? ` (${c.referencia})` : ""}` : ""}{c.anuladoMotivo ? ` · anulado: ${c.anuladoMotivo}` : ""}</span></span>
          <span style={{ textAlign: "right" }}><span className="cobro__monto">{formatoUSD(c.monto)}</span><br /><span className={`etiqueta etiqueta--${c.estado}`}>{ETIQUETA_COBRO[c.estado]}</span></span>
          {(c.estado === "vencido" || c.estado === "por_vencer" || c.estado === "pendiente") && (
            <div className="fila-botones" style={{ gridColumn: "1 / -1" }}>
              <button className="boton mini boton--primario" onClick={() => setAbierto({ id: c.id, modo: "pagar" })}>Marcar pagado</button>
              <button className="boton mini" disabled={pendiente || c.recordadoHoy} title={c.recordadoHoy ? "Ya se recordó hoy" : ""} onClick={() => recordar(c.id)}>{c.recordadoHoy ? "Recordado hoy" : "Recordar"}</button>
              <button className="boton mini boton--peligro" onClick={() => setAbierto({ id: c.id, modo: "anular" })}>Anular</button>
            </div>
          )}
          {abierto?.id === c.id && abierto.modo === "pagar" && (
            <form className="pregunta" style={{ gridColumn: "1 / -1" }} action={(fd) => correr(() => marcarPagado(fd))}>
              <input type="hidden" name="cobroId" value={c.id} />
              <label className="campo"><span>Fecha de pago</span><input name="pagadoEn" type="date" defaultValue={hoy} max={hoy} required /></label>
              <label className="campo"><span>Canal</span><select name="canal">{CANALES_COBRO.map((k) => <option key={k} value={k}>{ETIQUETA_CANAL_COBRO[k]}</option>)}</select></label>
              <label className="campo"><span>Referencia</span><input name="referencia" /></label>
              <label className="campo"><span>Nota</span><input name="nota" /></label>
              <div className="fila-botones"><button className="boton boton--primario" disabled={pendiente}>Confirmar</button><button type="button" className="boton" onClick={() => setAbierto(null)}>Cancelar</button></div>
            </form>
          )}
          {abierto?.id === c.id && abierto.modo === "anular" && (
            <div className="pregunta" style={{ gridColumn: "1 / -1" }}>
              <label className="campo"><span>Motivo</span><input value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus /></label>
              <div className="fila-botones"><button className="boton boton--peligro" disabled={pendiente} onClick={() => correr(() => anularCobro(c.id, motivo))}>Anular</button><button className="boton" onClick={() => setAbierto(null)}>Cancelar</button></div>
            </div>
          )}
        </div>
      ))}
      <div className="fila-botones"><button className="boton" onClick={() => setNuevo((v) => !v)}>{nuevo ? "Cancelar" : "Agregar cobro"}</button></div>
      {nuevo && (
        <form className="pregunta" action={(fd) => correr(() => agregarCobro(fd))}>
          <input type="hidden" name="proyectoId" value={proyectoId} />
          <label className="campo"><span>Concepto</span><select name="concepto"><option value="extra">Extra (fuera de alcance)</option><option value="cuota">Cuota</option></select></label>
          <label className="campo"><span>Detalle</span><input name="detalle" required placeholder="Módulo de reportes" /></label>
          <label className="campo"><span>Monto (USD)</span><input name="monto" inputMode="decimal" required /></label>
          <label className="campo"><span>Vence</span><input name="vence" type="date" defaultValue={hoy} required /></label>
          <button className="boton boton--primario" disabled={pendiente}>Agregar</button>
        </form>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
```

```tsx
// src/componentes/TabPendientes.tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PendienteFila } from "@/lib/proyectos";
import { agregarPendiente, marcarPendiente, alternarVisible, moverPendiente, eliminarPendiente } from "@/acciones/pendientes";

export function TabPendientes({ proyectoId, pendientes, avance }: { proyectoId: number; pendientes: PendienteFila[]; avance: number | null }) {
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
  const correr = (fn: () => Promise<{ ok: boolean; mensaje?: string }>) => empezar(async () => { const r = await fn(); if (r.ok) { setError(""); router.refresh(); } else setError(r.mensaje ?? "Error"); });
  return (
    <section className="tarjeta">
      <b>{avance === null ? "Sin hitos publicados" : `Avance visible: ${avance} %`}</b>
      {avance !== null && <div className="progreso"><i style={{ width: `${avance}%` }} /></div>}
      {pendientes.map((p, i) => (
        <div key={p.id} className="pendiente">
          <input type="checkbox" checked={p.hecho} disabled={pendiente} onChange={(e) => correr(() => marcarPendiente(p.id, e.target.checked))} aria-label={p.texto} />
          <span className={p.hecho ? "hecho" : ""} style={{ flex: 1 }}>{p.texto}{p.fechaEstimada ? <span className="suave"> · {p.fechaEstimada}</span> : null}</span>
          <button className="boton mini" title={p.visibleCliente ? "Visible al cliente" : "Interno"} disabled={pendiente} onClick={() => correr(() => alternarVisible(p.id))}>{p.visibleCliente ? "👁" : "—"}</button>
          <button className="boton mini" disabled={pendiente || i === 0} aria-label="Subir" onClick={() => correr(() => moverPendiente(p.id, "arriba"))}>↑</button>
          <button className="boton mini" disabled={pendiente || i === pendientes.length - 1} aria-label="Bajar" onClick={() => correr(() => moverPendiente(p.id, "abajo"))}>↓</button>
          <button className="boton mini boton--peligro" disabled={pendiente} aria-label="Eliminar" onClick={() => { if (confirm("¿Eliminar este pendiente?")) correr(() => eliminarPendiente(p.id)); }}>×</button>
        </div>
      ))}
      <form className="pregunta" action={(fd) => correr(async () => { const r = await agregarPendiente(fd); return r; })}>
        <input type="hidden" name="proyectoId" value={proyectoId} />
        <label className="campo"><span>Nuevo pendiente</span><input name="texto" required /></label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label className="campo"><span><input type="checkbox" name="visibleCliente" /> Visible al cliente</span></label>
          <label className="campo"><span>Fecha estimada</span><input name="fechaEstimada" type="date" /></label>
        </div>
        <button className="boton boton--primario" disabled={pendiente}>Agregar</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
```

```tsx
// src/componentes/TabHoras.tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { HorasFila } from "@/lib/proyectos";
import { registrarHoras, eliminarHoras } from "@/acciones/horas";
import { formatoUSD, redondear2 } from "@/lib/dinero";

export function TabHoras({ proyectoId, horas, cotizadas, reales, tarifa, hoy }: { proyectoId: number; horas: HorasFila[]; cotizadas: number; reales: number; tarifa: number; hoy: string }) {
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
  const correr = (fn: () => Promise<{ ok: boolean; mensaje?: string }>) => empezar(async () => { const r = await fn(); if (r.ok) { setError(""); router.refresh(); } else setError(r.mensaje ?? "Error"); });
  const diff = redondear2(reales - cotizadas);
  return (
    <section className="tarjeta">
      <div className="cifras">
        <div><b>{cotizadas}</b>cotizadas</div>
        <div><b>{reales}</b>reales</div>
        <div className={diff > 0 ? "vencido" : ""}><b>{diff > 0 ? "+" : ""}{diff} h</b>{formatoUSD(Math.abs(diff) * tarifa)} a ${tarifa}/h</div>
      </div>
      <p className="suave">Solo tú ves esto. El cliente nunca ve horas ni tarifa.</p>
      <form className="pregunta" action={(fd) => correr(() => registrarHoras(fd))}>
        <input type="hidden" name="proyectoId" value={proyectoId} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label className="campo"><span>Fecha</span><input name="fecha" type="date" defaultValue={hoy} max={hoy} required /></label>
          <label className="campo"><span>Horas (pasos de 0,25)</span><input name="horas" inputMode="decimal" placeholder="2.5" required /></label>
        </div>
        <label className="campo"><span>Qué hiciste</span><input name="descripcion" required /></label>
        <button className="boton boton--primario" disabled={pendiente}>Registrar</button>
      </form>
      <ul className="historial" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {horas.map((h) => <li key={h.id}>{h.fecha} · <b>{h.horas} h</b> · {h.descripcion} <button className="boton mini" disabled={pendiente} onClick={() => correr(() => eliminarHoras(h.id))} title="Solo el mismo día">×</button><time>{h.usuarioNombre}</time></li>)}
      </ul>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
```

```tsx
// src/componentes/TabVersiones.tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { VersionFila } from "@/lib/proyectos";
import { ETIQUETA_CAMBIO } from "@/lib/semver-contrato";
import { publicarVersion, marcarAvisada } from "@/acciones/versiones";

export function TabVersiones({ proyectoId, versiones, hoy }: { proyectoId: number; versiones: VersionFila[]; hoy: string }) {
  const [nueva, setNueva] = useState(false);
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  const router = useRouter();
  const correr = (fn: () => Promise<{ ok: boolean; mensaje?: string }>) => empezar(async () => { const r = await fn(); if (r.ok) { setError(""); setNueva(false); router.refresh(); } else setError(r.mensaje ?? "Error"); });
  const avisar = (id: number) => empezar(async () => { const r = await marcarAvisada(id); if (r.ok) { if (r.datos.href) window.open(r.datos.href, "_blank", "noopener"); router.refresh(); } else setError(r.mensaje); });
  const actual = versiones[0];
  return (
    <section className="tarjeta">
      <b>{actual ? `Versión actual: ${actual.version}` : "Sin versiones todavía"}</b>
      <div className="fila-botones"><button className="boton" onClick={() => setNueva((v) => !v)}>{nueva ? "Cancelar" : "Publicar versión"}</button></div>
      {nueva && (
        <form className="pregunta" action={(fd) => correr(() => publicarVersion(fd))}>
          <input type="hidden" name="proyectoId" value={proyectoId} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label className="campo"><span>Versión</span><input name="version" placeholder={actual ? `mayor que ${actual.version}` : "1.0.0"} required /></label>
            <label className="campo"><span>Fecha</span><input name="fecha" type="date" defaultValue={hoy} required /></label>
          </div>
          <label className="campo"><span>Pega el bloque del CHANGELOG.md</span><textarea name="markdown" rows={6} placeholder={"### Nuevo\n- Reporte de ocupación\n### Arreglo\n- Cierre de caja"} required /></label>
          <button className="boton boton--primario" disabled={pendiente}>Publicar</button>
        </form>
      )}
      {versiones.map((v) => (
        <div key={v.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--borde)" }}>
          <b>v{v.version}</b> <span className="suave">{v.fecha}{v.avisadoEn ? " · avisada" : ""}</span>
          <ul style={{ margin: "6px 0", paddingLeft: 0, listStyle: "none" }}>{v.cambios.map((c) => <li key={c.id} className={`cambio--${c.tipo}`}><span className="suave">{ETIQUETA_CAMBIO[c.tipo]}:</span> {c.texto}</li>)}</ul>
          {!v.avisadoEn && <button className="boton mini" disabled={pendiente} onClick={() => avisar(v.id)}>Avisar al cliente</button>}
        </div>
      ))}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
```

- [ ] **Step 6: barra y ganchos en el embudo**

- `src/componentes/BarraInferior.tsx`: quitar `pronto: true` de `Proyectos`.
- `src/componentes/FichaAcciones.tsx`: cuando `props.etapa === "ganado"`, mostrar en la sección «Etapa» un `<Link className="boton boton--primario" href={`/proyectos/nuevo?prospecto=${props.id}`}>Crear proyecto</Link>` (solo si `rol === "dueno"`: pasar `rol` como prop desde la página de la ficha, que ya tiene la sesión).
- `src/app/(panel)/hoy/page.tsx`: ya usa `ganadosSinProyecto()` (T4); cada uno con enlace `Crear proyecto`.

- [ ] **Step 7: verificar en el navegador a 390 px**

Run: `npx tsc --noEmit && (set -a; . /home/neracosu/.config/prospectos/env; set +a; npx next dev -p 3014 -H 127.0.0.1 > /tmp/claude-1010/prospectos-dev.log 2>&1 & echo $! > /tmp/claude-1010/prospectos-dev.pid); sleep 8; curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3014/entrar`
Usar el puerto **3014** (3013 lo ocupa PM2 en producción) y `PROSPECTOS_URL_PUBLICA` no importa para esto. Con Playwright (390×844): entrar con el PIN del dueño (Neri lo da por `!` o se usa el usuario de prueba de la base de tests — **preferible**: apuntar `DATABASE_URL` a `TEST_DATABASE_URL` en esa shell y sembrar con `sembrarBasico` para no tocar la base real desde el navegador), capturar `/proyectos`, `/proyectos/nuevo`, crear un proyecto en cuotas, la ficha en cada pestaña, marcar un cobro pagado, publicar una versión pegando Markdown, `/clientes`. Mirar las capturas. Cerrar el dev server y todos sus hijos (`pkill -f "next dev -p 3014"`; comprobar `ss -ltn | grep 3014` vacío).

Qué revisar: las pestañas caben y se deslizan a 390 px; los botones «mini» miden ≥ 36 px y los normales ≥ 44 px; las cifras del mes no se cortan con montos de 5 cifras; el formulario de pago cabe sin scroll horizontal.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -F - <<'EOF'
feat(proyectos): pantallas de proyectos, ficha con pestanas, clientes y ganchos desde ganado

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 11: Despliegue y recorrido de punta a punta

**Files:**
- Create: `scripts/verificar-flujo-proyectos.mts`
- Modify: `CLAUDE.md` (estado), `docs/superpowers/specs/2026-09-16-proyectos-cobros-design.md` (marcar «implementada»)

**Solo desde la sesión principal (build, PM2).**

- [ ] **Step 1: build y migración en producción**

```bash
ps aux | grep -c '[n]ext build'      # 0
pm2 list | grep -E 'prospectos' | awk -F'│' '{print $10,$9}'   # online, contador anotado
set -a; . /home/neracosu/.config/prospectos/env; set +a
npx prisma migrate deploy | tail -2  # aplica <fecha>_proyectos
npm run build 2>&1 | tail -20        # rutas nuevas: /proyectos, /proyectos/nuevo, /proyectos/[id], /clientes, /clientes/nuevo, /clientes/[id]
pm2 restart prospectos && sleep 5 && pm2 list | grep prospectos
curl -s -o /dev/null -w '%{http_code}\n' https://prospectos.neracosu.com/entrar   # 200
pm2 logs prospectos --lines 30 --nostream | grep -E 'mensualidades|Error' | tail -5   # el cron arranco sin error
```

Expected: `prospectos` `online` con el contador de reinicios **+1** (el restart) y nada más; log sin errores; la línea `[mensualidades] <fecha>: N creadas de M activos` aparece en cada corrida (también con ceros); si no aparece, el cron no arrancó.

- [ ] **Step 2: recorrido real a 390 px**

```ts
// scripts/verificar-flujo-proyectos.mts — contra el dominio, con un cliente y proyecto de prueba que se borran al final.
// Uso: set -a; . ~/.config/prospectos/env; set +a; BASE_URL=https://prospectos.neracosu.com npx tsx scripts/verificar-flujo-proyectos.mts < archivo-con-el-pin
import { readFileSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { prisma } from "../src/lib/db";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3013";
const pin = readFileSync(0, "utf8").trim();
mkdirSync("capturas", { recursive: true });
const errores: string[] = [];
const marca = `(PRUEBA) ${Date.now()}`;

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const pg = await ctx.newPage();
pg.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
pg.on("console", (m) => { if (m.type() === "error") errores.push(`console: ${m.text()}`); });
let clienteId = 0;
try {
  await pg.goto(`${BASE}/entrar`);
  for (const d of pin) await pg.getByRole("button", { name: d, exact: true }).click();
  await pg.waitForURL(/\/hoy$/);

  // 1. Crear cliente
  await pg.goto(`${BASE}/clientes/nuevo`);
  await pg.getByLabel("Nombre del negocio").fill(`Hotel ${marca}`);
  await pg.getByLabel("WhatsApp").fill("0412 000 00 00");
  await pg.getByRole("button", { name: "Guardar" }).click();
  await pg.waitForURL(/\/clientes\/\d+$/);
  clienteId = Number(pg.url().split("/").pop());
  await pg.screenshot({ path: "capturas/p3-01-cliente.png", fullPage: true });

  // 2. Crear proyecto en 3 cuotas
  await pg.goto(`${BASE}/proyectos/nuevo`);
  await pg.getByLabel("Cliente").selectOption({ label: `Hotel ${marca}` });
  await pg.getByLabel("Nombre del proyecto").fill("PMS de prueba");
  await pg.getByLabel("Pago único (USD)").fill("2800");
  await pg.getByLabel("Mensualidad (USD)").fill("100");
  await pg.getByLabel("Horas cotizadas").fill("160");
  await pg.getByLabel("Forma de pago del pago único").selectOption("cuotas");
  await pg.getByRole("button", { name: "Crear proyecto" }).click();
  await pg.waitForURL(/\/proyectos\/\d+$/);
  const proyectoId = Number(pg.url().split("/").pop());
  await pg.screenshot({ path: "capturas/p3-02-proyecto-cobros.png", fullPage: true });
  if ((await prisma.cobro.count({ where: { proyectoId } })) !== 3) errores.push("no se generaron 3 cuotas");

  // 3. Marcar la primera cuota pagada (Server Action por el dominio)
  await pg.getByRole("button", { name: "Marcar pagado" }).first().click();
  await pg.getByRole("button", { name: "Confirmar" }).click();
  await pg.getByText("Pagado").first().waitFor();
  await pg.screenshot({ path: "capturas/p3-03-pagado.png", fullPage: true });

  // 4. Publicar version pegando markdown
  await pg.goto(`${BASE}/proyectos/${proyectoId}?t=versiones`);
  await pg.getByRole("button", { name: "Publicar versión" }).click();
  await pg.getByLabel("Versión").fill("1.0.0");
  await pg.getByLabel("Pega el bloque del CHANGELOG.md").fill("### Nuevo\n- Reporte de ocupación\n### Arreglo\n- Cierre de caja");
  await pg.getByRole("button", { name: "Publicar" }).click();
  await pg.getByText("Versión actual: 1.0.0").waitFor();
  await pg.screenshot({ path: "capturas/p3-04-versiones.png", fullPage: true });

  // 5. Pendientes, horas, lista con cifras del mes
  await pg.goto(`${BASE}/proyectos/${proyectoId}?t=pendientes`);
  await pg.getByLabel("Nuevo pendiente").fill("Módulo de reservas");
  await pg.getByRole("button", { name: "Agregar" }).click();
  await pg.getByText("Módulo de reservas").waitFor();
  await pg.goto(`${BASE}/proyectos/${proyectoId}?t=horas`);
  await pg.getByLabel("Horas (pasos de 0,25)").fill("2.5");
  await pg.getByLabel("Qué hiciste").fill("Reservas");
  await pg.getByRole("button", { name: "Registrar" }).click();
  await pg.getByText("2.5 h").waitFor();
  await pg.screenshot({ path: "capturas/p3-05-horas.png", fullPage: true });
  await pg.goto(`${BASE}/proyectos`);
  await pg.getByText("cobrado este mes").waitFor();
  await pg.screenshot({ path: "capturas/p3-06-lista.png", fullPage: true });
} catch (e) {
  errores.push(`excepcion: ${(e as Error).message}`);
  await pg.screenshot({ path: "capturas/p3-error.png", fullPage: true }).catch(() => {});
} finally {
  await b.close();
  // Limpieza total del cliente de prueba y todo lo que cuelga de el (es basura de verificacion).
  if (clienteId) {
    const proyectos = await prisma.proyecto.findMany({ where: { clienteId }, select: { id: true } });
    const pids = proyectos.map((p) => p.id);
    await prisma.evento.deleteMany({ where: { proyectoId: { in: pids } } });
    await prisma.cambio.deleteMany({ where: { version: { proyectoId: { in: pids } } } });
    await prisma.version.deleteMany({ where: { proyectoId: { in: pids } } });
    await prisma.horas.deleteMany({ where: { proyectoId: { in: pids } } });
    await prisma.pendiente.deleteMany({ where: { proyectoId: { in: pids } } });
    await prisma.cobro.deleteMany({ where: { proyectoId: { in: pids } } });
    await prisma.proyecto.deleteMany({ where: { id: { in: pids } } });
    await prisma.cliente.delete({ where: { id: clienteId } });
  }
  await prisma.$disconnect();
}
console.log(errores.length ? `FALLO:\n- ${errores.join("\n- ")}` : "PASS: recorrido de proyectos sin errores");
process.exit(errores.length ? 1 : 0);
```

Run (Neri escribe su PIN en un archivo `600` del scratchpad o lo pasa por `!`): `set -a; . ~/.config/prospectos/env; set +a; BASE_URL=https://prospectos.neracosu.com npx tsx scripts/verificar-flujo-proyectos.mts < <archivo-pin>`
Expected: `PASS`, 6 capturas, y `prisma.cliente.count({ where: { nombre: { contains: "(PRUEBA)" } } })` = 0 después.

- [ ] **Step 3: documentación, `pm2 save` y commit**

- `CLAUDE.md`: estado → «piezas 1 y 3 en producción», cron de mensualidades dentro de la app (`src/instrumentation.ts`, 06:00 Caracas), y que la siguiente es la **pieza 2**.
- Spec de la pieza 3: `**Estado:** implementada el <fecha>`.
- `pm2 list` con los cinco `online` → `pm2 save`.

```bash
git add -A && git commit -F - <<'EOF'
feat(proyectos): despliegue de la pieza 3 y recorrido de punta a punta

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

Al terminar, avisar a Neri: puede cargar el hotel de Valencia y Soporte Vipsoft como clientes (a mano, `/clientes/nuevo`) y sus proyectos como `activo` para que las mensualidades empiecen a generarse solas.

---

## Fuera de este plan

Recibos en PDF (pieza 4), portal del cliente (pieza 5; por eso `{enlace}` va vacío), buscador e importación (pieza 2), gastos/impuestos/tasa BCV, cronómetro, asignación de pendientes.
