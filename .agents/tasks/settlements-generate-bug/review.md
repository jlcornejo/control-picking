# Fix for `POST /settlements/generate` returning zero production

`handleGenerate` was embedding the picking worker with a non-existent FK hint (`workers!picking_records_worker_id_fkey`). `picking_records` has two FKs to `workers` (`worker_id` and `recorded_by`), so PostgREST needs a hint to disambiguate and returned `PGRST200` for the wrong name. The handler only destructured `data` and ignored `error`, so `records` came back `null`, the aggregation loop never ran, and the endpoint silently returned `settlements:[]` with zero totals. The fix corrects the hint to `workers!fk_picking_worker_org`, captures and propagates the error, and replaces the fragile 3-level nested crew-mode embed with two simple separate queries (org default + per-field override). The same fix is applied to `handleCrewGenerate`, and a second latent ambiguous-embed bug (`settlements` has two FKs to `crews`) was fixed with an explicit `crews!fk_settlements_crew_org` hint so crew-level settlements actually get created.

Watch for: nothing blocking. The evidence is complete (before/after curl JSON, two DB rows totaling 7980, dedup, crew-mode no-regression, tenant isolation). A couple of non-blocking observations below (confidence: possible) are worth noting but don't gate the fix.

**Verdict**: APPROVED

## High-level view

The root-cause fix is correct and well-evidenced. The before state (`settlements:[]`, total 0) and the after state (two `payee_type='worker'` settlements — Pedro 4560, Rosa 3420, `status='pending'`, period 2026-10-20..2026-10-22, total 7980, box 21) are both captured against the local DB, and the two persisted rows match the expected per-worker math (12×380 and 9×380). The silent-failure mechanism is now closed: both read paths capture `recErr` and return a 400 instead of swallowing it.

Robustness for a normal tenant holds in both directions. Crew mode off → individual settlements (the repro case). Crew mode on + worker has a crew → one crew-level settlement aggregating both workers (7980), verified by an end-to-end setup that was reverted afterward. The crew-mode resolution was deliberately moved off the brittle nested embed onto two flat queries — org default from `organizations` keyed by the JWT `orgId`, per-field override from `fields` via `in(fieldIds)` — with the effective rule `field.crew_mode_enabled ?? org.crew_mode_enabled` preserved exactly.

Tenant isolation is intact: `orgId` still comes from `getOrgId(req)` (the JWT), inserts stamp `organization_id: orgId`, and reads run under RLS — confirmed by the bonus check where 9 of 11 records in the period belonged to another org and were excluded. Immutability and dedup are unchanged: only `status='pending'` rows are inserted, `maybeSingle` skips existing settlements per period, and the `original_record_id is null` filter is preserved. The second idempotent call returned `settlements:[]` with the DB still holding exactly two rows.

Scope is clean. The settlements file is the only functional change relevant to this bug; no debug logging remains. The working tree carries many other modified files, but those belong to parallel tasks (client-user-management, mobile-admin-parity, etc.) and are out of scope. The `packages/shared` change is additive login-user validation schemas — the settlement/picking math module is untouched.

<details>
<summary>Issues (2)</summary>

1. **Org-not-found handling (possible)** — if `organizations` has no row for the JWT `orgId`, `.single()` errors and `handleGenerate` returns a 400 instead of falling back to `crew_mode=false`. Benign for a provisioned tenant; worth a glance only if orgs can ever lack a row.
2. **`handleCrewGenerate` not exercised by evidence (possible)** — the crew-generate path got the identical fix by inspection but has no dedicated curl/DB evidence of its own. Covered transitively by the shared logic and the crew-mode no-regression test, so non-blocking.

</details>

<details>
<summary>Details</summary>

## Root-cause fix and the silent-failure mechanism

