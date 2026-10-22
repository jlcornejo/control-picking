# Implementation Plan — In-app font scaling (release-safe) + text clipping fixes

Mobile app: `apps/mobile` (Expo SDK 54, RN 0.81.5, React 19.1, expo-router 6, Metro).
All paths below are relative to `/Users/ericksegura/Documents/backupHDD/personal/control-picking/apps/mobile` unless absolute.

UI-only change: no domain invariants touched (no picking quantities, rates, settlements, RBAC, or entity naming).

## Context the coder MUST internalize

### Why the old font-scaling mechanism failed on the RELEASE APK
The previous approach overwrote the `.default` export of RN's internal modules
(`react-native/Libraries/Text/Text` and `.../TextInput/TextInput`) at runtime and
relied on `react-native/index.js` re-reading those `.default` values through getters.
In DEV that works because Metro keeps module boundaries. In a RELEASE build Metro
**inlines requires and minifies**: `import { Text } from 'react-native'` is resolved to
the *original* component reference at bundle time, so the runtime `.default` swap never
reaches the already-bound reference. Confirmed broken on device.

The robust fix is plain React composition: an app-owned `AppText` component that reads
the active scale factor from the FontScale React context (`useFontScale()`) and applies
a scaled `fontSize` through normal props. No bundler-internals tricks, no monkeypatching,
no mutating module exports. Because it consumes context, it re-renders when the scale
changes — so the `<Fragment key>` remount trick is removed.

### Build/verify commands (discovered; use these exactly)
- Type check: `npx tsc --noEmit` (run from `apps/mobile`; there is no `typecheck` npm script). Expect exit 0.
- Release bundle gate (MOST IMPORTANT — this is what the release build runs):
  `npx expo export:embed --eager --platform android --dev false --entry-file "$(node -e "console.log(require.resolve('expo-router/entry.js'))")" --bundle-output /tmp/fundo360-verify.bundle`
  Expect exit 0 and an `Android Bundled` line. NOTE: `expo-router` is hoisted to the repo-root
  `node_modules` (monorepo), so a literal relative `node_modules/expo-router/entry.js` does NOT
  exist under `apps/mobile`. Resolve it via `require.resolve` as shown (confirmed:
  resolves to `/Users/ericksegura/Documents/backupHDD/personal/control-picking/node_modules/expo-router/entry.js`).
- Lint: `npm run lint` (runs `eslint app/ src/`). Expect 0 errors; pre-existing `any` warnings are OK.

### Theme tokens (the ONLY styling source allowed — from `src/constants/theme.ts`)
- `colors` (mutable brand object): primary/primaryDark/primaryLight/primaryBg/primaryMuted,
  background, card, cardBorder, surface, text, textSecondary, textMuted, textWhite,
  blue/blueBg, violet/violetBg, amber/amberBg, red/redBg, orange, white, shadow, shadowMd.
- `spacing`: xs 4, sm 8, md 12, lg 16, xl 20, xxl 24, xxxl 32.
- `radius`: sm 8, md 12, lg 16, xl 20, xxl 24, full 999.
- `font`: regular '400', medium '500', semibold '600', bold '700', extrabold '800'.
Do NOT invent new tokens, new colors, or new numeric scales for clipping fixes beyond
layout primitives (flex, flexShrink, minWidth:0, numberOfLines, adjustsFontSizeToFit,
textAlign, gap, includeFontPadding). Do NOT shorten any Spanish copy.

### Provider wiring (read `app/_layout.tsx`)
`FontScaleProvider` wraps `ThemeProvider` which wraps the app `children` inside `AuthGate`.
But `AnimatedSplash` (sibling of `FontScaleProvider`) and `OfflineBanner` (above `AuthGate`)
render OUTSIDE the provider. `useFontScale()` must therefore return a safe default
(factor 1) when no provider is mounted — the existing `createContext` default already does
this (`factor: 1`). AppText used in those two components is safe (renders at factor 1).

## Files that import `Text`/`TextInput` from 'react-native' (CONFIRMED EXHAUSTIVE — 34 files)
Re-grepped with `grep -rlE "from 'react-native'"` + per-file specifier check. `useFontScale.tsx`
matches only in comments/StyleSheet import — it does NOT import Text and is handled separately.

Text + TextInput (13): `app/(tabs)/crew.tsx`, `app/(tabs)/payments.tsx`, `app/(tabs)/production.tsx`,
`app/(tabs)/register.tsx`, `app/admin/fields/index.tsx`, `app/admin/products.tsx`,
`app/admin/records.tsx`, `app/admin/settlements.tsx`, `app/admin/workers.tsx`,
`app/change-password.tsx`, `app/login.tsx`, `src/components/DayRosterManager.tsx`,
`src/components/form/FormControls.tsx`.

