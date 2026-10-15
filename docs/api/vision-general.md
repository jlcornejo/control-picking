# API REST

La API se implementa con **Supabase Edge Functions**. Todos los endpoints siguen las convenciones REST de Fundo360.

!!! note "Multi-tenant y roles"
    Cada petición se ejecuta en el contexto de la Organización del usuario (claim `org_id` del JWT); la RLS garantiza el aislamiento entre clientes. El `organization_id` de los recursos nuevos se toma del token en el servidor, nunca del cliente. Los endpoints de plataforma (`platform-*`, `organizations`) son exclusivos del **Administrador de Plataforma** (`is_platform_admin`).

## Convenciones generales

### Headers requeridos

```
Authorization: Bearer {jwt_token}
Content-Type: application/json
X-Request-ID: {uuid}           # Para correlación de logs
```

### Formato de respuesta

```typescript
// Éxito
{ success: true, data: { ... }, meta?: { page, total, limit } }

// Error
{ success: false, error: { code: string, message: string, details?: object } }
```

### Paginación

Todos los endpoints `GET` que retornan listas soportan (default 20, máximo 100):

```
?page=1&limit=20&sort=created_at&order=desc
```

### Filtros comunes

```
?field_id={uuid}
?block_id={uuid}
?worker_id={uuid}
?product_id={uuid}
?date_from=2026-01-01
?date_to=2026-01-31
?status=active
```

## Endpoints por módulo

### Auth

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/login` | Autenticación con credenciales |
| POST | `/api/auth/refresh` | Refresh token |
| POST | `/api/auth/logout` | Invalidar sesión |

### Fields (Campos)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/fields` | Listar campos (admin) |
| POST | `/api/fields` | Crear campo (admin) |
| GET | `/api/fields/:id` | Detalle de campo |
| PUT | `/api/fields/:id` | Modificar campo (admin) |
| PATCH | `/api/fields/:id/status` | Activar/Desactivar (admin) |

### Blocks (Paños)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/fields/:fieldId/blocks` | Listar paños de un campo |
| POST | `/api/fields/:fieldId/blocks` | Crear paño (admin). Acepta `variety_id`; obligatorio si el producto tiene variedades |
| GET | `/api/blocks/:id` | Detalle de paño (incluye producto y variedad) |
| PUT | `/api/blocks/:id` | Modificar paño (admin). Un paño = un solo producto/variedad |
| PATCH | `/api/blocks/:id/status` | Activar/Desactivar (admin) |

### Products (Productos)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/products` | Listar productos |
| POST | `/api/products` | Crear producto (admin). `unit_measure` = `box` \| `kg` (kg bajo flag `kg_payment`) |
| PUT | `/api/products/:id` | Modificar producto (admin) |

### Product Varieties (Variedades)

Variedades bajo el producto (flag `product_varieties`). Baja soft por estado; sin DELETE
físico. `product_id` es obligatorio en el listado.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/varieties?product_id=X[&status=active\|all]` | Listar variedades de un producto |
| GET | `/api/varieties/:id` | Detalle de variedad |
| POST | `/api/varieties` | Crear variedad (admin). Nombre activo duplicado → `VARIETY_NAME_TAKEN` |
| PUT | `/api/varieties/:id` | Renombrar / activar / desactivar (admin) |

### Rates (Tarifas)

La tarifa aplica a un **sujeto**: el producto (`variety_id` nulo) o una variedad concreta.
El historial (`current`/`historical`) se acota al sujeto.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/products/:productId/rates[?variety_id=Y]` | Historial de tarifas del sujeto |
| POST | `/api/products/:productId/rates` | Crear nueva tarifa (admin). Acepta `variety_id` opcional |
| GET | `/api/products/:productId/rates/current[?variety_id=Y]` | Tarifa vigente del sujeto |

### Workers (Trabajadores)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/workers` | Listar trabajadores (admin/supervisor) |
| POST | `/api/workers` | Crear trabajador (admin) |
| GET | `/api/workers/:id` | Detalle trabajador |
| PUT | `/api/workers/:id` | Modificar trabajador (admin) |
| PATCH | `/api/workers/:id/status` | Activar/Desactivar (admin) |
| POST | `/api/workers/:id/badge` | Regenerar Badge QR (admin) |

### Picking Records (Registros de Picking)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/picking-records` | Listar registros (filtrable por fecha, paño, trabajador) |
| POST | `/api/picking-records` | Crear registro (supervisor). Según unidad del paño: caja (`quantity`) o kg (destare → neto, o `manual_kg`) |
| PUT | `/api/picking-records/:id` | Corregir registro (supervisor, misma jornada). kg corrige `paid_quantity_kg`; caja corrige `quantity` |
| GET | `/api/picking-records/my` | Mis registros (trabajador). Totales segmentados `totals_by_unit:{box,kg}` |
| GET | `/api/picking-records/my/today` | Mis registros de hoy (trabajador) |
| POST | `/api/picking-records/scan` | Registro por escaneo QR (supervisor). Mismas ramas caja/kg |

