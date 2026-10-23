# Hybrid admin navigation + G1/G2/G4/G5 parity on mobile (G3 deferred)

This branch gives the mobile Administrator role parity with the web by mounting an admin-only Drawer over the field tabs and porting five web capabilities: generating settlements (G1), a historical records view with audited correction and filters (G2), real organization settings (G4), CSV/PDF export (G5), plus the hybrid navigation itself. G3 (dispatch guides) is intentionally a flag-gated stub. The implementation follows the approved design closely: the Drawer replaces the admin `Stack` without touching the field tabs or the supervisor/crew_lead/worker flows, Edge Function responses are read through the `{ success, data }` envelope, and domain invariants (settlement generation delegated to the backend, correction only on the current day, no mutation of `rate_amount_snapshot`/`payment_unit`) are preserved.

Watch for: the export path deliberately deviates from the plan's `writeAsStringAsync`/`cacheDirectory` instructions and uses the new `File`/`Paths` API of expo-file-system 19 (confirmed — the legacy API throws at runtime in SDK 54, so this deviation is required and correct). The native Drawer stack (gesture-handler, reanimated) means runtime navigation behavior is unverifiable without a recompiled dev client; the coder flagged this and it is inherent to the task, not a defect. No blocking concerns were found.

**Verdict**: APPROVED

## High-level view

Navigation is correctly scoped. The hamburger in the tabs header renders only for `worker?.role === 'admin'` and is `null` for every other role; the tab `href` gating is untouched, so supervisor/crew_lead/worker surfaces do not change. The admin group's layout switches from `Stack` to `expo-router/drawer`, with detail routes (`fields/[id]`, `dispatch-guides/[id]`) hidden from the drawer list. `AdminGuard` wraps every admin screen (including the new ones) and returns "Acceso restringido" for non-admins, so a deep link into an admin route by a non-admin is blocked.

