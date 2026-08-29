# Design Document

## Overview

Este documento detalla el diseño técnico para transformar el Sistema de Control de Picking en una plataforma SaaS multi-tenant, añadir el nivel jerárquico opcional "Encargado" (Capataz) con liquidación en dos niveles, e introducir un rol de Administrador de Plataforma con control transversal.

El enfoque elegido es **tenant compartido con `organization_id` + Row Level Security (RLS)**: una sola base de datos PostgreSQL donde cada tabla de dominio incluye una columna `organization_id`, y todas las políticas RLS filtran por la organización del usuario (resuelta desde un claim del JWT). Un Administrador de Plataforma puede saltarse este aislamiento de forma centralizada y auditable.

Este enfoque es la evolución natural del diseño actual, que ya usa RLS y claims JWT (`app_role`, `worker_id`) para autorización.

### Alcance de la decisión

| Decisión | Elección | Alternativas descartadas |
|----------|----------|--------------------------|
| Estrategia multi-tenant | `organization_id` compartido + RLS | Schema por cliente; proyecto Supabase por cliente (costo/operación no escalan) |
| Nivel Encargado | Rol `crew_lead` + tabla `crews`, opcional | Reutilizar `supervisor_assignments` (mezcla conceptos supervisión/cuadrilla) |
| Activación del Modo Capataz | Por campo, con default por organización | Solo por organización (no cubre campos pequeños dentro del mismo cliente) |
| Rol de plataforma | Tabla `platform_admins` separada + claim JWT + bypass RLS | Añadir un valor más al enum de rol intra-tenant (rompe el modelo de aislamiento) |
| Etiquetas de rol | `organizations.role_labels` (JSONB), solo UI | Renombrar el enum (rompería seguridad y jerarquía) |

## Architecture

Se mantiene la arquitectura de 3 capas (Clientes → Edge Functions → PostgreSQL con RLS). Los cambios son transversales:

```
┌───────────────────────────────────────────────────────────────┐
│                          CLIENTES                              │
│  Web (Admin/Supervisor)   Mobile (Supervisor/Encargado/Trab.)  │
│  + Consola de Plataforma (Platform Admin)                      │
└───────────────┬───────────────────────────────────────────────┘
                │  JWT: { app_role, worker_id, org_id, is_platform_admin }
                ▼
┌───────────────────────────────────────────────────────────────┐
│                  Supabase Edge Functions                       │
│  requireRole + requireOrg + (opcional) impersonación soporte   │
└───────────────┬───────────────────────────────────────────────┘
                ▼
┌───────────────────────────────────────────────────────────────┐
│                   PostgreSQL + RLS                             │
│  Cada tabla: organization_id  →  RLS: org = current_org_id()   │
│                                   OR is_platform_admin()       │
└───────────────────────────────────────────────────────────────┘
```

### Capas de seguridad

1. **RLS (primaria)**: cada política combina el predicado de rol/asignación existente con el predicado de tenant `organization_id = current_org_id()`, más el bypass `OR is_platform_admin()`.
2. **Edge Functions (secundaria)**: `requireRole` (existente) + un nuevo helper `requireOrg` que valida que el recurso solicitado pertenezca a la organización del token.

## Data Model

### Diagrama de relaciones (nuevas entidades en **negrita**)

```
                         ┌──────────────────┐
                         │ platform_admins  │  (fuera de tenant)
                         └──────────────────┘
                                  │ bypass
                                  ▼
┌──────────────────┐      ┌──────────────────┐
│  **organizations** │◄────│   (todas las      │
│  branding,         │  1:N│    tablas de      │
│  subscription,     │─────│    dominio con    │
│  crew_mode default,│     │  organization_id) │
│  role_labels       │     └──────────────────┘
└──────────────────┘
        │
        ├── workers (role: admin|supervisor|crew_lead|worker)
        ├── fields (crew_mode_enabled override)
        ├── blocks ─ products ─ rates
        ├── **crews** (crew_lead_id → workers)  ← workers.crew_id
        ├── supervisor_assignments
        ├── picking_records
        ├── settlements (payee_type: worker|crew, crew_id?)
        └── payments
```

### Nueva tabla: `organizations`

