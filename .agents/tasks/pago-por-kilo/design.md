# Diseño técnico — Pago por kilo + Variedades de producto (F-01 + extensión F-05)

> **Estado**: Revisión 4 (resueltos los 3 hallazgos de `design-review.json` sobre la Rev. 3:
> 1 MEDIUM + 2 NIT; ver "Respuestas a la revisión de diseño (Rev. 3 → Rev. 4)" al final).
> Las tablas de las revisiones anteriores (Rev. 2 → Rev. 3 y Rev. 1 → Rev. 2) se conservan más
> abajo como historial.
> **Alcance**: coexistencia de pago por caja/kilo (`products.unit_measure`) y variedades
> de producto en la jerarquía, con tarifa por variedad, destare conectado al pago por kilo,
> y gating por feature flags.
> **Idioma**: contenido de negocio en español; identificadores técnicos (tablas, columnas,
> flags, códigos de error) en inglés, según `tech`/`structure`.
> **Stack bloqueado al aprobar**: PostgreSQL 15 + Supabase (RLS, Edge Functions Deno),
> `@fundo360/shared` (TS + Zod), Next.js 14 (apps/web), Expo Router + React Native
> (apps/mobile), TanStack Query. No se introduce ninguna tecnología nueva.

---

## 1. Visión general

Hoy el pago es **siempre por caja**: tanto `picking-records/index.ts` como
`settlements/index.ts` computan `quantity × rate_amount_snapshot`, y el destare
(`box_tare_control`, migración `20260927000001`) es solo control de merma que **no altera el
pago**. El enum `unit_measure('box','kg')` ya existe en `products` pero hoy no cambia ningún
cálculo. Este diseño activa el camino `'kg'` sin tocar el camino `'box'` (regresión cero,
NFR-01), e introduce **variedades de producto** como nivel jerárquico bajo el producto, con
**tarifa propia por variedad** reutilizando la tabla `rates` (no una tabla nueva).

La estrategia transversal es **snapshots inmutables congelados al registrar** (patrón ya usado
por `rate_amount_snapshot`, `tare_snapshot_kg`, `net_weight_kg`): el `picking_record` guarda la
unidad de pago, la tarifa y los kilos pagables en el momento del registro, de modo que la
liquidación nunca recalcula contra el estado actual del catálogo. La base de datos es la
barrera dura de integridad (FKs compuestas de tenant, triggers de validación cruzada, índices
únicos parciales); las Edge Functions añaden validación con códigos de error legibles; el
cliente (web/móvil) solo refleja la unidad correcta y queda detrás de feature flags.

Las decisiones abiertas del documento de requisitos (D-1…D-10) se **confirman todas** salvo
precisiones puntuales que se detallan en §12. Esta es la lista de decisiones firmes:

- **D-1 confirmada**: variedad **opcional** a nivel de producto (0..N variedades).
- **D-2 confirmada**: integridad `block.variety_id` ↔ producto se enforza con **trigger** en
  DB + validación espejo en Edge Function + FK compuesta de tenant.
- **D-3 confirmada**: `rates.variety_id` **nullable** (una sola tabla `rates`, sin
  `variety_rates`).
- **D-4 confirmada**: dos índices únicos parciales (producto sin variedad / producto+variedad).
- **D-5 confirmada**: nuevo campo `picking_records.paid_quantity_kg NUMERIC(10,3)` nullable.
- **D-6 confirmada**: nuevo snapshot `picking_records.payment_unit` (enum `unit_measure`).
- **D-7 confirmada**: `rate_amount_snapshot` representa `$/caja` o `$/kg` según `payment_unit`.
- **D-8 confirmada**: dos flags `org_override` default off: `kg_payment` y `product_varieties`.
- **D-9 confirmada**: la corrección (soft-update) copia `paid_quantity_kg`/`payment_unit` y
  permite corregir los kilos pagables.
- **D-10 confirmada con regla explícita**: `quantity` siempre `> 0`; en captura manual sin
  caja de un producto `kg`, `quantity` se fija en `1` (una entrega). Ver §6.3.

---

## 2. Estado actual verificado (leído del repo)

Verificado contra las migraciones y el código (no asumido):

- `products`: `unit_measure unit_measure NOT NULL` (enum `('box','kg')`, migración
  `20260822000001`), `organization_id NOT NULL`, `UNIQUE (id, organization_id)` (`20260829000005`),
  trigger `trg_set_org_id_products` (`20260830000003`), trigger `trg_products_updated_at`.
- `blocks`: `product_id NOT NULL`, FK compuesta `fk_blocks_product_org (product_id,
  organization_id)` a `products`, `UNIQUE (id, organization_id)` (`uq_blocks_id_org`). **No
  tiene** `variety_id`. Trigger `trg_blocks_updated_at` + `trg_set_org_id_blocks`.
- `rates`: FK compuesta `fk_rates_product_org`, `amount NUMERIC(12,2) CHECK > 0`,
  `effective_from`, `status rate_status('current'|'historical')`, índice `idx_rates_product_status`,
  **índice único parcial** `idx_rates_product_current ON rates(product_id) WHERE status='current'`.
  `organization_id NOT NULL`, trigger `trg_set_org_id_rates`. **No tiene** `updated_at` ni
  trigger de updated_at (solo `created_at`) — `Rate` en shared declara `extends BaseEntity`
  pero la tabla real no tiene `updated_at`; se respeta la tabla real (ver §12, Supuesto A).
- `box_types` (`20260927000001`): patrón de referencia a espejar para `product_varieties`
  (organization_id, `UNIQUE (id, organization_id)`, triggers `set_organization_id` +
  `update_updated_at_column`, policies `admin_all_box_types` + `member_read_active_box_types`).
- `picking_records`: `quantity NUMERIC(10,2) CHECK > 0`, `rate_amount_snapshot NUMERIC(12,2)
  CHECK > 0`, `box_type_id` + `gross_weight_kg` + `tare_snapshot_kg` + `net_weight_kg`
  (`NUMERIC(10,3)`) + `out_of_tolerance`, FK compuesta `fk_picking_block_org`,
  `fk_picking_box_type_org`. **No tiene** `paid_quantity_kg`, `payment_unit` ni `variety_id`.
- `settlements`: trigger `prevent_paid_settlement_update` (`trg_settlements_immutable_when_paid`,
  migración `20260822000008`); `payee_type('worker'|'crew')`.
- Edge Functions: `picking-records` resuelve `rates.eq('product_id', block.product_id)
  .eq('status','current').single()` y congela `rate.amount`; `settlements` computa
  `quantity × rate_amount_snapshot` en los 3 flujos (generate, crew-generate, getOne breakdown).
- Feature flags (`20260913000002`): `platform_feature_flags` (global, sin org) +
  `organization_feature_flags` (override por tenant). Resolución efectiva en móvil con
  `useFeatureFlag` (hook en `apps/mobile/src/hooks/useFeatureFlag.ts`). La web **aún no tiene**
  helper consumidor (solo la consola super-admin gestiona flags).
- Última migración existente: `20261002000003_supervisor_insert_crew_payments_rls`. Todas las
  nuevas migraciones usan timestamps estrictamente mayores.

---

## 3. Capa de base de datos — migraciones

Las migraciones usan SQL puro (`.sql`), igual que todas las existentes. Cada archivo incluye
comentario de encabezado y, donde aplica, nota de reversibilidad. Orden de creación estricto:
tipos → tablas → columnas → backfill → constraints → índices → RLS → flags.

> **Override explícito del steering `database-migrations` (reglas 1 y 3)** — Este diseño
> **sobrescribe conscientemente** las reglas 1 (archivos `up`/`down` reversibles) y 3
> (nombre `YYYYMMDDHHMMSS_descripcion.ts`) del steering `database-migrations`. El template Knex
> `.ts` de ese steering es **ilustrativo**; el estándar real del proyecto —verificado en TODAS
> las migraciones bajo `supabase/migrations/*.sql`— es **SQL puro** aplicado con
> `supabase db reset` (sin runner de `down` automático). La reversibilidad se documenta como
> comentario de encabezado en cada archivo (p. ej. `DROP TABLE … CASCADE`). Se mantiene la regla
> 5 (índice en cada FK), la 6 (UUID PK), la 7 (`created_at`/`updated_at`) y la 9/10 (CHECK + RLS).

### 3.1 Lista exacta de migraciones (timestamps > 20261002000003)

| # | Archivo | Contenido |
|---|---------|-----------|
| M1 | `20261003000001_create_product_varieties.sql` | Tabla `product_varieties` + triggers + RLS. |
| M2 | `20261003000002_add_rates_variety_id.sql` | `rates.variety_id` nullable + FK compuesta + reemplazo de índice único por dos parciales. |
| M3 | `20261003000003_add_blocks_variety_id.sql` | `blocks.variety_id` nullable + FK compuesta + índice + trigger de validación. |
| M4 | `20261003000004_add_picking_payment_fields.sql` | `picking_records.payment_unit` + `paid_quantity_kg` + CHECKs + backfill de registros existentes. |
| M5 | `20261003000005_feature_flags_kg_varieties.sql` | Inserta flags `kg_payment` y `product_varieties` en `platform_feature_flags`. |

> **Nota de aislamiento de ALTER TYPE**: `unit_measure` **ya existe** con los valores `'box'` y
> `'kg'`; **no se requiere** ningún `ALTER TYPE ... ADD VALUE`. Esto evita la restricción de
> Postgres de que un valor de enum recién añadido no puede usarse en la misma transacción. Si
> una revisión futura necesitara un valor nuevo de enum, debe ir en su propia migración aislada
> (regla recordada aquí para cumplir CA-25 aun cuando hoy no aplica).