Text only (21): `app/(tabs)/metrics.tsx`, `app/(tabs)/profile.tsx`, `app/(tabs)/team.tsx`,
`app/admin/box-types.tsx`, `app/admin/crews.tsx`, `app/admin/fields/[id].tsx`,
`app/admin/index.tsx`, `app/admin/permission-profiles.tsx`, `app/admin/settings.tsx`,
`app/admin/supervisors.tsx`, `src/components/AnimatedNumber.tsx`, `src/components/AnimatedSplash.tsx`,
`src/components/DatePicker.tsx`, `src/components/EmptyState.tsx`, `src/components/FloatingTabBar.tsx`,
`src/components/OfflineBanner.tsx`, `src/components/PaymentToast.tsx`, `src/components/PhotoCapture.tsx`,
`src/components/QRScanner.tsx`, `src/components/SuccessOverlay.tsx`, `src/components/admin/AdminDrawerContent.tsx`.

(The brief's ~22 list MISSED these 13: `admin/box-types`, `admin/crews`, `admin/fields/[id]`,
`admin/fields/index`, `admin/permission-profiles`, `admin/products`, `admin/records`, `admin/settings`,
`admin/settlements`, `admin/supervisors`, `admin/workers`, `DayRosterManager`, `AdminDrawerContent`.)

`src/components/AnimatedCard.tsx` and `src/components/Skeleton.tsx` import only View/Animated — NOT changed.

---

## Ordered items

- [ ] 1. Create `src/components/AppText.tsx` exporting `AppText` and `AppTextInput`.
      `AppText` = forwardRef wrapper over RN `Text`; `AppTextInput` = forwardRef wrapper over RN `TextInput`.
      Each reads `const { factor } = useFontScale()`. Flatten incoming `style` with `StyleSheet.flatten`
      (handles array/undefined/object styles). Compute the scaled size ONLY from an explicit numeric
      `fontSize` in the component's OWN flattened style: `scaledStyle = fontSize != null ? [style, { fontSize: Math.round(fontSize * factor) }] : style`.
      Pass `allowFontScaling={false}` to the underlying RN component (OS setting must not double-scale).
      Re-export the RN types so existing `TextStyle`/`TextInputProps` usages keep compiling.
      Document the nested-Text rule in a comment (see item 2).
      Files: `src/components/AppText.tsx`
      Verify: `npx tsc --noEmit` exits 0.

- [ ] 2. DOCUMENTED nested-Text behavior (design note, implemented in item 1):
      RN only honors `fontSize` from the outermost styled `Text`; a nested `<Text>` with no own
      `fontSize` inherits the parent's (already-scaled) size. AppText therefore scales ONLY a
      `fontSize` present in its own style and applies NOTHING when none is present, so:
      (a) a nested child with no fontSize inherits the parent's scaled size — scaled exactly once;
      (b) a nested child WITH its own fontSize is scaled once itself. No double application either way.
      Known nested cases to leave working: `FormControls.Field` (`<AppText><AppText> *</AppText></AppText>`),
      `profile.tsx` role pill / info rows. No separate code; this is the rule item 1 implements.
      Files: (covered by item 1)
      Verify: covered by item 1 type check; visual confirmation deferred to on-device step.

- [ ] 3. Rewrite `src/hooks/useFontScale.tsx` to the context-only mechanism.
      KEEP the public API byte-for-byte: `FontScaleKey`, `FONT_SCALES` ({normal:1,grande:1.15,extra:1.3}),
      `FONT_SCALE_LABELS` ({normal:'Normal',grande:'Grande',extra:'Extra grande'}), `FontScaleProvider`,
      `useFontScale()` -> `{ scale, factor, setScale, loaded }`, AsyncStorage key `fundo360.font_scale.v1`.
      REMOVE all of: `makeScaledComponent`, `wrapModuleDefault`, `installFontScaleOverride`, `installed`,
      `factorRef`, the `require('react-native/Libraries/...')` calls, the `StyleSheet` import, and the
      `<React.Fragment key={...}>` remount. Provider just holds `scale` state, loads/persists it, and
      exposes `factor = FONT_SCALES[scale]` through context. `profile.tsx` consumption of
      `FONT_SCALES`/`FONT_SCALE_LABELS`/`useFontScale` must keep working unchanged.
      Files: `src/hooks/useFontScale.tsx`
      Verify: `npx tsc --noEmit` exits 0; `npm run lint` 0 errors (the `no-require-imports` eslint-disable
      lines are removed with the requires).

- [ ] 4. Migrate `src/components/form/FormControls.tsx` to AppText/AppTextInput + clipping fixes.
      Replace `Text`->`AppText`, `TextInput`->`AppTextInput` in imports and JSX (keep `TextInputProps` type
      import from 'react-native'). Apply layout fixes so labels/values/chips/rows shrink or wrap instead of
      clipping at factor 1.3: `RowItem` title/subtitle container already has `flex:1`; add `flexShrink:1`/`minWidth:0`
      to the text wrapper and `numberOfLines`+`adjustsFontSizeToFit` ONLY on `rowBadge`/`chip` chips (tiny fixed
      chips may shrink to fit — acceptable trade-off, documented), while `rowTitle`/`rowSubtitle`/`label`/`submitText`
      MUST grow with scale (no adjustsFontSizeToFit on them). Use only theme tokens.
      This component is reused by most admin screens, so fixing it centrally resolves many rows at once.
      Files: `src/components/form/FormControls.tsx`
      Verify: `npx tsc --noEmit` exits 0.

