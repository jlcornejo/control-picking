# Implementation Plan — Gestión de Usuarios de login por el admin del cliente

Source of truth: `./design.md` (approved after 3 review rounds). This plan sequences that design; it does not re-decide it. Order is strict dependency order: **shared → edge → web → mobile**. Each item leaves the tree buildable.

Repo facts verified during exploration (cite when implementing):
- Monorepo: Turborepo + npm workspaces. Root test = `npm test` (`turbo test`); per-package Vitest = `vitest --run`. Web/shared build via `turbo build` / `next build`.
- `supabase/functions/workers/index.ts` currently: `handlePost` creates auth user **only** `if (body.email && body.password)`, does NOT set `must_change_password`, does NOT compensate on insert failure; `handlePut` validates role against all 4 roles with no anti-degradation guard; `handlePatchStatus` has only `requireRole(['admin'])` (no `requirePermission`) and checks pending debt only by `worker_id`; the router parses `subResource = pathParts[2]` (comment `// "status" or "badge"`) and dispatches `PATCH .../status` and `POST .../badge` BEFORE the `switch`.
- `_shared/auth.ts` exports `requireRole`, `requirePermission`, `getOrgId`, `requireOrg`, `createServiceClient`, `getUser` — all as described in design §3/§5. No new helper needed there.
- No Edge Function test harness exists (`find supabase/functions -name '*.test.ts'` → none). `packages/shared` uses Vitest.
- `packages/shared/src/types/index.ts`: `WorkerRole.ADMIN='admin'`, `SUPERVISOR='supervisor'`, `CREW_LEAD='crew_lead'`; `CAPABILITIES.WORKERS_MANAGE='workers.manage'`. `validation/index.ts` already uses `z.enum(['trial',...])` literals and `z.enum(ALL_CAPABILITIES as [...])` — the `LOGIN_USER_ROLES as const` + `z.enum(LOGIN_USER_ROLES)` approach matches precedent.
- `apps/web/.../platform/page.tsx`: credential success screen = emerald box ("Cliente creado"), email + `font-mono` password, amber box ("Esta contraseña no se volverá a mostrar."), "Listo" button. Mirror this for the "Usuarios" credential view, taking `temp_password` from the response.
- `apps/mobile/package.json`: Expo SDK `~54.0.0`, `expo-crypto` present, **`expo-clipboard` absent** → add via `npx expo install expo-clipboard`.
- `apps/mobile/app/admin/index.tsx` `AdminModule` requires explicit `available: true`; `AdminDrawerContent.tsx` items use `{ route, title, icon, color, section: 'master', requiresCapability }`; `_layout.tsx` registers `<Drawer.Screen name="..." />` by route name.

Domain-invariant check (confirmed before writing): this feature does not touch picking quantities, rates, or settlement immutability; it only READS `settlements` (pending/partial) to gate deactivation and never mutates them. It REINFORCES RBAC (adds `requirePermission('workers.manage')` to `handlePatchStatus`; every op keeps `requireRole(['admin'])` + org-from-JWT). Canonical entity names only (`workers`, `settlements`, `crews`, `payments`); no renames.

HARD CONSTRAINTS (from the task): no new DB migrations; do NOT undo unrelated uncommitted work (escala/clipping, drawer deps in root `package.json`). This feature only ADDS.

---

- [ ] 1. Add login-user roles + Zod schemas to shared.
      Append to `packages/shared/src/validation/index.ts` (design §6, verbatim snippet): `export const LOGIN_USER_ROLES = ['admin','supervisor','crew_lead'] as const;`, `createLoginUserSchema` = `z.object({ full_name: z.string().min(1,'Nombre completo es requerido').max(150), email: z.string().email('Email inválido').max(255), role: z.enum(LOGIN_USER_ROLES, { required_error: 'Seleccione un rol' }) })` + `export type CreateLoginUserInput`, and `updateLoginUserSchema` = `z.object({ full_name: z.string().min(1).max(150).optional(), role: z.enum(LOGIN_USER_ROLES).optional() })`. Use string-literal tuple `as const` (NOT `WorkerRole.*` enum members — that fails `tsc` strict per §6). Do NOT add a new capability. If `packages/shared` re-exports schemas via a barrel, ensure these are exported like the existing schemas.
      Files: `packages/shared/src/validation/index.ts`
      Verify: `cd packages/shared && npx vitest --run` passes; `npx tsc --noEmit` (or `npm run build -w packages/shared`) compiles with no errors.

