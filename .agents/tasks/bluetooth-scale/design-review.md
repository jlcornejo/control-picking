# Design Review — Bluetooth Scale Auto-Weight Capture

Reviewed document: `.agents/tasks/bluetooth-scale/design.md`
Reviewer: design-review subagent (fresh context)
Date: 2026-10-07

## Scope of review

Checked the design for ambiguity, unverified assumptions, missing details, feasibility gaps, scope creep, conflicting sections, unspecified error handling, and missing input-validation rules. Every claim the design marks as "verified by reading code" was independently re-verified against the actual source. The six focus points from the task brief (a–f) are each addressed under Findings or Verified Assumptions.

## Domain-invariant check

Confirmed the reviewed design does not violate the project invariants: picking quantity/weight stays `> 0` (owned by the existing submit guard `parseFloat(manualKg) > 0` + the `manual_kg` Zod schema; the scale only populates the input and cannot bypass it); `rate_amount_snapshot > 0` untouched; settlement immutability untouched; RBAC untouched; entity naming (`picking_records`, `blocks`, `products`, `rates`, `workers`, `settlements`, `payments`) unchanged — the only DB write is one `platform_feature_flags` row. No violations.

---

## Findings

### NIT-1 — RC-pinned native dependency vs. "prefer stable / well-known" convention
**Where:** §1 "Dependency" — `"react-native-bluetooth-classic": "1.73.0-rc.12"`.
**Problem:** The project's dependency convention favors pinned *stable* versions. The design pins a release-candidate (`-rc.12`). The design already mitigates this: it instructs the implementer to verify the latest stable-enough version at install time, prefer a non-RC stable `≥` this line if one exists, and record the resolved version in the commit. That instruction is concrete and the risk is explicitly owned, so this is a NIT rather than a blocker — but the implementer must not silently ship the RC if a stable exists.
**Fix:** At install, run `npm view react-native-bluetooth-classic versions --json` and pick the highest stable (non-`rc`/`beta`) release that supports RN 0.81 / New Architecture; only fall back to `1.73.0-rc.12` if no stable on that line exists, and note the decision in the PR body. Keep the exact pin (no caret), as the design already requires.

### NIT-2 — `app.json` plugin option key is unverified and version-dependent
**Where:** §1 "(a) Register the config plugin" — the `bluetoothAlwaysPermission` option key.
**Problem:** The design itself states the exact option keys depend on the installed plugin version and must be confirmed against `app.plugin.js`. This is correctly flagged as a to-confirm item, and the bare-string fallback form is given, so it is not a gap in the design's reasoning — just a step the implementer must not skip. The defensive iOS usage string is sound (keeps an iOS build/submission valid even though the feature is Android-only at runtime).
**Fix:** After `npm install`, open `node_modules/react-native-bluetooth-classic/app.plugin.js` and confirm the accepted option keys; if the plugin injects descriptions automatically, use the bare `"react-native-bluetooth-classic"` string form. No design change required.

---

## Verified Assumptions (independently confirmed against source)

