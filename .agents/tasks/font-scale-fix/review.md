# Module-level Text/TextInput wrap override for in-app font scaling

The change rewrites `useFontScale.tsx` so the in-app text-size preference (Normal / Grande / Extra grande) actually resizes app text on RN 0.81.5 / React 19.1. The previous engine reassigned `Text.render` / `TextInput.render` and mutated `defaultProps`, neither of which has any effect on this toolchain, so changing the size moved the chip highlight but resized nothing. The new engine installs a one-time override that replaces the `.default` export of RN's internal `Text` and `TextInput` modules with a `forwardRef` wrapper that multiplies the style `fontSize` by an active factor held in a module-level ref; the provider remounts the subtree via `key` on scale change so mounted text re-renders through the wrapper. The public API, the AsyncStorage key, and the Spanish copy are untouched, and the independent clipping fixes already in `profile.tsx` are preserved.

Watch for: the whole mechanism hinges on RN's `index.js` exposing `Text`/`TextInput` as re-requiring getters AND on the internal module's `.default` being a writable data property under the Expo/Babel transform — both verified below (confirmed). On-device behavior is explicitly NOT visually verified (confirmed, and honestly disclosed). Two unrelated changes (`.gitignore`, `docs/pruebas/vision-general.md`) ride along in the same working tree (confirmed, benign).

**Verdict**: APPROVED

## High-level view

The core technique is sound on this exact toolchain. RN's `index.js` defines `get Text()` / `get TextInput()` as live re-reads of `require('./Libraries/.../X').default`, so overwriting that `.default` once makes every existing `import { Text } from 'react-native'` resolve the wrapper with zero screen edits. I transformed the real `Text.js` and `TextInput.js` with `babel-preset-expo` and confirmed the default export compiles to a plain writable assignment (`_default = exports.default = TextImpl`), not a getter-only property — so the `mod.default = Wrapped` assignment succeeds at runtime rather than silently failing. The rationale in verification.md is accurate, not hand-waved.

The replacement correctly avoids both dead-end mechanisms: it never touches a `.render` property (the exported `TextImpl` is a plain function component with no such property on 0.81.5) and never relies on `defaultProps` (ignored for function components under React 19). It uses ordinary React composition plus the writable-CommonJS-default fact.

The public API is preserved exactly: `FontScaleKey`, `FONT_SCALES` `{normal:1,grande:1.15,extra:1.3}`, `FONT_SCALE_LABELS` `{normal:'Normal',grande:'Grande',extra:'Extra grande'}`, `FontScaleProvider`, and `useFontScale()` returning `{ scale, factor, setScale, loaded }`. The storage key `fundo360.font_scale.v1` is unchanged, and `allowFontScaling={false}` is passed as a prop so the in-app factor stays independent of the OS setting with no double-scaling.

Blast radius is minimal and correct: the only consumer of the hook is `profile.tsx` (plus the provider mount in `_layout.tsx`), and because the override works through RN's getter indirection, no screen needed to switch to a custom Text. The profile clipping fixes (`numberOfLines`/`adjustsFontSizeToFit` on chips, `flexShrink`/`minWidth`/`textAlign`) remain in place and no Spanish string was shortened.

Verification evidence is adequate: verification.md records the exact `tsc --noEmit` (exit 0) and `npm run lint` (0 errors, pre-existing warnings only) runs, and it does not falsely claim on-device verification — it states plainly that the connected device runs a release APK that cannot hot-reload, so visual confirmation is pending a dev build.

<details>
<summary>Issues (3)</summary>

1. **verification.md "only file I changed" overstates** — the note says the hook is the only file changed, but the same working tree also carries `.gitignore` and `docs/pruebas/vision-general.md` edits. Not caused by this task and harmless, but the claim should say "the only code file I changed for the feature logic." Non-blocking.
2. **Latent nested-Text inheritance override** — the wrapper injects an absolute `fontSize` (14×factor when none is set) on every Text, which would override RN's parent→child text size inheritance if nested `<Text>` were used. No nested `<Text><Text>` exists in the app today, so no current regression; worth a comment for future authors. Non-blocking.
3. **On-device behavior unverified** — correctness rests on code reasoning + typecheck + lint; the running device has a release APK that can't load the new bundle. Honestly disclosed, but the fix is not visually proven until run from a dev build or fresh APK. Non-blocking (static evidence is sufficient to approve; flagged so the loop/author runs it on device).