- [ ] 2. Add shared unit tests for the new schemas.
      Create a Vitest test covering `createLoginUserSchema` (reject empty `full_name`, reject >150, reject invalid email, reject `role` outside the three login roles incl. `'worker'`, accept a valid payload) and `updateLoginUserSchema` (all-optional; reject `role:'worker'`). Follow the existing `packages/shared/src/types/*.test.ts` / validation test pattern. Depends on item 1.
      Files: `packages/shared/src/validation/login-user.test.ts` (or alongside existing validation tests following repo convention)
      Verify: `cd packages/shared && npx vitest --run` — new tests pass.

- [ ] 3. Create the temp-password generator Edge helper.
      Create `supabase/functions/_shared/password.ts` with the exact implementation from design §6: alphabets without ambiguous chars (`LOWER='abcdefghijkmnpqrstuvwxyz'`, `UPPER='ABCDEFGHJKLMNPQRSTUVWXYZ'`, `DIGITS='23456789'`, `SYMBOLS='@#$%*+?'`), `randIndex(n)` using `crypto.getRandomValues(new Uint32Array(1))` with modulo-rejection (threshold `Math.floor(0xffffffff/n)*n`), `pick(alphabet)`, and `generateTempPassword(len=14)` that floors `len` to 12, seeds one char from each of the 4 classes, fills the rest from the union, then Fisher–Yates shuffles with `randIndex`. NEVER `Math.random()`. Export `generateTempPassword`. This module is pure (only uses Web Crypto) so it is importable by both Deno and, if needed, a Vitest test.
      Files: `supabase/functions/_shared/password.ts`
      Verify: `deno check supabase/functions/_shared/password.ts` type-checks (if Deno CLI available). Otherwise this is exercised by item 4's `deno check` of `workers/index.ts` which imports it.

- [ ] 4. Extend `handlePost` in the workers Edge Function for login-user creation (design §4.1).
      In `supabase/functions/workers/index.ts`: import `generateTempPassword` from `../_shared/password.ts`. **Replace** the `if (body.email && body.password) {...}` block with the `create_login` flow: `if (body.create_login === true)` → validate `email` present + matching `EMAIL_RE` (copy the regex used in `organizations/index.ts`), `trim().toLowerCase()` (else `VALIDATION_ERROR` 422); require `role ∈ {admin,supervisor,crew_lead}` (reject `'worker'` → 422); IGNORE any `body.password`; `tempPassword = generateTempPassword()`; `createServiceClient().auth.admin.createUser({ email, password: tempPassword, email_confirm: true })`; on error map duplicate-email to **409** ("El email ya está en uso", `conflict` pattern), other errors to 400; set `authUserId`. Keep `qr_badge_url = crypto.randomUUID()` unconditional. Keep `national_id`/`phone`/`permission_profile_id` passthrough (`|| null`). Add `must_change_password: !!authUserId` to the insert. **Omit `status`** from the insert (rely on `entity_status` default `'active'` — required by `custom_access_token_hook`). If the `workers` insert fails AND `authUserId` was created this request, compensate: `await svc.auth.admin.deleteUser(authUserId).catch(()=>{})` before returning the error. On success return `success({ worker: data, temp_password: tempPassword }, 201)` ONLY when a login user was created (temp password shown once); for the non-`create_login` path keep returning the worker as today. Never log `temp_password`/`email`. The legacy `email && password` branch is fully removed (verified: no caller invokes this POST).
      Files: `supabase/functions/workers/index.ts`
      Verify: `deno check supabase/functions/workers/index.ts` passes (if Deno available). Manual review: response shape and that `status` is not in the insert object.

- [ ] 5. Add the anti-degradation guard to `handlePut` (design §4.3).
      In `handlePut`, inside the existing `if (body.role !== undefined)` branch and BEFORE the existing `supabase.from('workers').update(...)`, add: when `body.role === 'worker'`, resolve the target with the service client — `const svc = createServiceClient(); const { data: target } = await svc.from('workers').select('auth_user_id, organization_id').eq('id', workerId).single();` — then `const orgErr = requireOrg(req, target?.organization_id); if (orgErr) return orgErr;` and if `target?.auth_user_id` is not null return `error('VALIDATION_ERROR', 'No se puede convertir un usuario con acceso en trabajador; desactívelo en su lugar', 422)`. Keep the existing role-set validation and the rest of the update untouched. (A `role='worker'` on a row with null `auth_user_id` must still be allowed — do not block it.)
      Files: `supabase/functions/workers/index.ts`
      Verify: `deno check supabase/functions/workers/index.ts` passes; review that the guard is inside the `role!==undefined` branch and before the update.

