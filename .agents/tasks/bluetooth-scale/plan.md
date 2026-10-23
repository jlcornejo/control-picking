# Implementation Plan — Bluetooth Scale Auto-Weight Capture (mobile)

Task: `bluetooth-scale` · Branch: `feature/bluetooth-scale`
Worktree (ALL paths below are absolute under this root): `/Users/ericksegura/Documents/backupHDD/personal/control-picking/.worktrees/bluetooth-scale`
Approved design: `.agents/tasks/bluetooth-scale/design.md` · Review (APPROVED): `.agents/tasks/bluetooth-scale/design-review.md`

## Domain-invariant check (preserved)

This feature is additive and touches only the mobile register screen + one feature-flag row. No invariant is affected:
- Picking quantity/weight `> 0` — unchanged; owned by the existing submit guard `parseFloat(manualKg) > 0` and the `manual_kg` Zod schema. The scale only populates the editable `manualKg` input and cannot bypass the guard.
- `rate_amount_snapshot > 0` — untouched (feature never reaches the rates layer).
- Settlements immutable when paid — untouched (no settlement/payment code changes).
- RBAC — untouched (no auth/permission changes).
- Entity naming (fields, blocks, products, rates, workers, picking_records, settlements, payments) — unchanged; the only DB write is one `platform_feature_flags` row.

## Rules for the implementer (read first)

- Use `git -C /Users/ericksegura/Documents/backupHDD/personal/control-picking/.worktrees/bluetooth-scale` for every git operation. Do not run git from the parent workspace.
- All file paths you create/modify are absolute and under the worktree root above. A relative path lands in the wrong tree.
- The feature is strictly ADDITIVE and gated behind the new flag `bluetooth_scale` (default OFF) + a hard Android-only guard. On iOS or flag-OFF the register screen must render EXACTLY as today (no button, native module never loaded).
- Code/identifiers in English; UI strings and migration comments in Spanish. No `any` (use `unknown` + guards or `typeof import(...)` types). TypeScript strict is on monorepo-wide (`/Users/ericksegura/Documents/backupHDD/personal/control-picking/.worktrees/bluetooth-scale/tsconfig.json`).
- Do NOT run the native build (`expo prebuild` / `eas build`). Leave the project buildable; document the build steps in the commit/PR body only.

## Environment facts discovered (use these exact commands)

- Monorepo: npm workspaces + Turborepo (`package.json` workspaces `apps/*`, `packages/*`; `turbo.json`). Root scripts: `lint` → `turbo lint`, `test` → `turbo test`, `build` → `turbo build`, `format:check` → prettier. There is NO `typecheck`/`type-check` script anywhere.
- Mobile (`apps/mobile/package.json`): `lint` → `eslint app/ src/` (flat config at `apps/mobile/eslint.config.js`, ESLint v9); `test` → `vitest --run`. Mobile does NOT currently declare `vitest` as a devDependency (only `apps/web` and `packages/shared` do, both `^3.0.0`).
- Mobile typecheck must be run directly (no script): `npx tsc --noEmit -p apps/mobile/tsconfig.json` (tsconfig extends root strict config, `noEmit: true`).
- `node_modules` is NOT installed in the worktree yet — an `npm install` from the worktree root is required before lint/test/typecheck can run.
- Vitest pure-logic precedent: `apps/mobile/src/lib/export/__tests__/csv.test.ts` and `settlement-pdf.test.ts` (import from `vitest`, `--run`, no device).
- Latest migration: `supabase/migrations/20261006000001_create_payment_photo_evidence.sql` — so `20261007000001_*` is strictly greater. Flag migration template: `supabase/migrations/20261004000001_feature_flag_report_export.sql`.
- `register.tsx` confirmed anchors: `manualKg`/`setManualKg` (line ~61), `round3` local const inside `submitMutation.mutationFn` (`Math.round(x*1000)/1000`, line ~196), `isKgBlock` (~178), `kgTareApplies` (~186), `kgManualApplies = isKgBlock && !kgTareApplies` (~189), `canSubmit = kgManualApplies ? parseFloat(manualKg) > 0 : ...` (~515), the `kgManualApplies` render branch (~547), `resetForSameBlock` (~370). `useFeatureFlag(key)` returns `{ enabled, loading }`. `Platform` is NOT yet imported in `register.tsx` — add it to the `react-native` import.
- Feature-flag schema (`supabase/migrations/20260913000002_create_feature_flags.sql` per review): `category VARCHAR(60)` no CHECK (`'cosecha'` valid), `strategy` enum includes `'org_override'`, `key` CHECK `^[a-z0-9]+(_[a-z0-9]+)*$` (`bluetooth_scale` valid), `uq_platform_feature_flags_key` makes INSERT idempotent, default OFF honored.
- `FEATURE_FLAGS` in `packages/shared/src/constants/index.ts` is an `as const` object; `manual_kg` already covered by `boxTareFields` in `packages/shared/src/validation/index.ts` (positive, mutually exclusive with `gross_weight_kg`) — so NO validation change is needed.