### 3.2 M1 — `product_varieties`

Espeja `box_types` punto por punto (CA-11, CA-23):

```sql
CREATE TABLE product_varieties (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  product_id      UUID NOT NULL,
  name            VARCHAR(100) NOT NULL,
  status          entity_status NOT NULL DEFAULT 'active',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- FK compuesta de tenant: la variedad y su producto son del mismo tenant.
  CONSTRAINT fk_variety_product_org
    FOREIGN KEY (product_id, organization_id) REFERENCES products (id, organization_id) ON DELETE RESTRICT,
  -- Requisito para que otras tablas (blocks, rates) referencien (id, organization_id).
  CONSTRAINT uq_product_varieties_id_org UNIQUE (id, organization_id)
);

CREATE INDEX idx_product_varieties_organization ON product_varieties (organization_id);
CREATE INDEX idx_product_varieties_product ON product_varieties (product_id);
CREATE INDEX idx_product_varieties_status ON product_varieties (status);
-- Nombre único de variedad por producto (dentro del tenant), case-insensitive,
-- SOLO entre variedades activas (ver regla de unicidad abajo).
CREATE UNIQUE INDEX uq_product_varieties_name_per_product
  ON product_varieties (product_id, lower(name)) WHERE status = 'active';

CREATE TRIGGER trg_product_varieties_updated_at
  BEFORE UPDATE ON product_varieties FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_set_org_id_product_varieties
  BEFORE INSERT ON product_varieties FOR EACH ROW EXECUTE FUNCTION set_organization_id();
```

RLS (espejo exacto de `box_types`, CA-26):

```sql
ALTER TABLE product_varieties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_product_varieties" ON product_varieties
  FOR ALL USING (is_platform_admin() OR (is_admin() AND organization_id = current_org_id()));

CREATE POLICY "member_read_active_product_varieties" ON product_varieties
  FOR SELECT USING (
    is_platform_admin()
    OR ((is_supervisor() OR is_crew_lead() OR is_worker())
        AND status = 'active' AND organization_id = current_org_id())
  );
```

**Regla de unicidad de nombre (CA-11, finding 6)**: el nombre de variedad es único **entre
variedades activas** del mismo producto (case-insensitive). Al **desactivar** una variedad su
nombre queda **libre** y puede reutilizarse (el índice parcial solo cubre `status='active'`). Al
**reactivar** una variedad (`PUT /varieties/:id status=active`) cuyo nombre colisione con otra
variedad activa del mismo producto, la operación se **rechaza** con `VARIETY_NAME_TAKEN` 409: la
Edge Function hace la comprobación previa (`SELECT ... WHERE product_id=X AND lower(name)=... AND
status='active'`) para devolver el 409 legible, y el índice parcial es la barrera dura (una
violación de unique index se traduce a `VARIETY_NAME_TAKEN`). Lo mismo aplica al crear
(`POST /varieties`) con un nombre ya activo.

*Reversibilidad*: `DROP TABLE product_varieties CASCADE;` (comentada en el encabezado; el
proyecto no corre `down` automático pero se documenta).

### 3.3 M2 — `rates.variety_id` (D-3, D-4, CA-16, CA-17, CA-19)

```sql
ALTER TABLE rates ADD COLUMN variety_id UUID;

-- FK compuesta de tenant (nullable: NULL = tarifa a nivel de producto).
ALTER TABLE rates ADD CONSTRAINT fk_rates_variety_org
  FOREIGN KEY (variety_id, organization_id)
  REFERENCES product_varieties (id, organization_id) ON DELETE RESTRICT;

-- Índice en la FK (regla database-migrations §5).
CREATE INDEX idx_rates_variety ON rates (variety_id) WHERE variety_id IS NOT NULL;

-- Reemplazo del índice único de "una current por producto":
DROP INDEX idx_rates_product_current;
-- (a) una tarifa current por producto SIN variedad
CREATE UNIQUE INDEX uq_rates_product_current_no_variety
  ON rates (product_id) WHERE status = 'current' AND variety_id IS NULL;
-- (b) una tarifa current por (producto, variedad)
CREATE UNIQUE INDEX uq_rates_product_variety_current
  ON rates (product_id, variety_id) WHERE status = 'current' AND variety_id IS NOT NULL;
```

No hay backfill: las filas existentes quedan con `variety_id IS NULL` (tarifa de producto),
compatibilidad total (CA-24). El `amount CHECK > 0` y el patrón current/historical se conservan.

### 3.4 M3 — `blocks.variety_id` + trigger de validación (D-2, CA-13, CA-14)

```sql
ALTER TABLE blocks ADD COLUMN variety_id UUID; -- nullable; NULL para todos los blocks existentes

ALTER TABLE blocks ADD CONSTRAINT fk_blocks_variety_org
  FOREIGN KEY (variety_id, organization_id)
  REFERENCES product_varieties (id, organization_id) ON DELETE RESTRICT;

CREATE INDEX idx_blocks_variety ON blocks (variety_id) WHERE variety_id IS NOT NULL;
```

La invariante CA-14 (si el producto tiene variedades activas, `variety_id` es obligatorio y debe
pertenecer al producto; si no tiene, debe ser `NULL`) cruza tablas, así que un `CHECK` no basta.
Se enforza con un trigger `BEFORE INSERT OR UPDATE OF variety_id, product_id`:

```sql
CREATE OR REPLACE FUNCTION validate_block_variety()
RETURNS TRIGGER AS $$
DECLARE
  v_org UUID;
  v_has_active_varieties BOOLEAN;
  v_variety_product UUID;
BEGIN
  -- Resolver el tenant de forma robusta al ORDEN de triggers BEFORE (finding 3):
  -- en un INSERT desde el cliente, NEW.organization_id llega NULL y lo completa
  -- `set_organization_id` (trigger `trg_set_org_id_blocks`, BEFORE INSERT). PostgreSQL
  -- dispara los BEFORE del mismo nivel en orden alfabético por nombre; hoy
  -- `trg_set_org_id_blocks` < `trg_validate_block_variety`, así que el org ya estaría
  -- seteado. Para NO depender de ese orden (un renombrado futuro lo rompería en
  -- silencio), resolvemos aquí: si NEW.organization_id es NULL usamos current_org_id().
  v_org := COALESCE(NEW.organization_id, current_org_id());
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'ORG_CONTEXT_REQUIRED: no se pudo resolver organization_id del paño';
  END IF;

  -- ¿El producto del block tiene al menos una variedad activa?
  SELECT EXISTS (
    SELECT 1 FROM product_varieties pv
    WHERE pv.product_id = NEW.product_id
      AND pv.organization_id = v_org
      AND pv.status = 'active'
  ) INTO v_has_active_varieties;

  IF NEW.variety_id IS NOT NULL THEN
    -- La variedad debe existir, ser del mismo producto y del mismo tenant.
    SELECT pv.product_id INTO v_variety_product
    FROM product_varieties pv
    WHERE pv.id = NEW.variety_id AND pv.organization_id = v_org;
    IF v_variety_product IS NULL THEN
      RAISE EXCEPTION 'VARIETY_NOT_FOUND: variety % no existe en el tenant', NEW.variety_id;
    END IF;
    IF v_variety_product <> NEW.product_id THEN
      RAISE EXCEPTION 'VARIETY_PRODUCT_MISMATCH: la variedad no pertenece al producto del paño';
    END IF;
  ELSE
    -- Sin variedad: solo válido si el producto NO tiene variedades activas.
    IF v_has_active_varieties THEN
      RAISE EXCEPTION 'VARIETY_REQUIRED: el producto tiene variedades; debe elegir una';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_block_variety
  BEFORE INSERT OR UPDATE OF variety_id, product_id ON blocks
  FOR EACH ROW EXECUTE FUNCTION validate_block_variety();
```

**Dependencia de orden de triggers (finding 3) — resuelta por diseño, no por nombre.** La
función resuelve `v_org := COALESCE(NEW.organization_id, current_org_id())`, de modo que es
**correcta cualquiera sea el orden** en que PostgreSQL dispare los triggers `BEFORE` de `blocks`:
- En **INSERT** desde el cliente, aunque `trg_validate_block_variety` corriera *antes* que
  `trg_set_org_id_blocks` (p. ej. tras un renombrado), `NEW.organization_id` sería NULL y el
  `COALESCE` lo sustituye por `current_org_id()` (el mismo valor que el otro trigger escribiría),
  evitando el falso negativo silencioso (`VARIETY_NOT_FOUND` espurio / `VARIETY_REQUIRED` omitido)
  que la revisión señaló. Para un service-role/seed que trae `organization_id` explícito, el
  `COALESCE` toma ese valor y no llama a `current_org_id()`.
- En **UPDATE**, `set_organization_id` **no** se dispara (es `BEFORE INSERT` únicamente,
  verificado en `20260830000003`), pero la fila ya tiene `organization_id` no nulo, así que el
  `COALESCE` toma `NEW.organization_id` sin tocar `current_org_id()`.
Se **descartan** las alternativas (b) ordenar por nombre y (c) `CONSTRAINT TRIGGER DEFERRED`
porque (b) deja la corrección atada a una convención de nombres frágil y (c) difiere la
validación al COMMIT, cambiando la semántica de error (y `current_org_id()` seguiría siendo
necesaria). La opción (a) elegida es local a la función y robusta.

