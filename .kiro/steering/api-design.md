---
inclusion: auto
name: api-design
description: Complete REST API endpoint design with routes, request/response contracts, pagination, and filters. Use when implementing or modifying API endpoints, Edge Functions, or client-side API calls.
---

# Diseño de API — Sistema de Control de Picking

## Endpoints Planificados por Módulo

### Auth
```
POST   /api/auth/login          → Autenticación con credentials
POST   /api/auth/refresh        → Refresh token
POST   /api/auth/logout         → Invalidar sesión
```

### Fields (Campos)
```
GET    /api/fields              → Listar campos (admin)
POST   /api/fields              → Crear campo (admin)
GET    /api/fields/:id          → Detalle de campo
PUT    /api/fields/:id          → Modificar campo (admin)
PATCH  /api/fields/:id/status   → Activar/Desactivar (admin)
```

### Blocks (Paños)
```
GET    /api/fields/:fieldId/blocks    → Listar paños de un campo
POST   /api/fields/:fieldId/blocks    → Crear paño (admin)
GET    /api/blocks/:id                → Detalle de paño
PUT    /api/blocks/:id                → Modificar paño (admin)
PATCH  /api/blocks/:id/status         → Activar/Desactivar (admin)
```

### Products (Productos)
```
GET    /api/products            → Listar productos
POST   /api/products            → Crear producto (admin)
PUT    /api/products/:id        → Modificar producto (admin)
```

### Rates (Tarifas)
```
GET    /api/products/:productId/rates         → Historial de tarifas
POST   /api/products/:productId/rates         → Crear nueva tarifa (admin)
GET    /api/products/:productId/rates/current  → Tarifa vigente
```

### Workers (Trabajadores)
```
GET    /api/workers             → Listar trabajadores (admin/supervisor)
POST   /api/workers             → Crear trabajador (admin)
GET    /api/workers/:id         → Detalle trabajador
PUT    /api/workers/:id         → Modificar trabajador (admin)
PATCH  /api/workers/:id/status  → Activar/Desactivar (admin)
POST   /api/workers/:id/badge   → Regenerar Badge QR (admin)
```

### Picking Records (Registros de Picking)
```
GET    /api/picking-records                → Listar registros (filtrable por fecha, paño, trabajador)
POST   /api/picking-records                → Crear registro (supervisor)
PUT    /api/picking-records/:id            → Corregir registro (supervisor, misma jornada)
GET    /api/picking-records/my             → Mis registros (trabajador autenticado)
GET    /api/picking-records/my/today       → Mis registros de hoy (trabajador)
POST   /api/picking-records/scan           → Registro por escaneo QR (supervisor)
```

### Settlements (Liquidaciones)
```
GET    /api/settlements                    → Listar liquidaciones (admin)
POST   /api/settlements/generate           → Generar liquidación para período (admin)
GET    /api/settlements/:id                → Detalle de liquidación
GET    /api/workers/:id/settlements        → Liquidaciones de un trabajador
GET    /api/settlements/my                 → Mis liquidaciones (trabajador)
```

### Payments (Pagos)
```
GET    /api/payments                       → Listar pagos (admin)
POST   /api/payments                       → Registrar pago (admin)
GET    /api/workers/:id/payments           → Pagos de un trabajador
GET    /api/workers/:id/balance            → Saldo pendiente
GET    /api/payments/my                    → Mis pagos (trabajador)
```

### Metrics (Métricas)
```
GET    /api/metrics/production/daily       → Producción del día
GET    /api/metrics/production/by-block    → Producción por paño
GET    /api/metrics/production/by-field    → Producción por campo
GET    /api/metrics/workers/ranking        → Ranking de trabajadores
GET    /api/metrics/costs/per-hectare      → Costo por hectárea
GET    /api/metrics/summary                → Resumen ejecutivo
```

### Supervisor Assignments
```
GET    /api/supervisors/:id/assignments    → Ver asignaciones
POST   /api/supervisors/:id/workers        → Asignar trabajadores (admin)
POST   /api/supervisors/:id/blocks         → Asignar paños (admin)
DELETE /api/supervisors/:id/workers/:wId   → Desasignar trabajador (admin)
DELETE /api/supervisors/:id/blocks/:bId    → Desasignar paño (admin)
```

## Headers Requeridos

```
Authorization: Bearer {jwt_token}
Content-Type: application/json
X-Request-ID: {uuid}           # Para correlación de logs
```

## Paginación

Todos los endpoints GET que retornan listas soportan:
```
?page=1&limit=20&sort=created_at&order=desc
```

## Filtros Comunes

```
?field_id={uuid}
?block_id={uuid}
?worker_id={uuid}
?product_id={uuid}
?date_from=2026-01-01
?date_to=2026-01-31
?status=active
```