---

# Implementation Plan

- [ ] 1. Add the native dependency and ensure mobile can run Vitest.
      In `apps/mobile/package.json`: add `react-native-bluetooth-classic` to `dependencies`, exact-pinned (no caret). Before pinning, run `npm view react-native-bluetooth-classic versions --json` and pick the highest STABLE (non-`rc`/`beta`) release supporting RN 0.81 / New Architecture; only if none exists on that line, fall back to `"1.73.0-rc.12"` (design default). Record the resolved version in the commit body (NIT-1). Also add `"vitest": "^3.0.0"` to `apps/mobile` `devDependencies` (matching `apps/web`/`packages/shared`) so `vitest --run` resolves reliably regardless of hoisting. Then run `npm install` from the worktree root to populate `node_modules`.
      Files: `/Users/ericksegura/Documents/backupHDD/personal/control-picking/.worktrees/bluetooth-scale/apps/mobile/package.json`
      Verify: from the worktree root, `npm install` completes without error, then `npx vitest --version` resolves (run inside `apps/mobile` or via `npx -w @fundo360/mobile vitest --version`).

- [ ] 2. Configure `app.json` (config plugin + Android permissions + defensive iOS usage string).
      In `apps/mobile/app.json`: append the `react-native-bluetooth-classic` config plugin to the `plugins` array. After `npm install`, open `node_modules/react-native-bluetooth-classic/app.plugin.js` and confirm accepted option keys (NIT-2): if the plugin injects permission/usage strings automatically, use the bare string form `"react-native-bluetooth-classic"`; otherwise use the object form with a Spanish iOS usage description (e.g. key `bluetoothAlwaysPermission` → "La aplicación usa Bluetooth para leer el peso desde la balanza conectada."). Extend `android.permissions` (currently only `android.permission.CAMERA`) to also include `BLUETOOTH`, `BLUETOOTH_ADMIN`, `BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN`, `ACCESS_FINE_LOCATION` (fully-qualified `android.permission.*`). Leave `expo-build-properties` and `eas.json` unchanged.
      Files: `/Users/ericksegura/Documents/backupHDD/personal/control-picking/.worktrees/bluetooth-scale/apps/mobile/app.json`
      Verify: the file is valid JSON (`node -e "require('./apps/mobile/app.json')"` from the worktree root exits 0) and the 6 permission strings + the plugin entry are present.

