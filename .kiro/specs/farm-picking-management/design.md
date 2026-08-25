# Design Document

## Overview

Sistema de gestión integral de operaciones de cosecha agrícola, diseñado para controlar el picking (recolección de frutas), administrar la estructura de campos productivos, gestionar trabajadores y calcular liquidaciones de pago por pieza. El sistema es mobile-first, opera con identificación por QR y soporta operación en zonas rurales con conectividad limitada.

## Architecture

Arquitectura de 3 capas: Clientes (Web + Mobile) → API REST (Supabase Edge Functions) → PostgreSQL con RLS.

```
┌─────────────────────────────────────────────────────┐
│                   CLIENTES                           │
├──────────────────┬──────────────────────────────────┤
│  App Móvil       │  Web Dashboard                   │
│  (Supervisor/    │  (Administrador)                 │
│   Trabajador)    │                                  │
└────────┬─────────┴──────────┬───────────────────────┘
         │                    │
         ▼                    ▼
┌─────────────────────────────────────────────────────┐
│              Supabase (Backend)                      │
│  Auth + Edge Functions + PostgreSQL + Storage        │
└─────────────────────────────────────────────────────┘
```

### Stack Tecnológico

| Capa | Tecnología | Justificación |
|------|-----------|---------------|
| Mobile | React Native (Expo) | Multiplataforma, camera API para QR |
| Web | Next.js 14+ (App Router) | SSR para dashboard |
| Backend | Supabase Edge Functions | Auth + DB + Realtime + Storage integrado |
| DB | PostgreSQL 15+ | ACID, RLS, triggers |
| Hosting Web | Vercel | Deploy automático |
| Hosting Mobile | EAS (Expo) | Build iOS/Android |

## Components and Interfaces

### Componentes Principales

| Componente | Responsabilidad |
|------------|----------------|
| Web Dashboard | Panel administrativo, métricas, configuración |
| App Móvil | Registro de picking, consulta trabajadores |
| Edge Functions | Lógica de negocio, RBAC, cálculos |
| PostgreSQL + RLS | Persistencia, enforcement de acceso a nivel de datos |
| Supabase Auth | Login, roles, JWT tokens |
| Supabase Storage | Imágenes de Badge QR |
| Supabase Realtime | Actualización en vivo del dashboard |

### API REST — Contratos Principales

#### POST /api/picking-records (Registro de Picking)

```typescript
// Request
interface CreatePickingRecordRequest {
  worker_id: string;       // UUID del trabajador
  block_id: string;        // UUID del paño
  quantity: number;        // > 0, unidades recolectadas
}

// Response 201
interface CreatePickingRecordResponse {
  success: true;
  data: {
    id: string;
    worker_id: string;
    worker_name: string;
    block_id: string;
    block_name: string;
    quantity: number;
    rate_amount_snapshot: number;
    estimated_payment: number;
    work_day: string;
    recorded_at: string;
  };
}
```

#### POST /api/picking-records/scan (Registro por QR)

```typescript
interface ScanPickingRequest {
  qr_code: string;         // Contenido del QR escaneado
  block_id: string;        // Paño seleccionado
  quantity: number;        // > 0
}
```

#### POST /api/settlements/generate (Generar Liquidación)

```typescript
interface GenerateSettlementRequest {
  worker_id?: string;      // Opcional
  period_start: string;    // ISO date
  period_end: string;      // ISO date
}

interface GenerateSettlementResponse {
  success: true;
  data: {
    id: string;
    worker_id: string;
    worker_name: string;
    period_start: string;
    period_end: string;
    total_amount: number;
    breakdown: {
      work_day: string;
      block_name: string;
      product_name: string;
      quantity: number;
      rate: number;
      subtotal: number;
    }[];
    status: 'pending';
  };
}
```

#### GET /api/picking-records/my/today (Consulta del Trabajador)

```typescript
interface MyTodayPickingResponse {
  success: true;
  data: {
    work_day: string;
    total_units: number;
    estimated_earnings: number;
    records: {
      id: string;
      block_name: string;
      quantity: number;
      rate: number;
      subtotal: number;
      recorded_at: string;
    }[];
  };
}
```