El tenant. Contiene branding, suscripción, default de Modo Capataz y etiquetas de rol.

```sql
CREATE TYPE subscription_status AS ENUM ('trial', 'active', 'suspended', 'cancelled');

CREATE TABLE organizations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  VARCHAR(150) NOT NULL,
  slug                  VARCHAR(80) NOT NULL UNIQUE,          -- identificador url-safe
  logo_url              TEXT,
  brand_primary_color   VARCHAR(9),                           -- #RRGGBB(AA)
  brand_secondary_color VARCHAR(9),
  subscription_status   subscription_status NOT NULL DEFAULT 'trial',
  subscription_plan     VARCHAR(50),
  crew_mode_enabled     BOOLEAN NOT NULL DEFAULT false,       -- default de Modo_Capataz
  role_labels           JSONB NOT NULL DEFAULT '{}'::jsonb,   -- {"crew_lead":"Capataz", ...}
  status                entity_status NOT NULL DEFAULT 'active',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Notas:
- `role_labels` mantiene la jerarquía y la seguridad fijas; solo cambia lo que se muestra en la UI. Claves válidas: `admin`, `supervisor`, `crew_lead`, `worker`.
- `crew_mode_enabled` es el default de la organización; cada `field` puede sobreescribirlo.

### Nueva tabla: `platform_admins`

Rol de plataforma, **fuera** de cualquier tenant. Deliberadamente separado del enum `worker_role`.

```sql
CREATE TABLE platform_admins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id  UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     VARCHAR(150) NOT NULL,
  status        entity_status NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Nueva tabla: `crews` (Cuadrilla)

Existe solo cuando el Modo Capataz está activo. Agrupa trabajadores bajo un `crew_lead`.

```sql
CREATE TABLE crews (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  crew_lead_id     UUID NOT NULL REFERENCES workers(id) ON DELETE RESTRICT,  -- rol crew_lead
  name             VARCHAR(120) NOT NULL,   -- ej. "Furgón 3"
  status           entity_status NOT NULL DEFAULT 'active',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crews_organization ON crews (organization_id);
CREATE INDEX idx_crews_lead ON crews (crew_lead_id);
```

### Nueva tabla: `platform_audit_log` (auditoría de plataforma)

Registra accesos/cambios del Administrador de Plataforma sobre datos de clientes.

```sql
CREATE TABLE platform_audit_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_admin_id   UUID NOT NULL REFERENCES platform_admins(id) ON DELETE RESTRICT,
  organization_id     UUID REFERENCES organizations(id) ON DELETE SET NULL,
  action              VARCHAR(80) NOT NULL,   -- ej. "impersonate", "update_field"
  resource            VARCHAR(120),
  detail              JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_audit_admin ON platform_audit_log (platform_admin_id);
CREATE INDEX idx_platform_audit_org ON platform_audit_log (organization_id);
```

### Cambios a tablas existentes

**Enum `worker_role`** — añadir `crew_lead` entre supervisor y worker:

```sql
ALTER TYPE worker_role ADD VALUE 'crew_lead' AFTER 'supervisor';
```

**Columna `organization_id` en todas las tablas de dominio** (NOT NULL, FK a `organizations`, con índice):

`products`, `fields`, `blocks`, `rates`, `workers`, `supervisor_assignments`, `picking_records`, `settlements`, `payments`.

```sql
-- Patrón aplicado a cada tabla (ejemplo con workers):
ALTER TABLE workers ADD COLUMN organization_id UUID REFERENCES organizations(id) ON DELETE RESTRICT;
-- Backfill a organización semilla (ver Migración), luego:
ALTER TABLE workers ALTER COLUMN organization_id SET NOT NULL;
CREATE INDEX idx_workers_organization ON workers (organization_id);
```

**`fields`** — override de Modo Capataz por campo:

```sql
ALTER TABLE fields ADD COLUMN crew_mode_enabled BOOLEAN;  -- NULL = hereda de organizations.crew_mode_enabled
```

**`workers`** — pertenencia a cuadrilla (opcional):

```sql
ALTER TABLE workers ADD COLUMN crew_id UUID REFERENCES crews(id) ON DELETE SET NULL;
CREATE INDEX idx_workers_crew ON workers (crew_id);
```