**Compatibilidad con blocks existentes (CA-24)**: el trigger solo corre en INSERT/UPDATE de
`variety_id`/`product_id`. Los blocks preexistentes (sin variedad, cuyos productos hoy no tienen
variedades) no se tocan en la migración, así que no fallan. El riesgo es: un admin crea una
variedad para un producto que ya tiene blocks sin variedad → esos blocks quedan "inválidos"
respecto a la nueva regla, pero el trigger **no** se dispara retroactivamente (no hay UPDATE).
Se cubre así: el registro de picking (§6) exige variedad resuelta solo cuando el block la tiene;
y la UI de "crear variedad" advierte (no bloquea) que los blocks existentes del producto deberán
asignarse una variedad para tarificar por variedad. Esto es intencional para no romper datos
(CA-24) y se documenta como regla de dominio (NFR-04).

*Reversibilidad*: `DROP TRIGGER ... ; DROP FUNCTION validate_block_variety; ALTER TABLE blocks
DROP COLUMN variety_id;`

### 3.5 M4 — `picking_records.payment_unit` + `paid_quantity_kg` (D-5, D-6, D-7, CA-04, CA-09)

```sql
-- Snapshot de la unidad de pago (reutiliza el enum existente unit_measure).
ALTER TABLE picking_records ADD COLUMN payment_unit unit_measure;
-- Kilos pagables (base de pago cuando payment_unit='kg'); NULL para 'box'.
ALTER TABLE picking_records ADD COLUMN paid_quantity_kg NUMERIC(10, 3);

-- Backfill: todos los registros existentes son por caja (Supuesto declarado del requisito).
UPDATE picking_records SET payment_unit = 'box' WHERE payment_unit IS NULL;

-- Ahora sí se puede exigir NOT NULL sin romper datos (CA-24).
ALTER TABLE picking_records ALTER COLUMN payment_unit SET NOT NULL;

-- Reglas de consistencia por unidad:
-- box -> paid_quantity_kg debe ser NULL; kg -> paid_quantity_kg > 0 obligatorio.
ALTER TABLE picking_records ADD CONSTRAINT chk_picking_paid_kg CHECK (
  (payment_unit = 'box' AND paid_quantity_kg IS NULL)
  OR (payment_unit = 'kg'  AND paid_quantity_kg IS NOT NULL AND paid_quantity_kg > 0)
);

CREATE INDEX idx_picking_payment_unit ON picking_records (payment_unit);
```

El orden backfill → NOT NULL → CHECK es obligatorio: se puebla `payment_unit='box'` **antes** de
`SET NOT NULL` y antes del CHECK (que para `'box'` exige `paid_quantity_kg IS NULL`, satisfecho
porque la columna nace NULL). Cumple CA-24. El invariante `quantity > 0` **no se toca** (el CHECK
existente se conserva); este diseño nunca permite `quantity` cero ni negativo (ver §6.3). Las
filas de auditoría (corrección) existentes también se backfillean a `'box'`; el código de
corrección (§5.3) copiará `payment_unit`/`paid_quantity_kg` del original en adelante.

### 3.6 M5 — feature flags (D-8, CA-20)

```sql
INSERT INTO platform_feature_flags (key, name, description, category, strategy, enabled) VALUES
  ('kg_payment', 'Pago por kilo',
   'Habilita productos por kilo (unit_measure=kg): captura de kilos pagables y cálculo de liquidación por kilo. Coexiste con el pago por caja.',
   'cosecha', 'org_override', false),
  ('product_varieties', 'Variedades de producto',
   'Habilita el catálogo de variedades bajo un producto, su asignación a paños y la tarifa por variedad.',
   'cosecha', 'org_override', false)
ON CONFLICT (key) DO NOTHING;
```

`ON CONFLICT (key) DO NOTHING` por la UNIQUE `uq_platform_feature_flags_key` (idempotente, igual
que `box_tare_control`). No se crea flag nuevo de destare: se reutiliza `box_tare_control` como
fuente del peso (D-8).

---

## 4. Capa compartida — `@fundo360/shared`

### 4.1 Tipos (`packages/shared/src/types/index.ts`)

Nueva interfaz:

```ts
/** Product variety (e.g. Frambuesa -> Heritage). Belongs to a product. */
export interface ProductVariety extends BaseEntity {
  organization_id: string;
  product_id: string;
  name: string;
  status: EntityStatus;
}
```

Extensiones a interfaces existentes:

```ts
// Block: añadir variety_id nullable (requerido cuando el producto tiene variedades activas).
export interface Block extends BaseEntity { /* ...existentes... */ variety_id: string | null; }
// Rate: añadir variety_id nullable. null = tarifa de producto. (ver Supuesto A sobre updated_at)
export interface Rate extends BaseEntity { /* ...existentes... */ variety_id: string | null; }
// PickingRecord: snapshot de unidad + kilos pagables.
export interface PickingRecord extends BaseEntity {
  /* ...existentes... */
  payment_unit: UnitMeasure;      // congelado al registrar
  paid_quantity_kg: number | null; // base de pago kg; null para box
}
```

`Product` y `Settlement` **no cambian de forma** (el producto ya tiene `unit_measure`; la
liquidación agrega por unidad en tiempo de cálculo, sin columna nueva).

### 4.2 Función de cálculo de pago (nueva, pura y testeable, NFR-05)

Fuente única de verdad para el subtotal de un registro, en `types/index.ts` (junto a
`evaluateBoxTolerance`):

```ts
export function pickingPayableBase(r: { payment_unit: UnitMeasure; quantity: number; paid_quantity_kg: number | null; }): number {
  return r.payment_unit === UnitMeasure.KG ? Number(r.paid_quantity_kg ?? 0) : Number(r.quantity);
}
export function pickingSubtotal(r: { payment_unit: UnitMeasure; quantity: number; paid_quantity_kg: number | null; rate_amount_snapshot: number; }): number {
  return Math.round(pickingPayableBase(r) * Number(r.rate_amount_snapshot) * 100) / 100;
}
```

Centraliza la ramificación box/kg (CA-01…CA-03). Redondeo `Math.round(x*100)/100` igual al patrón
actual (NFR-03). Las Edge Functions Deno **no importan** el paquete (como ya pasa con
`evaluateBoxTolerance`): se replica esta función inline en settlements/picking con comentario de
"mantener en sincronía".

### 4.3 Constantes y catálogo RBAC — rutas de archivo separadas (finding 2 de la Rev. 3)

Dos archivos distintos, **no** mezclar (verificado: `ERROR_CODES` y `FEATURE_FLAGS` viven en
`constants/index.ts`; el catálogo `CAPABILITIES`/`CAPABILITY_LABELS`/`ALL_CAPABILITIES` vive en
`types/index.ts`, líneas ~370–406):

**`packages/shared/src/constants/index.ts`** — se añaden:

- Nuevos `ERROR_CODES`: `VARIETY_NOT_FOUND`, `VARIETY_NOT_ACTIVE`, `VARIETY_PRODUCT_MISMATCH`,
  `VARIETY_REQUIRED`, `VARIETY_TENANT_MISMATCH`, `VARIETY_NAME_TAKEN` (nombre de variedad ya
  activo en el producto, §3.2), `KG_WEIGHT_REQUIRED` (producto kg sin kilos),
  `RATE_UNIT_SUBJECT_NOT_FOUND`.
- Claves de flag como constantes:

  ```ts
  export const FEATURE_FLAGS = { KG_PAYMENT: 'kg_payment', PRODUCT_VARIETIES: 'product_varieties', BOX_TARE_CONTROL: 'box_tare_control' } as const;
  ```

**`packages/shared/src/types/index.ts`** — se añaden: la interfaz `ProductVariety` (§4.1), las
extensiones a `Block`/`Rate`/`PickingRecord` (§4.1), `SettlementBreakdownLine` (§5.1), las
funciones puras de cálculo `pickingPayableBase`/`pickingSubtotal` y `resolveFeatureFlag`
(§4.2/§4.6).

**Decisión RBAC — NO se crea capability nueva (finding 1 de la Rev. 3).** El CRUD de variedades
**no** usa `requirePermission`; se autoriza únicamente con `requireRole(['admin'])`, que es el
patrón **real verificado** de los módulos análogos: `supabase/functions/products/index.ts` y
`supabase/functions/blocks/index.ts` gatean su POST/PUT/PATCH **solo** con
`requireRole(req, ['admin'])` (ninguno llama a `requirePermission`, pese a existir
`CAPABILITIES.PRODUCTS_MANAGE`). Por tanto el catálogo `CAPABILITIES` en `types/index.ts`
**no se toca**: no se añade `VARIETIES_MANAGE`, no cambian `CAPABILITY_LABELS` (que es un
`Record<Capability,string>` exhaustivo cuyo olvido rompería la compilación TS), ni
`ALL_CAPABILITIES`, ni `createPermissionProfileSchema` (`z.enum(ALL_CAPABILITIES …)`), ni la UI
de perfiles de permiso (KAN-5). Esto evita por completo el riesgo que señaló la revisión: un
`admin` con `permission_profile` restrictivo quedaría sin la capacidad en su claim `permissions`
del JWT (`has_permission()`, migración `20260927000002`) y el CRUD de variedades sería
**inaccesible** — con `requireRole(['admin'])` todo admin del tenant lo gestiona, sin reconfigurar
perfiles ni tocar claims (desbloquea US-05/US-06).

> *Alternativa descartada*: crear `CAPABILITIES.VARIETIES_MANAGE = 'varieties.manage'`. Obligaría
> a editar `types/index.ts` (clave + label exhaustivo), aceptar que `ALL_CAPABILITIES` y el
> `z.enum` la recogen automáticamente, exponerla en la UI de perfiles, y además especificar/validar
> que el claim JWT la incluye para admins sin perfil. Mayor superficie de cambio y riesgo de
> CRUD inaccesible, sin beneficio sobre el patrón `requireRole(['admin'])` ya usado por products/
> blocks. Se descarta.

### 4.4 Zod (`packages/shared/src/validation/index.ts`)