### RBAC Matrix

| Endpoint | Admin | Supervisor | Trabajador |
|----------|-------|------------|------------|
| POST /api/fields | ✅ | ❌ | ❌ |
| POST /api/picking-records | ✅ | ✅ (asignados) | ❌ |
| GET /api/picking-records/my | ❌ | ❌ | ✅ |
| POST /api/settlements/generate | ✅ | ❌ | ❌ |
| POST /api/payments | ✅ | ❌ | ❌ |
| GET /api/metrics/* | ✅ | ✅ (filtrado) | ❌ |

## Data Models

### Diagrama Entidad-Relación

```
products (id, name, unit_measure, status, timestamps)
    ↓
rates (id, product_id FK, amount CHECK > 0, effective_from, status, timestamps)

fields (id, name, location, total_area, status, timestamps)
    ↓
blocks (id, field_id FK, product_id FK, name, area, status, timestamps)

workers (id, full_name, national_id, phone, role enum, qr_badge_url, status, auth_user_id, timestamps)

supervisor_assignments (id, supervisor_id FK, worker_id FK nullable, block_id FK nullable, assigned_at, timestamps)

picking_records (id, worker_id FK, block_id FK, quantity CHECK > 0, rate_amount_snapshot, recorded_at, work_day, recorded_by FK, original_record_id FK nullable, timestamps)

settlements (id, worker_id FK, period_start, period_end, total_amount, status enum, generated_at, timestamps)

payments (id, settlement_id FK, worker_id FK, amount CHECK > 0, paid_at, notes, timestamps)
```

### Decisiones del Modelo

1. **rate_amount_snapshot**: Tarifa vigente al momento del registro para trazabilidad histórica
2. **original_record_id**: Correcciones apuntan al registro original (auditoría)
3. **supervisor_assignments**: Polimorfismo por nullability (worker_id o block_id)
4. **work_day como date**: Jornada = día calendario
5. **settlement status**: Flujo unidireccional pending → partial → paid (inmutable una vez paid)

### Enums

```sql
CREATE TYPE worker_role AS ENUM ('admin', 'supervisor', 'worker');
CREATE TYPE entity_status AS ENUM ('active', 'inactive');
CREATE TYPE rate_status AS ENUM ('current', 'historical');
CREATE TYPE settlement_status AS ENUM ('pending', 'partial', 'paid');
```

## Correctness Properties

### Property 1: Cantidad de picking siempre positiva
`picking_records.quantity > 0` — enforced por CHECK constraint en DB + validación en application layer.

### Property 2: Tarifa siempre positiva
`rates.amount > 0` — enforced por CHECK constraint en DB + validación en application layer.

### Property 3: Monto de pago siempre positivo
`payments.amount > 0` — enforced por CHECK constraint en DB + validación en application layer.

### Property 4: Pagos no exceden liquidación
La suma de payments asociados a un settlement nunca excede `settlement.total_amount`.

### Property 5: Inmutabilidad de liquidaciones pagadas
Settlement en estado `paid` rechaza cualquier UPDATE (trigger de protección en DB).

### Property 6: Snapshot de tarifa al momento del registro
La tarifa aplicada a un picking_record es siempre la vigente al momento del registro, almacenada en `rate_amount_snapshot`.

### Property 7: Unicidad de tarifa vigente
Solo existe una tarifa con status `current` por producto en cualquier momento dado.

### Property 8: Aislamiento de datos del trabajador
Un worker solo ve sus propios datos (enforced por Row Level Security en PostgreSQL).

### Property 9: Supervisor limitado a asignaciones
Un supervisor solo opera sobre workers y blocks asignados a él (enforced por RLS + application logic).

### Property 10: Correcciones solo en misma jornada
Los registros de picking solo se pueden corregir dentro del mismo día calendario (`work_day`).

## Error Handling

### Estrategia por Capa

| Capa | Manejo |
|------|--------|
| DB (CHECK/FK) | Constraint violation → 422 con código de error |
| RLS | Policy violation → 403 Forbidden |
| Edge Function | Business rule violation → dominio-specific error code |
| Cliente | Mostrar mensaje en español, loguear error técnico |

### Códigos de Error de Dominio

```typescript
enum DomainErrorCode {
  WORKER_NOT_ACTIVE = 'WORKER_NOT_ACTIVE',
  BLOCK_NOT_ACTIVE = 'BLOCK_NOT_ACTIVE',
  QUANTITY_MUST_BE_POSITIVE = 'QUANTITY_MUST_BE_POSITIVE',
  RATE_MUST_BE_POSITIVE = 'RATE_MUST_BE_POSITIVE',
  SETTLEMENT_IS_IMMUTABLE = 'SETTLEMENT_IS_IMMUTABLE',
  PAYMENT_EXCEEDS_BALANCE = 'PAYMENT_EXCEEDS_BALANCE',
  WORKER_HAS_PENDING_DEBT = 'WORKER_HAS_PENDING_DEBT',
  CORRECTION_OUTSIDE_WORKDAY = 'CORRECTION_OUTSIDE_WORKDAY',
  SUPERVISOR_NOT_AUTHORIZED = 'SUPERVISOR_NOT_AUTHORIZED',
  DUPLICATE_SETTLEMENT_PERIOD = 'DUPLICATE_SETTLEMENT_PERIOD',
}
```

### Formato de Error Response

```typescript
{
  success: false,
  error: {
    code: DomainErrorCode,
    message: string,  // Mensaje legible en español
    details?: Record<string, unknown>
  }
}
```

## Testing Strategy

### Niveles de Testing

| Nivel | Scope | Herramienta | Objetivo |
|-------|-------|-------------|----------|
| Unit | Business logic (services) | Vitest | Validar reglas de dominio |
| Integration | API endpoints + DB | Vitest + Supabase local | Flujos completos |
| E2E | Web Dashboard | Playwright | Flujos de usuario críticos |
| E2E Mobile | App móvil | Detox / Maestro | Flujo de picking |
| RLS | Database policies | pgTAP / SQL tests | Aislamiento de datos por rol |

### Tests Críticos (Must-Have)

1. Registro de picking: valida quantity > 0, worker activo, block activo, rate snapshot correcto
2. Liquidación: cálculo correcto Σ(qty × rate), no duplicados, breakdown correcto
3. Pagos: no excede balance, settlement cambia status correctamente, inmutabilidad post-pago
4. RBAC: worker no ve datos ajenos, supervisor limitado a asignaciones, admin ve todo
5. Tarifas: solo una current por producto, histórica se preserva, nueva aplica desde su fecha

## Security Considerations

### Autenticación y Autorización

- Supabase Auth con JWT
- Row Level Security en todas las tablas
- Custom claims para rol en JWT
- Middleware de autorización por endpoint

### Protección de Datos

- RUT encriptado en reposo
- Tarifas visibles solo para admin
- QR contiene UUID opaco (no PII)
- QR regenerado invalida el anterior

### Deployment

```
Supabase Cloud (Auth + DB + Functions + Storage + Realtime)
Vercel (Web Dashboard - Next.js)
EAS / Expo (Mobile App - iOS + Android)
```

## Traceability

| Requirement | Design Component |
|-------------|-----------------|
| Req 1: Gestión de Campos | Data Models (fields, blocks, products), API (/api/fields, /api/blocks) |
| Req 2: Gestión de Trabajadores | Data Models (workers), API (/api/workers), Storage (QR) |
| Req 3: Configuración de Tarifas | Data Models (rates), API (/api/products/:id/rates) |
| Req 4: Registro de Picking | Data Models (picking_records), API (/api/picking-records), Mobile QR Scanner |
| Req 5: Consulta Producción | API (/api/picking-records/my), Mobile Worker View, RLS |
| Req 6: Liquidación y Pagos | Data Models (settlements, payments), API (/api/settlements, /api/payments) |
| Req 7: Métricas y Dashboard | API (/api/metrics/*), Web Dashboard, Realtime |
| Req 8: RBAC | Supabase Auth, RLS Policies, Middleware, RBAC Matrix |
| Req 9: Asignación Supervisión | Data Models (supervisor_assignments), API (/api/supervisors/*), RLS |