- [ ] 6. Harden `handlePatchStatus`: add `requirePermission` and crew-level debt check (design §4.4).
      In `handlePatchStatus`, immediately after `requireRole(req, ['admin'])`, add `const permError = requirePermission(req, 'workers.manage'); if (permError) return permError;`. Then, within the existing `if (body.status === 'inactive')` block, after the existing `worker_id` settlements check, add a second check: resolve crews led by the worker — `const { data: crews, error: crewsErr } = await supabase.from('crews').select('id').eq('crew_lead_id', workerId);` (on error return `error('VALIDATION_ERROR', crewsErr.message, 400)`); if `crews?.length`, count `settlements` WHERE `payee_type='crew'` AND `crew_id IN (crewIds)` AND `status IN ('pending','partial')` via `.in('crew_id', crewIds)` + `.in('status', ['pending','partial'])` with `{ count: 'exact', head: true }`; if that count `> 0` return `error('WORKER_HAS_PENDING_DEBT', 'La cuadrilla a cargo tiene liquidaciones pendientes de pago. Resuelva antes de desactivar.', 409)` (DB error on the count → `VALIDATION_ERROR` 400). Runs with the request RLS client (no service client). Do NOT touch `handleRegenerateBadge`.
      Files: `supabase/functions/workers/index.ts`
      Verify: `deno check supabase/functions/workers/index.ts` passes; review the two-check structure and that `requirePermission` is present.

- [ ] 7. Add the `POST /workers/:id/reset-password` sub-route + `handleResetPassword` (design §5).
      In the router (before the `switch`, alongside the status/badge dispatch), add `if (req.method === 'POST' && workerId && subResource === 'reset-password') return await handleResetPassword(req, supabase, workerId);` and update the `subResource` comment to `// "status" | "badge" | "reset-password"`. Implement `handleResetPassword(req, supabase, workerId)`: `requireRole(['admin'])` → 403; `requirePermission('workers.manage')` → 403; `const orgId = getOrgId(req)` (value only; `requireOrg` enforces presence); resolve target with `createServiceClient()` selecting `id, organization_id, auth_user_id, role` `.eq('id', workerId).single()` → 404 if missing; `const orgErr = requireOrg(req, target.organization_id); if (orgErr) return orgErr;`; if `target.auth_user_id` is null → `error('VALIDATION_ERROR', 'El usuario no tiene cuenta de acceso', 422)`; `const tempPassword = generateTempPassword();` `await svc.auth.admin.updateUserById(target.auth_user_id, { password: tempPassword })` → on error `error('VALIDATION_ERROR', <msg>, 400)`; `await svc.from('workers').update({ must_change_password: true }).eq('id', workerId);` return `success({ temp_password: tempPassword }, 200)`. Never log the password. Do NOT write `platform_audit_log`. Depends on item 3.
      Files: `supabase/functions/workers/index.ts`
      Verify: `deno check supabase/functions/workers/index.ts` passes; confirm the route dispatch sits before the `switch` so a POST with a subResource never hits `handlePost`.

- [ ] 8. (Optional, if Supabase local is available) Integration smoke of the Edge changes.
      With `npx supabase start` + `npx supabase functions serve`, exercise: create login user (`create_login:true`) → 201 with `temp_password`, `workers` row has `auth_user_id` and `must_change_password=true`; `PUT` role→`worker` on that row → 422; `PATCH status→inactive` on a `crew_lead` with a `payee_type='crew'` pending settlement → 409; `POST .../reset-password` cross-org → 403, same-org → 200 with `temp_password`. This is best-effort per design §11 (no Edge test harness in repo); if Supabase local is not runnable, record that and rely on items 4–7 `deno check` + web/mobile builds. No secrets in output.
      Files: none (manual/integration)
      Verify: the four responses above; `temp_password` present in create/reset, absent from logs.