**`settlements`** — soportar liquidación a nivel de cuadrilla (pago del cliente al encargado) además del trabajador individual:

```sql
CREATE TYPE settlement_payee_type AS ENUM ('worker', 'crew');

ALTER TABLE settlements ADD COLUMN payee_type settlement_payee_type NOT NULL DEFAULT 'worker';
ALTER TABLE settlements ADD COLUMN crew_id UUID REFERENCES crews(id) ON DELETE RESTRICT;
-- worker_id pasa a ser NULL cuando payee_type = 'crew'; crew_id NULL cuando payee_type = 'worker'
ALTER TABLE settlements ALTER COLUMN worker_id DROP NOT NULL;
ALTER TABLE settlements ADD CONSTRAINT chk_settlement_payee CHECK (
  (payee_type = 'worker' AND worker_id IS NOT NULL AND crew_id IS NULL) OR
  (payee_type = 'crew'   AND crew_id  IS NOT NULL AND worker_id IS NULL)
);
```

> Nota de compatibilidad RLS: la política existente `worker_read_own_settlements` compara `worker_id = current_worker_id()`. Al volver `worker_id` nullable, esa comparación sigue siendo correcta: matchea las liquidaciones individuales del trabajador y simplemente no matchea las filas de cuadrilla (`payee_type='crew'`, `worker_id IS NULL`), que es el comportamiento deseado.

`payments` sigue vinculado a `settlement_id`; adquiere `organization_id` para el filtro de tenant. Los pagos del encargado a sus trabajadores usan `settlements` con `payee_type = 'worker'` dentro del alcance del encargado.

### Restricción de integridad de tenant

Para prevenir "cruces" de tenant por FK (ej. un `picking_record` de la org A apuntando a un `block` de la org B), las FKs entre tablas de dominio deben validar organización coincidente. Se implementa con FKs compuestas usando claves únicas `(id, organization_id)`:

```sql
-- Ejemplo: garantizar que picking_records.block_id y su organization_id coincidan
ALTER TABLE blocks ADD CONSTRAINT uq_blocks_id_org UNIQUE (id, organization_id);
ALTER TABLE picking_records
  ADD CONSTRAINT fk_picking_block_org
  FOREIGN KEY (block_id, organization_id) REFERENCES blocks (id, organization_id);
```

Se aplica el mismo patrón a las FKs cross-table relevantes (workers↔crews, blocks↔fields, rates↔products, settlements↔workers/crews, payments↔settlements).

## Authentication & Authorization

### Claims del JWT

`custom_access_token_hook` se extiende para inyectar dos claims nuevos:

```
{
  "app_role": "admin|supervisor|crew_lead|worker",   // existente
  "worker_id": "<uuid>",                              // existente
  "org_id": "<uuid>",                                 // NUEVO: organización del worker
  "is_platform_admin": true|false                     // NUEVO: rol de plataforma
}
```

Lógica del hook:
1. Buscar en `platform_admins` por `auth_user_id`. Si existe y está activo → `is_platform_admin = true`.
2. Buscar en `workers` por `auth_user_id` (activo) → setear `app_role`, `worker_id`, `org_id` (desde `workers.organization_id`).
3. Si no hay worker ni platform admin → sin `org_id`; el acceso a dominio queda denegado por RLS (Req. 1.5).

### Nuevos helpers SQL

```sql
-- Organización del usuario actual (desde el claim)
CREATE OR REPLACE FUNCTION public.current_org_id()
RETURNS UUID AS $$ SELECT (auth.jwt() ->> 'org_id')::UUID; $$
LANGUAGE sql SECURITY DEFINER STABLE;

-- ¿Es administrador de plataforma?
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN AS $$ SELECT COALESCE((auth.jwt() ->> 'is_platform_admin')::BOOLEAN, false); $$
LANGUAGE sql SECURITY DEFINER STABLE;

-- ¿Es crew_lead?
CREATE OR REPLACE FUNCTION public.is_crew_lead()
RETURNS BOOLEAN AS $$ SELECT (auth.jwt() ->> 'app_role') = 'crew_lead'; $$
LANGUAGE sql SECURITY DEFINER STABLE;

-- Cuadrilla del crew_lead actual
CREATE OR REPLACE FUNCTION public.current_crew_id()
RETURNS UUID AS $$
  SELECT id FROM public.crews WHERE crew_lead_id = current_worker_id() AND status = 'active' LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

### Patrón de reescritura de RLS

Toda política existente se reescribe con dos añadidos: el predicado de tenant y el bypass de plataforma. Ejemplo del patrón (admin sobre workers):

```sql
-- ANTES:
-- CREATE POLICY "admin_all_workers" ON workers FOR ALL USING (is_admin());

