# Informe de preparación para MVP — Fundo360

> Investigación de solo lectura. No se modificó código. Evidencia citada con rutas reales del repo.
> Fecha de análisis sobre el estado de `main` (HEAD `c32e997`).

---

## 1. Resumen ejecutivo y veredicto de distancia a MVP

**Veredicto corto: el producto está mucho más cerca de lo que el roadmap sugiere en cuanto a funcionalidad de dominio (Fase 1, 2 y gran parte de 3 están construidas de punta a punta: DB → Edge Function → UI), pero NO está listo para entregarse a un cliente real que se autoconfigure sin un ingeniero. Hay un bloqueador P0 claro: un administrador de cliente no puede crear usuarios con login (supervisores, encargados, otros admins) desde ninguna interfaz. Hoy eso solo ocurre por el onboarding del super-admin de plataforma o por SQL.**

Dicho de otra forma:

- La **maquinaria de cosecha, tarifas, liquidaciones, pagos, métricas, destare, pago por kilo, variedades, guías de despacho y RBAC configurable** existe y está cableada. El flujo de terreno (escaneo QR → paño → melga → cantidad → confirmar, con cola offline) está completo y pulido.
- El **aislamiento multi-tenant (RLS)** está habilitado en todas las tablas de dominio y las Edge Functions toman el `organization_id` del JWT, nunca del cliente. Esto es sólido.
- El **hueco crítico** es de aprovisionamiento de personas: el cliente no tiene manera autoservida de darle acceso (login) a su equipo. Puede crear trabajadores con badge QR (sin login), pero no supervisores/encargados/admins que inicien sesión.

**Distancia estimada a un handoff a cliente real para testing de terreno: pequeña-a-mediana.** El grueso del trabajo ya está hecho; lo que falta es sobre todo (a) la UI de gestión de usuarios con credenciales dentro del dashboard del cliente, (b) la generación/impresión de badges QR para uso real en terreno, y (c) endurecimiento operacional (CI, rate limiting, verificación de flujos completos contra el remoto). Ver §8 para la lista priorizada.

---

## 2. Estado por feature (DONE / PARCIAL / FALTA con evidencia)

### Fase 1 (MVP): Campos, Trabajadores, Tarifas, Picking, Consulta, RBAC

| Feature | Estado | Evidencia |
|---|---|---|
| Estructura productiva (campos, paños, melgas, productos, variedades) | **DONE** | Migraciones `20260822000002_create_fields.sql`, `_000003_create_blocks.sql`, `20260831000003_create_field_rows.sql`, `20261003000001_create_product_varieties.sql`; Edge `fields/`, `blocks/`, `field-rows/`, `products/`, `varieties/`; UI web `app/(dashboard)/fields/*`, móvil `app/admin/fields/*`, `app/admin/products.tsx` |
| Tarifas con historial e inmutabilidad | **DONE** | Migración `_000004_create_rates.sql`; Edge `rates/index.ts` (versionado current/historical); tarifa por producto y por variedad (`20261003000002_add_rates_variety_id.sql`) |
| Registro de picking rápido con QR | **DONE** | Edge `picking-records/index.ts` (POST, `/scan`, PUT corrección misma jornada); móvil `app/(tabs)/register.tsx` (scan→paño→melga→cantidad→confirmar), `src/components/QRScanner.tsx` |
| Consulta de producción del trabajador | **DONE** | Edge `picking-records/index.ts` `GET /my[/today]`; móvil `app/(tabs)/production.tsx`, `profile.tsx` (stats y badge QR propio) |
| RBAC (admin/supervisor/crew_lead/worker) | **DONE** | Migraciones `_000009_auth_roles_setup.sql`, `_000010_row_level_security.sql`, `20260829000009_add_crew_lead_role.sql`; `_shared/auth.ts` (`requireRole`, `requirePermission`) |
| RBAC configurable (perfiles de permisos) | **DONE** | Migración `20260927000002_create_permission_profiles.sql` (+ `_000003_rbac_phase_b_rls.sql`); Edge `permission-profiles/`; móvil `app/admin/permission-profiles.tsx`; claim `permissions` inyectado en `custom_access_token_hook` |
| **Creación de usuarios con login por el admin del cliente** | **FALTA (P0)** | Ni web ni móvil recogen email/password al crear workers: `apps/web/src/app/(dashboard)/workers/page.tsx:176` y `apps/mobile/app/admin/workers.tsx` insertan directo en `workers` (solo badge). La capacidad existe en `supabase/functions/workers/index.ts:handlePost` (crea auth user si llegan email+password) pero **ninguna UI la invoca** |