- [ ] 9. Add the `.is('auth_user_id', null)` filter to the web Trabajadores list (design §2/§4.2).
      In `apps/web/src/app/(dashboard)/workers/page.tsx`, the `useQuery(['workers'])` query: insert `.is('auth_user_id', null)` between `.select(...)` and `.order('full_name')`. ONE clause only — do not change columns, forms, mutations, or styling.
      Files: `apps/web/src/app/(dashboard)/workers/page.tsx`
      Verify: `cd apps/web && npx tsc --noEmit` (or `npm run build -w apps/web`) compiles; the list query now excludes login accounts.

- [ ] 10. Create the web "Usuarios" page (design §7).
      Create `apps/web/src/app/(dashboard)/usuarios/page.tsx` mirroring `workers/page.tsx` structure (`DataTable`, `StatusBadge`, `PageHeader`, `ActionButton`, `Modal`, `FormField`, `ConfirmDialog`, `useToast`, `PageTransition`, `useOrgSettings().roleLabel`). `useQuery(['login-users'])` → `supabase.from('workers').select('id, full_name, role, status, auth_user_id, must_change_password, created_at').not('auth_user_id','is',null).neq('role','worker').order('full_name')`. Columns: Nombre, Rol (via `orgRoleLabel`), Estado (`StatusBadge`), optional "Debe cambiar contraseña" badge when `must_change_password`. Actions:
      - Create: validate with `createLoginUserSchema`; `supabase.functions.invoke('workers', { method:'POST', body:{ full_name, email, role, create_login:true } })`; on success show a reusable credential view replicating `platform/page.tsx` (emerald box, email + `font-mono` `data.data.temp_password`, amber "no se volverá a mostrar", "Listo"). `ROLE_OPTIONS` = admin/supervisor/crew_lead (NO 'worker').
      - Edit: `supabase.functions.invoke('workers/'+id, { method:'PUT', body:{ full_name, role } })` (NOT direct `from().update()` for role). Role select excludes 'worker'.
      - Deactivate/Activate: `ConfirmDialog` + `supabase.functions.invoke('workers/'+id+'/status', { method:'PATCH', body:{ status } })`; surface `WORKER_HAS_PENDING_DEBT` (409) message as a toast.
      - Reset password: key-icon action → `ConfirmDialog` → `supabase.functions.invoke('workers/'+id+'/reset-password', { method:'POST' })` → show `data.data.temp_password` once in the same credential view.
      All copy in Spanish. Depends on items 1, 4–7.
      Files: `apps/web/src/app/(dashboard)/usuarios/page.tsx`
      Verify: `cd apps/web && npm run build -w apps/web` (or `npx next build`) succeeds; `npx tsc --noEmit` clean.

- [ ] 11. Add the "Usuarios" entry to the web Sidebar (design §7).
      In `apps/web/src/components/ui/Sidebar.tsx`: add `ShieldCheck` to the existing `lucide-react` import. In the management branch of `navLinks`, next to the Supervisores entry, add `...(role === 'admin' ? [{ href: '/usuarios', label: 'Usuarios', icon: ShieldCheck }] : [])`. Keep the `role === 'admin'` guard explicit and separate — "Supervisores" stays ungated (visible to supervisor); "Usuarios" is admin-only. Do not restructure other links.
      Files: `apps/web/src/components/ui/Sidebar.tsx`
      Verify: `cd apps/web && npm run build -w apps/web` succeeds; link renders only for admin.

- [ ] 12. Add `expo-clipboard` to mobile.
      Run `cd apps/mobile && npx expo install expo-clipboard` so the version aligns with Expo SDK 54; this writes the dependency into `apps/mobile/package.json`. (Native module → dev client must be rebuilt in Xcode; note for the user, not a build-blocker here.) Do not touch unrelated deps (expo-crypto, root drawer deps).
      Files: `apps/mobile/package.json` (+ lockfile)
      Verify: `grep expo-clipboard apps/mobile/package.json` shows the dependency; `cd apps/mobile && npx tsc --noEmit` still resolves imports after item 13.

- [ ] 13. Add the `.is('auth_user_id', null)` filter to the mobile Trabajadores list (design §2/§4.2).
      In `apps/mobile/app/admin/workers.tsx`, the `useQuery(['admin-workers'])` query: insert `.is('auth_user_id', null)` between `.select(...)` and `.order('full_name')`. ONE clause only — no other change.
      Files: `apps/mobile/app/admin/workers.tsx`
      Verify: `cd apps/mobile && npx tsc --noEmit` compiles; query excludes login accounts.

