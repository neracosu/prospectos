# Pieza 5a — Portal del cliente: acceso, lectura y recibos — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un cliente entre a `/c/<código>` con un PIN de 6 números y vea, solo lectura y desde el teléfono, cómo van todos sus proyectos: avance por hitos, versiones publicadas, cobros (con descarga de recibos) y cómo contactar a Neri — sin ver jamás horas, tarifa, notas ni nada de otro cliente.

**Architecture:** Mismos cimientos (Next 15 + Server Actions, Prisma/MariaDB, CSS plano). El acceso es **por cliente**: un `Usuario` de rol `cliente` por `Cliente` (columna nueva `clienteId`, única), con su propia cookie `sesion_cliente` y un token con audiencia `portal` que el panel no acepta (ni al revés). Toda lectura del portal pasa por `src/lib/portal.ts`, que filtra por el `clienteId` de la sesión y selecciona campo por campo. El portal tiene su propio tema claro (`src/app/c/portal.css`), de la misma familia visual que la propuesta y el recibo.

**Tech Stack:** Node 20 · Next 15.5 · Prisma 6.19 (MariaDB) · jose · bcryptjs · zod 4 · vitest 4 · Playwright 1.63.

**Spec:** `docs/superpowers/specs/2026-09-16-portal-cliente-design.md` (pieza 5) y `docs/superpowers/specs/2026-09-16-plataforma-vision-general.md`. Leer también el `CLAUDE.md` del proyecto (trampas del servidor) y, como referencia de estilo, `src/acciones/cobros.ts`, `src/lib/recibos.ts`, `tests/recibos-acciones.test.ts`, `src/componentes/AccionesRecibo.tsx`.

**Alcance de este plan (5a) y lo que queda para el 5b.** La spec de la pieza 5 trae tres subsistemas independientes. Este plan entrega el primero completo y desplegable: acceso con PIN, las pantallas de lectura, la descarga de recibos con sesión de cliente, y el `{enlace}` del portal en los mensajes que ya existen. **Quedan para el plan 5b:** la tabla `Documento` con subida de archivos y `/c/documentos/<id>`, y las tres plantillas de aviso en Ajustes (`mensaje_aviso_hito`, `mensaje_aviso_version`, `mensaje_aviso_cobro`) con el botón «Avisar al cliente» en hitos. En 5a la pestaña **Documentos** muestra solo la propuesta aceptada.

## Global Constraints

- **Acceso por cliente, no por proyecto.** URL `/c/<código>`, `código` = `Cliente.codigo` (22 caracteres base64url, `CODIGO_VALIDO`). Un cliente con varios proyectos entra una vez y los ve todos.
- **PIN de 6 dígitos generado por el servidor**, guardado con hash en `Usuario` (rol `cliente`, `clienteId`). El PIN en claro existe solo en la respuesta de la acción que lo genera: nunca se guarda ni se registra en el log.
- **Bloqueo de 5 intentos fallidos / 15 minutos por cuenta y por IP** (mismo `src/lib/rate-limit.ts` del panel). Un código que no existe, un acceso desactivado y un PIN errado responden igual: «PIN incorrecto.»
- Cookie **`sesion_cliente`**, distinta de `pr_sesion`: `httpOnly`, `secure` en producción, `sameSite=lax`, `path=/`, 30 días. **Tener sesión de cliente no da acceso al panel ni al revés** (token con audiencia `portal`).
- **Regenerar PIN** invalida el PIN anterior **y las sesiones abiertas** (`Usuario.sesionVersion + 1`); **Desactivar acceso** pone `activo = false` y también sube `sesionVersion`. Ninguno borra nada.
- **El portal solo lee.** No existe ninguna server action que escriba desde sesión de cliente, salvo entrar; salir es una ruta que borra la cookie.
- **Qué no ve el cliente, por diseño:** horas trabajadas, tarifa por hora, pendientes no visibles (`visibleCliente = false`), notas (`Cobro.nota`, `Prospecto.nota`), cobros anulados, otros clientes, el panel. `src/lib/portal.ts` selecciona campo por campo (`select`), nunca `include` completo.
- **Aislamiento:** toda consulta filtra por el `clienteId` de la sesión. Un proyecto o recibo de otro cliente responde **404**, nunca 403.
- `X-Robots-Tag: noindex, nofollow` en todo `/c/*`; límite de 120 peticiones por minuto por IP en `/c/*`.
- Cada entrada exitosa deja un `Evento` `portal_abierto` en el cliente (`Evento.clienteId`). No se registra qué pestaña abrió.
- Código válido pero cliente sin `Usuario` (acceso nunca enviado) = misma pantalla que desactivado: «Acceso desactivado. Escríbele a …» con botón de WhatsApp, sin pedir PIN.
- ⚠️ **La cadena de imports de `src/instrumentation.ts` no puede tocar ningún `node:`** (lo vigila `tests/instrumentation-grafo.test.ts`). Nada de este plan entra en esa cadena.
- ⚠️ **Migraciones solo con `prisma migrate deploy`**; nunca `migrate dev` ni `db push`. La migración se escribe a mano.
- ⚠️ **Procesos: matar solo por PID.** Nunca `next dev`/`next build` en el docroot salvo el build del despliegue (solo el controlador, uno a la vez en todo el servidor). Los subagentes verifican con `npx tsc --noEmit` y los tests.
- ⚠️ **Nunca cargar `~/.config/prospectos/env` para correr tests**: `PROSPECTOS_TEST_DB=1 npx vitest run <archivo>` encuentra la base de tests solo.
- Tests contra `neracosu_prospectos_test`. `npm test` y `npm run test:db` en verde antes de fusionar.
- Toda acción `"use server"`: sesión fuera del try/catch, zod, sin helpers exportados, devuelve `Resultado`.
- Español (Venezuela); en el portal se **tutea** al cliente y se escribe sin jerga. Comentarios en el código **sin acentos**. 390 px primero. Commits por heredoc (`git commit -F -`) con la línea `Co-Authored-By` del modelo que escribe.
- Todo el trabajo va en la rama **`pieza-5a`**, creada desde `main` por el controlador.

## Decisiones de este plan que no están en la spec

1. **`Usuario.sesionVersion`** (entero, defecto 0) viaja en el token del cliente y se compara en cada petición: es lo que hace que «Regenerar PIN» invalide las sesiones abiertas sin una tabla de sesiones.
2. **El PIN del cliente no participa de la unicidad de PINs del panel.** En el panel el PIN identifica a la persona, así que es único; en el portal la cuenta la identifica el código. `pinEnUso` pasa a mirar solo `dueno` y `prospectador` (si no, cada cliente nuevo sumaría una comparación bcrypt a cada cambio de PIN del panel).
3. **«Enviar acceso» sobre un cliente que ya tiene acceso reenvía solo el enlace**: el PIN está hasheado y no se puede recuperar. Si el cliente lo perdió, se usa «Regenerar PIN». Un acceso desactivado se reactiva regenerando el PIN.
4. **El cliente no ve cobros anulados ni sus recibos** (la descarga responde 404 con sesión de cliente). La nota de anulación la manda Neri por WhatsApp si hace falta.
5. **Tema claro propio para el portal**, con las fuentes locales del recibo vía `next/font/local`. Dirección de diseño aprobada sobre el prototipo de `capturas/p5-prototipo/`.
6. **`Evento.clienteId`** (columna nueva) para colgar `portal_abierto` del cliente, como pide la spec.

---

## Estructura de archivos

```
prisma/schema.prisma                               ← Usuario.clienteId/sesionVersion, Evento.clienteId
prisma/migrations/20260918090000_portal_cliente/migration.sql
src/lib/
  usuarios.ts                                      ← (modificar) pinEnUso solo mira roles del panel
  auth.ts                                          ← (modificar) crearTokenCliente / verificarTokenCliente
  portal-contrato.ts                               ← hitos, versiones, cobros, aviso, mensajes de acceso (puro)
  acceso-cliente.ts                                ← generarPinCliente, estadoAcceso, darAcceso, regenerarPin,
                                                     desactivarAcceso, intentarEntrada, sesionDesdeToken, enlaceSiTieneAcceso
  sesion-cliente.ts                                ← COOKIE_CLIENTE, sesionCliente, exigirCliente, limitarPortal
  portal.ts                                        ← clienteParaEntrada, inicioPortal, proyectoPortal (consultas filtradas)
  mensajes-cobro.ts, recibos-contrato.ts           ← (modificar) aceptan el enlace del portal
src/acciones/
  portal.ts                                        ← entrarPortal (la unica accion con sesion de cliente)
  acceso-cliente.ts                                ← enviarAcceso, regenerarPinCliente, desactivarAccesoCliente (dueno)
  cobros.ts, versiones.ts, recibos.ts              ← (modificar) pasan el enlace del portal a sus mensajes
src/app/c/
  layout.tsx · portal.css                          ← fuentes locales, tema claro, metadata
  [codigo]/page.tsx                                ← PIN o «acceso desactivado»
  [codigo]/inicio/page.tsx · [codigo]/proyecto/[id]/page.tsx · [codigo]/contacto/page.tsx
  [codigo]/salir/route.ts
src/app/recibos/[archivo]/route.ts                 ← (modificar) tambien sesion de cliente del clienteId correcto
src/app/(panel)/clientes/[id]/page.tsx             ← (modificar) monta AccesoPortal
src/componentes/
  TecladoPin.tsx                                   ← (modificar) acepta la accion y campos ocultos
  PortalBarra.tsx · AccesoPortal.tsx               ← nuevos
next.config.ts                                     ← (modificar) noindex en /c/
tests/
  esquema.test.ts · usuarios.test.ts · ayuda-db.ts · ayuda-sesion.ts · recibos-ruta.test.ts · cobros.test.ts   ← (modificar)
  portal-contrato.test.ts · auth.test.ts                                   ← puros
  acceso-cliente.test.ts · acceso-cliente-acciones.test.ts · portal.test.ts ← con base
scripts/verificar-flujo-portal.mts                 ← recorrido a 390 px, solo contra la base de tests
```

**Convenciones:** los errores de `src/lib/acceso-cliente.ts` son `Error` con código en `message` (`CLIENTE_NO_EXISTE`). Fechas de negocio: texto ISO `YYYY-MM-DD` en día de Caracas; en pantalla `dd/mm/aaaa` con `fechaVisible`. Dinero con `formatoUSD`.

---

### Task 1: Esquema — usuario del portal, versión de sesión y evento del cliente

**Files:**
- Modify: `prisma/schema.prisma` (modelos `Usuario`, `Evento`, `Cliente`)
- Create: `prisma/migrations/20260918090000_portal_cliente/migration.sql`
- Modify: `src/lib/usuarios.ts:31-35` (`pinEnUso`), `tests/ayuda-db.ts` (`limpiarBase`)
- Test: `tests/esquema.test.ts`, `tests/usuarios.test.ts`

**Interfaces:**
- Produces: `Usuario.clienteId: number | null` (único) con relación `cliente`; `Usuario.sesionVersion: number` (defecto 0); `Cliente.usuario` (relación 1:1 opcional) y `Cliente.eventos`; `Evento.clienteId: number | null`; `pinEnUso(pin, salvoId?)` ignora las cuentas de rol `cliente`; `limpiarBase()` borra los usuarios de rol `cliente` antes que los clientes.

- [ ] **Step 1: Tests que fallan**

En `tests/esquema.test.ts`, al final del `describe`:

```ts
  it("un cliente tiene a lo sumo un usuario de portal, con version de sesion, y un evento puede colgar del cliente", async () => {
    const c = await sembrarCliente();
    const u = await prisma.usuario.create({ data: { nombre: c.nombre, rol: "cliente", pinHash: "x", clienteId: c.id } });
    expect(u.sesionVersion).toBe(0);
    await expect(prisma.usuario.create({ data: { nombre: "otro", rol: "cliente", pinHash: "x", clienteId: c.id } })).rejects.toThrow(/Unique/);
    await prisma.evento.create({ data: { clienteId: c.id, usuarioId: u.id, tipo: "portal_abierto" } });
    expect(await prisma.evento.count({ where: { clienteId: c.id, tipo: "portal_abierto" } })).toBe(1);
    const conUsuario = await prisma.cliente.findUniqueOrThrow({ where: { id: c.id }, include: { usuario: true } });
    expect(conUsuario.usuario?.id).toBe(u.id);
  });
```

En `tests/usuarios.test.ts`: agregar `sembrarCliente` al import de `./ayuda-db`, agregar `hashPin` al import de `@/lib/usuarios`, y al final del `describe`:

```ts
  it("el PIN de un cliente del portal no cuenta para la unicidad de PINs del panel", async () => {
    const c = await sembrarCliente();
    await prisma.usuario.create({ data: { nombre: c.nombre, rol: "cliente", clienteId: c.id, pinHash: await hashPin("246810") } });
    expect(await pinEnUso("246810")).toBe(false);
    expect(await buscarPorPin("246810")).toBeNull(); // y jamas entra al panel con el
  });
```

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `PROSPECTOS_TEST_DB=1 npx vitest run tests/esquema.test.ts tests/usuarios.test.ts`
Expected: FAIL — `clienteId` no existe en `Usuario` (error de Prisma o de tipos).

- [ ] **Step 3: Esquema** — en `prisma/schema.prisma`:

En `model Usuario`, debajo de `metaDiaria`:

```prisma
  // Pieza 5: la cuenta del portal de un cliente (rol "cliente"). Una sola por cliente.
  clienteId     Int?       @unique
  cliente       Cliente?   @relation(fields: [clienteId], references: [id])
  // Sube al regenerar el PIN o desactivar el acceso: invalida las sesiones abiertas del portal.
  sesionVersion Int        @default(0)
```

En `model Cliente`, debajo de `proyectos Proyecto[]`:

```prisma
  usuario        Usuario?
  eventos        Evento[]
```

En `model Evento`, debajo de `usuario Usuario? …`:

```prisma
  // Pieza 5: eventos del cliente (portal_abierto, aviso de acceso), sin proyecto.
  clienteId   Int?
  cliente     Cliente?   @relation(fields: [clienteId], references: [id])
```

en el comentario de tipos de `Evento.tipo` agregar al final `| portal_abierto`, y entre los `@@index` de `Evento`:

```prisma
  @@index([clienteId, creadoEn])
```

- [ ] **Step 4: Migración a mano** — crear `prisma/migrations/20260918090000_portal_cliente/migration.sql`:

```sql
-- AlterTable
ALTER TABLE `Usuario` ADD COLUMN `clienteId` INTEGER NULL,
    ADD COLUMN `sesionVersion` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `Evento` ADD COLUMN `clienteId` INTEGER NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Usuario_clienteId_key` ON `Usuario`(`clienteId`);

-- CreateIndex
CREATE INDEX `Evento_clienteId_creadoEn_idx` ON `Evento`(`clienteId`, `creadoEn`);

-- AddForeignKey
ALTER TABLE `Usuario` ADD CONSTRAINT `Usuario_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `Cliente`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Evento` ADD CONSTRAINT `Evento_clienteId_fkey` FOREIGN KEY (`clienteId`) REFERENCES `Cliente`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 5: Comprobar que la migración coincide con el esquema.** Este es el ÚNICO paso que carga el env (hace falta la base sombra), en una subshell para que no quede en tu sesión:

```bash
( set -a; . /home/neracosu/.config/prospectos/env; set +a; npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "$SHADOW_DATABASE_URL" --script )
```
Expected: **solo** las líneas `MODIFY … JSON NOT NULL` de siempre (desencuentro conocido de Prisma con MariaDB). Si aparece `clienteId`, `sesionVersion`, un índice o una llave foránea, la migración a mano no coincide: corregirla hasta que no aparezca.

- [ ] **Step 6: Aplicar a la base de tests y regenerar el cliente** (también en subshell)

```bash
( set -a; . /home/neracosu/.config/prospectos/env; set +a; DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy | tail -3 )
npx prisma generate | tail -1
```
Expected: `1 migration … applied` y `Generated Prisma Client`.

- [ ] **Step 7: Aplicar a producción — SOLO el controlador**, apenas termine esta tarea. Es aditiva (columnas nulas o con defecto, índices, llaves foráneas nuevas) y el build viejo no la nota; va ya porque el cliente Prisma recién generado selecciona las columnas nuevas de `Usuario` y un reinicio inesperado de PM2 antes de migrar dejaría el login del panel en 500.

```bash
pm2 list
( set -a; . /home/neracosu/.config/prospectos/env; set +a; npx prisma migrate deploy | tail -3 )
```

- [ ] **Step 8: `pinEnUso` y `limpiarBase`**

En `src/lib/usuarios.ts`, `pinEnUso` queda:

```ts
// La unicidad del PIN se exige contra TODAS las cuentas del panel, activas o no: si se
// reactivara una cuenta desactivada, dos personas terminarian con el mismo
// PIN y buscarPorPin devolveria siempre la primera que encuentre. Las cuentas de rol
// "cliente" (portal, pieza 5) no cuentan: alla la cuenta la identifica el codigo, no el PIN.
export async function pinEnUso(pin: string, salvoId?: number): Promise<boolean> {
  const usuarios = await prisma.usuario.findMany({ where: { rol: { in: ["dueno", "prospectador"] }, ...(salvoId ? { id: { not: salvoId } } : {}) } });
  for (const u of usuarios) if (await bcrypt.compare(pin, u.pinHash)) return true;
  return false;
}
```

En `tests/ayuda-db.ts`, dentro de `limpiarBase`, justo **antes** de `await prisma.cliente.deleteMany();`:

```ts
  await prisma.usuario.deleteMany({ where: { rol: "cliente" } }); // cuelgan del cliente (pieza 5)
```

- [ ] **Step 9: Tests en verde**

Run: `PROSPECTOS_TEST_DB=1 npx vitest run tests/esquema.test.ts tests/usuarios.test.ts && npx tsc --noEmit`
Expected: PASS; `tsc` sin salida.

- [ ] **Step 10: Commit**

```bash
git add prisma src/lib/usuarios.ts tests/ayuda-db.ts tests/esquema.test.ts tests/usuarios.test.ts
git commit -F - <<'EOF'
feat(portal): esquema - usuario del portal por cliente, version de sesion y evento del cliente
EOF
```
(agrega tu línea `Co-Authored-By` al final del mensaje).

---

### Task 2: Contrato puro del portal

**Files:**
- Create: `src/lib/portal-contrato.ts`
- Test: `tests/portal-contrato.test.ts`

