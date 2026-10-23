# Babel double-plugin removal fixes the release-only Admin Drawer `undefined is not a function`

The fix is a single-file change to `apps/mobile/babel.config.js`: it deletes the manual `plugins: ['react-native-reanimated/plugin']` entry, leaving only `presets: ['babel-preset-expo']`. The root cause was not a version or export problem — it was the Reanimated/Worklets Babel transform being applied twice (once auto-injected by `babel-preset-expo@54`, once by the manual entry, which resolves to the same worklets plugin via a shim). Double-workletization produced a worklet reference that resolves to `undefined` only in a minified Hermes release bundle, surfacing as the `DrawerNavigator` crash when `/admin` mounts. Removing the redundant entry makes the transform run exactly once. No `package.json` or lockfile changes were made, and the installed reanimated stack already matches the SDK 54 pins.

**Watch for:** The delegation prompt frames this as a "dependency/version fix" that aligns reanimated/worklets/gesture-handler/screens/drawer versions. The actual fix contains **zero version changes** (confirmed, `git status` shows only `babel.config.js` modified). This is not a defect in the fix — the root-cause investigation explicitly ruled out a version mismatch and the installed versions are already SDK-54-compatible — but reviewers expecting a version bump should note the scope divergence. The prompt's substantive gates (SDK 54 compatibility, clean `expo install --check` for the reanimated stack, passing release bundle gate, coherent root cause) are all met.

**Verdict**: APPROVED

## High-level view

The version-compatibility question resolves cleanly even though no versions changed: reanimated 4.1.7, worklets 0.5.1, gesture-handler 2.28.0, screens 4.16.0, expo 54.0.37, RN 0.81.5 are all installed and mutually compatible, and `expo install --check` flags nothing in that stack (only an unrelated `react-native-web` bump and a cosmetic caret notice on `@react-navigation/drawer`, both pre-existing and out of scope).

The root-cause explanation is coherent and independently verifiable. The manual `react-native-reanimated/plugin` is a two-line shim that re-exports `react-native-worklets/plugin`; `babel-preset-expo@54.0.12` auto-injects that same worklets plugin whenever `react-native-worklets` is installed. Both conditions were true, so the transform ran twice. That double transform is a credible mechanism for a worklet resolving to `undefined` specifically in a minified release bundle while dev builds tolerate it — which matches the release-only symptom on the drawer, the one worklet-driven navigator.

The release bundle gate — the critical check — passed: `expo export:embed ... --dev false` exited 0, printed `Android Bundled ... (1989 modules)`, and a scan of the full log found no worklet/reanimated errors. This exercises the exact Hermes/Metro transform path that previously double-workletized. `tsc --noEmit` exited 0 and `npm run lint` reported 0 errors (89 pre-existing warnings). The admin drawer feature and the AppText/escala-clipping work are untouched by a build-config-only change.

<details>
<summary>Issues (1)</summary>

1. **Scope framing vs. actual fix (non-blocking)** — The delegation prompt describes a version-alignment fix, but the implemented fix changes no versions; it removes a duplicated Babel plugin. The evidence justifies this (version mismatch was ruled out and installed versions are already SDK-54-compatible), so it is not blocking, but the divergence between the prompt's framing and the delivered change is worth noting for anyone cross-checking against the task description.

</details>

<details>
<summary>Details</summary>

## Version compatibility (the prompt's question 1)

The prompt asks whether the version changes are mutually compatible with Expo SDK 54 / RN 0.81.5 and match what `expo install --check` considers compatible. There are no version changes to judge. What I verified instead is that the already-installed stack is compatible, which is the premise the fix relies on:

```
react-native-reanimated       4.1.7   (declared ~4.1.1)
react-native-worklets         0.5.1   (declared 0.5.1)
react-native-gesture-handler  2.28.0  (declared ~2.28.0)
react-native-screens          4.16.0  (declared ~4.16.0)
@react-navigation/drawer      7.14.4  (declared ^7.14.4)
babel-preset-expo             54.0.12
expo                          54.0.37
react-native                  0.81.5
```