### Fase 2: Liquidaciones, Pagos, Asignación de supervisión

| Feature | Estado | Evidencia |
|---|---|---|
| Generación de liquidaciones (individual y cuadrilla, 2 niveles) | **DONE** | Edge `settlements/index.ts` (`/generate` nivel 1 cliente→encargado, `/crew-generate` nivel 2 encargado→trabajadores); cálculo por unidad box/kg; móvil `app/admin/settlements.tsx`, web `app/(dashboard)/settlements/page.tsx` |
| Pagos con inmutabilidad y saldo | **DONE** | Migración `_000008_create_settlements_and_payments.sql`; Edge `payments/index.ts`; trigger `prevent_paid_settlement_update`; evidencia foto de pago `20261006000001_create_payment_photo_evidence.sql` |
| Asignación de supervisión | **DONE** | Edge `supervisors/index.ts`; migración `_000006_create_supervisor_assignments.sql`; móvil `app/admin/supervisors.tsx`, web `app/(dashboard)/supervisors/page.tsx` |
| Modo capataz / cuadrillas | **DONE** | Migraciones `20260829000010_create_crews.sql`, `20260830000001_crew_supervisor_and_crew_payments.sql`, `20260901000001_create_day_roster.sql`; Edge `crews/`; móvil `app/admin/crews.tsx`, `(tabs)/crew.tsx`, `team.tsx` |

### Fase 3: Métricas, Rankings, Reportes, Alertas

| Feature | Estado | Evidencia |
|---|---|---|
| Dashboard de métricas | **DONE** (sin realtime en vivo) | Edge `metrics/index.ts` (summary, production/daily, by-block, by-row, by-field, workers/ranking, costs/per-hectare); web `app/(dashboard)/dashboard/page.tsx` con Recharts. **Nota**: usa TanStack Query (polling), no una suscripción Supabase Realtime, pese a la meta de "tiempo real" en `product.md` |
| Reportes exportables (PDF/CSV) | **DONE** (bajo flag) | `apps/mobile/src/lib/export/` (csv.ts, settlement-pdf.ts con tests), web `components/settlement/SettlementPDF.tsx`, hook `useReportExport.ts`; flag `report_export` (`20261004000001`) |
| Guías de despacho | **DONE** | Edge `dispatch-guides/index.ts` (670 líneas, no es stub), migraciones `20261005000001/2/3`; móvil `app/admin/dispatch-guides/*`, web `app/(dashboard)/dispatch-guides/*` |
| Destare / control de merma | **DONE** | Migración `20260927000001_create_box_types_and_tare.sql`; lógica en `picking-records` y `register.tsx`; flag `box_tare_control` |
| Pago por kilo + variedades | **DONE** | Migraciones `20261003000001-005`; flags `kg_payment`, `product_varieties` |
| Alertas configurables / push | **FALTA** | `field-management/tasks.md` task 38 sin marcar; no hay código de notificaciones push. Solo existe la alerta no bloqueante de merma en el registro |

### Multi-tenant / Plataforma

| Feature | Estado | Evidencia |
|---|---|---|
| Organizaciones + aislamiento por tenant | **DONE** | `20260829000001_create_organizations.sql`, `_000004_add_organization_id.sql`, `_000005_tenant_composite_fks.sql`, `_000007_multitenant_rls.sql` |
| Consola super-admin | **DONE** | web `app/(platform)/platform/*` (orgs, feature-flags, audit, [orgId]); Edge `platform-*`, `organizations/` |
| Onboarding de cliente (crear org + admin) | **DONE pero SOLO super-admin** | `supabase/functions/organizations/index.ts:handleCreate` (platform-admin only); UI `app/(platform)/platform/page.tsx` |
| Feature flags (3 capas) | **DONE** | `20260913000002_create_feature_flags.sql`; Edge `platform-feature-flags/`; hooks `useFeatureFlag` (web y móvil); helper `resolveFeatureFlag` en shared |
| Branding por tenant | **DONE** | `organizations/index.ts:handlePatchBranding`; hooks `useBranding.ts` (web y móvil) |
| Enforcement de suscripción | **DONE** | `20260829000008_subscription_enforcement.sql`: el `custom_access_token_hook` no inyecta `org_id` si la suscripción no está `trial/active` → RLS niega datos |

