# Implementation Plan — Fix in-app font scaling (RN 0.81.5 / React 19.1)

## Problem (confirmed by reading source)

`apps/mobile/src/hooks/useFontScale.tsx` tries to install a global font-size patch by reassigning `Text.render` / `TextInput.render`. On RN 0.81.5 the exported `Text` is a **plain function component**, not a `forwardRef` object:

- `node_modules/react-native/Libraries/Text/Text.js` line 38 `const TextImpl: component(...)`, line 328 `TextImpl.displayName = 'Text'`, line 548 `export default TextImpl`. A plain function component has **no `.render` property**.
- So the guard `if (typeof origRender === 'function' && !origRender.__fontScalePatched)` never enters, and the fontSize-multiplying patch is never installed.
- The only thing the current code applies is `defaultProps.allowFontScaling = false`, and `defaultProps` on function components is deprecated/ignored under React 19.1.
- Independently corroborated: on RN 0.81.5 + Fabric there is no `render` method exposed on `Text` ([StackOverflow, Nov 2025](https://stackoverflow.com/questions/79831912/the-proper-way-to-assign-a-default-value-to-a-react-component-prop)). Content was rephrased for compliance with licensing restrictions.

Net effect: changing the scale updates persisted state and the chip highlight, but no text resizes.

## Chosen technique (and why it is reliable on exactly RN 0.81.5 / React 19.1)

**Option (a): a module-level global override that WRAPS the Text / TextInput component, installed once, reading the active factor from a mutable ref; the provider remounts the subtree via `key` on scale change.**

The override is installed by overwriting the `default` export of the two internal RN modules that back the public `Text` / `TextInput`:

- `react-native/index.js` exports `Text` and `TextInput` as **getters** (lines 112–119): `get Text() { return require('./Libraries/Text/Text').default; }` and `get TextInput() { return require('./Libraries/Components/TextInput/TextInput').default; }`.
- Under Metro+Babel, `import { Text } from 'react-native'` compiles to a live read of that getter at render time, so every one of the 31 screens/components that import `Text` reads whatever `require('./Libraries/Text/Text').default` currently is — no screen edits needed.
- Those internal modules are Babel-CommonJS modules whose `.default` is a **writable data property** (Babel does not freeze module exports). Reassigning `require('react-native/Libraries/Text/Text').default = ScaledText` makes the getter return our wrapper for every subsequent `Text` usage, app-wide.
- The wrapper is an ordinary function component that renders the ORIGINAL `TextImpl` with a merged style whose `fontSize` is multiplied by `factorRef.current` (default 14 when unset), and forwards `ref` and all props. It also sets `allowFontScaling={false}` (prop, not defaultProps) so the in-app factor is independent of the OS font setting and never double-scales.

Why this is reliable on 0.81.5 / 19.1 specifically:
- It does NOT touch a `.render` property (which does not exist on the plain-function `TextImpl`).
- It does NOT rely on React 19 `defaultProps` (ignored for function components).
- It uses only documented React composition (render the original component with modified props) plus the stable CommonJS/Babel fact that a module's `.default` is writable; the getter indirection in `index.js` means the override is picked up by every existing named import with zero per-file changes.

Why NOT option (b) (a custom `Text` imported per file): blast radius is 31 files (`grep -rl "from 'react-native'" apps/mobile/{app,src} --include="*.tsx"` → 34 files, 31 use `Text`), every new file would silently regress, and it is far larger surface for the reviewer. Option (a) is the smallest reliable change.

Robustness guard (because we reach into internal module paths): the override wraps each target in try/catch and, if the internal path ever fails to resolve, falls back to also attempting `require('react-native').Text` assignment; failure to install must not crash the app (text just stays at factor 1). The internal paths used are the exact ones `index.js` itself requires, so they track the installed RN version.

## Public API — unchanged

`useFontScale.tsx` keeps exporting, with identical shapes, so no caller changes:
`FontScaleKey`, `FONT_SCALES` (`{normal:1, grande:1.15, extra:1.3}`), `FONT_SCALE_LABELS` (`{normal:'Normal', grande:'Grande', extra:'Extra grande'}`), `FontScaleProvider`, `useFontScale()` → `{ scale, factor, setScale, loaded }`. Persistence stays in AsyncStorage under `fundo360.font_scale.v1`. `profile.tsx` imports `useFontScale, FONT_SCALES, FONT_SCALE_LABELS, type FontScaleKey` from this module and must keep working untouched.

## Domain-invariant note

This is a UI-only mobile change. It does not touch picking quantities, rates, settlements, payments, RBAC, or any DB entity/naming, so no domain invariant (quantity > 0, rate > 0, settlement immutability when paid, RBAC) is affected.

---

# Implementation Plan

- [ ] 1. Rewrite the font-scaling engine in `useFontScale.tsx` to use a module-level WRAP override instead of the `.render` monkeypatch, preserving the public API exactly.
      Details:
      - Keep all existing exports and their shapes: `FontScaleKey`, `FONT_SCALES`, `FONT_SCALE_LABELS`, `FontScaleProvider`, `useFontScale`, and the `STORAGE_KEY = 'fundo360.font_scale.v1'`.
      - Keep the mutable `const factorRef = { current: 1 }` read by the wrapper (so no closure/remount coupling for reading the factor).
      - Replace `patchTextScaling()` with `installFontScaleOverride()` that runs ONCE (guarded by a module boolean). For each target path `react-native/Libraries/Text/Text` and `react-native/Libraries/Components/TextInput/TextInput`:
        - `const mod = require(path);` then capture `const Original = mod.default;` and skip if `Original.__fontScaleWrapped` is set (prevents double-wrapping / factor compounding under Fast Refresh).
        - Build a wrapper with `React.forwardRef((props, ref) => ...)` that computes the scaled style and renders `<Original {...props} ref={ref} allowFontScaling={false} style={scaledStyle} />`.
        - Scaled style: `const flat = StyleSheet.flatten(props?.style) || {}; const base = typeof flat.fontSize === 'number' ? flat.fontSize : 14; const scaled = Math.round(base * factorRef.current);` then `const scaledStyle = [props?.style, { fontSize: scaled }];` (array appends our fontSize last so it wins).
        - Tag and label the wrapper: `(Wrapped as any).__fontScaleWrapped = true; Wrapped.displayName = Original.displayName || 'Text';`
        - Assign back `mod.default = Wrapped;` inside try/catch; on throw, attempt `const rn = require('react-native'); rn.Text = Wrapped;` style fallback where writable, otherwise no-op (never crash the app — text just stays at factor 1).
      - `FontScaleProvider`: call `installFontScaleOverride()` in a `useEffect([])`, load the persisted key from AsyncStorage, set `factorRef.current` and `scale` state, then set `loaded`. Keep `setScale` writing `factorRef.current` BEFORE `setScaleState` and persisting to AsyncStorage. Keep the `<React.Fragment key={`fs-${scale}`}>` remount so already-mounted Text re-renders through the wrapper with the new factor.
      - Remove the old `patched` flag, `patchTextScaling`, and the `Component.defaultProps` mutation entirely.
      Files: `apps/mobile/src/hooks/useFontScale.tsx`
      Verify: `cd apps/mobile && npx tsc --noEmit` exits 0 (baseline is currently green), and `npm run lint` reports no new errors for `src/hooks/useFontScale.tsx`.

- [ ] 2. Confirm no caller needs changes and the clipping fixes in `profile.tsx` are untouched.
      Details: `profile.tsx` already imports `useFontScale, FONT_SCALES, FONT_SCALE_LABELS, type FontScaleKey` from `../../src/hooks/useFontScale`; the rewrite preserves these, so this file must NOT be edited. Do not remove or alter its `numberOfLines`/`adjustsFontSizeToFit` chip attributes. `_layout.tsx` already mounts `<FontScaleProvider>` at the root and needs no change.
      Files: none (verification-only step).
      Verify: `grep -n "useFontScale\|FONT_SCALE" apps/mobile/app/(tabs)/profile.tsx` shows the same imports/usages as before; `git diff --stat "apps/mobile/app/(tabs)/profile.tsx"` shows no new changes introduced by this task.

- [ ] 3. Static verification of the whole mobile app.
      Details: run the project's real checks to prove the rewrite compiles and lints across the app.
      Files: none.
      Verify:
      - `cd apps/mobile && npx tsc --noEmit` → exit 0.
      - `cd apps/mobile && npm run lint` → no new errors (note: `npm run test` finds no vitest suites in the mobile app, so it is not a meaningful gate here).

- [ ] 4. On-device runtime verification (phone connected via USB — the only check that proves the behavior).
      Details: this is a runtime RN behavior, so static checks are necessary but not sufficient. Run the app on the connected Android device and exercise the Profile screen.
      Files: none.
      Verify (local-env note: macOS has no `timeout`; do not wrap commands with it):
      - Start the dev client from `apps/mobile`: `npx expo start --dev-client` (device is on USB per the user), open the app on the phone.
      - Go to Perfil → "Tamaño del texto". Tap "Grande": all app text (names, info rows, stat labels/values, buttons, other tabs) grows ~15%. Tap "Extra grande": ~30%. Tap "Normal": returns to baseline. Change is immediate on selection.
      - The small accessibility chips themselves may not visibly grow because they use `adjustsFontSizeToFit` — this is acceptable per the task; the rest of the app text must grow.
      - Kill and relaunch the app: the last selected size persists (AsyncStorage `fundo360.font_scale.v1`).
      - Spanish copy is unchanged everywhere.

## Notes / assumptions

- The override must be idempotent and crash-safe: Fast Refresh during development can re-run the module, so the `__fontScaleWrapped` tag prevents double-wrapping (which would compound the factor).
- `allowFontScaling={false}` is passed as a prop by the wrapper (not via `defaultProps`) to keep the in-app factor independent of the OS setting, satisfying "do not double-scale with the system".
- No Spanish copy is changed; no `profile.tsx` layout fix is reverted.