The fix targets the exact failure described in the plan. The old hint `picking_records_worker_id_fkey` does not exist; the real FK is `fk_picking_worker_org`. Because the old code wrote `const { data: records } = ...` with no `error` capture, a `PGRST200` was invisible — `records` was `null`, the loop body never executed, and the 201 response reported zeros. The new code destructures `error: recErr` and returns `error('VALIDATION_ERROR', recErr.message, 400)` before the loop, so a future embed/hint mismatch surfaces as a 400 rather than a silent zero. The before/after curl evidence (`settlements:[]`/total 0 → two settlements/total 7980) and the two persisted rows (4560.00, 3420.00, `payee_type='worker'`, `pending`) directly confirm the fix for the reproduction data.

## Crew-mode resolution moved off the nested embed

Rather than relying on `block:blocks(field:fields(crew_mode_enabled, organization:organizations(...)))`, the effective crew mode is now computed from two flat queries: the org default (`organizations.crew_mode_enabled` by `orgId`, defaulting to `false` when null) and a per-field map (`fields.crew_mode_enabled` for the distinct `field_id`s in the period). The loop applies `fieldMode === null || fieldMode === undefined ? orgDefaultCrewMode : fieldMode`, which is the documented `field ?? org` precedence. This is both the robustness improvement the task asked for and the reason crew-mode resolution stays correct for org-level and field-level config. The no-regression test (crew created, `crew_id` assigned to both workers, field `crew_mode_enabled=true`) produced exactly one `payee_type='crew'` settlement aggregating 7980, then was reverted.

## Second latent bug: ambiguous `crews` embed on insert

The crew-settlement insert originally used `.select('*, crews(name, crew_lead_id)')`, but `settlements` has two FKs to `crews`, so PostgREST returns `PGRST201` (ambiguous). Combined with the `if (!sErr && settlement)` guard, the crew settlement was never pushed and never created — which would have regressed the crew-mode-on behavior the task requires preserving. The explicit `crews!fk_settlements_crew_org` hint resolves it, and the verification notes that without this fix the same crew-mode test returned `settlements:[]`/0 rows. Good catch; this is exactly the kind of latent defect the separate-query refactor was meant to flush out.

## Org lookup failure mode

`handleGenerate` and `handleCrewGenerate` both do `.eq('id', orgId).single()` on `organizations` and return a 400 on error. For any provisioned tenant the row exists, so this is fine in practice. The only edge is a JWT carrying an `orgId` with no matching `organizations` row — there the request fails closed with a 400 rather than defaulting `orgDefaultCrewMode` to `false`. Failing closed is defensible; flagging only as a possible nicety, not a blocker.

## Tenant isolation, immutability, dedup

`orgId` is derived from the JWT via `getOrgId(req)`; both inserts stamp `organization_id: orgId`; reads run under the same RLS-bound client. The bonus isolation check (9 of 11 period records belonged to another org and were excluded) confirms cross-tenant leakage is not possible through this path. Immutability holds: only `status='pending'` is inserted, the `original_record_id is null` filter excludes correction records, and paid settlements are never touched. Dedup via `maybeSingle` on (worker/crew, payee_type, period) is unchanged, and the second identical call returned an empty settlements array with the DB still at two rows.

## Scope and cleanliness

`supabase/functions/settlements/index.ts` is the only functional file tied to this fix, and it contains no `console.*` or added debug lines. The broader working tree (`apps/mobile/*`, `apps/web/*`, `supabase/functions/workers/index.ts`, `packages/shared/src/validation/index.ts`, build config) is from other in-flight tasks and is out of scope here. The `packages/shared` edit adds `createLoginUserSchema`/`updateLoginUserSchema` validation — it does not touch the `pickingPayableBase`/`pickingSubtotal` math, so the "shared math unchanged" constraint holds.

</details>

<details>
<summary>File map</summary>

- `supabase/functions/settlements/index.ts` — corrected worker FK hint (`fk_picking_worker_org`) and block hint (`fk_picking_block_org`) in both `handleGenerate` and `handleCrewGenerate`; now captures/propagates read error; crew-mode resolved via separate `organizations` + `fields` queries; crew-settlement insert embed disambiguated with `crews!fk_settlements_crew_org`.

Other working-tree changes (`apps/mobile/*`, `apps/web/*`, `supabase/functions/workers/index.ts`, `packages/shared/src/validation/index.ts`, build config) belong to parallel tasks and are outside this review's scope.

</details>
