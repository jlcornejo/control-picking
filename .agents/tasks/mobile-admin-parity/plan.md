# Implementation Plan — Paridad admin móvil + navegación híbrida (Fundo360)

> Base: `design.md` (aprobado, iteración 3) + `requirements.md` + `app-web-parity/findings.md`.
> Worktree: `/Users/ericksegura/Documents/backupHDD/personal/control-picking/.worktrees/mobile-admin-parity`
> (app móvil en `apps/mobile`, rama `feature/mobile-admin-parity`).
> **Todas las rutas de archivo abajo son relativas al worktree** salvo que digan "absoluto".
> Expo SDK 54, Expo Router 6, React 19, RN 0.81. TanStack Query v5 ya instalado.
>
> Verificación por paso (desde `apps/mobile` del worktree):
> - Typecheck: `npx tsc --noEmit`
> - Lint: `npm run lint` (equivale a `eslint app/ src/`)
> - Rutas Expo Router: `npx expo start` y confirmar resolución/montaje de rutas.
> Nota: el worktree **no tiene `node_modules` instalado** (verificado). El primer paso que
> toque dependencias debe correr `npm install` en la raíz del monorepo (workspaces) o
> `npx expo install` dentro de `apps/mobile`; sin eso `tsc`/`lint`/Expo no corren.
>
> Regla transversal (NO descartar por "ya funciona"): cada item marcado
> **[verificar durante implementación]** debe confirmarse en runtime/typecheck antes de darse
> por hecho; se documenta lo revisado, no se asume por lectura de código.
>
> No regresión obligatoria (NFR8): `app/(tabs)/team.tsx` (supervisor) y `app/(tabs)/crew.tsx`
> (encargado) **no se tocan**; `production.tsx` y `payments.tsx` solo cambian de forma aditiva
> o por extracción no-funcional de hooks.

---

## Orden de dependencias (resumen)

1. **Infra nativa + edge envelope** (dependencias, Babel, GestureHandlerRootView, `src/lib/edge.ts`) — base de todo.
2. **feat(nav): drawer híbrido** — convierte `admin/_layout` a Drawer + hamburguesa + guard; sin esto nada cuelga del drawer.
3. **feat(settings): configuración org (G4)** — pantalla + migración de `useOrgSettings`/`useBranding` (otras features dependen de que estos hooks ya estén migrados).
4. **feat(settlements): generación en móvil (G1)** — pantalla + hook `useSettlements`.
5. **feat(records): histórico + corrección (G2)** — pantalla + extracción de `usePickingCorrection`.
6. **feat(export): CSV/PDF (G5)** — integra en Registros (CSV) y Liquidaciones (PDF).
7. **feat(dispatch): guías de despacho (G3)** — stub provisional bajo flag (implementación completa diferida).

---

- [ ] 1. Instalar dependencias nativas y de export, configurar Babel/Reanimated y envolver la raíz; crear el tipo `Envelope<T>`.
      Correr `npx expo install @react-navigation/drawer react-native-gesture-handler react-native-reanimated expo-print expo-sharing expo-file-system` (fija versiones compatibles con SDK 54). Editar `apps/mobile/babel.config.js` para añadir `plugins: ['react-native-reanimated/plugin']` **dentro del objeto retornado por la función** y **al final** del array (ver design §2.5, snippet exacto). Envolver el árbol de `app/_layout.tsx` en `<GestureHandlerRootView style={{ flex: 1 }}>` bajo `SafeAreaProvider`. Crear `src/lib/edge.ts` con la interfaz `Envelope<T>` (`{ success, data?, error?: { code, message, details? }, meta? }`) del design §4.
      Files: `apps/mobile/package.json`, `apps/mobile/babel.config.js`, `apps/mobile/app/_layout.tsx`, `apps/mobile/src/lib/edge.ts`
      Verify: `npm install` en la raíz del monorepo; luego desde `apps/mobile` `npx tsc --noEmit` y `npm run lint` sin errores nuevos. **[verificar durante implementación]** que los tres módulos nativos de drawer quedan instalados y que `expo-router/drawer` resuelve (si no, usar fallback `createDrawerNavigator` de `@react-navigation/drawer`, design §2.3 nota de verificación / R1). Módulos nativos → requieren recompilar dev client (anotar; no es verificable por typecheck).