---

## 3. Onboarding de cliente nuevo (ruta actual + gaps)

### Ruta que SÍ funciona hoy

1. El **super-admin de plataforma** entra a `/platform` (web) y crea la organización + su primer admin con email/contraseña en un paso atómico. Evidencia: `apps/web/src/app/(platform)/platform/page.tsx:269` (invoca `organizations`) y `supabase/functions/organizations/index.ts:handleCreate`. La UI muestra las credenciales para entregárselas al cliente (`page.tsx:287-310`).
2. Ese admin inicia sesión; `must_change_password=true` lo fuerza a cambiar la contraseña (`auth/index.ts:handleChangePassword`, guards en `(dashboard)/layout.tsx` web y `AuthGate` móvil).
3. Ya dentro, el admin **puede** crear/editar campos, paños, melgas, productos, variedades, tarifas, tipos de caja, cuadrillas, perfiles de permisos y **trabajadores con badge QR** — todo desde la app (web o móvil).

### Gaps que BLOQUEAN el autoservicio

- **(P0) No hay UI para crear usuarios con login dentro del tenant.** El admin del cliente necesita que sus **supervisores** y **encargados (crew_lead)** inicien sesión en la app móvil para registrar cosecha; y quizás un segundo admin. Pero:
  - `apps/mobile/app/admin/workers.tsx` (formulario de trabajador) solo pide nombre, RUT, teléfono, rol y perfil — **no pide email ni contraseña** — e inserta directo en la tabla `workers`. Sin `auth_user_id`, ese worker no puede autenticarse.
  - `apps/web/src/app/(dashboard)/workers/page.tsx:176` hace exactamente lo mismo (insert directo, solo badge).
  - La única ruta que crea el usuario de Auth es `supabase/functions/workers/index.ts:handlePost` (si llegan `email`+`password`), pero **ninguna pantalla la invoca con esos campos**. Verificado: ninguna UI fuera de login/change-password/consola-plataforma recoge `password`.
  - Consecuencia: para que un cliente tenga supervisores/encargados que inicien sesión, hoy hay que crearlos por SQL (`scripts/seed-users*.sh`, `supabase/_seed_remote.sql`) o pedírselo al super-admin. **Eso no es autoservicio.**
- **(P1) No hay signup self-serve de la organización.** Un cliente no puede registrar su propia org; siempre depende del super-admin (`handleCreate` es platform-admin only). Para un piloto controlado esto puede ser aceptable (el dueño del SaaS da de alta al cliente), pero conviene decidirlo explícitamente.
- **(P1) Sin recuperación de contraseña autoservida.** Solo existe cambio de contraseña autenticado (`/auth/change-password`). Si un supervisor olvida la suya, no hay flujo de reset; dependería del admin/soporte.

---

## 4. Flujo end-to-end de terreno

**Veredicto: el flujo núcleo funciona de DB a UI, con una fuerte orientación a terreno (offline, háptica, pasos grandes).** Lo verificado:

- **Registro por QR**: `register.tsx` escanea el badge (`QRScanner`), resuelve el worker por `qr_badge_url`, valida que esté en el **equipo del día** del responsable (`day_roster`) cuando es supervisor/encargado, elige paño → melga (si el paño tiene melgas activas) → cantidad, resuelve la tarifa vigente (del producto o de la variedad), y inserta. El `work_day` lo fija el trigger `set_picking_work_day` en la zona horaria del tenant (no UTC). Soporta destare (peso bruto→neto), pago por kilo (manual o por caja pesada) y foto de respaldo. Evidencia: `apps/mobile/app/(tabs)/register.tsx` + `supabase/functions/picking-records/index.ts`.
- **Offline**: si no hay conexión, el registro se encola (`src/lib/offline-queue.ts`, `enqueue`) y se sincroniza al reconectar (`useOfflineSync.ts`, `useConnectivity.ts`, banner `OfflineBanner.tsx`). El flag `offline_sync` viene **on** por defecto. La foto de respaldo requiere conexión y se informa si se omite por estar offline.
- **Consulta del trabajador**: `production.tsx` y `profile.tsx` muestran cajas/kg y estimado del día; el worker ve su propio badge QR para presentarlo (`profile.tsx`).
- **Liquidación → pago → saldo**: el admin genera liquidaciones (`settlements/generate`), registra pagos (`payments`), y el trabajador consulta `settlements/my` / saldo. La inmutabilidad tras el pago está garantizada por trigger (`prevent_paid_settlement_update`).