-- DESPUÉS:
CREATE POLICY "admin_all_workers" ON workers FOR ALL USING (
  is_platform_admin()
  OR (is_admin() AND organization_id = current_org_id())
);
```

Regla general para cada política de rol `R` sobre tabla `T`:

```
USING ( is_platform_admin() OR ( <predicado_rol_existente_R> AND T.organization_id = current_org_id() ) )
```

Políticas nuevas para el rol `crew_lead` (solo su cuadrilla, dentro de su org):

```sql
-- Encargado: lee/gestiona trabajadores de su cuadrilla
CREATE POLICY "crew_lead_read_crew_workers" ON workers FOR SELECT USING (
  is_platform_admin() OR (
    is_crew_lead()
    AND organization_id = current_org_id()
    AND (id = current_worker_id() OR crew_id = current_crew_id())
  )
);

-- Encargado: lee producción de su cuadrilla
CREATE POLICY "crew_lead_read_picking" ON picking_records FOR SELECT USING (
  is_platform_admin() OR (
    is_crew_lead()
    AND organization_id = current_org_id()
    AND worker_id IN (SELECT id FROM workers WHERE crew_id = current_crew_id())
  )
);

-- Encargado: registra pagos a sus trabajadores (settlements payee_type='worker' de su cuadrilla)
-- Encargado: lee su propia liquidación (payee_type='crew', crew_id = current_crew_id())
```

### Edge Functions

- `_shared/auth.ts` gana `getOrgId(req)` (lee `org_id` del token) e `isPlatformAdmin(req)`.
- Nuevo helper `requireOrg(req, resourceOrgId)`: 403 si `resourceOrgId !== org_id` y el usuario no es platform admin.
- Impersonación de soporte: el platform admin envía un encabezado/param `X-Org-Context: <org_id>`; las funciones lo usan como org activa y escriben en `platform_audit_log`. El bypass RLS sigue activo, pero la app restringe la vista a la org seleccionada.

## Shared Types (`packages/shared`)

Cambios en `src/types/index.ts`:

```typescript
export enum WorkerRole {
  ADMIN = 'admin',
  SUPERVISOR = 'supervisor',
  CREW_LEAD = 'crew_lead',   // NUEVO
  WORKER = 'worker',
}

export enum SubscriptionStatus {
  TRIAL = 'trial',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  CANCELLED = 'cancelled',
}

export enum SettlementPayeeType {
  WORKER = 'worker',
  CREW = 'crew',
}

export interface Organization extends BaseEntity {
  name: string;
  slug: string;
  logo_url: string | null;
  brand_primary_color: string | null;
  brand_secondary_color: string | null;
  subscription_status: SubscriptionStatus;
  subscription_plan: string | null;
  crew_mode_enabled: boolean;
  role_labels: Partial<Record<WorkerRole, string>>;
  status: EntityStatus;
}

export interface Crew extends BaseEntity {
  organization_id: string;
  crew_lead_id: string;
  name: string;
  status: EntityStatus;
}

