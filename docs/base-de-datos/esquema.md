# Esquema de Base de Datos

!!! warning "Página generada automáticamente"
    El contenido detallado del esquema (tablas, columnas, relaciones, índices) se **genera automáticamente** con [tbls](https://github.com/k1LoW/tbls) a partir de la base de datos local de Supabase.

    Este archivo es solo la portada de la sección. Los archivos generados se colocan en `docs/base-de-datos/schema/` y se enlazan desde la navegación al ejecutar la generación.

## Cómo regenerar

Con la base de datos local de Supabase corriendo:

```bash
npm run db:docs
```

Esto ejecuta `tbls doc` usando la configuración de [`.tbls.yml`](#configuracion) y vuelca la documentación del esquema en `docs/base-de-datos/schema/`.

El proceso también se dispara automáticamente mediante un hook de Kiro cada vez que se guarda una migración en `supabase/migrations/`.

## Orden de dependencias de las tablas

El esquema se construye respetando este orden de dependencias:

```
1. products                 (sin FK)
2. fields                   (sin FK)
3. blocks                   (FK → fields, products)
4. rates                    (FK → products)
5. workers                  (sin FK, contiene role y qr_badge)
6. supervisor_assignments   (FK → workers, blocks)
7. work_days                (sin FK)
8. picking_records          (FK → workers, blocks, work_days)
9. settlements              (FK → workers, work_days)
10. payments                (FK → settlements, workers)
```

Además, el proyecto es **multi-tenant**: existen tablas `organizations`, `platform_admins`, `platform_audit_log` y `crews`, y las tablas de negocio incluyen `organization_id` con RLS por organización.

## Reglas del esquema

- UUIDs como primary keys (nunca auto-increment expuesto).
- Toda tabla incluye `created_at` y `updated_at`; soft-delete con `deleted_at` (nullable).
- Toda columna con FK tiene índice.
- Constraints de negocio en la DB: `CHECK` para cantidad > 0 y tarifa > 0.
- RLS (Row Level Security) activo en las tablas sensibles.

<a id="configuracion"></a>

## Configuración de tbls

La configuración vive en `.tbls.yml` en la raíz del repositorio y apunta a la base de datos local de Supabase (`postgres://postgres:postgres@127.0.0.1:54322/postgres`).
