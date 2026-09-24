# Changelog

Registro de cambios relevantes de Fundo360. Formato basado en
[Keep a Changelog](https://keepachangelog.com/es/1.1.0/).

Convenciones:

- Se agrupan los cambios por tipo: **Añadido**, **Cambiado**, **Corregido**, **Infra/Deploy**.
- El backend Supabase (migraciones y Edge Functions) se despliega **directo con el CLI**
  (`supabase db push`, `supabase functions deploy`), no vía git/Vercel. El frontend web
  (`apps/web`) se despliega en Vercel desde `main`.
- Mantener este archivo actualizado en cada feature o fix relevante.

## [Sin publicar]

### Añadido

- **Consola Super-Admin (plataforma)** — panel para el dueño/soporte del SaaS, separado
  del dashboard de cliente. Vive en `apps/web/src/app/(platform)/` y valida contra
  `platform_admins`.
  - **Onboarding de clientes**: `POST /organizations` crea en un solo paso la organización,
    su usuario de Auth y el `worker` admin (`role='admin'`), con `must_change_password=true`
    para forzar el cambio en el primer login. Compensación best-effort y auditoría
    `create_tenant`.
  - **Global Feature Flags**: catálogo global (`platform_feature_flags`) + overrides por
    tenant (`organization_feature_flags`). Edge Function `platform-feature-flags` (CRUD +
    overrides, solo super-admin, auditada). UI en `/platform/feature-flags` (KPIs, toggle
    global, gestor de overrides por organización). Ver steering `feature-flags`.
  - **Métricas de plataforma**: Edge Function `platform-metrics` (agregados cross-tenant,
    solo-lectura) — cosecha 30d, cosecheros activos, liquidaciones pendientes/pagadas,
    pagos 30d. KPIs en `/platform`.
  - **Vista de soporte (impersonación de solo-lectura)**: Edge Function
    `platform-org-detail/:orgId/:resource` (workers, fields, settlements, recent-picking).
    Permite inspeccionar datos del cliente sin poder modificarlos ni asumir su sesión.
    Cada acceso queda auditado (`view_org_detail`). UI: pestañas de "Modo soporte" en
    `/platform/[orgId]`.
- **Cambio de contraseña forzado**: columna `workers.must_change_password`; el login expone
  la bandera; endpoint `POST /auth/change-password`; guards en el dashboard web
  (`(dashboard)/layout.tsx`) y en el `AuthGate` móvil, con sus pantallas de cambio.
- **Roster diario trabajador–capataz** (`day_roster`): el responsable (Encargado/crew_lead
  o Supervisor) arma su equipo cada jornada. `picking_records.day_roster_id` congela la
  atribución del día. UI móvil `DayRosterManager` integrada en crew/register/team; gating
  por rol en la web (middleware expone `x-pathname`; el Sidebar muestra solo "Mi Cuadrilla"
  al crew_lead).
- **Datos de prueba del remoto**: `supabase/_seed_remote.sql` con 2 tenants (Sur Berries con
  melgas y Andes Fruit sin melgas, ambos con Modo Capataz), todos los roles, 30 días de
  historial de picking, liquidaciones, pagos y feature flags.
  Script `scripts/seed-users-remote.sh` para crear/vincular los usuarios de Auth.

### Cambiado

- **Rediseño de la consola super-admin** al estilo del panel de plataforma (KPIs con
  `StatCard`, filtros por estado de suscripción, tabla enriquecida, banner de sesión
  auditada, Platform Audit Log con nuevas acciones etiquetadas).

### Corregido

- **CORS de Edge Functions**: `_shared/cors.ts` no incluía el header `apikey` (ni
  `x-client-info`) en `Access-Control-Allow-Headers`. El SDK de Supabase los envía en
  llamadas cross-origin, por lo que el preflight fallaba y la consola desplegada no cargaba
  datos. Se añadieron ambos headers y se redesplegaron las funciones.

### Infra/Deploy

- Migraciones aplicadas al remoto `fundo360` (`day_roster`, `day_roster_rls`,
  `worker_must_change_password`, `create_feature_flags`) vía `supabase db push`.
- Las 19 Edge Functions desplegadas al remoto vía `supabase functions deploy`.
- `.kiro/settings/mcp.json` dejó de versionarse (puede contener API keys); añadido a
  `.gitignore`.

## [0.1.0] — Base del MVP

### Añadido

- **Multi-tenant**: organizaciones (tenants) con aislamiento por RLS; claims de JWT
  (`org_id`, `app_role`, `worker_id`, `is_platform_admin`) vía `custom_access_token_hook`;
  `platform_admins` y `platform_audit_log`.
- **Dominio de cosecha**: campos, paños (blocks), melgas (field_rows), productos, tarifas
  (rates) con historial, trabajadores (workers) con roles admin/supervisor/crew_lead/worker
  y badges QR.
- **Picking**: registro de cosecha con `rate_amount_snapshot` inmutable.
- **Liquidaciones y pagos**: settlements (individuales y de cuadrilla) y payments, con
  settlements inmutables cuando están `paid`.
- **Modo Capataz** (`crew_mode_enabled`) y **melgas** (`rows_enabled`) configurables por
  organización con override por campo.
- **Apps**: dashboard web (Next.js) y app móvil (Expo) sobre backend Supabase.
