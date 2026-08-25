---
inclusion: auto
name: database-migrations
description: Database migration guidelines, table creation order, template, and constraints. Use when creating or modifying SQL migrations, database schemas, or RLS policies.
---

# Guías para Migraciones de Base de Datos

## Reglas Obligatorias

1. Cada migración debe ser reversible (incluir `up` y `down`)
2. Nunca modificar una migración ya ejecutada — crear una nueva
3. Nombrar migraciones con timestamp: `YYYYMMDDHHMMSS_descripcion.ts`
4. No incluir datos de seed en migraciones — usar scripts de seed separados
5. Toda columna con FK debe tener índice
6. Usar UUIDs como primary keys (nunca auto-increment expuesto)
7. Siempre incluir `created_at` y `updated_at` en toda tabla
8. Para soft-deletes usar `deleted_at` (nullable timestamp)
9. Constraints de negocio en DB: CHECK para cantidad > 0, tarifa > 0
10. RLS (Row Level Security) para tablas sensibles si se usa Supabase

## Orden de Dependencias para Creación de Tablas

```
1. products (sin FK)
2. fields (sin FK)
3. blocks (FK → fields, products)
4. rates (FK → products)
5. workers (sin FK, contiene role y qr_badge)
6. supervisor_assignments (FK → workers, blocks)
7. work_days (sin FK)
8. picking_records (FK → workers, blocks, work_days)
9. settlements (FK → workers, work_days)
10. payments (FK → settlements, workers)
```

## Template de Migración

```typescript
import { Knex } from 'knex'; // o el migration tool que se use

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('table_name', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    // ... columns
    table.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
    table.timestamp('updated_at').defaultTo(knex.fn.now()).notNullable();
    table.timestamp('deleted_at').nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('table_name');
}
```
