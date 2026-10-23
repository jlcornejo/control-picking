# Design — Bluetooth Scale Auto-Weight Capture (mobile)

Task ID: bluetooth-scale · Branch: `feature/bluetooth-scale` · Worktree: `/.worktrees/bluetooth-scale`

## Overview

The Fundo360 picking registration screen (`apps/mobile/app/(tabs)/register.tsx`) already captures kilos manually for kg-priced products (`manualKg` state, gated by the `kg_payment` flag). This feature adds **automatic weight capture** from a paired Bluetooth Classic / SPP scale (indicator **LP7516C**, advertising name `L261241`, PIN `1234`), so the note-taker scans the worker QR, presses **"Leer balanza"**, and the stabilized weight auto-fills the existing `manualKg` field. The manual path stays fully intact as the fallback.

The work is strictly additive and gated behind a new feature flag `bluetooth_scale` (default OFF) plus a hard **Android-only** platform guard. On iOS, or when the flag is off, the screen renders **exactly as today** — no button, no native module loaded. Because the SPP data protocol of this indicator is **undocumented**, the design isolates the byte-stream parsing into a pure, unit-tested module with an explicitly-adjustable default pattern, and ships a **debug panel** that shows the raw incoming stream so the user can characterize the real format on-device and tune the parser without external tools.

This touches a native module (`react-native-bluetooth-classic`) that is **not in Expo Go** and requires a new native build (`expo prebuild` + Android/EAS build). The design does not run that build; it leaves the project buildable by the user.

## Locked technology stack

The stack is fixed once this design is approved. No technology beyond the following is introduced:

- **`react-native-bluetooth-classic`** (npm) — the single new runtime dependency. Standard SPP library for React Native with an Expo config plugin (`react-native-bluetooth-classic/app.plugin.js`) that wires Android permissions and the native Gradle module. Pin to an exact version (see §1).
- Existing stack only for everything else: React Native 0.81 / React 19 / Expo SDK 54, TanStack Query, `expo-haptics`, the project's `AppText`/`AppTextInput`, theme tokens, and **Vitest** (already used for mobile pure-logic tests under `src/lib/export/__tests__/`).
- Supabase migration SQL following the existing feature-flag migration pattern.

No BLE library, no second BT library, no native code written by hand — the config plugin handles the Android manifest and Gradle wiring.

## Assumptions (explicit)