**Posibles cortes / riesgos del flujo:**

- **Generación y entrega del badge QR físico.** La app genera el UUID y lo muestra como QR en pantalla (`workers.tsx:BadgeModal`, `profile.tsx`, web `components/ui/QRBadge.tsx`), pero **no hay un flujo de impresión/exportación de badges en lote** para plastificar y repartir en terreno. Un cliente real necesita imprimir decenas de badges. Hoy habría que capturarlos uno a uno. (P1)
- **Dependencia del `day_roster`.** Supervisores/encargados solo pueden registrar a trabajadores que estén en su equipo del día (`register.tsx` → bloquea con "no está en tu equipo de hoy"). Correcto por diseño, pero exige que el responsable arme el roster diario (`DayRosterManager.tsx`, `team.tsx`); si el onboarding/capacitación no lo cubre, en terreno parecerá "no me deja registrar".
- **Dashboard "tiempo real"** es en realidad polling vía TanStack Query, no Supabase Realtime. Cumple la meta de latencia ≤5 min, pero no es streaming en vivo.

---

## 5. Seguridad multi-tenant / RLS

**Veredicto: sólida. No se detectó ninguna tabla de dominio sin RLS ni Edge Function que acepte `organization_id` desde el cliente.**

- **Cobertura RLS total**: las 23 tablas creadas tienen `ENABLE ROW LEVEL SECURITY` (conteo 1:1 entre `CREATE TABLE` y `ENABLE RLS` en `supabase/migrations/`). Incluye `organizations`, `platform_admins`, `platform_audit_log`, `platform_feature_flags`, `organization_feature_flags`, y todas las de dominio.
- **Patrón de aislamiento**: 23 migraciones referencian `current_org_id()`; el patrón estándar es `is_platform_admin() OR (<predicado_rol> AND organization_id = current_org_id())` (`20260829000007_multitenant_rls.sql`).
- **El tenant nunca viene del cliente**: las Edge Functions toman `organization_id` del JWT vía `getOrgId(req)` (p. ej. `workers/index.ts`, `picking-records/index.ts`, `settlements/index.ts`), y hay un trigger `set_organization_id` (`20260830000003`) que lo completa en inserts directos desde el cliente (como hace `workers.tsx`). Los helpers `requireOrg`/`CROSS_TENANT_FORBIDDEN` existen en `_shared/auth.ts`.
- **Evidencia de picking/pagos** (Storage): aislada por prefijo de path = `organization_id` (`20261002000001_create_picking_photo_evidence.sql`, `20261006000001_create_payment_photo_evidence.sql`), con políticas sobre `storage.objects`.
- **Suscripción**: el hook de JWT corta el acceso (no inyecta `org_id`) si la org no está `trial/active` (`20260829000008`).

**Observaciones (no bloqueantes, pero a revisar antes de producción):**

- `decodeClaims` en `_shared/auth.ts` **decodifica el JWT sin verificar la firma** para leer `app_role`/`org_id`/`permissions`. Esto es aceptable porque la barrera real es RLS (que sí valida el token vía `auth.uid()`), pero implica que las comprobaciones de rol en las Edge Functions confían en un claim no verificado a nivel de función. Mientras RLS esté bien (lo está), no es explotable para leer datos de otro tenant; conviene documentarlo como decisión consciente.
- El claim `permissions` de RBAC se endurece en SQL (`has_permission`, fase B, `20260927000003`), lo que es correcto (no depende solo del backend).

---

## 6. Usabilidad en terreno

**Lo sólido:**

- **Accesibilidad de texto**: `AppText`/`AppTextInput` + `useFontScale` permiten agrandar todo el texto de la app (3 tamaños), gestionado desde `profile.tsx`. Pensado para baja alfabetización/visión. Evidencia: `apps/mobile/src/components/AppText.tsx`, `src/hooks/useFontScale.tsx`.
- **Flujo de pocos toques** con indicador de pasos, háptica (`expo-haptics`) y overlay de éxito (`SuccessOverlay.tsx`). Compatible con la meta <10s.
- **Offline-first** real (cola + banner + sync), apropiado para conectividad rural intermitente.
- **Confirmaciones y estados vacíos** cuidados (`EmptyState`, skeletons).

**Lo riesgoso / pendiente:**

