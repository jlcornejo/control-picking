# Verification — client-user-management

Feature: Gestión de Usuarios de login por el admin del cliente (sección "Usuarios" en web y móvil, Edge Function hardening, generador de contraseña temporal). Implementado por primera vez (no existía `review.json`).

## 1. Commands run + output tails

### packages/shared — Vitest (schemas + password generator)
```
$ npx vitest run packages/shared
 ✓ packages/shared/src/types/dispatch.test.ts (10 tests)
 ✓ packages/shared/src/types/picking-payment.test.ts (16 tests)
 ✓ packages/shared/src/types/payment-evidence.test.ts (6 tests)
 ✓ packages/shared/src/validation/login-user.test.ts (13 tests)
 ✓ packages/shared/src/validation/temp-password.test.ts (5 tests)
 Test Files  5 passed (5)
      Tests  50 passed (50)
```
New tests:
- `login-user.test.ts`: `createLoginUserSchema` (valid admin/supervisor/crew_lead, rejects empty/>150 name, invalid email, `worker` role, out-of-set role) and `updateLoginUserSchema` (all-optional, rejects `worker`, rejects empty name), plus `LOGIN_USER_ROLES` excludes `worker`.
- `temp-password.test.ts` (design §6/§11 guarantees): over 1000 samples each password has length ≥ 12, ≥ 1 lower + 1 upper + 1 digit + 1 symbol, and NO ambiguous char (`0 O o 1 l I`); default length 14; floor to 12 for `len<12`; honors longer length; two calls differ.

### packages/shared — tsc
```
$ (cd packages/shared && npx tsc --noEmit)   # exit 0, no output
```
Note: shared's tsc also type-checks `supabase/functions/_shared/password.ts` because the Vitest spec imports it. Under the repo's strict `noUncheckedIndexedAccess`, indexed access (`buf[0]`, `alphabet[i]`, Fisher-Yates swap) required non-null assertions / an explicit swap — applied without changing behavior.

### apps/web — tsc + build
```
$ (cd apps/web && npx tsc --noEmit)   # exit 0, no output
$ (cd apps/web && npx next build)      # exit 0
...
├ ƒ /usuarios                             6.6 kB         247 kB   <-- nueva ruta
├ ƒ /workers                             17.4 kB         256 kB
 ✓ Generating static pages (22/22)
```

### apps/mobile — tsc + release bundle gate
```
$ (cd apps/mobile && npx tsc --noEmit)   # exit 0, no output
```
Pre-existing error isolation: before the type fix, mobile tsc reported exactly one error —
`app/admin/_layout.tsx(15,23): error TS7006: Parameter 'props' implicitly has an 'any' type.`
This was proven PRE-EXISTING (not caused by this feature) by stashing ALL feature changes and moving `users.tsx` aside, then running `npx tsc --noEmit` on the clean tree: the identical error still appeared. It stems from the in-flight `@react-navigation/drawer` upgrade not inferring the `drawerContent` callback param. Fixed minimally and behavior-preserving by annotating that param with `DrawerContentComponentProps` (type-only import) in `_layout.tsx`, a file this feature already edits. The pending drawer deps in the root `package.json`/lockfile were NOT touched.

```
$ (cd apps/mobile && npx expo export:embed --eager --platform android --dev false \
     --entry-file node_modules/expo-router/entry.js --bundle-output /tmp/fundo360-usuarios.bundle)
Android Bundled 7305ms node_modules/expo-router/entry.js (2003 modules)
Writing bundle output to: /tmp/fundo360-usuarios.bundle
Done writing bundle output      # exit 0
```