```ts
export const createProductVarietySchema = z.object({
  product_id: z.string().uuid(),
  name: z.string().min(1, 'Nombre de la variedad es requerido').max(100),
});
// createRateSchema: + variety_id?: uuid|null  (null/omitido = tarifa de producto)
// createBlockSchema: + variety_id?: uuid|null  (regla cruzada la valida el servidor)
```

Picking: se añade `manual_kg` opcional (`> 0`) a create/scan, **mutuamente excluyente** con
`gross_weight_kg` (refine). El cliente redondea `manual_kg` a 3 decimales
(`Math.round(x*1000)/1000`) antes de enviarlo y de calcular el estimado local (finding 4), para
que coincida con el valor que persiste la Edge Function (que vuelve a aplicar el mismo redondeo,
§5.2). **Importante (finding 3 previo)**: este schema Zod corre solo en el **cliente**
(web/móvil) como validación temprana; las Edge Functions Deno **no** importan Zod, así que la
exclusión mutua y "producto kg exige kilos" se **enforzan además dentro de la Edge Function**
(§5.2), que es la barrera real (necesita `unit_measure`, que Zod no conoce).

### 4.5 Barrel (`packages/shared/src/index.ts`)

Reexporta lo nuevo (ProductVariety, funciones de cálculo, schemas, FEATURE_FLAGS). Ya reexporta
`./types`, `./constants`, `./validation`.

### 4.6 Helper de flag compartido (deuda del steering)

El steering marca pendiente extraer el helper de resolución a `packages/shared`. Este diseño lo
extrae (la web necesita gating). Función pura reutilizable por móvil y web:

```ts
export function resolveFeatureFlag(globalEnabled?: boolean | null, orgOverride?: boolean | null): boolean {
  if (orgOverride === true || orgOverride === false) return orgOverride;
  return globalEnabled ?? false;
}
```

El hook móvil `useFeatureFlag` se refactoriza para usarla (sin cambio de comportamiento). La web
crea `apps/web/src/hooks/useFeatureFlag.ts` consumiendo el mismo helper.

---

## 5. Capa Edge Functions

### 5.1 Settlements — ramificación por unidad (CA-01…CA-06)

`settlements/index.ts` cambia en los **tres** puntos que hoy hacen `quantity ×
rate_amount_snapshot`: `handleGenerate`, `handleCrewGenerate` y el `breakdown` de `handleGetOne`.
En cada `select` de `picking_records` se añaden `payment_unit` y `paid_quantity_kg`, y el cálculo
usa la función replicada `pickingSubtotal` (§4.2):

```ts
// select: 'quantity, paid_quantity_kg, payment_unit, rate_amount_snapshot, ...'
const amount = pickingSubtotal(r); // box: quantity×rate ; kg: paid_quantity_kg×rate
if (amount <= 0) continue;
```

Regresión cero (NFR-01): para `payment_unit='box'`, `pickingSubtotal` devuelve exactamente
`quantity × rate_amount_snapshot`, idéntico a hoy. Como el backfill (M4) marca todos los
registros existentes como `'box'`, el `total_amount` recalculado coincide con el anterior → CA-01.
La agregación por sujeto de pago (worker/crew, nivel 1 y 2) no cambia → CA-06. El trigger
`prevent_paid_settlement_update` queda **intacto**; la generación crea settlements nuevos
`pending`, nunca modifica `paid` → CA-05.

El `breakdown` de `handleGetOne` devuelve por línea `payment_unit`, `base` (`quantity` o
`paid_quantity_kg`), `rate` y `subtotal`, para mostrar "cajas"/"kg" (US-03, US-04). Tipo en shared:

```ts
export interface SettlementBreakdownLine {
  work_day: string; block_name: string; row_name: string | null;
  product_name: string; variety_name: string | null;
  payment_unit: UnitMeasure; base: number; rate: number; subtotal: number;
}
```

**Embedding del `select` del breakdown (finding 2)**: el `select` actual verificado es
`'work_day, quantity, rate_amount_snapshot, blocks(name, products(name)), field_rows(name)'`. Se
**extiende** a
`'work_day, quantity, paid_quantity_kg, payment_unit, rate_amount_snapshot,
blocks(name, variety_id, products!fk_blocks_product_org(name), product_varieties!fk_blocks_variety_org(name)), field_rows(name)'`.
Los dos embeddings de `blocks` cuelgan de FK compuestas (`fk_blocks_product_org`,
`fk_blocks_variety_org`), por lo que **deben** llevar el hint de nombre de constraint para que
PostgREST resuelva la relación (misma razón que §5.2). `variety_name` se toma de
`product_varieties!fk_blocks_variety_org(name)` (puede ser `null` si el block no tiene variedad).

**Totales segmentados por unidad (finding 5)**: los agregados visibles del período no pueden
mezclar unidades. El breakdown ya separa `base`/`payment_unit` por línea; además, la respuesta del
settlement expone los totales así: el **total monetario** (`total_amount`) se suma **globalmente**
(los $ son conmensurables entre box y kg), mientras que los **conteos de unidades** se **segmentan
por `payment_unit`** (`units_by_unit: { box: Σ quantity, kg: Σ paid_quantity_kg }`). La UI presenta
"120 cajas + 340,5 kg" y un único total en $, nunca una suma sin sentido de cajas con kilos. Esto
aplica igual a `handleGetOne` (individual) y a los flujos de cuadrilla.

### 5.2 picking-records — resolución de tarifa, unidad y kilos (CA-07, CA-08, CA-18, D-9)

**Cableado del call path (finding 3)**. Hoy `handlePost`/`handleScan` solo arman
`{ boxTypeId, grossWeightKg }` y lo pasan a `createPickingRecord`; `manual_kg` no se lee nunca y
`unit_measure` no se consulta. Como §12 confirma que las Edge Functions **no** importan
`@fundo360/shared`/Zod, el `refine` de exclusión mutua de §4.4 **no corre en el servidor**: toda
la validación de kg se enforza **dentro de la función** (no en Zod). Cambios concretos:

- **`createPickingRecord` nueva firma**: se añade un parámetro
  `kg: { manualKg: number | null } = { manualKg: null }` (al lado del objeto `box` actual).
- **`handlePost`**: extrae `manual_kg` del body y lo pasa:
  `createPickingRecord(..., { boxTypeId: body.box_type_id ?? null, grossWeightKg: body.gross_weight_kg ?? null }, { manualKg: body.manual_kg ?? null })`.
- **`handleScan`**: idéntico, extrayendo `body.manual_kg` del cuerpo del scan.
- **`select` de `blocks` (finding 2 — cita exacta + hint de FK compuesta)**: el `select` real
  **completo** verificado hoy es
  `'id, status, product_id, name, field:fields(crew_mode_enabled, organization:organizations(crew_mode_enabled))'`
  — incluye el join anidado de `crew_mode` que alimenta `crew_mode_effective` (usado en la
  respuesta y en la liquidación de cuadrilla), y **no se debe eliminar**. Se **añade** `variety_id`
  y el embedding del producto. Como `blocks` referencia `products` por **FK compuesta**
  `fk_blocks_product_org (product_id, organization_id)` (la FK simple `blocks_product_id_fkey` fue
  DROPpeada en `20260829000005`), PostgREST **no puede inferir** la relación con `products(...)` a
  secas (riesgo de `PGRST200` "could not find a relationship" o ambigüedad). Se **debe** usar el
  hint de nombre de constraint. `select` resultante:

  ```
  'id, status, product_id, variety_id, name,
   field:fields(crew_mode_enabled, organization:organizations(crew_mode_enabled)),
   products!fk_blocks_product_org(unit_measure)'
  ```

  `paymentUnit = block.products.unit_measure`; `block.variety_id` puede ser `null`.

Flujo de `createPickingRecord` (manteniendo el flujo de destare actual):

1. **Producto/variedad/unidad del block**: del `select` extendido,
   `paymentUnit = block.products.unit_measure` y `block.variety_id` (puede ser `null`).
2. **Tarifa por sujeto (CA-18) — edición en lockstep con M2 (finding 4 del review previo)**: la consulta actual
   `rates.eq('product_id', block.product_id).eq('status','current').single()` **DEBE eliminarse**
   y reemplazarse por una resolución que incluya SIEMPRE el predicado de `variety_id`, porque tras
   M2 un producto puede tener a la vez una tarifa `current` de producto (`variety_id IS NULL`) y
   tarifas `current` por variedad; sin el predicado, un block sin variedad haría match de varias
   filas y `.single()` lanzaría `PGRST116` (500 latente). Resolución correcta:
   - con `block.variety_id` →
     `rates.eq('product_id', block.product_id).eq('variety_id', block.variety_id).eq('status','current').single()`;
   - sin variedad →
     `rates.eq('product_id', block.product_id).is('variety_id', null).eq('status','current').single()`.

   Sin fila → `NOT_FOUND` 404 ("No hay tarifa vigente…", contrato actual). `rate.amount` se congela
   en `rate_amount_snapshot` ($/caja o $/kg según `paymentUnit`, D-7, CA-04). El invariante
   `rate_amount_snapshot > 0` se preserva (viene de `rates.amount CHECK > 0`).