- [ ] 2. feat(nav): convertir el grupo admin a Drawer híbrido con guard y hamburguesa (NAV-AC1..AC7).
      Crear `src/components/admin/AdminGuard.tsx` (extrae el guard `role !== 'admin' → EmptyState "Acceso restringido"` de `admin/index.tsx`). Crear `src/components/admin/AdminDrawerContent.tsx` usando `DrawerContentScrollView`, replicando **verbatim** la lógica de visibilidad de `admin/index.tsx` (`requiresCapability`/`requiresCrewMode`/`requiresTareFlag`/`requiresRbacFlag`; `permission-profiles` solo por `configurable_rbac`, SIN capability) y extendiéndola con los ítems transaccionales (`settings`→`SETTINGS_MANAGE`, `settlements`→`SETTLEMENTS_MANAGE`, `records`→solo rol, `dispatch-guides/index`→flag `dispatch_guides`), en dos secciones "Datos maestros" / "Administración". Convertir `app/admin/_layout.tsx` de `Stack` a `Drawer` (`expo-router/drawer`) con `drawerContent={AdminDrawerContent}` y registrar todas las screens (incluidas las nuevas `settings`, `settlements`, `records`, `dispatch-guides/index`, `dispatch-guides/[id]`); ocultar del drawer las rutas de detalle con `drawerItemStyle:{display:'none'}` (`fields/[id]`, `dispatch-guides/[id]`). En `app/(tabs)/_layout.tsx` añadir `headerRight` **solo si `worker?.role === 'admin'`** con `Ionicons name="menu"` → `router.push('/admin')` (null para otros roles). Refactorizar `app/admin/index.tsx` para usar `AdminGuard` sin cambiar su UI de tarjetas (NAV-AC6).
      Files: `apps/mobile/src/components/admin/AdminGuard.tsx`, `apps/mobile/src/components/admin/AdminDrawerContent.tsx`, `apps/mobile/app/admin/_layout.tsx`, `apps/mobile/app/(tabs)/_layout.tsx`, `apps/mobile/app/admin/index.tsx`
      Verify: `npx tsc --noEmit` + `npm run lint` ok. `npx expo start`: `/admin` monta el Drawer con dos grupos; hamburguesa visible solo para admin; `fields/[id]` y `dispatch-guides/[id]` NO aparecen como ítems. **[verificar durante implementación]** que worker/supervisor/crew_lead NO ven drawer ni cambios en tabs (NAV-AC5) y que deep-link no-admin da "Acceso restringido" (NAV-AC7). Nota: para registrar `settings/settlements/records/dispatch-guides` sin romper build antes de crear sus pantallas, crear stubs mínimos de pantalla en el mismo paso o justo antes (placeholder que exporte un componente), reemplazados por las features siguientes.

