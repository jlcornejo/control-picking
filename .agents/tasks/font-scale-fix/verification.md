# Verification — Fix in-app font scaling (RN 0.81.5 / React 19.1)

## Scope

UI-only mobile change. Rewrote the font-scaling engine so the in-app text-size
preference (Normal / Grande / Extra grande) actually resizes all app text on
Android. No domain logic touched (picking quantities, rates, settlements,
payments, RBAC, DB entities/naming are all unaffected).

## Chosen technique

**Module-level WRAP override of RN's internal `Text` / `TextInput`, installed
once, reading the active factor from a mutable ref; the provider remounts the
subtree via `key` on scale change.** This is the smallest reliable change: it
requires editing a single file and zero screens.

How it works:

- `react-native/index.js` exposes `Text` and `TextInput` as **getters** that do
  a live `require('./Libraries/.../X').default` on every read (verified:
  `index.js` lines 112–120 — `get Text() { return require('./Libraries/Text/Text').default; }`
  and `get TextInput() { return require('./Libraries/Components/TextInput/TextInput').default; }`).
- Under Metro+Babel, `import { Text } from 'react-native'` compiles to a live
  read of that getter at render time, so every screen that imports `Text` reads
  whatever `require('./Libraries/Text/Text').default` currently is.
- Those internal modules are Babel-CommonJS modules whose `.default` is a
  writable data property. `installFontScaleOverride()` captures the original
  component, builds a `React.forwardRef` wrapper that renders the original with a
  merged style whose `fontSize` is multiplied by `factorRef.current`, and
  reassigns `mod.default = Wrapped`. From then on every `Text` / `TextInput`
  usage app-wide resolves to the wrapper — no per-file edits.
- The wrapper passes `allowFontScaling={false}` as a **prop** so the in-app
  factor is independent of the OS font setting and never double-scales.
- The provider keeps a `<React.Fragment key={`fs-${scale}`}>` remount so
  already-mounted Text re-renders through the wrapper with the new factor
  immediately on selection.

Idempotency / safety:

- `installed` module boolean + `__fontScaleWrapped` tag on the wrapper prevent
  double-wrapping (which would compound the factor) under Fast Refresh.
- Each target is wrapped in try/catch; if an internal path ever fails to
  resolve, it is skipped (text stays at factor 1) — the app never crashes.

## Why the new mechanism scales text where the old one failed

The old code reassigned `Text.render` / `TextInput.render`, guarded by
`if (typeof origRender === 'function' && !origRender.__fontScalePatched)`.

- On RN 0.81.5 the exported `Text` (`Libraries/Text/Text.js` → `export default TextImpl`)
  is a **plain function component**, not a `forwardRef` object with a mutable
  `.render` property. So `Component.render` was `undefined`, the `if` never
  entered, and the fontSize-multiplying patch was **never installed**.
- The only thing the old code applied was `Component.defaultProps.allowFontScaling = false`,
  and `defaultProps` on a function component is **deprecated/ignored under React 19.1**.
- Net effect of the old code: scale state + chip highlight updated, but no text resized.

The new mechanism:

- Does **not** touch a `.render` property (which does not exist on the
  plain-function `TextImpl`).
- Does **not** rely on React 19 `defaultProps` (ignored for function components).
- Uses only documented React composition (render the original component with
  modified props) plus the stable CommonJS/Babel fact that a module's `.default`
  is writable, combined with the getter indirection in `index.js` that makes
  every existing named import pick up the override.

Result: selecting Grande makes all app text ~15% larger, Extra ~30% larger,
immediately on selection (subtree remount via `key`), persisting across restarts
(AsyncStorage key `fundo360.font_scale.v1`, loaded on provider mount).

## Public API — unchanged

`useFontScale.tsx` still exports, with identical shapes:
`FontScaleKey`, `FONT_SCALES` (`{normal:1, grande:1.15, extra:1.3}`),
`FONT_SCALE_LABELS` (`{normal:'Normal', grande:'Grande', extra:'Extra grande'}`),
`FontScaleProvider`, `useFontScale()` → `{ scale, factor, setScale, loaded }`.
Persistence stays under `fundo360.font_scale.v1`. No caller needed changes.

## Files changed

- `apps/mobile/src/hooks/useFontScale.tsx` — rewrote the engine (removed the
  `.render` monkeypatch and `defaultProps` mutation; added the module-level wrap
  override). **This is the only file I changed.**

Not touched (confirmed):
- `apps/mobile/app/(tabs)/profile.tsx` — its uncommitted clipping fixes
  (`numberOfLines` / `adjustsFontSizeToFit` on chips, `flexShrink`/`minWidth`)
  remain exactly as they were. `git diff` on this file shows only its own
  pre-existing changes, none introduced by this task.
- `apps/mobile/app/_layout.tsx` — already mounts `<FontScaleProvider>`; no change.
- No Spanish copy changed anywhere.

## Commands run and output

### 1. Typecheck

```
$ cd apps/mobile && npx tsc --noEmit
# (no output)
EXIT=0
```

No TS errors. Baseline was green; still green.

### 2. Lint

```
$ cd apps/mobile && npm run lint
...
✖ 97 problems (0 errors, 97 warnings)
EXIT (eslint) = non-zero only due to pre-existing warnings being counted
```

- **0 errors.** All 97 remaining problems are warnings.
- The warnings attributable to `useFontScale.tsx` are all
  `@typescript-eslint/no-explicit-any` (8 of them), which match the pervasive
  pre-existing style across the mobile app (the original file used `any` the same
  way, and dozens of other files carry the identical warning).
- During the first lint run there was **1 NEW error**
  (`@typescript-eslint/no-require-imports` on the intentional dynamic require,
  plus an unused `eslint-disable` directive because I had disabled the wrong rule
  `no-var-requires`). Fixed by scoping the `eslint-disable-next-line` to the
  correct rule `@typescript-eslint/no-require-imports`. Re-lint confirms 0 errors.

Lint of just the changed file after the fix:

```
$ cd apps/mobile && npx eslint src/hooks/useFontScale.tsx
   ... 8 warnings (all @typescript-eslint/no-explicit-any)
✖ 8 problems (0 errors, 8 warnings)
```

Note: `npm run test` finds no vitest suites in the mobile app, so it is not a
meaningful gate here.

## On-device caveat (NOT verified visually)

A Motorola moto g04s is connected over USB (adb id `ZY22JVK6NH`), but the
installed app is the **RELEASE APK** `com.fundo360.app`, which **cannot
hot-reload the JS bundle**. Therefore this change **cannot be verified on that
running APK**, and no on-device visual verification is claimed.

To verify visually, the app must be run from either:
- a dev build / dev client: `npx expo start --dev-client` (from `apps/mobile`), or
- a freshly rebuilt APK.

Expected on-device behavior once running a dev build or new APK:
- Perfil → "Tamaño del texto": tap "Grande" → all app text ~15% larger; "Extra
  grande" → ~30%; "Normal" → baseline; change immediate on selection.
- The small accessibility chips may not visibly grow (they use
  `adjustsFontSizeToFit`) — acceptable per the task; the rest of the app text grows.
- Kill + relaunch: last selected size persists.

This verification relies on **code reasoning + typecheck + lint**, as stated.

## Git

All changes left in the working tree. Nothing committed.