3. **Base de pago por unidad (enforzado en la función, no en Zod)**:
   - `box`: comportamiento actual intacto. `paid_quantity_kg = NULL`, `payment_unit='box'`. Los
     campos de kg (`grossWeightKg`/`manualKg`) son irrelevantes para el pago; el destare sigue
     calculando `net_weight_kg`/`out_of_tolerance` como auditoría, sin tocar el pago.
   - `kg` con caja (`box_type_id`+`gross_weight_kg`, y `manualKg` ausente): se evalúa tolerancia
     como hoy; `paid_quantity_kg = net_weight_kg = max(gross − tare, 0)`; `quantity` = nº de cajas
     pesadas (US-10, CA-07). Si `net ≤ 0` → `KG_WEIGHT_REQUIRED` 422.
   - `kg` manual (`manual_kg`, sin caja): `paid_quantity_kg = round3(manual_kg)`; `quantity = 1`
     (una entrega; respeta `quantity > 0`, CA-08, D-10). Si `manual_kg` falta o `≤ 0` →
     `KG_WEIGHT_REQUIRED` 422. **Redondeo a 3 decimales (finding 4)**: la Edge Function aplica
     `round3(x) = Math.round(x * 1000) / 1000` a `manual_kg` **antes** de persistir y de calcular
     el estimado, de modo que el valor guardado en `paid_quantity_kg NUMERIC(10,3)` coincida
     exactamente con el que el cliente ve (evita discrepancia de céntimos entre app y liquidación;
     consistente con `net_weight_kg`, que ya se calcula con `Math.round((gross-tare)*1000)/1000`).
     El cliente (web/móvil) aplica el mismo `round3` al mostrar el estimado.
   - **Exclusión mutua (en la función)**: si `paymentUnit='kg'` y vienen **ambos** `grossWeightKg`
     y `manualKg` → `VALIDATION_ERROR` 422 ("peso por caja y kilos manuales son excluyentes"); si
     `paymentUnit='kg'` y no viene **ninguno** (`net`/`manual_kg` ausentes o `≤ 0`) →
     `KG_WEIGHT_REQUIRED` 422.
4. **Persistir**: `payment_unit: paymentUnit, paid_quantity_kg: <según rama>` + campos de destare.
5. **Respuesta**: `estimated_payment = pickingSubtotal({ payment_unit, quantity, paid_quantity_kg,
   rate_amount_snapshot })` en vez de `quantity × rate`.

El CHECK `chk_picking_paid_kg` (M4) es la última barrera si la función tuviera un bug. La exclusión
mutua y el "kg exige kilos" viven en la función porque el `refine` de Zod (§4.4) sirve solo al
cliente web/móvil, no al runtime Deno.

**Validación de entradas**: `worker_id`/`block_id` (req, uuid, existe/activo → 404/409 existentes);
`quantity` (req, `> 0` → `QUANTITY_MUST_BE_POSITIVE` 422); `box_type_id`+`gross_weight_kg` (opt,
juntos, `> 0` → `VALIDATION_ERROR`/`WEIGHT_MUST_BE_POSITIVE` 422); `manual_kg` (opt, excl. con
gross, `> 0` → `KG_WEIGHT_REQUIRED` 422). **Logging**: 4xx de validación sin log (actual); error
de DB inesperado → `VALIDATION_ERROR` 400 (actual). Sin valores sensibles en logs (RUT/token).

### 5.2bis picking-records — `handleGetMy` (estimado del trabajador, CA-02, US-04, finding 1)

El handler `handleGetMy` (`GET /picking-records/my[/today]`) **también** ramifica box/kg; hoy
quedaba fuera del inventario y calcula `total_units`, `estimated_earnings` y el `subtotal` de cada
línea con `Number(r.quantity) × Number(r.rate_amount_snapshot)` sobre un `select` que trae
`id, block_id, row_id, quantity, rate_amount_snapshot, recorded_at, work_day, blocks(name),
field_rows(name, row_number)` — es decir, **sin** `payment_unit`/`paid_quantity_kg`. Sin
cambiarlo, el trabajador vería para un producto `kg` un estimado `quantity(=1 o nº cajas) × $/kg`
en lugar de `kilos × $/kg` (monto incorrecto; rompe CA-02 y US-04 en su pantalla). Cambios
concretos:

- **`select` extendido**: añadir `payment_unit, paid_quantity_kg` →
  `'id, block_id, row_id, quantity, paid_quantity_kg, payment_unit, rate_amount_snapshot,
  recorded_at, work_day, blocks(name), field_rows(name, row_number)'`.
- **`estimated_earnings`**: `Σ pickingSubtotal(r)` (función replicada inline, §4.2) en lugar de
  `Σ quantity × rate`. Para registros `box` el valor es idéntico a hoy (regresión cero).
- **`subtotal` por línea**: `pickingSubtotal(r)`; cada línea del arreglo `records` incluye además
  `payment_unit` y `base` (`pickingPayableBase(r)`: `quantity` para box, `paid_quantity_kg` para
  kg) para que la UI muestre "cajas"/"kg" correctamente.
- **`total_units` segmentado (finding 1 + finding 5)**: NO se puede sumar `quantity` de cajas con
  `paid_quantity_kg` de kg en un único escalar (mezcla unidades). Se reemplaza el `total_units`
  escalar por un agregado **segmentado por unidad**:

  ```ts
  // en lugar de total_units: number
  totals_by_unit: { box: number; kg: number } // Σ quantity (box) ; Σ paid_quantity_kg (kg)
  ```

  Los montos en $ (`estimated_earnings`) **sí** se suman globalmente (son conmensurables); los
  conteos de unidades se segmentan (p. ej. "120 cajas + 340,5 kg"). La UI del worker (§8) presenta
  ambos subtotales de unidad por separado y un único total en $.

Este handler se añade explícitamente al "Resumen de archivos a crear/modificar"
(`picking-records/index.ts`: create + scan + put + **getMy**).

### 5.3 picking-records — soft-update para kg (D-9, CA-04, finding 1 previo)

Hoy `handlePut` (a) **exige incondicionalmente** `body.quantity > 0`
(`QUANTITY_MUST_BE_POSITIVE`), (b) inserta un snapshot de auditoría copiando **solo** los campos
de caja/destare, y (c) hace `update({ quantity })` del original. Tras M4 esto rompe para `kg` (el
`quantity` está congelado en `1`, el edit de kilos se perdería, y el insert de auditoría fallaría
porque `payment_unit` pasa a ser `NOT NULL`). El nuevo contrato ramifica por `original.payment_unit`:

**Contrato de body del PUT por unidad**

| Unidad (`original.payment_unit`) | Campo requerido en el body | Reglas | Error |
|---|---|---|---|
| `box` | `quantity` (`> 0`) | `paid_quantity_kg` se fuerza a `NULL`; `quantity` ignorado si viene además | `QUANTITY_MUST_BE_POSITIVE` 422 si falta/`≤ 0` |
| `kg` | `paid_quantity_kg` (`> 0`) | `quantity` **no** se acepta/ignora (queda congelado); se actualiza solo `paid_quantity_kg` | `KG_WEIGHT_REQUIRED` 422 si falta/`≤ 0` |

La validación de arranque actual (`if (!body.quantity …)`) se **reemplaza** por esta ramificación:
primero se lee el `original` para conocer `payment_unit`, luego se valida el campo que corresponde
a esa unidad. (El orden cambia respecto a hoy: hoy valida antes de leer el original; ahora lee el
original primero para saber qué validar.)

**Insert del snapshot de auditoría — DEBE extenderse** (si no, falla tras `payment_unit NOT NULL`):
el objeto `insert({...})` actual añade dos campos copiados del original:
`payment_unit: original.payment_unit` y `paid_quantity_kg: original.paid_quantity_kg`. Así la fila
de auditoría satisface `chk_picking_paid_kg` para ambas unidades.

**Update in-place del original**:
- `box` → `update({ quantity: body.quantity })` (igual que hoy; `paid_quantity_kg` permanece `NULL`).
- `kg` → `update({ paid_quantity_kg: body.paid_quantity_kg })` (`quantity` no se toca).

`rate_amount_snapshot` y `payment_unit` **nunca** cambian en la corrección (regla de dominio 14,
inmutabilidad del snapshot). Se conservan sin cambios: la ventana "mismo work_day"
(`CORRECTION_OUTSIDE_WORKDAY` 409), el rechazo a corregir una fila de auditoría
(`original_record_id` no nulo) y el `recorded_by` desde el JWT. El CHECK `chk_picking_paid_kg` de
DB es la barrera dura si la función tuviera un bug.

### 5.4 Nueva función `varieties` (CRUD, CA-11, CA-26)

Módulo `supabase/functions/varieties/` según el patrón de `products`/`box-types`:

- `GET /varieties?product_id=X[&status=active|all]` — lista variedades de un producto.
  **`product_id` es OBLIGATORIO (finding 6 de la Rev. 2)**: si falta, la función responde
  `VALIDATION_ERROR` 422 (`product_id es requerido`). No existe el modo "todas las variedades del
  tenant": la UI siempre lista variedades dentro de un producto, así que un listado sin
  `product_id` es un error de uso, no un caso válido. Esto hace el endpoint determinista y evita
  paginar un universo mezclado de productos.
  **Default de `status` (finding 3 de la Rev. 3)**: `status` **omitido ⇒ `active`** para **todos**
  los roles (incluido admin); el valor `status=all` (devuelve activas + inactivas) **solo lo honra
  `admin`** — para un no-admin, `all` se ignora y la RLS `member_read_active_product_varieties`
  igualmente oculta las inactivas, de modo que siempre ve solo activas sea cual sea el parámetro.
  Un valor de `status` no reconocido (ni `active` ni `all`) ⇒ `VALIDATION_ERROR` 422. **Paginación
  obligatoria**: `limit` default **20**, máximo **100** (recortado a 100 si se pide más);
  `offset`/`page` según el patrón de los demás listados. Respuesta `{ success, data, meta }` con
  `meta = { page, total, limit }`.
