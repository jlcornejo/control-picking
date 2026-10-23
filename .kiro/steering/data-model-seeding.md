---
inclusion: auto
name: data-model-seeding
description: "Modelo de datos de Fundo360 para INSERTAR DATOS DE PRUEBA: tablas de dominio, orden de inserción por dependencias (FKs), columnas obligatorias, enums y los IDs de los seeds existentes. Úsalo al escribir seeds SQL, poblar la base (local o remoto), o depurar errores de inserción / FK / NOT NULL."
---

# Modelo de datos para sembrar datos de prueba

Mapa del esquema de dominio para generar seeds sin re-descubrir columnas a punta de queries.
Para conectarse al remoto y correr SQL, ver el steering `remote-env`.

## Orden de inserción (respeta las FKs)

Inserta en este orden; cada nivel depende de los anteriores:

1. `organizations` (raíz del tenant; todo cuelga de `organization_id`)
2. `products` → luego `product_varieties` (opcional) → `rates` (tarifa del producto)
3. `fields` → `blocks` (paño, FK a field + product) → `field_rows` (melgas, FK a block)
4. `box_types` (opcional, solo si el tenant usa destare)
5. `workers` (admin, supervisor, crew_lead, worker)
6. `crews` (FK a crew_lead y supervisor, ambos workers) → `UPDATE workers.crew_id`
7. `supervisor_assignments` (supervisor ↔ worker y supervisor ↔ block)
8. `day_roster` (equipo del día: worker + lead, opcional crew)
9. `picking_records` (la cosecha; FK a worker, block, opcional row/box_type/day_roster)
10. `settlements` (liquidación por worker o crew) → `payments`

## Columnas OBLIGATORIAS por tabla (NOT NULL sin default)

Además de estas, `id` (default `gen_random_uuid()`) y `created_at` se autogeneran.
Casi todas las tablas de dominio llevan `organization_id`.

| Tabla | Columnas requeridas |
|-------|---------------------|
| `organizations` | `name`, `slug` |
| `products` | `name`, `unit_measure`, `organization_id` |
| `rates` | `product_id`, `amount`, `organization_id` |
| `fields` | `name`, `total_area`, `organization_id` |
| `blocks` | `field_id`, `product_id`, `name`, `area`, `organization_id` |
| `field_rows` | `block_id`, `name`, `organization_id` |
| `workers` | `full_name`, `organization_id` |
| `crews` | `organization_id`, `crew_lead_id`, `name` |
| `day_roster` | `organization_id`, `work_day`, `worker_id`, `lead_id`, `added_by` |
| `picking_records` | `worker_id`, `block_id`, `quantity`, `rate_amount_snapshot`, `work_day`, `recorded_by`, `organization_id`, `payment_unit` |
| `settlements` | `period_start`, `period_end`, `total_amount`, `organization_id` |
| `payments` | `settlement_id`, `amount`, `organization_id` |

> `picking_records.out_of_tolerance` es NOT NULL pero con default `false`; conviene pasarlo
> explícito en seeds. `recorded_at` default `now()`.

## FKs clave (quién apunta a quién)

- `blocks` → `fields`, `products`, (opcional `product_varieties`)
- `field_rows` → `blocks`  (melgas del paño)
- `rates` → `products` (opcional `product_varieties`)
- `crews` → `workers` (crew_lead_id, supervisor_id)
- `workers.crew_id` → `crews`; `workers.permission_profile_id` → `permission_profiles`
- `day_roster` → `workers` (worker_id, lead_id, added_by), `crews` (crew_id opcional)
- `picking_records` → `workers` (worker_id, recorded_by), `blocks`, `field_rows` (row_id opcional),
  `box_types` (box_type_id opcional), `day_roster` (opcional), `picking_records` (original_record_id, para correcciones)
- `settlements` → `workers` (si payee worker) o `crews` (si payee crew)
- `payments` → `settlements`, `workers` o `crews`

## Enums (valores válidos)

| Enum | Valores | Usado en |
|------|---------|----------|
| `worker_role` | `admin` \| `supervisor` \| `crew_lead` \| `worker` | `workers.role` |
| `unit_measure` | `box` \| `kg` | `products.unit_measure`, `picking_records.payment_unit` |
| `rate_status` | `current` \| `historical` | `rates.status` |
| `entity_status` | `active` \| `inactive` | `.status` de varias tablas |
| `settlement_status` | `pending` \| `partial` \| `paid` | `settlements.status` |
| `settlement_payee_type` | `worker` \| `crew` | `settlements.payee_type` |
| `tolerance_unit` | `percent` \| `kg` | `box_types` |
| `feature_flag_strategy` | `global` \| `org_override` \| `kill_switch` | `platform_feature_flags.strategy` |
| `subscription_status` | `trial` \| `active` \| `suspended` \| `cancelled` | `organizations.subscription_status` |

## Invariantes de dominio (respetar SIEMPRE)

- `picking_records.quantity > 0`.
- `rates.amount > 0` y `rate_amount_snapshot > 0` (es la tarifa congelada al registrar; immutable).
- Una liquidación `paid` tiene pago = total; una `partial` tiene pago(s) < total.
- No modificar liquidaciones ya pagadas (inmutables cuando `paid`).
- RBAC: la jerarquía es `admin > supervisor > crew_lead > worker`. Insertar por SQL salta la
  capa API/RLS; úsalo solo para datos de prueba, no para simular flujos de autorización.
- UUIDs para todas las PKs (no IDs secuenciales).

## Modo capataz y melgas (afecta qué sembrar)

- `organizations.crew_mode_enabled` → si true, el flujo usa `crews` + `day_roster` con `crew_id`.
- `organizations.rows_enabled` (melgas) → si true, el `block` tiene `field_rows` y el picking
  lleva `row_id`. Si false, `picking_records.row_id` queda NULL.
- Hay override por `fields`/`blocks` (`crew_mode_enabled`, `rows_enabled` NULL = hereda del org).

## IDs y patrón de los seeds existentes (remoto)

Los seeds usan UUIDs legibles con prefijos por entidad (ver `supabase/_seed_remote.sql`):

- Tenant `sur-berries` (melgas): org `0a000002…`, workers `aa0000f*…`
  (admin `aa0000ff`, supervisor `aa0000fa`, capataz `aa0000fe`, workers `aa0000fd/fc/fb`),
  product Frutilla `bb0000ff`, rate `cc0000ff` ($1200), field `dd0000ff`, block `ee0000ff`,
  melgas `f0000001/2/3`, crew `c50000ff`.
- Tenant `andes-fruit` (sin melgas): org `0a000003…`, workers `ab0000f*…`,
  product Cereza `bb0000ee` ($2100), field `dd0000ee`, block `ee0000ee`, crew `c50000ee`.
- Función helper: `org_workday(org_id)` devuelve el `work_day` actual del tenant.

Ejemplo completo de referencia: `supabase/_seed_remote.sql` (base) y
`supabase/_seed_oct_remote.sql` (cosecha de un mes + liquidaciones/pagos con estados mixtos).
Ambos son idempotentes (ON CONFLICT / borran antes de reinsertar).
