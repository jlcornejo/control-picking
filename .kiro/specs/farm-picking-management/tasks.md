# Implementation Plan

## Overview

Plan de implementación para el Sistema de Control de Picking, organizado en 3 fases según el roadmap de negocio. Cada task es atómica y entrega valor verificable. Las dependencias se describen en el grafo al final.

## Tasks

- [x] 1. Inicializar monorepo con estructura de carpetas (apps/web, apps/mobile, packages/shared), TypeScript strict, ESLint, Prettier, y proyecto Supabase local
- [x] 2. Configurar Next.js 14+ con App Router para web dashboard y Expo (React Native) para app móvil con TanStack Query
- [x] 3. Crear migraciones DB: tablas `products` (id, name, unit_measure, status, timestamps) y `fields` (id, name, location, total_area, status, timestamps)
- [x] 4. Crear migraciones DB: tabla `blocks` (id, field_id FK, product_id FK, name, area, status, timestamps) con índices en FKs
- [x] 5. Crear migraciones DB: tabla `rates` (id, product_id FK, amount CHECK > 0, effective_from, status, timestamps)
- [x] 6. Crear migraciones DB: tabla `workers` (id, full_name, national_id, phone, role enum, qr_badge_url, status, auth_user_id, timestamps) con enum worker_role
- [x] 7. Crear migraciones DB: tabla `supervisor_assignments` (id, supervisor_id FK, worker_id FK nullable, block_id FK nullable, assigned_at, timestamps)
- [x] 8. Crear migraciones DB: tabla `picking_records` (id, worker_id FK, block_id FK, quantity CHECK > 0, rate_amount_snapshot, recorded_at, work_day, recorded_by FK, original_record_id FK nullable, timestamps) con índices compuestos
- [x] 9. Crear migraciones DB: tablas `settlements` (status enum pending/partial/paid) y `payments` (amount CHECK > 0) con sus FKs
- [x] 10. Configurar Supabase Auth con custom claims para roles y trigger de sincronización auth.users → workers
- [x] 11. Implementar Row Level Security: admin acceso completo, supervisor limitado a asignaciones, worker solo sus propios datos
- [x] 12. Edge Function: CRUD /api/products con validación (name requerido, unit_measure en box/kg) y restricción solo admin
- [x] 13. Edge Function: CRUD /api/fields con validación y PATCH /api/fields/:id/status (no desactivar con picking activo)
- [x] 14. Edge Function: CRUD /api/fields/:fieldId/blocks y PATCH /api/blocks/:id/status con validaciones
- [x] 15. Edge Function: GET/POST /api/products/:productId/rates con lógica de versionamiento (nueva tarifa marca anterior como historical, amount > 0)
- [x] 16. Edge Function: CRUD /api/workers con generación de QR badge (UUID opaco → imagen QR → Supabase Storage) y validación de deuda al desactivar
- [x] 17. Edge Function: POST /api/picking-records y POST /api/picking-records/scan con resolución de tarifa vigente, snapshot, validación worker/block activos y supervisor autorizado
- [x] 18. Edge Function: PUT /api/picking-records/:id para corrección solo misma jornada con original_record_id para auditoría
- [x] 19. Edge Function: GET /api/picking-records/my y GET /api/picking-records/my/today con cálculo de total_units y estimated_earnings
- [x] 20. Implementar middleware de autenticación (JWT) y autorización (rol vs endpoint) con helper getCurrentUser()
- [x] 21. Web Dashboard: layout base (sidebar, header), página de login, protección de rutas por rol, componentes base (DataTable, Form, Modal)
- [x] 22. Web Dashboard: páginas /fields (listado), /fields/[id] (detalle con paños), formularios crear/editar campo y paño
- [x] 23. Web Dashboard: páginas /products (listado con tarifa vigente), formularios crear/editar producto y configurar tarifa
- [x] 24. Web Dashboard: páginas /workers (listado filtrable), /workers/[id] (detalle), formularios CRUD, regenerar badge QR
- [x] 25. App Móvil: setup Expo con navegación, login Supabase Auth, routing condicional por rol, componentes base
- [x] 26. App Móvil: pantalla Scanner QR (expo-camera), formulario de registro picking, flujo Scan→Identificar→Paño→Cantidad→Confirmar
- [x] 27. App Móvil: pantallas de consulta trabajador (resumen del día, historial por jornada) con visualización accesible
- [x] 28. Edge Function: POST /api/settlements/generate con cálculo Σ(quantity × rate_snapshot), breakdown por jornada/paño/producto, validación no duplicados
- [x] 29. Edge Function: POST /api/payments con validación amount ≤ saldo pendiente, actualización status settlement (pending→partial→paid), inmutabilidad post-pago
- [x] 30. Edge Function: CRUD /api/supervisors/:id/assignments para asignar/desasignar workers y blocks, actualización de RLS dinámico
- [x] 31. Edge Function: GET /api/workers/:id/balance y GET /api/settlements/my, GET /api/payments/my para consulta del trabajador
- [x] 32. Web Dashboard: páginas /settlements (generar, listar, detalle con breakdown), /payments (listar, registrar pago), vista saldo por trabajador
- [x] 33. Web Dashboard: páginas /supervisors (listado, detalle con asignaciones), formularios asignar/desasignar workers y blocks
- [x] 34. App Móvil: pantallas de liquidaciones, pagos y saldo del trabajador
- [x] 35. Edge Functions: GET /api/metrics/* (production/daily, by-block, by-field, workers/ranking, costs/per-hectare, summary) con filtros y caché TTL
- [x] 36. Web Dashboard: página /dashboard con KPIs del día, gráficos (Recharts), ranking trabajadores, producción por paño, Supabase Realtime
- [ ] 37. Web Dashboard: generación de reportes exportables (PDF liquidaciones, CSV producción y rankings)
- [ ] 38. Sistema de alertas configurables y notificaciones push (rendimiento bajo/alto, resumen de jornada)

## Notes

- Las Tasks 1-27 corresponden a Fase 1 (MVP)
- Las Tasks 28-34 corresponden a Fase 2 (Gestión Financiera)
- Las Tasks 35-38 corresponden a Fase 3 (Inteligencia Operativa)
- Fase 4 (Offline sync, multi-fundo, integraciones) no está incluida en este plan — se planificará una vez completada Fase 3

## Task Dependency Graph

```json
{
  "waves": [
    [1],
    [2, 3],
    [4, 5, 6],
    [7, 8, 10],
    [9, 11],
    [12, 13, 16, 20],
    [14, 15],
    [17, 19],
    [18, 21, 25],
    [22, 23, 24, 26, 27],
    [28, 30],
    [29, 31],
    [32, 33, 34],
    [35],
    [36, 38],
    [37]
  ]
}
```