### Lint
```
$ npm run lint
@fundo360/shared:lint  -> ESLint v9 "couldn't find an eslint.config.(js|mjs|cjs)" (no flat config present)
@fundo360/web:lint     -> `next lint` deprecated, prompts interactively (no eslint config present)
@fundo360/mobile:lint  -> runs clean
```
`ls packages/shared/eslint.config.* apps/web/eslint.config.* ...` → no matches: no package has an ESLint config, so the shared/web `lint` scripts are broken independent of this change (pre-existing environmental breakage). The mobile lint (the only working one) was run directly on the touched/new files:
```
$ (cd apps/mobile && npx eslint app/admin/users.tsx app/admin/_layout.tsx app/admin/index.tsx)
app/admin/index.tsx 73:64 warning Unexpected any (m.route as any)   <- pre-existing line
app/admin/index.tsx 77:39 warning Unexpected any (m.icon as any)    <- pre-existing line
✖ 2 problems (0 errors, 2 warnings)
```
Both warnings are on pre-existing render code (`m.route as any`, `m.icon as any`), not on the `users` module entry this feature added. Net: **0 new lint errors, 0 new lint warnings** from this feature.

## 2. Files changed

Shared:
- `packages/shared/src/validation/index.ts` — add `LOGIN_USER_ROLES`, `createLoginUserSchema`, `updateLoginUserSchema` (+ exported input types). String-literal `as const` tuple for `z.enum` (strict-safe).
- `packages/shared/src/validation/login-user.test.ts` — NEW schema tests.
- `packages/shared/src/validation/temp-password.test.ts` — NEW generator class-guarantee tests.

Backend (Edge):
- `supabase/functions/_shared/password.ts` — NEW `generateTempPassword` (CSPRNG, modulo-rejection, 4-class guarantee, no ambiguous chars, Fisher-Yates, floor 12).
- `supabase/functions/workers/index.ts` — `handlePost` login-user flow via `create_login===true` (server-generated temp password, `must_change_password:true`, `status` omitted, compensation on insert failure, duplicate→409, legacy email&&password removed); `handlePut` anti-degradation guard; `handlePatchStatus` adds `requirePermission` + crew-debt check; NEW `POST /workers/:id/reset-password` route + `handleResetPassword`; router comment updated.

Web:
- `apps/web/src/app/(dashboard)/usuarios/page.tsx` — NEW page (create/list/edit/deactivate/reset; credential view shown once; list filters `auth_user_id IS NOT NULL AND role != 'worker'`; all role/status mutations via `functions.invoke`).
- `apps/web/src/components/ui/Sidebar.tsx` — add `ShieldCheck` import + admin-only "Usuarios" link (explicit, separate from Supervisores).
- `apps/web/src/app/(dashboard)/workers/page.tsx` — add `.is('auth_user_id', null)` to Trabajadores list query (one clause).

Mobile:
- `apps/mobile/app/admin/users.tsx` — NEW screen mirroring web, with Copy button via `expo-clipboard`.
- `apps/mobile/app/admin/_layout.tsx` — register `<Drawer.Screen name="users" .../>`; type the `drawerContent` param (pre-existing tsc fix).
- `apps/mobile/src/components/admin/AdminDrawerContent.tsx` — add "Usuarios" drawer item (gated by `WORKERS_MANAGE`).
- `apps/mobile/app/admin/index.tsx` — add "Usuarios" grid module (`available:true`, `WORKERS_MANAGE`).
- `apps/mobile/app/admin/workers.tsx` — add `.is('auth_user_id', null)` to Trabajadores list query (one clause).
- `apps/mobile/package.json` (+ root lockfile) — add `expo-clipboard ~8.0.8` (via `npx expo install`, SDK-54 aligned). Pending drawer deps (`@react-navigation/drawer 7.13.0`, `react-native-worklets`) left untouched.

No new DB migrations.

## 3. RBAC + tenant isolation (UI and Edge) per operation

The UI is NEVER the security barrier; it only hides the "Usuarios" section from non-admins (web Sidebar `role==='admin'`; mobile drawer `worker.role!=='admin'` guard + `WORKERS_MANAGE` capability). The real enforcement is server-side. All four operations invoke the `workers` Edge Function (no direct table writes for role/status), and every handler applies the same chain from `_shared/auth.ts`:

- **Create** (`POST /workers`, `create_login:true` → `handlePost`): `requireRole(req,['admin'])` (supervisor/crew_lead → 403) + `requirePermission(req,'workers.manage')` + `getOrgId(req)` (the inserted `organization_id` comes ONLY from the JWT claim; never from body; missing → `ORG_CONTEXT_REQUIRED` 403 and the just-created auth user is compensated/deleted). `role==='worker'` rejected 422; invalid email 422; duplicate email 409.
- **Edit** (`PUT /workers/:id` → `handlePut`): `requireRole(['admin'])` + `requirePermission('workers.manage')`. Anti-degradation guard: when `body.role==='worker'`, the target row is resolved with the service client and `requireOrg(req, target.organization_id)` is applied FIRST (cross-org → `CROSS_TENANT_FORBIDDEN` 403), then if `target.auth_user_id` is not null the request is rejected 422 ("No se puede convertir un usuario con acceso en trabajador; desactívelo en su lugar"). A `role='worker'` on a row with NULL `auth_user_id` is still allowed (Trabajadores unaffected).
- **Deactivate** (`PATCH /workers/:id/status` → `handlePatchStatus`): `requireRole(['admin'])` + `requirePermission('workers.manage')` (added by this feature to match the chain). Runs with the request RLS client, so the `settlements`/`crews` reads and the final `update` are confined to the admin's org by the `admin_all_workers` RLS policy — a supervisor gets 403 before any read, and an admin can only ever touch rows of their own org. Deactivation guard: worker-level pending/partial settlements → `WORKER_HAS_PENDING_DEBT` 409; AND crew-level — resolve `crews WHERE crew_lead_id=:id`, then `settlements WHERE payee_type='crew' AND crew_id IN (...) AND status IN ('pending','partial')`; >0 → 409; DB error on either → `VALIDATION_ERROR` 400. Activation never triggers the guard.
- **Reset** (`POST /workers/:id/reset-password` → `handleResetPassword`): `requireRole(['admin'])` + `requirePermission('workers.manage')` + `getOrgId`. The target is resolved with the service client (needed to read `auth_user_id` and act on Auth, which bypasses RLS), so tenant isolation is enforced IN CODE via `requireOrg(req, target.organization_id)` — an admin of org A resetting a worker of org B gets `CROSS_TENANT_FORBIDDEN` 403. Missing row → 404; `auth_user_id` null → 422; provider error → 400. On success `must_change_password` is re-set and `{ temp_password }` is returned once. No `platform_audit_log` write (actor is a tenant admin, not platform admin).

Why a supervisor cannot reach any operation: `requireRole(['admin'])` is the first check in all four handlers → 403 for `app_role==='supervisor'|'crew_lead'`. Why they cannot target another org: `organization_id` is always taken from the JWT (`getOrgId`) on create, and on service-role paths (edit-to-worker guard, reset) the resolved row's org is checked with `requireOrg`; the RLS-client paths (list, edit, status) are confined by the `admin_all_workers` policy (`is_admin() AND has_permission('workers.manage') AND organization_id = current_org_id()`).

Anti-degradation guard — confirmed working as designed: inside the `body.role!==undefined` branch, BEFORE the `update(updates)`, only when `role==='worker'`; resolves the row with the service client, applies `requireOrg`, and 422s if `auth_user_id` is set. A login user therefore can never be silently turned into an orphaned `worker` login.

Crew-debt deactivation guard — confirmed working as designed: the second check in `handlePatchStatus` only fires on `status==='inactive'`; it is inocuous for admin/supervisor (they lead no crews → 0 rows) and blocks deactivating a `crew_lead` whose crew still has unpaid `payee_type='crew'` settlements.

Secrets: `temp_password` and `email` are never logged in any touched file (grepped); the temp password is returned exactly once in the create/reset responses and shown once in the UI credential view (web amber box / mobile modal with Copy button).

## 4. Notes / not verified
- On-device behavior NOT claimed; relied on `tsc` + Android release bundle gate + web build + code reasoning, per instructions. The orchestrator rebuilds the APK.
- Edge integration tests (design §8/§11) were not run: the repo has no Edge test harness and Supabase local was not started in this run. The Edge logic is covered by reasoning + the pure `generateTempPassword` Vitest tests + the web/mobile build gates that exercise the call sites.
- `apps/mobile/app/admin/users.tsx` uses `expo-clipboard` (native module) — the dev client must be rebuilt (Xcode/EAS) for the Copy button; not a build blocker here.