1. **Classic/SPP, not BLE** — confirmed by the user (paired from Android settings with PIN 1234, offered contact/call sharing). `react-native-bluetooth-classic` targets exactly this (RFCOMM/SPP). BLE libraries are out.
2. **iOS has no path** — iOS cannot talk to an un-MFi SPP accessory. iOS is **manual-only, forever**, for this hardware. The design does not attempt a degraded iOS BT mode; it renders the screen unchanged on iOS.
3. **Device must already be paired at the OS level.** The app connects to an already-**bonded** device; it does not drive OS pairing/PIN entry (that `1234` prompt is a one-time Android-settings action). The hook lists bonded devices and connects; if `L261241` is not bonded, the UI tells the user to pair it in Android settings first.
4. **The real data frame is UNKNOWN.** The default parser pattern is an *educated guess* for Chinese LP-type indicators (ASCII line, optional status prefix, decimal number, `kg`/`g` unit, CR/LF terminator). It is explicitly marked as unconfirmed and designed to be swapped in one place once the debug panel reveals the real frame.
5. **`manualKg` is the single integration point.** Auto-read writes a string into the existing `manualKg` state (rounded with the screen's `round3`). Nothing else in the submit mutation, the box/tare path, or validation changes — `paid_quantity_kg` is still derived from `manualKg` exactly as today.
6. **Expo SDK is 54** (not 51 as the steering table says) — verified in `apps/mobile/package.json`. The config-plugin / prebuild approach is identical regardless.

## 1. Native module + `app.json` plugin/permission changes

### Dependency

Add to `apps/mobile/package.json` dependencies, **exact-pinned** (no caret), per the project's security convention for new deps:

```jsonc
"react-native-bluetooth-classic": "1.73.0-rc.12"
```

> Rationale: `react-native-bluetooth-classic` is the de-facto SPP library for RN; its `1.73.0-rc.x` line is the one that ships the Expo config plugin and supports RN 0.7x/New Architecture. The implementer must verify the latest stable-enough version at install time and pin it exactly; if a non-RC stable ≥ this line exists, prefer it. Record the resolved version in the commit.

Do **not** run the install's native build. Document (in the task README / PR body) that after `npm install` the user must run `npx expo prebuild -p android` (or let EAS prebuild) and produce a **new dev/preview build** — a JS reload or Expo Go will not pick up the native module.

### `app.json` changes

`apps/mobile/app.json` uses the classic `app.json` (not `app.config.ts`) and already lists plugins (`expo-router`, `expo-splash-screen`, `expo-camera`, `expo-build-properties`). Two edits:

**(a) Register the config plugin** in the `plugins` array (append):

```jsonc
"react-native-bluetooth-classic"
```

If the plugin version requires options (bluetooth usage descriptions), use the object form. Since iOS will never use SPP here but the plugin may still inject an iOS usage string on build, provide a Spanish description defensively so an iOS build does not fail App review for a missing string:

```jsonc
[
  "react-native-bluetooth-classic",
  {
    "bluetoothAlwaysPermission": "La aplicación usa Bluetooth para leer el peso desde la balanza conectada."
  }
]
```

> The exact option keys depend on the plugin version; the implementer confirms against the installed plugin's `app.plugin.js`. If the plugin injects everything automatically, the bare string form is enough. iOS gets the usage string only to keep builds/submission valid — the feature is still Android-only at runtime.

**(b) Android permissions** — extend `android.permissions` (currently only `CAMERA`):

```jsonc
"permissions": [
  "android.permission.CAMERA",
  "android.permission.BLUETOOTH",
  "android.permission.BLUETOOTH_ADMIN",
  "android.permission.BLUETOOTH_CONNECT",
  "android.permission.BLUETOOTH_SCAN",
  "android.permission.ACCESS_FINE_LOCATION"
]
```

- `BLUETOOTH` / `BLUETOOTH_ADMIN` → legacy (Android ≤ 11) connect/admin.
- `BLUETOOTH_CONNECT` → Android 12+ runtime permission actually needed to connect to a bonded device. **Must be requested at runtime** (see §3).
- `BLUETOOTH_SCAN` → Android 12+; included for completeness since the lib's discovery APIs touch it, even though our default flow uses bonded devices (no active scan required).
- `ACCESS_FINE_LOCATION` → required on Android ≤ 11 for any BT enumeration; harmless on 12+ (we keep the pre-12 path working). Kept to avoid an enumeration failure on older field phones.

> The config plugin typically merges most of these into the manifest automatically; listing them in `app.json` makes the intent explicit and guarantees the manifest entry even if a plugin version omits one. Duplicate manifest entries are idempotent.

No change to `expo-build-properties` is required; the existing Android Gradle memory bump stays.

### `eas.json`

No change needed. Existing `development` (dev client, APK) and `preview` (internal APK) profiles are exactly what the user needs to test on a physical Android device. Document that the test build is `eas build -p android --profile development` (or `preview`), or local `npm run build:android` (already defined: `eas build --platform android --profile preview --local`).

## 2. Pure weight parser — `apps/mobile/src/lib/scale/parse-weight.ts`

A single pure function, no React, no native imports, fully unit-testable with Vitest (mirrors the existing `src/lib/export/csv.ts` + `__tests__` pattern).

### Public API

```ts
export interface ParsedWeight {
  /** Parsed weight in KILOGRAMS, or null if no number could be extracted. */
  kg: number | null;
  /** true=stable/ST, false=motion/US, null=unknown (format has no status field). */
  stable: boolean | null;
  /** The raw chunk exactly as received (for the debug log / audit). */
  raw: string;
}

/** Parse one raw chunk (already decoded to string) into a weight reading. */
export function parseWeight(chunk: string): ParsedWeight;
```

Input is a **string**. The hook decodes incoming bytes to a string before calling the parser (the lib's `read()`/`onDataReceived` give string data for SPP by default). Keeping the parser string-only makes it trivial to test and avoids `Buffer`/byte handling in pure code. If raw bytes are ever needed, a thin `decodeChunk(bytes: Uint8Array): string` helper can be added later; it is **not** needed for the default ASCII assumption.

### Default pattern strategy (uncertainty called out)

The module holds an **ordered table of candidate patterns**, each a labeled regex with a comment, plus a unit normalizer. `parseWeight` tries patterns in order and returns the first match. This makes tuning a one-line edit: when the debug panel reveals the real frame, add/replace the top pattern.

```ts
// WARNING: UNCONFIRMED FORMAT. The LP7516C Bluetooth module's frame is NOT
// documented by the manufacturer. The patterns below are an EDUCATED GUESS for
// typical Chinese LP-type weight indicators (ASCII, CR/LF terminated). Use the
// in-app debug panel (register screen, flag bluetooth_scale, Android) to capture
// the REAL stream, then add the confirmed pattern as the FIRST entry here.
interface WeightPattern {
  label: string;            // human note, e.g. "ST,GS prefix + kg"
  re: RegExp;               // captures: status? sign? number unit?
  extract: (m: RegExpMatchArray) => { status?: string; value: string; unit?: string };
}
```

Default table (guesses, documented):

1. `"ST,GS,+  12.50kg"` style — `^(ST|US|OL)\s*,?\s*(?:NT|GS)?\s*,?\s*([+-]?\s*\d+(?:\.\d+)?)\s*(kg|g)?` → status from group 1 (`ST`→stable), signed decimal, optional unit.
2. Bare signed decimal with optional unit — `([+-]?\s*\d+(?:\.\d+)?)\s*(kg|g)?` → `stable: null`.

Normalization rules (all documented in-code):
- Strip internal spaces inside the number (`+  12.50` → `12.50`), apply sign.
- Unit: `kg` (or none) → use as-is; `g` → divide by 1000. Default assumption when unit absent: **kg** (it is a 60 kg scale). This assumption is flagged in a comment as adjustable.
- `stable`: `ST` → `true`, `US`/motion → `false`, no status token → `null`.
- If no pattern matches, return `{ kg: null, stable: null, raw: chunk }` (never throw).

### Edge cases the parser must handle (and tests must cover)

- Empty / whitespace-only chunk → `kg: null`.
- Partial frame (number split across two BT chunks). **The parser only sees whole lines** — chunk reassembly (buffering until CR/LF) is the hook's job (§3). The parser's contract is "call me with one terminated line"; the hook splits on `\r\n`/`\n`/`\r`.
- Negative / tare-zero (`-0.00`, `0.00`) → `kg: 0` (valid read, below the submit's `> 0` guard).
- Overload token (`OL`, `-----`) → `kg: null`, `stable: false`.
- Trailing units and CR/LF already stripped by the regex (no terminator in the captured number).
- Locale decimal comma (`12,50`) → a documented optional pattern normalizes `,`→`.`.
- Non-finite guard: NaN/Infinity never returned → coerced to `kg: null`.

### Tests — `apps/mobile/src/lib/scale/__tests__/parse-weight.test.ts`

Vitest (`import { describe, it, expect } from 'vitest'`), same shape as `csv.test.ts`. Cases: happy ASCII with/without status, `g` unit conversion, bare number, sign handling, zero, overload, empty, comma decimal, and a "real-format TODO" placeholder (skipped) documenting it will be enabled once the frame is captured. Runs under the existing mobile `test` script (`vitest --run`) — **no new tooling**.

## 3. Hook — `apps/mobile/src/hooks/useBluetoothScale.ts`

A React hook that owns the native module lifecycle, exposes a clean state machine, and is **inert on iOS / Expo Go**.

### Lazy / conditional import (crash-safety)

The native module is **never imported at module top-level**. It is loaded lazily, guarded by `Platform.OS === 'android'`, inside a helper so that:
- On iOS the module is never required (no crash, no linking error).
- In Expo Go (native module absent even on Android) the `require` is wrapped in try/catch and failure flips state to `unsupported`, not a crash.

```ts
import { Platform } from 'react-native';

type RNBTClassic = typeof import('react-native-bluetooth-classic').default;

function loadNative(): RNBTClassic | null {
  if (Platform.OS !== 'android') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-bluetooth-classic');
    return (mod.default ?? mod) as RNBTClassic;
  } catch {
    return null; // Expo Go / not built with the native module
  }
}
```

No `any`: the module type is derived via `typeof import(...)` (type-only, erased at compile time, so it never triggers a runtime require). Unknown event payloads are narrowed with type guards before use.

### Public API

```ts
export type ScaleStatus = 'idle' | 'connecting' | 'connected' | 'error';
export interface BtScaleDevice { address: string; name: string | null; }

export interface UseBluetoothScale {
  supported: boolean;             // false on iOS / Expo Go / module missing
  status: ScaleStatus;
  lastWeightKg: number | null;
  lastStable: boolean | null;
  rawLog: string[];               // bounded ring buffer of raw chunks (debug)
  devices: BtScaleDevice[];       // bonded devices
  error: string | null;
  refreshDevices: () => Promise<void>;
  connect: (address?: string) => Promise<void>; // default: find by name 'L261241'
  disconnect: () => Promise<void>;
  clearLog: () => void;
}

export function useBluetoothScale(opts: { enabled: boolean }): UseBluetoothScale;
```

### Behavior

- **iOS / unsupported / `enabled:false`:** `loadNative()` returns null (or the hook is disabled) → `supported=false`, `status='idle'`, all actions are no-ops that set a benign Spanish `error`. The native module is never touched.
- **Permissions (Android 12+):** before connecting, request `BLUETOOTH_CONNECT` (and `BLUETOOTH_SCAN` only if a scan is attempted) via `PermissionsAndroid`. If denied → `status='error'`. The default flow uses **bonded devices** (`getBondedDevices()`), avoiding an active scan so `ACCESS_FINE_LOCATION`/`BLUETOOTH_SCAN` prompts are avoided on most paths.
- **Device selection:** `refreshDevices()` populates `devices` from bonded devices. `connect()` with no arg picks the device whose name === `'L261241'` (constant `SCALE_DEVICE_NAME`), falling back to the MAC constant `'0F:03:25:C2:02:01'` if name match fails. `connect(address)` connects to an explicit selection (debug picker).
- **Streaming → parser:** on connect, subscribe to the device's data event. Incoming data is appended to an internal **line buffer**; the buffer is split on `\r\n` / `\n` / `\r`; each complete line is pushed to `rawLog` (ring buffer, cap ~200) and passed to `parseWeight`. `lastWeightKg`/`lastStable` update from the result (ignore `kg: null` for `lastWeightKg` but still log the raw line).
- **Stabilized reading:** `connect()`/the integration waits for a reading with `stable === true` when the format provides status; if the format has no status (`stable === null`), it uses a **debounce** — accept a value unchanged for ~500 ms. This policy lives in a small documented helper so it is tunable alongside the parser.
- **Errors / disconnect:** connection loss, read errors, or an exception set `status='error'` + a Spanish `error`; the hook does not throw to the component. A lost connection does not crash the screen — the manual input keeps working.
- **Cleanup:** `useEffect` cleanup on unmount removes all event subscriptions and calls `disconnect()`. Subscriptions are stored in refs so re-renders don't leak listeners. A mounted ref guards against setState-after-unmount.

Constants (`SCALE_DEVICE_NAME`, `SCALE_DEVICE_MAC`, `RAW_LOG_CAP`, `STABLE_DEBOUNCE_MS`) live at the top of the hook file with comments; the MAC is noted as this specific unit (may differ per physical scale, so name-match is primary).

## 4. Integration in `register.tsx`

The screen's `QUANTITY` step already branches on `kgManualApplies` (kg product, no tare) and renders the `manualKg` `AppTextInput`. The scale button attaches to **that branch only**.

### Gating logic (render condition)

Add near the other flag reads:

```ts
const { enabled: scaleEnabled } = useFeatureFlag('bluetooth_scale');
const scaleApplies = scaleEnabled && Platform.OS === 'android' && kgManualApplies;
```

- `kgManualApplies` is the **exact same** criterion the manual kg input already uses (`isKgBlock && !kgTareApplies`), so the button appears only where typing kilos is the flow — never on the box path or the kg-with-tare path.
- `Platform.OS === 'android'` means iOS **never** renders the button and never mounts the hook's native side.
- Flag OFF → `scaleApplies` false → screen identical to today.

(`Platform` is imported from `react-native`; the file already imports several RN primitives.)

### Hook mounting

Hooks can't be called conditionally, so `useBluetoothScale({ enabled: scaleApplies })` is always called but internally short-circuits: on non-Android or `enabled:false` it stays `idle`, never loads the native module, never requests permissions. This keeps the flag-off / iOS render path free of any BT side effects (defense in depth with the render gate).

### UI touchpoint

Inside the `kgManualApplies` render branch, below the big `manualKg` input + "kilos" label, render (only when `scaleApplies`) a **"Leer balanza"** button plus a compact status line:

- Button label: **"Leer balanza"** (Spanish). Ionicons glyph consistent with existing icon usage.
- On press: if `status !== 'connected'` call `connect()`; then read the stabilized weight. When a stable kg arrives, set `setManualKg(String(round3(kg)))` using the **same `round3`** the submit mutation uses (extract `round3` to a shared module so both share one definition — avoids drift).
- Status line (Spanish): "Conectando…", "Balanza conectada · 12.50 kg", "Sin conexión con la balanza", etc., driven by `status`/`error`/`lastWeightKg`.
- The `manualKg` `AppTextInput` **remains editable at all times** (fallback). Auto-fill just writes into it; the user can overwrite. `canSubmit` is unchanged (`parseFloat(manualKg) > 0`).
- A small **"Ver crudo" / debug toggle** (Android + flag only) opens the debug panel (§5).

Nothing in the submit mutation changes: it reads `manualKg`, validates `> 0`, `round3`, sets `paid_quantity_kg`. The box/tare and manual paths are untouched. `resetForm`/`resetForSameBlock` already clear `manualKg`; the hook's own cleanup handles disconnect, so no reset-logic change is required (optionally `resetForSameBlock` may call `clearLog()`).

### `round3` sharing

Currently `round3` is a local `const` inside `submitMutation.mutationFn`. Extract it to a tiny exported helper (e.g. `apps/mobile/src/lib/scale/round3.ts`, or reuse an existing util if one is found) so the button and the mutation use one implementation. This is the only refactor to existing code and is behavior-preserving (same formula `Math.round(x*1000)/1000`).

## 5. Debug mode (raw stream capture)

Purpose: let the user capture the **real** LP7516C frame on-device to tune the parser — no external terminal app.

**Placement:** a **collapsible panel** inside the register screen's kg-manual branch (not a separate route), gated by `scaleApplies` (flag + Android). Chosen over a separate screen because it must share the live `useBluetoothScale` instance/connection; a separate route would need to re-establish the connection and complicate navigation. A collapsible panel keeps it beside the "Leer balanza" flow and off-screen by default.

**Contents:**
- Device picker: list `devices` (bonded), tap to `connect(address)`.
- Connection status + `error`.
- A monospace, scrollable view of `rawLog` showing each chunk **exactly as received**, with control chars visualized (`\r`/`\n` rendered as visible tokens so the terminator is identifiable — critical for tuning the line split).
- Optionally, each logged line's `parseWeight` result (`kg`, `stable`) side-by-side so the user sees whether the default pattern already matches.
- **Copy** button: copy `rawLog` to the clipboard. Use `expo-clipboard` **only if already available**; do **not** add a new dependency just for copy — if unavailable, fall back to a selectable `AppText` block. Also a **Clear** button (`clearLog()`).

This panel is the tuning tool: once the user pastes a captured frame, the implementer adds the confirmed regex as the first entry in the parser's pattern table and enables the skipped test.

## 6. Feature flag — 3-layer gating (default OFF)

### (a) Migration — `supabase/migrations/20261007000001_feature_flag_bluetooth_scale.sql`

Strictly greater than the latest (`20261006000001_create_payment_photo_evidence.sql`). Follows the exact template of `20261004000001_feature_flag_report_export.sql` / `20261005000003_feature_flag_dispatch_guides.sql`:

```sql
-- ============================================================
-- FEATURE FLAG: bluetooth_scale
-- ============================================================
-- Gating de "Lectura de balanza Bluetooth": captura automática del peso (kg)
-- desde una balanza Bluetooth ya emparejada con el equipo, para autocompletar
-- los kilos en el registro de cosecha. Solo Android (la balanza usa Bluetooth
-- Classic/SPP, no soportado por iOS sin MFi). Siempre con captura manual como
-- respaldo. Default global apagado (enabled=false); cada organización lo activa
-- vía override en organization_feature_flags. strategy='org_override'.
-- Idempotente por la UNIQUE uq_platform_feature_flags_key.
--
-- Reversibilidad (documentada; sin `down` automático):
--   DELETE FROM platform_feature_flags WHERE key = 'bluetooth_scale';
-- ============================================================

INSERT INTO platform_feature_flags (key, name, description, category, strategy, enabled) VALUES
  ('bluetooth_scale', 'Lectura de balanza Bluetooth',
   'Captura automática del peso (kg) desde una balanza Bluetooth ya emparejada con el equipo Android, para autocompletar los kilos en el registro de cosecha. Disponible solo en Android; en iOS y como respaldo siempre queda la captura manual.',
   'cosecha', 'org_override', false)
ON CONFLICT (key) DO NOTHING;
```

Category `'cosecha'`, Spanish name `'Lectura de balanza Bluetooth'`, default `false`, `strategy='org_override'`. The platform feature-flags console picks it up automatically (no console change).

### (b) Shared constant — `packages/shared/src/constants/index.ts`

Add to `FEATURE_FLAGS`:

```ts
BLUETOOTH_SCALE: 'bluetooth_scale',
```

### (c) UI consumption

`useFeatureFlag('bluetooth_scale')` in `register.tsx` (§4). The hook already resolves global default + per-tenant override via RLS; **no change to `useFeatureFlag.ts`**.

### Validation

**No change to `packages/shared/src/validation/index.ts`.** The scale only auto-fills `manualKg`, which already exists in `boxTareFields` as `manual_kg` (positive, rounded to 3 decimals, mutually exclusive with `gross_weight_kg`). The submit payload shape is identical whether kilos were typed or read from the scale. Adding scale-specific validation would be dead weight. (Noted so the review knows this was considered and deliberately skipped.)

## Error handling (concrete, per failure)

| Operation | Failure condition | Recoverable? | Caller receives | Logged? |
|---|---|---|---|---|
| `loadNative()` | iOS / Expo Go / module not built | n/a (expected) | `supported=false`, actions no-op | no (expected state) |
| Permission request (`BLUETOOTH_CONNECT`) | user denies | yes (re-press) | `status='error'`, es: "Permiso de Bluetooth denegado" | console.warn only, no PII |
| `getBondedDevices()` | BT off / enumeration error | yes | `status='error'`, es: "Activa el Bluetooth y empareja la balanza" | console.warn |
| `connect()` by name | `L261241` not bonded | yes | `status='error'`, es: "Balanza no emparejada. Emparéjala en Ajustes (PIN 1234)" | console.warn |
| `connect()` | device off / out of range | yes | `status='error'`, es: "No se pudo conectar con la balanza" | console.warn |
| Data subscription | read error / disconnect mid-stream | yes | `status='error'`, `lastWeightKg` frozen, manual input still works | console.warn |
| `parseWeight` | unrecognized frame | yes (debug it) | `kg: null`, raw still logged | no throw |
| Auto-fill → submit | parsed kg ≤ 0 or NaN | yes | existing guard: `canSubmit=false`, submit error "Ingresa los kilos recolectados" | existing path |

All scale failures are **non-fatal to registration**: the manual input and the entire existing submit flow remain functional. No scale error blocks saving a manually-typed weight. Logs never include tokens/PII (only status strings); the stream is numeric weight data, not sensitive.

### External input validation (the BT stream)

The incoming SPP bytes are **untrusted external input**. Rules enforced at the hook/parser boundary:
- Decoded to string, length-capped per line (ignore/trim lines > ~128 chars to avoid a malformed-stream flood).
- `rawLog` is a bounded ring buffer (cap ~200) — a chatty scale can't exhaust memory.
- `parseWeight` never throws and never returns a non-finite number (NaN/Infinity → `kg: null`).
- The parsed kg is only ever written into `manualKg` as a string; the existing `parseFloat` + `> 0` + `round3` guards in the submit path are the authoritative validation before insert. The scale cannot inject a value that bypasses kg validation.

## Invariant ownership

- **"Picking quantity / weight is positive"** — unchanged, owned by the existing submit mutation guard (`parseFloat(manualKg) > 0`) + the `manual_kg` Zod schema. The scale only populates the input; it does not define the payable weight independently, and cannot bypass the `> 0` check.
- **"rate_amount_snapshot > 0"**, **settlement immutability**, **RBAC** — untouched; this feature does not reach the rates, settlements, payments, or auth layers. The submit mutation's rate resolution and attribution logic are unchanged.
- **Entity naming** — no new domain entities; `picking_records` / `blocks` / `products` references are unchanged. Only a feature-flag row is inserted.
- **"Auto-read only where manual kg applies"** — owned by `register.tsx` render gating (`scaleApplies = flag && android && kgManualApplies`).
- **"Android-only, never touch native on iOS"** — owned by the hook (`loadNative` platform guard) *and* the render gate (`Platform.OS` check): defense in depth.
- **"Off by default, per-tenant opt-in"** — owned by the DB (`platform_feature_flags.enabled=false` + `org_override`) and surfaced via `useFeatureFlag`.

## Testability

- **Unit (Vitest, runs in CI today):** `parse-weight.ts` — fully pure, highest-value tests (§2). `round3` if extracted. Run via the existing mobile `test` script; no device needed.
- **Integration / manual (device-only):** the hook's native interaction and the register button require a physical Android build + the actual scale; covered by a manual test checklist in the PR (pair → flag on → scan worker → press "Leer balanza" → weight auto-fills → submit; plus iOS and flag-off regression: screen unchanged, no button). The hook is deliberately thin around the untestable native boundary; all branchy logic (line splitting, stable debounce, status normalization) lives in the pure parser or in small pure helpers so it can be unit-tested without the device.
- Design note: keeping parsing/normalization **out** of the hook and in the pure module is what makes this feature testable at all — reinforcing the §2 isolation.

## Files touched (summary)

**New**
- `apps/mobile/src/lib/scale/parse-weight.ts` (+ `__tests__/parse-weight.test.ts`)
- `apps/mobile/src/lib/scale/round3.ts` (extracted shared helper) *(or reuse existing util if found)*
- `apps/mobile/src/hooks/useBluetoothScale.ts`
- `supabase/migrations/20261007000001_feature_flag_bluetooth_scale.sql`
- (optional) a `ScaleDebugPanel` component under `apps/mobile/src/components/` if the panel grows beyond inline JSX

**Modified**
- `apps/mobile/package.json` — add pinned `react-native-bluetooth-classic`
- `apps/mobile/app.json` — plugin + Android permissions (+ defensive iOS usage string)
- `apps/mobile/app/(tabs)/register.tsx` — flag read, `scaleApplies` gate, "Leer balanza" button + status + debug toggle in the `kgManualApplies` branch, use shared `round3`
- `packages/shared/src/constants/index.ts` — `BLUETOOTH_SCALE` key

**Explicitly NOT changed**
- `packages/shared/src/validation/index.ts` (manual_kg already covers it)
- `apps/mobile/src/hooks/useFeatureFlag.ts`
- `eas.json`
- submit mutation logic, box/tare path, offline queue

## Build / rollout note (for the user)

1. `npm install` (adds the native dep).
2. `npx expo prebuild -p android` then a new build: `eas build -p android --profile development` (or `--profile preview`), or `npm run build:android` for a local APK. **Expo Go and JS reload will NOT include the scale** — a fresh native build is mandatory.
3. Pair the scale `L261241` once in Android Bluetooth settings (PIN `1234`).
4. Enable the `bluetooth_scale` flag for the test organization (override on) and apply the migration (`npm run db:migrate` / push).
5. On the register screen, a kg product's "cantidad" step now shows "Leer balanza". Use the debug panel to capture the real frame and tune `parse-weight.ts` if the default pattern doesn't match.

## What I verified vs. assumed

- **Verified by reading code:** `register.tsx` kg-manual flow, `round3` location (local inside the mutation), `manualKg` state and `canSubmit`; `FEATURE_FLAGS` shape; `useFeatureFlag` resolution; the two flag-migration templates and the latest migration timestamp (`20261006000001`); `app.json` plugin/permission structure (camera-only today); `eas.json` profiles; `manual_kg`/`gross_weight_kg` Zod mutual exclusion; mobile already runs Vitest pure-logic tests (`src/lib/export/__tests__`); Expo SDK is 54 (not 51).
- **Assumed / to confirm on-device:** the exact `react-native-bluetooth-classic` version + its config-plugin option keys; the real LP7516C SPP frame (default parser is an explicit guess); whether `expo-clipboard` is available for the debug copy (fallback: selectable text, no new dep); that the physical scale is OS-paired before use.
- **Risk flagged:** the only non-trivial risk is the unknown protocol — mitigated by the isolated parser + on-device debug panel + skipped "real-format" test ready to enable. The native-build requirement is called out so a JS reload isn't mistaken for a broken feature.