- [ ] 3. Create the pure weight parser `parse-weight.ts`.
      Create `apps/mobile/src/lib/scale/parse-weight.ts` exporting `interface ParsedWeight { kg: number | null; stable: boolean | null; raw: string }` and `function parseWeight(chunk: string): ParsedWeight`. Implement an ORDERED, labeled pattern table (WeightPattern = `{ label: string; re: RegExp; extract: (m: RegExpMatchArray) => { status?: string; value: string; unit?: string } }`), tried in order, first match wins. Default patterns (documented as guesses): (1) `ST`/`US`/`OL` status prefix + optional `NT`/`GS` + signed decimal + optional `kg`/`g`; (2) bare signed decimal + optional unit (`stable: null`); plus an optional comma-decimal normalizer (`12,50`→`12.50`). Normalization: strip internal number spaces, apply sign, `g`→divide by 1000, absent unit defaults to kg (flag this in a comment as adjustable), `ST`→`stable:true`, `US`/motion→`false`, no token→`null`, overload (`OL`/`-----`)→`kg:null,stable:false`, NaN/Infinity→`kg:null`, never throw. Put the exact UNCONFIRMED-FORMAT warning comment at the top of the pattern table (per design §2: manufacturer frame is undocumented; capture the real frame via the in-app debug panel and add the confirmed regex as the FIRST entry). No React / no native imports.
      Files: `/Users/ericksegura/Documents/backupHDD/personal/control-picking/.worktrees/bluetooth-scale/apps/mobile/src/lib/scale/parse-weight.ts`
      Verify: `npx tsc --noEmit -p apps/mobile/tsconfig.json` (run from the worktree root) reports no new errors for this file. (Tests added in step 4.)

- [ ] 4. Add Vitest tests for the parser.
      Create `apps/mobile/src/lib/scale/__tests__/parse-weight.test.ts` (same shape as `apps/mobile/src/lib/export/__tests__/csv.test.ts`: `import { describe, it, expect } from 'vitest'`). Cover: happy ASCII with status (`ST`→stable true), happy without status (`stable:null`), `g`→kg conversion, bare number, sign handling, zero (`0.00`/`-0.00`→`kg:0`), overload (`OL`→`kg:null`), empty/whitespace (`kg:null`), comma decimal, length-cap / malformed line (returns `kg:null`, no throw), and one `it.skip` "real-format TODO" placeholder documenting it will be enabled once the physical frame is captured.
      Files: `/Users/ericksegura/Documents/backupHDD/personal/control-picking/.worktrees/bluetooth-scale/apps/mobile/src/lib/scale/__tests__/parse-weight.test.ts`
      Verify: `npx vitest --run apps/mobile/src/lib/scale` (from the worktree root, or `npm test -w @fundo360/mobile`) — all parser tests pass.

- [ ] 5. Extract the shared `round3` helper.
      Create `apps/mobile/src/lib/scale/round3.ts` exporting `export const round3 = (x: number) => Math.round(x * 1000) / 1000;`. In `apps/mobile/app/(tabs)/register.tsx`, remove the local `const round3` inside `submitMutation.mutationFn` and import the shared one. Behavior-preserving (identical formula) — this is the only refactor to existing code.
      Files: `/Users/ericksegura/Documents/backupHDD/personal/control-picking/.worktrees/bluetooth-scale/apps/mobile/src/lib/scale/round3.ts`, `/Users/ericksegura/Documents/backupHDD/personal/control-picking/.worktrees/bluetooth-scale/apps/mobile/app/(tabs)/register.tsx`
      Verify: `npx tsc --noEmit -p apps/mobile/tsconfig.json` passes and `npm run lint -w @fundo360/mobile` reports no new errors.