export interface PlatformAdmin extends BaseEntity {
  auth_user_id: string;
  full_name: string;
  status: EntityStatus;
}
```

Se añade `organization_id: string` a todas las interfaces de dominio (`Product`, `Field`, `Block`, `Rate`, `Worker`, `SupervisorAssignment`, `PickingRecord`, `Settlement`, `Payment`). `Field` gana `crew_mode_enabled: boolean | null`. `Worker` gana `crew_id: string | null`. `Settlement` gana `payee_type: SettlementPayeeType` y `crew_id: string | null` (y `worker_id` pasa a `string | null`).

Nuevos `ERROR_CODES` en `src/constants/index.ts`: `ORG_CONTEXT_REQUIRED`, `CROSS_TENANT_FORBIDDEN`, `SUBSCRIPTION_INACTIVE`, `CREW_MODE_DISABLED`, `CREW_LEAD_NOT_AUTHORIZED`.

## Flows

### Registro de picking (con y sin Modo Capataz)

```
Scan QR → resolver worker (dentro de org del recorder) → resolver block
  → determinar crew_mode efectivo del campo:
       field.crew_mode_enabled ?? organization.crew_mode_enabled
  → crear picking_record (worker_id, block_id, organization_id, rate snapshot)
       - el registro de producción es idéntico en ambos modos (no se duplica)
       - se preservan los invariantes: quantity > 0 y rate_amount_snapshot > 0
```

### Liquidación

```
Modo Capataz ACTIVO:
  Nivel 1 (cliente → encargado):
    settlement(payee_type='crew', crew_id) = Σ producción de workers de la cuadrilla
  Nivel 2 (encargado → trabajadores):
    settlement(payee_type='worker', worker_id) por cada trabajador de la cuadrilla
    → el crew_lead registra los payments a sus trabajadores

Modo Capataz INACTIVO (comportamiento actual):
  settlement(payee_type='worker', worker_id) → payment directo (admin/supervisor)
```

La inmutabilidad de liquidaciones pagadas (`prevent_paid_settlement_update`) se preserva en ambos niveles, y los pagos siguen validando `amount > 0` y `amount ≤ saldo pendiente`.

## Migration Strategy

1. Crear `organizations`, `platform_admins`, `crews`, `platform_audit_log` y los nuevos enums.
2. Insertar una **organización semilla** (ej. slug `default`).
3. Añadir `organization_id` nullable a cada tabla de dominio; backfill con el id de la organización semilla; luego `SET NOT NULL` + índices + FKs compuestas.
4. `ALTER TYPE worker_role ADD VALUE 'crew_lead'`.
5. Extender `custom_access_token_hook` (org_id, is_platform_admin) y crear helpers SQL.
6. Reescribir todas las políticas RLS con el patrón tenant + bypass de plataforma.
7. Añadir columnas de Modo Capataz (`organizations.crew_mode_enabled`, `fields.crew_mode_enabled`), cuadrilla (`workers.crew_id`) y liquidación (`settlements.payee_type`, `crew_id`).

Notas:
- `ALTER TYPE ... ADD VALUE` no puede ejecutarse dentro del mismo bloque transaccional que usa el nuevo valor; se separa en su propia migración.
- El backfill a la organización semilla garantiza que ningún dato existente se pierda ni quede huérfano (Req. 1.6, 9.2).

## Testing Strategy

- **Aislamiento de tenant**: por cada tabla, verificar que un usuario de la org A no puede leer/escribir filas de la org B (SELECT/INSERT/UPDATE/DELETE).
- **Bypass de plataforma**: verificar que el platform admin sí accede cross-org, y que cada acceso queda en `platform_audit_log`.
- **Modo Capataz**: campos con modo activo/inactivo dentro de una misma org; herencia del default; ausencia del rol crew_lead cuando está inactivo.
- **Liquidación dos niveles**: agregación correcta cliente→encargado; pagos encargado→trabajadores acotados a la cuadrilla; inmutabilidad tras pago; invariantes de cantidad/monto positivos.
- **Regresión**: los flujos actuales (admin/supervisor/worker) siguen funcionando dentro de la organización semilla.
- **Suscripción**: usuarios de una org suspendida/cancelada no acceden a funcionalidades; los datos se conservan.

## Security Considerations

- El bypass RLS del platform admin está centralizado en `is_platform_admin()`; cualquier cambio a la lógica de bypass ocurre en un solo lugar auditable.
- MFA obligatorio para cuentas de `platform_admins`.
- La impersonación de soporte se registra siempre en `platform_audit_log`.
- No exponer tarifas ni datos confidenciales cross-tenant; las políticas de `rates` mantienen su confidencialidad además del filtro de tenant.
- Las FKs compuestas `(id, organization_id)` previenen fugas por referencias cruzadas entre tenants.