- [ ] 3. feat(settings): pantalla de Configuración de la organización (G4) y migración de hooks de org/branding.
      Crear `app/admin/settings.tsx` (envuelta en `AdminGuard`, gating `SETTINGS_MANAGE`) con 4 secciones: **Marca** (nombre requerido, logo_url opcional, colores primario/secundario con `HEX_RE = ^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$` + chips preset + input hex), **Modo Capataz** (`Switch` sobre `crew_mode_enabled`), **Melgas** (`Switch` sobre `rows_enabled` por query directa a `organizations`), **Etiquetas de rol** (4 `TextInput`, saneo: guarda solo no vacías). Lectura: `organizations.select('id, name, logo_url, brand_primary_color, brand_secondary_color, crew_mode_enabled, rows_enabled, role_labels').limit(1).maybeSingle()`; escritura `update(patch).eq('id', org.id)`. Toggles optimistas con rollback en `onError` (G4-AC8). En `app/admin/index.tsx` el módulo `settings` pasa a `available:true` + `requiresCapability: CAPABILITIES.SETTINGS_MANAGE` (quitar "Próximamente"). Migrar `src/hooks/useBranding.ts`: extraer el cuerpo del effect a `load()` y añadir `DeviceEventEmitter.addListener('branding:updated', load)` (aditivo, conservar `onAuthStateChange` y defaults); `settings.tsx` emite `DeviceEventEmitter.emit('branding:updated')` tras guardar. Migrar `src/hooks/useOrgSettings.ts` a `useQuery(['org-settings'])` **conservando API pública** (`settings, roleLabel, crewModeEnabled, loading`) **y la recarga por `onAuthStateChange`** (invalidar/`refetch` en el callback); `rows_enabled` NO entra en `OrgSettings`.
      Files: `apps/mobile/app/admin/settings.tsx`, `apps/mobile/app/admin/index.tsx`, `apps/mobile/src/hooks/useBranding.ts`, `apps/mobile/src/hooks/useOrgSettings.ts`, `apps/mobile/src/theme/ThemeProvider.tsx` (solo si se requiere ajuste; preferible NO tocar — ya re-monta por `key`)
      Verify: `npx tsc --noEmit` + `npm run lint`. **[verificar durante implementación]** en runtime: guardar marca con hex válido re-aplica branding (evento `branding:updated` dispara `load()` y `ThemeProvider` re-pinta por `key`); hex inválido bloquea guardado con error en español; toggles revierten al fallar; cambiar de sesión recarga `useOrgSettings` sin caché del tenant anterior (hallazgo 3); `admin/index.tsx` y `AdminDrawerContent` siguen compilando con la nueva API del hook.

- [ ] 4. feat(settlements): pantalla de Liquidaciones con generación (G1) y hook compartido.
      Crear `src/hooks/useSettlements.ts` (`useSettlementsList({ page, limit })`, default 20/máx 100, orden `generated_at` desc, join manual de beneficiario como `payments.tsx`; `queryKey: ['settlements', ...]`). Crear `app/admin/settlements.tsx` (envuelta en `AdminGuard`) que lista liquidaciones (patrón de `payments.tsx`, paginado) y un botón **"Generar liquidaciones"** visible solo con `has(CAPABILITIES.SETTLEMENTS_MANAGE)` (G1-AC6). El botón abre modal con **Desde/Hasta** (`TextInput`, regex `^\d{4}-\d{2}-\d{2}$`, `start<=end`); validación cliente antes de invocar (G1-AC2). Generación: `supabase.functions.invoke<Envelope<GenerateSettlementsResponse>>('settlements/generate', { method:'POST', body:{ period_start, period_end } })`; leer el **sobre** (`data.data`), nunca el payload directo; errores desde `data.error.message` (español), no `error.message` (G1-AC3, AC5). Distinguir "sin producción" (`settlements.length===0 && total_amount===0`) de "nada nuevo" (`length===0 && total_amount>0`) de éxito (G1-AC4). Type guard sobre `data.data` (NFR1). Tras éxito invalidar `['settlements']`, `['my-balance']`, `['my-settlements']`. NO insertar en `settlements` desde cliente; NO tocar `payments.tsx` (lógica de pago/estado intacta, G1-AC7) ni `crew.tsx` (G1-AC8). Invariante preservado: la generación delega 100% en la Edge Function; ninguna liquidación pagada se modifica.
      Files: `apps/mobile/src/hooks/useSettlements.ts`, `apps/mobile/app/admin/settlements.tsx`
      Verify: `npx tsc --noEmit` + `npm run lint`. **[verificar durante implementación]** en runtime: generar rango válido muestra "N generada(s)" y refresca lista + tab Pagos; rango inválido no invoca backend; período vacío → "Sin producción"; período ya generado → "Nada nuevo que generar"; error de backend muestra mensaje español; tab Pagos sigue pagando igual (no regresión). Confirmar que la Edge Function `settlements/generate` responde el sobre esperado (ruta verificada en `supabase/functions/settlements/index.ts`).

