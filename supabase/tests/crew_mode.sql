-- ============================================================
-- TEST DE MODO CAPATAZ POR CAMPO (Fase 2, Req. 6.3, 6.6)
-- ============================================================
-- Verifica la resolución del crew_mode efectivo:
--   effective = field.crew_mode_enabled ?? organization.crew_mode_enabled
-- y la coexistencia de campos con/sin modo dentro de una misma org.
--
-- Uso (tras `supabase db reset`):
--   docker cp supabase/tests/crew_mode.sql <db>:/tmp/c.sql
--   docker exec <db> psql -U postgres -f /tmp/c.sql
-- ============================================================

\pset pager off

BEGIN;

-- Org de prueba con Modo Capataz activo por defecto
INSERT INTO organizations (id, name, slug, subscription_status, status, crew_mode_enabled)
VALUES ('0c000001-0000-0000-0000-000000000001', 'Crew Test Org', 'crew-test', 'active', 'active', true);

-- Campo A: hereda el default de la org (crew_mode_enabled = NULL -> true)
INSERT INTO fields (id, organization_id, name, total_area, status, crew_mode_enabled)
VALUES ('0f000001-0000-0000-0000-000000000001',
        '0c000001-0000-0000-0000-000000000001', 'Campo Grande', 10, 'active', NULL);

-- Campo B: override explícito a false (campo pequeño sin cuadrillas)
INSERT INTO fields (id, organization_id, name, total_area, status, crew_mode_enabled)
VALUES ('0f000002-0000-0000-0000-000000000001',
        '0c000001-0000-0000-0000-000000000001', 'Campo Chico', 2, 'active', false);

-- Resolución efectiva por campo
SELECT
  'campo hereda default (debe ser true)' AS assertion,
  COALESCE(f.crew_mode_enabled, o.crew_mode_enabled) = true AS pass
FROM fields f JOIN organizations o ON o.id = f.organization_id
WHERE f.id = '0f000001-0000-0000-0000-000000000001';

SELECT
  'campo con override false (debe ser false)' AS assertion,
  COALESCE(f.crew_mode_enabled, o.crew_mode_enabled) = false AS pass
FROM fields f JOIN organizations o ON o.id = f.organization_id
WHERE f.id = '0f000002-0000-0000-0000-000000000001';

-- Coexistencia: la misma org tiene un campo con modo y otro sin modo
SELECT
  'coexistencia de campos con y sin crew_mode en una org' AS assertion,
  COUNT(*) FILTER (WHERE COALESCE(f.crew_mode_enabled, o.crew_mode_enabled)) = 1
  AND COUNT(*) FILTER (WHERE NOT COALESCE(f.crew_mode_enabled, o.crew_mode_enabled)) = 1 AS pass
FROM fields f JOIN organizations o ON o.id = f.organization_id
WHERE f.organization_id = '0c000001-0000-0000-0000-000000000001';

-- La organización semilla 'default' tiene crew_mode desactivado por defecto (Fase 1)
SELECT
  'org default: crew_mode desactivado por defecto' AS assertion,
  crew_mode_enabled = false AS pass
FROM organizations WHERE slug = 'default';

ROLLBACK;
