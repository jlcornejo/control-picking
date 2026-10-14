-- ============================================================
-- FEATURE FLAG: report_export
-- ============================================================
-- Gating de "Informes exportables": PDF de liquidaciones y CSV de producción y
-- rankings desde el dashboard web. Default global apagado (enabled=false); cada
-- organización lo activa vía override en organization_feature_flags.
-- strategy='org_override' (se puede sobreescribir por tenant). Idempotente por la
-- UNIQUE uq_platform_feature_flags_key.
--
-- Reversibilidad (documentada; sin `down` automático):
--   DELETE FROM platform_feature_flags WHERE key = 'report_export';
-- ============================================================

INSERT INTO platform_feature_flags (key, name, description, category, strategy, enabled) VALUES
  ('report_export', 'Informes exportables',
   'Habilita la exportacion de informes desde el dashboard web: PDF de liquidaciones y CSV de produccion y rankings.',
   'analitica', 'org_override', false)
ON CONFLICT (key) DO NOTHING;