- **Impresión de badges QR en lote** (ver §4): es un prerrequisito físico para operar en terreno y hoy no existe un flujo cómodo. (P1)
- **Capacitación del roster diario**: el gating por `day_roster` es correcto pero puede confundir en terreno sin material de apoyo. Existe documentación en `docs/pruebas/` (MkDocs), pero conviene una guía específica de "primer día de cosecha".
- **Dependencia de la IP LAN en dev** (`local-env.md`): es un tema de desarrollo, no afecta al cliente en el remoto (apunta a Supabase Cloud), pero sí afecta la capacidad del equipo para demostrar/depurar.
- **Sin notificaciones push** (resumen de jornada, alertas) — Fase 3 incompleta; no bloquea el MVP de terreno.

---

## 7. Calidad / tests / CI / ops

- **Tests unitarios**: 64 tests pasan (`npx vitest run packages/shared` → 6 archivos, 64 ok). Cubren reglas de pago (box/kg), destare, evidencia y guías de despacho (`packages/shared/src/types/*.test.ts`, `apps/*/src/lib/export/*`). Son property/unit tests de invariantes de dominio — valiosos pero **no cubren las Edge Functions ni los flujos end-to-end**.
- **Sin tests de las Edge Functions** ni de aislamiento de tenant automatizados (las tasks 18/31/39/44 de `multi-tenant-hierarchy/tasks.md` que pedían esos tests están sin marcar). El aislamiento se validó por lectura de código, no por pruebas automatizadas.
- **CI**: solo existe `.github/workflows/docs.yml` (publica MkDocs). **No hay CI de build/lint/test/typecheck.** Un handoff a cliente debería al menos correr `tsc`, lint y vitest en cada push. (P1)
- **Lint**: `apps/mobile` reporta 0 errores y ~89 warnings preexistentes (`no-explicit-any`, `exhaustive-deps`) — no bloqueante.
- **Rate limiting**: **no existe** en ninguna Edge Function (grep sin resultados). `api-design.md` y las convenciones de `tech.md` lo mencionan como requisito para endpoints públicos. El endpoint más expuesto es `auth/login`. (P1)
- **Logging estructurado / correlation ID**: `tech.md` lo exige; las Edge Functions usan `success/error` simples sin logs JSON con correlation ID. (P2)
- **Despliegue**: migraciones y Edge Functions se publican con `supabase db push` / `functions deploy` (no por git), y el web por Vercel desde `main` (`platform-console.md`). Operación manual; funciona pero es frágil para un equipo.
- **Especificaciones desactualizadas**: `multi-tenant-hierarchy/tasks.md` tiene TODAS las tasks sin marcar `[ ]` aunque las migraciones y funciones demuestran que el trabajo está hecho. Las checkboxes de specs **no son fuente de verdad confiable** del estado real.
- **Estado del repo**: hay cambios sin commitear en `package.json`/lockfile y carpetas `.worktrees/` y `.agents/tasks/*` no versionadas. El crash del drawer admin ("pantalla verde / se cierra") que reportó el usuario fue diagnosticado y corregido: doble aplicación del plugin de worklets en `apps/mobile/babel.config.js` (ver `.agents/tasks/admin-drawer-crash/verification.md`); el fix requiere **reconstruir el APK** (no basta recargar JS).

---

## 8. Blockers priorizados (P0 / P1 / P2) con esfuerzo estimado

### P0 — Bloquean el handoff a un cliente real que se autoconfigura

1. **UI de gestión de usuarios con login (supervisores, encargados, admins) en el dashboard del cliente.** Hoy ninguna pantalla crea `auth_user_id`. Hay que conectar los formularios de workers (web `workers/page.tsx`, móvil `admin/workers.tsx`) a `supabase/functions/workers/index.ts:handlePost` enviando email+password (y setear `must_change_password`), o añadir un endpoint dedicado de "invitar usuario". **Esfuerzo: M.** (Es el verdadero cuello de botella del autoservicio.)
2. **Verificar el crash del admin en un APK reconstruido.** El fix ya está en `babel.config.js`, pero el usuario reportó pantalla verde/cierre; hay que compilar el APK release e instalar para confirmar que `/admin` abre en el equipo físico. **Esfuerzo: S** (build + prueba en dispositivo).

### P1 — Importantes antes de un piloto serio

