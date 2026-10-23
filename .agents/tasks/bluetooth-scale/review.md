# Bluetooth scale auto-weight capture for the mobile register screen

This change adds optional automatic weight capture from a paired Bluetooth Classic / SPP scale (indicator LP7516C, name `L261241`, PIN 1234) to the picking register screen. A new Android-only hook owns the native-module lifecycle, a pure parser turns the undocumented serial frame into `{ kg, stable, raw }`, and the register screen grows a "Leer balanza" button plus a raw-stream debug panel — all gated behind a new `bluetooth_scale` feature flag (default OFF) and a hard `Platform.OS === 'android'` guard. The manual kilo input and the entire submit path are untouched and remain the fallback. The real serial frame is unknown, so parsing is isolated in one tunable module with its uncertainty called out and a skipped real-format test ready to enable once the frame is captured on-device.

Watch for: the design/plan assumed `react-native-bluetooth-classic` ships an Expo config plugin and only RC builds exist; the coder documented (confirmed) that no `app.plugin.js` exists at `1.73.0-rc.17`, so no plugin entry was added and permissions are wired via the explicit `android.permissions` array instead — a reasonable, documented deviation from the written requirement that the native build (not run here) must still validate. A pinned RC dependency (likely) is the only version available on npm for this library.

**Verdict**: APPROVED

## High-level view

The native module is never imported at the top level. `loadNative()` returns `null` off Android and wraps the `require` in try/catch, so iOS and Expo Go report `supported: false` and every action is a benign no-op — the module is only `require`d when the flag is on, the platform is Android, and the hook is enabled. This satisfies the Android-only, no-crash-on-iOS requirement with defense in depth (render gate plus hook guard).

The parser is pure, framework-free, and returns the required `{ kg, stable, raw }`. The uncertainty of the real LP7516C frame is prominently commented, the default patterns live in one ordered table so tuning is a one-line edit, and the "absent unit defaults to kg" assumption is flagged inline. Vitest coverage is thorough for the guessed format, with a skipped placeholder for the confirmed frame.

The register integration is correctly scoped: the button and debug panel render only when `scaleEnabled && Platform.OS === 'android' && kgManualApplies`, auto-fill writes `round3(kg)` into the still-editable `manualKg`, and the box/tare path, `canSubmit`, and submit mutation are unchanged. The only refactor to existing code is extracting the inline `round3` into a shared helper with an identical formula.

The feature flag is wired across all three layers: a migration that matches the existing flag-migration template (strictly-greater timestamp, `org_override`, `enabled false`, category `cosecha`, Spanish name/description, idempotent), the `BLUETOOTH_SCALE` constant in shared, and consumption via the existing `useFeatureFlag`. No validation change, which is correct since `manual_kg` already covers the payload.

<details>
<summary>Issues (2)</summary>

1. **No Expo config plugin added** — the written requirement called for an `app.json` config plugin entry; the installed `react-native-bluetooth-classic@1.73.0-rc.17` ships no `app.plugin.js`, so the coder wired permissions via the explicit `android.permissions` array and documented the deviation. Non-blocking, but the user's native build must confirm autolinking produces a working manifest. (confirmed)
2. **Pinned RC dependency** — `1.73.0-rc.17` is a release candidate, not a stable release, because the library publishes only RC builds. Acceptable per the plan's documented fallback; note it as a supply-chain caveat to re-pin when a stable ships. (likely)

</details>

<details>
<summary>Details</summary>

### Android-only native access with lazy, crash-safe loading

`loadNative()` short-circuits to `null` on any non-Android platform before touching `require`, and the `require` itself is wrapped so a missing native module (Expo Go, not-prebuilt binary) resolves to `null` rather than throwing. The module type is pulled in via `typeof import('react-native-bluetooth-classic').default`, a type-only reference erased at compile time that never emits a runtime require — so iOS genuinely never links the module. `supported` is `enabled && Platform.OS === 'android' && nativeRef.current !== null`, and `connect`/`refreshDevices` bail early with a Spanish error when `!supported`, reinforced by the render gate so the hook isn't even exercised on the flag-off path.

Cleanup flips the mounted ref, tears down the data subscription, and best-effort disconnects on unmount; a `mountedRef` guards every `setState` so a late native callback after unmount can't update a dead component. Subscriptions are stored in refs and removed on reconnect (`teardownSubscription` before re-subscribing), so repeated connects don't leak listeners. Untrusted native payloads are narrowed with `isDataEvent`/`toScaleDevice` type guards before use, and incoming lines are length-capped — the serial stream is treated as untrusted input. No `any` appears in the hook.

### Pure, isolated weight parser

`parse-weight.ts` imports nothing from React or native code and exposes exactly `parseWeight(chunk: string): ParsedWeight` with `{ kg, stable, raw }`. A boxed WARNING comment states the LP7516C frame is undocumented, the patterns are an educated guess, and points to the debug panel as the way to capture the real frame and add it as the first entry. The ordered `WEIGHT_PATTERNS` table makes the "adjustable default pattern" concrete, and the "absent unit defaults to kg" assumption is flagged inline at `normalizeKg`. Edge handling worth noting: negative-zero normalizes to `0`, non-finite values coerce to `null`, over-length and unmatched lines return `kg: null` without throwing, and an overload token path returns `{ kg: null, stable: false }`. The contract that the parser only sees whole lines (the hook does the CR/LF splitting) is documented and honored.

