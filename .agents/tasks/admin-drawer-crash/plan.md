# Implementation Plan — Admin Drawer release crash (`undefined is not a function` at `DrawerNavigator`)

## Root cause (confirmed by investigation)

The Reanimated/Worklets Babel plugin is applied **twice** in release bundles, double-workletizing the drawer's animation code. In a minified Hermes release bundle the double-transformed worklet resolves to `undefined`, surfacing as `TypeError: undefined is not a function` thrown from `DrawerNavigator` (the admin Drawer is the only worklet-driven navigator in the app), and destabilizing the worklets runtime — hence the teardown `NoSuchFieldException: No field mIsFinished ... WorkletsMessageQueueThreadBase`. Dev builds tolerate the double transform; release does not.

Evidence:

- `apps/mobile/babel.config.js` uses `presets: ['babel-preset-expo']` AND manually adds `plugins: ['react-native-reanimated/plugin']`.
- `node_modules/react-native-reanimated/plugin/index.js` is a 2-line shim: `module.exports = require('react-native-worklets/plugin')`. So the manual plugin IS the worklets plugin.
- `babel-preset-expo@54.0.12` (`node_modules/babel-preset-expo/build/index.js` ~line 284-291) **automatically** adds `require('react-native-worklets/plugin')` whenever `react-native-worklets` is installed (it is, at 0.5.1) and `platformOptions.worklets !== false`. So the preset already injects the worklets plugin once; the manual `babel.config.js` entry injects it a second time.
- Official Expo guidance (expo/fyi `expo-54-reanimated.md`): with `babel-preset-expo` you must NOT also add the plugin manually unless you intentionally overrode plugin management.

### What was ruled out (do NOT chase)

- **Version mismatch**: NOT the cause. Installed reanimated 4.1.7, worklets 0.5.1, gesture-handler 2.28.0, screens 4.16.0 all satisfy Expo SDK 54 pins and reanimated's own peer range (`react-native-worklets: 0.5 - 0.8`). `npx expo install --check` flags only `react-native-web` and a caret-range nag on `@react-navigation/drawer` — neither is drawer-animation-related. Lockfile resolves a single copy of each native module (no monorepo duplicate-hoisting). So `npx expo install --fix` is NOT the fix and should be scoped narrowly (see item 3, optional).
- **Missing JS export**: NOT the cause. Every named export the drawer imports from reanimated (`interpolate, ReduceMotion, runOnJS, useAnimatedProps, useAnimatedStyle, useDerivedValue, useSharedValue, withSpring`, default `Animated`) exists in reanimated 4.1.7.
- **R8/ProGuard stripping**: NOT the cause. This is a managed/prebuild app (no committed `android/`); Expo's default release build does not enable R8 minification.
- **AppText/useFontScale refactor**: NOT the cause (per task brief; confirmed those files only swapped `Text`→`AppText`).
- Prerequisites `GestureHandlerRootView` (root `_layout.tsx`) and the reanimated plugin being LAST are already satisfied; item 2 only re-verifies them.

## The fix

Remove the redundant manual plugin so the worklets Babel plugin runs exactly once (via `babel-preset-expo`). This is a one-line config change; it does not decompose into separable features, so this is a single plan, not FEAT artifacts.

---

- [ ] 1. Remove the redundant manual Reanimated/Worklets Babel plugin from the mobile Babel config.
      In `apps/mobile/babel.config.js`, delete the `plugins: ['react-native-reanimated/plugin']` entry (and its guiding comment) so the file returns only `{ presets: ['babel-preset-expo'] }`. `babel-preset-expo@54` already injects `react-native-worklets/plugin` automatically because `react-native-worklets` is installed; keeping the manual entry applies it twice. Do NOT replace it with `react-native-worklets/plugin` — that reintroduces the double-application. Leave `react-native-worklets` in `package.json` (the preset needs it present to inject the plugin, and Reanimated 4 requires it at runtime).
      Files: `apps/mobile/babel.config.js`
      Verify: `cd apps/mobile && node -e "const c=require('./babel.config.js')({cache(){}}); const keys=JSON.stringify(c); if(/reanimated\/plugin|worklets\/plugin/.test(keys)){console.error('FAIL: a worklets/reanimated plugin is still listed manually in babel.config.js');process.exit(1)} if(!(c.presets||[]).includes('babel-preset-expo')){console.error('FAIL: babel-preset-expo missing');process.exit(1)} console.log('OK: babel config returns only babel-preset-expo, no manual worklets plugin')"` — prints the OK line, exit 0.