</details>

<details>
<summary>Details</summary>

### The getter indirection is real on this install

`node_modules/react-native/index.js` lines 112–120 define the public components as getters that re-require on every read:

```js
get Text() {
  return require('./Libraries/Text/Text').default;
},
get TextInput() {
  return require('./Libraries/Components/TextInput/TextInput').default;
},
```

Under Metro+Babel, `import { Text } from 'react-native'` compiles to a property read against this object, evaluated at render time. Once `installFontScaleOverride()` reassigns the internal module's `.default`, the getter returns the wrapper for every subsequent read — this is why none of the 30-odd screens needed editing. Confirmed against the installed files, not just the plan's description.

### The `.default` assignment actually succeeds (the lynchpin)

The approach is only valid if `require('react-native/Libraries/Text/Text').default = Wrapped` is a real write rather than a no-op against a getter-only accessor. I ran the installed `Text.js` and `TextInput.js` through `babel-preset-expo` (the preset this app uses, per `babel.config.js`) and inspected the emitted module shape. Both compile their default export as a writable data property:

```
exports.default = void 0;      // initial
_default = exports.default = TextImpl;    // Text.js
_default = exports.default = TextInput;   // TextInput.js
```

This is a plain assignment, not `Object.defineProperty(exports, "default", { get() {...} })`, so the reassignment in `installFontScaleOverride()` takes effect at runtime. This is the single most load-bearing claim in verification.md, and it holds on this exact toolchain (RN 0.81.5, React 19.1.0, babel-preset-expo). Had Babel been configured to emit getter-based live bindings for the default export, the override would have silently failed — it does not.

### Why the old mechanism was dead and the new one is not

`Text.js` line 38 declares `const TextImpl: component(...)` and line 548 `export default TextImpl` — a plain function component. It has no `.render` property, so the old guard `if (typeof origRender === 'function' && ...)` never entered and the scaling patch never installed. The only other old effect, mutating `Component.defaultProps`, is ignored for function components under React 19.1. The rewrite sidesteps both: it wraps via composition (`React.createElement(Original, {...props, ref, allowFontScaling:false, style:[props.style,{fontSize:scaled}]})`) and passes `allowFontScaling` as a prop. The rationale in verification.md matches what the code does.

### Install timing and the remount

`installFontScaleOverride()` runs in `FontScaleProvider`'s mount effect, i.e. after the first child render. At startup the factor is 1 (default `normal`, or the persisted value loaded in the same effect), so the brief pre-install window renders text at factor 1 either way — no visible flash. On a later `setScale`, `factorRef.current` is updated synchronously before `setScaleState`, and the `<React.Fragment key={`fs-${scale}`}>` forces a subtree remount so already-mounted text re-renders through the (by-then-installed) wrapper with the new factor. The ordering is correct for immediate application.

### Idempotency and crash-safety