- [ ] 6. Create the Android-only hook `useBluetoothScale.ts`.
      Create `apps/mobile/src/hooks/useBluetoothScale.ts`. Lazy/conditional native load via a `loadNative()` helper: return `null` when `Platform.OS !== 'android'`; otherwise `try { require('react-native-bluetooth-classic') } catch { return null }` (Expo Go / module-missing → `unsupported`, no crash). Type the module with `typeof import('react-native-bluetooth-classic').default` (type-only, erased — never a top-level import). Export `type ScaleStatus = 'idle'|'connecting'|'connected'|'error'`, `interface BtScaleDevice { address: string; name: string | null }`, and the hook `useBluetoothScale(opts: { enabled: boolean }): UseBluetoothScale` exposing `{ supported, status, lastWeightKg, lastStable, rawLog, devices, error, refreshDevices, connect, disconnect, clearLog }`. Behavior: iOS/unsupported/`enabled:false` → `supported:false`, `status:'idle'`, actions are benign no-ops with Spanish `error` (native never touched); Android 12+ request `BLUETOOTH_CONNECT` via `PermissionsAndroid` before connecting; default flow uses bonded devices (`getBondedDevices()`) to avoid active scan; `connect()` with no arg finds device by name constant `SCALE_DEVICE_NAME='L261241'`, falling back to MAC constant `SCALE_DEVICE_MAC='0F:03:25:C2:02:01'`; on connect subscribe to data, buffer and split on `\r\n`/`\n`/`\r`, cap each line (~128 chars) and push to a bounded `rawLog` ring buffer (`RAW_LOG_CAP~200`), feed each line to `parseWeight`, update `lastWeightKg`/`lastStable` (ignore `kg:null` for `lastWeightKg` but still log raw); stable-reading policy in a small documented helper (`stable===true`, else debounce `STABLE_DEBOUNCE_MS~500`); all errors set `status:'error'` + Spanish message (see design error table) and never throw to the component. `useEffect` cleanup on unmount removes all subscriptions (stored in refs) and calls `disconnect()`; guard setState-after-unmount with a mounted ref. Constants with comments at the top of the file (MAC noted as unit-specific; name-match primary). No `any`.
      Files: `/Users/ericksegura/Documents/backupHDD/personal/control-picking/.worktrees/bluetooth-scale/apps/mobile/src/hooks/useBluetoothScale.ts`
      Verify: `npx tsc --noEmit -p apps/mobile/tsconfig.json` passes and `npm run lint -w @fundo360/mobile` reports no new errors.