- [ ] 5. feat(records): histórico de registros con filtros y corrección auditada (G2) + hook de corrección compartido.
      Extraer la mutación de corrección de `app/(tabs)/production.tsx` a `src/hooks/usePickingCorrection.ts` (misma lógica: soft-update con `original_record_id`, no toca `rate_amount_snapshot`/`payment_unit`, valida `> 0`, rama offline `useConnectivity` + `enqueue({ type:'picking_correction', ... })`). El `onSuccess` del hook debe invalidar **ambas** familias: `['production']` y `['records']` (hallazgo 2). Reemplazar en `production.tsx` el uso inline por el hook, **sin cambio funcional** y conservando `canCorrect = admin|supervisor|crew_lead` y la regla `work_day === localDate(0)`. Crear `app/admin/records.tsx` (envuelta en `AdminGuard`, acceso solo admin) con: **query única del período filtrado** (`picking_records` acotado por rango de fechas default últimos 7 días + `worker_id`/`block_id` opcionales, `.order('recorded_at',{ascending:false})`, **tope duro 1000 filas**, `select` ampliado con `national_id`, `net_weight_kg`, producto/variedad para el CSV); `queryKey: ['records', dateFrom, dateTo, workerId, blockId]`; **paginación en cliente** (`pageSize=20`, "Cargar más") sobre el array ya cargado; filtros reinician a page 1; aviso de truncado si llega a 1000. Lista excluye `original_record_id` no nulo del conteo original; badge "Corrección" cuando se muestren. Botón "Corregir" solo si `work_day === hoy`, usando `usePickingCorrection`. Resumen agregado (registros, cajas, kg, $) con `pickingPayableBase`/`pickingSubtotal` de shared, segmentado por unidad, sobre el set completo del período (G2-AC7). Invariante preservado: picking `quantity > 0`; corrección solo del día actual; no se altera `rate_amount_snapshot`/`payment_unit`.
      Files: `apps/mobile/src/hooks/usePickingCorrection.ts`, `apps/mobile/app/(tabs)/production.tsx`, `apps/mobile/app/admin/records.tsx`
      Verify: `npx tsc --noEmit` + `npm run lint`. **[verificar durante implementación]** en runtime: filtros/paginación funcionan; corrección de día actual (online y offline encolada) refresca Producción Y Registros (ambas keys); días previos no ofrecen "Corregir"; valor ≤ 0 bloqueado con error español; resumen coherente por unidad; `production.tsx` mantiene su comportamiento exacto (no regresión).

- [ ] 6. feat(export): CSV en Registros y PDF en Liquidaciones (G5) con gating de flags/capability.
      Crear `src/hooks/useReportExport.ts` → `{ showCsv: report_export && has(REPORTS_EXPORT), showPdf: report_export && !disable_pdf_export && has(REPORTS_EXPORT) }` (kill-switch oculta solo PDF; G5-AC1, AC4). Crear `src/lib/export/csv.ts` (`toCSV` pura, columnas y encabezados **literales** de la web, incl. `Peso neto (kg)`; design §4.4). Crear `src/lib/export/settlement-pdf.ts` (`settlementHtml(data)` + `printSettlement(data)` con `expo-print` + `expo-sharing`; datos desde `settlements/:id` leyendo el sobre `Envelope<SettlementDetail>`). En `records.tsx` añadir botón "Exportar CSV" (visible si `showCsv`) que exporta el **set completo del período filtrado** (misma query de G2, no la página), escribe en `FileSystem.cacheDirectory` y comparte con `Sharing.shareAsync(uri,{ mimeType:'text/csv' })`. En `settlements.tsx` añadir acción PDF por liquidación (visible si `showPdf`). Deshabilitar/avisar si 0 datos (G5-AC5); `try/catch` con alerta español (G5-AC6).
      Files: `apps/mobile/src/hooks/useReportExport.ts`, `apps/mobile/src/lib/export/csv.ts`, `apps/mobile/src/lib/export/settlement-pdf.ts`, `apps/mobile/app/admin/records.tsx`, `apps/mobile/app/admin/settlements.tsx`
      Verify: `npx tsc --noEmit` + `npm run lint`. Unit (Vitest) para `toCSV` (columnas/escaping) y `settlementHtml` (presencia de totales/filas): `npm run test`. **[verificar durante implementación]** en runtime (dev client recompilado por módulos nativos): CSV compartido con columnas correctas; PDF por liquidación; `disable_pdf_export` oculta solo PDF; botones deshabilitados sin datos.