- [ ] 14. Create the mobile "Usuarios" screen (design §8).
      Create `apps/mobile/app/admin/users.tsx` mirroring `admin/workers.tsx` (`FlatList` + `RowItem`, FAB "+", `Modal` sheet form, `useOrgSettings().roleLabel`, `createLoginUserSchema` for validation). `useQuery(['admin-login-users'])` with the §4.2 select (`.not('auth_user_id','is',null).neq('role','worker').order('full_name')`). Actions:
      - Create: `supabase.functions.invoke('workers', { method:'POST', body:{ full_name, email, role, create_login:true } })` → show `temp_password` once in a reusable RN `Modal` credential sheet (monospace email + password) with a **"Copiar"** button using `import * as Clipboard from 'expo-clipboard'` → `await Clipboard.setStringAsync(tempPassword)` + "Copiado" feedback. Copy: "Entrega esta contraseña al usuario; deberá cambiarla al ingresar. No se volverá a mostrar."
      - Edit: `supabase.functions.invoke('workers/'+id, { method:'PUT', body:{ full_name, role } })`. `ROLE_OPTIONS` = [Encargado(crew_lead), Supervisor, Administrador] (no Trabajador).
      - Deactivate/Activate: `Alert.alert` confirm + `supabase.functions.invoke('workers/'+id+'/status', { method:'PATCH', body:{ status } })`; show `WORKER_HAS_PENDING_DEBT` (409) message in an `Alert`.
      - Reset: `key-outline` action → `Alert.alert` confirm → `supabase.functions.invoke('workers/'+id+'/reset-password', { method:'POST' })` → reuse the credential modal once.
      Spanish copy throughout. Depends on items 1, 4–7, 12.
      Files: `apps/mobile/app/admin/users.tsx`
      Verify: `cd apps/mobile && npx tsc --noEmit` compiles.

- [ ] 15. Register the mobile "Usuarios" screen in navigation (design §8).
      Three edits:
      - `apps/mobile/app/admin/_layout.tsx`: add `<Drawer.Screen name="users" options={{ title: 'Usuarios' }} />` in the "Datos maestros" group (near `supervisors`/`permission-profiles`).
      - `apps/mobile/src/components/admin/AdminDrawerContent.tsx`: add to `items` (section `'master'`): `{ route: 'users', title: 'Usuarios', icon: 'person-circle', color: colors.violet, section: 'master', requiresCapability: CAPABILITIES.WORKERS_MANAGE }`.
      - `apps/mobile/app/admin/index.tsx`: add to `modules`: `{ key: 'users', route: '/admin/users', title: 'Usuarios', description: 'Cuentas de acceso (admin, supervisor, encargado)', icon: 'person-circle', color: colors.violet, available: true, requiresCapability: CAPABILITIES.WORKERS_MANAGE }` (absolute `route`, explicit `available: true`).
      Depends on item 14.
      Files: `apps/mobile/app/admin/_layout.tsx`, `apps/mobile/src/components/admin/AdminDrawerContent.tsx`, `apps/mobile/app/admin/index.tsx`
      Verify: `cd apps/mobile && npx tsc --noEmit` compiles; the "Usuarios" item appears for admins with `workers.manage`.

- [ ] 16. Full-tree verification gate.
      Run the monorepo build, tests, and lint; fix any regressions introduced by this feature (do not touch unrelated uncommitted work). Confirm `temp_password`/email appear in NO log statements across the touched files.
      Files: none (verification)
      Verify: from repo root, `npm run build` (turbo build) succeeds; `npm test` (turbo test) passes — at minimum `packages/shared` Vitest green; `npm run lint` clean for touched packages. `deno check` of `supabase/functions/workers/index.ts` and `_shared/password.ts` passes if Deno is available.

## Open assumptions / gaps (reasonable defaults taken)
- No Edge Function test runner exists in the repo; item 8 integration coverage is best-effort against Supabase local and may be skipped if the local stack is not runnable (per design §11). Password-generator correctness is guaranteed by construction (item 3) and, if desired later, can be unit-tested by importing the pure module into Vitest.
- `EMAIL_RE` is copied from `supabase/functions/organizations/index.ts` to keep one validation convention; implementer should read that regex rather than invent one.
- Credential UI is a reusable component within each app (web and mobile) shared by the create and reset flows, matching the `platform/page.tsx` amber/emerald pattern on web and an RN `Modal` with a Copy button on mobile.
