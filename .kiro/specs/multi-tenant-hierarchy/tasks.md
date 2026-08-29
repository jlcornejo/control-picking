# Implementation Plan

## Overview

Plan de implementación para evolucionar el sistema a SaaS multi-tenant con jerarquía de capataz opcional y administrador de plataforma. Organizado en 4 fases. Cada task es atómica y entrega valor verificable. Las tasks referencian los requerimientos de `requirements.md`.

**Orden crítico**: la Fase 1 debe completarse antes que las demás porque establece el aislamiento de tenant y el bypass de plataforma en las RLS, que todo lo demás asume. Retrofitear el bypass después es riesgoso.

## Fase 1 — Multi-tenant base + Plataforma

- [ ] 1. Crear migración: enum `subscription_status` y tabla `organizations` (name, slug, logo_url, brand colors, subscription_status/plan, crew_mode_enabled, role_labels JSONB, status, timestamps) con índice en slug (Req. 1, 2, 4)
- [ ] 2. Crear migración: tabla `platform_admins` (auth_user_id UNIQUE FK a auth.users, full_name, status, timestamps) (Req. 3)
- [ ] 3. Crear migración: tabla `platform_audit_log` (platform_admin_id FK, organization_id FK nullable, action, resource, detail JSONB, created_at) con índices (Req. 3.5)
- [ ] 4. Crear migración: insertar organización semilla (slug `default`) para respaldar los datos existentes (Req. 1.6, 9.2)
- [ ] 5. Crear migración: añadir `organization_id` nullable a las 9 tablas de dominio (products, fields, blocks, rates, workers, supervisor_assignments, picking_records, settlements, payments); backfill con la org semilla; luego SET NOT NULL + índices (Req. 1.1)
- [ ] 6. Crear migración: claves únicas `(id, organization_id)` en tablas referenciadas y FKs compuestas cross-table para prevenir cruces de tenant (Req. 1.3)
- [ ] 7. Extender `custom_access_token_hook` para inyectar claims `org_id` (desde workers.organization_id) e `is_platform_admin` (desde platform_admins) (Req. 1.4, 3.1)
- [ ] 8. Crear helpers SQL `current_org_id()` e `is_platform_admin()` (Req. 1.2, 3.1)
- [ ] 9. Reescribir todas las políticas RLS existentes con el patrón `is_platform_admin() OR (<predicado_rol> AND organization_id = current_org_id())` (Req. 1.2, 1.3, 3.1, 7)
- [ ] 10. Habilitar RLS en `organizations`, `platform_admins`, `platform_audit_log`: solo platform admin gestiona organizaciones/suscripciones; admin lee/edita branding de su propia org (Req. 2.5, 3, 4.3)
- [ ] 11. Actualizar `packages/shared`: enum `SubscriptionStatus`, interfaz `Organization`, `PlatformAdmin`; añadir `organization_id` a todas las interfaces de dominio; nuevos ERROR_CODES (Req. 1, 2, 9.4)
- [ ] 12. Actualizar `_shared/auth.ts`: helpers `getOrgId(req)`, `isPlatformAdmin(req)` y `requireOrg(req, resourceOrgId)` (Req. 1.2, 3.1)
- [ ] 13. Aplicar `requireOrg`/filtro de org en las Edge Functions existentes (products, fields, blocks, rates, workers, picking-records, settlements, payments, supervisors) (Req. 1.2, 1.3)
- [ ] 14. Edge Function de plataforma: CRUD `/api/organizations`, alta de admin inicial, gestión de `subscription_status`; restringido a platform admin (Req. 2.1, 2.2, 2.5)
- [ ] 15. Enforcement de suscripción: bloquear acceso de usuarios de orgs suspendidas/canceladas preservando datos (Req. 2.3)
- [ ] 16. Edge Function: PATCH branding de la organización (nombre, logo a Storage, colores), restringido a admin de la org y platform admin (Req. 4.1, 4.3)
- [ ] 17. Web/Mobile: cargar y aplicar branding (logo, colores, nombre) por organización con valores por defecto (Req. 4.2, 4.4)
- [ ] 18. Tests de aislamiento de tenant (org A no ve/edita datos de org B por tabla) y de bypass de plataforma con auditoría (Req. 1.3, 3.1, 3.5)

## Fase 2 — Nivel Encargado / Cuadrilla (opcional)