A module-level `installed` boolean plus the `__fontScaleWrapped` tag on the wrapper prevent double-wrapping under Fast Refresh (double-wrapping would compound the factor). Each target is wrapped in try/catch; if an internal path ever fails to resolve on a future RN bump, the catch no-ops and text stays at factor 1 rather than crashing. Note the plan mentioned a `require('react-native').Text = Wrapped` fallback inside the catch that the final code does not implement — the catch simply no-ops. That is a reasonable simplification (the fallback would also hit a getter-only property and couldn't help), not a regression.

### Scaled-style construction

`StyleSheet.flatten(props?.style)` reads the effective `fontSize`, defaults to 14 when absent, multiplies by `factorRef.current`, rounds, and appends `{ fontSize: scaled }` as the last element of the style array so it wins over the original. Passing `allowFontScaling={false}` keeps the OS font setting from compounding on top of the in-app factor, satisfying the "no double-scaling" requirement. One latent caveat: because the wrapper always emits an absolute `fontSize`, a nested `<Text>` child that relied on inheriting its parent's size would instead get `14×factor`. The app currently has no nested `<Text><Text>` (grep found none), so there is no present regression; a short code comment would help future authors.

### Public API and blast radius

The exports and their shapes are byte-for-byte the contract required: `FontScaleKey`, `FONT_SCALES`/`FONT_SCALE_LABELS` with the specified values, `FontScaleProvider`, and `useFontScale()` → `{ scale, factor, setScale, loaded }`. The only consumers are `profile.tsx` (`useFontScale`, `FONT_SCALES`, `FONT_SCALE_LABELS`, `FontScaleKey`) and `_layout.tsx` (`FontScaleProvider` mount); both still typecheck against the preserved surface. No screen was switched to a custom Text, which is correct here — the getter override makes per-file edits unnecessary, so option (b)'s 30-file blast radius was rightly avoided.

### profile.tsx clipping fixes preserved

The profile diff is exclusively the clipping work: `numberOfLines={1}` on role/admin/title text, `numberOfLines={1} adjustsFontSizeToFit` on period/stat/a11y chips, plus layout hardening (`flexShrink`, `minWidth:0`, `textAlign`, `valueWrap`). None of it was reverted and none of the Spanish copy was shortened (`Administración`, `Trabajadores`, `Prom/día`, `Tamaño del texto`, `Normal`/`Grande`/`Extra grande` all intact). These are orthogonal to the hook rewrite and correctly left alone.

### Verification evidence

verification.md records `cd apps/mobile && npx tsc --noEmit` → exit 0, and `npm run lint` → 0 errors with 97 pre-existing warnings (8 `no-explicit-any` attributable to the file, matching the file's prior style and the app-wide pattern). It documents a transient new lint error during development (wrong `eslint-disable` rule) and its fix, which is the kind of honest detail that raises confidence. Per instructions I did not re-run the suites; the recorded commands and outputs are specific and plausible, and the one load-bearing runtime claim I independently reproduced via the Babel transform. The note explicitly does NOT claim on-device verification — it states the connected Motorola runs the release APK `com.fundo360.app` which cannot hot-reload, so visual confirmation requires a dev build or new APK. That is the correct, non-deceptive posture.

### Unrelated bundled changes

`.gitignore` adds `.env.remote` / `scripts/.env.remote`; `docs/pruebas/vision-general.md` adds a second test tenant and platform test users. Neither touches the feature. They're benign but are not mentioned in verification.md's "files changed" accounting, which claims the hook was "the only file I changed." The claim is true for the feature logic but understates the working-tree contents.

### Domain invariants

This is a UI-only change to mobile text rendering. It does not touch picking quantities, rates, settlements, payments, RBAC, or any DB entity/naming (fields, blocks, products, rates, workers, picking_records, settlements, payments). No domain invariant (quantity > 0, rate > 0, settlement immutability when paid, RBAC enforcement, correct entity naming) is in scope, and none is affected.

</details>

<details>
<summary>File map</summary>

- `apps/mobile/src/hooks/useFontScale.tsx` — engine rewritten: removed `.render` monkeypatch + `defaultProps` mutation; added `installFontScaleOverride()` that reassigns the `.default` of RN's internal Text/TextInput modules to a `forwardRef` wrapper reading `factorRef`. Public API unchanged.
- `apps/mobile/app/(tabs)/profile.tsx` — pre-existing clipping fixes (numberOfLines/adjustsFontSizeToFit + layout hardening); NOT part of the hook rewrite, preserved as-is.
- `apps/mobile/app/_layout.tsx` — unchanged; already mounts `<FontScaleProvider>`.
- `.gitignore` — unrelated: ignores `.env.remote` files.
- `docs/pruebas/vision-general.md` — unrelated: adds second test tenant + platform test users.

Full diff: `git diff` in the repo root.

</details>
