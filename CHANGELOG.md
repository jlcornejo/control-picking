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

- **Set de pruebas manuales por perfil** (`docs/pruebas/`): casos paso a paso para
  Supervisor/Anotador (requisito mínimo de terreno), Administrador, Encargado y Trabajador,
  más la guía de preparación del entorno (web contra remoto) y usuarios de prueba.
- **Actualizaciones OTA (`expo-updates`)** en la app móvil: `runtimeVersion` con política
  `appVersion` y endpoint EAS Update por canal (`preview` / `production`). A partir del
  próximo build, los cambios solo-JS se entregan por `eas update` sin reinstalar. Requiere
  un rebuild EAS esta vez para incorporar el runtime de updates.
- **Foto de respaldo en el registro de picking** (feature flag `picking_photo_evidence`,
  por organización): el supervisor/anotador puede adjuntar una foto como comprobante al
  registrar la cosecha. Bucket privado de Storage `picking-evidence` aislado por tenant
  (ruta `{org_id}/{record_id}/{uuid}.jpg`, policies RLS sobre `storage.objects`), columna
  opcional `picking_records.backup_image_path` (snapshot, no altera el pago), captura con
  cámara reusando `expo-camera` (sin recompilar: entregable por OTA) y acceso con URL
  firmada temporal. La evidencia es inmutable (sin UPDATE/DELETE para roles de terreno).
- **Accesibilidad: tamaño de texto configurable** (Normal / Grande / Extra grande) desde el
  perfil móvil, persistido por usuario. Pensado para administradores de fundo con baja
  visión. Escala todo el texto de la app sin depender de los ajustes del sistema operativo.
- **Centro de documentación del proyecto** (MkDocs): nuevas secciones **Legacy / Paridad**
  (`docs/legacy/` — mapa funcional de la app legacy "Campo Viejo", paridad con Fundo360 y
  decisiones de negocio pendientes) y **Planning** (`docs/planning/` — etapas, estado,
  estimaciones por tema y tablero tipo Kanban). Se publica el changelog en el sitio
  (`docs/changelog.md`) y se actualiza la navegación (`docs/.pages`, `index.md`).
  Centraliza documentación y seguimiento del proyecto, compartible por GitHub Pages sin
  depender de Jira/Confluence.
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
- **RBAC Fase B + control de destare/tolerancia + perfiles de permisos**: catálogo de
  tipos de caja/envase por organización (`box_types`) con tara, peso neto objetivo y banda
  de tolerancia (feature flag `box_tare_control`); el picking guarda un snapshot de pesaje
  (`gross_weight_kg`, `tare_snapshot_kg`, `net_weight_kg`, `out_of_tolerance`) que **no
  altera el pago** (sigue siendo por `quantity`). Perfiles de permisos (`permission_profiles`)
  y endurecimiento de RLS por rol. Incluye Edge Functions `box-types` y `permission-profiles`,
  tipos/validación en `@fundo360/shared`, pantallas admin y migraciones `20260927*`.

### Cambiado

- **Rediseño de la consola super-admin** al estilo del panel de plataforma (KPIs con
  `StatCard`, filtros por estado de suscripción, tabla enriquecida, banner de sesión
  auditada, Platform Audit Log con nuevas acciones etiquetadas).
- **Iconografía profesional en la app móvil**: se reemplazaron los emojis incrustados
  (cámara, trabajador/paño/melga, check, flechas, logo, ojo de contraseña) por íconos
  Ionicons en registro, producción, pagos, cuadrilla, login, `PhotoCapture`, `QRScanner` y
  el splash. Aspecto consistente en web y nativo.
- **Etiquetas de la barra de navegación** acortadas para que no se corten en pantallas
  angostas (Panel, Campo, Pagos, Equipo, Cuadrilla, Perfil); el encabezado de cada pantalla
  conserva el nombre completo.

### Corregido

- **CORS de Edge Functions**: `_shared/cors.ts` no incluía el header `apikey` (ni
  `x-client-info`) en `Access-Control-Allow-Headers`. El SDK de Supabase los envía en
  llamadas cross-origin, por lo que el preflight fallaba y la consola desplegada no cargaba
  datos. Se añadieron ambos headers y se redesplegaron las funciones.
- **Alertas no visibles en web** (`Alert.alert` es no-op en `react-native-web`): el registro
  de picking y otras pantallas no mostraban avisos ni confirmaciones al probar en navegador.
  Nuevo helper `showAlert` (web usa `window.alert`/`window.confirm`; nativo usa `Alert.alert`)
  aplicado en registro, producción, pagos, cuadrilla y `DayRosterManager`; `SuccessOverlay`
  usa el driver JS de animación en web. En dispositivo el comportamiento nativo no cambia.
- **El supervisor no podía registrar pagos de cuadrilla** (RLS): `payments` no tenía policy
  de `INSERT` ni `settlements` de `UPDATE` para el supervisor, así que al pagar una
  liquidación de cuadrilla fallaba con violación de RLS y el estado no pasaba a *pagado*.
  Se añadieron dos policies acotadas a las cuadrillas que supervisa
  (`supervisor_insert_crew_payments`, `supervisor_update_crew_settlements`). No relaja la
  inmutabilidad de liquidaciones pagadas.
- **El supervisor/encargado no veía la tarifa vigente al registrar** (RLS): `rates` solo
  permitía lectura a admin, por lo que el registro fallaba con "Sin tarifa vigente para este
  producto". Nueva policy `member_read_current_rates` (lectura de tarifas `current` de su
  organización para supervisor/encargado/trabajador).

### Infra/Deploy

- Migraciones aplicadas al remoto `fundo360` (`day_roster`, `day_roster_rls`,
  `worker_must_change_password`, `create_feature_flags`) vía `supabase db push`.
- Migraciones RBAC/box-types (`20260927*`) y las de octubre (`picking_photo_evidence`,
  `member_read_current_rates`, `supervisor_insert_crew_payments`) aplicadas al remoto
  `fundo360` y versionadas en `supabase/migrations/`.
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
