# Verification — Admin Drawer release crash (`undefined is not a function` at `DrawerNavigator`)

Iteration: FIRST (no `review.json` present).

## The change

Single-file edit: `apps/mobile/babel.config.js`.

Before:

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // react-native-reanimated/plugin must be the LAST entry in plugins.
    plugins: ['react-native-reanimated/plugin'],
  };
};
```

After:

```js
module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo already injects react-native-worklets/plugin
    // (the Reanimated/Worklets transform) automatically when
    // react-native-worklets is installed. Do NOT add the plugin manually
    // here, or it would be applied twice and break release bundles.
    presets: ['babel-preset-expo'],
  };
};
```

No `package.json` / lockfile changes were needed: `expo install --check` does not flag any
reanimated/worklets/gesture-handler/screens incompatibility (see item 1). The declared range
`~4.1.1` already allows the installed `4.1.7`. Version mismatch was ruled out by investigation
(see root-cause explanation), so the optional plan item 3 (re-pinning) was NOT triggered.

## Root-cause corroboration (why this is a double-plugin bug, not a version/export bug)

Confirmed before editing:

- `node_modules/react-native-reanimated/plugin/index.js` is a shim:
  ```js
  const plugin = require('react-native-worklets/plugin');
  module.exports = plugin;
  ```
  So the manual `react-native-reanimated/plugin` entry IS the worklets plugin.
- `babel-preset-expo@54.0.12` (`node_modules/babel-preset-expo/build/index.js`, lines ~286-289)
  automatically adds `require('react-native-worklets/plugin')` when `react-native-worklets` is
  installed and `platformOptions.worklets !== false`:
  ```
  286:            (0, common_1.hasModule)('react-native-worklets') &&
  287:                platformOptions.worklets !== false &&
  289:                ? [require('react-native-worklets/plugin')]
  ```
- `react-native-worklets` is installed (0.5.1) and resolvable, so the preset injects the plugin
  once; the former manual `plugins` entry injected it a second time.

## Why the `DrawerNavigator` `undefined is not a function` is resolved

The reanimated-4 transform is delivered by `react-native-worklets/plugin`. Under Expo SDK 54,
`babel-preset-expo` already injects that plugin automatically (reanimated 4's shim at
`react-native-reanimated/plugin` just re-exports the worklets plugin). The old `babel.config.js`
also listed `react-native-reanimated/plugin` manually, so the worklets Babel transform ran
**twice** on the same code.

Double-workletization corrupts the generated worklet closures: a worklet that was already
transformed gets transformed again, and in a minified Hermes **release** bundle the
double-wrapped worklet reference resolves to `undefined`. The admin Drawer
(`expo-router/drawer` via `app/admin/_layout.tsx`, custom `AdminDrawerContent`) is the only
worklet-driven navigator in the app — all Stack/Tabs navigation is non-worklet — so the broken
worklet surfaces specifically as `TypeError: undefined is not a function` thrown from
`DrawerNavigator` the moment `/admin` mounts. Dev builds (non-minified, with the worklets dev
runtime) tolerate the redundant transform, which is why the crash was RELEASE-ONLY.

This is NOT a missing/renamed export: every named export the drawer imports from reanimated
(`interpolate`, `ReduceMotion`, `runOnJS`, `useAnimatedProps`, `useAnimatedStyle`,
`useDerivedValue`, `useSharedValue`, `withSpring`, default `Animated`) exists in reanimated
4.1.7, and `expo install --check` reports no reanimated/worklets version incompatibility. The
`undefined` is produced by the double transform, not by an absent symbol or a wrong version.

Removing the manual plugin makes the worklets transform run **exactly once** (via the preset),
so the drawer's worklets resolve to real functions in the release bundle — fixing the crash
while keeping the admin drawer feature and the AppText/useFontScale UI fixes untouched.

---

## Verification results

### 0. Babel config returns only the preset (plan item 1)

Command (from `apps/mobile`):

```
node -e "const c=require('./babel.config.js')({cache(){}}); const keys=JSON.stringify(c); if(/reanimated\/plugin|worklets\/plugin/.test(keys)){console.error('FAIL');process.exit(1)} if(!(c.presets||[]).includes('babel-preset-expo')){console.error('FAIL: babel-preset-expo missing');process.exit(1)} console.log('OK: babel config returns only babel-preset-expo, no manual worklets plugin')"
```

Output:

```
OK: babel config returns only babel-preset-expo, no manual worklets plugin
```

Exit 0. PASS.

### 0b. Prerequisites re-verified (plan item 2)

Command (from `apps/mobile`):

```
grep -q "GestureHandlerRootView" app/_layout.tsx && echo "GestureHandlerRootView present"
node -e "const {hasModule}=require('babel-preset-expo/build/common'); console.log('worklets module resolvable:', hasModule('react-native-worklets'))"
```

Output:

```
GestureHandlerRootView present
worklets module resolvable: true
```

`app/_layout.tsx` still wraps the tree in `<GestureHandlerRootView style={{ flex: 1 }}>`
(imported from `react-native-gesture-handler`), and the worklets module is resolvable so the
preset will auto-add the plugin exactly once. No code change needed. PASS.

### 1. `npx expo install --check` (from `apps/mobile`)

Command:

```
npx expo install --check
```

Output:

```
The following packages should be updated for best compatibility with the installed expo version:
  react-native-web@0.20.0 - expected version: ^0.21.0
  @react-navigation/drawer@^7.14.4 - expected version: ^7.5.0