3. **Generación/impresión de badges QR en lote** (PDF imprimible de badges por trabajador) para repartir en terreno. **Esfuerzo: M.**
4. **Reset de contraseña autoservido** (o flujo claro de soporte) para usuarios que olvidan su clave. **Esfuerzo: S-M.**
5. **CI mínima** (typecheck + lint + vitest en cada push/PR). **Esfuerzo: S.**
6. **Rate limiting en endpoints públicos**, al menos `auth/login`. **Esfuerzo: S-M.**
7. **Pruebas end-to-end del flujo crítico contra el remoto** (login → armar roster → registrar picking → liquidar → pagar → consultar) con los dos tenants de prueba, para dar por bueno el handoff. **Esfuerzo: M.**
8. **Decidir y documentar el modelo de alta de clientes** (solo super-admin vs self-serve). Si se queda en super-admin, basta con procedimentarlo. **Esfuerzo: S.**

### P2 — Deseables, no bloquean el testing

9. Dashboard con **Supabase Realtime** real (hoy es polling). **Esfuerzo: M.**
10. **Notificaciones push / alertas** (Fase 3 pendiente, task 38). **Esfuerzo: L.**
11. **Logging estructurado JSON + correlation ID** en Edge Functions. **Esfuerzo: M.**
12. Tests automatizados de **aislamiento multi-tenant** (tasks 18/31/39/44). **Esfuerzo: M.**
13. **Sincronizar las checkboxes de las specs** con la realidad para no engañar al próximo que lea `tasks.md`. **Esfuerzo: S.**

---

## 9. Recomendación final y checklist mínima para handoff a cliente real

**Recomendación:** el producto NO está "lejos" de un MVP entregable — la funcionalidad de dominio está construida y el aislamiento multi-tenant es sólido. Lo que falta es un puñado de piezas de **aprovisionamiento y operación**, encabezadas por un único bloqueador real: que el admin del cliente pueda dar acceso (login) a su propio equipo. Resuelto eso y validado el flujo completo contra el remoto, se puede entregar a un piloto controlado.

Modelo de entrega sugerido para el primer cliente: **el dueño del SaaS (super-admin) da de alta la organización y su primer admin** (flujo que ya funciona), y a partir de ahí el cliente se autoconfigura — **siempre que exista la UI de creación de usuarios con login (P0 #1)**.

### Checklist mínima antes del handoff

- [ ] **P0-1** El admin del cliente puede crear supervisores, encargados y otro admin **con credenciales de login** desde el dashboard (web y/o móvil), con `must_change_password`.
- [ ] **P0-2** APK release reconstruido y verificado: `/admin` abre y navega en un equipo Android físico (sin pantalla verde / cierre).
- [ ] **P1-3** Existe una forma de **imprimir los badges QR** de los trabajadores para terreno.
- [ ] **P1-4** Flujo de **recuperación/reset de contraseña** (o procedimiento de soporte documentado).
- [ ] **P1-5** CI corriendo typecheck + lint + vitest.
- [ ] **P1-6** Rate limiting en `auth/login`.
- [ ] **P1-7** Flujo end-to-end validado en el **remoto** con los dos tenants (login → roster → picking QR → offline sync → liquidación → pago → consulta del trabajador).
- [ ] **P1-8** Decisión documentada sobre alta de clientes (super-admin vs self-serve).
- [ ] Verificación de que un cliente creado de cero puede: configurar campos/paños/productos/tarifas, crear su equipo (con logins), armar el roster del día, registrar cosecha por QR y generar/pagar una liquidación — **todo sin que nadie ejecute SQL**.

---

### Apéndice: cómo se verificó

- Lectura exhaustiva de `.kiro/steering/*` (product, tech, structure, api-design, domain-rules, feature-flags, platform-console, data-model-seeding, remote-env) y specs `field-management/`, `multi-tenant-hierarchy/`.
- Enumeración del esquema real en `supabase/migrations/` (51 migraciones) y conteo de cobertura RLS (23/23 tablas).
- Lectura de Edge Functions clave: `organizations`, `auth`, `workers`, `picking-records`, `settlements`, `metrics`, `_shared/auth.ts`.
- Lectura de pantallas móviles (`register.tsx`, `profile.tsx`, `admin/workers.tsx`, `admin/_layout.tsx`, `AdminGuard.tsx`) y web (`workers/page.tsx`, `dashboard/page.tsx`, `platform/page.tsx`).
- Ejecución de `npx vitest run packages/shared` (64 tests OK).
- Búsquedas de `password` en UI, `createUser`, rate limiting, realtime, stubs/TODOs; inspección de `git log` y estado del árbol.
