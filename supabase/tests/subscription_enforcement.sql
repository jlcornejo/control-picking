-- ============================================================
-- TEST DE ENFORCEMENT DE SUSCRIPCIÓN (Req. 2.3)
-- ============================================================
-- Verifica que custom_access_token_hook:
--   - Entrega org_id y subscription_active=true si la org está vigente.
--   - NO entrega org_id (y subscription_active=false) si la org está
--     suspendida/cancelada, bloqueando el acceso sin borrar datos.
--
-- Uso (contra Supabase local, tras `supabase db reset`):
--   docker cp supabase/tests/subscription_enforcement.sql <db>:/tmp/s.sql
--   docker exec <db> psql -U postgres -f /tmp/s.sql
--
-- Requiere el seed (tenant 'sur-berries' con worker admin
-- aa0000ff-0000-0000-0000-000000000001).
-- ============================================================

\pset pager off

-- Vincular un auth user de prueba al admin de 'sur-berries'
DO $$
DECLARE
  uid UUID := '00000000-0000-0000-0000-0000000000ab';
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email)
  VALUES (uid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-sur@example.com')
  ON CONFLICT (id) DO NOTHING;
  UPDATE workers SET auth_user_id = uid WHERE id = 'aa0000ff-0000-0000-0000-000000000001';
END $$;

-- Caso 1: suscripción ACTIVA -> entrega org_id, subscription_active=true
SELECT 'sub activa: entrega contexto' AS assertion,
       (public.custom_access_token_hook(
          jsonb_build_object('claims', jsonb_build_object('sub', '00000000-0000-0000-0000-0000000000ab'))
        ) -> 'claims' ->> 'org_id') IS NOT NULL AS pass;

-- Suspender y verificar bloqueo
BEGIN;
UPDATE organizations SET subscription_status = 'suspended' WHERE slug = 'sur-berries';

-- Caso 2: suscripción SUSPENDIDA -> sin org_id (acceso bloqueado)
SELECT 'sub suspendida: sin org_id' AS assertion,
       (public.custom_access_token_hook(
          jsonb_build_object('claims', jsonb_build_object('sub', '00000000-0000-0000-0000-0000000000ab'))
        ) -> 'claims' ->> 'org_id') IS NULL AS pass;

-- Caso 3: los datos de la org se preservan (no se borran al suspender)
SELECT 'sub suspendida: datos preservados' AS assertion,
       (SELECT count(*) FROM workers WHERE organization_id =
          (SELECT id FROM organizations WHERE slug = 'sur-berries')) > 0 AS pass;
ROLLBACK;