- `GET /varieties/:id` — detalle.
- `POST /varieties` — crea (`requireRole(['admin'])` **únicamente**, sin `requirePermission`;
  mismo patrón que `products`/`blocks`, finding 1 de la Rev. 3). Body
  `createProductVarietySchema`; valida `product_id` del tenant; `organization_id` del token
  (trigger lo completa). Chequeo previo de nombre activo duplicado → `VARIETY_NAME_TAKEN` 409
  (§3.2).
- `PUT /varieties/:id` — `name`/`status` (admin). Desactivar variedad usada por blocks activos →
  409 con conteo salvo `force` (patrón de `blocks.handlePatchStatus`). Reactivar a un nombre ya
  activo del mismo producto → `VARIETY_NAME_TAKEN` 409 (§3.2).

**No existe DELETE físico de variedades (finding 7).** La baja de una variedad es siempre
`PUT /varieties/:id status=inactive` (soft-delete), consistente con `box_types`/`products`. Esto
es intencional y necesario: las tres FK que apuntan a `product_varieties`
(`fk_variety_product_org` interna, `fk_rates_variety_org`, `fk_blocks_variety_org`) son
`ON DELETE RESTRICT`, de modo que un `DELETE` físico chocaría contra cualquier tarifa histórica,
block o registro que la referencie. **No se debe implementar `DELETE /varieties/:id`**; si el
implementador necesita "quitar" una variedad, usa el soft-delete por `status`. El `RESTRICT` es la
red de seguridad que preserva la integridad histórica (snapshots de tarifa ya congelados).

RBAC (CA-26): la **gestión** (POST/PUT) es admin-only vía `requireRole(['admin'])` (sin
capability nueva; §4.3) y la policy `admin_all_product_varieties`. La **lectura** no-admin
(supervisor/crew_lead/worker, solo activas) va por `member_read_active_product_varieties`. Las
variedades no llevan tarifa, así que no exponen datos financieros al worker.

### 5.5 Función `rates` — tarifa por variedad (CA-16, CA-17, D-4)

- `POST /rates`: `variety_id` opcional. "Mark current as historical" acotado al **mismo sujeto**:
  con `variety_id` → `where product_id=X and variety_id=Y and status='current'`; sin variedad →
  `where product_id=X and variety_id IS NULL and status='current'`. Evita historizar la tarifa de
  producto al crear una de variedad (consistente con los índices parciales M2). Con `variety_id`,
  validar que exista en el tenant y pertenezca al producto (`VARIETY_PRODUCT_MISMATCH` 422 /
  `VARIETY_NOT_FOUND` 404). `amount > 0` se mantiene (CA-19).
- `GET /rates[/current]?product_id=X[&variety_id=Y]`: filtra por sujeto; sin `variety_id` → tarifa
  de producto.

### 5.6 Función `blocks` — `variety_id` (CA-13, CA-14, D-2)

- `POST`/`PUT /blocks[/:id]`: aceptan `variety_id`. El servicio hace **validación espejo** del
  trigger para devolver 422 legible (`VARIETY_REQUIRED`/`VARIETY_PRODUCT_MISMATCH`/
  `VARIETY_NOT_FOUND`); el trigger de DB M3 es la barrera dura. El `select` de respuesta añade
  la variedad embebida.
- `handleGetList`/`handleGetOne`: el `select` embebe producto + variedad + unidad. **Ambos
  embeddings cuelgan de FK compuestas** (`fk_blocks_product_org`, `fk_blocks_variety_org`), así
  que **deben** llevar el hint de nombre de constraint (finding 2), p. ej.
  `'..., variety_id, products!fk_blocks_product_org(name, unit_measure), product_varieties!fk_blocks_variety_org(name)'`.
  Escribir `products(...)`/`product_varieties(...)` sin hint puede fallar con `PGRST200` o quedar
  ambiguo. El implementador debe confirmar en runtime local (`supabase start`) que el embedding
  resuelve; si PostgREST infiere la FK compuesta sin ambigüedad, el hint es inocuo (sigue siendo
  la forma segura y recomendada).

### 5.7 Función `products` — decisión: mantener variedades separadas

`GET /products/:id` **no** embebe variedades; la pantalla llama a `GET /varieties?product_id=`.
Trade-off aceptado: un round-trip extra a cambio de endpoints cohesivos y cacheables por separado
con TanStack Query (patrón de un recurso por función).

---

## 6. Reglas de dominio consolidadas (pago por kilo)

- **6.1 Fórmula**: `subtotal = base × rate_amount_snapshot`, con `base = quantity`
  (payment_unit='box') o `base = paid_quantity_kg` (payment_unit='kg'). Congelado en el registro;
  la liquidación nunca recalcula contra el catálogo actual (CA-04, CA-09).
- **6.2 Origen de kilos (producto kg)**: destare activo → `paid_quantity_kg = net_weight_kg =
  max(gross − tare, 0)` (domain-rules §24); destare inactivo → `paid_quantity_kg = manual_kg`
  (`> 0`). `out_of_tolerance` sigue **no bloqueante** (CA-10).
- **6.3 `quantity` en registros kg (D-10)**: `quantity` **nunca** es 0 ni negativo. Con caja =
  nº de cajas pesadas; captura manual sin caja = `1` (una entrega). El pago usa
  `paid_quantity_kg`, no `quantity`.
- **6.4 Inmutabilidad y corrección**: `rate_amount_snapshot`, `payment_unit`, `paid_quantity_kg`
  son snapshots inmutables tras crear. La corrección (soft-update) crea fila de auditoría con los
  valores viejos y edita el original in-place; `payment_unit`/`rate_amount_snapshot` no cambian,
  solo `quantity` y (kg) `paid_quantity_kg`. Settlements `paid` siguen inmutables.

---

## 7. Capa web (`apps/web`)

Rutas: `(dashboard)/products`, `(dashboard)/fields/[id]/blocks/[blockId]`,
`(dashboard)/settlements`, `(dashboard)/records`. Gating con el nuevo
`apps/web/src/hooks/useFeatureFlag.ts` (usa `resolveFeatureFlag` de shared, §4.6).

- **Variedades bajo producto** (`product_varieties`): sub-sección "Variedades" en la pantalla de
  producto (listar/crear/editar/activar vía función `varieties`). Visible solo con el flag
  efectivo on (CA-21). Al crear la primera variedad, aviso de que los paños del producto deberán
  asignar variedad (§3.4).
- **Tarifa por variedad** (`product_varieties`): la gestión de tarifas permite elegir sujeto
  (Producto o variedad); historial por sujeto (US-06). Reusa `rates` con `variety_id`.
- **Variedad al crear/editar paño**: el formulario carga variedades activas del producto; si el
  producto tiene variedades, el campo es obligatorio (CA-14); si no, se oculta. Error 422 legible.
- **Unidad de pago**: `products` muestra `unit_measure`; `settlements` y `records` muestran unidad
  + base (cajas/kg) con el breakdown enriquecido (§5.1). El flag `kg_payment` controla **crear**
  productos `kg` (selector "kilo" habilitado solo con flag on, CA-21); los `box` existentes operan
  sin el flag.

Degradación limpia (CA-21): con ambos flags off, la web funciona como hoy (solo caja, sin UI de
variedades), sin errores.

## 8. Capa móvil (`apps/mobile`, Expo Router)

- **Admin** (`app/admin/products.tsx`): si `product_varieties` efectivo, gestión de variedades por
  producto (espejo mínimo de la web). Reusa `useFeatureFlag('product_varieties')`.
- **Registro** (`app/(tabs)/register.tsx`): la variedad **no** se pide al anotador; la determina el
  paño elegido (el servidor resuelve la tarifa de la variedad del block, US-08). El flujo ya carga
  `blocks` con `products(name, unit_measure)`; según `unit_measure`:
  - `box`: flujo actual (cajas; destare opcional si `box_tare_control`).
  - `kg` + `box_tare_control` on: captura `box_type_id` + `gross_weight_kg` (flujo de destare
    existente); el servidor deriva `paid_quantity_kg` del neto. Estimado en kg con `pickingSubtotal`.
  - `kg` + destare off: campo de **kilos** (`manual_kg`) en el paso de cantidad; estimado con la
    tarifa cacheada por producto.
  Gating con `useFeatureFlag('kg_payment')`: si off, no se ofrecen productos `kg`.
- **Producción/pagos del trabajador** (`production.tsx`, `payments.tsx`): muestran la unidad
  correcta (cajas/kg) y el valor (US-04). `picking-records/my` (§5.2bis) incluye
  `payment_unit`/`paid_quantity_kg` por línea y usa `pickingSubtotal` para `estimated_earnings`.
  Los conteos de unidades vienen **segmentados** (`totals_by_unit: { box, kg }`, finding 5): la
  pantalla muestra "N cajas + M kg" (nunca una suma mezclada) y un único total en $. Cada línea
  del detalle rotula su unidad con `payment_unit`/`base`.

Nota (local-env): no se añaden módulos nativos nuevos → no requiere recompilar en Xcode (solo-JS).

## 9. Multi-tenant, RBAC e invariantes

- Toda tabla/columna nueva cumple `database-migrations` (CA-23): UUID PK, snake_case,
  `created_at`/`updated_at` en `product_varieties`, índice en cada FK, FK compuesta de tenant con
  `UNIQUE (id, organization_id)`, RLS habilitada, trigger `set_organization_id`.
- Aislamiento (NFR-02): FKs compuestas `(variety_id, organization_id)` en `rates` y `blocks`
  impiden cruces de tenant; RLS por `organization_id` en `product_varieties`. El `organization_id`
  siempre del token (trigger), nunca del cliente.