> **Unidad y base de pago**: el paño define la unidad (`box` | `kg`). En caja se paga por
> `quantity`; en kg la base pagada es `paid_quantity_kg` (neto del destare, o kilos
> manuales). `payment_unit` y `rate_amount_snapshot` son inmutables tras crear el registro.

### Settlements (Liquidaciones)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/settlements` | Listar liquidaciones (admin). Distingue `payee_type` worker/crew |
| POST | `/api/settlements/generate` | Generar liquidaciones nivel 1 (admin): worker directo o crew según el Modo Capataz del campo |
| POST | `/api/settlements/crew-generate` | Generar liquidaciones nivel 2 (encargado): a los trabajadores de su cuadrilla |
| GET | `/api/settlements/:id` | Detalle de liquidación |
| GET | `/api/settlements/my` | Mis liquidaciones (trabajador) |

### Payments (Pagos)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/payments` | Listar pagos (admin) |
| POST | `/api/payments` | Registrar pago (admin) |
| GET | `/api/workers/:id/payments` | Pagos de un trabajador |
| GET | `/api/workers/:id/balance` | Saldo pendiente |
| GET | `/api/payments/my` | Mis pagos (trabajador) |

### Metrics (Métricas)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/metrics/production/daily` | Producción del día |
| GET | `/api/metrics/production/by-block` | Producción por paño |
| GET | `/api/metrics/production/by-field` | Producción por campo |
| GET | `/api/metrics/workers/ranking` | Ranking de trabajadores |
| GET | `/api/metrics/costs/per-hectare` | Costo por hectárea |
| GET | `/api/metrics/summary` | Resumen ejecutivo |

### Supervisor Assignments

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/supervisors/:id/assignments` | Ver asignaciones |
| POST | `/api/supervisors/:id/workers` | Asignar trabajadores (admin) |
| POST | `/api/supervisors/:id/blocks` | Asignar paños (admin) |
| DELETE | `/api/supervisors/:id/workers/:wId` | Desasignar trabajador (admin) |
| DELETE | `/api/supervisors/:id/blocks/:bId` | Desasignar paño (admin) |

### Crews (Cuadrillas) — Modo Capataz

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/crews` | Listar cuadrillas de la organización |
| POST | `/api/crews` | Crear cuadrilla con su encargado (admin) |
| PUT | `/api/crews/:id` | Modificar cuadrilla (admin) |
| POST | `/api/crews/:id/members` | Asignar trabajador a la cuadrilla (admin) |
| DELETE | `/api/crews/:id/members` | Quitar trabajador de la cuadrilla (admin) |

### Dispatch Guides (Guías de despacho) — flag `dispatch_guides`

Logística de salida del campo hacia el cliente. Agrega `picking_records` (bandejas + peso);
**no** toca `settlements`/`payments` ni modifica el picking. Escritura: `admin`/`supervisor`
(reabrir: solo `admin`). Con el flag apagado para la organización, las escrituras responden
`403 DISPATCH_FEATURE_DISABLED`.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/dispatch-guides` | Listar guías (paginado; filtros scope/field_id/block_id/work_day o date_from/date_to/status) |
| GET | `/api/dispatch-guides/suggestion` | Previsualizar totales auto-sugeridos desde la cosecha (no persiste) |
| POST | `/api/dispatch-guides` | Crear guía (totales auto-sugeridos; `created_by` desde el token) |
| GET | `/api/dispatch-guides/:id` | Detalle con recepción y comparación despachado vs recibido |
| PUT | `/api/dispatch-guides/:id` | Editar contenido (solo guía abierta; editar peso ⇒ aproximado) |
| POST | `/api/dispatch-guides/:id/close` | Cerrar (exige peso > 0; idempotente si ya está cerrada) |
| POST | `/api/dispatch-guides/:id/reopen` | Reabrir (solo estado; admin) |
| POST | `/api/dispatch-guides/:id/receipt` | Registrar recepción del cliente (1:1 por guía) |
| PUT | `/api/dispatch-guides/:id/receipt` | Corregir la recepción (permitido con la guía cerrada) |

### Organizations (Plataforma)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/organizations` | Listar organizaciones (platform admin) |
| POST | `/api/organizations` | Crear organización/cliente (platform admin) |
| GET | `/api/organizations/:id` | Detalle de organización |
| PATCH | `/api/organizations/:id/subscription` | Cambiar estado de suscripción (platform admin) |
| PATCH | `/api/organizations/:id/branding` | Editar marca y etiquetas de rol (admin de la org o platform admin) |

### Consola de Plataforma

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/platform-org-view/:orgId` | Vista de soporte (solo lectura) del ambiente de una organización; queda auditada (platform admin) |
| GET | `/api/platform-audit-log` | Registro de auditoría de acciones de plataforma (platform admin) |

!!! tip "Autogeneración futura"
    Cuando la API exponga un spec OpenAPI estable, esta sección puede reemplazarse por documentación generada automáticamente con el plugin de OpenAPI. Ver [Contribuir → Documentación](../contribuir/documentacion.md).
