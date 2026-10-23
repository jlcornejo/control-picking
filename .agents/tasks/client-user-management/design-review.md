# Design Review — client-user-management

Reviewed: `/.agents/tasks/client-user-management/design.md` (tenant admin creates / lists / edits / deactivates / resets LOGIN users for their own org, web + mobile, no SQL).

Method: read the design fresh, then verified every cited code path against the real repo. This is the third review round; the design has an embedded §13 answering prior rounds. I re-verified those resolutions rather than trusting them.

## Verdict summary

The design is thorough, concrete, and — for almost every claim — backed by a cited file that I confirmed. The data model, the handlePost extension, the new reset endpoint, the RBAC guards, the tenant-isolation mechanism, the UI placement, `must_change_password` handling, and the no-secrets-in-logs rule are all resolved against real code paths.

I found one MEDIUM accuracy problem (a stale RLS policy definition cited as "verified") and a few NITs. The MEDIUM does not change the design's security conclusions, but the task explicitly asks me to flag any claim not backed by the cited file, and this claim quotes a policy body that has since been replaced by a later migration. Per the mechanical rule, one MEDIUM ⇒ CHANGES_REQUESTED.

---

## Findings

### 1. MEDIUM — §3 and §4.3 cite a stale `admin_all_workers` policy body as "verified"

Both §3 ("verificado en `20260829000007_multitenant_rls.sql`") and §4.3 quote the RLS policy as:

```
admin_all_workers: is_platform_admin() OR (is_admin() AND organization_id = current_org_id())
```

That body is the **original** policy. It was later **dropped and recreated** in `supabase/migrations/20260927000003_rbac_phase_b_rls.sql`, and the effective policy today is:

```sql
CREATE POLICY "admin_all_workers" ON workers
  FOR ALL USING (
    is_platform_admin()
    OR (is_admin() AND has_permission('workers.manage') AND organization_id = current_org_id())
  );
```

So the current policy also requires `has_permission('workers.manage')`. The design cites `20260829000007` as the source of truth and never mentions `20260927000003`, which overrides it.

Why this matters beyond pedantry:
- The design's anti-degradation argument in §4.3 ("la RLS `admin_all_workers` permite a un admin de la org actualizar cualquier fila a cualquier valor, incluido `role='worker'`") is still **true** under the current policy — `has_permission` does not restrict which columns/values an admin may write, only whether admins with a restrictive profile pass at all. So the security conclusion holds.
- But the design presents a policy body it labels "verified" that does not match the deployed schema. An implementer reading §3/§4.3 and then reading the actual DB will find a mismatch and lose confidence in the other "verified" claims. The task instruction is explicit: flag any claim not backed by its cited file.

CONCRETE fix: update §3 and §4.3 to cite `20260927000003_rbac_phase_b_rls.sql` as the current definition and quote the real body (with `has_permission('workers.manage')`). Add one sentence: the extra `has_permission` conjunct does not weaken the anti-degradation argument, because it gates admin access wholesale and never restricts the `role` value an admin may set; therefore the server-side guard in `handlePut` is still required.

### 2. NIT — §4.3 anti-degradation guard: resolve order of `requireOrg` vs. the existing `handlePut` update

§4.3 says the role-change guard resolves the target row with the **service client**, calls `requireOrg(req, target.organization_id)`, and rejects `role='worker'` when `auth_user_id` is not null. But the existing `handlePut` (verified in `workers/index.ts`) builds an `updates` object and runs a single `supabase.from('workers').update(updates).eq('id', workerId)` with the **request (RLS) client** — it never resolves the row first. The design does not state where the new service-client lookup sits relative to the existing update, and the lookup only happens "when `body.role === 'worker'`". That is fine, but the design should be explicit that the guard block runs **before** the `update(...)` and only when `body.role === 'worker'`, so an implementer does not add an unconditional service-client read (an extra round-trip on every edit) or run it after the update.

CONCRETE fix: in §4.3, add: "The guard executes only inside the `if (body.role !== undefined)` branch, specifically when `body.role === 'worker'`, and before the existing `update(updates)` call. For any other role value no service-client lookup is performed and `handlePut` behaves as today."

### 3. NIT — §4.4 crew-debt check: unspecified DB-error branch