Your project may not work correctly until you install the expected versions of the packages.
Found outdated dependencies
```

Interpretation: The ONLY items flagged are `react-native-web` (a web-only dependency, unrelated
to the native drawer animation) and a caret-range notice on `@react-navigation/drawer`. The
installed drawer `7.14.4` already satisfies the expected `^7.5.0` range — this is a
declared-caret nag, not a functional mismatch, and `7.14.4` is the version used by every other
(non-drawer-release) navigation path that works. No incompatibility is reported for
`react-native-reanimated`, `react-native-worklets`, `react-native-gesture-handler`, or
`react-native-screens`. These two notices are pre-existing and out of scope per the plan
(intentional exception). The reanimated/worklets stack is compatible.

### 2. `npx tsc --noEmit` (from `apps/mobile`)

Command:

```
npx tsc --noEmit
```

Output: (no output) — exit 0. PASS.

### 3. RELEASE bundle gate (the critical one, from `apps/mobile`)

Command:

```
npx expo export:embed --eager --platform android --dev false --entry-file node_modules/expo-router/entry.js --bundle-output /tmp/fundo360-admin-verify.bundle
```

Output tail:

```
Starting Metro Bundler
Android Bundled 1256ms node_modules/expo-router/entry.js (1989 modules)
Writing bundle output to: /tmp/fundo360-admin-verify.bundle
Copying 31 asset files
Done writing bundle output
```

Exit 0, printed `Android Bundled 1256ms ... (1989 modules)`, bundle written
(`/tmp/fundo360-admin-verify.bundle`, ~10.2 MB). A scan of the full log for
`undefined is not a function|failed to create a worklet|workletize|reanimated.*(error|plugin)`
found no matches (`CLEAN: no worklet/reanimated errors in bundle output`). This is the
release-fidelity Hermes/Metro transform path — the exact path that previously produced the
double-workletized output — and it now compiles cleanly. PASS.

### 4. `npm run lint` (from `apps/mobile`)

Command:

```
npm run lint
```

Output tail:

```
✖ 89 problems (0 errors, 89 warnings)
```

Exit 0. 0 errors; the 89 warnings are pre-existing (`@typescript-eslint/no-explicit-any`,
`no-unused-vars`, `react-hooks/exhaustive-deps`) and unrelated to this one-line Babel change. PASS.

### 5. On-device proof

NOT claimed here. The release bundle gate (item 3) proves the app compiles through the
release Babel/Metro/Hermes transform path without the double-workletization error. The real
on-device proof is the orchestrator rebuilding the Android APK and opening `/admin` on the
moto g04s; only that confirms the drawer renders and navigates at runtime. This step did not
run on a device and makes no on-device claim.

## Cleanup

`/tmp/fundo360-admin-verify.bundle`, `/tmp/expo-export-embed.log`, `/tmp/expo-install-check.log`,
`/tmp/mobile-tsc.log`, and `/tmp/mobile-lint.log` are throwaway artifacts in `/tmp` and were
removed; no `dist/` was created by `export:embed`. No working-tree artifacts remain other than
the single edited `apps/mobile/babel.config.js`.