1. **`round3` is a local `const` inside `submitMutation.mutationFn`.** Confirmed in `register.tsx`: `const round3 = (x: number) => Math.round(x * 1000) / 1000;`. The design's plan to extract it to a shared helper and use it in both the button and the mutation is behavior-preserving (identical formula). (focus-point d, "round3 sharing")
2. **`manualKg` is the single kg integration point.** Confirmed: `const [manualKg, setManualKg] = useState('')`, the kg-manual branch reads it (`parseFloat(manualKg)`), the submit derives `paidQuantityKg = round3(kg)` with a `> 0` guard, and `canSubmit = kgManualApplies ? parseFloat(manualKg) > 0 : ...`. Writing a string into `manualKg` and leaving the input editable preserves the manual path and the submit contract exactly. (focus-point d)
3. **Render gating criteria exist and are exactly as cited.** Confirmed: `isKgBlock = selectedBlock?.unit_measure === 'kg'`; `kgTareApplies = isKgBlock && tareEnabled && (boxTypes?.length ?? 0) > 0`; `kgManualApplies = isKgBlock && !kgTareApplies`. The design's `scaleApplies = scaleEnabled && Platform.OS === 'android' && kgManualApplies` correctly scopes the button to the kg-manual branch only — never the box path (`!isKgBlock`) nor the kg-with-tare path. This matches the brief's requirement "flag ON + Android + unit_measure==='kg'" (the design further narrows to the no-tare kg case, which is correct because the tare kg path derives weight from the box, not from `manualKg`). (focus-point d)
4. **Box/tare path is untouched.** Confirmed: the box (`quantity`) branch and the `kgTareApplies` branch in the QUANTITY step and the submit mutation are independent of `manualKg`; the scale only writes `manualKg`. (focus-point d)
5. **Latest migration is `20261006000001_create_payment_photo_evidence.sql`.** Confirmed by listing `supabase/migrations/`. The proposed `20261007000001_feature_flag_bluetooth_scale.sql` is strictly greater. (focus-point e)
6. **Feature-flag migration template matches.** Confirmed against `20261004000001_feature_flag_report_export.sql` and `20261003000005_feature_flags_kg_varieties.sql`: same `INSERT INTO platform_feature_flags (key, name, description, category, strategy, enabled) VALUES (...) ON CONFLICT (key) DO NOTHING;` shape, `strategy='org_override'`, `enabled=false` default, documented reversibility comment. (focus-point e)
7. **Schema accepts the proposed row.** Confirmed in `20260913000002_create_feature_flags.sql`: `category` is `VARCHAR(60)` with no CHECK (so `'cosecha'` is valid and already used by `kg_payment`); `strategy` is enum `feature_flag_strategy` with `'org_override'` a member; `key` CHECK `^[a-z0-9]+(_[a-z0-9]+)*$` matches `bluetooth_scale`; `name` `VARCHAR(150)` fits "Lectura de balanza Bluetooth"; `uq_platform_feature_flags_key` makes the INSERT idempotent. Default OFF is honored. (focus-point e)
8. **`useFeatureFlag` needs no change.** Confirmed: `useFeatureFlag(key: string)` resolves global default + org override and returns `{ enabled, loading }`. Calling `useFeatureFlag('bluetooth_scale')` works with no hook change.
9. **`FEATURE_FLAGS` shape.** Confirmed in `packages/shared/src/constants/index.ts`: adding `BLUETOOTH_SCALE: 'bluetooth_scale'` matches the existing `as const` object style.
10. **Stack versions.** Confirmed in `apps/mobile/package.json`: Expo `~54.0.0` (design correctly overrides the steering table's "51"), React `19.1.0`, React Native `0.81.5`, `expo-haptics ~15.0.8` present. `AppText`/`AppTextInput` are exported from `apps/mobile/src/components/AppText.tsx`.
11. **Vitest pure-logic test precedent exists.** Confirmed: `apps/mobile/src/lib/export/__tests__/csv.test.ts` and `settlement-pdf.test.ts` exist; `test` script is `vitest --run`. The parser tests add no new tooling. (focus-point b)
12. **`eas.json` profiles and build script.** Confirmed: `development` (dev client, APK) and `preview` (internal APK) profiles exist; `build:android` is `eas build --platform android --profile preview --local`, exactly as the design cites. No `eas.json` change needed.
13. **`expo-clipboard` is not a dependency.** Confirmed absent from `apps/mobile/package.json`. The design correctly says to use it "only if already available" and fall back to selectable text rather than adding a dependency — so no accidental new dep. (scope-creep check)
14. **`app.json` is classic JSON with camera-only Android permission and a plugins array.** Confirmed: `android.permissions` is `["android.permission.CAMERA"]`; plugins array holds `expo-router`, `expo-splash-screen`, `expo-camera`, `expo-build-properties`. The design's append-only edits are accurate.

**Focus-point coverage summary:**
- **(a) Protocol treated as UNKNOWN:** PASS. §Overview, Assumption 4, §2 "Default pattern strategy", and §5 debug panel all repeatedly and explicitly mark the LP7516C SPP frame as undocumented/educated-guess, with an on-device capture tool to confirm it and a skipped "real-format" test ready to enable. No fabricated confirmed protocol.
- **(b) Parser pure and isolated, easy to tune:** PASS. `parse-weight.ts` is a pure string→`ParsedWeight` function with an ordered, labeled pattern table; tuning is a one-line edit (add the confirmed regex as the first entry). No React/native imports; Vitest-tested.
- **(c) iOS-unsupported / lazy native import:** PASS (see Verified Assumption 10 + the crash-safety design). `loadNative()` returns null on non-Android and try/catches the `require` so Expo Go / missing module flips to `unsupported` instead of crashing; type is `typeof import(...)` (type-only, erased, no runtime require). The native module is never imported at top level.
- **(d) register.tsx integration:** PASS (Verified Assumptions 1–4).
- **(e) Migration naming/pattern/default-OFF:** PASS (Verified Assumptions 5–7).
- **(f) Code-in-English / UI-in-Spanish:** PASS. Identifiers, types, functions are English (`parseWeight`, `useBluetoothScale`, `ScaleStatus`, `BLUETOOTH_SCALE`); UI strings and migration comments are Spanish ("Leer balanza", "Balanza conectada", "Permiso de Bluetooth denegado", "Lectura de balanza Bluetooth"). Consistent with the repo convention.

---

## Unverified / Wrong Assumptions

These are items the design relies on that could NOT be confirmed from the repository and depend on external reality. The design explicitly flags each as to-confirm, so none rises to a blocking finding — they are recorded here for the implementer:

1. **The real LP7516C SPP frame format.** Not knowable from the repo; the default parser is an acknowledged guess. Mitigated by the debug panel + isolated pattern table + skipped real-format test. (Correctly handled as UNKNOWN per focus-point a.)
2. **`react-native-bluetooth-classic` version + config-plugin option keys + RN 0.81 / New Architecture compatibility.** Cannot be verified without installing. The design instructs verification at install time (see NIT-1, NIT-2). The claim that the RC line "supports RN 0.7x/New Architecture" is the library maintainer's claim, not verified here.
3. **The scale MAC `0F:03:25:C2:02:01` and advertising name `L261241`.** Hardware-specific; the design correctly makes name-match primary and MAC a fallback, and notes the MAC may differ per physical unit.
4. **`expo-clipboard` availability.** Confirmed *absent* (Verified Assumption 13); the design's conditional use + fallback is correct, so this is resolved, not open.

---

## Verdict

HIGH findings: 0
MEDIUM findings: 0
NIT findings: 2

Per the mechanical rule (verdict = CHANGES_REQUESTED iff HIGH+MEDIUM > 0), the verdict is **APPROVED**. The two NITs are install-time confirmations the design already calls out; they do not block implementation but must be honored during coding.
