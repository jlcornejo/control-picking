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
| POST | `/api/fields/:fieldId/blocks` | Crear paño (admin) |
| GET | `/api/blocks/:id` | Detalle de paño |
| PUT | `/api/blocks/:id` | Modificar paño (admin) |
| PATCH | `/api/blocks/:id/status` | Activar/Desactivar (admin) |

### Products (Productos)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/products` | Listar productos |
| POST | `/api/products` | Crear producto (admin) |
| PUT | `/api/products/:id` | Modificar producto (admin) |

### Rates (Tarifas)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/products/:productId/rates` | Historial de tarifas |
| POST | `/api/products/:productId/rates` | Crear nueva tarifa (admin) |
| GET | `/api/products/:productId/rates/current` | Tarifa vigente |

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
| POST | `/api/picking-records` | Crear registro (supervisor) |
| PUT | `/api/picking-records/:id` | Corregir registro (supervisor, misma jornada) |
| GET | `/api/picking-records/my` | Mis registros (trabajador autenticado) |
| GET | `/api/picking-records/my/today` | Mis registros de hoy (trabajador) |
| POST | `/api/picking-records/scan` | Registro por escaneo QR (supervisor) |

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