- [ ] 19. Crear migración separada: `ALTER TYPE worker_role ADD VALUE 'crew_lead'` (Req. 5.1)
- [ ] 20. Crear migración: tabla `crews` (organization_id FK, crew_lead_id FK a workers, name, status, timestamps) con índices y FK compuesta de tenant (Req. 6.4)
- [ ] 21. Crear migración: columna `workers.crew_id` (FK a crews, nullable, ON DELETE SET NULL) con índice (Req. 6.4, 7.3)
- [ ] 22. Crear migración: `organizations.crew_mode_enabled` (default) y `fields.crew_mode_enabled` (override nullable) (Req. 6.1, 6.2, 6.3)
- [ ] 23. Crear helpers SQL `is_crew_lead()` y `current_crew_id()` (Req. 7.3)
- [ ] 24. Añadir políticas RLS para `crew_lead`: lectura/gestión de su cuadrilla (workers, picking_records) acotada a `current_crew_id()` y su org (Req. 7.3, 7.5)
- [ ] 25. Habilitar RLS en `crews` (admin gestiona las de su org; crew_lead lee la suya) (Req. 7)
- [ ] 26. Actualizar `packages/shared`: enum `WorkerRole` con `CREW_LEAD`, interfaz `Crew`, `Field.crew_mode_enabled`, `Worker.crew_id` (Req. 5.1, 6, 9.4)
- [ ] 27. Edge Function: CRUD `/api/crews` y asignación de trabajadores a cuadrilla (solo admin/supervisor de la org) (Req. 6.4, 7.2)
- [ ] 28. Edge Function: resolver crew_mode efectivo del campo (`field.crew_mode_enabled ?? organization.crew_mode_enabled`) en el flujo de picking, sin duplicar el registro de producción (Req. 6.3, 8.5)
- [ ] 29. Edge Function: gestión de `role_labels` de la organización (etiquetas de rol para UI) (Req. 5.3, 5.4)
- [ ] 30. Web/Mobile: mostrar/ocultar rol Encargado y Cuadrillas según crew_mode; aplicar `role_labels` en la UI (Req. 5.4, 6.5)
- [ ] 31. Tests: coexistencia de campos con/sin crew_mode en una org; herencia del default; ausencia del rol crew_lead cuando está inactivo (Req. 6.3, 6.5, 6.6)

## Fase 3 — Liquidación y pagos en dos niveles

- [ ] 32. Crear migración: enum `settlement_payee_type`; columnas `settlements.payee_type` y `settlements.crew_id`; `worker_id` nullable; CHECK de payee consistente (Req. 8.1, 8.6)
- [ ] 33. Actualizar `packages/shared`: enum `SettlementPayeeType`, `Settlement.payee_type`/`crew_id`, `worker_id` nullable (Req. 8, 9.4)
- [ ] 34. Edge Function: generación de liquidación nivel 1 (cliente → encargado) agregando producción de la cuadrilla cuando crew_mode activo (Req. 8.1, 8.3)
- [ ] 35. Edge Function: liquidación/pagos nivel 2 (encargado → trabajadores) acotados a la cuadrilla del crew_lead (Req. 8.2, 7.3)
- [ ] 36. Verificar/ajustar RLS y trigger `prevent_paid_settlement_update` para inmutabilidad en ambos niveles; validar `worker_read_own_settlements` con worker_id nullable (Req. 8.6)
- [ ] 37. Edge Function: ruta directa supervisor/admin → trabajador cuando crew_mode inactivo (comportamiento actual) (Req. 8.4)
- [ ] 38. Web/Mobile: vistas de liquidación del encargado (lo que recibe del cliente) y de pagos a sus trabajadores; trazabilidad de producción por trabajador (Req. 8.3)
- [ ] 39. Tests: agregación cliente→encargado, pagos encargado→trabajadores acotados, inmutabilidad tras pago, invariantes de cantidad/monto positivos (Req. 8)

## Fase 4 — Consola de Plataforma completa

- [ ] 40. Web: consola de plataforma para platform admin (listado/alta de organizaciones, gestión de suscripciones) (Req. 2.1, 2.2)
- [ ] 41. Impersonación de soporte: fijar org activa (`X-Org-Context`) y operar dentro de esa org, registrando en `platform_audit_log` (Req. 3.4, 3.5)
- [ ] 42. Vista del registro de auditoría de plataforma (Req. 3.5)
- [ ] 43. MFA obligatorio para cuentas de platform admin (Req. 3.6)
- [ ] 44. Tests E2E de la consola de plataforma: alta de cliente, cambio de suscripción, impersonación auditada (Req. 2, 3)

## Dependencias

```
Fase 1 (1→18)  ──► Fase 2 (19→31)  ──► Fase 3 (32→39)
      │                                     
      └────────────────────────────────► Fase 4 (40→44)
```

- Fase 1 es prerrequisito de todo (aislamiento de tenant + bypass en RLS).
- Fase 3 depende de Fase 2 (necesita `crews` y crew_mode).
- Fase 4 depende de Fase 1 (organizaciones + platform admin) y puede desarrollarse en paralelo a Fase 2/3.

## Notas de implementación

- Cada migración sigue las guías del proyecto (`.kiro/steering/database-migrations`): orden de creación, UUIDs, snake_case, RLS obligatoria.
- `ALTER TYPE ... ADD VALUE` (task 19) va en su propia migración, separada de cualquier uso del nuevo valor.
- El backfill de `organization_id` a la org semilla (task 5) debe completarse antes de `SET NOT NULL`.
- Mantener el formato de respuesta de API `{ success, data, meta }` / `{ success, error }` (Req. 9.4).
