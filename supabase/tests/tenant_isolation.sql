-- ============================================================
-- TEST DE AISLAMIENTO MULTI-TENANT (RLS)
-- ============================================================
-- Verifica que:
--   1. Un admin solo ve datos de SU organización.
--   2. El cruce entre tenants está bloqueado por RLS.
--   3. El platform admin ve todo (bypass is_platform_admin()).
--
-- Uso (contra Supabase local, tras `supabase db reset`):
--   docker cp supabase/tests/tenant_isolation.sql <db_container>:/tmp/t.sql
--   docker exec <db_container> psql -U postgres -f /tmp/t.sql
--
-- Nota: resuelve los org ids por slug para no depender de UUIDs fijos.
--       Requiere el seed (org 'default' + 'sur-berries' con datos).
-- ============================================================

\pset pager off

-- Resolver org ids reales por slug
SELECT id AS org_default    FROM organizations WHERE slug = 'default'     \gset
SELECT id AS org_surberries FROM organizations WHERE slug = 'sur-berries' \gset

-- ---- Contexto 1: ADMIN de org 'default' ----
-- Se usa set_config() (evalúa expresiones) en vez de SET LOCAL (solo literales).
BEGIN;
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', json_build_object(
  'sub', '00000000-0000-0000-0000-0000000000d1',
  'app_role', 'admin',
  'org_id', :'org_default',
  'is_platform_admin', false
)::text, true);
SELECT 'admin@default: solo su org, sin fugas' AS assertion,
       (SELECT count(*) FROM workers WHERE organization_id <> :'org_default') = 0 AS pass;
ROLLBACK;

-- ---- Contexto 2: ADMIN de org 'sur-berries' ----
BEGIN;
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', json_build_object(
  'sub', '00000000-0000-0000-0000-0000000000d2',
  'app_role', 'admin',
  'org_id', :'org_surberries',
  'is_platform_admin', false
)::text, true);
SELECT 'admin@sur-berries: no ve datos de default' AS assertion,
       (SELECT count(*) FROM workers WHERE organization_id = :'org_default') = 0 AS pass;
ROLLBACK;

-- ---- Contexto 3: PLATFORM ADMIN (bypass) ----
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-0000000000f0","is_platform_admin":true}';
SELECT 'platform_admin: ve ambas orgs' AS assertion,
       (SELECT count(DISTINCT organization_id) FROM workers) >= 2 AS pass;
ROLLBACK;
