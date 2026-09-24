---
inclusion: auto
name: platform-console
description: Consola Super-Admin (plataforma) de Fundo360 — dueño/soporte del SaaS. Cubre onboarding de clientes, feature flags, métricas de plataforma, vista de soporte (impersonación solo-lectura), auditoría y las Edge Functions platform-*. Úsalo al trabajar en apps/web/src/app/(platform), en cualquier Edge Function platform-*, o en features de super-admin/multi-tenant a nivel plataforma.
---

# Consola Super-Admin (Plataforma) — Fundo360

Panel del **dueño/soporte del SaaS**, separado del dashboard de cliente. Gestiona todos los
tenants sin pertenecer a ninguno.

## Quién accede

- El acceso es exclusivo de **`platform_admins`** (tabla propia, fuera de `workers`).
- Un platform admin **no tiene** `org_id` ni fila en `workers`; su JWT trae
  `is_platform_admin=true` (inyectado por `custom_access_token_hook`).
- Guard: `apps/web/src/app/(platform)/layout.tsx` valida contra `platform_admins`.
- En las Edge Functions, el guard es `isPlatformAdmin(req)` (de `_shared/auth.ts`).

## Ubicación del código

- **Frontend**: `apps/web/src/app/(platform)/platform/`
  - `page.tsx` → Organizaciones (tenants): lista, KPIs, filtros, alta de cliente.
  - `[orgId]/page.tsx` → Vista de ambiente + "Modo soporte" (solo-lectura).
  - `feature-flags/page.tsx` → gestión de feature flags.
  - `audit/page.tsx` → Platform Audit Log.
  - Componente `apps/web/src/components/platform/StatCard.tsx` para los KPIs.
- **Backend (Edge Functions)**: `supabase/functions/platform-*` y `organizations`.
  Todas: guard `isPlatformAdmin`, `createServiceClient()` (bypass RLS para leer/escribir
  cross-tenant), respuestas `success`/`error` de `_shared/response.ts`, y auditoría
  best-effort con `logPlatformAction(req, admin, orgId|null, action, resource, detail)`.

## Módulos

### Onboarding de clientes (`POST /organizations`)

Crea en un solo paso (atómico, con compensación best-effort):

1. La organización.
2. El usuario de Auth (`auth.admin.createUser`, email + password que define el super-admin).
3. El `worker` admin (`role='admin'`, `organization_id` explícito, `auth_user_id`,
   `must_change_password=true`).

Devuelve `{ organization, admin: { worker_id, auth_user_id, email } }` (nunca la contraseña).
Audita `create_tenant`. El admin creado debe cambiar la contraseña en su primer login
(ver más abajo).

### Cambio de contraseña forzado

- Columna `workers.must_change_password`. El login (`POST /auth/login`) la expone.
- `POST /auth/change-password`: cambia la contraseña del usuario autenticado y limpia la
  bandera.
- Guards: dashboard web (`(dashboard)/layout.tsx`) y `AuthGate` móvil redirigen a la
  pantalla de cambio mientras la bandera esté activa.

### Feature Flags

Ver steering **`feature-flags`** para el detalle y la regla de gating. En la consola:
`platform-feature-flags` (Edge Function CRUD + overrides) y `/platform/feature-flags` (UI).

### Métricas de plataforma (`platform-metrics`)

Edge Function GET, solo-lectura, agrega cross-tenant sobre datos existentes (ventana 30 días):
cosecha (cantidad y valor), cosecheros activos, liquidaciones pendientes/pagadas, pagos 30d.
Se muestran como KPIs en `/platform`.

### Vista de soporte (impersonación de solo-lectura)

`platform-org-detail/:orgId/:resource` (recursos: `workers`, `fields`, `settlements`,
`recent-picking`). Permite **inspeccionar** los datos del cliente **sin poder modificarlos
ni asumir su sesión** (a diferencia de una impersonación con escritura, que se descartó por
riesgo). Cada acceso se audita como `view_org_detail`. UI: pestañas "Modo soporte" en
`/platform/[orgId]`.

### Auditoría (`platform-audit-log` / `platform_audit_log`)

Registro append-only de acciones de plataforma. Toda acción sensible del super-admin
(crear tenant, cambiar suscripción, feature flags, ver datos de soporte) se registra con
`logPlatformAction`. La UI de `/platform/audit` etiqueta cada acción.

## Convenciones al extender la consola

- **Nueva Edge Function de plataforma**: seguir el patrón `platform-*` — guard
  `isPlatformAdmin`, `createServiceClient`, `success/error`, routing por
  `url.pathname.split('/')`, y auditar con `logPlatformAction`.
- **Módulos que requieren backend nuevo** (billing/Stripe/MRR, DTE/SII): NO existen aún;
  no asumir que hay datos. Mostrar solo lo que la BD real soporta.
- **CORS**: las Edge Functions comparten `_shared/cors.ts`. Cualquier header que envíe el
  cliente (p. ej. `apikey`, `x-client-info`) debe estar en `Access-Control-Allow-Headers`
  o el preflight cross-origin falla en producción (Vercel → Supabase).

## Despliegue (importante)

- Migraciones y Edge Functions se despliegan **directo con el CLI**, no por git/Vercel:
  `supabase db push` y `supabase functions deploy --project-ref <ref>`.
  Tras cambiar cualquier función (o `_shared/*`), hay que redeployar para que aplique.
- El frontend (`apps/web`) se despliega en Vercel desde `main`; usa
  `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key).