- [ ] 2. Re-verify the two reanimated prerequisites are still intact (regression guard, no edits expected).
      Confirm `apps/mobile/app/_layout.tsx` still wraps the tree in `<GestureHandlerRootView style={{ flex: 1 }}>` from `react-native-gesture-handler`, and that after item 1 the worklets plugin is still applied (now exactly once, by the preset). No code change unless a prerequisite is found missing.
      Files: `apps/mobile/app/_layout.tsx` (read-only check)
      Verify: `cd apps/mobile && grep -q "GestureHandlerRootView" app/_layout.tsx && echo "GHRV present"` prints `GestureHandlerRootView present`; AND `node -e "const {hasModule}=require('babel-preset-expo/build/common'); console.log('worklets module resolvable:', hasModule('react-native-worklets'))"` prints `true` (meaning the preset will auto-add the plugin, so no manual entry is needed).

- [ ] 3. (OPTIONAL, only if item 4 bundling fails on a reanimated/worklets symbol) Reconcile the Reanimated declared-vs-installed range without changing the installed version.
      The declared range `~4.1.1` already allows the installed `4.1.7` and matches SDK 54; do NOT run a blanket `npx expo install --fix` (it would also touch unrelated packages). If and only if item 4 reports a missing reanimated/worklets export, pin via `cd apps/mobile && npx expo install react-native-reanimated react-native-worklets` (installs the exact SDK-54-recommended versions) and re-run item 4. Record in the review notes why it was needed.
      Files: `apps/mobile/package.json`, `package-lock.json` (root)
      Verify: `cd apps/mobile && npx expo install --check` reports no reanimated/worklets/gesture-handler/screens incompatibility (the pre-existing `react-native-web` and drawer caret-range notices are acceptable and out of scope).

- [ ] 4. Produce a release-fidelity Android bundle to confirm the worklet transform is correct (this is the real verification; the orchestrator builds the APK afterward).
      Export a production (minified, Hermes-path) bundle — the same Babel/Metro transform path as the release APK — and confirm it completes with no "undefined is not a function", no worklet/"workletize", and no reanimated transform errors. This exercises the exact failure that only appears outside dev.
      Files: none (produces a throwaway `dist/` which must be cleaned up)
      Verify: `cd apps/mobile && rm -rf dist && npx expo export --platform android --output-dir dist 2>&1 | tee /tmp/expo-export.log; status=${PIPESTATUS[0]:-$?}; test "$status" = 0 || { echo "FAIL: expo export exited $status"; exit 1; }; grep -Eiq "undefined is not a function|failed to create a worklet|workletize|reanimated.*(error|plugin)" /tmp/expo-export.log && { echo "FAIL: worklet/reanimated error in bundle output"; exit 1; }; echo "OK: android bundle exported cleanly"` — prints `OK: android bundle exported cleanly`, exit 0. Then clean up: `rm -rf apps/mobile/dist`.

- [ ] 5. Static checks on the mobile app pass (no type/lint regressions from the config change).
      Files: none
      Verify: `cd apps/mobile && npx tsc --noEmit` exits 0, and `npm run lint` (eslint over `app/ src/`) exits 0.

## Notes for the implementer

- The crash is confirmed on-device and is real; the fix is the single-line removal in item 1. Items 2-5 are verification/guards.
- `npx expo export` is the closest release-fidelity check available without building the APK; if the double-plugin bug were still present it would fail or warn during worklet transform. A clean export is the strongest pre-build signal.
- Do not add `newArchEnabled` or touch `app.json` — New Architecture is already the SDK 54 default and Reanimated 4 requires it; it is not part of this bug.
- Keep the change minimal: one file edited (`babel.config.js`). Do not refactor unrelated code.
- Domain invariants (picking quantity > 0, rates > 0, settlement immutability when paid, RBAC, entity naming) are unaffected: this change touches only the mobile Babel build config, not domain logic, data, or RBAC.