- **Propiedad de invariantes (qué capa enforza qué)**:
  - "una current por sujeto de tarifa": **DB** (índices únicos parciales M2) — única capa que
    garantiza unicidad bajo concurrencia.
  - "block con variedad válida del producto": **DB** (trigger M3, barrera dura) + **Edge Function**
    (mensaje 422 legible).
  - "kg exige kilos pagables > 0": **DB** (CHECK `chk_picking_paid_kg`) + **Edge Function**
    (`KG_WEIGHT_REQUIRED`).
  - **"picking quantity > 0" y "rate > 0"**: **DB** (CHECKs existentes, sin cambios).
  - **"settlements paid inmutables"**: **DB** (`prevent_paid_settlement_update`), sin cambios.
  - **"gestión de tarifas solo admin" (finding 2)**: **RLS**. La policy existente
    `member_read_current_rates` (`20261002000002`) ya concede a `supervisor`/`crew_lead`/`worker`
    **lectura** de TODAS las tarifas `status='current'` de su organización (necesaria para que el
    supervisor congele `rate_amount_snapshot` al registrar). Tras M2, las tarifas `current` por
    variedad quedan en la misma tabla `rates`, así que **también son legibles** por esos roles bajo
    esa policy. La propiedad real que este diseño garantiza es: **la gestión** de tarifas
    (crear/historizar) es exclusiva de `admin` (`admin_all_rates`); **no** que las tarifas vigentes
    sean secretas para los miembros no-admin. Se **corrige** la afirmación previa de §9/CA-26: no se
    añade ninguna restricción RLS nueva sobre `rates`, y el estimado propio del worker se resuelve
    igual que hoy (el servidor usa `pickingSubtotal` con `rate_amount_snapshot` ya congelado; no
    depende de ocultar la tabla `rates`). domain-rules §19 ("datos financieros invisibles para el
    worker salvo su propio estimado") se interpreta como **gestión** y montos de liquidación de
    terceros, no como la tarifa vigente de catálogo, que la policy ya expone por diseño previo.

## 10. Casos borde

- Producto cambia `box` → `kg` (manual del admin): registros anteriores conservan
  `payment_unit='box'` congelado → no cambian de valor (CA-04). Fuera de alcance automatizar.
- Block de producto sin variedades y luego se crea una variedad: block queda sin variedad; no se
  rompe (trigger no corre retroactivamente). UI advierte; tarifica a nivel de producto hasta
  asignar variedad (§3.4).
- Variedad desactivada con blocks activos: `PUT /varieties/:id status=inactive` → 409 con conteo
  salvo `force` (§5.4). Registros ya hechos conservan su snapshot.
- `manual_kg` y `gross_weight_kg` ambos presentes en producto `kg`: rechazo **en la Edge Function**
  (`VALIDATION_ERROR` 422, §5.2 paso 3); el `refine` de Zod solo cubre el cliente web/móvil, no el
  runtime Deno (finding 3).
- `net_weight_kg = 0` en producto kg: `KG_WEIGHT_REQUIRED` 422 (no se paga 0 kg); no se guarda.
  (Para box, net=0 se permite hoy como auditoría; esa rama no cambia.)
- Tarifa de variedad inexistente al registrar: `NOT_FOUND` 404 (contrato actual, CA-18).

## 11. Testabilidad (NFR-05)

- **Unit (shared, Vitest)**: `pickingPayableBase`, `pickingSubtotal`, `resolveFeatureFlag` son
  puras → tests directos. Property-based: `box` → `pickingSubtotal === quantity × rate` (CA-01);
  `kg` → `=== paid_quantity_kg × rate`; invariantes `quantity > 0`, `paid_quantity_kg > 0` en kg.
- **Integración (Edge Functions)**: con `supabase start` local (local-env: Rancher en dockerd
  (moby)). Casos: crear producto kg + variedad + tarifa; registrar en block con variedad; kg con
  destare (paid=net) y manual (paid=manual_kg); liquidación mixta box+kg; corrección kg.
  Regresión: liquidación 100% box reproduce `total_amount` previo (seed).
- **Resolución de tarifa coexistente (finding 4)**: un producto con tarifa `current` de producto
  (`variety_id IS NULL`) **y** tarifa `current` de variedad. Verificar que un block **sin**
  variedad resuelve la de producto y un block **con** variedad resuelve la suya, y que la vieja
  consulta `product_id`-only + `.single()` habría lanzado `PGRST116` (prueba de no-regresión).
- **DB (migraciones)**: `supabase db reset` aplica M1–M5; verificar que datos existentes (seed)
  sobreviven el backfill sin cambio de valor (CA-24, NFR-01) y que los índices únicos parciales
  rechazan dos `current` del mismo sujeto.
- **Difícil de automatizar**: UI de captura móvil (device/Expo) y resolución de flags E2E → pruebas
  manuales guionadas (TEST_USERS.md) y Playwright en web si el flujo lo amerita.

## 12. Supuestos declarados y precisiones

- **Supuesto A (verificado)**: `rates` **no** tiene `updated_at` (solo `created_at`), aunque la
  interfaz `Rate` declara `extends BaseEntity`. Este diseño **no** añade `updated_at` a `rates`
  (fuera de alcance; no tocar una tabla financiera sin necesidad). Si la revisión exige coherencia,
  sería migración separada; se deja como nota. La extensión de `Rate` en shared solo añade
  `variety_id`.
- **Supuesto B (del requisito, no verificable en datos)**: no hay productos `kg` ni variedades en
  producción; todos los registros son `box`. El backfill M4 se apoya en esto. Registros con
  producto `kg` previos (no debería haberlos) quedarían `payment_unit='box'` (su
  `rate_amount_snapshot` ya es $/caja de facto) — correcto: congela el pasado como fue.
- **Supuesto C**: `field_rows` no reciben producto/variedad (CA-15); heredan del block.
- **Precisión a D-10**: `quantity = 1` para captura manual sin caja (el requisito dejaba abierto
  "nº de entregas" o 1). Elegimos `1` por simplicidad; el pago kg no depende de `quantity`.
- **Precisión a D-6**: `payment_unit` es `NOT NULL` tras el backfill (no nullable); simplifica la
  ramificación y el CHECK.
- **Edge Functions no importan `@fundo360/shared`** (limitación Deno vigente): las funciones puras
  de cálculo se **replican** inline (como `evaluateBoxTolerance` hoy), con comentario de "mantener
  en sincronía". Patrón vigente, no regresión.

## 13. Documentación (NFR-04)

Al implementar, actualizar (steering `documentation`): `docs/dominio/reglas-de-negocio.md` (pago
por unidad y variedades; reinterpretar §26 destare→base de pago kg), `docs/api/vision-general.md`
(endpoints `varieties`, `rates?variety_id`, `blocks.variety_id`, picking kg),
`docs/legacy/decisiones-negocio.md` (cerrar decisiones 1 y 4), mover F-01/F-05 en
`docs/planning/tablero.md`, entrada en `CHANGELOG.md` + `docs/changelog.md`.

---

## Resumen de archivos a crear/modificar

**Migraciones (crear)**: `supabase/migrations/20261003000001…05_*.sql` (M1–M5, §3).

**Shared (modificar)**: `packages/shared/src/types/index.ts` (ProductVariety; extender
Block/Rate/PickingRecord; `pickingPayableBase`/`pickingSubtotal`; `SettlementBreakdownLine`;
`resolveFeatureFlag`), `constants/index.ts` (**solo** `ERROR_CODES` y `FEATURE_FLAGS` — NO se
añade capability; §4.3), `validation/index.ts` (createProductVarietySchema; extender
createRateSchema/createBlockSchema; `manual_kg` en picking), `index.ts` (barrel). El catálogo
`CAPABILITIES` (en `types/index.ts`) **no se modifica**: el CRUD de variedades usa
`requireRole(['admin'])`, no una capability nueva.

**Edge Functions**: crear `supabase/functions/varieties/`; modificar `rates/index.ts`,
`blocks/index.ts`, `picking-records/index.ts` (**create + scan + put + getMy** — ver §5.2bis para
`handleGetMy`), `settlements/index.ts` (generate, crew-generate, getOne). Replicar `pickingSubtotal`
y `pickingPayableBase` donde se usen (patrón Deno inline, §4.2).

**Web**: `apps/web/src/hooks/useFeatureFlag.ts` (nuevo); pantallas `products`, block create/edit,
rates (sujeto variedad), `settlements`/`records` (unidad+base).

**Móvil**: `app/admin/products.tsx` (variedades), `app/(tabs)/register.tsx` (captura kg/manual),
`app/(tabs)/production.tsx` y `payments.tsx` (unidad correcta); refactor
`src/hooks/useFeatureFlag.ts` para usar `resolveFeatureFlag`.

---

## Respuestas a la revisión de diseño (Rev. 3 → Rev. 4, `design-review.json` vigente)

Revisión de la Rev. 3: `CHANGES_REQUESTED` — 0 HIGH, 1 MEDIUM (1), 2 NIT (2–3). Todos
**resueltos** en esta Rev. 4. Verificados leyendo el código real: `CAPABILITIES` y su cableado
exhaustivo (`CAPABILITY_LABELS`, `ALL_CAPABILITIES`) en `packages/shared/src/types/index.ts`
(líneas ~370–406); `ERROR_CODES`/`FEATURE_FLAGS` en `packages/shared/src/constants/index.ts`; y
el patrón de autorización de `supabase/functions/products/index.ts` y
`supabase/functions/blocks/index.ts` (ambos gatean POST/PUT/PATCH con **solo**
`requireRole(req, ['admin'])`, sin `requirePermission`).

| # | Sev | Resolución |
|---|-----|-----------|
| 1 | MEDIUM | **Resuelto en §4.3, §5.4 y Resumen de archivos.** Se adopta la decisión recomendada: **NO se crea** la capability `VARIETIES_MANAGE`. El CRUD de variedades se autoriza **solo** con `requireRole(['admin'])`, idéntico al patrón real verificado de `products` y `blocks` (ninguno usa `requirePermission`). En consecuencia el catálogo `CAPABILITIES` en `types/index.ts` **no se toca** (sin cambios en `CAPABILITY_LABELS` exhaustivo, `ALL_CAPABILITIES`, `createPermissionProfileSchema` ni la UI de perfiles KAN-5). Esto elimina el riesgo señalado de CRUD **inaccesible** para un admin con perfil restrictivo (el claim `permissions` del JWT no entra en juego). Se corrigió también la ruta de archivo errónea (`constants/index.ts`) de la Rev. 3 y la línea RBAC de §5.4 (`base role admin + capability` → `requireRole(['admin'])` + policy `admin_all_product_varieties`). Alternativa (crear `VARIETIES_MANAGE` en `types/index.ts` con todo su efecto en cadena y el cableado del claim) documentada y **descartada**. |
| 2 | NIT | **Resuelto en §4.3 (reescrito) y Resumen de archivos.** Se separan explícitamente las rutas de archivo: `ERROR_CODES` y `FEATURE_FLAGS` → `packages/shared/src/constants/index.ts`; `ProductVariety`, las extensiones de `Block`/`Rate`/`PickingRecord`, `SettlementBreakdownLine` y las funciones de cálculo (`pickingPayableBase`/`pickingSubtotal`/`resolveFeatureFlag`) → `packages/shared/src/types/index.ts`. El catálogo `CAPABILITIES` queda intacto en `types/index.ts` (ver finding 1). |
| 3 | NIT | **Resuelto en §5.4.** `GET /varieties`: `status` **omitido ⇒ `active`** para todos los roles; `status=all` **solo lo honra `admin`** (para no-admin la RLS `member_read_active_product_varieties` oculta las inactivas igualmente); valor inválido de `status` ⇒ `VALIDATION_ERROR` 422. Paginación obligatoria `limit` default **20** / máx **100**, `meta = { page, total, limit }`. |

---

## Respuestas a la revisión de diseño (Rev. 2 → Rev. 3, historial)

Revisión de la Rev. 2: `CHANGES_REQUESTED` — 0 HIGH, 3 MEDIUM (1–3), 4 NIT (4–7). Todos
**resueltos** en esta Rev. 3. Verificados contra el código real (`picking-records/index.ts`,
`settlements/index.ts`, migración `20260830000003` del trigger `set_organization_id`).

| # | Sev | Resolución |
|---|-----|-----------|
| 1 | MEDIUM | **Resuelto con §5.2bis nuevo.** `handleGetMy` se incorpora al inventario Edge y al "Resumen de archivos" (create + scan + put + **getMy**). Su `select` se extiende con `payment_unit, paid_quantity_kg`; `estimated_earnings` y el `subtotal` por línea pasan a `pickingSubtotal`; el escalar `total_units` se reemplaza por `totals_by_unit: { box, kg }` (segmentado por unidad), porque mezclar cajas y kg no tiene sentido. Para `box` el resultado es idéntico a hoy (regresión cero). |
| 2 | MEDIUM | **Resuelto en §5.2, §5.1 y §5.6.** Se cita el `select` real **completo** de `blocks` (incluido el join anidado de `crew_mode`, que **no** se elimina) y se añade `variety_id` + el embedding de producto con **hint de constraint explícito** (`products!fk_blocks_product_org(...)`), por ser FK compuesta (riesgo `PGRST200`). El mismo hint se aplica al breakdown de settlements (`products!fk_blocks_product_org`, `product_varieties!fk_blocks_variety_org`) y a `blocks` list/get. |
| 3 | MEDIUM | **Resuelto en §3.4.** La función `validate_block_variety` resuelve `v_org := COALESCE(NEW.organization_id, current_org_id())`, lo que la hace **correcta con cualquier orden** de disparo de los triggers `BEFORE` (en INSERT desde cliente, aunque corriera antes que `trg_set_org_id_blocks`; en UPDATE, `set_organization_id` no se dispara pero la fila ya trae org). Se documentó la dependencia y se descartaron las alternativas (b) orden por nombre y (c) CONSTRAINT TRIGGER DEFERRED con su razón. Nuevo error `ORG_CONTEXT_REQUIRED` si no hay org resoluble. |
| 4 | NIT | **Resuelto en §5.2 (paso 3) y §4.4.** `manual_kg` se redondea a 3 decimales (`Math.round(x*1000)/1000`) tanto en el cliente (antes de enviar y de estimar) como en la Edge Function (antes de persistir y estimar), para que el valor en `paid_quantity_kg NUMERIC(10,3)` coincida con lo que ve el usuario. Consistente con `net_weight_kg`. |
| 5 | NIT | **Resuelto en §5.1, §5.2bis y §8.** Los totales monetarios ($) se suman globalmente (conmensurables); los conteos de unidades se **segmentan por `payment_unit`** (`units_by_unit`/`totals_by_unit: { box, kg }`), tanto en el breakdown/respuesta de settlement (individual y cuadrilla) como en la producción del worker. La UI muestra "N cajas + M kg" y un único total en $. |
| 6 | NIT | **Resuelto en §5.4.** `GET /varieties` exige `product_id`: si falta → `VALIDATION_ERROR` 422. No existe el modo "todas las variedades del tenant" (la UI siempre lista dentro de un producto); el endpoint queda determinista. |
| 7 | NIT | **Resuelto en §5.4.** Se afirma explícitamente que **no existe DELETE físico** de variedades: la baja es `PUT status=inactive` (soft-delete), consistente con `box_types`/`products`; las FK `ON DELETE RESTRICT` protegen tarifas históricas, blocks y registros. Se instruye a no implementar `DELETE /varieties/:id`. |

---

## Respuestas a la revisión de diseño anterior (Rev. 1 → Rev. 2, historial)

Revisión previa: `CHANGES_REQUESTED` — 0 HIGH, 4 MEDIUM (1–4), 2 NIT (5–6). Todos **resueltos**.

| # | Sev | Resolución |
|---|-----|-----------|
| 1 | MEDIUM | **Resuelto en §5.3.** Se definió el contrato de `PUT /picking-records/:id` por unidad: `box` → `quantity > 0` requerido (`paid_quantity_kg=NULL`); `kg` → `paid_quantity_kg > 0` requerido (`KG_WEIGHT_REQUIRED` 422), `quantity` congelado. Se especificó que la validación de arranque ramifica tras leer el `original`, que el insert del snapshot de auditoría **debe** añadir `payment_unit`/`paid_quantity_kg` (si no, falla con `payment_unit NOT NULL`), y que el update in-place toca `quantity` (box) o `paid_quantity_kg` (kg); `rate_amount_snapshot`/`payment_unit` nunca cambian. |
| 2 | MEDIUM | **Resuelto en §9 (bullet reescrito).** Se corrigió la afirmación de confidencialidad: `member_read_current_rates` ya permite a supervisor/crew_lead/worker leer todas las tarifas `current` del tenant, y tras M2 también las de variedad. La propiedad garantizada es que la **gestión** de tarifas es admin-only (`admin_all_rates`), no que las tarifas vigentes sean secretas. No se añade RLS nueva; el estimado del worker se resuelve server-side con el snapshot ya congelado. CA-26 reinterpretado en consecuencia. |
| 3 | MEDIUM | **Resuelto en §5.2 (bloque "Cableado del call path") y §10.** Se especificó la nueva firma de `createPickingRecord` con `kg.manualKg`, la extracción de `body.manual_kg` en `handlePost` y `handleScan`, la extensión del `select` de `blocks` a `variety_id, products(unit_measure)`, y que la exclusión mutua + "kg exige kilos" se enforzan **dentro de la función** (no en Zod, que no corre en Deno). |
| 4 | MEDIUM | **Resuelto en §5.2 paso 2 (marcado "edición en lockstep con M2").** Se declara obligatorio eliminar la consulta `product_id`-only + `.single()` y añadir SIEMPRE el predicado de `variety_id` (`.is('variety_id', null)` sin variedad / `.eq('variety_id', …)` con variedad) para evitar el `PGRST116` latente cuando coexistan tarifa de producto y de variedad. Se añadió el caso de test correspondiente en §11. |
| 5 | NIT | **Resuelto en §3.** Nota explícita de que el diseño **sobrescribe conscientemente** las reglas 1 y 3 del steering `database-migrations` (el template Knex `.ts` es ilustrativo; el estándar real es SQL puro + `supabase db reset`), manteniendo reglas 5/6/7/9/10. |
| 6 | NIT | **Resuelto en §3.2.** Regla de unicidad de nombre explícita: único entre variedades **activas** por producto; nombre liberado al desactivar; reactivación/creación que colisione con un nombre activo → `VARIETY_NAME_TAKEN` 409 (comprobación previa en Edge Function + índice parcial como barrera dura). Nuevo `ERROR_CODES.VARIETY_NAME_TAKEN` añadido en §4.3. |

**Supuestos sin verificar que se conservan** (de la sección "Unverified" de la revisión):
- Supuesto B (no hay productos `kg` ni variedades en producción; el backfill M4 marca todo `box`):
  no verificable desde migraciones; se mantiene declarado en §12. El backfill solo es seguro si es
  cierto; es aceptable como supuesto porque el enum `unit_measure` existe pero ningún flujo
  escribía `kg` hasta este cambio.
- Edge Functions no importan `@fundo360/shared` (limitación Deno): confirmado por la revisión como
  patrón real (`evaluateBoxTolerance` ya replicado inline). Se mantiene la réplica inline de
  `pickingSubtotal` con comentario "mantener en sincronía" y el test de regresión box de §11 como
  red de seguridad.