### Parser test coverage

The Vitest suite (`import { describe, it, expect } from 'vitest'`, matching the existing `csv.test.ts` precedent) covers stable/motion status, grams→kg with and without a status prefix, bare decimals, signed values with internal spaces, tare-zero, overload tokens and dash runs, empty/whitespace, locale comma, over-length flood, non-numeric lines, and raw preservation. A skipped `it.skip` placeholder documents the real-format TODO. Not tested (by design): the hook's native interaction and the register button, which require hardware and a native build — the commit records this explicitly, and the branchy logic was deliberately pushed into the pure parser to keep it testable.

### Register integration and the round3 extraction

`scaleApplies = scaleEnabled && Platform.OS === 'android' && kgManualApplies` gates both the button and the debug panel, so iOS and flag-off render exactly as before and the box path / `kgTareApplies` path are never touched. `handleReadScale` connects if needed and writes `String(round3(scale.lastWeightKg))` into `manualKg`; the `AppTextInput` keeps `onChangeText={setManualKg}` and stays editable as the fallback. `canSubmit`, the submit mutation's `parseFloat(manualKg) > 0` guard, and the box/tare branch are unchanged — the only edit to the mutation is swapping the inline `const round3` for the imported shared helper, whose formula (`Math.round(x * 1000) / 1000`) is identical, so behavior is preserved. The hook is called unconditionally (as hooks must be) and short-circuits internally when `enabled` is false. `resetForSameBlock` additionally calls `scale.clearLog()`, the optional behavior the plan allowed.

### Debug panel, same gating

The collapsible "Ver crudo" panel is rendered only inside the `scaleApplies` block, so it inherits the flag + Android gating. CR/LF are visualized as `\r`/`\n` tokens (needed to characterize the line terminator for parser tuning), and Copy reuses a `selectable` `AppText` rather than adding `expo-clipboard` — matching the plan's "do not add a new dependency" constraint.

### Feature flag migration matches the template

`20261007000001_feature_flag_bluetooth_scale.sql` carries a strictly-greater timestamp than the prior latest (`20261006000001`) and reproduces the `20261004000001_feature_flag_report_export.sql` template verbatim in shape: documented Spanish header, reversibility note, and `INSERT ... VALUES ('bluetooth_scale', 'Lectura de balanza Bluetooth', '<Spanish>', 'cosecha', 'org_override', false) ON CONFLICT (key) DO NOTHING`. `validation/index.ts` is deliberately untouched — the scale only fills `manual_kg`, already covered by the existing schema.

### app.json and the config-plugin deviation

`android.permissions` gains `BLUETOOTH`, `BLUETOOTH_ADMIN`, `BLUETOOTH_CONNECT`, `BLUETOOTH_SCAN`, and `ACCESS_FINE_LOCATION`, and a defensive Spanish `NSBluetoothAlwaysUsageDescription` is added to `ios.infoPlist`. The one requirement not met literally is the config-plugin entry: the commit documents that `1.73.0-rc.17` ships no `app.plugin.js`, so no plugin was added and the native module autolinks via its `android/` project at prebuild, with the explicit permissions array wiring the manifest. The risk it carries is that manifest wiring and autolinking are only provable by the native build, which — per the task — the coder correctly did not run.

### Verification evidence (not re-run)

The commit body records `npm test` (turbo → vitest) passing with mobile 30 passed / 1 skipped (parser suite included), shared 32 passed, web 9 passed; `npx tsc --noEmit -p apps/mobile/tsconfig.json` clean; `npm run lint -w @fundo360/mobile` with 0 errors (pre-existing warnings only). The whole-repo `npm run lint` fails only at `@fundo360/shared`, which has no `eslint.config.js` under ESLint v9 — a pre-existing tooling gap unrelated to this one-line constant edit. This evidence is present and specific, so per the task the suites were not re-run.

</details>

<details>
<summary>File map</summary>

- `apps/mobile/package.json` — add pinned `react-native-bluetooth-classic@1.73.0-rc.17` + `vitest@^3.0.0` devDep
- `apps/mobile/app.json` — Android BT permissions + defensive iOS usage string (no config plugin; documented)
- `apps/mobile/app/(tabs)/register.tsx` — flag read, `scaleApplies` gate, "Leer balanza" button + status + debug panel, shared `round3`
- `apps/mobile/src/hooks/useBluetoothScale.ts` — Android-only hook, lazy native load, lifecycle + cleanup
- `apps/mobile/src/lib/scale/parse-weight.ts` — pure parser, ordered pattern table, uncertainty documented
- `apps/mobile/src/lib/scale/__tests__/parse-weight.test.ts` — Vitest suite + skipped real-format placeholder
- `apps/mobile/src/lib/scale/round3.ts` — extracted shared helper (identical formula)
- `packages/shared/src/constants/index.ts` — `BLUETOOTH_SCALE` constant
- `supabase/migrations/20261007000001_feature_flag_bluetooth_scale.sql` — flag seed, matches template
- `package-lock.json` — lockfile update

Full diff: `git -C /Users/ericksegura/Documents/backupHDD/personal/control-picking/.worktrees/bluetooth-scale diff main...feature/bluetooth-scale`

</details>