These satisfy the SDK 54 pins and reanimated 4's own peer range for worklets. The verification records `expo install --check` flagging only `react-native-web` (web-only, unrelated to native drawer animation) and a caret-range notice on `@react-navigation/drawer` whose installed `7.14.4` already satisfies the expected `^7.5.0`. Nothing in the reanimated/worklets/gesture-handler/screens stack is flagged. Both notices are pre-existing and explicitly scoped out by the plan.

## Root-cause explanation holds (the prompt's question 2)

The prompt wants the explanation to credibly tie the specific change to the mechanism behind `undefined is not a function` in `DrawerNavigator`, and treats an incoherent root cause as blocking. The explanation is a double-transform mechanism, not a missing/renamed export, and both of its load-bearing claims check out against `node_modules`:

- `node_modules/react-native-reanimated/plugin/index.js` is a shim that re-exports the worklets plugin:
  ```js
  const plugin = require('react-native-worklets/plugin');
  module.exports = plugin;
  ```
- `babel-preset-expo/build/index.js` (line ~286-289) auto-injects the worklets plugin, gated on the package being installed:
  ```js
  (0, common_1.hasModule)('react-native-worklets') &&
      platformOptions.worklets !== false &&
      platformOptions.reanimated !== false
      ? [require('react-native-worklets/plugin')]
      : ...
  ```

Both conditions were satisfied (worklets 0.5.1 installed, no `worklets:false`/`reanimated:false` override), so the preset injected the plugin once and the manual `plugins` entry injected the same plugin again. A worklet already transformed and then transformed a second time can produce a reference that minifies to `undefined` in a Hermes release bundle while remaining tolerable in a non-minified dev build with the worklets dev runtime. That explains the release-only nature and why it localizes to the drawer — the only worklet-driven navigator, with Stack/Tabs being non-worklet. The explanation also correctly rules out the missing-export hypothesis: the drawer's reanimated imports all exist in 4.1.7, consistent with `expo install --check` reporting no version incompatibility. Coherent and verified.

## Release bundle gate and static checks (the prompt's question 3)

The verification shows all four required gates run and passing:

- **`expo install --check`** — ran; the reanimated stack is clean (only the out-of-scope web / drawer-caret notices).
- **`tsc --noEmit`** — ran; no output, exit 0.
- **Release bundle gate** (the critical one) — `npx expo export:embed --eager --platform android --dev false --entry-file node_modules/expo-router/entry.js --bundle-output /tmp/fundo360-admin-verify.bundle`. Exit 0, printed `Android Bundled 1256ms node_modules/expo-router/entry.js (1989 modules)`, bundle written (~10.2 MB), and a log scan for `undefined is not a function|failed to create a worklet|workletize|reanimated.*(error|plugin)` found no matches. This is the release-fidelity Hermes/Metro path — the exact path that previously double-workletized — so a clean export is strong pre-APK evidence the double transform is gone.
- **`npm run lint`** — exit 0, `0 errors, 89 warnings` (warnings pre-existing and unrelated to a one-line config change).

The verification is appropriately honest that this is not on-device proof; the on-device confirmation is the orchestrator rebuilding the APK and opening `/admin`. For the purposes of this gate, the release-fidelity bundle passing is the correct and sufficient pre-build signal.

## Feature and UI-fix preservation

A build-config-only change cannot remove the admin drawer feature or regress the AppText migration / escala-clipping fixes — no source, navigator, or component files are touched. `git status` confirms the only tracked modification is `apps/mobile/babel.config.js`. `GestureHandlerRootView` in `app/_layout.tsx` and single-application of the worklets plugin were re-verified by the coder as regression guards.

</details>

<details>
<summary>Files changed</summary>

- `apps/mobile/babel.config.js` — removed the manual `plugins: ['react-native-reanimated/plugin']` entry (double-applied the worklets transform); now returns only `presets: ['babel-preset-expo']` with an explanatory comment.

Full diff: `git -C /Users/ericksegura/Documents/backupHDD/personal/control-picking diff`.

</details>