§4.4 decides to add `requirePermission('workers.manage')` to `handlePatchStatus` (today it only calls `requireRole(['admin'])` — verified). Good. But §4.4 also adds a crew-debt check that resolves `crews WHERE crew_lead_id = :id` using the request (RLS) client, and claims RLS already scopes it to the org. I confirmed `20260829000011_crew_lead_rls.sql` exposes crews to admins of the org, so the scoping holds. However, the design does not specify what happens when `crews` or the second `settlements` query returns a DB error (vs. zero rows). `handlePatchStatus` today has no error branch for the count query.

CONCRETE fix: specify that a DB error on either the crews lookup or the crew-settlements count returns `VALIDATION_ERROR` 400 (consistent with the existing list/query error pattern), and that a null/zero count proceeds to the normal status update. One sentence in §4.4 and in the §9 "Desactivar" row.

### 4. NIT — §6 `generateTempPassword` length floor vs. unknown remote policy

§6 sets default length 14 (floor 12) and guarantees one char from each of 4 classes. Verified `config.toml` local policy is `minimum_password_length = 6`, `password_requirements = ""`, and the design correctly notes the remote policy is unknown. The generator is robust by construction. No correctness problem. One small residual: §5 step 6 maps a failed `updateUserById` to a 400 with "el mensaje del provider", and §4.1 maps a failed `createUser` similarly. If an operator ever lowers `len` below the remote `minimum_password_length`, the failure surfaces only at runtime. Already mitigated by the floor of 12.

CONCRETE fix (optional hardening, keep as NIT): add a one-line note in §6 that `len` must stay ≥ the highest `minimum_password_length` any target project uses, and that 12 is chosen as a safe floor. No code change required.

---

## Verified Assumptions (checked against real code)

