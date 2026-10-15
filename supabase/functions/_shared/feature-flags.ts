/**
 * Feature flag resolution for Edge Functions (backend gating, defense in depth).
 *
 * Deno cannot import @fundo360/shared, so the resolution logic is REPLICATED
 * here from `resolveFeatureFlag` in packages/shared/src/types/index.ts.
 * KEEP IN SYNC with shared: a per-tenant override (true/false) wins over the
 * global catalog value; otherwise fall back to the global value, defaulting to
 * false when it is unset.
 */

/** Pure replica of @fundo360/shared `resolveFeatureFlag`. Keep in sync. */
export function resolveFeatureFlag(
  globalEnabled?: boolean | null,
  orgOverride?: boolean | null,
): boolean {
  if (orgOverride === true || orgOverride === false) return orgOverride;
  return globalEnabled ?? false;
}

/**
 * Resolve the EFFECTIVE value of a feature flag for the caller's organization,
 * reading both tables with the authenticated client (RLS allows reading the
 * global catalog and the org's own overrides). On any read error the flag is
 * treated as disabled (fail closed), consistent with design §5.3.
 *
 * @param client authenticated Supabase client (from getUser)
 * @param _orgId caller org id (RLS already scopes the override row; kept for
 *               signature clarity and future service-role usage)
 * @param key    flag key, e.g. 'dispatch_guides'
 */
export async function resolveFlagForOrg(
  // deno-lint-ignore no-explicit-any
  client: any,
  _orgId: string | null,
  key: string,
): Promise<boolean> {
  try {
    const { data: globalFlag } = await client
      .from('platform_feature_flags')
      .select('enabled')
      .eq('key', key)
      .maybeSingle();

    const { data: override } = await client
      .from('organization_feature_flags')
      .select('enabled')
      .eq('flag_key', key)
      .maybeSingle();

    return resolveFeatureFlag(
      (globalFlag?.enabled as boolean | null | undefined) ?? null,
      (override?.enabled as boolean | null | undefined) ?? null,
    );
  } catch {
    // Fail closed: if flag resolution fails, deny the write.
    return false;
  }
}