The G4 settings screen reads/writes `organizations` directly, validates hex before saving, blocks the save with a Spanish error on invalid input, and runs toggles optimistically with rollback. Branding refresh goes through `DeviceEventEmitter.emit('branding:updated')` (which `useBranding` listens for and re-pins via `ThemeProvider`'s `key` remount), not `invalidateQueries`. `useOrgSettings` is migrated to `useQuery(['org-settings'])` keeping its public API and reloading on `onAuthStateChange`; `rows_enabled` stays out of `OrgSettings` and is handled only in the settings screen.

G1 settlement generation reads the envelope's `data.data` with a type guard, surfaces the backend's Spanish message from `data.error.message` (never the generic `FunctionsHttpError`), validates the range client-side before invoking, and distinguishes "sin producción" from "nada nuevo que generar" via `total_amount`. Generation delegates 100% to the Edge Function with no client insert, and `payments.tsx`/`crew.tsx` are untouched.

G2 records runs a single period query capped at 1000 rows as the source of truth for list, summary and CSV, paginates in the client at 20/page, and resets to page 1 on any filter change. The shared `usePickingCorrection` hook invalidates both `['production']` and `['records']`, and the correction button only appears for current-day originals. `production.tsx` is a non-functional extraction of the same mutation.

G5 export gating is correct: `showCsv = report_export && REPORTS_EXPORT`, `showPdf = report_export && !disable_pdf_export && REPORTS_EXPORT`, so the kill-switch hides only the PDF. The CSV uses the literal web headers including `Peso neto (kg)`, exports the full filtered set, and is read-only. The PDF reads the settlement detail envelope. G3 is a stub wrapped in `AdminGuard`, its drawer entry gated by the `dispatch_guides` flag.

The no-regression matrix holds: `apps/web`, `supabase/functions`, `team.tsx`, and `crew.tsx` have zero changes in the diff, independently confirmed against `origin/main`. The verification evidence records tsc 0 errors, lint 0 new errors, and 16/16 unit tests; those suites were not re-run per instructions.

<details>
<summary>Issues (0)</summary>

No blocking or non-blocking actionable findings.

</details>

<details>
<summary>Details</summary>

## Hybrid navigation scoping

The hamburger is added in `app/(tabs)/_layout.tsx` as a `headerRight` that evaluates `worker?.role === 'admin' ? <TouchableOpacity …/> : null`, pushing `/admin`. No tab `href` gating or structure changed, so the field-role surfaces are unaffected (NAV-AC1, NAV-AC5). `app/admin/_layout.tsx` converts `Stack` → `Drawer` from `expo-router/drawer` with a custom `drawerContent`, registering all 14 screens; `fields/[id]` and `dispatch-guides/[id]` carry `drawerItemStyle:{display:'none'}` so they never list (NAV-AC2). The design snippet used `contentStyle` on the Drawer; the implementation uses `sceneStyle`, which is the correct prop for react-navigation v7 Drawer — a correct adjustment, not a divergence. `GestureHandlerRootView` wraps the tree in `app/_layout.tsx` and the reanimated Babel plugin is the last entry, as required by the native stack.

`AdminGuard` extracts the role guard verbatim (same copy, `lock-closed-outline`, `colors.amber`) and `admin/index.tsx` was refactored to use it while keeping its card UI (NAV-AC6). Because every new admin screen is wrapped in `AdminGuard`, a non-admin deep link to any admin route renders "Acceso restringido" (NAV-AC7). `AdminDrawerContent` replicates the visibility logic of `admin/index.tsx` verbatim — `permission-profiles` gated only by `configurable_rbac` with no capability — and extends it with the transactional items (`settings`→`SETTINGS_MANAGE`, `settlements`→`SETTLEMENTS_MANAGE`, `records`→role only, `dispatch-guides/index`→`dispatch_guides` flag) across the two sections, with its own role guard so non-admins see nothing listed.

## G4 settings and the hook migrations

`settings.tsx` is gated by `AdminGuard` + `SETTINGS_MANAGE` and reads/writes `organizations` directly. `HEX_RE = ^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$` validates both colors and a non-empty name before saving; invalid input sets a Spanish inline error and does not persist. On success it emits `branding:updated` and invalidates `['my-organization']`. The toggles (`crew_mode_enabled`, `rows_enabled`) use an optimistic `ToggleSection` with rollback on error and a Spanish alert; `crew_mode` additionally invalidates `['org-settings']` so the drawer's Cuadrillas visibility refreshes. `rows_enabled` is read/written only here and never enters `OrgSettings`. Role labels save only non-empty values.

`useBranding` adds the `DeviceEventEmitter` listener additively, keeping `onAuthStateChange`, defaults and cleanup; no `invalidateQueries` (which would be inert since the hook does not use React Query). `useOrgSettings` becomes `useQuery(['org-settings'])` with the public API (`settings, roleLabel, crewModeEnabled, loading`) intact and an `onAuthStateChange` subscription that invalidates the key — so switching tenants does not serve the previous tenant's cache.

## G1 settlement generation through the envelope

`settlements.tsx` lists via `useSettlementsList` (default 20, clamped to 100, `generated_at` desc, manual payee/payment joins mirroring `payments.tsx`). The generate button is gated by `SETTLEMENTS_MANAGE`. Client validation (both dates required, `AAAA-MM-DD` regex, `start <= end`) runs before any backend call. The mutation invokes `settlements/generate` typed as `Envelope<GenerateSettlementsResponse>`, checks `error || data?.success === false` throwing `data?.error?.message`, then validates `data.data` with the `isGenerateResponse` type guard before use. The three result branches key off `total_amount` to tell "Sin producción" from "Nada nuevo que generar" from "N generada(s)", and success invalidates `['settlements']`, `['my-balance']`, `['my-settlements']`. No client insert into `settlements`.

## G2 records, correction, and the production extraction

`records.tsx` runs one `picking_records` query over the filtered period (default last 7 days via `localDate(-7)..localDate(0)`), ordered by `recorded_at` desc, hard-capped at 1000 rows, with the `select` widened to `net_weight_kg` plus manual worker (`national_id`) and block (product/variety) joins for the CSV. `queryKey = ['records', dateFrom, dateTo, workerId, blockId]`. Client pagination slices the originals array at 20/page with "Cargar más"; every filter setter resets page to 1; reaching 1000 shows the truncation notice. The summary uses `pickingPayableBase`/`pickingSubtotal` from shared, segmented by unit over the full set. The "Corregir" button shows only for `!is_correction && work_day === localDate(0)`.

`usePickingCorrection` is a verbatim extraction of the production mutation: online soft-update (snapshot with old values + `original_record_id`, then in-place `update`), offline enqueue via `useConnectivity`/`enqueue`, `> 0` validation, `rate_amount_snapshot`/`payment_unit` never touched, and `onSuccess` invalidating both `['production']` and `['records']`. `production.tsx` drops its inline mutation and delegates to the hook, keeping `canCorrect` and the `work_day === localDate(0)` rule; the modal reset moves to a per-call `onSuccess` while haptics/alerts live in the hook — behavior-equivalent to the original.

## G5 export gating and the file API deviation

`useReportExport` returns `showCsv = report_export && REPORTS_EXPORT` and `showPdf = report_export && !disable_pdf_export && REPORTS_EXPORT`, so `disable_pdf_export` hides only the PDF. `csv.ts` is a pure, typed `toCSV` (BOM, `;` separator, CRLF, RFC-4180 escaping) and the records CSV columns use the literal web headers including `Peso neto (kg)`, exporting the full filtered set (not the visible page). `settlement-pdf.ts` keeps `settlementHtml` pure and dynamically imports expo-print/expo-sharing in `printSettlement`, reading the settlement detail via the envelope.

The records CSV writes with `new File(Paths.cache, …)` + `create()/write()` and shares the `file.uri`, instead of the plan's `FileSystem.writeAsStringAsync(FileSystem.cacheDirectory + …)`. This was verified against the installed expo-file-system 19.0.24: the `File`/`Paths` API exists with `create/write/delete/exists`, and the legacy module-level `writeAsStringAsync`/`cacheDirectory` are deprecated and documented to throw at runtime in this SDK. The deviation is therefore required for correctness and is appropriately documented in the verification notes.

## Scope and verification

The diff touches only `apps/mobile` plus `package-lock.json`. `git diff origin/main` confirms zero changes to `apps/web`, `supabase/functions`, `app/(tabs)/team.tsx`, `app/(tabs)/crew.tsx`, and `payments.tsx`. New code is strict-typed with local interfaces and type guards; no `any` in the files reviewed. The verification evidence records `tsc --noEmit` 0 errors, `lint` 0 new errors (97–98 pre-existing warnings in untouched files), and 16/16 unit tests for `toCSV`/`settlementHtml`. Per instructions those suites were not re-run; the only spot-check performed was confirming the expo-file-system 19 `File`/`Paths` API, which the evidence's deviation note hinged on. Runtime navigation and on-device export remain pending a recompiled dev client (native modules), which is inherent and flagged, not a gap in this diff.

<details>
<summary>File map</summary>

- `app/(tabs)/_layout.tsx` — admin-only hamburger in tabs header; no tab gating change.
- `app/(tabs)/production.tsx` — inline correction mutation replaced by `usePickingCorrection` (non-functional).
- `app/_layout.tsx` — tree wrapped in `GestureHandlerRootView`.
- `app/admin/_layout.tsx` — `Stack` → `Drawer`, detail routes hidden.
- `app/admin/index.tsx` — uses `AdminGuard`; settings module now available.
- `app/admin/records.tsx` — new G2 screen (query cap 1000, client pagination, filters, correction, CSV).
- `app/admin/settings.tsx` — new G4 screen (brand/crew mode/rows/role labels).
- `app/admin/settlements.tsx` — new G1 screen (list + generate + PDF action).
- `app/admin/dispatch-guides/{index,[id]}.tsx` — G3 stubs under `AdminGuard`.
- `babel.config.js` — reanimated plugin (last).
- `src/components/admin/AdminGuard.tsx`, `AdminDrawerContent.tsx` — new guard + drawer content.
- `src/hooks/useBranding.ts` — additive `branding:updated` listener.
- `src/hooks/useOrgSettings.ts` — migrated to `useQuery`, API preserved.
- `src/hooks/usePickingCorrection.ts` — shared correction mutation (invalidates both keys).
- `src/hooks/useReportExport.ts`, `useSettlements.ts` — export gating; settlements list hook.
- `src/lib/edge.ts` — `Envelope<T>`.
- `src/lib/export/{csv.ts,settlement-pdf.ts}` + `__tests__` — pure export helpers + unit tests.
- `package.json`, `package-lock.json` — native + export deps.

Full diff: `git diff origin/main` in the worktree.

</details>

</details>