- [ ] 7. Integrate the "Leer balanza" button + status line into `register.tsx`.
      In `apps/mobile/app/(tabs)/register.tsx`: add `Platform` to the `react-native` import; add `const { enabled: scaleEnabled } = useFeatureFlag('bluetooth_scale');` near the other flag reads; compute `const scaleApplies = scaleEnabled && Platform.OS === 'android' && kgManualApplies;`; always call `const scale = useBluetoothScale({ enabled: scaleApplies });` (hooks can't be conditional — the hook internally short-circuits). Inside the existing `kgManualApplies` render branch (below the `manualKg` `AppTextInput` + "kilos" label), render — only when `scaleApplies` — a Spanish "Leer balanza" button (Ionicons glyph consistent with existing usage) plus a compact Spanish status line driven by `scale.status`/`scale.error`/`scale.lastWeightKg` (e.g. "Conectando…", "Balanza conectada · 12.50 kg", "Sin conexión con la balanza"). On press: if `scale.status !== 'connected'` call `scale.connect()`, then on a stable kg call `setManualKg(String(round3(kg)))` using the shared `round3` from step 5. The `manualKg` `AppTextInput` stays editable at all times (fallback); do NOT change `canSubmit`, the submit mutation, the box path, or the `kgTareApplies` path. Optionally call `scale.clearLog()` inside `resetForSameBlock`.
      Files: `/Users/ericksegura/Documents/backupHDD/personal/control-picking/.worktrees/bluetooth-scale/apps/mobile/app/(tabs)/register.tsx`
      Verify: `npx tsc --noEmit -p apps/mobile/tsconfig.json` passes; `npm run lint -w @fundo360/mobile` reports no new errors. Confirm by reading the diff that the box branch, `kgTareApplies` branch, `canSubmit`, and the submit mutation are unchanged except for the `round3` import swap.

- [ ] 8. Add the DEBUG raw-stream panel (same gating).
      In the `kgManualApplies` branch of `register.tsx`, add a collapsible debug panel gated by `scaleApplies` (flag + Android), hidden by default behind a small "Ver crudo" toggle. Contents: bonded-device picker (`scale.devices`, tap → `scale.connect(address)`), connection status + `error`, a monospace scrollable view of `scale.rawLog` showing each chunk exactly as received with control chars visualized (`\r`/`\n` as visible tokens), optionally each line's `parseWeight` result (`kg`/`stable`) side-by-side, a Copy button (use `expo-clipboard` ONLY if already present — it is NOT a dependency, so fall back to a selectable `AppText` block; do not add a new dependency), and a Clear button (`scale.clearLog()`). Keep it inline JSX; extract a `ScaleDebugPanel` component under `apps/mobile/src/components/` only if the JSX grows large.
      Files: `/Users/ericksegura/Documents/backupHDD/personal/control-picking/.worktrees/bluetooth-scale/apps/mobile/app/(tabs)/register.tsx` (and optionally a new `/Users/ericksegura/Documents/backupHDD/personal/control-picking/.worktrees/bluetooth-scale/apps/mobile/src/components/ScaleDebugPanel.tsx`)
      Verify: `npx tsc --noEmit -p apps/mobile/tsconfig.json` passes; `npm run lint -w @fundo360/mobile` reports no new errors.

- [ ] 9. Add the feature-flag migration and shared constant.
      Create `supabase/migrations/20261007000001_feature_flag_bluetooth_scale.sql` following the `20261004000001_feature_flag_report_export.sql` template: documented Spanish header comment (purpose, Android-only rationale, manual fallback, default OFF, `org_override`, idempotency via `uq_platform_feature_flags_key`, reversibility `DELETE FROM platform_feature_flags WHERE key = 'bluetooth_scale';`), then `INSERT INTO platform_feature_flags (key, name, description, category, strategy, enabled) VALUES ('bluetooth_scale', 'Lectura de balanza Bluetooth', '<Spanish description>', 'cosecha', 'org_override', false) ON CONFLICT (key) DO NOTHING;`. In `packages/shared/src/constants/index.ts`, add `BLUETOOTH_SCALE: 'bluetooth_scale',` to the `FEATURE_FLAGS` `as const` object. Do NOT touch `packages/shared/src/validation/index.ts` (manual_kg already covers the payload) or `apps/mobile/src/hooks/useFeatureFlag.ts`.
      Files: `/Users/ericksegura/Documents/backupHDD/personal/control-picking/.worktrees/bluetooth-scale/supabase/migrations/20261007000001_feature_flag_bluetooth_scale.sql`, `/Users/ericksegura/Documents/backupHDD/personal/control-picking/.worktrees/bluetooth-scale/packages/shared/src/constants/index.ts`
      Verify: the SQL filename timestamp is strictly greater than `20261006000001`; `npx vitest --run` for `packages/shared` still passes (`npm test -w @fundo360/shared`) and `npm run lint -w @fundo360/shared` reports no new errors.

- [ ] 10. Final whole-repo verification (single-run, no watch).
      From the worktree root run the project's real scripts and confirm they pass. Fix any new errors before finishing.
      Files: none (verification only).
      Verify, in order (all from `/Users/ericksegura/Documents/backupHDD/personal/control-picking/.worktrees/bluetooth-scale`):
      - `npm install` (if not already run) — completes clean.
      - `npm run lint` (`turbo lint` across the monorepo) — no new errors.
      - `npm test` (`turbo test`, which runs `vitest --run` per package) — all tests pass, including the new parser suite.
      - `npx tsc --noEmit -p apps/mobile/tsconfig.json` — mobile typechecks clean (there is no monorepo `typecheck` script; this is the real typecheck command for the changed mobile code).

## Commit / PR note the implementer must include (do NOT execute the native build)

Document in the commit/PR body: the resolved `react-native-bluetooth-classic` version and why (NIT-1); that after `npm install` the user must run `npx expo prebuild -p android` then a fresh dev/preview build (`eas build -p android --profile development|preview`, or local `npm run build:android`) — Expo Go / JS reload will NOT include the native module; pair `L261241` once in Android settings (PIN `1234`); enable the `bluetooth_scale` flag for the test org and apply the migration (`npm run db:migrate`). Commit with `git -C /Users/ericksegura/Documents/backupHDD/personal/control-picking/.worktrees/bluetooth-scale`; never push.

## Assumptions / gaps (made explicit, per design + review)

- The real LP7516C SPP frame is UNKNOWN; the parser default is an acknowledged guess, isolated and tunable in one place, with a skipped real-format test ready to enable once the debug panel captures the frame.
- Exact `react-native-bluetooth-classic` version and config-plugin option keys are confirmed at install time (steps 1–2); the RC fallback ships only if no stable exists on that line.
- The scale MAC/advertising name are hardware-specific; name-match is primary, MAC is fallback.
