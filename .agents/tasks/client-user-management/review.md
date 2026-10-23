# Client-side login-user management ("Usuarios" section)

This change gives the tenant admin a dedicated "Usuarios" section (web + mobile) to create, list, edit, deactivate, and reset the password of login users (`admin`/`supervisor`/`crew_lead`), without SQL or platform intervention. A login user is modeled as an existing `workers` row with a non-null `auth_user_id` — no new table, no new migration. The Edge Function `workers` is the real security barrier: creation is driven solely by an explicit `create_login:true` flag with a server-generated temp password, edits route through `handlePut` with an anti-degradation guard, deactivation through `handlePatchStatus` with a crew-level debt check, and a new `reset-password` sub-route regenerates the temp password. Both "Trabajadores" list queries gain exactly one `.is('auth_user_id', null)` clause so login accounts don't leak into that view.

Watch for: nothing blocking. The implementation matches the approved design section-by-section; RBAC + tenant isolation are correctly enforced server-side; secrets are returned once and never logged (confirmed). Unrelated in-flight work (scale auto-capture in register.tsx, drawer pin, `react-native-worklets`, `expo/tsconfig.base`) is left untouched as required.

**Verdict**: APPROVED

## High-level view

The data-model decision holds: a login user is a `workers` row with `auth_user_id IS NOT NULL AND role <> 'worker'`, and the "Usuarios" list query in both apps filters exactly on that. The one-clause `.is('auth_user_id', null)` added to both "Trabajadores" queries is the complementary half of the split and is the only change in those screens.

Creation collapses to a single trigger. The legacy `body.email && body.password` branch is gone; `create_login === true` is the sole path that provisions an auth user, the password is generated server-side by `generateTempPassword()`, `must_change_password:true` is set, `status` is omitted (so the `entity_status` default `active` keeps the custom-claims hook working), `role='worker'` is rejected 422, invalid email is 422, duplicate email is 409, and a failed `workers` insert compensates by deleting the just-created auth user. The non-login path still inserts a worker with `auth_user_id: null`.

RBAC and tenant isolation are consistent across all four operations. Every handler runs `requireRole(['admin'])` then `requirePermission('workers.manage')` (the latter newly added to `handlePatchStatus` to align the chain), and `organization_id` always comes from the JWT (`getOrgId`) on create or from the resolved row checked by `requireOrg` on the service-role paths. A supervisor/crew_lead is blocked by `requireRole` before any work; cross-tenant access is blocked by `requireOrg` (service-role paths) or the `admin_all_workers` RLS policy (request-client paths). No new capability was introduced — `CAPABILITIES.WORKERS_MANAGE` is reused everywhere.

The two server-side business guards are correctly placed. The anti-degradation guard sits inside the `body.role !== undefined` branch, before the update, resolves the target with the service client, applies `requireOrg` first, then rejects `role='worker'` on a row with a non-null `auth_user_id` (422) while still allowing it on a null-`auth_user_id` row. The crew-debt guard fires only on deactivation, resolves crews led by the target, and 409s if any `payee_type='crew'` settlement is pending/partial, with DB errors mapped to 400.

UI parity is present on both platforms: admin-only gating (web Sidebar `role === 'admin'`, mobile drawer + `WORKERS_MANAGE` capability), temp password shown once in a credential view (web amber/emerald box; mobile modal with an `expo-clipboard` Copy button), all copy in Spanish, role selectors excluding `worker`, and role/status/reset mutations going through `functions.invoke` rather than direct table writes. UI gating is cosmetic; the Edge Function is the barrier.

<details>
<summary>Issues (0)</summary>

No blocking or non-blocking actionable findings. The implementation conforms to the approved design.

</details>

<details>
<summary>Details</summary>

### Data model and the Trabajadores split

The design's Option A is implemented exactly: `apps/web/src/app/(dashboard)/workers/page.tsx` and `apps/mobile/app/admin/workers.tsx` each gain a single `.is('auth_user_id', null)` clause between `.select(...)` and `.order('full_name')`, with no other change to columns, forms, mutations, or styling. The "Usuarios" queries are the mirror: `.not('auth_user_id','is',null).neq('role','worker').order('full_name')` on both platforms, selecting only non-secret columns (`id, full_name, role, status, auth_user_id, must_change_password, created_at` on web; the same minus `created_at` on mobile). Email is never selected from `workers` (it lives in `auth.users`), consistent with §4.2.

### Single creation trigger and the generator

`handlePost` keeps `requireRole(['admin'])` + `requirePermission('workers.manage')` as its first two checks, then the `create_login === true` block is the only auth-user path — the legacy `email && password` branch is removed. Inside it: `role==='worker'` → 422; email is `trim().toLowerCase()`'d and validated against the same `EMAIL_RE` as `organizations`; the password comes from `generateTempPassword()` (body password ignored); `createUser` errors map duplicate patterns to 409 and others to 400; `qr_badge_url` is generated unconditionally; the insert sets `must_change_password: true`, passes through `national_id`/`phone`/`permission_profile_id` as `|| null`, and omits `status`. On missing `orgId` or a failed insert, the just-created auth user is deleted best-effort before returning, closing the orphaned-account window. A `23505` insert conflict is also mapped to 409. Success returns `{ worker, temp_password }` once with 201.