- [ ] 5. Migrate the remaining 12 "Text + TextInput" files to AppText/AppTextInput and apply per-screen
      clipping fixes (label+value rows, chips/segmented controls, buttons with icons, list rows, card
      headers, stat tiles). Keep `TextInputProps`/`TextStyle` type imports from 'react-native'. Keep
      placeholder/value behavior; set no OS font scaling reliance.
      Files: `app/(tabs)/crew.tsx`, `app/(tabs)/payments.tsx`, `app/(tabs)/production.tsx`,
      `app/(tabs)/register.tsx`, `app/admin/fields/index.tsx`, `app/admin/products.tsx`,
      `app/admin/records.tsx`, `app/admin/settlements.tsx`, `app/admin/workers.tsx`,
      `app/change-password.tsx`, `app/login.tsx`, `src/components/DayRosterManager.tsx`
      Verify: `npx tsc --noEmit` exits 0 after this batch.

- [ ] 6. Migrate the 21 "Text only" files to AppText and apply per-screen clipping fixes.
      `profile.tsx` already has clipping fixes — KEEP them, only swap `Text`->`AppText`.
      `AnimatedNumber.tsx`: swap to AppText; ticker scales via its own fontSize (numeric), fine.
      `AnimatedSplash.tsx`/`OfflineBanner.tsx`: render outside provider — AppText falls back to factor 1 (safe).
      `FloatingTabBar.tsx`: tiny fixed 9px tab labels — may keep fixed or add numberOfLines; do NOT let them
      wrap to two lines (would break the bar height). Document choice.
      Files: `app/(tabs)/metrics.tsx`, `app/(tabs)/profile.tsx`, `app/(tabs)/team.tsx`,
      `app/admin/box-types.tsx`, `app/admin/crews.tsx`, `app/admin/fields/[id].tsx`, `app/admin/index.tsx`,
      `app/admin/permission-profiles.tsx`, `app/admin/settings.tsx`, `app/admin/supervisors.tsx`,
      `src/components/AnimatedNumber.tsx`, `src/components/AnimatedSplash.tsx`, `src/components/DatePicker.tsx`,
      `src/components/EmptyState.tsx`, `src/components/FloatingTabBar.tsx`, `src/components/OfflineBanner.tsx`,
      `src/components/PaymentToast.tsx`, `src/components/PhotoCapture.tsx`, `src/components/QRScanner.tsx`,
      `src/components/SuccessOverlay.tsx`, `src/components/admin/AdminDrawerContent.tsx`
      Verify: `npx tsc --noEmit` exits 0 after this batch.

- [ ] 7. Full gate run.
      Files: (none)
      Verify, in order, all from `apps/mobile`:
      1) `grep -rnE "from 'react-native'" app src --include="*.tsx" | grep -E "\bText\b|\bTextInput\b"` returns
         ONLY type imports (`TextInputProps`, `TextStyle`) — no component `Text`/`TextInput` left imported from RN
         outside `src/components/AppText.tsx`.
      2) `npx tsc --noEmit` exits 0.
      3) `npx expo export:embed --eager --platform android --dev false --entry-file "$(node -e "console.log(require.resolve('expo-router/entry.js'))")" --bundle-output /tmp/fundo360-verify.bundle`
         exits 0 and prints `Android Bundled`. This is the gate that caught the previous dynamic-require failure.
      4) `npm run lint` — 0 errors.
      5) Confirm no Spanish copy was shortened (diff review) and only existing theme tokens used.

## Why font scaling now works in a RELEASE/minified bundle (coder must be able to explain this)
AppText is a real React component imported by each screen through a normal static import.
Metro bundles that import like any app module, and AppText calls `useFontScale()` on every
render — reading the live context value, not a reference captured at bundle time. There is
no dynamic require, no `.default` mutation, nothing for minification/inlining to defeat.
Changing the scale updates context, React re-renders every AppText, and each recomputes its
`fontSize`. This is the same mechanism in dev and release, so there is no dev/release gap.

## Edge-case checklist the coder must honor
- Nested `<Text>`: handled by the "scale only own fontSize" rule (items 1–2). Do not double-apply.
- Icon-font `<Text>` / `AnimatedNumber` ticker: scales via its own numeric fontSize; acceptable.
- `TextInput` placeholder/value: AppTextInput sets `allowFontScaling={false}`; placeholderTextColor etc. unchanged.
- Styles passed as array / no fontSize: `StyleSheet.flatten` handles arrays; no fontSize => no scaling applied
  (inherits or uses RN default 14 base — do NOT force a default fontSize that overrides inherited sizes).
- `allowFontScaling:false` + clipping: verify at factors 1.0/1.15/1.3 that body text/labels/values/rows GROW
  and shrink/wrap rather than hard-clip; only tiny fixed chips use adjustsFontSizeToFit.

## On-device verification
Visual confirmation at factors 1.0/1.15/1.3 requires a rebuilt APK, done by the orchestrator AFTER approval.
This plan/loop MUST NOT claim on-device verification. Where a screen's clipping could not be verified from code,
the coder treats it as "needs verification during implementation" and checks layout reasoning at all three factors.