**Interfaces:**
- Consumes: `EstadoCobro`, `Concepto`, `ETIQUETA_CONCEPTO` de `@/lib/cobros-contrato`; `compararSemver` de `@/lib/semver-contrato`; `fechaVisible` de `@/lib/fecha-caracas`; `formatoUSD` de `@/lib/dinero`.
- Produces (desde `@/lib/portal-contrato`):
  - `type HitoPortal = { texto: string; hecho: boolean; hechoEl: string | null; fechaEstimada: string | null }`
  - `type ResumenHitos = { hechos: number; total: number; porcentaje: number | null }`; `resumenHitos(hitos: { hecho: boolean }[]): ResumenHitos`
  - `textoFechaHito(h: HitoPortal): string`
  - `versionesDelMasNuevo<T extends { version: string }>(versiones: T[]): T[]`
  - `type CobroPortal = { id: number; proyectoId: number; proyectoNombre: string; texto: string; monto: number; vence: string; estado: EstadoCobro; pagadoEl: string | null; canal: string; reciboNumero: string }`
  - `textoCobro(c: { concepto: Concepto; detalle: string }): string`
  - `separarCobros(cobros: CobroPortal[]): { porPagar: CobroPortal[]; pagados: CobroPortal[] }`
  - `type AvisoCobros = { gravedad: "vencido" | "por_vencer"; cobro: CobroPortal; otros: number }`; `avisoDeCobros(cobros: CobroPortal[]): AvisoCobros | null`; `textoAviso(a: AvisoCobros): string`
  - `enlacePortal(base: string, codigo: string): string`, `mensajeEnlacePortal(quien: string, enlace: string): string`, `mensajePinPortal(pin: string): string`, `primerNombre(nombre: string): string`

- [ ] **Step 1: Tests que fallan** — crear `tests/portal-contrato.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  resumenHitos, textoFechaHito, versionesDelMasNuevo, textoCobro, separarCobros, avisoDeCobros, textoAviso,
  enlacePortal, mensajeEnlacePortal, mensajePinPortal, primerNombre, type CobroPortal,
} from "@/lib/portal-contrato";

const cobro = (extra: Partial<CobroPortal>): CobroPortal => ({ id: 1, proyectoId: 1, proyectoNombre: "PMS Hotel", texto: "Mensualidad de octubre 2026", monto: 100, vence: "2026-10-05", estado: "pendiente", pagadoEl: null, canal: "", reciboNumero: "", ...extra });

describe("hitos", () => {
  it("resume hechos, total y porcentaje; sin hitos el porcentaje es null (no es 0 %)", () => {
    expect(resumenHitos([{ hecho: true }, { hecho: true }, { hecho: false }, { hecho: false }])).toEqual({ hechos: 2, total: 4, porcentaje: 50 });
    expect(resumenHitos([{ hecho: true }, { hecho: false }, { hecho: false }])).toEqual({ hechos: 1, total: 3, porcentaje: 33 });
    expect(resumenHitos([])).toEqual({ hechos: 0, total: 0, porcentaje: null });
  });
  it("dice la fecha real y la estimada como las lee un cliente", () => {
    expect(textoFechaHito({ texto: "x", hecho: true, hechoEl: "2026-07-02", fechaEstimada: "2026-06-30" })).toBe("Cumplido el 02/07/2026 · estimado 30/06/2026");
    expect(textoFechaHito({ texto: "x", hecho: true, hechoEl: "2026-07-20", fechaEstimada: null })).toBe("Cumplido el 20/07/2026");
    expect(textoFechaHito({ texto: "x", hecho: true, hechoEl: null, fechaEstimada: null })).toBe("Cumplido");
    expect(textoFechaHito({ texto: "x", hecho: false, hechoEl: null, fechaEstimada: "2026-09-30" })).toBe("Estimado para el 30/09/2026");
    expect(textoFechaHito({ texto: "x", hecho: false, hechoEl: null, fechaEstimada: null })).toBe("Sin fecha todavía");
  });
});

describe("versiones", () => {
  it("van de la mas nueva a la mas vieja, por semver y no por texto", () => {
    const v = [{ version: "1.4.2" }, { version: "1.10.0" }, { version: "1.3.1" }];
    expect(versionesDelMasNuevo(v).map((x) => x.version)).toEqual(["1.10.0", "1.4.2", "1.3.1"]);
    expect(v.map((x) => x.version)).toEqual(["1.4.2", "1.10.0", "1.3.1"]); // no muta la entrada
  });
});

describe("cobros", () => {
  it("el texto del cobro es su detalle, o el nombre del concepto si no tiene", () => {
    expect(textoCobro({ concepto: "mensualidad", detalle: "Mensualidad de octubre 2026" })).toBe("Mensualidad de octubre 2026");
    expect(textoCobro({ concepto: "extra", detalle: " " })).toBe("Extra");
  });
  it("separa por pagar (vence mas viejo primero) de pagados (mas reciente primero) y nunca deja pasar un anulado", () => {
    const r = separarCobros([
      cobro({ id: 1, vence: "2026-10-05", estado: "pendiente" }),
      cobro({ id: 2, vence: "2026-09-05", estado: "vencido" }),
      cobro({ id: 3, estado: "pagado", pagadoEl: "2026-07-15" }),
      cobro({ id: 4, estado: "pagado", pagadoEl: "2026-08-04" }),
      cobro({ id: 5, estado: "anulado" }),
      cobro({ id: 6, vence: "2026-09-20", estado: "por_vencer" }),
    ]);
    expect(r.porPagar.map((c) => c.id)).toEqual([2, 6, 1]);
    expect(r.pagados.map((c) => c.id)).toEqual([4, 3]);
  });
  it("el aviso elige el vencido mas viejo; si no hay, el que vence antes; cuenta los demas; sin nada urgente es null", () => {
    const vencidoViejo = cobro({ id: 2, vence: "2026-08-05", estado: "vencido" });
    const a = avisoDeCobros([cobro({ id: 1, vence: "2026-09-05", estado: "vencido" }), vencidoViejo, cobro({ id: 3, vence: "2026-09-20", estado: "por_vencer" }), cobro({ id: 4, estado: "pendiente" })]);
    expect(a).toEqual({ gravedad: "vencido", cobro: vencidoViejo, otros: 2 });
    const b = avisoDeCobros([cobro({ id: 5, vence: "2026-09-22", estado: "por_vencer" }), cobro({ id: 6, vence: "2026-09-19", estado: "por_vencer" })]);
    expect(b?.gravedad).toBe("por_vencer");
    expect(b?.cobro.id).toBe(6);
    expect(b?.otros).toBe(1);
    expect(avisoDeCobros([cobro({ estado: "pendiente" }), cobro({ estado: "pagado", pagadoEl: "2026-08-04" })])).toBeNull();
  });
  it("el texto del aviso dice monto, que es, de que proyecto y la fecha", () => {
    expect(textoAviso({ gravedad: "vencido", cobro: cobro({ texto: "Mensualidad de septiembre 2026", vence: "2026-09-05", estado: "vencido" }), otros: 0 }))
      .toBe("Tienes un cobro vencido: $100,00 de Mensualidad de septiembre 2026 (PMS Hotel). Venció el 05/09/2026.");
    expect(textoAviso({ gravedad: "por_vencer", cobro: cobro({ vence: "2026-10-05", estado: "por_vencer" }), otros: 2 }))
      .toBe("Tienes un cobro por vencer: $100,00 de Mensualidad de octubre 2026 (PMS Hotel). Vence el 05/10/2026. Hay 2 más por revisar.");
    expect(textoAviso({ gravedad: "por_vencer", cobro: cobro({ vence: "2026-10-05", estado: "por_vencer" }), otros: 1 })).toContain("Hay 1 más por revisar.");
  });
});

describe("acceso", () => {
  it("arma el enlace sin barras dobles y los dos mensajes por separado", () => {
    expect(enlacePortal("https://prospectos.neracosu.com/", "abcDEF_123-abcDEF_123x")).toBe("https://prospectos.neracosu.com/c/abcDEF_123-abcDEF_123x");
    expect(() => enlacePortal("", "x")).toThrow("Falta PROSPECTOS_URL_PUBLICA");
    const m = mensajeEnlacePortal("Ana", "https://x.test/c/abc");
    expect(m).toContain("Ana");
    expect(m).toContain("https://x.test/c/abc");
    expect(m).not.toMatch(/\d{6}/); // el PIN nunca va en el mensaje del enlace
    expect(mensajePinPortal("042917")).toContain("042917");
    expect(mensajePinPortal("042917")).not.toContain("http"); // ni el enlace en el del PIN
  });
  it("primerNombre", () => {
    expect(primerNombre("Neri Colón")).toBe("Neri");
    expect(primerNombre("  ")).toBe("Neri");
  });
});
```

- [ ] **Step 2: Correrlo y ver que falla**

Run: `npx vitest run tests/portal-contrato.test.ts`
Expected: FAIL — no existe `@/lib/portal-contrato`.

- [ ] **Step 3: Implementar** — crear `src/lib/portal-contrato.ts`:

```ts
// src/lib/portal-contrato.ts — reglas puras del portal del cliente (pieza 5). Sin base, sin disco, sin node:.
import { ETIQUETA_CONCEPTO, type Concepto, type EstadoCobro } from "@/lib/cobros-contrato";
import { compararSemver } from "@/lib/semver-contrato";
import { fechaVisible } from "@/lib/fecha-caracas";
import { formatoUSD } from "@/lib/dinero";

// Un hito es un pendiente visible al cliente. Los internos nunca llegan hasta aqui.
export type HitoPortal = { texto: string; hecho: boolean; hechoEl: string | null; fechaEstimada: string | null };
export type ResumenHitos = { hechos: number; total: number; porcentaje: number | null };

// porcentaje null = sin hitos publicados (no es 0 %).
export function resumenHitos(hitos: { hecho: boolean }[]): ResumenHitos {
  const hechos = hitos.filter((h) => h.hecho).length;
  return { hechos, total: hitos.length, porcentaje: hitos.length ? Math.round((hechos / hitos.length) * 100) : null };
}

export function textoFechaHito(h: HitoPortal): string {
  if (h.hecho) {
    if (!h.hechoEl) return "Cumplido";
    return h.fechaEstimada ? `Cumplido el ${fechaVisible(h.hechoEl)} · estimado ${fechaVisible(h.fechaEstimada)}` : `Cumplido el ${fechaVisible(h.hechoEl)}`;
  }
  return h.fechaEstimada ? `Estimado para el ${fechaVisible(h.fechaEstimada)}` : "Sin fecha todavía";
}

export function versionesDelMasNuevo<T extends { version: string }>(versiones: T[]): T[] {
  return [...versiones].sort((a, b) => compararSemver(b.version, a.version));
}

export type CobroPortal = {
  id: number; proyectoId: number; proyectoNombre: string; texto: string; monto: number; vence: string;
  estado: EstadoCobro; pagadoEl: string | null; canal: string; reciboNumero: string;
};

export function textoCobro(c: { concepto: Concepto; detalle: string }): string {
  return c.detalle.trim() || ETIQUETA_CONCEPTO[c.concepto];
}

// Un cobro anulado nunca se le muestra al cliente: se descarta aqui aunque la consulta ya lo filtre.
export function separarCobros(cobros: CobroPortal[]): { porPagar: CobroPortal[]; pagados: CobroPortal[] } {
  const porPagar = cobros.filter((c) => c.estado === "vencido" || c.estado === "por_vencer" || c.estado === "pendiente").sort((a, b) => a.vence.localeCompare(b.vence));
  const pagados = cobros.filter((c) => c.estado === "pagado").sort((a, b) => (b.pagadoEl ?? "").localeCompare(a.pagadoEl ?? ""));
  return { porPagar, pagados };
}

export type AvisoCobros = { gravedad: "vencido" | "por_vencer"; cobro: CobroPortal; otros: number };

// Lo mas urgente primero: el vencido mas viejo; si no hay vencidos, el que vence antes.
export function avisoDeCobros(cobros: CobroPortal[]): AvisoCobros | null {
  const urgentes = cobros.filter((c) => c.estado === "vencido" || c.estado === "por_vencer");
  if (urgentes.length === 0) return null;
  const vencidos = urgentes.filter((c) => c.estado === "vencido");
  const grupo = vencidos.length ? vencidos : urgentes;
  const cobro = [...grupo].sort((a, b) => a.vence.localeCompare(b.vence))[0];
  return { gravedad: vencidos.length ? "vencido" : "por_vencer", cobro, otros: urgentes.length - 1 };
}

export function textoAviso(a: AvisoCobros): string {
  const c = a.cobro;
  const base = a.gravedad === "vencido"
    ? `Tienes un cobro vencido: ${formatoUSD(c.monto)} de ${c.texto} (${c.proyectoNombre}). Venció el ${fechaVisible(c.vence)}.`
    : `Tienes un cobro por vencer: ${formatoUSD(c.monto)} de ${c.texto} (${c.proyectoNombre}). Vence el ${fechaVisible(c.vence)}.`;
  return a.otros > 0 ? `${base} Hay ${a.otros} más por revisar.` : base;
}

export function enlacePortal(base: string, codigo: string): string {
  const limpia = base.replace(/\/+$/, "");
  if (!limpia) throw new Error("Falta PROSPECTOS_URL_PUBLICA");
  return `${limpia}/c/${codigo}`;
}

// El enlace y el PIN van en mensajes separados a proposito: si el cliente reenvia el chat, no va todo junto.
export function mensajeEnlacePortal(quien: string, enlace: string): string {
  return `Buenas, ${quien}. Desde este enlace puede ver cómo van sus proyectos, las versiones publicadas, sus cobros y sus recibos: ${enlace}\nEn un momento le envío el PIN para entrar.`;
}

export function mensajePinPortal(pin: string): string {
  return `Su PIN para entrar es ${pin}. Es solo suyo: no lo comparta.`;
}

// "Neri Colón" -> "Neri". Lo usa el portal para decir a quien escribirle.
export function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] || "Neri";
}
```

- [ ] **Step 4: Tests en verde**

Run: `npx vitest run tests/portal-contrato.test.ts tests/instrumentation-grafo.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/portal-contrato.ts tests/portal-contrato.test.ts
git commit -F - <<'EOF'
feat(portal): contrato puro - hitos, versiones, cobros, aviso y mensajes de acceso
EOF
```

---

### Task 3: Acceso — token del cliente, PIN, bloqueo por intentos y sesión

**Files:**
- Modify: `src/lib/auth.ts`
- Create: `src/lib/acceso-cliente.ts`, `src/lib/sesion-cliente.ts`, `src/acciones/portal.ts`
- Modify: `src/componentes/TecladoPin.tsx`, `tests/ayuda-sesion.ts`
- Test: `tests/auth.test.ts` (puro), `tests/acceso-cliente.test.ts` (con base)

**Interfaces:**
- Consumes: `Usuario.clienteId` / `sesionVersion` y `Evento.clienteId` (tarea 1); `hashPin`, `PIN_VALIDO` de `@/lib/usuarios`; `bloqueado`, `registrarFallo`, `olvidarFallos`, `permitirIntento` de `@/lib/rate-limit`; `CODIGO_VALIDO` de `@/lib/codigo`; `enlacePortal` de `@/lib/portal-contrato`.
- Produces:
  - `@/lib/auth`: `type SesionCliente = { usuarioId: number; clienteId: number; v: number }`, `crearTokenCliente(s: SesionCliente): Promise<string>`, `verificarTokenCliente(token: string): Promise<SesionCliente | null>`.
  - `@/lib/acceso-cliente`: `generarPinCliente(): string`; `type EstadoAcceso = { estado: "sin_acceso" | "activo" | "desactivado"; ultimoIngreso: Date | null; ingresos: number }`; `estadoAcceso(clienteId: number): Promise<EstadoAcceso>`; `darAcceso(clienteId: number): Promise<{ pin: string | null }>`; `regenerarPin(clienteId: number): Promise<{ pin: string }>`; `desactivarAcceso(clienteId: number): Promise<void>`; `intentarEntrada(d: { codigo: string; pin: string; ip: string }): Promise<{ ok: true; token: string } | { ok: false; motivo: "bloqueado" | "incorrecto" }>`; `type SesionPortal = { usuarioId: number; clienteId: number; codigo: string; nombre: string }`; `sesionDesdeToken(token: string | undefined): Promise<SesionPortal | null>`; `enlaceSiTieneAcceso(clienteId: number): Promise<string>`.
  - `@/lib/sesion-cliente`: `COOKIE_CLIENTE = "sesion_cliente"`, `sesionCliente(): Promise<SesionPortal | null>`, `exigirCliente(codigo: string): Promise<SesionPortal>`, `limitarPortal(): Promise<void>`.
  - `@/acciones/portal`: `entrarPortal(_: unknown, formData: FormData): Promise<Resultado>` (campos `codigo` y `pin`).
  - `TecladoPin` acepta `{ accion?, campos? }`; sin props se comporta igual que hoy.
  - `tests/ayuda-sesion.ts`: `sesionClienteFalsa: { actual: SesionPortal | null }`.

- [ ] **Step 1: Tests que fallan**

Crear `tests/auth.test.ts` (puro):

```ts
import { describe, it, expect } from "vitest";
import { crearToken, verificarToken, crearTokenCliente, verificarTokenCliente } from "@/lib/auth";

describe("tokens del panel y del portal", () => {
  it("el del portal lleva usuario, cliente y version de sesion", async () => {
    const t = await crearTokenCliente({ usuarioId: 7, clienteId: 3, v: 2 });
    expect(await verificarTokenCliente(t)).toEqual({ usuarioId: 7, clienteId: 3, v: 2 });
  });
  it("tener sesion de cliente no da acceso al panel, ni al reves", async () => {
    const delPortal = await crearTokenCliente({ usuarioId: 7, clienteId: 3, v: 0 });
    const delPanel = await crearToken({ id: 1, nombre: "Neri", rol: "dueno" });
    expect(await verificarToken(delPortal)).toBeNull();
    expect(await verificarTokenCliente(delPanel)).toBeNull();
    expect(await verificarTokenCliente("basura")).toBeNull();
  });
});
```

Crear `tests/acceso-cliente.test.ts` (con base):

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, sembrarCliente } from "./ayuda-db";
import { _reiniciarIntentos } from "@/lib/rate-limit";
import { crearToken, verificarTokenCliente } from "@/lib/auth";
import { generarPinCliente, estadoAcceso, darAcceso, regenerarPin, desactivarAcceso, intentarEntrada, sesionDesdeToken, enlaceSiTieneAcceso } from "@/lib/acceso-cliente";

describe("generarPinCliente", () => {
  it("siempre 6 digitos, con ceros a la izquierda si tocan", () => {
    for (let i = 0; i < 200; i++) expect(generarPinCliente()).toMatch(/^\d{6}$/);
  });
});

