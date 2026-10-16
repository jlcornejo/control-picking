# Android text clipping fix in the Profile screen

The change reworks the layout of `apps/mobile/app/(tabs)/profile.tsx` so Spanish labels stop clipping and start centering correctly on Android, across the in-app font factors (1.0 / 1.15 / 1.3) driven by `useFontScale`. It is strictly layout-only: it adds `numberOfLines`, `adjustsFontSizeToFit`, flex/shrink constraints, `minWidth: 0`, text alignment, and small padding tweaks. No Spanish copy was shortened, no business logic or queries were touched, and `useFontScale.tsx` is only imported, not modified. Every value used comes from the existing `theme` tokens (`spacing.xs/md`, `radius.lg/full`).

Watch for: (possible) `adjustsFontSizeToFit` combined with `includeFontPadding` has known Android quirks, but here it is applied to single short words inside flex:1 chips, which is the recommended pattern — no concrete defect found. On-device verification was explicitly not performed (no emulator available); the author states this honestly rather than claiming a visual pass.

**Verdict**: APPROVED

## High-level view

The four target areas are each addressed with the right mechanism. Period chips and a11y chips are `flex:1` columns that now carry `minWidth: 0` + `justifyContent: 'center'` on the container and `textAlign: 'center'` + `numberOfLines={1} adjustsFontSizeToFit` on the text, so the longest label ('Extra grande') shrinks its glyphs to fit its third of the row instead of being clipped by the tight flex column. The InfoRow splits into a fixed-width label (`flexShrink: 0`) and a shrinkable value side (`valueWrap` with `flexShrink: 1` + `minWidth: 0`, value with `flexShrink: 1` + `textAlign: 'right'` + `numberOfLines={1}`), so a long value ellipsizes rather than clipping and the row gained a `gap` so label and value never collide. The admin button gives its text `flex: 1` and drops the chevron's now-redundant `marginLeft: 'auto'`, and the a11y header title gets `flexShrink: 1`; both carry `numberOfLines={1}`.

The copy is intact: 'Administración', 'Semana', 'Extra grande', 'Tamaño del texto', 'Teléfono', 'Desde', 'Estado' all read verbatim in the final file. The author also hardened two adjacent self-sizing areas (role pill, stat labels) using the same pattern — in scope since they share the clipping failure mode.

Verification evidence is present and credible: `verification.md` records `npx tsc --noEmit` → exit 0 and `npm run lint` → 0 errors / 92 pre-existing warnings, with the single profile.tsx lint warning identified as pre-existing (`icon as any`). The author is candid that device/emulator verification was not done and does not overclaim.

<details>
<summary>Issues (0)</summary>

No blocking or actionable findings.

</details>

<details>
<summary>Details</summary>

### Chip columns: shrink-to-fit inside flex:1