- (a) **Data model** — A login user IS a `workers` row with non-null `auth_user_id`. Confirmed: `organizations/index.ts handleCreate` creates exactly this (`auth.admin.createUser` → insert into `workers` with `role:'admin'`, `auth_user_id`, `must_change_password:true`, `status:'active'`). `workers.must_change_password` and `auth_user_id` exist per the cited migrations. No separate users table. ✔
- (a) **Neither Workers screen filters today** — Confirmed. `apps/web/.../workers/page.tsx` query is `select('id, full_name, national_id, phone, role, status, qr_badge_url, created_at').order('full_name')` with no filter; `apps/mobile/app/admin/workers.tsx` query is `select('id, full_name, national_id, phone, role, status, qr_badge_url, permission_profile_id').order('full_name')` with no filter. The design's §13 correction (reverting the earlier false "already filters" claim and choosing Option A to add `.is('auth_user_id', null)`) is accurate. ✔
- (b) **handlePost needs extension** — Confirmed. Today: `requireRole(['admin'])` + `requirePermission('workers.manage')`; creates auth user only `if (body.email && body.password)`; inserts with `organization_id = getOrgId(req)`, generates `qr_badge_url`; does **not** set `must_change_password`; omits `status` (relies on `entity_status` default). All matches §4.1. The claim that no caller invokes the Edge POST (web/mobile use direct supabase-js insert) is consistent with the web screen I read (`supabase.from('workers').insert(...)`). ✔
- (c) **No admin-initiated reset endpoint exists** — Confirmed. `auth/index.ts` has only `login`, `refresh`, `logout`, `change-password`; `change-password` updates the caller's own password via `svc.auth.admin.updateUserById(user.id, ...)`. `workers/index.ts` has no reset. The new `POST /workers/:id/reset-password` and the router placement (before the `switch`, alongside `status`/`badge` sub-resources) match the real router. `updateUserById` availability is confirmed by its use in `handleChangePassword`. ✔
- (d) **RBAC guards cited by name** — Confirmed in `_shared/auth.ts`: `requireRole` (platform-admin bypass, 403 otherwise), `requirePermission` (absent `permissions` claim = unrestricted; else must include capability), `getOrgId` (reads `org_id` claim only), `requireOrg` (platform bypass, `ORG_CONTEXT_REQUIRED` if no claim, `CROSS_TENANT_FORBIDDEN` if mismatch/null). `handlePatchStatus` today lacks `requirePermission` — the design correctly flags this and adds it. ✔
- (e) **Tenant isolation via JWT, never body** — Confirmed. `getOrgId` decodes the claim; `handlePost` already uses `organization_id = getOrgId(req)`. The reset flow uses `requireOrg(req, target.organization_id)` on a service-client-resolved row, mirroring `handlePatchBranding`'s cross-tenant check. ✔
- (f) **Web + mobile UI placement** — Confirmed. Web Sidebar `navLinks` structure matches §7 (crew_lead branch; Supervisores NOT role-gated; `/settings` gated by `role === 'admin'`). `UserCog` is imported; `ShieldCheck` is NOT imported in Sidebar.tsx (only in platform components) — the design's instruction to add it is correct. Mobile `AdminModule` interface requires `available` and the grid items all set `available: true` with `requiresCapability` — matches §8. The platform credential UX (amber "no se volverá a mostrar" box) exists in `platform/page.tsx`. ✔
- (g) **must_change_password on create and reset** — Confirmed as a real column and the mechanism works: `auth/handleLogin` returns `must_change_password`, and `change-password` clears it. Create sets `true` (new), reset sets `true` (new). ✔
- (h) **Temp passwords / emails never logged** — Design states no secret logging and that the tenant reset does NOT write to `platform_audit_log` (platform-only). Confirmed `logPlatformAction` lives in `organizations/index.ts` and is tied to `platform_admins`; a tenant admin has no row there, so reusing it would be wrong — the design's choice to skip it is correct. ✔
- **crew_lead CAN be a payee** — Confirmed. `20260829000012_settlement_payee_type.sql` adds `payee_type` ('worker'|'crew') and `crew_id`; `20260829000010_create_crews.sql` defines `crews.crew_lead_id` as a worker (role crew_lead). So deactivating a crew_lead can leave crew-level pending debt keyed by `crew_id`, which the current `handlePatchStatus` (only `worker_id`) misses. The design's §4.4 extension is justified. ✔
- **z.enum precedent** — Confirmed. `createPermissionProfileSchema` casts `ALL_CAPABILITIES as [string, ...string[]]`; `createOrganizationSchema` uses literal `z.enum(['trial','active','suspended','cancelled'])`. The design's `LOGIN_USER_ROLES = [...] as const` + `z.enum(LOGIN_USER_ROLES)` is the correct, tsc-strict-safe form. `WorkerRole` values are exactly `admin`/`supervisor`/`crew_lead`/`worker`. ✔
- **expo-clipboard not installed** — Confirmed: no match in `apps/mobile/package.json`. The design correctly lists it as a new dependency requiring a dev-client rebuild. ✔

## Unverified / Wrong Assumptions

- **WRONG (Finding 1): the quoted `admin_all_workers` policy body.** The design cites `20260829000007_multitenant_rls.sql` and quotes `is_platform_admin() OR (is_admin() AND organization_id = current_org_id())`. That body was superseded by `20260927000003_rbac_phase_b_rls.sql`, which adds `has_permission('workers.manage')`. The security argument survives, but the "verified" policy text is stale. See Finding 1.
- **UNVERIFIED (acceptable): remote Supabase Auth password policy.** The design explicitly states the remote project's `password_requirements` is project config, not in the repo, and designs the generator to be robust regardless. I could not verify the remote setting either (it is not in the repo). The design's handling is the correct response to this unknown. Not a finding.
- **UNVERIFIED (minor): the exact mobile `_layout.tsx` and `AdminDrawerContent.tsx` item shapes.** I confirmed `apps/mobile/app/admin/index.tsx`'s `AdminModule` shape and that items use `requiresCapability: CAPABILITIES.WORKERS_MANAGE`. I did not open `_layout.tsx` / `AdminDrawerContent.tsx` line-by-line; the design's described additions mirror existing master-section items and are low-risk. Not raised as a finding.

---

## Verdict

1 MEDIUM, 0 HIGH, 3 NITs ⇒ **CHANGES_REQUESTED**.

The MEDIUM is an accuracy fix (cite the current RLS migration, not the superseded one) that does not require redesign. Once §3/§4.3 cite `20260927000003` and the NITs are addressed, this design is implementation-ready.
