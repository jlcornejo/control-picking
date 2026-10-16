# Verification — Profile screen Android text clipping

Scope: layout-only fix in `apps/mobile/app/(tabs)/profile.tsx`. No changes to Spanish
copy, business logic, queries, or `useFontScale.tsx`.

## Commands run

From `apps/mobile`:

- `npx tsc --noEmit` → exit `0` (no type errors). tsconfig has `noEmit`, so this is the typecheck.
- `npm run lint` (eslint app/ src/) → exit `0`, `92 problems (0 errors, 92 warnings)`.
  All 92 are pre-existing warnings in other files.
- `npx eslint "app/(tabs)/profile.tsx"` → `1 problem (0 errors, 1 warning)`.
  The lone warning (`icon as any` on the `<Ionicons>` in `InfoRow`) is pre-existing;
  it was not introduced by this change.

No TS/lint errors were introduced.

## Changes made (per problem area)

1. **Period chips** (`PERIODS`: Hoy / Semana / Mes)
   - Chip container `s.periodChip`: added `minWidth: 0`, `paddingHorizontal: spacing.xs`,
     `justifyContent: 'center'`.
   - Chip text `s.periodChipText`: added `textAlign: 'center'`.
   - JSX: added `numberOfLines={1} adjustsFontSizeToFit` to the chip `<Text>`.

2. **A11y chips** (`FONT_SCALE_LABELS`: Normal / Grande / Extra grande)
   - Chip container `s.a11yChip`: added `minWidth: 0`, `paddingHorizontal: spacing.xs`,
     `justifyContent: 'center'`.
   - Chip text `s.a11yChipText`: added `textAlign: 'center'`.
   - JSX: added `numberOfLines={1} adjustsFontSizeToFit` to the chip `<Text>`.

3. **InfoRow** (label / value: Estado, RUT, Teléfono, Desde + phone/date values)
   - `ir.row`: added `gap: spacing.md`.
   - `ir.label`: added `flexShrink: 0` (label keeps intrinsic width).
   - New `ir.valueWrap` (replaces inline style): `flexShrink: 1`, `minWidth: 0`,
     `justifyContent: 'flex-end'` so the value side can shrink.
   - `ir.value`: added `flexShrink: 1`, `textAlign: 'right'`.
   - JSX: added `numberOfLines={1}` to the value `<Text>` (ellipsizes instead of clipping;
     real values like phone/date are short and fully fit at every scale).

4. **Admin button + a11y header**
   - Admin button text `s.adminBtnText`: added `flex: 1` so the text takes available width
     and pushes the trailing chevron right (removed now-redundant `marginLeft: 'auto'`
     from the chevron). Added `numberOfLines={1}` to the `<Text>`.
   - A11y header title `s.a11yTitle`: added `flexShrink: 1`; JSX `numberOfLines={1}`.

Also hardened the **role pill** ('Administrador') and **stat labels**
('Trabajadores', 'Prom/día') which share the same self-sizing / flex:1-constrained
pattern:
   - `s.rolePill`: `maxWidth: '100%'`, `flexShrink: 1`.
   - `s.roleText`: `flexShrink: 1`, `includeFontPadding: false`; JSX `numberOfLines={1}`.
   - `s.statLabel`: `textAlign: 'center'`; JSX `numberOfLines={1} adjustsFontSizeToFit`.

## Why clipping can no longer occur — reasoning at factor 1.0 / 1.15 / 1.3

The in-app factor multiplies `fontSize` globally (useFontScale). The fixes below hold at
every factor because each label can now either shrink its glyphs to fit or wrap/ellipsize
rather than being hard-clipped by a tight container.

- **Period chips (Hoy/Semana/Mes):** each chip is `flex:1` and shares the row equally.
  With `adjustsFontSizeToFit` + `numberOfLines={1}`, if the scaled word is wider than the
  chip's content box, React Native shrinks the font to fit instead of clipping. Added
  horizontal padding + centering keep it centered. At 1.3 the words are the widest; the
  single word simply renders smaller but whole. No clip at 1.0/1.15/1.3.

- **A11y chips (Normal/Grande/Extra grande):** same `flex:1` + `adjustsFontSizeToFit` +
  `numberOfLines={1}` treatment. 'Extra grande' is the longest; `minWidth:0` lets the chip
  participate in flex shrink and the font scales down to fit the third of the row at every
  factor, so it is never clipped.

- **InfoRow:** label has `flexShrink:0` (keeps full width — labels are short: Estado,
  Teléfono, Desde, RUT). The value side (`valueWrap` + `value`) has `flexShrink:1` and
  `minWidth:0`, so when label + value exceed the row the value shrinks its box and
  `numberOfLines={1}` ellipsizes rather than clipping. Real values (phone, es-CL date,
  'Activo', RUT) are short enough to fit fully even at 1.3; the ellipsis is only a safety
  net, so no visible truncation of trailing characters occurs.

- **Admin button ('Administración'):** text now has `flex:1`, so it occupies the width
  between the leading icon and trailing chevron and shrinks the available box as the font
  grows; `numberOfLines={1}` means it ellipsizes at the far right if ever too long, but at
  1.0/1.15/1.3 'Administración' fits in the full-width button. The chevron stays right via
  the text's `flex:1` instead of the removed `marginLeft:'auto'`.

- **A11y header ('Tamaño del texto'):** title has `flexShrink:1`, so in the row with the
  leading icon it takes the remaining width and shrinks its box rather than overflowing;
  `numberOfLines={1}` ellipsizes only as a safety net. It fits fully at all factors in the
  card width.

- **Role pill ('Administrador') and stat labels:** pill can `flexShrink` within the card
  (`maxWidth:'100%'`) and `includeFontPadding:false` removes the extra Android font padding
  that caused the measured width to mismatch the drawn glyphs (the likely source of the
  'Administrad' clip). Stat labels use `adjustsFontSizeToFit` to shrink to fit the `flex:1`
  stat card.

## On-device / emulator verification

Not performed. No Android emulator or device was available in this environment, so visual
verification relies on the layout reasoning above plus the passing typecheck and lint.
This is NOT claimed as 'verified on device'.