Both `s.periodChip` and `s.a11yChip` are `flex: 1`, so each takes one third of its row regardless of label width — the original clipping cause, since 'Extra grande' and 'Trabajadores' are wider than a third of the screen at larger factors. The fix adds `minWidth: 0` (so the flex item is actually allowed to shrink below its content's intrinsic width), `justifyContent: 'center'`, and `paddingHorizontal: spacing.xs`, paired with `textAlign: 'center'` and `numberOfLines={1} adjustsFontSizeToFit` on the `<Text>`. With those together, a label that would overflow its column scales its font down rather than being hard-clipped, and stays centered. 'Extra grande' is the worst case and is handled by the same mechanism as the shorter labels, so it fits at 1.0/1.15/1.3. `adjustsFontSizeToFit` on single short words in a fixed-width box is the intended RN usage; the (possible) Android padding quirk does not manifest for this content.

### InfoRow: fixed label, shrinkable value

The row changed from a two-child `space-between` with an inline-styled value wrapper to a labeled split: `ir.label` gets `flexShrink: 0` (short labels — Estado, RUT, Teléfono, Desde — keep their intrinsic width), and the value side moves to a named `ir.valueWrap` with `flexShrink: 1`, `minWidth: 0`, `justifyContent: 'flex-end'`. The value text gains `flexShrink: 1`, `textAlign: 'right'`, and `numberOfLines={1}`. The row also gains `gap: spacing.md`, which guarantees separation between label and value even as the value side shrinks. Real values (phone, es-CL date, 'Activo', RUT) are short and fit fully at every factor; the ellipsis is a safety net, not expected behavior. This is the correct asymmetric treatment — label fixed, value elastic — and avoids the previous clip where the value column had no shrink budget.

### Admin button and a11y header

`s.adminBtnText` gets `flex: 1`, so the text occupies the span between the leading settings icon and the trailing chevron and shrinks its box as the font grows; the chevron's `marginLeft: 'auto'` is removed because `flex: 1` on the text now does the same job of pushing it to the edge. This is a clean simplification, not a behavioral change — the chevron still sits flush right. `numberOfLines={1}` ellipsizes only if 'Administración' ever exceeds the full-width button, which it does not at the tested factors. The a11y header title `s.a11yTitle` gets `flexShrink: 1` so it yields to the leading icon rather than overflowing the card.

### Role pill and stat labels (adjacent hardening)

Not among the four named areas but in scope: both share the self-sizing / flex-constrained failure mode. `s.rolePill` gains `maxWidth: '100%'` + `flexShrink: 1` and `s.roleText` gains `flexShrink: 1` + `includeFontPadding: false` — the latter removes the extra Android font padding that makes measured width exceed drawn glyph width, the likely cause of the 'Administrad…' pill clip. Stat labels gain `textAlign: 'center'` + `numberOfLines={1} adjustsFontSizeToFit` so 'Trabajadores' shrinks to fit the `flex:1` stat card. Consistent with the rest of the change.

### Copy and scope integrity

Confirmed by reading the final file: 'Administración', 'Semana', 'Mes', 'Hoy', 'Extra grande', 'Tamaño del texto', 'Teléfono', 'Desde', 'Estado', 'Trabajadores', 'Prom/día' are all present verbatim — no label was abbreviated to dodge the clip. No query, hook, or handler logic changed. `useFontScale` is imported and used read-only. All numeric/style values resolve to existing theme tokens (`spacing.xs`=4, `spacing.md`=12, `radius.lg`, `radius.full`); no invented tokens. `git status` shows only `apps/mobile/app/(tabs)/profile.tsx` modified in source (other dirty entries — `.gitignore`, `.worktrees/`, a seed SQL, the task dir — are unrelated to this edit's source file and not part of the fix).

### Verification evidence

Per instruction, the typecheck/lint were not re-run. `verification.md` reports `npx tsc --noEmit` → exit 0 (tsconfig has `noEmit`, so this is the typecheck) and `npm run lint` → 0 errors, 92 pre-existing warnings, plus `npx eslint "app/(tabs)/profile.tsx"` → 1 pre-existing warning (`icon as any`, present before this change). The evidence is specific (commands, exit codes, counts) and internally consistent with the diff. The author explicitly states device/emulator verification was not performed and does not claim a visual pass — an honest caveat, not a gap in the layout reasoning.

Not tested: no on-device or emulator render at any font factor; correctness rests on the layout reasoning plus the passing typecheck/lint. Given the change is purely declarative layout props using standard RN patterns, this is an acceptable residual risk for a layout-only fix, but a quick visual check at factor 1.3 on a physical Android device before release would close it.

</details>

<details>
<summary>File map</summary>

- `apps/mobile/app/(tabs)/profile.tsx` — layout-only edits: chip containers (`minWidth:0`, centering, xs padding) and chip text (`textAlign:center`, `numberOfLines`+`adjustsFontSizeToFit`); InfoRow split into fixed label + shrinkable `valueWrap`/value; admin button text `flex:1` (chevron `marginLeft:auto` removed); a11y title `flexShrink:1`; role pill + stat label hardening. No other source files changed.

Full diff: `git -C <repo> diff -- "apps/mobile/app/(tabs)/profile.tsx"`

</details>