`generateTempPassword` matches §6 verbatim: ambiguous-free alphabets, CSPRNG with modulo-rejection (`randIndex`), one char seeded per class, fill from the union, Fisher-Yates shuffle, floor to 12 (default 14). The `noUncheckedIndexedAccess` non-null assertions and the explicit swap noted in verification are behavior-preserving. The Vitest suite asserts the class guarantees over 1000 samples, the 14 default, the floor-to-12, a longer length, and inequality across calls — this is the design's required class-level coverage, not just length.

### The two business guards

The anti-degradation guard is inside the `body.role !== undefined` branch and before `supabase.from('workers').update(updates)`. Only when `body.role === 'worker'` does it resolve the row via the service client, apply `requireOrg(req, target?.organization_id)` first (cross-org → 403), then reject with 422 if `target?.auth_user_id` is set. A `role='worker'` on a null-`auth_user_id` row is still permitted, so Trabajadores is unaffected. This is the correct server-side barrier — the client Zod enum is defense-in-depth only.

`handlePatchStatus` now runs `requirePermission('workers.manage')` immediately after `requireRole(['admin'])`, matching the chain. On `status==='inactive'` it keeps the existing worker-level settlement check, then resolves `crews WHERE crew_lead_id = workerId` and, if any, counts `settlements WHERE payee_type='crew' AND crew_id IN (...) AND status IN ('pending','partial')`, returning `WORKER_HAS_PENDING_DEBT` 409 when positive; either DB error maps to 400. Because it runs with the request RLS client, the `settlements`/`crews` reads and the final update stay confined to the admin's org via `admin_all_workers`. Activation never triggers the guard.

### Reset sub-route

`handleResetPassword` is dispatched before the `switch` (so a POST with a subResource never reaches `handlePost`), and the router comment is updated to `// "status" | "badge" | "reset-password"`. The handler applies `requireRole` + `requirePermission`, resolves the target with the service client, enforces tenant isolation with `requireOrg` (cross-org → 403), 404s a missing row, 422s a null `auth_user_id`, calls `updateUserById`, re-sets `must_change_password: true`, and returns `{ temp_password }` once with 200. No `platform_audit_log` write, consistent with §5. Grep confirms no `console.*` statements in any touched Edge/UI file, so neither temp password nor email is logged.

### Constraints and unrelated work

No files under `supabase/migrations/` changed; nothing is staged. The unrelated in-flight changes are present and unmodified: `register.tsx` scale auto-capture, the `@react-navigation/drawer 7.13.0` pin, `react-native-worklets 0.5.1` in the root `package.json`, and `extends: expo/tsconfig.base` in `tsconfig.json`. `expo-clipboard ~8.0.8` was added to mobile for the Copy button, as the design requires. The pre-existing `_layout.tsx` drawer-content `any` was typed with `DrawerContentComponentProps` in a file this feature already edits — verification documents this as pre-existing and isolates it.

</details>

<details>
<summary>File map</summary>

- `packages/shared/src/validation/index.ts` — `LOGIN_USER_ROLES` const tuple + `createLoginUserSchema`/`updateLoginUserSchema` (+ input types).
- `packages/shared/src/validation/login-user.test.ts` — schema tests (NEW).
- `packages/shared/src/validation/temp-password.test.ts` — generator class-guarantee tests (NEW).
- `supabase/functions/_shared/password.ts` — `generateTempPassword` (NEW).
- `supabase/functions/workers/index.ts` — `create_login` creation path, `handlePut` anti-degradation guard, `handlePatchStatus` permission + crew-debt guard, `reset-password` sub-route.
- `apps/web/src/app/(dashboard)/usuarios/page.tsx` — "Usuarios" page (NEW).
- `apps/web/src/components/ui/Sidebar.tsx` — admin-only "Usuarios" link.
- `apps/web/src/app/(dashboard)/workers/page.tsx` — `.is('auth_user_id', null)` clause.
- `apps/mobile/app/admin/users.tsx` — "Usuarios" screen with Copy button (NEW).
- `apps/mobile/app/admin/_layout.tsx` — `Drawer.Screen name="users"` + typed drawerContent param.
- `apps/mobile/app/admin/index.tsx` — "Usuarios" grid module.
- `apps/mobile/src/components/admin/AdminDrawerContent.tsx` — "Usuarios" drawer item.
- `apps/mobile/app/admin/workers.tsx` — `.is('auth_user_id', null)` clause.
- `apps/mobile/package.json` — add `expo-clipboard ~8.0.8`.
- Unrelated in-flight (not part of this feature, left untouched): `apps/mobile/app/(tabs)/register.tsx`, `package.json` (`react-native-worklets`), `tsconfig.json` (`expo/tsconfig.base`), drawer pin, `package-lock.json`.

Full diff: `git diff` at repo root.

</details>