describe.runIf(DB_HABILITADA)("acceso del cliente al portal", () => {
  let cliente: Awaited<ReturnType<typeof sembrarCliente>>;
  let otro: Awaited<ReturnType<typeof sembrarCliente>>;
  beforeAll(async () => {
    await limpiarBase(); await sembrarBasico();
    cliente = await sembrarCliente({ nombre: "Hotel Acceso" });
    otro = await sembrarCliente({ nombre: "Farmacia Otra" });
  });
  beforeEach(() => _reiniciarIntentos());
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("sin acceso enviado: estado sin_acceso, sin enlace y no entra con ningun PIN", async () => {
    expect(await estadoAcceso(cliente.id)).toEqual({ estado: "sin_acceso", ultimoIngreso: null, ingresos: 0 });
    expect(await enlaceSiTieneAcceso(cliente.id)).toBe("");
    expect(await intentarEntrada({ codigo: cliente.codigo, pin: "123456", ip: "1.1.1.1" })).toEqual({ ok: false, motivo: "incorrecto" });
  });

  it("darAcceso crea la cuenta una sola vez: la primera vez devuelve el PIN, la segunda no", async () => {
    const a = await darAcceso(cliente.id);
    expect(a.pin).toMatch(/^\d{6}$/);
    expect((await darAcceso(cliente.id)).pin).toBeNull();
    const u = await prisma.usuario.findUniqueOrThrow({ where: { clienteId: cliente.id } });
    expect(u).toMatchObject({ rol: "cliente", activo: true, nombre: "Hotel Acceso", sesionVersion: 0 });
    expect(u.pinHash).not.toContain(a.pin!); // guardado con hash
    await expect(darAcceso(999_999)).rejects.toThrow("CLIENTE_NO_EXISTE");
    expect((await estadoAcceso(cliente.id)).estado).toBe("activo");
    expect(await enlaceSiTieneAcceso(cliente.id)).toMatch(new RegExp(`/c/${cliente.codigo}$`));
  });

  it("entra con su PIN: token valido, evento portal_abierto y sesion con su codigo", async () => {
    const { pin } = await regenerarPin(cliente.id);
    const r = await intentarEntrada({ codigo: cliente.codigo, pin, ip: "2.2.2.2" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(await verificarTokenCliente(r.token)).toMatchObject({ clienteId: cliente.id });
    expect(await sesionDesdeToken(r.token)).toMatchObject({ clienteId: cliente.id, codigo: cliente.codigo, nombre: "Hotel Acceso" });
    expect(await prisma.evento.count({ where: { clienteId: cliente.id, tipo: "portal_abierto" } })).toBe(1);
    const e = await estadoAcceso(cliente.id);
    expect(e.ingresos).toBe(1);
    expect(e.ultimoIngreso).not.toBeNull();
  });

  it("el PIN de un cliente no abre el portal de otro, y un codigo inexistente responde igual que un PIN errado", async () => {
    const { pin } = await regenerarPin(cliente.id);
    await darAcceso(otro.id);
    expect(await intentarEntrada({ codigo: otro.codigo, pin, ip: "3.3.3.3" })).toEqual({ ok: false, motivo: "incorrecto" });
    expect(await intentarEntrada({ codigo: "A".repeat(22), pin, ip: "3.3.3.4" })).toEqual({ ok: false, motivo: "incorrecto" });
    expect(await intentarEntrada({ codigo: cliente.codigo, pin: "12345", ip: "3.3.3.5" })).toEqual({ ok: false, motivo: "incorrecto" });
  });

  it("regenerar el PIN invalida el anterior y las sesiones abiertas", async () => {
    const viejo = (await regenerarPin(cliente.id)).pin;
    const r = await intentarEntrada({ codigo: cliente.codigo, pin: viejo, ip: "4.4.4.4" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const nuevo = (await regenerarPin(cliente.id)).pin;
    expect(await sesionDesdeToken(r.token)).toBeNull();
    if (nuevo !== viejo) expect((await intentarEntrada({ codigo: cliente.codigo, pin: viejo, ip: "4.4.4.5" })).ok).toBe(false);
    expect((await intentarEntrada({ codigo: cliente.codigo, pin: nuevo, ip: "4.4.4.6" })).ok).toBe(true);
  });

  it("desactivar corta la sesion y el PIN deja de servir; regenerar reactiva", async () => {
    const { pin } = await regenerarPin(cliente.id);
    const r = await intentarEntrada({ codigo: cliente.codigo, pin, ip: "5.5.5.5" });
    if (!r.ok) throw new Error("debio entrar");
    await desactivarAcceso(cliente.id);
    expect((await estadoAcceso(cliente.id)).estado).toBe("desactivado");
    expect(await sesionDesdeToken(r.token)).toBeNull();
    expect(await enlaceSiTieneAcceso(cliente.id)).toBe("");
    expect(await intentarEntrada({ codigo: cliente.codigo, pin, ip: "5.5.5.6" })).toEqual({ ok: false, motivo: "incorrecto" });
    const otra = await regenerarPin(cliente.id);
    expect((await estadoAcceso(cliente.id)).estado).toBe("activo");
    expect((await intentarEntrada({ codigo: cliente.codigo, pin: otra.pin, ip: "5.5.5.7" })).ok).toBe(true);
    expect(await prisma.usuario.count({ where: { clienteId: cliente.id } })).toBe(1); // nada se borra ni se duplica
  });

  it("bloquea la CUENTA a los 5 fallos aunque vengan de IPs distintas, y ni el PIN correcto entra", async () => {
    const { pin } = await regenerarPin(cliente.id);
    const malo = pin === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect(await intentarEntrada({ codigo: cliente.codigo, pin: malo, ip: `6.6.6.${i}` })).toEqual({ ok: false, motivo: "incorrecto" });
    expect(await intentarEntrada({ codigo: cliente.codigo, pin, ip: "6.6.6.99" })).toEqual({ ok: false, motivo: "bloqueado" });
  });

  it("bloquea la IP a los 5 fallos aunque pruebe contra cuentas distintas", async () => {
    await darAcceso(otro.id);
    const { pin } = await regenerarPin(cliente.id);
    for (let i = 0; i < 5; i++) await intentarEntrada({ codigo: i % 2 ? cliente.codigo : otro.codigo, pin: "9".repeat(5) + String(i), ip: "7.7.7.7" });
    expect(await intentarEntrada({ codigo: cliente.codigo, pin, ip: "7.7.7.7" })).toEqual({ ok: false, motivo: "bloqueado" });
    expect((await intentarEntrada({ codigo: cliente.codigo, pin, ip: "7.7.7.8" })).ok).toBe(true); // otra IP si entra
  });

  it("sesionDesdeToken rechaza basura, un token sin cookie y un token del panel", async () => {
    expect(await sesionDesdeToken(undefined)).toBeNull();
    expect(await sesionDesdeToken("basura")).toBeNull();
    expect(await sesionDesdeToken(await crearToken({ id: 1, nombre: "Neri", rol: "dueno" }))).toBeNull();
  });
});
```

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `npx vitest run tests/auth.test.ts` y luego `PROSPECTOS_TEST_DB=1 npx vitest run tests/acceso-cliente.test.ts`
Expected: FAIL — `crearTokenCliente` no existe; no existe `@/lib/acceso-cliente`.

- [ ] **Step 3: Token del cliente** — al final de `src/lib/auth.ts`:

```ts
// --- Portal del cliente (pieza 5). Misma firma, otra audiencia: un token del portal no pasa
// verificarToken (no trae rol del panel) y uno del panel no pasa verificarTokenCliente (no trae la audiencia).
export type SesionCliente = { usuarioId: number; clienteId: number; v: number };
const AUDIENCIA_PORTAL = "portal";
const PayloadCliente = z.object({ usuarioId: z.number().int().positive(), clienteId: z.number().int().positive(), v: z.number().int().min(0) });

export async function crearTokenCliente(s: SesionCliente): Promise<string> {
  return new SignJWT({ ...s }).setProtectedHeader({ alg: "HS256" }).setAudience(AUDIENCIA_PORTAL).setIssuedAt().setExpirationTime("30d").sign(secreto());
}

export async function verificarTokenCliente(token: string): Promise<SesionCliente | null> {
  try {
    const { payload } = await jwtVerify(token, secreto(), { algorithms: ["HS256"], audience: AUDIENCIA_PORTAL });
    const p = PayloadCliente.safeParse(payload);
    return p.success ? p.data : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: El acceso** — crear `src/lib/acceso-cliente.ts`:

```ts
// src/lib/acceso-cliente.ts — la cuenta del portal de un cliente: PIN, bloqueo por intentos y sesion (pieza 5).
// El acceso es POR CLIENTE, no por proyecto: un Usuario de rol "cliente" por Cliente.
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { hashPin, PIN_VALIDO } from "@/lib/usuarios";
import { crearTokenCliente, verificarTokenCliente } from "@/lib/auth";
import { bloqueado, registrarFallo, olvidarFallos } from "@/lib/rate-limit";
import { CODIGO_VALIDO } from "@/lib/codigo";
import { enlacePortal } from "@/lib/portal-contrato";

// 6 digitos uniformes con el crypto global. Se descarta la cola de 2^32 que sesgaria el modulo.
export function generarPinCliente(): string {
  const n = new Uint32Array(1);
  do { crypto.getRandomValues(n); } while (n[0] >= 4_294_000_000);
  return String(n[0] % 1_000_000).padStart(6, "0");
}

export type EstadoAcceso = { estado: "sin_acceso" | "activo" | "desactivado"; ultimoIngreso: Date | null; ingresos: number };

export async function estadoAcceso(clienteId: number): Promise<EstadoAcceso> {
  const u = await prisma.usuario.findUnique({ where: { clienteId }, select: { activo: true, rol: true } });
  if (!u || u.rol !== "cliente") return { estado: "sin_acceso", ultimoIngreso: null, ingresos: 0 };
  const [ultimo, ingresos] = await Promise.all([
    prisma.evento.findFirst({ where: { clienteId, tipo: "portal_abierto" }, orderBy: { creadoEn: "desc" }, select: { creadoEn: true } }),
    prisma.evento.count({ where: { clienteId, tipo: "portal_abierto" } }),
  ]);
  return { estado: u.activo ? "activo" : "desactivado", ultimoIngreso: ultimo?.creadoEn ?? null, ingresos };
}

function esConflictoUnico(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
}

// Crea la cuenta si no existe y devuelve el PIN en claro (la unica vez que existe). Si ya habia
// cuenta devuelve pin null: el PIN esta hasheado y no se recupera; para uno nuevo esta regenerarPin.
export async function darAcceso(clienteId: number): Promise<{ pin: string | null }> {
  const c = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { nombre: true, usuario: { select: { id: true } } } });
  if (!c) throw new Error("CLIENTE_NO_EXISTE");
  if (c.usuario) return { pin: null };
  const pin = generarPinCliente();
  try {
    await prisma.usuario.create({ data: { nombre: c.nombre, rol: "cliente", clienteId, pinHash: await hashPin(pin), metaDiaria: 0 } });
    return { pin };
  } catch (err) {
    if (esConflictoUnico(err)) return { pin: null }; // dos toques: gano el otro
    throw err;
  }
}

// PIN nuevo: el anterior deja de servir y las sesiones abiertas caen (sesionVersion). Tambien reactiva.
export async function regenerarPin(clienteId: number): Promise<{ pin: string }> {
  const c = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { nombre: true } });
  if (!c) throw new Error("CLIENTE_NO_EXISTE");
  const pin = generarPinCliente();
  const pinHash = await hashPin(pin);
  await prisma.usuario.upsert({
    where: { clienteId },
    update: { pinHash, activo: true, sesionVersion: { increment: 1 } },
    create: { nombre: c.nombre, rol: "cliente", clienteId, pinHash, metaDiaria: 0 },
  });
  return { pin };
}

// Nada se borra: la cuenta queda, apagada, y las sesiones abiertas caen.
export async function desactivarAcceso(clienteId: number): Promise<void> {
  await prisma.usuario.updateMany({ where: { clienteId, rol: "cliente" }, data: { activo: false, sesionVersion: { increment: 1 } } });
}

// Bloqueo de 5 fallos / 15 min por CUENTA y por IP. Un codigo que no existe, un acceso apagado y un
// PIN errado responden igual ("incorrecto"): desde afuera no se distingue si el codigo existe.
export async function intentarEntrada(d: { codigo: string; pin: string; ip: string }): Promise<{ ok: true; token: string } | { ok: false; motivo: "bloqueado" | "incorrecto" }> {
  const claveIp = `portal:ip:${d.ip}`;
  const claveCuenta = `portal:c:${d.codigo}`;
  if (bloqueado(claveIp) || bloqueado(claveCuenta)) return { ok: false, motivo: "bloqueado" };
  const fallar = (): { ok: false; motivo: "incorrecto" } => { registrarFallo(claveIp); registrarFallo(claveCuenta); return { ok: false, motivo: "incorrecto" }; };
  if (!CODIGO_VALIDO.test(d.codigo) || !PIN_VALIDO.test(d.pin)) return fallar();
  const c = await prisma.cliente.findUnique({ where: { codigo: d.codigo }, select: { id: true, usuario: { select: { id: true, activo: true, rol: true, pinHash: true, sesionVersion: true } } } });
  const u = c?.usuario;
  if (!c || !u || !u.activo || u.rol !== "cliente") return fallar();
  if (!(await bcrypt.compare(d.pin, u.pinHash))) return fallar();
  olvidarFallos(claveIp); olvidarFallos(claveCuenta);
  // Para que Neri sepa si el cliente lo usa. No se registra que pestana abrio.
  await prisma.evento.create({ data: { clienteId: c.id, usuarioId: u.id, tipo: "portal_abierto" } });
  return { ok: true, token: await crearTokenCliente({ usuarioId: u.id, clienteId: c.id, v: u.sesionVersion }) };
}

export type SesionPortal = { usuarioId: number; clienteId: number; codigo: string; nombre: string };

// La cookie sola no alcanza: la cuenta tiene que seguir activa y con la misma version de sesion.
export async function sesionDesdeToken(token: string | undefined): Promise<SesionPortal | null> {
  const s = token ? await verificarTokenCliente(token) : null;
  if (!s) return null;
  const u = await prisma.usuario.findUnique({ where: { id: s.usuarioId }, select: { activo: true, rol: true, clienteId: true, sesionVersion: true, cliente: { select: { codigo: true, nombre: true } } } });
  if (!u || !u.activo || u.rol !== "cliente" || u.clienteId !== s.clienteId || u.sesionVersion !== s.v || !u.cliente) return null;
  return { usuarioId: s.usuarioId, clienteId: s.clienteId, codigo: u.cliente.codigo, nombre: u.cliente.nombre };
}

// El {enlace} de los mensajes: vacio si el cliente no puede entrar (no se manda un enlace que no abre).
export async function enlaceSiTieneAcceso(clienteId: number): Promise<string> {
  const c = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { codigo: true, usuario: { select: { activo: true, rol: true } } } });
  if (!c?.usuario || !c.usuario.activo || c.usuario.rol !== "cliente") return "";
  return enlacePortal(process.env.PROSPECTOS_URL_PUBLICA ?? "", c.codigo);
}
```

- [ ] **Step 5: La sesión** — crear `src/lib/sesion-cliente.ts`:

```ts
// src/lib/sesion-cliente.ts — puerta unica del portal del cliente. No comparte nada con la del panel.
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { sesionDesdeToken, type SesionPortal } from "@/lib/acceso-cliente";
import { permitirIntento } from "@/lib/rate-limit";
import { ipCliente } from "@/lib/ip";
import { CODIGO_VALIDO } from "@/lib/codigo";

export const COOKIE_CLIENTE = "sesion_cliente";
export const DIAS_SESION_CLIENTE = 30;

// cache(): layout y pagina la llaman en la misma peticion; la base se consulta una vez.
export const sesionCliente = cache(async (): Promise<SesionPortal | null> => {
  return sesionDesdeToken((await cookies()).get(COOKIE_CLIENTE)?.value);
});

// Toda pantalla del portal empieza aqui. Sin sesion, o con la sesion de OTRO cliente, vuelve al PIN de este codigo.
export async function exigirCliente(codigo: string): Promise<SesionPortal> {
  if (!CODIGO_VALIDO.test(codigo)) notFound();
  await limitarPortal();
  const s = await sesionCliente();
  if (!s || s.codigo !== codigo) redirect(`/c/${codigo}`);
  return s;
}

// 120 peticiones por minuto por IP en /c/*. Pasado el limite responde como si no existiera.
export async function limitarPortal(): Promise<void> {
  if (!permitirIntento(`c:${await ipCliente()}`, 120, 60_000)) notFound();
}
```

- [ ] **Step 6: La acción de entrar** — crear `src/acciones/portal.ts`:

```ts
"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { intentarEntrada } from "@/lib/acceso-cliente";
import { COOKIE_CLIENTE, DIAS_SESION_CLIENTE } from "@/lib/sesion-cliente";
import { ipCliente } from "@/lib/ip";
import { fallo, type Resultado } from "@/acciones/resultado";

// La UNICA accion con sesion de cliente: el portal solo lee. Salir es una ruta que borra la cookie.
const Entrada = z.object({ codigo: z.string().max(40), pin: z.string().max(12) });

export async function entrarPortal(_: unknown, formData: FormData): Promise<Resultado> {
  const ip = await ipCliente();
  // redirect() usa una excepcion interna de Next: tiene que quedar FUERA del try.
  let destino = "";
  try {
    const e = Entrada.safeParse({ codigo: String(formData.get("codigo") ?? ""), pin: String(formData.get("pin") ?? "") });
    if (!e.success) return fallo("PIN incorrecto.");
    const r = await intentarEntrada({ codigo: e.data.codigo, pin: e.data.pin, ip });
    if (!r.ok) return fallo(r.motivo === "bloqueado" ? "Demasiados intentos. Espera 15 minutos." : "PIN incorrecto.");
    (await cookies()).set(COOKIE_CLIENTE, r.token, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/",
      maxAge: DIAS_SESION_CLIENTE * 24 * 60 * 60,
    });
    destino = `/c/${e.data.codigo}/inicio`;
  } catch (err) {
    console.error("entrarPortal", err);
    return fallo("No se pudo entrar. Intenta de nuevo.");
  }
  redirect(destino);
}
```

- [ ] **Step 7: `TecladoPin` reutilizable** — en `src/componentes/TecladoPin.tsx`:

1. Agregar el import del tipo: `import type { Resultado } from "@/acciones/resultado";`
2. La firma y el `useActionState` quedan:

```tsx
type AccionPin = (estado: unknown, formData: FormData) => Promise<Resultado>;

// Teclado numerico grande: se usa con el pulgar. Al sexto digito envia solo.
// Por defecto entra al panel; el portal del cliente le pasa su accion y el codigo como campo oculto.
export function TecladoPin({ accion: accionPropia, campos }: { accion?: AccionPin; campos?: Record<string, string> } = {}) {
  const [estado, accion, pendiente] = useActionState(accionPropia ?? entrar, null);
```

3. Debajo de `<input type="hidden" name="pin" value={pin} />` agregar:

```tsx
      {campos && Object.entries(campos).map(([nombre, valor]) => <input key={nombre} type="hidden" name={nombre} value={valor} />)}
```

- [ ] **Step 8: Ayuda de sesión para los tests** — al final de `tests/ayuda-sesion.ts`:

```ts
import type { SesionPortal } from "@/lib/acceso-cliente";

// Igual que sesionFalsa, para la sesion del portal del cliente. El vi.mock de
// "@/lib/sesion-cliente" va en cada archivo de test que lo necesite.
export const sesionClienteFalsa: { actual: SesionPortal | null } = { actual: null };
```
(si el archivo ya tiene un `import type` arriba, poner este junto a ese).

- [ ] **Step 9: Tests en verde**

Run: `npx vitest run tests/auth.test.ts tests/instrumentation-grafo.test.ts`, luego `PROSPECTOS_TEST_DB=1 npx vitest run tests/acceso-cliente.test.ts`, luego `npx tsc --noEmit`
Expected: PASS (2 + 1 + 10); `tsc` sin salida.

- [ ] **Step 10: Commit**

```bash
git add src/lib/auth.ts src/lib/acceso-cliente.ts src/lib/sesion-cliente.ts src/acciones/portal.ts src/componentes/TecladoPin.tsx tests/ayuda-sesion.ts tests/auth.test.ts tests/acceso-cliente.test.ts
git commit -F - <<'EOF'
feat(portal): acceso del cliente - PIN, bloqueo por cuenta y por IP, y sesion propia
EOF
```

---

### Task 4: Panel — «Enviar acceso», «Regenerar PIN» y «Desactivar acceso» en la ficha del cliente

**Files:**
- Create: `src/acciones/acceso-cliente.ts`, `src/componentes/AccesoPortal.tsx`
- Modify: `src/app/(panel)/clientes/[id]/page.tsx`
- Test: `tests/acceso-cliente-acciones.test.ts`

**Interfaces:**
- Consumes: `estadoAcceso`, `darAcceso`, `regenerarPin`, `desactivarAcceso` (tarea 3); `enlacePortal`, `mensajeEnlacePortal`, `mensajePinPortal` (tarea 2); `enlaceWhatsappCobro` de `@/lib/mensajes-cobro`; `exigirRol` de `@/lib/sesion`.
- Produces (desde `@/acciones/acceso-cliente`):
  - `type AccesoEnviado = { enlace: string; mensajeEnlace: string; hrefEnlace: string | null; pin: string | null; mensajePin: string | null; hrefPin: string | null }`
  - `enviarAcceso(clienteId: number): Promise<Resultado<AccesoEnviado>>`
  - `regenerarPinCliente(clienteId: number): Promise<Resultado<AccesoEnviado>>` (siempre con `pin`)
  - `desactivarAccesoCliente(clienteId: number): Promise<Resultado>`
- `<AccesoPortal clienteId={number} enlace={string} acceso={EstadoAcceso} tieneWhatsapp={boolean} />`

- [ ] **Step 1: Tests que fallan** — crear `tests/acceso-cliente-acciones.test.ts`:

```ts
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
import { DB_HABILITADA, limpiarBase, sembrarBasico, sembrarCliente } from "./ayuda-db";
import { sesionFalsa } from "./ayuda-sesion";
import { _reiniciarIntentos } from "@/lib/rate-limit";
import { intentarEntrada } from "@/lib/acceso-cliente";
import { enviarAcceso, regenerarPinCliente, desactivarAccesoCliente } from "@/acciones/acceso-cliente";

describe.runIf(DB_HABILITADA)("acciones de acceso al portal", () => {
  let ids: Awaited<ReturnType<typeof sembrarBasico>>;
  let conCel: Awaited<ReturnType<typeof sembrarCliente>>;
  let sinCel: Awaited<ReturnType<typeof sembrarCliente>>;
  beforeAll(async () => {
    await limpiarBase(); ids = await sembrarBasico();
    conCel = await sembrarCliente({ nombre: "Hotel Con Cel", whatsapp: "584129999999" });
    sinCel = await sembrarCliente({ nombre: "Hotel Sin Cel", whatsapp: "" });
  });
  beforeEach(() => { _reiniciarIntentos(); sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" }; });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("el prospectador no toca el acceso de los clientes", async () => {
    sesionFalsa.actual = { id: ids.prospectadorId, nombre: "María", rol: "prospectador" };
    await expect(enviarAcceso(conCel.id)).rejects.toThrow("REDIRECT:/hoy");
    await expect(regenerarPinCliente(conCel.id)).rejects.toThrow("REDIRECT:/hoy");
    await expect(desactivarAccesoCliente(conCel.id)).rejects.toThrow("REDIRECT:/hoy");
  });

  it("la primera vez devuelve enlace y PIN en dos mensajes separados, y el PIN entra de verdad", async () => {
    const r = await enviarAcceso(conCel.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.datos.enlace).toMatch(new RegExp(`/c/${conCel.codigo}$`));
    expect(r.datos.pin).toMatch(/^\d{6}$/);
    expect(r.datos.hrefEnlace).toMatch(/^https:\/\/wa\.me\/584129999999\?text=/);
    expect(decodeURIComponent(r.datos.hrefEnlace!)).toContain(r.datos.enlace);
    expect(decodeURIComponent(r.datos.hrefEnlace!)).not.toContain(r.datos.pin!);
    expect(decodeURIComponent(r.datos.hrefPin!)).toContain(r.datos.pin!);
    expect(decodeURIComponent(r.datos.hrefPin!)).not.toContain("/c/");
    expect((await intentarEntrada({ codigo: conCel.codigo, pin: r.datos.pin!, ip: "8.8.8.8" })).ok).toBe(true);
    expect(await prisma.evento.count({ where: { clienteId: conCel.id, tipo: "aviso_cliente", texto: "acceso al portal" } })).toBe(1);
  });

  it("la segunda vez reenvia solo el enlace: el PIN no se puede recuperar", async () => {
    const r = await enviarAcceso(conCel.id);
    expect(r.ok && r.datos.pin).toBeNull();
    expect(r.ok && r.datos.hrefPin).toBeNull();
    expect(r.ok && r.datos.hrefEnlace).toMatch(/^https:\/\/wa\.me\//);
  });

  it("regenerar devuelve un PIN nuevo que entra; sin WhatsApp da los textos para copiar", async () => {
    const r = await regenerarPinCliente(sinCel.id);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.datos.pin).toMatch(/^\d{6}$/);
    expect(r.datos.hrefEnlace).toBeNull();
    expect(r.datos.hrefPin).toBeNull();
    expect(r.datos.mensajePin).toContain(r.datos.pin!);
    expect((await intentarEntrada({ codigo: sinCel.codigo, pin: r.datos.pin!, ip: "8.8.4.4" })).ok).toBe(true);
  });

  it("desactivar corta el acceso; un cliente que no existe falla con mensaje claro", async () => {
    const r = await regenerarPinCliente(conCel.id);
    if (!r.ok) throw new Error("debio regenerar");
    expect((await desactivarAccesoCliente(conCel.id)).ok).toBe(true);
    expect((await intentarEntrada({ codigo: conCel.codigo, pin: r.datos.pin!, ip: "8.8.1.1" })).ok).toBe(false);
    expect(await enviarAcceso(999_999)).toEqual({ ok: false, mensaje: "Ese cliente no existe." });
    expect((await enviarAcceso(-1)).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Correrlo y ver que falla**

Run: `PROSPECTOS_TEST_DB=1 npx vitest run tests/acceso-cliente-acciones.test.ts`
Expected: FAIL — no existe `@/acciones/acceso-cliente`.

- [ ] **Step 3: Las acciones** — crear `src/acciones/acceso-cliente.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { exigirRol } from "@/lib/sesion";
import { darAcceso, regenerarPin, desactivarAcceso } from "@/lib/acceso-cliente";
import { enlacePortal, mensajeEnlacePortal, mensajePinPortal } from "@/lib/portal-contrato";
import { enlaceWhatsappCobro } from "@/lib/mensajes-cobro";
import { fallo, exito, type Resultado } from "@/acciones/resultado";

// exigirRol("dueno") va FUERA del try/catch. Solo el dueno da, regenera o apaga el acceso de un cliente.
// El PIN en claro existe solo en la respuesta: no se guarda ni se escribe en el log.
const ERROR = "No se pudo completar. Intenta de nuevo.";
const Id = z.number().int().positive();

export type AccesoEnviado = { enlace: string; mensajeEnlace: string; hrefEnlace: string | null; pin: string | null; mensajePin: string | null; hrefPin: string | null };

async function armar(clienteId: number, pin: string | null): Promise<AccesoEnviado | null> {
  const c = await prisma.cliente.findUnique({ where: { id: clienteId }, select: { nombre: true, contactoNombre: true, whatsapp: true, codigo: true } });
  if (!c) return null;
  const enlace = enlacePortal(process.env.PROSPECTOS_URL_PUBLICA ?? "", c.codigo);
  const mensajeEnlace = mensajeEnlacePortal(c.contactoNombre || c.nombre, enlace);
  const mensajePin = pin ? mensajePinPortal(pin) : null;
  return { enlace, mensajeEnlace, hrefEnlace: enlaceWhatsappCobro(c.whatsapp, mensajeEnlace), pin, mensajePin, hrefPin: mensajePin ? enlaceWhatsappCobro(c.whatsapp, mensajePin) : null };
}

export async function enviarAcceso(clienteId: number): Promise<Resultado<AccesoEnviado>> {
  const u = await exigirRol("dueno");
  const e = Id.safeParse(clienteId);
  if (!e.success) return fallo(ERROR);
  try {
    const { pin } = await darAcceso(e.data);
    const datos = await armar(e.data, pin);
    if (!datos) return fallo("Ese cliente no existe.");
    await prisma.evento.create({ data: { clienteId: e.data, usuarioId: u.id, tipo: "aviso_cliente", canal: datos.hrefEnlace ? "whatsapp" : "", texto: "acceso al portal" } });
    revalidatePath(`/clientes/${e.data}`);
    return exito(datos);
  } catch (err) {
    if (err instanceof Error && err.message === "CLIENTE_NO_EXISTE") return fallo("Ese cliente no existe.");
    console.error("enviarAcceso", e.data, err); return fallo(ERROR);
  }
}

export async function regenerarPinCliente(clienteId: number): Promise<Resultado<AccesoEnviado>> {
  await exigirRol("dueno");
  const e = Id.safeParse(clienteId);
  if (!e.success) return fallo(ERROR);
  try {
    const { pin } = await regenerarPin(e.data);
    const datos = await armar(e.data, pin);
    if (!datos) return fallo("Ese cliente no existe.");
    revalidatePath(`/clientes/${e.data}`);
    return exito(datos);
  } catch (err) {
    if (err instanceof Error && err.message === "CLIENTE_NO_EXISTE") return fallo("Ese cliente no existe.");
    console.error("regenerarPinCliente", e.data, err); return fallo(ERROR);
  }
}

export async function desactivarAccesoCliente(clienteId: number): Promise<Resultado> {
  await exigirRol("dueno");
  const e = Id.safeParse(clienteId);
  if (!e.success) return fallo(ERROR);
  try {
    await desactivarAcceso(e.data);
    revalidatePath(`/clientes/${e.data}`);
    return exito();
  } catch (err) { console.error("desactivarAccesoCliente", e.data, err); return fallo(ERROR); }
}
```

- [ ] **Step 4: El componente** — crear `src/componentes/AccesoPortal.tsx`. Los dos mensajes son **enlaces reales** (`<a>`), no `window.open`: después de un `await` el teléfono bloquea las ventanas, y un enlace siempre abre.

```tsx
"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EstadoAcceso } from "@/lib/acceso-cliente";
import { enviarAcceso, regenerarPinCliente, desactivarAccesoCliente, type AccesoEnviado } from "@/acciones/acceso-cliente";
import { BotonCopiar } from "@/componentes/BotonCopiar";

type Accion = "enviar" | "regenerar" | "desactivar";
const TEXTO_ESTADO: Record<EstadoAcceso["estado"], string> = { sin_acceso: "Todavía no tiene acceso.", activo: "Acceso activo.", desactivado: "Acceso desactivado." };

// Acceso del cliente a su portal (/c/<codigo>). El enlace y el PIN van en dos mensajes separados a
// proposito: si el cliente reenvia el chat, no va todo junto. El PIN se ve UNA vez: esta hasheado.
export function AccesoPortal({ clienteId, enlace, acceso, tieneWhatsapp }: { clienteId: number; enlace: string; acceso: EstadoAcceso; tieneWhatsapp: boolean }) {
  const [enCurso, setEnCurso] = useState<Accion | null>(null);
  const [enviado, setEnviado] = useState<AccesoEnviado | null>(null);
  const [confirmando, setConfirmando] = useState<"regenerar" | "desactivar" | null>(null);
  const [error, setError] = useState("");
  const [, empezar] = useTransition();
  const router = useRouter();

  const correr = (accion: Accion, tarea: () => Promise<{ ok: true; datos: AccesoEnviado | undefined } | { ok: false; mensaje: string }>) => {
    if (enCurso) return;
    setEnCurso(accion); setError("");
    empezar(async () => {
      try {
        const r = await tarea();
        if (r.ok) { setEnviado(r.datos ?? null); setConfirmando(null); router.refresh(); } else setError(r.mensaje);
      } finally { setEnCurso(null); }
    });
  };

  return (
    <section className="tarjeta">
      <b>Portal del cliente</b>
      <p className="suave" style={{ margin: "4px 0 0" }}>
        {TEXTO_ESTADO[acceso.estado]}
        {acceso.ultimoIngreso ? ` Entró ${acceso.ingresos} ${acceso.ingresos === 1 ? "vez" : "veces"}; la última, el ${acceso.ultimoIngreso.toLocaleString("es-VE", { timeZone: "America/Caracas", dateStyle: "short", timeStyle: "short" })}.` : acceso.estado === "activo" ? " Todavía no ha entrado." : ""}
      </p>
      <p className="recorte suave" title={enlace} style={{ margin: "8px 0 0" }}>{enlace}</p>
      <div className="fila-botones">
        <BotonCopiar texto={enlace} etiqueta="Copiar enlace" />
        {acceso.estado !== "desactivado" && <button type="button" className="boton boton--primario" aria-disabled={enCurso !== null} onClick={() => correr("enviar", () => enviarAcceso(clienteId))}>{enCurso === "enviar" ? "Preparando…" : acceso.estado === "activo" ? "Reenviar enlace" : "Enviar acceso"}</button>}
        {acceso.estado !== "sin_acceso" && <button type="button" className="boton" aria-disabled={enCurso !== null} onClick={() => { if (!enCurso) setConfirmando("regenerar"); }}>{acceso.estado === "desactivado" ? "Reactivar con PIN nuevo" : "Regenerar PIN"}</button>}
        {acceso.estado === "activo" && <button type="button" className="boton boton--peligro" aria-disabled={enCurso !== null} onClick={() => { if (!enCurso) setConfirmando("desactivar"); }}>Desactivar acceso</button>}
      </div>

      {confirmando === "regenerar" && (
        <div className="pregunta">
          <p style={{ margin: "0 0 8px" }}>Se genera un PIN nuevo. El anterior deja de servir y las sesiones que el cliente tenga abiertas se cierran.</p>
          <div className="fila-botones"><button type="button" className="boton boton--primario" aria-disabled={enCurso !== null} onClick={() => correr("regenerar", () => regenerarPinCliente(clienteId))}>{enCurso === "regenerar" ? "Generando…" : "Generar PIN nuevo"}</button><button type="button" className="boton" onClick={() => setConfirmando(null)}>Dejar el actual</button></div>
        </div>
      )}
      {confirmando === "desactivar" && (
        <div className="pregunta">
          <p style={{ margin: "0 0 8px" }}>El cliente deja de poder entrar y se cierran sus sesiones. No se borra nada: se reactiva con un PIN nuevo.</p>
          <div className="fila-botones"><button type="button" className="boton boton--peligro" aria-disabled={enCurso !== null} onClick={() => correr("desactivar", () => desactivarAccesoCliente(clienteId))}>{enCurso === "desactivar" ? "Desactivando…" : "Desactivar acceso"}</button><button type="button" className="boton" onClick={() => setConfirmando(null)}>Dejarlo activo</button></div>
        </div>
      )}

      {enviado && (
        <div className="pregunta">
          {enviado.pin
            ? <p style={{ margin: "0 0 8px" }}>PIN del cliente: <b style={{ fontSize: 20, letterSpacing: ".12em" }}>{enviado.pin}</b><br /><span className="suave">Solo se muestra esta vez. Envíalo aparte del enlace.</span></p>
            : <p style={{ margin: "0 0 8px" }}>El cliente ya tiene su PIN: aquí va solo el enlace. Si lo perdió, usa «Regenerar PIN».</p>}
          {tieneWhatsapp ? (
            <div className="fila-botones">
              {enviado.hrefEnlace && <a className="boton boton--primario" href={enviado.hrefEnlace} target="_blank" rel="noopener">1. Enviar el enlace</a>}
              {enviado.hrefPin && <a className="boton" href={enviado.hrefPin} target="_blank" rel="noopener">2. Enviar el PIN</a>}
            </div>
          ) : (
            <>
              <p className="suave" style={{ margin: "0 0 8px" }}>El cliente no tiene WhatsApp cargado: copia los mensajes y envíalos por donde le escribas.</p>
              <div className="fila-botones">
                <BotonCopiar texto={enviado.mensajeEnlace} etiqueta="Copiar mensaje del enlace" />
                {enviado.mensajePin && <BotonCopiar texto={enviado.mensajePin} etiqueta="Copiar mensaje del PIN" />}
              </div>
            </>
          )}
        </div>
      )}
      <p role="status" className="estado-fila estado-fila--error">{error}</p>
    </section>
  );
}
```

- [ ] **Step 5: La ficha del cliente** — en `src/app/(panel)/clientes/[id]/page.tsx`:

1. Imports nuevos:
```tsx
import { estadoAcceso } from "@/lib/acceso-cliente";
import { enlacePortal } from "@/lib/portal-contrato";
import { prisma } from "@/lib/db";
import { AccesoPortal } from "@/componentes/AccesoPortal";
```
2. Después de `if (!c) notFound();`:
```tsx
  const [acceso, conCodigo] = await Promise.all([estadoAcceso(c.id), prisma.cliente.findUniqueOrThrow({ where: { id: c.id }, select: { codigo: true } })]);
  const enlace = enlacePortal(process.env.PROSPECTOS_URL_PUBLICA ?? "", conCodigo.codigo);
```
3. Entre la tarjeta de proyectos y `<FormularioCliente cliente={c} />`:
```tsx
      <AccesoPortal clienteId={c.id} enlace={enlace} acceso={acceso} tieneWhatsapp={c.whatsapp !== ""} />
```

- [ ] **Step 6: Tests en verde**

Run: `PROSPECTOS_TEST_DB=1 npx vitest run tests/acceso-cliente-acciones.test.ts tests/acceso-cliente.test.ts && npx tsc --noEmit`
Expected: PASS; `tsc` sin salida.

- [ ] **Step 7: Commit**

```bash
git add src/acciones/acceso-cliente.ts src/componentes/AccesoPortal.tsx "src/app/(panel)/clientes/[id]/page.tsx" tests/acceso-cliente-acciones.test.ts
git commit -F - <<'EOF'
feat(portal): enviar acceso, regenerar PIN y desactivar desde la ficha del cliente
EOF
```

---

### Task 5: Consultas del portal, filtradas por cliente

**Files:**
- Create: `src/lib/portal.ts`
- Test: `tests/portal.test.ts`

**Interfaces:**
- Consumes: todo lo de la tarea 2; `estadoCobro` de `@/lib/cobros-contrato`; `hoyCaracas` de `@/lib/fecha-caracas`; `ETIQUETA_CANAL_COBRO`; `EstadoProyecto` de `@/lib/proyectos-contrato`; `TipoCambio` de `@/lib/semver-contrato`.
- Produces (desde `@/lib/portal`):
  - `clienteParaEntrada(codigo: string): Promise<{ nombre: string; acceso: "activo" | "sin_acceso" | "desactivado" } | null>`
  - `type ProyectoTarjeta = { id: number; nombre: string; estado: EstadoProyecto; versionActual: string; versionFecha: string | null; hitos: ResumenHitos }`
  - `inicioPortal(clienteId: number, hoy: string): Promise<{ proyectos: ProyectoTarjeta[]; aviso: AvisoCobros | null }>`
  - `type ProyectoPortal = ProyectoTarjeta & { pagoUnico: number; mensualidad: number; diaCobroMensual: number; propuestaCodigo: string; listaHitos: HitoPortal[]; versiones: { version: string; fecha: string; cambios: { tipo: TipoCambio; texto: string }[] }[]; cobros: { porPagar: CobroPortal[]; pagados: CobroPortal[] } }`
  - `proyectoPortal(clienteId: number, proyectoId: number, hoy: string): Promise<ProyectoPortal | null>` — `null` si el proyecto no es de ese cliente.

- [ ] **Step 1: Tests que fallan** — crear `tests/portal.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { DB_HABILITADA, limpiarBase, sembrarBasico, sembrarCliente, sembrarProyecto } from "./ayuda-db";
import { darAcceso, desactivarAcceso } from "@/lib/acceso-cliente";
import { clienteParaEntrada, inicioPortal, proyectoPortal } from "@/lib/portal";

const HOY = "2026-09-17";

describe.runIf(DB_HABILITADA)("consultas del portal", () => {
  let a: Awaited<ReturnType<typeof sembrarCliente>>;
  let b: Awaited<ReturnType<typeof sembrarCliente>>;
  let pms: number, reservas: number, cerrado: number, deB: number;
  beforeAll(async () => {
    await limpiarBase();
    const ids = await sembrarBasico();
    a = await sembrarCliente({ nombre: "Hotel A" });
    b = await sembrarCliente({ nombre: "Farmacia B" });
    pms = (await sembrarProyecto(a.id, ids.nichoId, { nombre: "PMS Hotel", estado: "activo" })).id;
    reservas = (await sembrarProyecto(a.id, ids.nichoId, { nombre: "Reservas en línea", estado: "en_construccion" })).id;
    cerrado = (await sembrarProyecto(a.id, ids.nichoId, { nombre: "Página vieja", estado: "cerrado" })).id;
    deB = (await sembrarProyecto(b.id, ids.nichoId, { nombre: "Inventario B", estado: "activo" })).id;
    await prisma.pendiente.createMany({ data: [
      { proyectoId: pms, texto: "Recepción y habitaciones", visibleCliente: true, hecho: true, hechoEn: new Date("2026-07-02T16:00:00Z"), fechaEstimada: "2026-06-30", orden: 1 },
      { proyectoId: pms, texto: "Reporte de ocupación", visibleCliente: true, hecho: false, fechaEstimada: "2026-09-30", orden: 2 },
      { proyectoId: pms, texto: "SECRETO refactor interno", visibleCliente: false, hecho: false, orden: 3 },
    ] });
    const v1 = await prisma.version.create({ data: { proyectoId: pms, version: "1.4.2", fecha: "2026-08-28" } });
    const v2 = await prisma.version.create({ data: { proyectoId: pms, version: "1.10.0", fecha: "2026-09-10" } });
    await prisma.cambio.createMany({ data: [{ versionId: v1.id, tipo: "arreglo", texto: "Cierre de caja", orden: 1 }, { versionId: v2.id, tipo: "nuevo", texto: "Reporte semanal", orden: 1 }] });
    await prisma.horas.create({ data: { proyectoId: pms, fecha: "2026-09-01", horas: "3.50", descripcion: "SECRETO horas de depuracion", usuarioId: ids.usuarioId } });
    await prisma.cobro.createMany({ data: [
      { proyectoId: pms, concepto: "mensualidad", detalle: "Mensualidad de septiembre 2026", mes: "2026-09", monto: "100.00", vence: "2026-09-05", nota: "SECRETO nota interna" },
      { proyectoId: pms, concepto: "mensualidad", detalle: "Mensualidad de octubre 2026", mes: "2026-10", monto: "100.00", vence: "2026-10-05" },
      { proyectoId: pms, concepto: "cuota", detalle: "Cuota 3 de 3", monto: "933.34", vence: "2026-07-15", pagadoEn: new Date("2026-07-15T16:00:00Z"), canal: "pago_movil", reciboNumero: "R-2026-0004", reciboGeneradoEn: new Date() },
      { proyectoId: pms, concepto: "extra", detalle: "SECRETO cobro anulado", monto: "50.00", vence: "2026-08-01", pagadoEn: new Date("2026-08-01T16:00:00Z"), canal: "zelle", anuladoEn: new Date(), anuladoMotivo: "error", reciboNumero: "R-2026-0005", reciboGeneradoEn: new Date() },
      { proyectoId: deB, concepto: "extra", detalle: "SECRETO cobro de B", monto: "10.00", vence: "2026-09-01" },
    ] });
  });
  afterAll(async () => { await limpiarBase(); await prisma.$disconnect(); });

  it("clienteParaEntrada dice el nombre y si puede entrar; un codigo que no existe es null", async () => {
    expect(await clienteParaEntrada(a.codigo)).toEqual({ nombre: "Hotel A", acceso: "sin_acceso" });
    await darAcceso(a.id);
    expect(await clienteParaEntrada(a.codigo)).toEqual({ nombre: "Hotel A", acceso: "activo" });
    await desactivarAcceso(a.id);
    expect(await clienteParaEntrada(a.codigo)).toEqual({ nombre: "Hotel A", acceso: "desactivado" });
    expect(await clienteParaEntrada("A".repeat(22))).toBeNull();
    expect(await clienteParaEntrada("../etc")).toBeNull();
  });

  it("inicio: todos sus proyectos (los cerrados al final), version actual por semver, hitos solo visibles, y el aviso del vencido", async () => {
    const r = await inicioPortal(a.id, HOY);
    expect(r.proyectos.map((p) => p.nombre)).toEqual(["PMS Hotel", "Reservas en línea", "Página vieja"]);
    expect(r.proyectos[0]).toMatchObject({ id: pms, estado: "activo", versionActual: "1.10.0", versionFecha: "2026-09-10", hitos: { hechos: 1, total: 2, porcentaje: 50 } });
    expect(r.proyectos[1]).toMatchObject({ versionActual: "", versionFecha: null, hitos: { hechos: 0, total: 0, porcentaje: null } });
    expect(r.aviso).toMatchObject({ gravedad: "vencido", otros: 0, cobro: { texto: "Mensualidad de septiembre 2026", proyectoNombre: "PMS Hotel", monto: 100 } });
    expect((await inicioPortal(b.id, HOY)).proyectos.map((p) => p.nombre)).toEqual(["Inventario B"]);
  });

  it("proyecto: hitos con sus fechas, versiones de la mas nueva a la mas vieja, cobros separados y sin anulados", async () => {
    const p = await proyectoPortal(a.id, pms, HOY);
    expect(p).not.toBeNull();
    if (!p) return;
    expect(p).toMatchObject({ nombre: "PMS Hotel", pagoUnico: 2800, mensualidad: 100, diaCobroMensual: 5 });
    expect(p.listaHitos).toEqual([
      { texto: "Recepción y habitaciones", hecho: true, hechoEl: "2026-07-02", fechaEstimada: "2026-06-30" },
      { texto: "Reporte de ocupación", hecho: false, hechoEl: null, fechaEstimada: "2026-09-30" },
    ]);
    expect(p.versiones.map((v) => v.version)).toEqual(["1.10.0", "1.4.2"]);
    expect(p.versiones[0].cambios).toEqual([{ tipo: "nuevo", texto: "Reporte semanal" }]);
    expect(p.cobros.porPagar.map((c) => [c.texto, c.estado])).toEqual([["Mensualidad de septiembre 2026", "vencido"], ["Mensualidad de octubre 2026", "pendiente"]]);
    expect(p.cobros.pagados).toEqual([expect.objectContaining({ texto: "Cuota 3 de 3", monto: 933.34, pagadoEl: "2026-07-15", canal: "Pago móvil", reciboNumero: "R-2026-0004" })]);
  });

  it("nada interno sale del portal: ni pendientes internos, ni horas, ni notas, ni anulados, ni lo de otro cliente", async () => {
    const todo = JSON.stringify([await inicioPortal(a.id, HOY), await proyectoPortal(a.id, pms, HOY), await proyectoPortal(a.id, reservas, HOY), await proyectoPortal(a.id, cerrado, HOY)]);
    expect(todo).not.toContain("SECRETO");
    expect(todo).not.toMatch(/horas|tarifa|nota/i);
  });

  it("aislamiento: el proyecto de otro cliente no existe para este", async () => {
    expect(await proyectoPortal(a.id, deB, HOY)).toBeNull();
    expect(await proyectoPortal(b.id, pms, HOY)).toBeNull();
    expect(await proyectoPortal(a.id, 999_999, HOY)).toBeNull();
    expect((await proyectoPortal(b.id, deB, HOY))?.nombre).toBe("Inventario B");
  });
});
```

- [ ] **Step 2: Correrlo y ver que falla**

Run: `PROSPECTOS_TEST_DB=1 npx vitest run tests/portal.test.ts`
Expected: FAIL — no existe `@/lib/portal`.

- [ ] **Step 3: Implementar** — crear `src/lib/portal.ts`:

```ts
// src/lib/portal.ts — lo que lee el portal del cliente (pieza 5). Todo filtra por clienteId y selecciona
// campo por campo: horas, tarifa, notas, pendientes internos y cobros anulados no salen de aqui nunca.
import { prisma } from "@/lib/db";
import { hoyCaracas } from "@/lib/fecha-caracas";
import { estadoCobro, ETIQUETA_CANAL_COBRO, type CanalCobro, type Concepto } from "@/lib/cobros-contrato";
import type { EstadoProyecto } from "@/lib/proyectos-contrato";
import type { TipoCambio } from "@/lib/semver-contrato";
import { CODIGO_VALIDO } from "@/lib/codigo";
import {
  resumenHitos, versionesDelMasNuevo, textoCobro, separarCobros, avisoDeCobros,
  type AvisoCobros, type CobroPortal, type HitoPortal, type ResumenHitos,
} from "@/lib/portal-contrato";

export async function clienteParaEntrada(codigo: string): Promise<{ nombre: string; acceso: "activo" | "sin_acceso" | "desactivado" } | null> {
  if (!CODIGO_VALIDO.test(codigo)) return null;
  const c = await prisma.cliente.findUnique({ where: { codigo }, select: { nombre: true, usuario: { select: { activo: true, rol: true } } } });
  if (!c) return null;
  const acceso = !c.usuario || c.usuario.rol !== "cliente" ? "sin_acceso" : c.usuario.activo ? "activo" : "desactivado";
  return { nombre: c.nombre, acceso };
}

export type ProyectoTarjeta = { id: number; nombre: string; estado: EstadoProyecto; versionActual: string; versionFecha: string | null; hitos: ResumenHitos };

// Lo unico que se lee de un cobro. `nota` y `referencia` son internas: no se seleccionan.
const COBRO = { id: true, concepto: true, detalle: true, monto: true, vence: true, pagadoEn: true, anuladoEn: true, canal: true, reciboNumero: true } as const;
type CobroLeido = { id: number; concepto: string; detalle: string; monto: unknown; vence: string; pagadoEn: Date | null; anuladoEn: Date | null; canal: string; reciboNumero: string };

function aCobroPortal(c: CobroLeido, proyecto: { id: number; nombre: string }, hoy: string): CobroPortal {
  return {
    id: c.id, proyectoId: proyecto.id, proyectoNombre: proyecto.nombre, texto: textoCobro({ concepto: c.concepto as Concepto, detalle: c.detalle }),
    monto: Number(c.monto), vence: c.vence, estado: estadoCobro(c, hoy), pagadoEl: c.pagadoEn ? hoyCaracas(c.pagadoEn) : null,
    canal: c.canal ? ETIQUETA_CANAL_COBRO[c.canal as CanalCobro] ?? c.canal : "", reciboNumero: c.reciboNumero,
  };
}

// Primero lo que esta vivo; lo cerrado al final (un cliente sin proyectos activos ve los cerrados, no una pantalla vacia).
const ORDEN_ESTADO: Record<string, number> = { activo: 0, en_construccion: 1, entregado: 2, pausado: 3, cerrado: 4 };

export async function inicioPortal(clienteId: number, hoy: string): Promise<{ proyectos: ProyectoTarjeta[]; aviso: AvisoCobros | null }> {
  const filas = await prisma.proyecto.findMany({
    where: { clienteId },
    select: {
      id: true, nombre: true, estado: true,
      versiones: { select: { version: true, fecha: true } },
      pendientes: { where: { visibleCliente: true }, select: { hecho: true } },
      cobros: { where: { anuladoEn: null }, select: COBRO },
    },
  });
  const ordenadas = [...filas].sort((x, y) => (ORDEN_ESTADO[x.estado] ?? 9) - (ORDEN_ESTADO[y.estado] ?? 9) || x.nombre.localeCompare(y.nombre, "es"));
  const proyectos = ordenadas.map((p) => {
    const actual = versionesDelMasNuevo(p.versiones)[0];
    return { id: p.id, nombre: p.nombre, estado: p.estado as EstadoProyecto, versionActual: actual?.version ?? "", versionFecha: actual?.fecha ?? null, hitos: resumenHitos(p.pendientes) };
  });
  const cobros = filas.flatMap((p) => p.cobros.map((c) => aCobroPortal(c, p, hoy)));
  return { proyectos, aviso: avisoDeCobros(cobros) };
}

export type ProyectoPortal = ProyectoTarjeta & {
  pagoUnico: number; mensualidad: number; diaCobroMensual: number; propuestaCodigo: string;
  listaHitos: HitoPortal[];
  versiones: { version: string; fecha: string; cambios: { tipo: TipoCambio; texto: string }[] }[];
  cobros: { porPagar: CobroPortal[]; pagados: CobroPortal[] };
};

// El id del proyecto viene de la URL: SIEMPRE se busca junto con el clienteId de la sesion.
export async function proyectoPortal(clienteId: number, proyectoId: number, hoy: string): Promise<ProyectoPortal | null> {
  if (!Number.isInteger(proyectoId) || proyectoId <= 0) return null;
  const p = await prisma.proyecto.findFirst({
    where: { id: proyectoId, clienteId },
    select: {
      id: true, nombre: true, estado: true, pagoUnico: true, mensualidad: true, diaCobroMensual: true, propuestaCodigo: true,
      versiones: { select: { version: true, fecha: true, cambios: { select: { tipo: true, texto: true }, orderBy: { orden: "asc" } } } },
      pendientes: { where: { visibleCliente: true }, select: { texto: true, hecho: true, hechoEn: true, fechaEstimada: true }, orderBy: { orden: "asc" } },
      cobros: { where: { anuladoEn: null }, select: COBRO },
    },
  });
  if (!p) return null;
  const versiones = versionesDelMasNuevo(p.versiones).map((v) => ({ version: v.version, fecha: v.fecha, cambios: v.cambios.map((c) => ({ tipo: c.tipo as TipoCambio, texto: c.texto })) }));
  const listaHitos: HitoPortal[] = p.pendientes.map((h) => ({ texto: h.texto, hecho: h.hecho, hechoEl: h.hecho && h.hechoEn ? hoyCaracas(h.hechoEn) : null, fechaEstimada: h.fechaEstimada }));
  return {
    id: p.id, nombre: p.nombre, estado: p.estado as EstadoProyecto, versionActual: versiones[0]?.version ?? "", versionFecha: versiones[0]?.fecha ?? null,
    hitos: resumenHitos(listaHitos), pagoUnico: Number(p.pagoUnico), mensualidad: Number(p.mensualidad), diaCobroMensual: p.diaCobroMensual, propuestaCodigo: p.propuestaCodigo,
    listaHitos, versiones, cobros: separarCobros(p.cobros.map((c) => aCobroPortal(c, p, hoy))),
  };
}
```

- [ ] **Step 4: Tests en verde**

Run: `PROSPECTOS_TEST_DB=1 npx vitest run tests/portal.test.ts && npx tsc --noEmit`
Expected: PASS (5 tests). Si el test «nada interno sale» falla por la palabra `nota` o `horas`, es que algún nombre de propiedad del resultado las contiene: renombrar la propiedad, no aflojar el test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/portal.ts tests/portal.test.ts
git commit -F - <<'EOF'
feat(portal): consultas del portal filtradas por cliente y campo por campo
EOF
```

---

### Task 6: Pantallas del portal

**Files:**
- Create: `src/app/c/layout.tsx`, `src/app/c/portal.css`, `src/app/c/[codigo]/page.tsx`, `src/app/c/[codigo]/inicio/page.tsx`, `src/app/c/[codigo]/proyecto/[id]/page.tsx`, `src/app/c/[codigo]/contacto/page.tsx`, `src/app/c/[codigo]/salir/route.ts`, `src/componentes/PortalBarra.tsx`
- Modify: `next.config.ts`

**Interfaces:**
- Consumes: `exigirCliente`, `sesionCliente`, `limitarPortal`, `COOKIE_CLIENTE` (tarea 3); `entrarPortal` (tarea 3); `TecladoPin` con `accion` y `campos` (tarea 3); `clienteParaEntrada`, `inicioPortal`, `proyectoPortal` (tarea 5); `textoAviso`, `textoFechaHito`, `primerNombre` (tarea 2); `leerEmisor` de `@/lib/configuracion`; `Pestanas`, `EstadoProyecto` (componentes existentes); `ETIQUETA_CAMBIO` de `@/lib/semver-contrato`; `ETIQUETA_COBRO` de `@/lib/cobros-contrato`.
- Produces: rutas `/c/<código>` (PIN o acceso desactivado), `/c/<código>/inicio`, `/c/<código>/proyecto/<id>?t=avance|versiones|cobros|documentos`, `/c/<código>/contacto`, `/c/<código>/salir`. Textos visibles exactos que usa el recorrido de la tarea 9: «Escribe tu PIN de 6 números para ver tus proyectos.», «Acceso desactivado», «Ver cobros», «Por pagar», «Pagados», «Descargar recibo R-…», «Sin hitos publicados todavía», «Todavía no hay versiones publicadas.», «Ver la propuesta aceptada».

**Criterios de la pantalla** (dirección de diseño aprobada sobre `capturas/p5-prototipo/`): tema claro de la familia de la propuesta y el recibo; nombre del negocio, de los proyectos, montos y versiones en serif; nada depende solo del color (el hito cumplido lleva marca, el vencido lleva etiqueta con texto); toda la tarjeta del proyecto es el enlace; objetivos táctiles de 44 px; sin scroll horizontal a 390 px; se tutea al cliente.

- [ ] **Step 1: La hoja de estilos** — crear `src/app/c/portal.css` con este contenido exacto (es el del prototipo aprobado; `sha256` = `0d45237c1b28f68974d8fc1af274032581c2bf068123b3d92e4305de34ec09cc`; el archivo termina con un salto de línea; si existe `capturas/p5-prototipo/portal.css`, lo más seguro es copiarlo con `cp` y comprobar el hash):

```css
/* src/app/c/portal.css — el portal del cliente. Misma familia que la propuesta y el recibo
   (papel, tinta, sello verde oscuro, Source Serif/Sans): el cliente ve una sola casa, y el panel
   oscuro queda como la herramienta de Neri. Reutiliza las clases del panel cambiandoles los tokens. */
html:has(.portal) {
  --fondo: #f1f4f2; --panel: #ffffff; --borde: #d0d6d3; --tinta: #1a1d1c; --tinta-suave: #5d6664;
  --verde: #1f5a45; --rojo: #8f2a23; --ambar: #93661c; --radio: 10px;
}
html:has(.portal), html:has(.portal) body { background: var(--fondo); color: var(--tinta); }
/* Las fuentes las define next/font en el envoltorio del layout (--fuente-sans, --fuente-serif): por eso
   --sans y --serif se resuelven aqui adentro y no en html, donde esas variables todavia no existen. */
.portal {
  --serif: var(--fuente-serif), Georgia, "Times New Roman", serif;
  --sans: var(--fuente-sans), "Segoe UI", Arial, sans-serif;
  font-family: var(--sans); font-size: 17px; line-height: 1.5;
  max-width: 640px; margin: 0 auto; padding: 0 16px 40px; min-height: 100dvh;
}

.portal__barra { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 0; border-bottom: 1px solid var(--borde); margin-bottom: 20px; }
.portal__logo { font-weight: 700; letter-spacing: .06em; font-size: 16px; text-decoration: none; }
.portal__logo i { font-style: normal; color: #5ed29c; }
.portal__nav { display: flex; gap: 2px; }
.portal__nav a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 10px; border-radius: 8px; color: var(--tinta-suave); text-decoration: none; font-size: 15px; }
.portal__nav a[aria-current="page"] { color: var(--tinta); font-weight: 600; }
.portal a:focus-visible, .portal button:focus-visible { outline: 3px solid var(--verde); outline-offset: 2px; }

.portal h1 { font-family: var(--serif); font-weight: 600; font-size: 28px; line-height: 1.15; margin: 0 0 4px; text-wrap: balance; }
.portal h2 { font-family: var(--serif); font-weight: 600; font-size: 20px; line-height: 1.2; margin: 0; }
.portal__bajada { color: var(--tinta-suave); margin: 0 0 20px; }
.portal .tarjeta { padding: 16px; margin-bottom: 14px; }
.portal .boton { background: var(--panel); }
.portal .boton--primario { background: var(--verde); border-color: var(--verde); color: #ffffff; }
.portal .pestanas__item.activa { background: var(--verde); border-color: var(--verde); color: #ffffff; }
.portal .progreso { height: 6px; background: #e3e8e5; margin: 10px 0 0; }

/* Aviso de cobro: la regla de color dice la gravedad; el texto dice el resto. */
.portal__aviso { border-left: 4px solid var(--ambar); background: var(--panel); border-radius: 0 var(--radio) var(--radio) 0; padding: 12px 14px; margin: 0 0 18px; }
.portal__aviso--vencido { border-left-color: var(--rojo); }
.portal__aviso p { margin: 0 0 8px; }

/* Tarjeta de proyecto: toda la tarjeta es el enlace. */
.proyecto { display: block; text-decoration: none; }
.proyecto__cabeza { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.proyecto__datos { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 14px 0 0; }
.proyecto__datos dt { color: var(--tinta-suave); font-size: 14px; }
.proyecto__datos dd { margin: 0; font-family: var(--serif); font-weight: 600; font-size: 22px; line-height: 1.2; font-variant-numeric: tabular-nums lining-nums; }
.proyecto__datos dd small { font-family: var(--sans); font-weight: 400; font-size: 14px; color: var(--tinta-suave); }

.portal .etiqueta { font-size: 13px; padding: 3px 10px; background: #e3e8e5; color: var(--tinta-suave); }
.portal .etiqueta--proyecto-activo, .portal .etiqueta--pagado { background: #dcebe4; color: var(--verde); }
.portal .etiqueta--proyecto-en_construccion, .portal .etiqueta--proyecto-pausado, .portal .etiqueta--proyecto-entregado, .portal .etiqueta--por_vencer { background: #f3e9d4; color: #6f4c12; }
.portal .etiqueta--proyecto-cerrado { background: #e3e8e5; color: var(--tinta-suave); }
.portal .etiqueta--vencido { background: #f3dcda; color: var(--rojo); }

/* Hitos: la marca dice si esta cumplido; nunca solo el color. */
.hitos { list-style: none; margin: 14px 0 0; padding: 0; }
.hitos li { display: grid; grid-template-columns: 26px 1fr; gap: 10px; padding: 12px 0; border-top: 1px solid var(--borde); }
.hitos__marca { width: 22px; height: 22px; margin-top: 2px; border-radius: 50%; border: 2px solid var(--borde); display: inline-flex; align-items: center; justify-content: center; font-size: 13px; line-height: 1; color: #ffffff; }
.hitos__marca--hecho { background: var(--verde); border-color: var(--verde); }
.hitos small { display: block; color: var(--tinta-suave); font-size: 14px; }

/* Bitacora de versiones: el numero al margen, en serif, como el renglon de un libro de obra. */
.version { display: grid; grid-template-columns: 76px 1fr; gap: 12px; padding: 16px 0; border-top: 1px solid var(--borde); }
.version:first-of-type { border-top: 0; padding-top: 4px; }
.version__numero { font-family: var(--serif); font-weight: 600; font-size: 20px; line-height: 1.2; font-variant-numeric: tabular-nums lining-nums; }
.version__numero small { display: block; font-family: var(--sans); font-weight: 400; font-size: 13px; color: var(--tinta-suave); margin-top: 2px; }
.version ul { list-style: none; margin: 0; padding: 0; }
.version li { padding: 0 0 8px; }
.version li b { display: block; font-size: 13px; font-weight: 600; color: var(--tinta-suave); }
.version--actual .version__numero { color: var(--verde); }

/* Cobros: monto a la derecha, en serif y con cifras tabulares, como en el recibo. */
.portal .cobro { grid-template-columns: 1fr auto; padding: 14px 0; border-bottom: 0; border-top: 1px solid var(--borde); }
.portal .cobro:first-of-type { border-top: 0; }
.portal .cobro__monto { font-family: var(--serif); font-size: 20px; font-variant-numeric: tabular-nums lining-nums; }
.portal .cobro small { display: block; color: var(--tinta-suave); font-size: 14px; }
.acordado { display: grid; grid-template-columns: repeat(3, auto); justify-content: space-between; gap: 10px; margin: 0; }
.acordado dt { color: var(--tinta-suave); font-size: 14px; }
.acordado dd { margin: 0; font-family: var(--serif); font-weight: 600; font-size: 19px; font-variant-numeric: tabular-nums lining-nums; }

/* Entrada con PIN: el teclado del panel, en papel. */
.portal--entrar { display: flex; flex-direction: column; justify-content: center; text-align: center; }
.portal--entrar .portal__logo { font-size: 18px; display: block; margin-bottom: 28px; }
.portal .teclado__tecla { background: var(--panel); font-family: var(--serif); }
.portal .teclado__tecla:active { background: #e3e8e5; }
.portal .error { font-size: 15px; }
.portal__pie { margin-top: 28px; padding-top: 16px; border-top: 1px solid var(--borde); color: var(--tinta-suave); font-size: 15px; }
```

- [ ] **Step 2: Layout del portal** — crear `src/app/c/layout.tsx`:

```tsx
import type { Metadata } from "next";
import localFont from "next/font/local";
import "./portal.css";

// Las mismas fuentes del recibo y la propuesta, locales (OFL): el portal no depende de Google Fonts.
const sans = localFont({ src: "../../../plantillas/fuentes/source-sans-3.woff2", weight: "400 700", variable: "--fuente-sans", display: "swap" });
const serif = localFont({ src: "../../../plantillas/fuentes/source-serif-4.woff2", weight: "400 700", variable: "--fuente-serif", display: "swap" });

// manifest: null -> el portal no ofrece instalar la PWA del panel.
export const metadata: Metadata = { title: "Portal de clientes · NERACOSU", manifest: null, robots: { index: false, follow: false } };

export default function LayoutPortal({ children }: { children: React.ReactNode }) {
  return <div className={`${sans.variable} ${serif.variable}`}>{children}</div>;
}
```

- [ ] **Step 3: La barra** — crear `src/componentes/PortalBarra.tsx`:

```tsx
import Link from "next/link";

// Cabecera del portal del cliente. "Salir" es un enlace normal a la ruta que borra la cookie.
export function PortalBarra({ codigo, activa }: { codigo: string; activa?: "inicio" | "contacto" }) {
  const base = `/c/${codigo}`;
  return (
    <header className="portal__barra">
      <Link className="portal__logo" href={`${base}/inicio`} aria-label="NERACOSU, ir al inicio">NERACOSU<i>.</i></Link>
      <nav className="portal__nav" aria-label="Portal">
        <Link href={`${base}/inicio`} aria-current={activa === "inicio" ? "page" : undefined}>Inicio</Link>
        <Link href={`${base}/contacto`} aria-current={activa === "contacto" ? "page" : undefined}>Contacto</Link>
        <a href={`${base}/salir`}>Salir</a>
      </nav>
    </header>
  );
}
```

- [ ] **Step 4: Entrada con PIN** — crear `src/app/c/[codigo]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { CODIGO_VALIDO } from "@/lib/codigo";
import { sesionCliente, limitarPortal } from "@/lib/sesion-cliente";
import { clienteParaEntrada } from "@/lib/portal";
import { leerEmisor } from "@/lib/configuracion";
import { primerNombre } from "@/lib/portal-contrato";
import { entrarPortal } from "@/acciones/portal";
import { TecladoPin } from "@/componentes/TecladoPin";

export const dynamic = "force-dynamic";

export default async function EntradaPortal({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  if (!CODIGO_VALIDO.test(codigo)) notFound();
  await limitarPortal();
  const c = await clienteParaEntrada(codigo);
  if (!c) notFound();
  const s = await sesionCliente();
  if (s && s.codigo === codigo) redirect(`/c/${codigo}/inicio`);
  const emisor = await leerEmisor();
  const quien = primerNombre(emisor.nombre);
  // Acceso nunca enviado o desactivado: la misma pantalla, sin pedir PIN.
  if (c.acceso !== "activo") {
    return (
      <main className="portal portal--entrar">
        <span className="portal__logo">NERACOSU<i>.</i></span>
        <h1>Acceso desactivado</h1>
        <p className="portal__bajada">{c.nombre}: por ahora no puedes entrar al portal. Escríbele a {quien} y te lo activa.</p>
        {emisor.whatsapp && <p><a className="boton boton--primario" href={`https://wa.me/${emisor.whatsapp}`} target="_blank" rel="noopener">Escribirle a {quien} por WhatsApp</a></p>}
      </main>
    );
  }
  return (
    <main className="portal portal--entrar">
      <span className="portal__logo">NERACOSU<i>.</i></span>
      <h1>{c.nombre}</h1>
      <p className="portal__bajada">Escribe tu PIN de 6 números para ver tus proyectos.</p>
      <TecladoPin accion={entrarPortal} campos={{ codigo }} />
      <p className="portal__pie">¿No tienes tu PIN? Escríbele a {quien} y te lo envía de nuevo.</p>
    </main>
  );
}
```

- [ ] **Step 5: Inicio** — crear `src/app/c/[codigo]/inicio/page.tsx`:

```tsx
import Link from "next/link";
import { exigirCliente } from "@/lib/sesion-cliente";
import { inicioPortal } from "@/lib/portal";
import { hoyCaracas, fechaVisible } from "@/lib/fecha-caracas";
import { leerEmisor } from "@/lib/configuracion";
import { textoAviso, primerNombre } from "@/lib/portal-contrato";
import { PortalBarra } from "@/componentes/PortalBarra";
import { EstadoProyecto } from "@/componentes/EstadoProyecto";

export const dynamic = "force-dynamic";

export default async function InicioPortal({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const s = await exigirCliente(codigo);
  const hoy = hoyCaracas();
  const [{ proyectos, aviso }, emisor] = await Promise.all([inicioPortal(s.clienteId, hoy), leerEmisor()]);
  return (
    <main className="portal">
      <PortalBarra codigo={codigo} activa="inicio" />
      <h1>{s.nombre}</h1>
      <p className="portal__bajada">Así van tus sistemas hoy, {fechaVisible(hoy)}.</p>
      {aviso && (
        <section className={`portal__aviso${aviso.gravedad === "vencido" ? " portal__aviso--vencido" : ""}`} role="status">
          <p>{textoAviso(aviso)}</p>
          <Link className="boton mini" href={`/c/${codigo}/proyecto/${aviso.cobro.proyectoId}?t=cobros`}>Ver cobros</Link>
        </section>
      )}
      {proyectos.length === 0 && <p className="tarjeta">Todavía no tienes proyectos cargados. Escríbele a {primerNombre(emisor.nombre)} si esperabas ver alguno.</p>}
      {proyectos.map((p) => (
        <Link key={p.id} className="tarjeta proyecto" href={`/c/${codigo}/proyecto/${p.id}`}>
          <div className="proyecto__cabeza"><h2>{p.nombre}</h2><EstadoProyecto estado={p.estado} /></div>
          <dl className="proyecto__datos">
            <div><dt>Versión actual</dt><dd>{p.versionActual ? <>{p.versionActual} <small>del {fechaVisible(p.versionFecha ?? hoy)}</small></> : <small>Todavía sin versiones</small>}</dd></div>
            <div><dt>Avance</dt><dd>{p.hitos.porcentaje === null ? <small>Sin hitos publicados</small> : <>{p.hitos.porcentaje} % <small>{p.hitos.hechos} de {p.hitos.total} hitos</small></>}</dd></div>
          </dl>
          {p.hitos.porcentaje !== null && <div className="progreso"><i style={{ width: `${p.hitos.porcentaje}%` }} /></div>}
        </Link>
      ))}
      <p className="portal__pie">Te atiende {emisor.nombre || "Neri Colón"}. <Link href={`/c/${codigo}/contacto`}>Cómo escribirle</Link></p>
    </main>
  );
}
```

- [ ] **Step 6: Proyecto** — crear `src/app/c/[codigo]/proyecto/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { exigirCliente } from "@/lib/sesion-cliente";
import { proyectoPortal } from "@/lib/portal";
import { hoyCaracas, fechaVisible } from "@/lib/fecha-caracas";
import { formatoUSD } from "@/lib/dinero";
import { ETIQUETA_COBRO } from "@/lib/cobros-contrato";
import { ETIQUETA_CAMBIO } from "@/lib/semver-contrato";
import { textoFechaHito } from "@/lib/portal-contrato";
import { PortalBarra } from "@/componentes/PortalBarra";
import { Pestanas } from "@/componentes/Pestanas";
import { EstadoProyecto } from "@/componentes/EstadoProyecto";

export const dynamic = "force-dynamic";
const PESTANAS = [{ clave: "avance", texto: "Avance" }, { clave: "versiones", texto: "Versiones" }, { clave: "cobros", texto: "Cobros" }, { clave: "documentos", texto: "Documentos" }];

export default async function ProyectoDelPortal({ params, searchParams }: { params: Promise<{ codigo: string; id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { codigo, id } = await params;
  const s = await exigirCliente(codigo);
  // El id viene de la URL: proyectoPortal lo busca SIEMPRE junto al clienteId de la sesion. Ajeno = 404.
  const p = await proyectoPortal(s.clienteId, Number(id), hoyCaracas());
  if (!p) notFound();
  const tParam = (await searchParams).t;
  const t = tParam && PESTANAS.some((x) => x.clave === tParam) ? tParam : "avance";
  return (
    <main className="portal">
      <PortalBarra codigo={codigo} />
      <h1>{p.nombre}</h1>
      <p className="portal__bajada"><EstadoProyecto estado={p.estado} /></p>
      <Pestanas base={`/c/${codigo}/proyecto/${p.id}`} activa={t} items={PESTANAS} />

      {t === "avance" && (
        <section className="tarjeta">
          {p.hitos.porcentaje === null ? <p style={{ margin: 0 }}>Sin hitos publicados todavía.</p> : (
            <>
              <h2>{p.hitos.porcentaje} % de avance</h2>
              <p className="suave" style={{ margin: "4px 0 0" }}>{p.hitos.hechos} de {p.hitos.total} hitos cumplidos</p>
              <div className="progreso"><i style={{ width: `${p.hitos.porcentaje}%` }} /></div>
              <ul className="hitos">
                {p.listaHitos.map((h, i) => (
                  <li key={i}>
                    <span className={`hitos__marca${h.hecho ? " hitos__marca--hecho" : ""}`} aria-hidden="true">{h.hecho ? "✓" : ""}</span>
                    <span>{h.texto}<small>{textoFechaHito(h)}</small></span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      {t === "versiones" && (
        <section className="tarjeta">
          {p.versiones.length === 0 && <p style={{ margin: 0 }}>Todavía no hay versiones publicadas.</p>}
          {p.versiones.map((v, i) => (
            <article key={v.version} className={`version${i === 0 ? " version--actual" : ""}`}>
              <div className="version__numero">{v.version}<small>{fechaVisible(v.fecha)}{i === 0 ? <><br />versión actual</> : null}</small></div>
              <ul>{v.cambios.map((c, j) => <li key={j}><b>{ETIQUETA_CAMBIO[c.tipo]}</b>{c.texto}</li>)}</ul>
            </article>
          ))}
        </section>
      )}

      {t === "cobros" && (
        <>
          <section className="tarjeta">
            <dl className="acordado">
              <div><dt>Precio acordado</dt><dd>{formatoUSD(p.pagoUnico)}</dd></div>
              <div><dt>Mensualidad</dt><dd>{p.mensualidad > 0 ? formatoUSD(p.mensualidad) : "No aplica"}</dd></div>
              <div><dt>Día de cobro</dt><dd>{p.mensualidad > 0 ? p.diaCobroMensual : "—"}</dd></div>
            </dl>
          </section>
          <section className="tarjeta">
            <h2>Por pagar</h2>
            {p.cobros.porPagar.length === 0 && <p className="suave" style={{ margin: "8px 0 0" }}>Estás al día: no tienes cobros pendientes.</p>}
            {p.cobros.porPagar.map((c) => (
              <div key={c.id} className="cobro">
                <span>{c.texto}<small>{c.estado === "vencido" ? `Venció el ${fechaVisible(c.vence)}` : `Vence el ${fechaVisible(c.vence)}`}</small></span>
                <span style={{ textAlign: "right" }}><span className="cobro__monto">{formatoUSD(c.monto)}</span><br /><span className={`etiqueta etiqueta--${c.estado}`}>{ETIQUETA_COBRO[c.estado]}</span></span>
              </div>
            ))}
            {p.cobros.porPagar.length > 0 && <p className="suave" style={{ margin: "12px 0 0" }}>El pago sigue como siempre: por WhatsApp, Zelle o pago móvil.</p>}
          </section>
          <section className="tarjeta">
            <h2>Pagados</h2>
            {p.cobros.pagados.length === 0 && <p className="suave" style={{ margin: "8px 0 0" }}>Todavía no hay pagos registrados.</p>}
            {p.cobros.pagados.map((c) => (
              <div key={c.id} className="cobro">
                <span>{c.texto}<small>Pagado el {fechaVisible(c.pagadoEl ?? c.vence)}{c.canal ? ` por ${c.canal}` : ""}</small></span>
                <span style={{ textAlign: "right" }}><span className="cobro__monto">{formatoUSD(c.monto)}</span></span>
                {c.reciboNumero && <div style={{ gridColumn: "1 / -1" }}><a className="boton mini" href={`/recibos/${c.reciboNumero}.pdf`} target="_blank" rel="noopener">Descargar recibo {c.reciboNumero}</a></div>}
              </div>
            ))}
          </section>
        </>
      )}

      {t === "documentos" && (
        <section className="tarjeta">
          {p.propuestaCodigo
            ? <p style={{ margin: 0 }}><a className="boton" href={`/p/${p.propuestaCodigo}`} target="_blank" rel="noopener">Ver la propuesta aceptada</a></p>
            : <p style={{ margin: 0 }}>Todavía no hay documentos de este proyecto.</p>}
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 7: Contacto y salir**

Crear `src/app/c/[codigo]/contacto/page.tsx`:

```tsx
import { exigirCliente } from "@/lib/sesion-cliente";
import { leerEmisor } from "@/lib/configuracion";
import { primerNombre } from "@/lib/portal-contrato";
import { celularVisible } from "@/lib/recibos-contrato";
import { PortalBarra } from "@/componentes/PortalBarra";

export const dynamic = "force-dynamic";

export default async function ContactoPortal({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  await exigirCliente(codigo);
  const emisor = await leerEmisor();
  const quien = primerNombre(emisor.nombre);
  return (
    <main className="portal">
      <PortalBarra codigo={codigo} activa="contacto" />
      <h1>Contacto</h1>
      <p className="portal__bajada">Te atiende {emisor.nombre || "Neri Colón"}.</p>
      <section className="tarjeta">
        {emisor.whatsapp
          ? <><p style={{ margin: "0 0 12px" }}>Lo más rápido es WhatsApp: {celularVisible(emisor.whatsapp)}</p><a className="boton boton--primario" href={`https://wa.me/${emisor.whatsapp}`} target="_blank" rel="noopener">Escribirle a {quien} por WhatsApp</a></>
          : <p style={{ margin: 0 }}>Escríbele a {quien} por el mismo chat donde ya se comunican.</p>}
        {emisor.email && <p style={{ margin: "12px 0 0" }}>Correo: <a href={`mailto:${emisor.email}`}>{emisor.email}</a></p>}
      </section>
    </main>
  );
}
```

Crear `src/app/c/[codigo]/salir/route.ts`:

```ts
import { NextResponse } from "next/server";
import { COOKIE_CLIENTE } from "@/lib/sesion-cliente";
import { CODIGO_VALIDO } from "@/lib/codigo";

// Salir del portal: borra la cookie del cliente y vuelve a su pantalla de PIN. No toca la del panel.
export async function GET(_req: Request, ctx: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await ctx.params;
  const destino = CODIGO_VALIDO.test(codigo) ? `/c/${codigo}` : "/";
  const res = new NextResponse(null, { status: 302, headers: { Location: destino, "cache-control": "no-store" } });
  res.cookies.set(COOKIE_CLIENTE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
```

- [ ] **Step 8: `noindex` en `/c/`** — en `next.config.ts`, debajo de la entrada de `/recibos/:path*`:

```ts
      // El portal del cliente es privado: ningun buscador guarda ni la pantalla del PIN.
      { source: "/c/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
```

- [ ] **Step 9: Verificar lo que se puede sin navegador**

Run: `sha256sum src/app/c/portal.css` (debe dar `0d45237c1b28f68974d8fc1af274032581c2bf068123b3d92e4305de34ec09cc`), luego `npx tsc --noEmit`, luego `npm test`
Expected: hash igual; `tsc` sin salida; suite pura en verde. Las pantallas se ven en la tarea 9 (recorrido del controlador); no corras `next dev`.

- [ ] **Step 10: Commit**

```bash
git add src/app/c src/componentes/PortalBarra.tsx next.config.ts
git commit -F - <<'EOF'
feat(portal): pantallas del cliente - PIN, inicio, proyecto con sus pestanas y contacto
EOF
```

---

### Task 7: El cliente descarga sus recibos

**Files:**
- Modify: `src/app/recibos/[archivo]/route.ts`, `tests/recibos-ruta.test.ts`

**Interfaces:**
- Consumes: `sesionCliente` de `@/lib/sesion-cliente` (tarea 3); `sesionClienteFalsa` de `tests/ayuda-sesion.ts` (tarea 3).
- Produces: `GET /recibos/R-….pdf` responde `200` también con sesión de cliente **si el cobro es de un proyecto de ese cliente y no está anulado**; con sesión de cliente, el recibo de otro cliente, un recibo anulado o una nota `-A` responden `404`. Sin ninguna sesión sigue el `307` a `/entrar`; `prospectador` sigue en `403`.

- [ ] **Step 1: Tests que fallan** — en `tests/recibos-ruta.test.ts`:

1. Debajo del `vi.mock("@/lib/sesion", …)` existente agregar:

```ts
vi.mock("@/lib/sesion-cliente", async () => {
  const { sesionClienteFalsa } = await import("./ayuda-sesion");
  return { COOKIE_CLIENTE: "sesion_cliente", sesionCliente: async () => sesionClienteFalsa.actual };
});
```

2. Cambiar el import de la ayuda a `import { sesionFalsa, sesionClienteFalsa } from "./ayuda-sesion";`.
3. El sembrado del `beforeAll` necesita recordar de quién es cada recibo y un segundo cliente. Declarar junto a `let ids` las variables `let clienteId = 0; let otroClienteId = 0;`; donde hoy dice `const c = await sembrarCliente();` dejar `const c = await sembrarCliente(); clienteId = c.id;` y, al final del `beforeAll`, agregar:

```ts
    const otro = await sembrarCliente({ nombre: "Otro Cliente" });
    otroClienteId = otro.id;
```

4. El `beforeEach` queda: `beforeEach(() => { sesionFalsa.actual = { id: ids.usuarioId, nombre: "Neri", rol: "dueno" }; sesionClienteFalsa.actual = null; });`
5. Al final del `describe`:

```ts
  it("el cliente descarga SU recibo; el de otro cliente, uno anulado y una nota le responden 404", async () => {
    sesionFalsa.actual = null;
    sesionClienteFalsa.actual = { usuarioId: 1, clienteId, codigo: "x".repeat(22), nombre: "Dueño del recibo" };
    const mio = await pedir("R-2026-0001.pdf");
    expect(mio.status).toBe(200);
    expect(await mio.text()).toBe("%PDF-uno");
    expect((await pedir("R-2026-0003.pdf")).status).toBe(404);   // anulado
    expect((await pedir("R-2026-0003-A.pdf")).status).toBe(404); // la nota no es para el cliente
    const sinArchivo = await pedir("R-2026-0002.pdf");
    expect(sinArchivo.status).toBe(404);
    expect(await sinArchivo.text()).toContain("Escríbele");
    sesionClienteFalsa.actual = { usuarioId: 2, clienteId: otroClienteId, codigo: "y".repeat(22), nombre: "Otro" };
    expect((await pedir("R-2026-0001.pdf")).status).toBe(404);   // no es suyo: 404, no 403
  });

  it("sin ninguna de las dos sesiones sigue mandando a /entrar", async () => {
    sesionFalsa.actual = null;
    sesionClienteFalsa.actual = null;
    expect((await pedir("R-2026-0001.pdf")).status).toBe(307);
  });
```

- [ ] **Step 2: Correrlo y ver que falla**

Run: `PROSPECTOS_TEST_DB=1 npx vitest run tests/recibos-ruta.test.ts`
Expected: FAIL — con sesión de cliente la ruta responde 307 en vez de 200.

- [ ] **Step 3: La ruta** — `src/app/recibos/[archivo]/route.ts` queda completa así:

```ts
import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/db";
import { sesionActual } from "@/lib/sesion";
import { sesionCliente } from "@/lib/sesion-cliente";
import { ARCHIVO_RECIBO } from "@/lib/recibos-contrato";
import { rutaDocumento } from "@/lib/recibos";

const SIN_CACHE = { "cache-control": "private, no-store", "x-robots-tag": "noindex" };
const noEncontrado = (texto = "No encontrado") => new Response(texto, { status: 404, headers: SIN_CACHE });

// /recibos/R-2026-0001.pdf y /recibos/R-2026-0001-A.pdf. Entra el dueno, o (pieza 5) el cliente
// dueno de ese cobro: solo su recibo vigente; lo ajeno, lo anulado y las notas le responden 404.
export async function GET(_req: Request, ctx: { params: Promise<{ archivo: string }> }) {
  const u = await sesionActual();
  const cliente = u ? null : await sesionCliente();
  // Location relativa: detras del proxy de Apache, la URL de la peticion es la de 127.0.0.1.
  if (!u && !cliente) return new Response(null, { status: 307, headers: { location: "/entrar", ...SIN_CACHE } });
  if (u && u.rol !== "dueno") return new Response("No tienes permiso para ver recibos.", { status: 403, headers: SIN_CACHE });
  const { archivo } = await ctx.params;
  const m = ARCHIVO_RECIBO.exec(archivo);
  if (!m) return noEncontrado();
  const numero = m[1];
  const esNota = Boolean(m[3]);
  const cobro = await prisma.cobro.findFirst({ where: { reciboNumero: numero }, select: { notaAnulacionEn: true, anuladoEn: true, proyecto: { select: { clienteId: true } } } });
  if (!cobro || (esNota && !cobro.notaAnulacionEn)) return noEncontrado();
  if (cliente && (cobro.proyecto.clienteId !== cliente.clienteId || cobro.anuladoEn !== null || esNota)) return noEncontrado();
  try {
    const bytes = await readFile(rutaDocumento(esNota ? `${numero}-A` : numero));
    return new Response(bytes, { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${archivo}"`, ...SIN_CACHE } });
  } catch {
    // Un recibo emitido no se regenera: si el archivo no esta, se dice y se revisa a mano.
    console.error("recibo sin archivo en disco", archivo);
    return noEncontrado(cliente ? "Recibo no disponible. Escríbele a Neri y te lo envía." : "Recibo no disponible: el archivo no está en el servidor.");
  }
}
```

- [ ] **Step 4: Tests en verde**

Run: `PROSPECTOS_TEST_DB=1 npx vitest run tests/recibos-ruta.test.ts && npx tsc --noEmit`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add "src/app/recibos/[archivo]/route.ts" tests/recibos-ruta.test.ts
git commit -F - <<'EOF'
feat(portal): el cliente descarga sus recibos vigentes; lo ajeno y lo anulado responden 404
EOF
```

---

### Task 8: El `{enlace}` del portal en los mensajes que ya existen

**Files:**
- Modify: `src/lib/mensajes-cobro.ts`, `src/lib/recibos-contrato.ts`, `src/acciones/cobros.ts` (`registrarRecordatorio`), `src/acciones/versiones.ts` (`marcarAvisada`), `src/acciones/recibos.ts` (`avisarRecibo`), `src/componentes/FormularioAjustesCobros.tsx` (texto de ayuda)
- Test: `tests/cobros.test.ts`, `tests/recibos-contrato.test.ts`, `tests/recibos-acciones.test.ts`

**Interfaces:**
- Consumes: `enlaceSiTieneAcceso(clienteId)` (tarea 3).
- Produces: `mensajeDeCobro(c, proyecto, cliente, plantillas, enlace = "")` — quinto parámetro opcional; `mensajeRecibo({ cliente, numero, concepto, monto, enlace? })`. Si el cliente no tiene acceso activo el enlace va vacío y los mensajes quedan como hoy.

- [ ] **Step 1: Tests que fallan**

En `tests/cobros.test.ts`, dentro del `describe("mensajeDeCobro")`, agregar:

```ts
  it("pone el enlace del portal cuando se lo pasan, y sin el queda como antes", () => {
    const c = { concepto: "mensualidad" as const, detalle: "octubre 2026", monto: 100, vence: "2026-10-05", estado: "por_vencer" as const };
    expect(mensajeDeCobro(c, { nombre: "PMS" }, { nombre: "Hotel X", contactoNombre: "Ana" }, plantillas, "https://x.test/c/abc")).toBe("Hola Ana: Mensualidad (octubre 2026) de PMS por $100,00 vence el 05/10/2026. https://x.test/c/abc");
    expect(mensajeDeCobro(c, { nombre: "PMS" }, { nombre: "Hotel X", contactoNombre: "Ana" }, plantillas)).toBe("Hola Ana: Mensualidad (octubre 2026) de PMS por $100,00 vence el 05/10/2026.");
  });
```

En `tests/recibos-contrato.test.ts`, dentro del `describe("mensajeRecibo")`:

```ts
  it("con enlace del portal dice donde bajarlo", () => {
    expect(mensajeRecibo({ cliente: "Ana", numero: "R-2026-0001", concepto: "PMS: Extra — Reportes", monto: 350, enlace: "https://x.test/c/abc" }))
      .toBe("Buenas, Ana. Le envío el recibo de pago R-2026-0001 por $350,00, correspondiente a PMS: Extra — Reportes. También puede descargarlo en su portal: https://x.test/c/abc Gracias por su pago.");
  });
```

En `tests/recibos-acciones.test.ts`, al FINAL del `describe` (importar `darAcceso` de `@/lib/acceso-cliente`):

```ts
  it("si el cliente tiene acceso al portal, el aviso del recibo lleva su enlace", async () => {
    const cl = await sembrarCliente({ nombre: "Hotel Con Portal", whatsapp: "584127777777" });
    const p = await sembrarProyecto(cl.id, ids.nichoId, { estado: "activo" });
    const cobro = await cobroPagado("Con portal", p.id);
    await generarReciboDeCobro(cobro.id);
    const antes = await avisarRecibo(cobro.id);
    expect(antes.ok && antes.datos.mensaje).not.toContain("/c/");
    await darAcceso(cl.id);
    const despues = await avisarRecibo(cobro.id);
    expect(despues.ok && despues.datos.mensaje).toContain(`/c/${cl.codigo}`);
  });
```

- [ ] **Step 2: Correrlos y ver que fallan**

Run: `npx vitest run tests/recibos-contrato.test.ts`, luego `PROSPECTOS_TEST_DB=1 npx vitest run tests/cobros.test.ts tests/recibos-acciones.test.ts`
Expected: FAIL en los tres tests nuevos.

- [ ] **Step 3: Implementar**

`src/lib/mensajes-cobro.ts` — la firma gana el quinto parámetro y lo usa (el comentario del `{enlace}` cambia):

```ts
export function mensajeDeCobro(
  c: { concepto: Concepto; detalle: string; monto: number; vence: string; estado: EstadoCobro },
  proyecto: { nombre: string }, cliente: { nombre: string; contactoNombre: string },
  plantillas: { recordatorio: string; vencido: string },
  enlace = "",
): string {
  const plantilla = c.estado === "vencido" ? plantillas.vencido : plantillas.recordatorio;
  const concepto = c.detalle ? `${ETIQUETA_CONCEPTO[c.concepto]} (${c.detalle})` : ETIQUETA_CONCEPTO[c.concepto];
  // {enlace} es el portal del cliente (pieza 5); vacio si el cliente no tiene acceso activo.
  const texto = rellenar(plantilla, { cliente: cliente.contactoNombre || cliente.nombre, proyecto: proyecto.nombre, monto: formatoUSD(c.monto), concepto, vence: fechaVisible(c.vence), enlace });
```
(el resto de la función queda igual).

`src/lib/recibos-contrato.ts` — `mensajeRecibo` queda:

```ts
// El PDF no viaja en el enlace de WhatsApp: lo adjunta Neri desde el telefono. Si el cliente tiene
// portal, el mensaje dice ademas donde bajarlo.
export function mensajeRecibo(d: { cliente: string; numero: string; concepto: string; monto: number; enlace?: string }): string {
  const portal = d.enlace ? ` También puede descargarlo en su portal: ${d.enlace}` : "";
  return `Buenas, ${d.cliente}. Le envío el recibo de pago ${d.numero} por ${formatoUSD(d.monto)}, correspondiente a ${d.concepto}.${portal} Gracias por su pago.`;
}
```

`src/acciones/cobros.ts`, en `registrarRecordatorio`: importar `import { enlaceSiTieneAcceso } from "@/lib/acceso-cliente";` y pasar el enlace como quinto argumento de `mensajeDeCobro`:

```ts
    const mensaje = mensajeDeCobro({ concepto: c.concepto as Concepto, detalle: c.detalle, monto: Number(c.monto), vence: c.vence, estado: estadoCobro(c, hoy) }, c.proyecto, c.proyecto.cliente,
      { recordatorio: await leerConfig(CLAVES.mensajeRecordatorio), vencido: await leerConfig(CLAVES.mensajeVencido) }, await enlaceSiTieneAcceso(c.proyecto.clienteId));
```

`src/acciones/recibos.ts`, en `avisarRecibo`: importar `enlaceSiTieneAcceso` y agregar `enlace: await enlaceSiTieneAcceso(c.proyecto.clienteId),` al objeto que recibe `mensajeRecibo`.

`src/acciones/versiones.ts`, en `marcarAvisada`: importar `enlaceSiTieneAcceso` y cambiar la línea del mensaje por:

```ts
    const enlace = await enlaceSiTieneAcceso(v.proyecto.clienteId);
    const mensaje = `Buenas, ${quien}. Publicamos la versión ${v.version} de ${v.proyecto.nombre}:\n${lineas}\n${enlace ? `Puede verla en su portal: ${enlace}\n` : ""}Cualquier duda me escribe por aquí.`;
```

`src/componentes/FormularioAjustesCobros.tsx`: en el texto de ayuda de los mensajes de cobro, cambiar `{"{enlace}"} queda vacío hasta que exista el portal del cliente.` por `{"{enlace}"} es el portal del cliente; queda vacío si ese cliente no tiene acceso activo.`

- [ ] **Step 4: Tests en verde**

Run: `npx vitest run tests/recibos-contrato.test.ts tests/instrumentation-grafo.test.ts`, luego `PROSPECTOS_TEST_DB=1 npx vitest run tests/cobros.test.ts tests/recibos-acciones.test.ts tests/versiones.test.ts`, luego `npx tsc --noEmit`
Expected: PASS todo. (El snapshot de `recibos-contrato` no cambia: es del HTML del recibo, no del mensaje.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/mensajes-cobro.ts src/lib/recibos-contrato.ts src/acciones/cobros.ts src/acciones/recibos.ts src/acciones/versiones.ts src/componentes/FormularioAjustesCobros.tsx tests/cobros.test.ts tests/recibos-contrato.test.ts tests/recibos-acciones.test.ts
git commit -F - <<'EOF'
feat(portal): los recordatorios, el aviso de version y el del recibo llevan el enlace del portal
EOF
```

---

### Task 9: Recorrido a 390 px, despliegue y documentación

**Solo el controlador** (el script lo puede escribir un subagente; correrlo, el build y el despliegue, no).

**Files:**
- Create: `scripts/verificar-flujo-portal.mts`
- Modify: `CLAUDE.md`, `docs/superpowers/specs/2026-09-16-portal-cliente-design.md`
- Memoria: `estado-prospectos.md`

- [ ] **Step 1: El recorrido** — crear `scripts/verificar-flujo-portal.mts`:

```ts
// scripts/verificar-flujo-portal.mts — recorrido del portal del cliente a 390 px: PIN errado, PIN bueno, dos
// proyectos, pestanas, bajar un recibo, aislamiento entre clientes, salir.
// SOLO contra el servidor de desarrollo del clon con la base de tests. El script y el servidor tienen que
// compartir PROSPECTOS_DIR_ARCHIVOS (un directorio temporal): aqui se deja el PDF de prueba que la ruta sirve.
// Uso (desde el clon, con su next dev en 3014 levantado con ese mismo directorio):
//   DATABASE_URL="$TEST_DATABASE_URL" PROSPECTOS_DIR_ARCHIVOS=<temporal> BASE_URL=http://127.0.0.1:3014 npx tsx scripts/verificar-flujo-portal.mts
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { chromium } from "playwright";
import { prisma } from "../src/lib/db";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3014";
const DIR = process.env.PROSPECTOS_DIR_ARCHIVOS ?? "";
if (!(process.env.DATABASE_URL ?? "").includes("prospectos_test")) { console.error("ALTO: DATABASE_URL no es la base de tests."); process.exit(2); }
if (/neracosu\.com|:3013(\/|$)/.test(BASE)) { console.error("ALTO: BASE_URL apunta a produccion. Usa el servidor de desarrollo del clon."); process.exit(2); }
if (!DIR || path.resolve(DIR) === "/home/neracosu/prospectos-archivos") { console.error("ALTO: PROSPECTOS_DIR_ARCHIVOS tiene que ser un directorio temporal, el mismo del servidor de desarrollo."); process.exit(2); }

mkdirSync("capturas", { recursive: true });
const errores: string[] = [];
const marca = `(PRUEBA) ${Date.now()}`;
const PIN = "482915";
const codigoDe = (semilla: string) => (semilla + "x".repeat(22)).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 22);
const ids: { clientes: number[] } = { clientes: [] };

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const pg = await ctx.newPage();
pg.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
pg.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errores.push(`console: ${m.text()}`); });
const sinScroll = async (donde: string) => { const ancho = await pg.evaluate(() => document.documentElement.scrollWidth); if (ancho > 390) errores.push(`scroll horizontal en ${donde}: ${ancho}px`); };
try {
  const nicho = (await prisma.nicho.findFirst()) ?? (await prisma.nicho.create({ data: { slug: "hoteles", nombre: "Hoteles", mensajeInicial: "{nombre} {enlace}", mensajeSeguimiento: "{nombre} {enlace}" } }));
  await prisma.configuracion.upsert({ where: { clave: "datos_emisor" }, update: {}, create: { clave: "datos_emisor", valor: JSON.stringify({ nombre: "Neri Colón", rif: "V-12345678-9", whatsapp: "584121234567", email: "neri@ejemplo.test" }) } });
  const a = await prisma.cliente.create({ data: { nombre: `Hotel ${marca}`, whatsapp: "584120000000", codigo: codigoDe(`a${Date.now()}`) } });
  const otro = await prisma.cliente.create({ data: { nombre: `Farmacia ${marca}`, codigo: codigoDe(`b${Date.now()}`) } });
  ids.clientes.push(a.id, otro.id);
  await prisma.usuario.create({ data: { nombre: a.nombre, rol: "cliente", clienteId: a.id, pinHash: await bcrypt.hash(PIN, 10), metaDiaria: 0 } });
  const pms = await prisma.proyecto.create({ data: { clienteId: a.id, nichoId: nicho.id, nombre: "PMS Hotel", pagoUnico: "2800.00", mensualidad: "100.00", fechaInicio: "2026-06-01", estado: "activo", diaCobroMensual: 5 } });
  await prisma.proyecto.create({ data: { clienteId: a.id, nichoId: nicho.id, nombre: "Módulo de reservas en línea", pagoUnico: "900.00", mensualidad: "0", fechaInicio: "2026-09-01", estado: "en_construccion" } });
  const ajeno = await prisma.proyecto.create({ data: { clienteId: otro.id, nichoId: nicho.id, nombre: "Inventario ajeno", pagoUnico: "500.00", mensualidad: "0", fechaInicio: "2026-09-01", estado: "activo" } });
  await prisma.pendiente.createMany({ data: [
    { proyectoId: pms.id, texto: "Recepción y habitaciones", visibleCliente: true, hecho: true, hechoEn: new Date("2026-07-02T16:00:00Z"), fechaEstimada: "2026-06-30", orden: 1 },
    { proyectoId: pms.id, texto: "Conexión con el punto de venta del restaurante", visibleCliente: true, hecho: false, orden: 2 },
    { proyectoId: pms.id, texto: "INTERNO no debe verse", visibleCliente: false, hecho: false, orden: 3 },
  ] });
  const v = await prisma.version.create({ data: { proyectoId: pms.id, version: "1.4.2", fecha: "2026-08-28" } });
  await prisma.cambio.create({ data: { versionId: v.id, tipo: "arreglo", texto: "El cierre de caja ya no duplica los pagos en Zelle.", orden: 1 } });
  const numero = `R-2026-9${String(Date.now()).slice(-3)}`;
  await prisma.cobro.createMany({ data: [
    { proyectoId: pms.id, concepto: "mensualidad", detalle: "Mensualidad de septiembre 2026", mes: "2026-09", monto: "100.00", vence: "2026-09-05" },
    { proyectoId: pms.id, concepto: "cuota", detalle: "Cuota 3 de 3", monto: "933.34", vence: "2026-07-15", pagadoEn: new Date("2026-07-15T16:00:00Z"), canal: "pago_movil", reciboNumero: numero, reciboGeneradoEn: new Date() },
  ] });
  mkdirSync(path.join(DIR, "recibos", "2026"), { recursive: true });
  writeFileSync(path.join(DIR, "recibos", "2026", `${numero}.pdf`), "%PDF-1.4 recibo de prueba del recorrido");

  // 1. PIN errado y despues el bueno
  await pg.goto(`${BASE}/c/${a.codigo}`);
  await pg.getByText("Escribe tu PIN de 6 números para ver tus proyectos.").waitFor();
  await pg.screenshot({ path: "capturas/p5-01-pin.png", fullPage: true });
  await sinScroll("PIN");
  for (const d of "000000") await pg.getByRole("button", { name: d, exact: true }).click();
  await pg.getByText("PIN incorrecto.").waitFor();
  await pg.waitForTimeout(500); // el teclado limpia el PIN 300 ms despues de enviar: teclear antes lo borraria a medias
  for (const d of PIN) await pg.getByRole("button", { name: d, exact: true }).click();
  await pg.waitForURL(/\/inicio$/);

  // 2. Inicio: dos proyectos y el aviso del vencido
  await pg.getByRole("heading", { name: "PMS Hotel" }).waitFor();
  await pg.getByRole("heading", { name: "Módulo de reservas en línea" }).waitFor();
  await pg.getByText("Tienes un cobro vencido").waitFor();
  await pg.screenshot({ path: "capturas/p5-02-inicio.png", fullPage: true });
  await sinScroll("inicio");

  // 3. Del aviso a los cobros; bajar el recibo con la sesion del cliente
  await pg.getByRole("link", { name: "Ver cobros" }).click();
  await pg.getByRole("heading", { name: "Por pagar" }).waitFor();
  await pg.getByRole("link", { name: `Descargar recibo ${numero}` }).waitFor();
  await pg.screenshot({ path: "capturas/p5-03-cobros.png", fullPage: true });
  await sinScroll("cobros");
  const pdf = await ctx.request.get(`${BASE}/recibos/${numero}.pdf`);
  if (pdf.status() !== 200 || pdf.headers()["content-type"] !== "application/pdf") errores.push(`recibo del cliente: ${pdf.status()}`);

  // 4. Avance y versiones; lo interno no aparece
  await pg.getByRole("link", { name: "Avance" }).click();
  await pg.getByText("1 de 2 hitos cumplidos").waitFor();
  if (await pg.getByText("INTERNO").count()) errores.push("se ve un pendiente interno");
  await pg.screenshot({ path: "capturas/p5-04-avance.png", fullPage: true });
  await pg.getByRole("link", { name: "Versiones" }).click();
  await pg.getByText("El cierre de caja ya no duplica los pagos en Zelle.").waitFor();
  await pg.screenshot({ path: "capturas/p5-05-versiones.png", fullPage: true });
  await sinScroll("versiones");
  await pg.getByRole("link", { name: "Contacto" }).click();
  await pg.getByRole("link", { name: /por WhatsApp/ }).waitFor();
  await pg.screenshot({ path: "capturas/p5-06-contacto.png", fullPage: true });

  // 5. Aislamiento: el proyecto de otro cliente y el panel no existen para esta sesion
  const ajenoRes = await ctx.request.get(`${BASE}/c/${a.codigo}/proyecto/${ajeno.id}`);
  if (ajenoRes.status() !== 404) errores.push(`proyecto ajeno deberia ser 404, fue ${ajenoRes.status()}`);
  const panel = await ctx.request.get(`${BASE}/proyectos`, { maxRedirects: 0 });
  if (panel.status() !== 307) errores.push(`el panel con sesion de cliente deberia redirigir a /entrar, fue ${panel.status()}`);
  const portalAjeno = await ctx.request.get(`${BASE}/c/${otro.codigo}/inicio`, { maxRedirects: 0 });
  if (portalAjeno.status() !== 307) errores.push(`el portal de otro cliente deberia volver a su PIN, fue ${portalAjeno.status()}`);
  if ((await prisma.evento.count({ where: { clienteId: a.id, tipo: "portal_abierto" } })) !== 1) errores.push("no quedo un (y solo un) evento portal_abierto");

  // 6. Salir vuelve al PIN y la sesion ya no sirve
  await pg.getByRole("link", { name: "Salir" }).click();
  await pg.getByText("Escribe tu PIN de 6 números para ver tus proyectos.").waitFor();
  const tras = await ctx.request.get(`${BASE}/c/${a.codigo}/inicio`, { maxRedirects: 0 });
  if (tras.status() !== 307) errores.push("despues de salir la sesion sigue abierta");

  // 7. Acceso desactivado: misma URL, sin teclado
  await prisma.usuario.updateMany({ where: { clienteId: a.id }, data: { activo: false } });
  await pg.goto(`${BASE}/c/${a.codigo}`);
  await pg.getByRole("heading", { name: "Acceso desactivado" }).waitFor();
  await pg.screenshot({ path: "capturas/p5-07-desactivado.png", fullPage: true });
} catch (e) {
  errores.push(`excepcion: ${(e as Error).message}`);
  await pg.screenshot({ path: "capturas/p5-error.png", fullPage: true }).catch(() => {});
} finally {
  await b.close();
  for (const clienteId of ids.clientes) {
    const pids = (await prisma.proyecto.findMany({ where: { clienteId }, select: { id: true } })).map((p) => p.id);
    await prisma.evento.deleteMany({ where: { OR: [{ proyectoId: { in: pids } }, { clienteId }] } });
    await prisma.cambio.deleteMany({ where: { version: { proyectoId: { in: pids } } } });
    await prisma.version.deleteMany({ where: { proyectoId: { in: pids } } });
    await prisma.pendiente.deleteMany({ where: { proyectoId: { in: pids } } });
    await prisma.cobro.deleteMany({ where: { proyectoId: { in: pids } } });
    await prisma.proyecto.deleteMany({ where: { id: { in: pids } } });
    await prisma.usuario.deleteMany({ where: { clienteId } });
    await prisma.cliente.delete({ where: { id: clienteId } });
  }
  await prisma.$disconnect();
}
console.log(errores.length ? `FALLO:\n- ${errores.join("\n- ")}` : "PASS: recorrido del portal sin errores");
process.exit(errores.length ? 1 : 0);
```

Commit del script en la rama (`git add scripts/verificar-flujo-portal.mts`, mensaje `feat(portal): recorrido a 390 px del portal del cliente`).

- [ ] **Step 2: Correr el recorrido contra el clon.** `S` = scratchpad de la sesión. El clon `~/dev-clon-prospectos` ya existe de la pieza 4.

```bash
git -C ~/dev-clon-prospectos fetch -q origin && git -C ~/dev-clon-prospectos switch -q pieza-5a 2>/dev/null || git -C ~/dev-clon-prospectos switch -q -c pieza-5a origin/pieza-5a
git -C ~/dev-clon-prospectos pull -q && (cd ~/dev-clon-prospectos && npx prisma generate | tail -1)
cd ~/dev-clon-prospectos && set -a && . ~/.config/prospectos/env && set +a
export DATABASE_URL="$TEST_DATABASE_URL" PROSPECTOS_DIR_ARCHIVOS="$S/archivos-dev"
node_modules/.bin/next dev -p 3014 -H 127.0.0.1 > "$S/dev.log" 2>&1 &
echo $! > "$S/dev.pid"
until curl -s -o /dev/null http://127.0.0.1:3014/entrar; do sleep 2; done
BASE_URL=http://127.0.0.1:3014 npx tsx scripts/verificar-flujo-portal.mts
```
Expected: `PASS: recorrido del portal sin errores` y siete capturas `capturas/p5-0*.png`. Si el script falla, el arreglo lo hace el implementador de la tarea (puede correrlo contra este servidor; no lo arranca ni lo mata).

- [ ] **Step 3: Mirar las capturas** `p5-01` a `p5-07` contra el prototipo de `capturas/p5-prototipo/`: tema claro, serif en nombres y montos, nada cortado a 390 px, la etiqueta «Vencido» con texto, el hito cumplido con su marca. Además, con el servidor arriba: `curl -s -o /dev/null -D - http://127.0.0.1:3014/c/<código> | grep -i x-robots` debe traer `noindex`.

- [ ] **Step 4: Apagar el servidor — solo por PID**

```bash
kill "$(cat "$S/dev.pid")"; sleep 3
pgrep -af dev-clon-prospectos ; ss -ltn | grep ":3014 " ; pm2 list
rm -rf "$S/archivos-dev" "$S/dev.pid"
```
Expected: sin restos, puerto libre, los cinco de PM2 `online` sin reinicios nuevos.

- [ ] **Step 5: Suite completa y revisión final de la rama** (sin el env cargado): `npm test && npm run test:db && npx tsc --noEmit`. Luego la revisión de toda la rama, con foco en: aislamiento entre clientes, que ninguna acción escriba desde sesión de cliente, que el PIN en claro no llegue a ningún log, y que el panel y el portal no compartan sesión.

- [ ] **Step 6: Fusionar, compilar y desplegar**

```bash
cd /home/neracosu/public_html/prospectos.neracosu.com && git switch main && git merge --ff-only pieza-5a
pm2 list ; pgrep -af "next build" || echo "ningun build en curso"
( set -a; . ~/.config/prospectos/env; set +a; npx prisma migrate deploy | tail -2; npm run build 2>&1 | tail -30 )
pm2 restart prospectos
```
Expected: `No pending migrations`; el build lista `/c/[codigo]`, `/c/[codigo]/inicio`, `/c/[codigo]/proyecto/[id]`, `/c/[codigo]/contacto`, `/c/[codigo]/salir`.

- [ ] **Step 7: Verificar producción — sin crear ningún acceso real**

```bash
sleep 6; pm2 list
pm2 logs prospectos --lines 30 --nostream | grep -E "\[mensualidades\]|\[revision\]"
curl -s -o /dev/null -L -w "%{http_code} %{url_effective}\n" https://prospectos.neracosu.com/
curl -s -o /dev/null -w "codigo inexistente: %{http_code}\n" https://prospectos.neracosu.com/c/AAAAAAAAAAAAAAAAAAAAAA
curl -s -o /dev/null -w "codigo mal formado: %{http_code}\n" https://prospectos.neracosu.com/c/no-es-un-codigo
curl -s -o /dev/null -D - https://prospectos.neracosu.com/c/AAAAAAAAAAAAAAAAAAAAAA | grep -i "x-robots"
curl -s -o /dev/null -w "recibo sin sesion: %{http_code}\n" https://prospectos.neracosu.com/recibos/R-2026-0001.pdf
```
Expected: `prospectos` online con el contador +1; las dos líneas de los crones; `200 …/entrar`; `404`, `404`; `noindex`; `307`. Y en la base real: `usuario` de rol `cliente` = 0 (ningún acceso creado por el despliegue).

- [ ] **Step 8: Documentación** — `CLAUDE.md`: la fila 5 pasa a `5a implementada (fecha) · 5b aprobada`; estado general; `scripts/verificar-flujo-portal.mts` en scripts útiles (⚠️ solo base de tests, comparte `PROSPECTOS_DIR_ARCHIVOS` temporal con el servidor del clon); y un bloque «Pieza 5a (Portal del cliente)» con: URL `/c/<código>`, acceso por cliente con `Usuario` rol `cliente` y `sesionVersion`, cookie `sesion_cliente` con token de audiencia `portal` (el panel no lo acepta ni al revés), bloqueo por cuenta y por IP, **toda lectura pasa por `src/lib/portal.ts`** (filtra por `clienteId`, `select` campo por campo; agregar un dato al portal = agregarlo ahí y en `tests/portal.test.ts`, que falla si aparece `horas|tarifa|nota`), el cliente no ve anulados ni notas `-A`, `pinEnUso` solo mira el panel, el PIN en claro nunca se guarda ni se loguea, tema claro en `src/app/c/portal.css` con fuentes de `plantillas/fuentes/` vía `next/font/local`, y lo que queda para 5b. Spec: estado «5a implementada» y sección «Desviaciones al implementar» con las seis decisiones de este plan. Commit `docs: pieza 5a en produccion …`; borrar la rama.

- [ ] **Step 9: Memoria y aviso a Neri** — `estado-prospectos.md`: pieza 5a en producción, commits sin push, siguiente: plan 5b (documentos y plantillas de aviso). Pendientes de Neri: enviar el primer acceso real (el hotel de Valencia) desde la ficha del cliente, y probar el portal en su teléfono.