- [ ] 7. feat(dispatch): entrada de Guías de despacho en el drawer tras flag + pantalla provisional (G3 diferido).
      Crear `app/admin/dispatch-guides/index.tsx` como pantalla provisional (`EmptyState` "Guías de despacho — en preparación", envuelta en `AdminGuard`) y `app/admin/dispatch-guides/[id].tsx` como placeholder mínimo que compile. La entrada del drawer ("Guías de despacho") ya quedó gateada por `useFeatureFlag('dispatch_guides')` en `AdminDrawerContent` (paso 2). NO rompe build ni navegación (G3-AC8). El diseño completo de G3 (lista/crear/detalle/recepción/comparación contra la Edge Function `dispatch-guides`) queda documentado en design §7 para implementarse después sin re-diseñar.
      Files: `apps/mobile/app/admin/dispatch-guides/index.tsx`, `apps/mobile/app/admin/dispatch-guides/[id].tsx`
      Verify: `npx tsc --noEmit` + `npm run lint`. `npx expo start`: con `dispatch_guides` activo aparece la entrada y abre la pantalla provisional; sin el flag no aparece (G3-AC1). No hay regresión de navegación.

- [ ] 8. Verificación integral y cierre.
      Correr typecheck + lint completos y los unit tests desde `apps/mobile`. Revisar la lista de "Sin cambios (no regresión)" del design §10: `team.tsx`, `crew.tsx`, resto de `app/admin/*`, Edge Functions, `apps/web/*` sin tocar.
      Files: (ninguno nuevo; validación)
      Verify: desde `apps/mobile` del worktree: `npx tsc --noEmit` (0 errores), `npm run lint` (0 errores nuevos), `npm run test` (unit nuevos pasan), y `npx expo start` resuelve todas las rutas nuevas del drawer. **[verificar durante implementación]** matriz de no-regresión de supervisor (`team.tsx`) y encargado (`crew.tsx`) intactos.

---

## Notas de riesgo (del design §8)

- **R1 (alto):** stack nativo de Drawer requiere recompilar el dev client; `expo-router/drawer` sin verificar en frío → fallback `createDrawerNavigator`. No bloquea typecheck/lint pero sí la verificación manual de navegación.
- **R2 (medio):** PDF en RN vía plantilla HTML + `expo-print` (no `jsPDF`); posible divergencia visual, misma fuente de datos (`settlements/:id`).
- **R3 (medio):** migración de `useOrgSettings` a `useQuery` debe conservar API pública y recarga por sesión.
- **R4/R5 (bajo):** export sin datos (botón deshabilitado) y deep-link no-admin (AdminGuard).

## Invariantes de dominio (preservados en todo el plan)

- Picking `quantity > 0`; `rate > 0` (paso 5, corrección valida `> 0`; nada reduce tarifas).
- Liquidación `paid` ⇒ no se modifica; generación delega en Edge Function (paso 4), nunca insert cliente.
- Corrección: solo día actual, soft-update con `original_record_id`, sin tocar `rate_amount_snapshot`/`payment_unit` (paso 5).
- RBAC jerárquico: AdminGuard + capabilities; gating de UI nunca sustituye RLS/backend.
- Nombres canónicos: `fields`, `blocks`, `products`, `rates`, `workers`, `picking_records`, `settlements`, `payments`, `organizations`, `dispatch_guides`, `dispatch_receipts`.

## Puntos "[verificar durante implementación]" (no descartar por lectura)

- Montaje real del Drawer y resolución de `expo-router/drawer` (paso 1/2).
- No regresión de tabs y de los flujos supervisor/encargado (pasos 2, 5, 8).
- Re-aplicación de branding y recarga por sesión de `useOrgSettings` (paso 3).
- Sobre `{success,data}` y mensajes de error en español de las Edge Functions `settlements/generate` y `settlements/:id` (pasos 4, 6).
- Comportamiento idéntico de la corrección en `production.tsx` tras extraer el hook (paso 5).
